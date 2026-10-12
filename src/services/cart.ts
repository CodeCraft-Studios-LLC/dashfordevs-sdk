/**
 * Cart Module
 *
 * Shopping cart with server-side persistence; local state mirrors the server.
 */

import type { DashClient } from "../client.js";
import type {
  CartAddOptions,
  CartAddResponse,
  CartClearResponse,
  CartGetResponse,
  CartItem,
  CartRemoveResponse,
  CartState,
  CartTotals,
  CartUpdateResponse,
} from "../types.js";

const EMPTY_CART = (): CartGetResponse => ({ cart_id: null, items: [], subtotal: "0.00", item_count: 0 });

export class CartModule {
  client: DashClient;
  _cartId: string | null;
  _items: CartItem[];
  _subtotal: string;
  _itemCount: number;

  constructor(client: DashClient) {
    this.client = client;
    this._cartId = null;
    this._items = [];
    this._subtotal = "0.00";
    this._itemCount = 0;
  }

  /** Current cart ID */
  get cartId(): string | null {
    return this._cartId;
  }

  /** Current cart items (local state) */
  get items(): CartItem[] {
    return this._items;
  }

  /** Load an existing cart by ID (e.g. restored from localStorage). */
  async load(cartId: string): Promise<CartGetResponse> {
    this._cartId = cartId;
    return this.get();
  }

  /**
   * Add an item. `subscriptionPlanId` makes the line a recurring order
   * (a cell of the product's subscription grid).
   */
  async add(options: CartAddOptions): Promise<CartAddResponse> {
    const { productId, sizeId, quantity = 1, freestyleSelections, subscriptionPlanId } = options || ({} as CartAddOptions);

    if (!productId || !sizeId) {
      throw new Error("productId and sizeId are required");
    }

    const body: Record<string, any> = {
      product_id: productId,
      size_id: sizeId,
      quantity,
      cart_id: this._cartId,
    };
    if (freestyleSelections) body.freestyle_selections = freestyleSelections;
    if (subscriptionPlanId) body.subscription_plan_id = subscriptionPlanId;

    const url = `${this.client.baseURL}/api/storefront/cart/add`;
    const response: any = await this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(body),
    });

    this._cartId = response.cart_id;

    // Sync with server - fetch full cart state
    await this.get();

    return response;
  }

  /** Per-location quantity split for a multi-location wholesale order. */
  async setLocations(
    locations: Record<string, { label?: string; state?: string; items: Record<string, number> }>
  ): Promise<CartState> {
    const url = `${this.client.baseURL}/api/storefront/cart/locations`;

    const state: any = await this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify({ cart_id: this._cartId || undefined, locations }),
    });

    if (state && state.cart_id) this._cartId = state.cart_id;
    return state;
  }

  /** Move one line to a different size and/or cadence (subscriptionPlanId "" = one-off). */
  async changeItem(
    itemId: string,
    changes: { sizeId?: string; subscriptionPlanId?: string; quantity?: number } = {}
  ): Promise<CartUpdateResponse> {
    if (!this._cartId) {
      throw new Error("No cart loaded");
    }
    if (!itemId) {
      throw new Error("itemId is required");
    }

    const { sizeId, subscriptionPlanId, quantity } = changes;

    const url = `${this.client.baseURL}/api/storefront/cart/${this._cartId}/change`;
    const body: Record<string, any> = { item_id: itemId };
    if (sizeId) body.size_id = sizeId;
    // Not a truthiness check: "" means one-off.
    if (subscriptionPlanId !== undefined) body.subscription_plan_id = subscriptionPlanId;
    if (quantity !== undefined) body.quantity = quantity;

    const response: any = await this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(body),
    });

    await this.get();

    return response;
  }

  /** Update a line's quantity (0 removes). Pass `{ itemId }` to address an exact line. */
  async update(sizeId: string | null, quantity: number, options: { itemId?: string } = {}): Promise<CartUpdateResponse> {
    if (!this._cartId) {
      throw new Error("No cart loaded");
    }

    const { itemId } = options;
    if (!sizeId && !itemId) {
      throw new Error("sizeId or itemId is required");
    }

    const url = `${this.client.baseURL}/api/storefront/cart/${this._cartId}/update`;
    const body: Record<string, any> = { quantity };
    if (sizeId) body.size_id = sizeId;
    if (itemId) body.item_id = itemId;

    const response: any = await this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(body),
    });

    await this.get();

    return response;
  }

  /** Cart contents from the server (empty cart when none is loaded). */
  async get(): Promise<CartGetResponse> {
    if (!this._cartId) {
      return EMPTY_CART();
    }

    const url = `${this.client.baseURL}/api/storefront/cart/${this._cartId}`;
    const response: any = await this.client._fetch(url);

    this._items = response.items || [];
    this._subtotal = response.subtotal || "0.00";
    this._itemCount = response.item_count || 0;

    return response;
  }

  /** Remove a line. Pass `{ itemId }` to remove an exact line. */
  async remove(sizeId: string | null, options: { itemId?: string } = {}): Promise<CartRemoveResponse> {
    if (!this._cartId) {
      throw new Error("No cart loaded");
    }

    const { itemId } = options;
    if (!sizeId && !itemId) {
      throw new Error("sizeId or itemId is required");
    }

    let url = `${this.client.baseURL}/api/storefront/cart/${this._cartId}/remove/${encodeURIComponent((sizeId || itemId) as string)}`;
    if (itemId) url += `?item_id=${encodeURIComponent(itemId)}`;

    const response: any = await this.client._fetch(url, { method: "DELETE" });

    // Re-read rather than trusting the response shape (this endpoint nests the cart).
    await this.get();

    return response;
  }

  /** Clear all items. */
  async clear(): Promise<CartClearResponse> {
    if (!this._cartId) {
      this._items = [];
      this._subtotal = "0.00";
      this._itemCount = 0;
      return { message: "Cart already empty" } as CartClearResponse;
    }

    const url = `${this.client.baseURL}/api/storefront/cart/${this._cartId}/clear`;
    const response: any = await this.client._fetch(url, { method: "DELETE" });

    this._items = [];
    this._subtotal = "0.00";
    this._itemCount = 0;

    return response;
  }

  /**
   * Remember what a guest has typed into checkout (call on blur/debounced
   * change, not on submit). Sent in the POST body only, never in a URL.
   */
  async setContact(
    contact: { email?: string; phone?: string; first_name?: string; last_name?: string } = {}
  ): Promise<{ message: string; captured: boolean }> {
    if (!this._cartId) {
      return { message: "No cart yet", captured: false };
    }

    const url = `${this.client.baseURL}/api/storefront/cart/${this._cartId}/contact`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(contact),
    });
  }

  /** Apply a discount code (optional email for customer-specific codes). */
  async applyDiscount(code: string, email?: string): Promise<{ message: string; cart: CartGetResponse }> {
    if (!this._cartId) {
      throw new Error("No cart loaded");
    }

    const url = `${this.client.baseURL}/api/storefront/cart/${this._cartId}/apply-discount`;
    const response: any = await this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(email ? { code, email } : { code }),
    });

    if (response.cart) {
      this._items = response.cart.items || [];
      this._subtotal = response.cart.subtotal || "0.00";
      this._itemCount = response.cart.item_count || 0;
    }

    return response;
  }

  /** Remove the discount code. */
  async removeDiscount(): Promise<{ message: string; cart: CartGetResponse }> {
    if (!this._cartId) {
      throw new Error("No cart loaded");
    }

    const url = `${this.client.baseURL}/api/storefront/cart/${this._cartId}/remove-discount`;
    const response: any = await this.client._fetch(url, { method: "POST" });

    if (response.cart) {
      this._items = response.cart.items || [];
      this._subtotal = response.cart.subtotal || "0.00";
      this._itemCount = response.cart.item_count || 0;
    }

    return response;
  }

  /** Totals from local state. */
  getTotals(): CartTotals {
    return { itemCount: this._itemCount, subtotal: this._subtotal };
  }

  /** Total quantity across lines. */
  getTotalQuantity(): number {
    return this._items.reduce((sum, item) => sum + item.quantity, 0);
  }

  /** Merge the guest cart into the signed-in customer's cart. */
  async migrateToUser(): Promise<CartGetResponse> {
    if (!this._cartId) {
      return this.loadUserCart();
    }

    const token = this.client.auth?._accessToken;
    if (!token) {
      throw new Error("Authentication required for cart migration");
    }

    const url = `${this.client.baseURL}/api/storefront/cart/${this._cartId}/migrate`;
    try {
      const response: any = await this.client._fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.cart_id) {
        this._cartId = response.cart_id;
      }

      return await this.get();
    } catch (error) {
      console.error("Cart migration failed:", error);
      try {
        return await this.loadUserCart();
      } catch {
        this._cartId = null;
        return EMPTY_CART();
      }
    }
  }

  /** The signed-in customer's cart (by customer, across devices). */
  async loadUserCart(): Promise<CartGetResponse> {
    const token = this.client.auth?._accessToken;
    if (!token) {
      throw new Error("Authentication required to load user cart");
    }

    const url = `${this.client.baseURL}/api/storefront/cart/user`;
    try {
      const response: any = await this.client._fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      this._cartId = response.cart_id || null;
      this._items = response.items || [];
      this._subtotal = response.subtotal || "0.00";
      this._itemCount = response.item_count || 0;

      return response;
    } catch (error) {
      console.error("Failed to load user cart:", error);
      this.reset();
      return EMPTY_CART();
    }
  }

  /**
   * App-mount initialisation: signed in -> the customer's cart (merging a
   * guest `fallbackCartId`); guest -> the fallback cart; else empty.
   */
  async init(fallbackCartId: string | null = null): Promise<CartGetResponse> {
    const hasToken = !!this.client.auth?._accessToken;

    if (hasToken) {
      if (fallbackCartId) {
        this._cartId = fallbackCartId;
        try {
          return await this.migrateToUser();
        } catch {
          return await this.loadUserCart();
        }
      }
      return await this.loadUserCart();
    }

    if (fallbackCartId) {
      try {
        await this.load(fallbackCartId);
        return await this.get();
      } catch {
        this.reset();
      }
    }

    this.reset();
    return EMPTY_CART();
  }

  /** Reset local state (logout). */
  reset(): void {
    this._cartId = null;
    this._items = [];
    this._subtotal = "0.00";
    this._itemCount = 0;
  }

  // ===========================================================================
  // Upsells
  // ===========================================================================

  async getUpsells(): Promise<{
    upsells: Array<{
      upsell_id: string;
      product_id: string;
      product_name: string;
      product_slug: string;
      product_image: string | null;
      variation_id: string | null;
      variation_name: string | null;
      size_id: string;
      size_label: string;
      original_price: string;
      upsell_price: string;
      discount_type: "percentage" | "fixed";
      discount_value: string;
      category_name: string | null;
      accumulate: boolean;
    }>;
    timer_minutes: number;
    enabled: boolean;
  }> {
    if (!this._cartId) throw new Error("No active cart");
    const url = `${this.client.baseURL}/api/storefront/cart/${this._cartId}/upsells`;
    return this.client._fetch(url);
  }

  async startUpsellSession(upsellIds: string[]): Promise<{
    session_id: string;
    expires_at: string;
    remaining_seconds: number;
    timer_minutes: number;
  }> {
    if (!this._cartId) throw new Error("No active cart");
    const url = `${this.client.baseURL}/api/storefront/cart/${this._cartId}/upsells/start`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify({ upsell_ids: upsellIds }),
    });
  }

  async getUpsellStatus(): Promise<{ active: boolean; session_id?: string; expires_at?: string; remaining_seconds: number }> {
    if (!this._cartId) throw new Error("No active cart");
    const url = `${this.client.baseURL}/api/storefront/cart/${this._cartId}/upsells/status`;
    return this.client._fetch(url);
  }

  async addUpsellToCart(
    upsellId: string,
    sessionId: string,
    sizeId: string | null = null
  ): Promise<{ cart_id: string; item: CartItem; message: string; replaced_upsell_ids: string[] }> {
    if (!this._cartId) throw new Error("No active cart");
    const url = `${this.client.baseURL}/api/storefront/cart/${this._cartId}/upsells/add`;
    const body: Record<string, any> = { upsell_id: upsellId, session_id: sessionId };
    if (sizeId) body.size_id = sizeId;
    const result: any = await this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(body),
    });
    await this.load(this._cartId);
    return result;
  }

  // ===========================================================================
  // Cart tier discounts
  // ===========================================================================

  async getTierDiscounts(): Promise<{
    tiers: Array<{ id: string; name: string; min_subtotal: string; discount_percentage: string; display_order: number }>;
  }> {
    const url = `${this.client.baseURL}/api/storefront/cart-tier-discounts`;
    return this.client._fetch(url);
  }
}

export default CartModule;

/**
 * Cart Module
 *
 * Provides shopping cart functionality with server-side persistence.
 * Cart state is synced between local memory and the backend.
 */

export class CartModule {
  constructor(client) {
    this.client = client;
    this._cartId = null;
    this._items = [];
    this._subtotal = "0.00";
    this._itemCount = 0;
  }

  /**
   * Get current cart ID
   * @returns {string|null}
   */
  get cartId() {
    return this._cartId;
  }

  /**
   * Get current cart items (local state)
   * @returns {Array}
   */
  get items() {
    return this._items;
  }

  /**
   * Load an existing cart by ID
   * Use this to restore a cart from localStorage on page load
   * @param {string} cartId - Cart ID to load
   * @returns {Promise<{cart_id: string, items: Array, subtotal: string, item_count: number}>}
   */
  async load(cartId) {
    this._cartId = cartId;
    return this.get();
  }

  /**
   * Add item to cart.
   *
   * Pass `subscriptionPlanId` and the line starts a recurring order instead
   * of shipping once. The plan id is a cell of the product's subscription
   * grid, read from `size.subscription_plans` on the product payload, and it
   * already implies the size and the cadence.
   *
   * A subscription line never merges with a one-off line for the same size,
   * and two cadences of the same size stay separate: buying one today and
   * having one arrive fortnightly are two different things to have asked
   * for. The same cadence does merge, as one subscription with more in it.
   *
   * @param {Object} options - Item options
   * @param {string} options.productId - Product ID
   * @param {string} options.sizeId - Size ID
   * @param {number} [options.quantity=1] - Quantity
   * @param {string} [options.subscriptionPlanId] - Grid cell to subscribe to
   * @returns {Promise<{cart_id: string, item: Object}>}
   */
  async add(options) {
    const {
      productId,
      sizeId,
      quantity = 1,
      freestyleSelections,
      subscriptionPlanId,
    } = options;

    if (!productId || !sizeId) {
      throw new Error("productId and sizeId are required");
    }

    const body = {
      product_id: productId,
      size_id: sizeId,
      quantity,
      cart_id: this._cartId,
    };
    if (freestyleSelections) {
      body.freestyle_selections = freestyleSelections;
    }
    if (subscriptionPlanId) {
      body.subscription_plan_id = subscriptionPlanId;
    }

    const url = `${this.client.baseURL}/api/storefront/cart/add`;
    const response = await this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(body),
    });

    // Update local state
    this._cartId = response.cart_id;

    // Sync with server - fetch full cart state
    await this.get();

    return response;
  }

  /**
   * Set the per-location quantity split for a multi-location wholesale order.
   *
   * The server derives each cart line's quantity from the sum across locations
   * and stores the split on the cart, so the two can never disagree. Passing a
   * location with no items removes it; passing a size that is no longer in any
   * location removes that line.
   *
   * @param {Object} locations - {locationId: {label, state, items: {sizeId: qty}}}
   * @returns {Promise<Object>} the full cart state, incl. custom_fields.locations
   *
   * @example
   * await dash.cart.setLocations({
   *   "loc-0": { label: "Houston", state: "TX", items: { [sizeId]: 12 } },
   *   "loc-1": { label: "Dallas",  state: "TX", items: { [sizeId]: 6 } },
   * });
   */
  async setLocations(locations) {
    const url = `${this.client.baseURL}/api/storefront/cart/locations`;

    const state = await this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify({ cart_id: this._cartId || undefined, locations }),
    });

    // The server creates the cart on first write; remember its id like add() does.
    if (state && state.cart_id) this._cartId = state.cart_id;
    return state;
  }

  /**
   * Move one cart line to a different size, cadence, or both.
   *
   * Distinct from `update`, which is quantity-by-size. This is "make this
   * line a different thing", and it exists for a cart drawer that edits a
   * subscription in place: strength, pack and frequency as dropdowns on the
   * line somebody is already looking at.
   *
   * It is an edit, not a remove and re-add, so the line keeps its id, its
   * position and its quantity, and it is one request rather than two where
   * a half-failure leaves the customer with nothing.
   *
   * `sizeId` and `subscriptionPlanId` are independent. Pass either, or
   * both. Moving the size alone carries the cadence to the equivalent cell
   * on the new size. Pass `subscriptionPlanId: ""` to turn the line into a
   * one-off.
   *
   * The options for the dropdowns come from the line itself: a subscription
   * line carries `change_options.sizes`, each with `strength`, `pack` and
   * its live `plans`.
   *
   * @param {string} itemId - The exact cart line
   * @param {Object} [changes]
   * @param {string} [changes.sizeId] - Another size of the SAME product
   * @param {string} [changes.subscriptionPlanId] - A cell on the landing size, or "" for one-off
   * @param {number} [changes.quantity]
   * @returns {Promise<Object>}
   */
  async changeItem(itemId, changes = {}) {
    if (!this._cartId) {
      throw new Error("No cart loaded");
    }
    if (!itemId) {
      throw new Error("itemId is required");
    }

    const { sizeId, subscriptionPlanId, quantity } = changes;

    const url = `${this.client.baseURL}/api/storefront/cart/${this._cartId}/change`;
    const body = { item_id: itemId };
    if (sizeId) body.size_id = sizeId;
    // Not a truthiness check: "" is meaningful here and means one-off,
    // which is a different instruction from leaving the cadence alone.
    if (subscriptionPlanId !== undefined) {
      body.subscription_plan_id = subscriptionPlanId;
    }
    if (quantity !== undefined) body.quantity = quantity;

    const response = await this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(body),
    });

    // Sync local state, the same way update() does.
    await this.get();

    return response;
  }

  /**
   * Update item quantity in cart.
   *
   * A size id no longer identifies a line on its own: the same size can sit
   * in the cart once outright and again at two subscription cadences. Pass
   * `{ itemId }` from the cart line to address one exactly. Without it, only
   * the one-off line for that size is reached.
   *
   * @param {string|null} sizeId - Size ID of item to update
   * @param {number} quantity - New quantity (0 to remove)
   * @param {Object} [options]
   * @param {string} [options.itemId] - The exact cart line
   * @returns {Promise<Object>}
   */
  async update(sizeId, quantity, options = {}) {
    if (!this._cartId) {
      throw new Error("No cart loaded");
    }

    const { itemId } = options;
    if (!sizeId && !itemId) {
      throw new Error("sizeId or itemId is required");
    }

    const url = `${this.client.baseURL}/api/storefront/cart/${this._cartId}/update`;
    const body = { quantity };
    if (sizeId) body.size_id = sizeId;
    if (itemId) body.item_id = itemId;

    const response = await this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(body),
    });

    // Sync local state
    await this.get();

    return response;
  }

  /**
   * Get cart contents from server
   * @returns {Promise<{cart_id: string, items: Array, subtotal: string, item_count: number}>}
   */
  async get() {
    if (!this._cartId) {
      return { cart_id: null, items: [], subtotal: "0.00", item_count: 0 };
    }

    const url = `${this.client.baseURL}/api/storefront/cart/${this._cartId}`;
    const response = await this.client._fetch(url);

    // Update local state from server
    this._items = response.items || [];
    this._subtotal = response.subtotal || "0.00";
    this._itemCount = response.item_count || 0;

    return response;
  }

  /**
   * Remove item from cart.
   *
   * Pass `{ itemId }` to remove one exact line. See `update` for why a size
   * id is not enough once a cart can hold subscriptions.
   *
   * @param {string|null} sizeId - Size ID of item to remove
   * @param {Object} [options]
   * @param {string} [options.itemId] - The exact cart line
   * @returns {Promise<Object>}
   */
  async remove(sizeId, options = {}) {
    if (!this._cartId) {
      throw new Error("No cart loaded");
    }

    const { itemId } = options;
    if (!sizeId && !itemId) {
      throw new Error("sizeId or itemId is required");
    }

    let url = `${this.client.baseURL}/api/storefront/cart/${this._cartId}/remove/${encodeURIComponent(sizeId || itemId)}`;
    if (itemId) url += `?item_id=${encodeURIComponent(itemId)}`;

    const response = await this.client._fetch(url, {
      method: "DELETE",
    });

    /*
      Re-read rather than trusting the response.

      This endpoint nests the cart one level down as `response.cart`, unlike
      add and update, so reading it here meant every caller had to know which
      shape each method returned. Worse, a caller that guessed wrong got an
      empty items array and blanked its own basket. One get() and the local
      state is right whatever the endpoint happens to return.
    */
    await this.get();

    return response;
  }

  /**
   * Clear all items from cart
   * @returns {Promise<Object>}
   */
  async clear() {
    if (!this._cartId) {
      this._items = [];
      this._subtotal = "0.00";
      this._itemCount = 0;
      return { message: "Cart already empty" };
    }

    const url = `${this.client.baseURL}/api/storefront/cart/${this._cartId}/clear`;
    const response = await this.client._fetch(url, {
      method: "DELETE",
    });

    // Clear local state
    this._items = [];
    this._subtotal = "0.00";
    this._itemCount = 0;

    return response;
  }

  /**
   * Remember what a guest has typed into the checkout form.
   *
   * Call this as the form is filled — on blur, or debounced on change — NOT on
   * submit. The point is the person who fills half the form and leaves: until
   * they submit there is no order and no customer, so everything they typed is
   * gone, and that is the lead worth following up.
   *
   * Nothing is validated. Send whatever is in the field, half typed or not.
   * Fields are independent: sending only { phone } leaves a stored email alone,
   * and sending "" clears that one field.
   *
   * A no-op on a cart belonging to a signed-in customer — that cart already has
   * a real record behind it.
   *
   * @param {Object} contact
   * @param {string} [contact.email]
   * @param {string} [contact.phone]
   * @param {string} [contact.first_name]
   * @param {string} [contact.last_name]
   * @returns {Promise<{message: string, captured: boolean}>}
   */
  async setContact(contact = {}) {
    if (!this._cartId) {
      // Nothing has been added yet, so there is no cart to attach this to.
      // Not an error: the checkout form can legitimately be open first.
      return { message: "No cart yet", captured: false };
    }

    const url = `${this.client.baseURL}/api/storefront/cart/${this._cartId}/contact`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(contact),
    });
  }

  /**
   * Apply a discount code to the cart
   * @param {string} code - Discount code
   * @returns {Promise<{message: string, cart: Object}>}
   */
  async applyDiscount(code, email) {
    if (!this._cartId) {
      throw new Error("No cart loaded");
    }

    const url = `${this.client.baseURL}/api/storefront/cart/${this._cartId}/apply-discount`;
    const response = await this.client._fetch(url, {
      method: "POST",
      // email lets a guest use a customer-specific code assigned to that email.
      body: JSON.stringify(email ? { code, email } : { code }),
    });

    // Update local state from cart response
    if (response.cart) {
      this._items = response.cart.items || [];
      this._subtotal = response.cart.subtotal || "0.00";
      this._itemCount = response.cart.item_count || 0;
    }

    return response;
  }

  /**
   * Remove discount code from cart
   * @returns {Promise<{message: string, cart: Object}>}
   */
  async removeDiscount() {
    if (!this._cartId) {
      throw new Error("No cart loaded");
    }

    const url = `${this.client.baseURL}/api/storefront/cart/${this._cartId}/remove-discount`;
    const response = await this.client._fetch(url, {
      method: "POST",
    });

    if (response.cart) {
      this._items = response.cart.items || [];
      this._subtotal = response.cart.subtotal || "0.00";
      this._itemCount = response.cart.item_count || 0;
    }

    return response;
  }

  /**
   * Get cart totals (from local state)
   * @returns {{itemCount: number, subtotal: string}}
   */
  getTotals() {
    return {
      itemCount: this._itemCount,
      subtotal: this._subtotal,
    };
  }

  /**
   * Get total quantity across all items
   * @returns {number}
   */
  getTotalQuantity() {
    return this._items.reduce((sum, item) => sum + item.quantity, 0);
  }

  /**
   * Migrate guest cart to authenticated user's cart
   * Call this after user logs in to merge their guest cart with their account
   * @returns {Promise<{cart_id: string, items: Array, subtotal: string, item_count: number}>}
   */
  async migrateToUser() {
    if (!this._cartId) {
      return this.loadUserCart();
    }

    const token = this.client.auth?._accessToken;
    if (!token) {
      throw new Error("Authentication required for cart migration");
    }

    const url = `${this.client.baseURL}/api/storefront/cart/${this._cartId}/migrate`;
    try {
      const response = await this.client._fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.cart_id) {
        this._cartId = response.cart_id;
      }

      // Always return the fresh, fully-hydrated cart state (tier discount,
      // next tier, etc.) rather than the bare migrate response.
      return await this.get();
    } catch (error) {
      console.error("Cart migration failed:", error);
      // Fall back to a fresh loadUserCart in case the guest cart couldn't
      // be migrated but the user has a server-side cart waiting.
      try {
        return await this.loadUserCart();
      } catch (e) {
        this._cartId = null;
        return { cart_id: null, items: [], subtotal: "0.00", item_count: 0 };
      }
    }
  }

  /**
   * Load the authenticated user's cart from the backend.
   * Uses the /storefront/cart/user endpoint which resolves the cart by
   * customer FK rather than by localStorage cart_id, so it works across
   * devices/browsers and always reflects the latest server state.
   *
   * @returns {Promise<Object>} Full cart state.
   */
  async loadUserCart() {
    const token = this.client.auth?._accessToken;
    if (!token) {
      throw new Error("Authentication required to load user cart");
    }

    const url = `${this.client.baseURL}/api/storefront/cart/user`;
    try {
      const response = await this.client._fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Always sync local state to the server response — including empty carts
      // (previously this was gated on response.cart_id which left stale data
      // when the user had no cart yet).
      this._cartId = response.cart_id || null;
      this._items = response.items || [];
      this._subtotal = response.subtotal || "0.00";
      this._itemCount = response.item_count || 0;

      return response;
    } catch (error) {
      console.error("Failed to load user cart:", error);
      this.reset();
      return { cart_id: null, items: [], subtotal: "0.00", item_count: 0 };
    }
  }

  /**
   * Initialize the cart on app mount.
   *
   * Decides the right load strategy based on auth state:
   *   - Authenticated user → load cart by customer FK (model-based).
   *     If a guest `fallbackCartId` is also present, merge it into the
   *     user's cart before returning.
   *   - Guest (no auth)    → load cart by the provided `fallbackCartId`
   *     (typically persisted in localStorage).
   *   - Neither            → empty cart.
   *
   * Always returns the full current cart state from the server.
   *
   * @param {string|null} fallbackCartId - Guest cart ID from localStorage, if any.
   * @returns {Promise<Object>} Full cart state.
   */
  async init(fallbackCartId = null) {
    const hasToken = !!this.client.auth?._accessToken;

    if (hasToken) {
      // Authenticated: prefer model-based cart (FK on customer).
      if (fallbackCartId) {
        // Attempt to merge an existing guest cart into the user's cart.
        // migrateToUser falls back to loadUserCart if there's nothing to merge.
        this._cartId = fallbackCartId;
        try {
          return await this.migrateToUser();
        } catch (e) {
          // If migration fails, just load the user's cart directly.
          return await this.loadUserCart();
        }
      }
      return await this.loadUserCart();
    }

    // Guest: restore by cart_id from localStorage if we have one.
    if (fallbackCartId) {
      try {
        await this.load(fallbackCartId);
        return await this.get();
      } catch (e) {
        this.reset();
      }
    }

    this.reset();
    return { cart_id: null, items: [], subtotal: "0.00", item_count: 0 };
  }

  /**
   * Reset cart state (used on logout)
   */
  reset() {
    this._cartId = null;
    this._items = [];
    this._subtotal = "0.00";
    this._itemCount = 0;
  }

  // ===========================================================================
  // UPSELL SYSTEM
  // ===========================================================================

  /**
   * Get upsell recommendations for the current cart.
   * @returns {Promise<{upsells: Array, timer_minutes: number, enabled: boolean}>}
   */
  async getUpsells() {
    if (!this._cartId) throw new Error("No active cart");
    const url = `${this.client.baseURL}/api/storefront/cart/${this._cartId}/upsells`;
    return this.client._fetch(url);
  }

  /**
   * Start an upsell session (creates server-side timer).
   * @param {string[]} upsellIds - IDs of upsell products to offer
   * @returns {Promise<{session_id: string, expires_at: string, remaining_seconds: number, timer_minutes: number}>}
   */
  async startUpsellSession(upsellIds) {
    if (!this._cartId) throw new Error("No active cart");
    const url = `${this.client.baseURL}/api/storefront/cart/${this._cartId}/upsells/start`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify({ upsell_ids: upsellIds }),
    });
  }

  /**
   * Check the status of the active upsell session.
   * @returns {Promise<{active: boolean, session_id?: string, expires_at?: string, remaining_seconds: number}>}
   */
  async getUpsellStatus() {
    if (!this._cartId) throw new Error("No active cart");
    const url = `${this.client.baseURL}/api/storefront/cart/${this._cartId}/upsells/status`;
    return this.client._fetch(url);
  }

  /**
   * Add an upsell product to the cart at the discounted price.
   * @param {string} upsellId - UpsellProduct ID
   * @param {string} sessionId - CheckoutUpsellSession ID
   * @param {string} [sizeId] - Optional size override when the upsell was
   *   created in "All variations" mode. Pass the ProductSize ID of the
   *   variation the customer picked. Ignored for fixed-variation upsells.
   *
   * Offers whose `accumulate` is false are either/or: adding one removes any
   * other non-accumulating offer from the cart. The removed offers come back
   * as `replaced_upsell_ids`, and the reloaded cart already reflects the swap.
   * @returns {Promise<{cart_id: string, item: Object, message: string, replaced_upsell_ids: string[]}>}
   */
  async addUpsellToCart(upsellId, sessionId, sizeId = null) {
    if (!this._cartId) throw new Error("No active cart");
    const url = `${this.client.baseURL}/api/storefront/cart/${this._cartId}/upsells/add`;
    const body = { upsell_id: upsellId, session_id: sessionId };
    if (sizeId) body.size_id = sizeId;
    const result = await this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(body),
    });
    // Refresh cart state after adding upsell
    await this.load(this._cartId);
    return result;
  }

  // ===========================================================================
  // CART TIER DISCOUNTS
  // ===========================================================================

  /**
   * Fetch active cart tier discounts for the organization.
   * Used to show discount incentives before a customer qualifies.
   * @returns {Promise<{tiers: Array<{id: string, name: string, min_subtotal: string, discount_percentage: string, display_order: number}>}>}
   */
  async getTierDiscounts() {
    const url = `${this.client.baseURL}/api/storefront/cart-tier-discounts`;
    return this.client._fetch(url);
  }
}

export default CartModule;

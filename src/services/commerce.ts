/**
 * Shipping, tax, affiliates and marketing modules (ported from v1 as-is).
 */

import type { DashClient } from "../client.js";
import type {
  AddressValidationInput,
  AddressValidationResult,
  FreeShippingCheck,
  MarketingConfig,
  Pagination,
  ShippingGetRateOptions,
  ShippingRate,
  ShippingRateOptions,
  ShippingRateResult,
  TaxBreakdownLine,
  TaxCalculateOptions,
  TaxCalculateResponse,
  TaxLegalityCheck,
  TaxOrderTotal,
  TaxOrderTotalParams,
  TrackingResult,
} from "../types.js";

// =============================================================================
// Shipping
// =============================================================================

export class ShippingModule {
  client: DashClient;
  constructor(client: DashClient) {
    this.client = client;
  }

  /** All rates for a package (carrier credentials stay server-side). */
  async getRates(options: ShippingRateOptions): Promise<{ rates: ShippingRate[]; provider?: string }> {
    const {
      carrier_code,
      carrier_ids,
      service_type,
      from_postal,
      from_address,
      to_address_line1,
      to_city,
      to_name,
      to_state,
      to_country,
      to_postal,
      weight_oz,
      dimensions,
    } = options || ({} as ShippingRateOptions);

    if (!to_postal) {
      throw new Error("to_postal is required");
    }
    if (!weight_oz) {
      throw new Error("weight_oz is required");
    }

    const body: Record<string, any> = {
      to_postal,
      to_state,
      to_country: to_country || "US",
      weight_oz,
    };

    if (to_address_line1) body.to_address_line1 = to_address_line1;
    if (to_city) body.to_city = to_city;
    if (to_name) body.to_name = to_name;

    if (carrier_code) body.carrier_code = carrier_code;
    if (carrier_ids) body.carrier_ids = carrier_ids;
    if (service_type) body.service_type = service_type;

    if (from_postal) body.from_postal = from_postal;
    if (from_address) body.from_address = from_address;

    if (dimensions) body.dimensions = dimensions;

    const url = `${this.client.baseURL}/api/storefront/shipping/rates`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /** Carrier tracking URL for a tracking number. */
  async track(trackingNumber: string, carrierCode = ""): Promise<TrackingResult> {
    if (!trackingNumber) {
      throw new Error("trackingNumber is required");
    }

    let url = `${this.client.baseURL}/api/storefront/shipping/track/${encodeURIComponent(trackingNumber)}`;
    if (carrierCode) {
      url += `?carrier_code=${encodeURIComponent(carrierCode)}`;
    }
    return this.client._fetch(url, { method: "GET" });
  }

  /** Validate and normalize an address. */
  async validateAddress(address: AddressValidationInput): Promise<AddressValidationResult> {
    const { address_line1, address_line2, city, state, postal_code, country_code } =
      address || ({} as AddressValidationInput);

    if (!address_line1 || !city || !state || !postal_code) {
      throw new Error("address_line1, city, state, and postal_code are required");
    }

    const body: Record<string, any> = { address_line1, city, state, postal_code };
    if (address_line2) body.address_line2 = address_line2;
    if (country_code) body.country_code = country_code;

    const url = `${this.client.baseURL}/api/storefront/shipping/validate-address`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /** Cheapest rate (and all rates sorted by price). */
  async getCheapestRate(options: ShippingRateOptions): Promise<ShippingRateResult> {
    const { rates } = await this.getRates(options);

    if (!rates || rates.length === 0) {
      return { rate: null, all_rates: [] };
    }

    const sorted = this._sortByPrice(rates);
    return { rate: sorted[0], all_rates: sorted };
  }

  /** Fastest rate (ties broken by price). */
  async getFastestRate(options: ShippingRateOptions): Promise<ShippingRateResult> {
    const { rates } = await this.getRates(options);

    if (!rates || rates.length === 0) {
      return { rate: null, all_rates: [] };
    }

    const sorted = [...rates].sort((a, b) => {
      const daysA = a.transitDays ?? 999;
      const daysB = b.transitDays ?? 999;
      if (daysA !== daysB) return daysA - daysB;
      return this._getTotalCost(a) - this._getTotalCost(b);
    });

    sorted.forEach((rate) => {
      rate.totalCost = this._getTotalCost(rate);
    });

    return { rate: sorted[0], all_rates: sorted };
  }

  /** One recommended rate: cheapest by default, or prefer: "fastest". */
  async getRate(options: ShippingGetRateOptions): Promise<ShippingRate | null> {
    const { prefer = "cheapest", ...rateOptions } = options;

    if (prefer === "fastest") {
      const { rate } = await this.getFastestRate(rateOptions as ShippingRateOptions);
      return rate;
    }

    const { rate } = await this.getCheapestRate(rateOptions as ShippingRateOptions);
    return rate;
  }

  /** Compare a subtotal with the store's free-shipping threshold. */
  async checkFreeShipping(subtotal: number | string): Promise<FreeShippingCheck> {
    const data: any = await this.client.getGlobalData();
    const global = data?.global || {};
    const threshold = global.min_for_free_shipping ? parseFloat(global.min_for_free_shipping) : null;

    const amount = typeof subtotal === "string" ? parseFloat(subtotal) : subtotal;

    if (threshold === null) {
      return { qualifies: false, threshold: null, remaining: 0 };
    }

    const qualifies = amount >= threshold;
    const remaining = qualifies ? 0 : Math.max(0, threshold - amount);

    return { qualifies, threshold, remaining };
  }

  _getTotalCost(rate: ShippingRate): number {
    return (parseFloat(rate.shipmentCost as any) || 0) + (parseFloat(rate.otherCost as any) || 0);
  }

  _sortByPrice(rates: ShippingRate[]): ShippingRate[] {
    const sorted = [...rates].sort((a, b) => this._getTotalCost(a) - this._getTotalCost(b));
    sorted.forEach((rate) => {
      rate.totalCost = this._getTotalCost(rate);
    });
    return sorted;
  }
}

// =============================================================================
// Tax
// =============================================================================

export class TaxModule {
  client: DashClient;
  _cache: Record<string, TaxCalculateResponse>;

  constructor(client: DashClient) {
    this.client = client;
    this._cache = {};
  }

  /** Per-state tax for a cart_id or a manual item list. */
  async calculate(options: TaxCalculateOptions = {} as TaxCalculateOptions): Promise<TaxCalculateResponse> {
    const url = `${this.client.baseURL}/api/storefront/tax/calculate`;
    const result: any = await this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(options),
    });

    const cacheKey = this._getCacheKey(options);
    this._cache[cacheKey] = result;

    return result;
  }

  /** Tax for the current cart. */
  async calculateForCart(state: string): Promise<TaxCalculateResponse> {
    const cartId = this.client.cart?.cartId;
    if (!cartId) {
      throw new Error("No active cart. Add items to cart before calculating tax.");
    }
    return this.calculate({ state, cart_id: cartId });
  }

  /** Whether everything in the cart (or items) is legal in a state. */
  async checkLegality(state: string, options: Omit<TaxCalculateOptions, "state"> = {}): Promise<TaxLegalityCheck> {
    const calcOptions: TaxCalculateOptions = { state, ...options };

    if (!calcOptions.cart_id && !calcOptions.items) {
      const cartId = this.client.cart?.cartId;
      if (cartId) {
        calcOptions.cart_id = cartId;
      }
    }

    const result = await this.calculate(calcOptions);

    return {
      legal: result.is_legal,
      illegal_items: result.illegal_items || [],
      state_name: result.state_name,
      state_code: result.state_code,
    };
  }

  /** total_tax as a number. */
  getTotal(taxResult: TaxCalculateResponse): number {
    if (!taxResult || !taxResult.total_tax) return 0;
    return parseFloat(taxResult.total_tax) || 0;
  }

  /** subtotal - discount + shipping + tax (never below 0). */
  getOrderTotal({ subtotal, shipping = 0, discount = 0, taxResult }: TaxOrderTotalParams): TaxOrderTotal {
    const sub = typeof subtotal === "string" ? parseFloat(subtotal) : subtotal;
    const ship = typeof shipping === "string" ? parseFloat(shipping) : shipping;
    const disc = typeof discount === "string" ? parseFloat(discount) : discount;
    const tax = this.getTotal(taxResult);

    return {
      subtotal: sub,
      shipping: ship,
      discount: disc,
      tax,
      total: Math.max(0, sub - disc + ship + tax),
    };
  }

  /** Human-readable tax lines for checkout UI. */
  formatBreakdown(taxResult: TaxCalculateResponse): TaxBreakdownLine[] {
    if (!taxResult || !taxResult.tax_breakdown) return [];

    return taxResult.tax_breakdown
      .filter((item) => !item.illegal)
      .map((item) => {
        const lines: TaxBreakdownLine[] = [];
        const rate = item.rate !== null ? `${item.rate}%` : "N/A";
        const typeLabel = item.tax_class_name || item.cannabinoid_type;

        if (item.rate !== null && parseFloat(item.rate) > 0) {
          lines.push({ label: `State Tax (${typeLabel})`, amount: item.tax_amount, rate });
        }

        if (item.special_tax_rate && parseFloat(item.special_tax_rate) > 0) {
          lines.push({
            label: `${item.special_tax_name || "Special Tax"} (${typeLabel})`,
            amount: item.tax_amount,
            rate: `${item.special_tax_rate}%`,
          });
        }

        return lines;
      })
      .flat();
  }

  _getCacheKey(options: Partial<TaxCalculateOptions>): string {
    const state = options.state || "";
    if (options.cart_id) return `${state}:cart:${options.cart_id}`;
    if (options.items) return `${state}:items:${JSON.stringify(options.items)}`;
    return `${state}:empty`;
  }

  /** A cached result, if any. */
  getCached(state: string, cartId?: string): TaxCalculateResponse | null {
    const key = cartId ? `${state}:cart:${cartId}` : `${state}:empty`;
    return this._cache[key] || null;
  }

  /** Clear cached results (call when the cart changes). */
  clearCache(): void {
    this._cache = {};
  }
}

// =============================================================================
// Marketing (Klaviyo onsite JS)
// =============================================================================

export class MarketingModule {
  client: DashClient;
  _initialized: boolean;
  _config: any;

  constructor(client: DashClient) {
    this.client = client;
    this._initialized = false;
    this._config = null;
  }

  /** Inject the store's email-provider onsite script (runs once; no-op on the server). */
  async init(): Promise<MarketingConfig> {
    if (this._initialized) {
      return this._config;
    }
    this._initialized = true;

    if (typeof window === "undefined") {
      return { active: false, provider: null };
    }

    try {
      const url = `${this.client.baseURL}/api/storefront/email/config`;
      const data: any = await this.client._fetch(url);
      this._config = data;

      if (!data.active || !data.provider) {
        return data;
      }

      if (data.provider.slug === "klaviyo") {
        this._injectKlaviyo(data.config);
      }

      return data;
    } catch (err: any) {
      console.warn("Marketing init failed:", err.message);
      this._config = { active: false, provider: null };
      return this._config;
    }
  }

  getConfig(): MarketingConfig | null {
    return this._config;
  }

  _klaviyo(): any {
    if (typeof window === "undefined") return null;
    return (window as any).klaviyo || null;
  }

  /** Associate the browser with a Klaviyo profile ({ email } at minimum). */
  identify(profile: { email: string; first_name?: string; last_name?: string; phone?: string }): void {
    const kl = this._klaviyo();
    if (!kl || !profile || !profile.email) return;
    try {
      kl.push([
        "identify",
        {
          $email: profile.email,
          ...(profile.first_name ? { $first_name: profile.first_name } : {}),
          ...(profile.last_name ? { $last_name: profile.last_name } : {}),
          ...(profile.phone ? { $phone_number: profile.phone } : {}),
        },
      ]);
    } catch {
      /* ignore */
    }
  }

  /** Custom onsite Klaviyo event. */
  trackOnsite(event: string, properties: Record<string, any> = {}): void {
    const kl = this._klaviyo();
    if (!kl || !event) return;
    try {
      kl.push(["track", event, properties]);
    } catch {
      /* ignore */
    }
  }

  /**
   * Klaviyo "Viewed Product" + trackViewedItem. Note: with an identified
   * profile this tells Klaviyo which person viewed which product; for
   * sensitive (Rx/peptide) catalogs only call it when Klaviyo is covered by a
   * BAA for the store.
   */
  viewedProduct(product: {
    id: string;
    name: string;
    url: string;
    imageUrl?: string;
    price?: number | string;
    compareAtPrice?: number | string;
    brand?: string;
    categories?: string[];
    sku?: string;
  }): void {
    const kl = this._klaviyo();
    if (!kl || !product || !product.id || !product.name) return;

    const price = product.price !== undefined && product.price !== null ? Number(product.price) : undefined;
    const compareAtPrice =
      product.compareAtPrice !== undefined && product.compareAtPrice !== null ? Number(product.compareAtPrice) : undefined;
    const categories = Array.isArray(product.categories)
      ? product.categories
      : product.categories
        ? [product.categories]
        : [];

    try {
      kl.push([
        "track",
        "Viewed Product",
        {
          ProductName: product.name,
          ProductID: String(product.id),
          ...(product.sku ? { SKU: product.sku } : {}),
          Categories: categories,
          ...(product.imageUrl ? { ImageURL: product.imageUrl } : {}),
          URL: product.url,
          ...(product.brand ? { Brand: product.brand } : {}),
          ...(price !== undefined ? { Price: price } : {}),
          ...(compareAtPrice !== undefined ? { CompareAtPrice: compareAtPrice } : {}),
        },
      ]);

      kl.push([
        "trackViewedItem",
        {
          Title: product.name,
          ItemId: String(product.id),
          Categories: categories,
          ...(product.imageUrl ? { ImageUrl: product.imageUrl } : {}),
          Url: product.url,
          Metadata: {
            ...(product.brand ? { Brand: product.brand } : {}),
            ...(price !== undefined ? { Price: price } : {}),
            ...(compareAtPrice !== undefined ? { CompareAtPrice: compareAtPrice } : {}),
          },
        },
      ]);
    } catch {
      /* ignore */
    }
  }

  _injectKlaviyo(config: any): void {
    const companyId = config?.company_id;
    if (!companyId) {
      console.warn("Klaviyo company_id not configured");
      return;
    }

    if (document.getElementById("klaviyo-onsite-js")) {
      return;
    }

    const script = document.createElement("script");
    script.id = "klaviyo-onsite-js";
    script.async = true;
    script.type = "text/javascript";
    script.src = `https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=${encodeURIComponent(companyId)}`;
    document.head.appendChild(script);
  }
}

// =============================================================================
// Affiliates
// =============================================================================

export class AffiliatesModule {
  client: DashClient;
  constructor(client: DashClient) {
    this.client = client;
  }

  _bearer(): { Authorization: string } {
    const token = this.client.auth._accessToken;
    if (!token) throw new Error("Not authenticated");
    return { Authorization: `Bearer ${token}` };
  }

  async getFormConfig(): Promise<{ is_active: boolean; custom_fields: any[]; welcome_message: string }> {
    const url = `${this.client.baseURL}/api/storefront/affiliates/form-config`;
    return this.client._fetch(url);
  }

  async apply(data: {
    name: string;
    email: string;
    phone?: string;
    paypal_email?: string;
    custom_fields?: Record<string, any>;
    source_url?: string;
    turnstile_token?: string;
  }): Promise<{ success: boolean; message: string; request_id: string }> {
    const url = `${this.client.baseURL}/api/storefront/affiliates/apply`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getMyStatus(): Promise<{
    is_affiliate: boolean;
    has_pending_request: boolean;
    request_status: string | null;
    rejection_reason: string | null;
  }> {
    const headers = this._bearer();
    const url = `${this.client.baseURL}/api/storefront/affiliates/status`;
    return this.client._fetch(url, { headers });
  }

  async getMyDashboard(): Promise<{
    tier_name: string;
    commission_rate: number;
    total_orders: number;
    total_revenue: string;
    total_earned: string;
    paypal_email: string;
    discount_codes: any[];
  }> {
    const headers = this._bearer();
    const url = `${this.client.baseURL}/api/storefront/affiliates/dashboard`;
    return this.client._fetch(url, { headers });
  }

  async createCode(data: { code: string }): Promise<{ success: boolean; message: string; discount_code: Record<string, any> }> {
    const headers = this._bearer();
    const url = `${this.client.baseURL}/api/storefront/affiliates/create-code`;
    return this.client._fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    });
  }

  async updateProfile(data: { paypal_email?: string }): Promise<{ success: boolean; paypal_email: string }> {
    const headers = this._bearer();
    const url = `${this.client.baseURL}/api/storefront/affiliates/dashboard`;
    return this.client._fetch(url, {
      method: "PUT",
      headers,
      body: JSON.stringify(data),
    });
  }

  async deactivateCode(codeId: string): Promise<{ success: boolean; message: string }> {
    const headers = this._bearer();
    const url = `${this.client.baseURL}/api/storefront/affiliates/deactivate-code`;
    return this.client._fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ code_id: codeId }),
    });
  }

  async listProductRequests(params: { page?: number } = {}): Promise<{ requests: any[]; pagination: Pagination }> {
    const headers = this._bearer();
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    const qs = query.toString();
    const url = `${this.client.baseURL}/api/storefront/affiliates/product-requests${qs ? `?${qs}` : ""}`;
    return this.client._fetch(url, { headers });
  }

  async createProductRequest(data: {
    full_name: string;
    email: string;
    shipping_address: string;
    platform: string;
    platform_other?: string;
    profile_link?: string;
    follower_count: string;
    kit_type: string;
    kit_other_description?: string;
    content_plan: string;
    expected_sales: string;
    content_links?: string;
    additional_notes?: string;
  }): Promise<{ success: boolean; message: string; request_id: string }> {
    const headers = this._bearer();
    const url = `${this.client.baseURL}/api/storefront/affiliates/product-requests`;
    return this.client._fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    });
  }

  async getProductRequest(requestId: string): Promise<{ request: Record<string, any> }> {
    const headers = this._bearer();
    const url = `${this.client.baseURL}/api/storefront/affiliates/product-requests/${requestId}`;
    return this.client._fetch(url, { headers });
  }

  async updateProductRequest(requestId: string, data: Record<string, any>): Promise<{ success: boolean; message: string }> {
    const headers = this._bearer();
    const url = `${this.client.baseURL}/api/storefront/affiliates/product-requests/${requestId}`;
    return this.client._fetch(url, {
      method: "PUT",
      headers,
      body: JSON.stringify(data),
    });
  }
}

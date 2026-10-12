/**
 * Checkout Module
 *
 * Two-step checkout flow (guest):
 * 1. start() — validates cart, sends OTP to customer email
 * 2. complete() — verifies OTP, creates order from cart
 *
 * Authenticated flow (logged in):
 * 1. start() — validates cart, returns summary (no OTP)
 * 2. complete() — creates order directly (no code needed)
 */

export class CheckoutModule {
  constructor(client) {
    this.client = client;
  }

  /**
   * Start checkout — validates cart and prepares for order.
   * If authenticated, skips OTP. If guest, sends OTP to email.
   *
   * @param {Object} data
   * @param {string} data.cartId - Cart ID
   * @param {string} [data.email] - Customer email (required for guest checkout)
   * @returns {Promise<Object>} Cart summary, customer preview, auth status
   */
  async start(data) {
    const { cartId, email, acceptsMarketing } = data;
    if (!cartId) {
      throw new Error("cartId is required");
    }

    const headers = {};
    if (this.client.auth && this.client.auth.token) {
      headers["Authorization"] = `Bearer ${this.client.auth.token}`;
    } else if (!email) {
      throw new Error("cartId and email are required for guest checkout");
    }

    const body = { cart_id: cartId };
    if (email) body.email = email;
    if (acceptsMarketing !== undefined) body.accepts_marketing = acceptsMarketing;

    const url = `${this.client.baseURL}/api/storefront/checkout/start`;
    return this.client._fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  }

  /**
   * Get allowed shipping locations (countries and states).
   * Returns only locations the organization ships to.
   * If no restrictions are configured, returns all available locations.
   *
   * @returns {Promise<{countries: Array<{id: string, name: string, code: string, states: Array}>}>}
   *
   * @example
   * const { countries } = await dash.checkout.getShippingLocations();
   * // countries = [{ id: "...", name: "United States", code: "US", states: [...] }]
   */
  async getShippingLocations() {
    const url = `${this.client.baseURL}/api/storefront/shipping-locations`;
    return this.client._fetch(url);
  }

  /**
   * Get the list of globally banned state names for the organization.
   * Useful for footer disclaimers (e.g. "Products not available for shipment to: ...").
   *
   * @returns {Promise<{banned_states: Array<{code: string, name: string}>}>}
   *
   * @example
   * const { banned_states } = await dash.checkout.getBannedStateNames();
   * // banned_states = [{ code: "TX", name: "Texas" }, ...]
   */
  async getBannedStateNames() {
    const url = `${this.client.baseURL}/api/storefront/banned-state-names`;
    return this.client._fetch(url);
  }

  /**
   * Resume an abandoned checkout from a recovery token.
   *
   * Given a token of the form "checkout__<hash>" (emitted to Klaviyo on
   * checkout start and used in abandoned-checkout recovery emails as
   * /checkout?token=...), this validates the token server-side, logs the
   * customer fully back in (returns normal access/refresh JWTs), and returns
   * the cart so checkout can continue where it was left off.
   *
   * NOTE: prefer `dash.auth.loginWithCheckoutToken(token)` which calls this
   * and applies the returned session to the auth module for you.
   *
   * @param {string} token - Recovery token, e.g. "checkout__abc123..."
   * @returns {Promise<{access_token: string, refresh_token: string, token_type: string, expires_in: number, customer: Object, cart_id: string, cart_summary: Object}>}
   */
  async resume(token) {
    if (!token) {
      throw new Error("token is required");
    }
    const url = `${this.client.baseURL}/api/storefront/checkout/resume?token=${encodeURIComponent(token)}`;
    return this.client._fetch(url, { method: "GET" });
  }

  /**
   * Complete checkout — creates order from cart.
   * If authenticated, no code needed. If guest, requires email + OTP code.
   *
   * @param {Object} data
   * @param {string} data.cartId - Cart ID
   * @param {string} [data.email] - Customer email (required for guest)
   * @param {string} [data.code] - 6-digit OTP code (required for guest)
   * @param {Object} data.shipping - Shipping address
   * @param {string} [data.customerNotes] - Optional order notes
   * @returns {Promise<Object>} Order data, customer, auth tokens (guest only)
   */
  async complete(data) {
    const { cartId, email, code, shipping, customerNotes, payment, payment_token, captcha_token, totals, analytics, affiliateLink } = data;
    if (!cartId || !shipping) {
      throw new Error("cartId and shipping are required");
    }

    const headers = {};
    if (this.client.auth && this.client.auth.token) {
      headers["Authorization"] = `Bearer ${this.client.auth.token}`;
    }
    // Don't throw if email/code missing — _fetch will add auth token if available,
    // and the backend will use whichever auth method is present.

    const body = {
      cart_id: cartId,
      shipping,
      customer_notes: customerNotes || "",
    };
    if (email) body.email = email;
    if (code) body.code = code;
    if (payment) body.payment = payment;
    if (payment_token) body.payment_token = payment_token;
    if (captcha_token) body.captcha_token = captcha_token;
    if (totals) body.totals = totals;

    // First-party attribution: snapshot the visitor's source onto the order so
    // conversion reporting is accurate. Caller may override via data.analytics;
    // otherwise we pull it from the Insights collector automatically.
    let attribution = analytics;
    if (attribution === undefined && this.client.insights) {
      try { attribution = this.client.insights.attributionForOrder(); } catch { /* ignore */ }
    }
    if (attribution) body.analytics = attribution;

    // Affiliate link credit: the storefront's ?aflnk= link grabber keeps the
    // affiliate's code in the `aflnk` cookie. Sent with every checkout so an
    // order from an affiliate's link credits them even when the shopper never
    // applied the code (the backend attaches it with no discount, and never to
    // the affiliate's own order). Pass affiliateLink to override, or null to
    // send none.
    let link = affiliateLink;
    if (link === undefined && typeof document !== "undefined") {
      const m = document.cookie.match(/(?:^|; )aflnk=([^;]*)/);
      link = m ? decodeURIComponent(m[1]) : undefined;
    }
    if (link) body.affiliate_link = link;

    const url = `${this.client.baseURL}/api/storefront/checkout/complete`;
    return this.client._fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  }

  /**
   * Place a wholesale order request — NO payment, NO OTP.
   *
   * Separate from the B2C checkout flow: creates a "confirmed / unpaid" order
   * for staff to review and invoice (e.g. via QuickBooks). The customer is
   * created-or-fetched by email server-side.
   *
   * SECRET-KEY ONLY: because it skips identity verification, the backend
   * rejects public keys. Call this from a server (with an sk_ key), never
   * from the browser.
   *
   * @param {Object} data
   * @param {string} data.cartId - Cart ID
   * @param {string} data.email - Customer email
   * @param {Object} data.shipping - Shipping address (first_name, last_name,
   *   phone, address, address_line2, city, state, zip_code, country)
   * @param {string} [data.customerNotes] - Optional order notes
   * @returns {Promise<{order: Object, customer: Object}>}
   */
  async placeWholesaleRequest(data) {
    const { cartId, email, shipping, customerNotes, totals } = data;
    if (!cartId || !email || !shipping) {
      throw new Error("cartId, email and shipping are required");
    }

    const url = `${this.client.baseURL}/api/storefront/wholesale/place-request`;
    const body = {
      cart_id: cartId,
      email,
      shipping,
      customer_notes: customerNotes || "",
    };
    if (totals) body.totals = totals;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
}

export default CheckoutModule;

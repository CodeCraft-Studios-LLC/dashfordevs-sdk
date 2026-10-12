/**
 * Affiliates Module
 *
 * Provides affiliate program application functionality for storefronts.
 */

export class AffiliatesModule {
  constructor(client) {
    this.client = client;
  }

  /**
   * Get the affiliate application form configuration
   * @returns {Promise<{is_active: boolean, custom_fields: Array, welcome_message: string}>}
   *
   * @example
   * const config = await dash.affiliates.getFormConfig();
   * if (config.is_active) {
   *   // Render form with config.custom_fields
   * }
   */
  async getFormConfig() {
    const url = `${this.client.baseURL}/api/storefront/affiliates/form-config`;
    return this.client._fetch(url);
  }

  /**
   * Submit an affiliate application
   * @param {Object} data - Application data
   * @param {string} data.name - Applicant name (required)
   * @param {string} data.email - Applicant email (required)
   * @param {string} [data.phone] - Phone number (optional)
   * @param {string} [data.paypal_email] - PayPal email for commission payouts (optional)
   * @param {Object} [data.custom_fields] - Custom field values (optional)
   * @param {string} [data.source_url] - URL where form was submitted from (optional)
   * @param {string} [data.turnstile_token] - Cloudflare Turnstile token (optional)
   * @returns {Promise<{success: boolean, message: string, request_id: string}>}
   *
   * @example
   * const result = await dash.affiliates.apply({
   *   name: "Jane Doe",
   *   email: "jane@example.com",
   *   paypal_email: "jane@paypal.com",
   *   custom_fields: { website: "https://janeblog.com", audience_size: "10000" }
   * });
   */
  async apply(data) {
    const url = `${this.client.baseURL}/api/storefront/affiliates/apply`;

    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * Get current customer's affiliate status
   * Requires authentication (Bearer token)
   * @returns {Promise<{is_affiliate: boolean, has_pending_request: boolean, request_status: string|null, rejection_reason: string|null}>}
   */
  async getMyStatus() {
    const token = this.client.auth._accessToken;
    if (!token) throw new Error("Not authenticated");
    const url = `${this.client.baseURL}/api/storefront/affiliates/status`;
    return this.client._fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  /**
   * Get affiliate dashboard data for the current customer
   * Requires authentication + approved affiliate status
   * @returns {Promise<{tier_name: string, commission_rate: number, total_orders: number, total_revenue: string, total_earned: string, paypal_email: string, discount_codes: Array}>}
   */
  async getMyDashboard() {
    const token = this.client.auth._accessToken;
    if (!token) throw new Error("Not authenticated");
    const url = `${this.client.baseURL}/api/storefront/affiliates/dashboard`;
    return this.client._fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  /**
   * Create a discount code as an affiliate
   * Requires authentication + approved affiliate status
   * @param {Object} data
   * @param {string} data.code - The code to create (3-50 chars, alphanumeric + hyphens/underscores)
   * @returns {Promise<{success: boolean, message: string, discount_code: Object}>}
   */
  async createCode(data) {
    const token = this.client.auth._accessToken;
    if (!token) throw new Error("Not authenticated");
    const url = `${this.client.baseURL}/api/storefront/affiliates/create-code`;
    return this.client._fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  }

  /**
   * Update affiliate profile (e.g., PayPal email)
   * Requires authentication + approved affiliate status
   * @param {Object} data
   * @param {string} [data.paypal_email] - PayPal email for commission payouts
   * @returns {Promise<{success: boolean, paypal_email: string}>}
   */
  async updateProfile(data) {
    const token = this.client.auth._accessToken;
    if (!token) throw new Error("Not authenticated");
    const url = `${this.client.baseURL}/api/storefront/affiliates/dashboard`;
    return this.client._fetch(url, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  }

  /**
   * Deactivate one of the affiliate's own discount codes (one-way)
   * Requires authentication + approved affiliate status
   * @param {string} codeId - The discount code ID to deactivate
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async deactivateCode(codeId) {
    const token = this.client.auth._accessToken;
    if (!token) throw new Error("Not authenticated");
    const url = `${this.client.baseURL}/api/storefront/affiliates/deactivate-code`;
    return this.client._fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code_id: codeId }),
    });
  }

  // ── Product Requests (creator seeding kits) ────────────────────────────

  /**
   * List the current affiliate's product requests
   * @param {Object} [params] - Optional query params
   * @param {number} [params.page] - Page number
   * @returns {Promise<{requests: Array, pagination: Object}>}
   */
  async listProductRequests(params = {}) {
    const token = this.client.auth._accessToken;
    if (!token) throw new Error("Not authenticated");
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    const qs = query.toString();
    const url = `${this.client.baseURL}/api/storefront/affiliates/product-requests${qs ? `?${qs}` : ""}`;
    return this.client._fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  /**
   * Submit a new product request
   * @param {Object} data - Request data
   * @param {string} data.full_name
   * @param {string} data.email
   * @param {string} data.shipping_address
   * @param {string} data.platform
   * @param {string} [data.platform_other]
   * @param {string} [data.profile_link]
   * @param {string} data.follower_count
   * @param {string} data.kit_type
   * @param {string} [data.kit_other_description]
   * @param {string} data.content_plan
   * @param {string} data.expected_sales
   * @param {string} [data.content_links]
   * @param {string} [data.additional_notes]
   * @returns {Promise<{success: boolean, message: string, request_id: string}>}
   */
  async createProductRequest(data) {
    const token = this.client.auth._accessToken;
    if (!token) throw new Error("Not authenticated");
    const url = `${this.client.baseURL}/api/storefront/affiliates/product-requests`;
    return this.client._fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  }

  /**
   * Get a single product request by ID
   * @param {string} requestId
   * @returns {Promise<{request: Object}>}
   */
  async getProductRequest(requestId) {
    const token = this.client.auth._accessToken;
    if (!token) throw new Error("Not authenticated");
    const url = `${this.client.baseURL}/api/storefront/affiliates/product-requests/${requestId}`;
    return this.client._fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  /**
   * Update a pending product request
   * @param {string} requestId
   * @param {Object} data - Fields to update
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async updateProductRequest(requestId, data) {
    const token = this.client.auth._accessToken;
    if (!token) throw new Error("Not authenticated");
    const url = `${this.client.baseURL}/api/storefront/affiliates/product-requests/${requestId}`;
    return this.client._fetch(url, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  }
}

export default AffiliatesModule;

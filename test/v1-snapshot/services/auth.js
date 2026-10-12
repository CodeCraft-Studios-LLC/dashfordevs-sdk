/**
 * Auth Module
 *
 * Provides customer authentication via OTP (one-time password).
 * Handles sessions and customer data.
 */

export class AuthModule {
  constructor(client) {
    this.client = client;
    this.__customer = null;
    this._accessToken = null;
    this._refreshToken = null;
  }

  /**
   * Backing for the current customer. Wrapped in a setter so that whenever the
   * customer becomes known (login, refresh, fetch), we tie the first-party
   * analytics visitor to that customer automatically — no per-storefront code.
   * This is what lets conversions attribute to a visitor/source even when the
   * order itself was placed server-side.
   */
  get _customer() {
    return this.__customer ?? null;
  }
  set _customer(value) {
    this.__customer = value;
    try {
      if (value && value.id) {
        this.client?.insights?.identify?.(String(value.id));
      } else if (!value) {
        this.client?.insights?.clearIdentity?.();
      }
    } catch { /* analytics must never break auth */ }
  }

  /**
   * Get current customer (local state)
   * @returns {Object|null}
   */
  get customer() {
    return this._customer;
  }

  /**
   * Get current access token
   * @returns {string|null}
   */
  get token() {
    return this._accessToken;
  }

  /**
   * Get current refresh token
   * @returns {string|null}
   */
  get refreshToken() {
    return this._refreshToken;
  }

  /**
   * Check if user is authenticated
   * @returns {boolean}
   */
  get isAuthenticated() {
    return !!this._accessToken && !!this._customer;
  }

  /**
   * Set auth token (for restoring session)
   * @param {string} token - Access token
   * @param {string} [refreshToken] - Refresh token
   */
  setToken(token, refreshToken) {
    this._accessToken = token;
    if (refreshToken) {
      this._refreshToken = refreshToken;
    }
  }

  /**
   * Refresh the access token using the stored refresh token
   * @returns {Promise<{access_token: string, token_type: string, expires_in: number}>}
   */
  async refreshAccessToken() {
    if (!this._refreshToken) {
      throw new Error("No refresh token available");
    }

    const url = `${this.client.baseURL}/api/storefront/auth/refresh`;
    const response = await this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify({ refresh_token: this._refreshToken }),
    });

    this._accessToken = response.access_token;
    // Refresh-token rotation (server may issue a fresh refresh token on
    // every refresh). Adopt it if present so the next refresh uses the
    // current row and the old one is burned server-side.
    if (response.refresh_token) {
      this._refreshToken = response.refresh_token;
    }
    return response;
  }

  /**
   * Request OTP code for authentication
   * @param {string} email - Customer email
   * @param {Object} [options] - Additional options
   * @param {boolean} [options.accepts_marketing] - Marketing consent
   * @returns {Promise<{message: string, email: string}>}
   */
  /**
   * Check whether a customer already exists for this org by email and/or phone.
   * @param {Object} params
   * @param {string} [params.email]
   * @param {string} [params.phone] - E.164 or any format
   * @returns {Promise<{email_exists: boolean, phone_exists: boolean}>}
   */
  async checkExists({ email, phone } = {}) {
    const url = `${this.client.baseURL}/api/storefront/auth/check-exists`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify({ email: email || "", phone: phone || "" }),
    });
  }

  async requestOTP(email, options = {}) {
    if (!email) {
      throw new Error("email is required");
    }

    const body = { email };
    if (options.accepts_marketing !== undefined) {
      body.accepts_marketing = options.accepts_marketing;
    }
    if (options.captcha_token) {
      body.captcha_token = options.captcha_token;
    }

    const url = `${this.client.baseURL}/api/storefront/auth/request-otp`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * Verify OTP code and authenticate
   * @param {Object} options - Verification options
   * @param {string} options.email - Customer email
   * @param {string} options.code - OTP code
   * @returns {Promise<{access_token: string, refresh_token: string, customer: Object}>}
   */
  async verifyOTP(options) {
    const { email, code } = options;

    if (!email || !code) {
      throw new Error("email and code are required");
    }

    const url = `${this.client.baseURL}/api/storefront/auth/verify-otp`;
    const response = await this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify({ email, code }),
    });

    // Update local state
    this._customer = response.customer;
    this._accessToken = response.access_token;
    this._refreshToken = response.refresh_token;

    return response;
  }

  /**
   * Login with email and password
   * @param {Object} options
   * @param {string} options.email - Customer email
   * @param {string} options.password - Customer password
   * @returns {Promise<{access_token: string, refresh_token: string, customer: Object}>}
   */
  async login(options) {
    const { email, password, captcha_token } = options;

    if (!email || !password) {
      throw new Error("email and password are required");
    }

    const body = { email, password };
    if (captcha_token) body.captcha_token = captcha_token;

    const url = `${this.client.baseURL}/api/storefront/auth/login`;
    const response = await this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(body),
    });

    this._customer = response.customer;
    this._accessToken = response.access_token;
    this._refreshToken = response.refresh_token;

    return response;
  }

  /**
   * Log a customer in from an abandoned-checkout recovery token.
   *
   * Resolves a "checkout__<hash>" token (from a Klaviyo recovery email link
   * /checkout?token=...) into a full session: the customer is logged in
   * exactly as if they had completed OTP/password login. The returned
   * `cart_id` should be persisted so the cart resumes too.
   *
   * @param {string} token - Recovery token, e.g. "checkout__abc123..."
   * @returns {Promise<{access_token: string, refresh_token: string, token_type: string, expires_in: number, customer: Object, cart_id: string, cart_summary: Object}>}
   */
  async loginWithCheckoutToken(token) {
    if (!token) {
      throw new Error("token is required");
    }

    const response = await this.client.checkout.resume(token);

    this._customer = response.customer;
    this._accessToken = response.access_token;
    this._refreshToken = response.refresh_token;

    return response;
  }

  /**
   * Set a password for the authenticated customer
   * @param {string} password - New password (min 8 characters)
   * @returns {Promise<{message: string, customer: Object}>}
   */
  async setPassword(password) {
    if (!this._accessToken) {
      throw new Error("Not authenticated");
    }

    if (!password || password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }

    const url = `${this.client.baseURL}/api/storefront/auth/set-password`;
    const response = await this.client._fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this._accessToken}`,
      },
      body: JSON.stringify({ password }),
    });

    if (response.customer) {
      this._customer = response.customer;
    }

    return response;
  }

  /**
   * Request a password reset code
   * @param {string} email - Customer email
   * @returns {Promise<{message: string}>}
   */
  async requestPasswordReset(email) {
    if (!email) {
      throw new Error("email is required");
    }

    const url = `${this.client.baseURL}/api/storefront/auth/forgot-password`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  /**
   * Reset password using OTP code
   * @param {Object} options
   * @param {string} options.email - Customer email
   * @param {string} options.code - OTP code
   * @param {string} options.password - New password (min 8 characters)
   * @returns {Promise<{message: string}>}
   */
  async resetPassword(options) {
    const { email, code, password } = options;

    if (!email || !code || !password) {
      throw new Error("email, code, and password are required");
    }

    const url = `${this.client.baseURL}/api/storefront/auth/reset-password`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify({ email, code, password }),
    });
  }

  /**
   * Get current customer profile
   * Requires authentication
   * @returns {Promise<{customer: Object}>}
   */
  async getProfile() {
    if (!this._accessToken) {
      throw new Error("Not authenticated");
    }

    const url = `${this.client.baseURL}/api/storefront/auth/me`;
    const response = await this.client._fetch(url, {
      headers: {
        Authorization: `Bearer ${this._accessToken}`,
      },
    });

    this._customer = response.customer;
    return response;
  }

  /**
   * Update customer profile
   * Backend expects snake_case fields:
   * - first_name, last_name, phone
   * - address_line1, address_line2, city, state, zip_code, country
   * - accepts_marketing
   * @param {Object} data - Profile data to update (snake_case format)
   * @returns {Promise<{customer: Object}>}
   */
  async updateProfile(data) {
    if (!this._accessToken) {
      throw new Error("Not authenticated");
    }

    const url = `${this.client.baseURL}/api/storefront/auth/me`;
    const response = await this.client._fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${this._accessToken}`,
      },
      // Pass through data as-is - backend expects snake_case
      body: JSON.stringify(data),
    });

    this._customer = response.customer;
    return response;
  }

  /**
   * Logout - clear local state
   * @returns {Promise<void>}
   */
  async logout() {
    if (this._accessToken) {
      try {
        const url = `${this.client.baseURL}/api/storefront/auth/logout`;
        await this.client._fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this._accessToken}`,
          },
        });
      } catch (e) {
        // Ignore logout errors
      }
    }

    this._customer = null;
    this._accessToken = null;
    this._refreshToken = null;
  }

  /**
   * Update customer metadata (key-value pairs)
   * Merges with existing metadata. Set a key to null to remove it.
   * @param {Object} metadata - Key-value pairs to merge
   * @returns {Promise<{customer: Object}>}
   *
   * @example
   * await dash.auth.updateMetadata({ preferred_color: "blue", loyalty_tier: "gold" });
   * // Remove a key:
   * await dash.auth.updateMetadata({ preferred_color: null });
   */
  async updateMetadata(metadata) {
    if (!this._accessToken) {
      throw new Error("Not authenticated");
    }

    return this.updateProfile({ metadata });
  }

  /**
   * List the authenticated customer's saved addresses.
   *
   * Part of the multi-address feature. The single `customer.address` and the
   * flat `address_line1/city/...` fields still work for older integrations —
   * the "main" address is kept in sync with them automatically.
   * @returns {Promise<{addresses: Object[]}>}
   */
  async getAddresses() {
    if (!this._accessToken) {
      throw new Error("Not authenticated");
    }
    const url = `${this.client.baseURL}/api/storefront/auth/addresses`;
    return this.client._fetch(url, {
      headers: { Authorization: `Bearer ${this._accessToken}` },
    });
  }

  /**
   * Create a new saved address.
   * @param {Object} data - { label?, line1, line2?, city, state?, zip_code?, country?, is_main? }
   * @returns {Promise<{address: Object}>}
   */
  async createAddress(data) {
    if (!this._accessToken) {
      throw new Error("Not authenticated");
    }
    const url = `${this.client.baseURL}/api/storefront/auth/addresses`;
    return this.client._fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this._accessToken}` },
      body: JSON.stringify(data || {}),
    });
  }

  /**
   * Update a saved address. Pass `{ is_main: true }` to make it the main address.
   * @param {string} addressId
   * @param {Object} data - Fields to update
   * @returns {Promise<{address: Object}>}
   */
  async updateAddress(addressId, data) {
    if (!this._accessToken) {
      throw new Error("Not authenticated");
    }
    const url = `${this.client.baseURL}/api/storefront/auth/addresses/${addressId}`;
    return this.client._fetch(url, {
      method: "PUT",
      headers: { Authorization: `Bearer ${this._accessToken}` },
      body: JSON.stringify(data || {}),
    });
  }

  /**
   * Delete a saved address. If it was the main address, another is promoted.
   * @param {string} addressId
   * @returns {Promise<{deleted: boolean}>}
   */
  async deleteAddress(addressId) {
    if (!this._accessToken) {
      throw new Error("Not authenticated");
    }
    const url = `${this.client.baseURL}/api/storefront/auth/addresses/${addressId}`;
    return this.client._fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this._accessToken}` },
    });
  }

  /**
   * Mark a saved address as the customer's main address (mirrors to the flat
   * address fields for back-compat).
   * @param {string} addressId
   * @returns {Promise<{address: Object}>}
   */
  async setMainAddress(addressId) {
    return this.updateAddress(addressId, { is_main: true });
  }

  /**
   * Get customer's order history
   * @param {Object} [options] - Pagination options
   * @param {number} [options.limit=20] - Number of orders per page
   * @param {number} [options.offset=0] - Pagination offset
   * @returns {Promise<{orders: Object[], pagination: Object}>}
   */
  async getOrders(options = {}) {
    if (!this._accessToken) {
      throw new Error("Not authenticated");
    }

    const params = new URLSearchParams();
    if (options.limit) params.append("limit", options.limit);
    if (options.offset) params.append("offset", options.offset);

    const qs = params.toString();
    const url = `${this.client.baseURL}/api/storefront/auth/orders${qs ? `?${qs}` : ""}`;
    return this.client._fetch(url, {
      headers: {
        Authorization: `Bearer ${this._accessToken}`,
      },
    });
  }

  /**
   * Get a single order by ID
   * @param {string} orderId - Order ID
   * @returns {Promise<{order: Object}>}
   */
  async getOrder(orderId) {
    if (!this._accessToken) {
      throw new Error("Not authenticated");
    }

    const url = `${this.client.baseURL}/api/storefront/auth/orders/${orderId}`;
    return this.client._fetch(url, {
      headers: {
        Authorization: `Bearer ${this._accessToken}`,
      },
    });
  }

  /**
   * Ask for a "back in stock" email for a sold-out variation + size (signed-in customers only:
   * sign a new visitor in with requestOtp / verifyOtp first, which creates the customer).
   * @param {string} productSlug - Product slug
   * @param {string} sizeId - The sold-out size (its variation is implied)
   * @returns {Promise<{success: boolean, created: boolean, in_stock: boolean, id?: string}>}
   */
  async requestRestock(productSlug, sizeId) {
    if (!this._accessToken) {
      throw new Error("Not authenticated");
    }
    const url = `${this.client.baseURL}/api/storefront/products/${encodeURIComponent(productSlug)}/notify-restock`;
    return this.client._fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this._accessToken}` },
      body: JSON.stringify({ size_id: sizeId }),
    });
  }

  /**
   * The signed-in customer's restock emails (open first), for an account Notifications page.
   * @returns {Promise<{restock_requests: Object[]}>}
   */
  async getRestockRequests() {
    if (!this._accessToken) {
      throw new Error("Not authenticated");
    }
    const url = `${this.client.baseURL}/api/storefront/auth/restock-requests`;
    return this.client._fetch(url, {
      headers: { Authorization: `Bearer ${this._accessToken}` },
    });
  }

  /**
   * Stop one restock email.
   * @param {string} requestId - Restock request ID
   * @returns {Promise<{restock_request: Object}>}
   */
  async unsubscribeRestock(requestId) {
    if (!this._accessToken) {
      throw new Error("Not authenticated");
    }
    const url = `${this.client.baseURL}/api/storefront/auth/restock-requests/${encodeURIComponent(requestId)}/unsubscribe`;
    return this.client._fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this._accessToken}` },
    });
  }

  /**
   * Check if current IP/session is banned
   * @returns {Promise<{banned: boolean, reason?: string}>}
   */
  async checkBan() {
    const url = `${this.client.baseURL}/api/storefront/auth/check-ban`;
    const headers = {};
    if (this._accessToken) {
      headers.Authorization = `Bearer ${this._accessToken}`;
    }
    return this.client._fetch(url, { headers });
  }

  /**
   * Associate a guest cart with authenticated customer
   * @param {string} cartId - Guest cart ID to merge
   * @returns {Promise<{cart: Object}>}
   */
  async mergeCart(cartId) {
    if (!this._accessToken) {
      throw new Error("Not authenticated");
    }

    const url = `${this.client.baseURL}/api/storefront/auth/merge-cart`;
    return this.client._fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this._accessToken}`,
      },
      body: JSON.stringify({ cart_id: cartId }),
    });
  }
}

export default AuthModule;

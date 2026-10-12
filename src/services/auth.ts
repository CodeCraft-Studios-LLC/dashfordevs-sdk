/**
 * Auth Module
 *
 * Customer authentication (OTP or password), session tokens and the
 * customer's own data. Personal data always travels in request bodies or
 * Bearer headers, never in a URL.
 *
 * v2 implements the members v1's type declarations promised but its runtime
 * lacked: `accessToken`, `refresh()`, `setTokens()`, `clearTokens()` and the
 * positional `verifyOTP(email, code)` form.
 */

import type { DashClient } from "../client.js";
import type {
  AuthRefreshResponse,
  AuthTokenResponse,
  CartGetResponse,
  CheckoutOrder,
  CheckoutResumeResponse,
  Customer,
  CustomerOrdersResponse,
  CustomerProfileUpdate,
  RestockRequest,
  RestockRequestResponse,
  SavedAddress,
} from "../types.js";

type AddressInput = {
  label?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string | null;
  zip_code?: string;
  country?: string;
  is_main?: boolean;
};

export class AuthModule {
  client: DashClient;
  __customer: Customer | null;
  _accessToken: string | null;
  _refreshToken: string | null;

  constructor(client: DashClient) {
    this.client = client;
    this.__customer = null;
    this._accessToken = null;
    this._refreshToken = null;
  }

  /**
   * Backing for the current customer. Setting it ties first-party analytics
   * to the customer (v1 behaviour). In the default de-identified analytics
   * mode the customer id is NOT sent with analytics events; see insights.
   */
  get _customer(): Customer | null {
    return this.__customer ?? null;
  }
  set _customer(value: Customer | null) {
    this.__customer = value;
    try {
      if (value && (value as any).id) {
        this.client?.insights?.identify?.(String((value as any).id));
      } else if (!value) {
        this.client?.insights?.clearIdentity?.();
      }
    } catch {
      /* analytics must never break auth */
    }
  }

  /** Current customer (local state) */
  get customer(): Customer | null {
    return this._customer;
  }

  /** Current access token */
  get token(): string | null {
    return this._accessToken;
  }

  /** Current access token (alias of `token`; declared by v1's types). */
  get accessToken(): string | null {
    return this._accessToken;
  }

  /** Current refresh token */
  get refreshToken(): string | null {
    return this._refreshToken;
  }

  /** Signed in with a known customer */
  get isAuthenticated(): boolean {
    return !!this._accessToken && !!this._customer;
  }

  /** Restore a session. Passing null clears the access token. */
  setToken(token: string | null, refreshToken?: string | null): void {
    this._accessToken = token;
    if (refreshToken) {
      this._refreshToken = refreshToken;
    }
  }

  /** Set both tokens (e.g. from storage on page load). */
  setTokens(accessToken: string, refreshToken: string): void {
    this._accessToken = accessToken || null;
    this._refreshToken = refreshToken || null;
  }

  /** Forget both tokens locally (no network call; use logout() to end the session server-side). */
  clearTokens(): void {
    this._accessToken = null;
    this._refreshToken = null;
  }

  /** Refresh the access token with the stored refresh token (adopts a rotated refresh token). */
  async refreshAccessToken(): Promise<AuthRefreshResponse> {
    if (!this._refreshToken) {
      throw new Error("No refresh token available");
    }

    const url = `${this.client.baseURL}/api/storefront/auth/refresh`;
    const response: any = await this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify({ refresh_token: this._refreshToken }),
    });

    this._accessToken = response.access_token;
    if (response.refresh_token) {
      this._refreshToken = response.refresh_token;
    }
    return response;
  }

  /** Alias of refreshAccessToken() (declared by v1's types). */
  async refresh(): Promise<AuthRefreshResponse> {
    return this.refreshAccessToken();
  }

  /** Whether a customer exists for this org by email and/or phone (sent in the body). */
  async checkExists({ email, phone }: { email?: string; phone?: string } = {}): Promise<{
    email_exists: boolean;
    phone_exists: boolean;
  }> {
    const url = `${this.client.baseURL}/api/storefront/auth/check-exists`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify({ email: email || "", phone: phone || "" }),
    });
  }

  /** Email a one-time code. */
  async requestOTP(
    email: string,
    options: { accepts_marketing?: boolean; captcha_token?: string } = {}
  ): Promise<{ message: string; email: string }> {
    if (!email) {
      throw new Error("email is required");
    }

    const body: Record<string, any> = { email };
    if (options.accepts_marketing !== undefined) body.accepts_marketing = options.accepts_marketing;
    if (options.captcha_token) body.captcha_token = options.captcha_token;

    const url = `${this.client.baseURL}/api/storefront/auth/request-otp`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /** Verify a one-time code: `verifyOTP({ email, code })` or `verifyOTP(email, code)`. */
  verifyOTP(email: string, code: string): Promise<AuthTokenResponse>;
  verifyOTP(options: { email: string; code: string }): Promise<AuthTokenResponse>;
  async verifyOTP(arg: string | { email: string; code: string }, maybeCode?: string): Promise<AuthTokenResponse> {
    const { email, code } =
      typeof arg === "string" ? { email: arg, code: maybeCode as string } : arg || ({} as { email: string; code: string });

    if (!email || !code) {
      throw new Error("email and code are required");
    }

    const url = `${this.client.baseURL}/api/storefront/auth/verify-otp`;
    const response: any = await this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify({ email, code }),
    });

    this._customer = response.customer;
    this._accessToken = response.access_token;
    this._refreshToken = response.refresh_token;

    return response;
  }

  /** Email + password login. */
  async login(options: { email: string; password: string; captcha_token?: string }): Promise<AuthTokenResponse> {
    const { email, password, captcha_token } = options || ({} as any);

    if (!email || !password) {
      throw new Error("email and password are required");
    }

    const body: Record<string, any> = { email, password };
    if (captcha_token) body.captcha_token = captcha_token;

    const url = `${this.client.baseURL}/api/storefront/auth/login`;
    const response: any = await this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(body),
    });

    this._customer = response.customer;
    this._accessToken = response.access_token;
    this._refreshToken = response.refresh_token;

    return response;
  }

  /** Sign in from an abandoned-checkout recovery token; persist the returned cart_id. */
  async loginWithCheckoutToken(token: string): Promise<CheckoutResumeResponse> {
    if (!token) {
      throw new Error("token is required");
    }

    const response: any = await this.client.checkout.resume(token);

    this._customer = response.customer;
    this._accessToken = response.access_token;
    this._refreshToken = response.refresh_token;

    return response;
  }

  /** Set a password (min 8 characters) for the signed-in customer. */
  async setPassword(password: string): Promise<{ message: string; customer: Customer }> {
    if (!this._accessToken) {
      throw new Error("Not authenticated");
    }

    if (!password || password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }

    const url = `${this.client.baseURL}/api/storefront/auth/set-password`;
    const response: any = await this.client._fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this._accessToken}` },
      body: JSON.stringify({ password }),
    });

    if (response.customer) {
      this._customer = response.customer;
    }

    return response;
  }

  /** Email a password reset code. */
  async requestPasswordReset(email: string): Promise<{ message: string }> {
    if (!email) {
      throw new Error("email is required");
    }

    const url = `${this.client.baseURL}/api/storefront/auth/forgot-password`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  /** Reset the password with the emailed code. */
  async resetPassword(options: { email: string; code: string; password: string }): Promise<{ message: string }> {
    const { email, code, password } = options || ({} as any);

    if (!email || !code || !password) {
      throw new Error("email, code, and password are required");
    }

    const url = `${this.client.baseURL}/api/storefront/auth/reset-password`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify({ email, code, password }),
    });
  }

  /** The signed-in customer's profile. */
  async getProfile(): Promise<{ customer: Customer }> {
    if (!this._accessToken) {
      throw new Error("Not authenticated");
    }

    const url = `${this.client.baseURL}/api/storefront/auth/me`;
    const response: any = await this.client._fetch(url, {
      headers: { Authorization: `Bearer ${this._accessToken}` },
    });

    this._customer = response.customer;
    return response;
  }

  /** Update the profile (snake_case fields, passed through as-is). */
  async updateProfile(data: CustomerProfileUpdate): Promise<{ customer: Customer }> {
    if (!this._accessToken) {
      throw new Error("Not authenticated");
    }

    const url = `${this.client.baseURL}/api/storefront/auth/me`;
    const response: any = await this.client._fetch(url, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${this._accessToken}` },
      body: JSON.stringify(data),
    });

    this._customer = response.customer;
    return response;
  }

  /**
   * End the session server-side (best effort) and clear local state.
   * `allSessions` (declared by v1's types) is sent as `all_sessions: true`
   * only when passed; v1 ignored it.
   */
  async logout(allSessions?: boolean): Promise<void> {
    if (this._accessToken) {
      try {
        const url = `${this.client.baseURL}/api/storefront/auth/logout`;
        const init: Record<string, any> = {
          method: "POST",
          headers: { Authorization: `Bearer ${this._accessToken}` },
        };
        if (allSessions === true) init.body = JSON.stringify({ all_sessions: true });
        await this.client._fetch(url, init);
      } catch {
        // Ignore logout errors
      }
    }

    this._customer = null;
    this._accessToken = null;
    this._refreshToken = null;
  }

  /** Merge key/value metadata into the customer (null removes a key). */
  async updateMetadata(metadata: Record<string, unknown>): Promise<{ customer: Customer }> {
    if (!this._accessToken) {
      throw new Error("Not authenticated");
    }
    return this.updateProfile({ metadata });
  }

  /** Saved addresses. */
  async getAddresses(): Promise<{ addresses: SavedAddress[] }> {
    if (!this._accessToken) {
      throw new Error("Not authenticated");
    }
    const url = `${this.client.baseURL}/api/storefront/auth/addresses`;
    return this.client._fetch(url, {
      headers: { Authorization: `Bearer ${this._accessToken}` },
    });
  }

  async createAddress(data: AddressInput): Promise<{ address: SavedAddress }> {
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

  async updateAddress(addressId: string, data: Partial<AddressInput>): Promise<{ address: SavedAddress }> {
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

  async deleteAddress(addressId: string): Promise<{ deleted: boolean }> {
    if (!this._accessToken) {
      throw new Error("Not authenticated");
    }
    const url = `${this.client.baseURL}/api/storefront/auth/addresses/${addressId}`;
    return this.client._fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this._accessToken}` },
    });
  }

  async setMainAddress(addressId: string): Promise<{ address: SavedAddress }> {
    return this.updateAddress(addressId, { is_main: true });
  }

  /** Order history. */
  async getOrders(options: { limit?: number; offset?: number } = {}): Promise<CustomerOrdersResponse> {
    if (!this._accessToken) {
      throw new Error("Not authenticated");
    }

    const params = new URLSearchParams();
    if (options.limit) params.append("limit", String(options.limit));
    if (options.offset) params.append("offset", String(options.offset));

    const qs = params.toString();
    const url = `${this.client.baseURL}/api/storefront/auth/orders${qs ? `?${qs}` : ""}`;
    return this.client._fetch(url, {
      headers: { Authorization: `Bearer ${this._accessToken}` },
    });
  }

  /** One order. */
  async getOrder(orderId: string): Promise<{ order: CheckoutOrder }> {
    if (!this._accessToken) {
      throw new Error("Not authenticated");
    }

    const url = `${this.client.baseURL}/api/storefront/auth/orders/${orderId}`;
    return this.client._fetch(url, {
      headers: { Authorization: `Bearer ${this._accessToken}` },
    });
  }

  /** Ask for a back-in-stock email for a sold-out size (signed-in customers only). */
  async requestRestock(productSlug: string, sizeId: string): Promise<RestockRequestResponse> {
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

  async getRestockRequests(): Promise<{ restock_requests: RestockRequest[] }> {
    if (!this._accessToken) {
      throw new Error("Not authenticated");
    }
    const url = `${this.client.baseURL}/api/storefront/auth/restock-requests`;
    return this.client._fetch(url, {
      headers: { Authorization: `Bearer ${this._accessToken}` },
    });
  }

  async unsubscribeRestock(requestId: string): Promise<{ restock_request: RestockRequest }> {
    if (!this._accessToken) {
      throw new Error("Not authenticated");
    }
    const url = `${this.client.baseURL}/api/storefront/auth/restock-requests/${encodeURIComponent(requestId)}/unsubscribe`;
    return this.client._fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this._accessToken}` },
    });
  }

  /** Whether the current IP/session is banned. */
  async checkBan(): Promise<{ banned: boolean; reason?: string }> {
    const url = `${this.client.baseURL}/api/storefront/auth/check-ban`;
    const headers: Record<string, string> = {};
    if (this._accessToken) {
      headers.Authorization = `Bearer ${this._accessToken}`;
    }
    return this.client._fetch(url, { headers });
  }

  /** Associate a guest cart with the signed-in customer. */
  async mergeCart(cartId: string): Promise<{ cart: CartGetResponse; cart_id?: string }> {
    if (!this._accessToken) {
      throw new Error("Not authenticated");
    }

    const url = `${this.client.baseURL}/api/storefront/auth/merge-cart`;
    return this.client._fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this._accessToken}` },
      body: JSON.stringify({ cart_id: cartId }),
    });
  }
}

export default AuthModule;

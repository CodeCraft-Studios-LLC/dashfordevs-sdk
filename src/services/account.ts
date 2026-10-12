/**
 * Customer-account modules: email provider proxy, referrals, saved payment
 * methods, discount store, loyalty, earn-points, subscriptions, calendar.
 * Each mirrors its v1 file.
 */

import type { DashClient } from "../client.js";
import type {
  ChangeSubscriptionPlanOptions,
  CreateSubscriptionOptions,
  DiscountStoreListResponse,
  DiscountStoreRedeemResponse,
  EarnPointsCompleteResponse,
  EarnPointsListResponse,
  LoyaltySummaryResponse,
  SubscriptionListResponse,
  SubscriptionResponse,
} from "../types.js";

function bearer(client: DashClient): { Authorization: string } {
  const token = client.auth._accessToken;
  if (!token) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${token}` };
}

// =============================================================================
// Email (Klaviyo through the platform; provider keys stay server-side)
// =============================================================================

export class EmailModule {
  client: DashClient;
  constructor(client: DashClient) {
    this.client = client;
  }

  /** Identify/update a customer profile in the email provider. */
  async identify(options: {
    email: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    properties?: Record<string, any>;
  }): Promise<{ message: string }> {
    const { email, first_name, last_name, phone, properties } = options;

    if (!email) {
      throw new Error("email is required");
    }

    const url = `${this.client.baseURL}/api/storefront/email/identify`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify({ email, first_name, last_name, phone, properties }),
    });
  }

  /** Track an event in the email provider (can trigger flows). */
  async track(options: { email: string; event: string; properties?: Record<string, any> }): Promise<{ message: string }> {
    const { email, event, properties } = options;

    if (!email) {
      throw new Error("email is required");
    }
    if (!event) {
      throw new Error("event name is required");
    }

    const url = `${this.client.baseURL}/api/storefront/email/track`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify({ email, event, properties }),
    });
  }
}

// =============================================================================
// Referrals
// =============================================================================

export class ReferralsModule {
  client: DashClient;
  constructor(client: DashClient) {
    this.client = client;
  }

  /** Validate a referral secret and get/create a discount code. */
  async validate(data: { secret: string; subtotal: string | number; cart_id?: string }): Promise<{
    valid: boolean;
    referrer_first_name: string;
    code: string;
    is_percentage: boolean;
    rate: string;
    discount_amount: string;
    meetsMinimum: boolean;
    error?: string;
  }> {
    const url = `${this.client.baseURL}/api/storefront/referrals/validate`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Referral dashboard for the signed-in customer. */
  async dashboard(): Promise<{
    referral_secret: string;
    referral_link: string;
    total_referrals: number;
    total_points_earned: number;
    points_balance: number;
    recent_referrals: any[];
  }> {
    const headers = bearer(this.client);
    const url = `${this.client.baseURL}/api/storefront/referrals/dashboard`;
    return this.client._fetch(url, { headers });
  }
}

// =============================================================================
// Saved payment methods (read / remove / set default; cards are saved by the
// processor's own tokenizer, never through this SDK)
// =============================================================================

export class PaymentMethodsModule {
  client: DashClient;
  constructor(client: DashClient) {
    this.client = client;
  }

  _auth(): { Authorization: string } {
    return bearer(this.client);
  }

  async list(): Promise<{
    payment_methods: {
      profile_id: number;
      card_type: string;
      last_four: string;
      expiry: string;
      is_default: boolean;
    }[];
  }> {
    const url = `${this.client.baseURL}/api/customer/payment-methods/`;
    return this.client._fetch(url, { headers: this._auth() });
  }

  /** Forget a saved card. The server decides whether a subscription blocks it. */
  async remove(profileId: number | string): Promise<{ success?: boolean; message?: string }> {
    const url = `${this.client.baseURL}/api/customer/payment-methods/${profileId}/delete/`;
    return this.client._fetch(url, { method: "POST", headers: this._auth() });
  }

  /** Make one card the default for future charges. */
  async setDefault(profileId: number | string): Promise<{ success?: boolean; message?: string }> {
    const url = `${this.client.baseURL}/api/customer/payment-methods/${profileId}/set-default/`;
    return this.client._fetch(url, { method: "POST", headers: this._auth() });
  }
}

// =============================================================================
// Discount store (spend loyalty points on one-time codes)
// =============================================================================

export class DiscountStoreModule {
  client: DashClient;
  constructor(client: DashClient) {
    this.client = client;
  }

  /** Available products (and the customer's balance when signed in). */
  async list(): Promise<DiscountStoreListResponse> {
    const url = `${this.client.baseURL}/api/storefront/discount-store`;
    return this.client._fetch(url);
  }

  /** Redeem a product with points (requires sign-in). */
  async redeem(productId: string): Promise<DiscountStoreRedeemResponse> {
    const headers = bearer(this.client);
    const url = `${this.client.baseURL}/api/storefront/discount-store/redeem`;
    return this.client._fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ product_id: productId }),
    });
  }
}

// =============================================================================
// Loyalty (print the server's `display` strings; do not rebuild them)
// =============================================================================

export class LoyaltyModule {
  client: DashClient;
  constructor(client: DashClient) {
    this.client = client;
  }

  /** The programme for this tenant, plus the caller's balance when signed in. */
  async summary(): Promise<LoyaltySummaryResponse> {
    const url = `${this.client.baseURL}/api/storefront/loyalty/summary`;
    return this.client._fetch(url);
  }
}

// =============================================================================
// Earn points (one-time social tasks)
// =============================================================================

export class EarnPointsModule {
  client: DashClient;
  constructor(client: DashClient) {
    this.client = client;
  }

  /** Completed tasks for the signed-in customer. */
  async list(): Promise<EarnPointsListResponse> {
    const headers = bearer(this.client);
    const url = `${this.client.baseURL}/api/storefront/earn-points/tasks`;
    return this.client._fetch(url, { headers });
  }

  /** Mark a task completed and award points (once per task). */
  async complete(taskId: string): Promise<EarnPointsCompleteResponse> {
    const headers = bearer(this.client);
    const url = `${this.client.baseURL}/api/storefront/earn-points/complete`;
    return this.client._fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ task_id: taskId }),
    });
  }
}

// =============================================================================
// Subscriptions (account flow: signed-in customer + saved card)
// =============================================================================

export class SubscriptionsModule {
  client: DashClient;
  constructor(client: DashClient) {
    this.client = client;
  }

  _authHeaders(): { Authorization: string } {
    return bearer(this.client);
  }

  _url(path = ""): string {
    return `${this.client.baseURL}/api/customer/subscriptions/${path}`;
  }

  /** Every subscription of the signed-in customer, newest first. */
  async list(): Promise<SubscriptionListResponse> {
    return this.client._fetch(this._url(), { headers: this._authHeaders() });
  }

  /** Start a subscription (planId from size.subscription_plans; saved card required). */
  async create(options: CreateSubscriptionOptions = {} as CreateSubscriptionOptions): Promise<SubscriptionResponse> {
    const { planId, paymentProfileId, quantity = 1, shippingAddress } = options;
    if (!planId || !paymentProfileId) {
      throw new Error("planId and paymentProfileId are required");
    }
    return this.client._fetch(this._url(), {
      method: "POST",
      headers: this._authHeaders(),
      body: JSON.stringify({
        plan_id: planId,
        payment_profile_id: paymentProfileId,
        quantity,
        shipping_address: shippingAddress || {},
      }),
    });
  }

  /** Cancel for good (terminal). */
  async cancel(subscriptionId: string): Promise<SubscriptionResponse> {
    return this.client._fetch(this._url(`${subscriptionId}/cancel/`), {
      method: "POST",
      headers: this._authHeaders(),
    });
  }

  /** Pause billing, keeping the billing day. */
  async pause(subscriptionId: string): Promise<SubscriptionResponse> {
    return this.client._fetch(this._url(`${subscriptionId}/pause/`), {
      method: "POST",
      headers: this._authHeaders(),
    });
  }

  /** Restart a paused subscription. */
  async resume(subscriptionId: string): Promise<SubscriptionResponse> {
    return this.client._fetch(this._url(`${subscriptionId}/resume/`), {
      method: "POST",
      headers: this._authHeaders(),
    });
  }

  /** Point future charges at a different saved card. */
  async updatePayment(subscriptionId: string, paymentProfileId: string): Promise<SubscriptionResponse> {
    if (!paymentProfileId) throw new Error("paymentProfileId is required");
    return this.client._fetch(this._url(`${subscriptionId}/update-payment/`), {
      method: "POST",
      headers: this._authHeaders(),
      body: JSON.stringify({ payment_profile_id: paymentProfileId }),
    });
  }

  /** Change size, frequency or quantity by moving to another plan. */
  async changePlan(
    subscriptionId: string,
    options: ChangeSubscriptionPlanOptions = {} as ChangeSubscriptionPlanOptions
  ): Promise<SubscriptionResponse> {
    const { planId, quantity, resetBillingDate = false } = options;
    if (!planId) throw new Error("planId is required");
    const body: Record<string, any> = { plan_id: planId, reset_billing_date: resetBillingDate };
    if (quantity !== undefined) body.quantity = quantity;
    return this.client._fetch(this._url(`${subscriptionId}/change-plan/`), {
      method: "POST",
      headers: this._authHeaders(),
      body: JSON.stringify(body),
    });
  }
}

// =============================================================================
// Calendar
// =============================================================================

export class CalendarModule {
  client: DashClient;
  constructor(client: DashClient) {
    this.client = client;
  }

  /** Business hours and overlap policy. */
  async getSettings(): Promise<{ settings: { allow_overlapping: boolean; business_hours: Record<string, any> } }> {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/calendar/settings`);
  }

  /** Days off. */
  async getDaysOff(): Promise<{
    days_off: Array<{ id: string; title: string; start_date: string; end_date: string; recurring_yearly: boolean }>;
  }> {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/calendar/days-off`);
  }

  /** Booked slots for a month (YYYY-MM). */
  async getAvailability(month: string): Promise<{ slots: Array<{ start: string; end: string; all_day: boolean }>; timezone?: string }> {
    return this.client._fetch(
      `${this.client.baseURL}/api/storefront/calendar/availability?month=${encodeURIComponent(month)}`
    );
  }

  /** Create a booking. The customer's details travel in the POST body only. */
  async book(data: {
    start: string;
    end?: string;
    customer_name: string;
    customer_email: string;
    customer_phone?: string;
    trip_type?: string;
    guests?: number;
    notes?: string;
    all_day?: boolean;
    metadata?: Record<string, any>;
  }): Promise<{ success: boolean; message: string; booking: { id: string; start: string; end: string } }> {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/calendar/book`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
}

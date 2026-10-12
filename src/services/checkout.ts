/**
 * Checkout Module
 *
 * Guest: start() validates the cart and emails an OTP; complete() verifies it
 * and creates the order. Signed in: no OTP.
 *
 * v2: `payment_token.line_items` and `payment_token.description` are masked
 * before they are sent, because the API forwards them to the payment
 * processor (Authorize.net lineItems / order.description). The processor gets
 * "Item 1", opaque ids, quantities and prices - never product names.
 */

import type { DashClient } from "../client.js";
import type {
  CheckoutCompleteData,
  CheckoutCompleteResponse,
  CheckoutResumeResponse,
  CheckoutStartData,
  CheckoutStartResponse,
  WholesaleRequestData,
  WholesaleRequestResponse,
} from "../types.js";
import { maskLineItems, maskPaymentDescription } from "../core/privacy.js";

/** The payment_token as it may be sent to the API: masked line items and description. */
export function sanitizePaymentToken<T extends Record<string, any> | undefined | null>(token: T): T {
  if (!token || typeof token !== "object") return token;
  const out: Record<string, any> = { ...token };
  if ("line_items" in out) out.line_items = maskLineItems(out.line_items);
  if ("description" in out) out.description = maskPaymentDescription(out.description);
  return out as T;
}

export class CheckoutModule {
  client: DashClient;

  constructor(client: DashClient) {
    this.client = client;
  }

  /** Start checkout. Guests need an email (an OTP is sent); signed-in customers skip OTP. */
  async start(data: CheckoutStartData): Promise<CheckoutStartResponse> {
    const { cartId, email, acceptsMarketing } = data;
    if (!cartId) {
      throw new Error("cartId is required");
    }

    const headers: Record<string, string> = {};
    if (this.client.auth && this.client.auth.token) {
      headers["Authorization"] = `Bearer ${this.client.auth.token}`;
    } else if (!email) {
      throw new Error("cartId and email are required for guest checkout");
    }

    const body: Record<string, any> = { cart_id: cartId };
    if (email) body.email = email;
    if (acceptsMarketing !== undefined) body.accepts_marketing = acceptsMarketing;

    const url = `${this.client.baseURL}/api/storefront/checkout/start`;
    return this.client._fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  }

  /** Countries and states the organization ships to. */
  async getShippingLocations(): Promise<{
    countries: Array<{ id: string; name: string; code: string; states: Array<{ id: string; name: string; code: string }> }>;
  }> {
    const url = `${this.client.baseURL}/api/storefront/shipping-locations`;
    return this.client._fetch(url);
  }

  /** Globally banned state names (footer disclaimers). */
  async getBannedStateNames(): Promise<{ banned_states: Array<{ code: string; name: string }> }> {
    const url = `${this.client.baseURL}/api/storefront/banned-state-names`;
    return this.client._fetch(url);
  }

  /**
   * Resume an abandoned checkout from a "checkout__<hash>" recovery token.
   * Prefer `dash.auth.loginWithCheckoutToken(token)`.
   *
   * Note: the API takes the token as a query parameter (GET), so it appears in
   * server access logs. It is a single-use credential, not a customer
   * identifier; the path is fixed by the API contract.
   */
  async resume(token: string): Promise<CheckoutResumeResponse> {
    if (!token) {
      throw new Error("token is required");
    }
    const url = `${this.client.baseURL}/api/storefront/checkout/resume?token=${encodeURIComponent(token)}`;
    return this.client._fetch(url, { method: "GET" });
  }

  /** Complete checkout and create the order. */
  async complete(data: CheckoutCompleteData & Record<string, any>): Promise<CheckoutCompleteResponse> {
    const {
      cartId,
      email,
      code,
      shipping,
      customerNotes,
      payment,
      payment_token,
      captcha_token,
      totals,
      analytics,
      affiliateLink,
    } = data;
    if (!cartId || !shipping) {
      throw new Error("cartId and shipping are required");
    }

    const headers: Record<string, string> = {};
    if (this.client.auth && this.client.auth.token) {
      headers["Authorization"] = `Bearer ${this.client.auth.token}`;
    }

    const body: Record<string, any> = {
      cart_id: cartId,
      shipping,
      customer_notes: customerNotes || "",
    };
    if (email) body.email = email;
    if (code) body.code = code;
    if (payment) body.payment = payment;
    if (payment_token) body.payment_token = sanitizePaymentToken(payment_token);
    if (captcha_token) body.captcha_token = captcha_token;
    if (totals) body.totals = totals;

    // First-party attribution snapshot (caller may override via data.analytics).
    let attribution: any = analytics;
    if (attribution === undefined && this.client.insights) {
      try {
        attribution = this.client.insights.attributionForOrder();
      } catch {
        /* ignore */
      }
    }
    if (attribution) body.analytics = attribution;

    // Affiliate link credit from the `aflnk` cookie (override with affiliateLink, null for none).
    let link: string | null | undefined = affiliateLink;
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
   * Wholesale order request - no payment, no OTP. SECRET-KEY ONLY: call from a
   * server route with an sk_ key, never from the browser.
   */
  async placeWholesaleRequest(data: WholesaleRequestData): Promise<WholesaleRequestResponse> {
    const { cartId, email, shipping, customerNotes, totals } = data;
    if (!cartId || !email || !shipping) {
      throw new Error("cartId, email and shipping are required");
    }

    const url = `${this.client.baseURL}/api/storefront/wholesale/place-request`;
    const body: Record<string, any> = {
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

/**
 * Subscriptions Module
 *
 * A customer's product subscriptions: recurring deliveries of one ProductSize
 * on a schedule, billed by the platform against a saved payment profile.
 *
 * WHAT A SUBSCRIPTION IS MADE OF
 * ------------------------------
 * A `ProductSubscriptionPlan` belongs to ONE ProductSize and carries ONE
 * interval and ONE discount. So "3mg every 4 weeks at 15% off" is a plan, and
 * changing either the size or the frequency means moving to a different plan.
 * That is what `changePlan` is for.
 *
 * Plans for a size come back on the product detail and options payloads as
 * `size.subscription_plans`; there is no separate plan endpoint to call.
 *
 * SUBSCRIBING NEEDS A SIGNED-IN CUSTOMER WITH A SAVED CARD. `create` takes a
 * `paymentProfileId`, so this is an account flow, not a cart flow: a
 * subscription cannot be added to a cart and checked out. Use
 * `dash.payment.*` to get the customer a saved profile first.
 */

export class SubscriptionsModule {
  constructor(client) {
    this.client = client;
  }

  _authHeaders() {
    const token = this.client.auth._accessToken;
    if (!token) throw new Error("Not authenticated");
    return { Authorization: `Bearer ${token}` };
  }

  _url(path = "") {
    return `${this.client.baseURL}/api/customer/subscriptions/${path}`;
  }

  /**
   * Every subscription belonging to the signed-in customer, newest first.
   * @returns {Promise<{subscriptions: Array<Object>}>}
   */
  async list() {
    return this.client._fetch(this._url(), { headers: this._authHeaders() });
  }

  /**
   * Start a subscription.
   *
   * @param {Object} options
   * @param {string} options.planId - ProductSubscriptionPlan id. Read it from
   *   `size.subscription_plans` on the product payload.
   * @param {string} options.paymentProfileId - A saved card. Required: there
   *   is nothing to charge future cycles against without one.
   * @param {number} [options.quantity=1]
   * @param {Object} [options.shippingAddress] - Snapshotted onto the
   *   subscription, so later address edits do not silently redirect shipments
   *   that are already scheduled.
   * @returns {Promise<{subscription: Object}>}
   */
  async create(options = {}) {
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

  /**
   * Cancel for good. Terminal: `resume` will not bring it back, and the
   * customer has to subscribe again.
   */
  async cancel(subscriptionId) {
    return this.client._fetch(this._url(`${subscriptionId}/cancel/`), {
      method: "POST",
      headers: this._authHeaders(),
    });
  }

  /**
   * Pause billing, keeping the subscription. The billing date is preserved,
   * so resuming restores the original schedule rather than moving the
   * customer's billing day.
   */
  async pause(subscriptionId) {
    return this.client._fetch(this._url(`${subscriptionId}/pause/`), {
      method: "POST",
      headers: this._authHeaders(),
    });
  }

  /**
   * Restart a paused subscription. If the pause ran past the old billing
   * date, the next charge is moved to the next future date instead of firing
   * immediately.
   */
  async resume(subscriptionId) {
    return this.client._fetch(this._url(`${subscriptionId}/resume/`), {
      method: "POST",
      headers: this._authHeaders(),
    });
  }

  /** Point future charges at a different saved card. */
  async updatePayment(subscriptionId, paymentProfileId) {
    if (!paymentProfileId) throw new Error("paymentProfileId is required");
    return this.client._fetch(this._url(`${subscriptionId}/update-payment/`), {
      method: "POST",
      headers: this._authHeaders(),
      body: JSON.stringify({ payment_profile_id: paymentProfileId }),
    });
  }

  /**
   * Change SIZE, FREQUENCY or QUANTITY by moving to another plan.
   *
   * The per-cycle amount is always recomputed from the new plan, so a switch
   * cannot leave the customer paying the old price.
   *
   * @param {string} subscriptionId
   * @param {Object} options
   * @param {string} options.planId - The plan to move to.
   * @param {number} [options.quantity] - Omit to keep the current quantity.
   * @param {boolean} [options.resetBillingDate=false] - By default the
   *   customer keeps their existing billing day, so switching cannot defer a
   *   charge that is already due. Pass true to restart the clock from today
   *   on the new interval.
   */
  async changePlan(subscriptionId, options = {}) {
    const { planId, quantity, resetBillingDate = false } = options;
    if (!planId) throw new Error("planId is required");
    const body = { plan_id: planId, reset_billing_date: resetBillingDate };
    if (quantity !== undefined) body.quantity = quantity;
    return this.client._fetch(this._url(`${subscriptionId}/change-plan/`), {
      method: "POST",
      headers: this._authHeaders(),
      body: JSON.stringify(body),
    });
  }
}

export default SubscriptionsModule;

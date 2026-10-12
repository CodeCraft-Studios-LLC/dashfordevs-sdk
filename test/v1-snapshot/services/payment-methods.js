/**
 * Payment Methods Module
 *
 * The cards a signed-in customer has saved, for an account area to list and
 * manage. Nothing here creates one: a card is saved during checkout, by the
 * processor's own tokenizer, so that it never touches this code or our
 * servers. This module only ever reads what is already there, removes one,
 * or moves the default.
 *
 * `profile_id` rather than an id of ours, because these are records in the
 * processor's customer profile and that is the handle it answers to.
 *
 * Every call needs a Bearer token. A payment method belongs to a person, not
 * to an organization, so an API key alone is never enough to see one.
 */

export class PaymentMethodsModule {
  constructor(client) {
    this.client = client;
  }

  _auth() {
    const token = this.client.auth._accessToken;
    if (!token) throw new Error("Not authenticated");
    return { Authorization: `Bearer ${token}` };
  }

  /**
   * Every saved card for the signed-in customer.
   * @returns {Promise<{payment_methods: Array<{profile_id: number, card_type: string, last_four: string, expiry: string, is_default: boolean}>}>}
   */
  async list() {
    const url = `${this.client.baseURL}/api/customer/payment-methods/`;
    return this.client._fetch(url, { headers: this._auth() });
  }

  /**
   * Forget a saved card.
   *
   * A subscription billing against it keeps its own arrangement: the server
   * decides whether the removal is allowed and says so, rather than this
   * guessing on the customer's behalf.
   *
   * @param {number|string} profileId
   */
  async remove(profileId) {
    const url = `${this.client.baseURL}/api/customer/payment-methods/${profileId}/delete/`;
    return this.client._fetch(url, { method: "POST", headers: this._auth() });
  }

  /**
   * Make one card the default for future charges.
   * @param {number|string} profileId
   */
  async setDefault(profileId) {
    const url = `${this.client.baseURL}/api/customer/payment-methods/${profileId}/set-default/`;
    return this.client._fetch(url, { method: "POST", headers: this._auth() });
  }
}

export default PaymentMethodsModule;

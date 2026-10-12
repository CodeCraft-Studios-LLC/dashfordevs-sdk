/**
 * Referrals Module
 *
 * Provides referral program functionality for storefronts.
 * Simpler than affiliates: auto-enrolled, points-based.
 */

export class ReferralsModule {
  constructor(client) {
    this.client = client;
  }

  /**
   * Validate a referral secret and get/create a discount code
   * @param {Object} data
   * @param {string} data.secret - Referral secret from the URL
   * @param {string|number} data.subtotal - Current cart subtotal
   * @returns {Promise<{valid: boolean, referrer_first_name: string, code: string, is_percentage: boolean, rate: string, discount_amount: string, meetsMinimum: boolean}>}
   */
  async validate(data) {
    const url = `${this.client.baseURL}/api/storefront/referrals/validate`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * Get referral dashboard data for the authenticated customer
   * Requires Bearer token authentication.
   * @returns {Promise<{referral_secret: string, referral_link: string, total_referrals: number, total_points_earned: number, points_balance: number, recent_referrals: Array}>}
   */
  async dashboard() {
    const token = this.client.auth._accessToken;
    if (!token) throw new Error("Not authenticated");
    const url = `${this.client.baseURL}/api/storefront/referrals/dashboard`;
    return this.client._fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}

export default ReferralsModule;

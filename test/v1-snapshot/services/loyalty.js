/**
 * Loyalty Module
 *
 * One read that answers everything a storefront needs to say about
 * points or cash back: how the tenant presents a balance, what earns
 * it, what each rule is worth, and the customer's own balance when
 * there is an authenticated one.
 *
 * WHY THIS IS A MODULE AND NOT A FEW FIELDS ON GLOBAL DATA. Before
 * it, a storefront that wanted to print "500 points for signing up"
 * had to keep 500 in its own source, because nothing exposed it. The
 * same number was also typed into the backend's signup path, and the
 * two could disagree without anyone noticing. Every figure here comes
 * off the Organization row that the award code itself reads.
 *
 * THE SERVER DOES THE ARITHMETIC. Each rule and the balance arrive
 * with a `display` string already decided: "$5.00" in a cash-back
 * tenant, "500 points" in a points tenant. A storefront that divides
 * a balance by a rate can disagree with the balance a redemption is
 * measured against, and only one of those can be right. Print
 * `display`; do not rebuild it.
 *
 * Money is a decimal string, not a number, because a float cannot
 * hold 12.50 exactly.
 */

export class LoyaltyModule {
  constructor(client) {
    this.client = client;
  }

  /**
   * The loyalty programme for this tenant.
   *
   * Works signed out: the rules and the rate are public, and
   * `balance` is simply null. An expired or invalid token is treated
   * the same way rather than as an error, so a marketing page never
   * 401s because somebody's session lapsed.
   *
   * @returns {Promise<{
   *   enabled: boolean,
   *   display_mode: "points"|"cashback",
   *   points_per_currency_unit: number|null,
   *   currency: string,
   *   earn_rate: {
   *     points_per_dollar_min: number,
   *     points_per_dollar_max: number,
   *     percent_back_min: string|null,
   *     percent_back_max: string|null,
   *     display: string|null
   *   }|null,
   *   earn_rules: Array<{
   *     key: string,
   *     title: string,
   *     points: number,
   *     limit: string,
   *     cash_value: string|null,
   *     display: string
   *   }>,
   *   balance: {
   *     points: number,
   *     display_mode: string,
   *     points_per_currency_unit: number|null,
   *     currency: string,
   *     cash_value: string|null,
   *     display: string
   *   }|null
   * }>}
   *
   * @example
   * const loyalty = await dash.loyalty.summary();
   * loyalty.earn_rules.map((rule) => `${rule.title}: ${rule.display}`);
   */
  async summary() {
    const url = `${this.client.baseURL}/api/storefront/loyalty/summary`;
    return this.client._fetch(url);
  }
}

export default LoyaltyModule;

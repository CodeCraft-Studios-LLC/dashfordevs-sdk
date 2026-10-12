/**
 * Loyalty balance formatting.
 *
 * ONE PLACE, so every storefront does not write the same branch.
 * A tenant shows its loyalty balance either as points or as money,
 * the API sends both numbers and says which it wants, and the job on
 * this side is only to pick and format. Written inline per site it
 * drifts: one shows "$12.5", another "1250 pts", a third divides by
 * the rate itself and disagrees with the server by a cent.
 *
 * NOTHING HERE CONVERTS. `cash_value` is computed server-side and
 * floored to the cent there. If it is missing, this falls back to
 * points rather than doing the arithmetic: a balance the client
 * worked out is a balance that can disagree with the one being spent,
 * and the server is the only side that can be right.
 */

import { formatPrice } from "./price.js";

/**
 * Format a LoyaltyBalance for display.
 *
 * @param {Object|null} balance - The `balance` object from the API.
 * @param {Object} [options]
 * @param {string} [options.locale='en-US']
 * @param {string} [options.pointsLabel='points'] - Plural noun for points.
 * @param {string} [options.pointLabel='point'] - Singular.
 * @returns {string} e.g. "$12.50" or "1,250 points". Empty for no balance.
 */
export function formatLoyaltyBalance(balance, options = {}) {
  const {
    locale = "en-US",
    pointsLabel = "points",
    pointLabel = "point",
  } = options;

  if (!balance) return "";
  const points = Number(balance.points) || 0;

  /* Cash only when the merchant asked for it AND the server managed
     to produce a figure. A misconfigured rate sends null, and the
     honest fallback is the number that is always true. */
  if (balance.display_mode === "cashback" && balance.cash_value != null) {
    return formatPrice(balance.cash_value, {
      currency: balance.currency || "USD",
      locale,
    });
  }

  const noun = points === 1 ? pointLabel : pointsLabel;
  return `${points.toLocaleString(locale)} ${noun}`;
}

/**
 * Whether this tenant talks in money.
 *
 * Checks the rate as well as the mode, because a storefront asking
 * this is about to render copy like "earn 5% back" and the rate is
 * what that sentence needs.
 */
export function showsCashBack(balance) {
  return Boolean(
    balance &&
      balance.display_mode === "cashback" &&
      Number(balance.points_per_currency_unit) > 0,
  );
}

/**
 * What an earn rate of `pointsPerUnit` points per currency unit is as
 * a percentage, or null when it cannot be worked out.
 *
 * This one IS safe to do on the client: it is a property of two
 * settings rather than of anybody's balance, so there is nothing for
 * it to disagree with. Guarded against a zero divisor, which the API
 * is entitled to send.
 */
export function earnRatePercent(pointsPerProductUnit, balance) {
  const rate = Number(balance && balance.points_per_currency_unit);
  const earn = Number(pointsPerProductUnit);
  if (!(rate > 0) || !(earn > 0)) return null;
  return (earn / rate) * 100;
}

export default { formatLoyaltyBalance, showsCashBack, earnRatePercent };

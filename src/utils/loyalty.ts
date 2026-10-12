/**
 * Loyalty balance formatting. Nothing here converts: `cash_value` is computed
 * and floored server-side; when it is missing this falls back to points.
 */

import { formatPrice } from "./price.js";

/** The `balance` object returned beside any loyalty figure. */
export interface LoyaltyBalance {
  points: number;
  display_mode: "points" | "cashback";
  points_per_currency_unit: number | null;
  currency: string;
  cash_value: string | null;
}

export interface FormatLoyaltyOptions {
  locale?: string;
  /** Plural noun for points. Default "points". */
  pointsLabel?: string;
  /** Singular. Default "point". */
  pointLabel?: string;
}

/** "$12.50" in cash-back mode, "1,250 points" otherwise; "" for no balance. */
export function formatLoyaltyBalance(balance: LoyaltyBalance | null | undefined, options: FormatLoyaltyOptions = {}): string {
  const { locale = "en-US", pointsLabel = "points", pointLabel = "point" } = options;

  if (!balance) return "";
  const points = Number(balance.points) || 0;

  if (balance.display_mode === "cashback" && balance.cash_value != null) {
    return formatPrice(balance.cash_value, { currency: balance.currency || "USD", locale });
  }

  const noun = points === 1 ? pointLabel : pointsLabel;
  return `${points.toLocaleString(locale)} ${noun}`;
}

/** Whether this tenant talks in money, with a usable rate. */
export function showsCashBack(balance: LoyaltyBalance | null | undefined): boolean {
  return Boolean(balance && balance.display_mode === "cashback" && Number(balance.points_per_currency_unit) > 0);
}

/** An earn rate of N points per currency unit as a percentage, or null. */
export function earnRatePercent(pointsPerProductUnit: number, balance: LoyaltyBalance | null | undefined): number | null {
  const rate = Number(balance && balance.points_per_currency_unit);
  const earn = Number(pointsPerProductUnit);
  if (!(rate > 0) || !(earn > 0)) return null;
  return (earn / rate) * 100;
}

export default { formatLoyaltyBalance, showsCashBack, earnRatePercent };

// ============================================================================
// Loyalty Utilities
// ============================================================================

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

/**
 * Format a balance the way the merchant asked for it: money in
 * cashback mode, points otherwise. Returns "" for a null balance.
 *
 * Nothing here converts. `cash_value` is computed and floored on the
 * server; if it is missing this falls back to points rather than
 * doing the arithmetic, because a balance the client worked out can
 * disagree with the one being spent.
 */
export declare function formatLoyaltyBalance(
  balance: LoyaltyBalance | null | undefined,
  options?: FormatLoyaltyOptions,
): string;

/** Whether this tenant talks in money, rate included and usable. */
export declare function showsCashBack(
  balance: LoyaltyBalance | null | undefined,
): boolean;

/**
 * An earn rate of N points per currency unit, as a percentage. Null
 * when either number is missing or zero.
 */
export declare function earnRatePercent(
  pointsPerProductUnit: number,
  balance: LoyaltyBalance | null | undefined,
): number | null;

// ============================================================================
// Price Utilities
// ============================================================================

export interface FormatPriceOptions {
  currency?: string;
  locale?: string;
  showCents?: boolean;
}

export interface FormatPercentOptions {
  decimals?: number;
  showSign?: boolean;
}

export function formatPrice(price: number | string, options?: FormatPriceOptions): string;
export function formatPercent(value: number | string, options?: FormatPercentOptions): string;
export function calculateDiscountPercent(originalPrice: number | string, discountedPrice: number | string): number;
export function parsePrice(price: string | number): number;

// ============================================================================
// Bulk Discount Utilities
// ============================================================================

export interface BulkDiscount {
  min_quantity: number;
  max_quantity: number | null;
  discount_type: "percentage" | "fixed";
  discount_value: string;
}

export interface BulkDiscountResult {
  percentage: number;
  amount: number;
  subtotal: number;
  total: number;
  appliedTier: BulkDiscount | null;
}

export interface CalculateBulkDiscountOptions {
  price: string | number;
  quantity: number;
  bulkDiscounts?: BulkDiscount[];
}

export interface GetNextDiscountTierOptions {
  quantity: number;
  bulkDiscounts?: BulkDiscount[];
}

export interface NextDiscountTier {
  tier: BulkDiscount;
  quantityNeeded: number;
}

export interface DiscountTierSummary {
  tier: BulkDiscount;
  savings: number;
  pricePerUnit: number;
  discountPercent: number;
}

export interface GetDiscountTiersSummaryOptions {
  price: string | number;
  bulkDiscounts?: BulkDiscount[];
}

export function calculateBulkDiscount(options: CalculateBulkDiscountOptions): BulkDiscountResult;
export function getNextDiscountTier(options: GetNextDiscountTierOptions): NextDiscountTier | null;
export function getDiscountTiersSummary(options: GetDiscountTiersSummaryOptions): DiscountTierSummary[];
export function hasBulkDiscounts(bulkDiscounts?: BulkDiscount[]): boolean;

/**
 * Utility functions for dash4devs (dash4devs/utils)
 */

export { formatPrice, formatPercent, calculateDiscountPercent, parsePrice } from "./price.js";
export type { FormatPriceOptions, FormatPercentOptions } from "./price.js";

export { formatLoyaltyBalance, showsCashBack, earnRatePercent } from "./loyalty.js";
export type { LoyaltyBalance, FormatLoyaltyOptions } from "./loyalty.js";

export { calculateBulkDiscount, getNextDiscountTier, getDiscountTiersSummary, hasBulkDiscounts } from "./bulk-discount.js";
export type {
  BulkDiscount,
  BulkDiscountResult,
  CalculateBulkDiscountOptions,
  GetNextDiscountTierOptions,
  NextDiscountTier,
  DiscountTierSummary,
  GetDiscountTiersSummaryOptions,
} from "./bulk-discount.js";

export { cdnImageUrl, isDashCdnUrl } from "./image.js";

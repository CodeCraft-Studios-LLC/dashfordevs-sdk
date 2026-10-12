/**
 * Utility functions for dash4devs
 */

export {
  formatPrice,
  formatPercent,
  calculateDiscountPercent,
  parsePrice,
} from "./price.js";

export {
  formatLoyaltyBalance,
  showsCashBack,
  earnRatePercent,
} from "./loyalty.js";

export {
  calculateBulkDiscount,
  getNextDiscountTier,
  getDiscountTiersSummary,
  hasBulkDiscounts,
} from "./bulk-discount.js";

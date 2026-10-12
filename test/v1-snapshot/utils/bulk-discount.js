/**
 * Bulk discount calculation utilities
 */

/**
 * @typedef {Object} BulkDiscount
 * @property {number} min_quantity - Minimum quantity for this tier
 * @property {number|null} max_quantity - Maximum quantity (null = unlimited)
 * @property {'percentage'|'fixed'} discount_type - Type of discount
 * @property {string} discount_value - Discount value
 */

/**
 * @typedef {Object} BulkDiscountResult
 * @property {number} percentage - Discount percentage applied
 * @property {number} amount - Discount amount in currency
 * @property {number} subtotal - Subtotal before discount
 * @property {number} total - Total after discount
 * @property {BulkDiscount|null} appliedTier - The tier that was applied
 */

/**
 * Calculate bulk discount for a given quantity
 * @param {Object} options - Calculation options
 * @param {string|number} options.price - Unit price
 * @param {number} options.quantity - Quantity
 * @param {BulkDiscount[]} options.bulkDiscounts - Available discount tiers
 * @returns {BulkDiscountResult}
 */
export function calculateBulkDiscount(options) {
  const { price, quantity, bulkDiscounts = [] } = options;

  const unitPrice = typeof price === "string" ? parseFloat(price) : price;
  const subtotal = unitPrice * quantity;

  // Find applicable bulk discount tier
  let discountPercentage = 0;
  let appliedTier = null;

  // Sort tiers by min_quantity descending to find the best match
  const sortedTiers = [...bulkDiscounts].sort(
    (a, b) => b.min_quantity - a.min_quantity
  );

  for (const tier of sortedTiers) {
    const meetsMin = quantity >= tier.min_quantity;
    const meetsMax = tier.max_quantity === null || quantity <= tier.max_quantity;

    if (meetsMin && meetsMax) {
      if (tier.discount_type === "percentage") {
        discountPercentage = parseFloat(tier.discount_value);
      } else if (tier.discount_type === "fixed") {
        // Convert fixed discount to percentage for consistent handling
        const fixedAmount = parseFloat(tier.discount_value);
        discountPercentage = (fixedAmount / subtotal) * 100;
      }
      appliedTier = tier;
      break;
    }
  }

  const discountAmount = subtotal * (discountPercentage / 100);

  return {
    percentage: discountPercentage,
    amount: discountAmount,
    subtotal,
    total: subtotal - discountAmount,
    appliedTier,
  };
}

/**
 * Get the next discount tier (for upsell messaging)
 * @param {Object} options - Options
 * @param {number} options.quantity - Current quantity
 * @param {BulkDiscount[]} options.bulkDiscounts - Available discount tiers
 * @returns {{tier: BulkDiscount, quantityNeeded: number}|null}
 */
export function getNextDiscountTier(options) {
  const { quantity, bulkDiscounts = [] } = options;

  // Sort tiers by min_quantity ascending
  const sortedTiers = [...bulkDiscounts].sort(
    (a, b) => a.min_quantity - b.min_quantity
  );

  // Find the first tier with min_quantity > current quantity
  for (const tier of sortedTiers) {
    if (tier.min_quantity > quantity) {
      return {
        tier,
        quantityNeeded: tier.min_quantity - quantity,
      };
    }
  }

  return null;
}

/**
 * Get all discount tiers with their savings at a given unit price
 * @param {Object} options - Options
 * @param {string|number} options.price - Unit price
 * @param {BulkDiscount[]} options.bulkDiscounts - Available discount tiers
 * @returns {Array<{tier: BulkDiscount, savings: number, pricePerUnit: number}>}
 */
export function getDiscountTiersSummary(options) {
  const { price, bulkDiscounts = [] } = options;

  const unitPrice = typeof price === "string" ? parseFloat(price) : price;

  // Sort tiers by min_quantity ascending
  const sortedTiers = [...bulkDiscounts].sort(
    (a, b) => a.min_quantity - b.min_quantity
  );

  return sortedTiers.map((tier) => {
    let discountPercent = 0;
    if (tier.discount_type === "percentage") {
      discountPercent = parseFloat(tier.discount_value);
    }

    const savings = unitPrice * (discountPercent / 100);
    const pricePerUnit = unitPrice - savings;

    return {
      tier,
      savings,
      pricePerUnit,
      discountPercent,
    };
  });
}

/**
 * Check if bulk discounts are available
 * @param {BulkDiscount[]} bulkDiscounts - Discount tiers
 * @returns {boolean}
 */
export function hasBulkDiscounts(bulkDiscounts) {
  return Array.isArray(bulkDiscounts) && bulkDiscounts.length > 0;
}

export default {
  calculateBulkDiscount,
  getNextDiscountTier,
  getDiscountTiersSummary,
  hasBulkDiscounts,
};

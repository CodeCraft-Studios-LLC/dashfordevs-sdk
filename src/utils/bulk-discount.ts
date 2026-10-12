/**
 * Bulk discount calculation utilities
 */

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

/** The discount that applies at a quantity. */
export function calculateBulkDiscount(options: CalculateBulkDiscountOptions): BulkDiscountResult {
  const { price, quantity, bulkDiscounts = [] } = options;

  const unitPrice = typeof price === "string" ? parseFloat(price) : price;
  const subtotal = unitPrice * quantity;

  let discountPercentage = 0;
  let appliedTier: BulkDiscount | null = null;

  const sortedTiers = [...bulkDiscounts].sort((a, b) => b.min_quantity - a.min_quantity);

  for (const tier of sortedTiers) {
    const meetsMin = quantity >= tier.min_quantity;
    const meetsMax = tier.max_quantity === null || quantity <= tier.max_quantity;

    if (meetsMin && meetsMax) {
      if (tier.discount_type === "percentage") {
        discountPercentage = parseFloat(tier.discount_value);
      } else if (tier.discount_type === "fixed") {
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

/** The next tier above the current quantity (for upsell copy), or null. */
export function getNextDiscountTier(options: GetNextDiscountTierOptions): NextDiscountTier | null {
  const { quantity, bulkDiscounts = [] } = options;

  const sortedTiers = [...bulkDiscounts].sort((a, b) => a.min_quantity - b.min_quantity);

  for (const tier of sortedTiers) {
    if (tier.min_quantity > quantity) {
      return { tier, quantityNeeded: tier.min_quantity - quantity };
    }
  }

  return null;
}

/** Every tier with its per-unit savings at a unit price. */
export function getDiscountTiersSummary(options: GetDiscountTiersSummaryOptions): DiscountTierSummary[] {
  const { price, bulkDiscounts = [] } = options;

  const unitPrice = typeof price === "string" ? parseFloat(price) : price;

  const sortedTiers = [...bulkDiscounts].sort((a, b) => a.min_quantity - b.min_quantity);

  return sortedTiers.map((tier) => {
    let discountPercent = 0;
    if (tier.discount_type === "percentage") {
      discountPercent = parseFloat(tier.discount_value);
    }

    const savings = unitPrice * (discountPercent / 100);
    const pricePerUnit = unitPrice - savings;

    return { tier, savings, pricePerUnit, discountPercent };
  });
}

/** Whether there are any tiers. */
export function hasBulkDiscounts(bulkDiscounts?: BulkDiscount[]): boolean {
  return Array.isArray(bulkDiscounts) && bulkDiscounts.length > 0;
}

export default { calculateBulkDiscount, getNextDiscountTier, getDiscountTiersSummary, hasBulkDiscounts };

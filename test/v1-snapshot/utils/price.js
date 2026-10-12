/**
 * Price formatting utilities
 */

/**
 * Format a price value as currency string
 * @param {number|string} price - Price value
 * @param {Object} [options] - Formatting options
 * @param {string} [options.currency='USD'] - Currency code
 * @param {string} [options.locale='en-US'] - Locale for formatting
 * @param {boolean} [options.showCents=true] - Show cents even if .00
 * @returns {string}
 */
export function formatPrice(price, options = {}) {
  const {
    currency = "USD",
    locale = "en-US",
    showCents = true,
  } = options;

  const numPrice = typeof price === "string" ? parseFloat(price) : price;

  if (isNaN(numPrice)) {
    return "$0.00";
  }

  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(numPrice);

  return formatted;
}

/**
 * Format a percentage value
 * @param {number|string} value - Percentage value
 * @param {Object} [options] - Formatting options
 * @param {number} [options.decimals=0] - Decimal places
 * @param {boolean} [options.showSign=false] - Show + for positive values
 * @returns {string}
 */
export function formatPercent(value, options = {}) {
  const { decimals = 0, showSign = false } = options;

  const numValue = typeof value === "string" ? parseFloat(value) : value;

  if (isNaN(numValue)) {
    return "0%";
  }

  const sign = showSign && numValue > 0 ? "+" : "";
  return `${sign}${numValue.toFixed(decimals)}%`;
}

/**
 * Calculate percentage discount between two prices
 * @param {number|string} originalPrice - Original price
 * @param {number|string} discountedPrice - Discounted price
 * @returns {number} - Discount percentage (0-100)
 */
export function calculateDiscountPercent(originalPrice, discountedPrice) {
  const original = typeof originalPrice === "string" ? parseFloat(originalPrice) : originalPrice;
  const discounted = typeof discountedPrice === "string" ? parseFloat(discountedPrice) : discountedPrice;

  if (isNaN(original) || isNaN(discounted) || original <= 0) {
    return 0;
  }

  const discount = ((original - discounted) / original) * 100;
  return Math.round(discount);
}

/**
 * Parse price string to number
 * @param {string|number} price - Price value
 * @returns {number}
 */
export function parsePrice(price) {
  if (typeof price === "number") return price;
  if (!price) return 0;

  // Remove currency symbols and commas
  const cleaned = String(price).replace(/[^0-9.-]/g, "");
  const parsed = parseFloat(cleaned);

  return isNaN(parsed) ? 0 : parsed;
}

export default {
  formatPrice,
  formatPercent,
  calculateDiscountPercent,
  parsePrice,
};

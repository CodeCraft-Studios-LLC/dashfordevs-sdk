/**
 * Price formatting utilities
 */

export interface FormatPriceOptions {
  currency?: string;
  locale?: string;
  showCents?: boolean;
}

export interface FormatPercentOptions {
  decimals?: number;
  showSign?: boolean;
}

/** Format a price as currency ("$12.50"); "$0.00" for anything unparseable. */
export function formatPrice(price: number | string, options: FormatPriceOptions = {}): string {
  const { currency = "USD", locale = "en-US", showCents = true } = options;

  const numPrice = typeof price === "string" ? parseFloat(price) : price;

  if (isNaN(numPrice)) {
    return "$0.00";
  }

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(numPrice);
}

/** Format a percentage ("15%", "+15%"). */
export function formatPercent(value: number | string, options: FormatPercentOptions = {}): string {
  const { decimals = 0, showSign = false } = options;

  const numValue = typeof value === "string" ? parseFloat(value) : value;

  if (isNaN(numValue)) {
    return "0%";
  }

  const sign = showSign && numValue > 0 ? "+" : "";
  return `${sign}${numValue.toFixed(decimals)}%`;
}

/** Rounded percentage discount between two prices (0 when not computable). */
export function calculateDiscountPercent(originalPrice: number | string, discountedPrice: number | string): number {
  const original = typeof originalPrice === "string" ? parseFloat(originalPrice) : originalPrice;
  const discounted = typeof discountedPrice === "string" ? parseFloat(discountedPrice) : discountedPrice;

  if (isNaN(original) || isNaN(discounted) || original <= 0) {
    return 0;
  }

  return Math.round(((original - discounted) / original) * 100);
}

/** Parse "$1,234.50" -> 1234.5 (0 when unparseable). */
export function parsePrice(price: string | number): number {
  if (typeof price === "number") return price;
  if (!price) return 0;

  const cleaned = String(price).replace(/[^0-9.-]/g, "");
  const parsed = parseFloat(cleaned);

  return isNaN(parsed) ? 0 : parsed;
}

export default { formatPrice, formatPercent, calculateDiscountPercent, parsePrice };

/**
 * PHI hygiene for what leaves the browser.
 *
 * DashForDevs runs storefronts that sell prescriptions and peptides, so a
 * person plus a product is protected health information. Two rules apply to
 * everything the SDK sends on a storefront's behalf:
 *
 *  1. Payment processors never learn what was bought. Line items reach
 *     Authorize.net (through the API) as opaque references - "Item 1", an
 *     opaque id, quantity and price - never product names or descriptions.
 *  2. Analytics payloads carry only what the DFD15 de-identification door
 *     keeps: opaque ids, URL paths without query strings (id-like segments
 *     templated to `:id`), referrer domains and device class. No customer ids,
 *     page titles, click text or free-form properties.
 *
 * The PHI-shape patterns and the path templating mirror
 * services/analytics/backend/facts/deidentify.py, so a payload this module
 * lets through is one that door accepts.
 */

import type { PaymentLineItem } from "../types.js";

// ---------------------------------------------------------------------------
// PHI-shaped values (same rules as DFD15 deidentify.phi_shapes)
// ---------------------------------------------------------------------------

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const SSN = /(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/;
const PHONE = /(?<![\w])(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/;
const CARD_CANDIDATE = /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g;
const IPV4 = /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g;

function luhn(digits: string): boolean {
  let total = 0;
  const parity = digits.length % 2;
  for (let i = 0; i < digits.length; i++) {
    let v = digits.charCodeAt(i) - 48;
    if (i % 2 === parity) {
      v *= 2;
      if (v > 9) v -= 9;
    }
    total += v;
  }
  return total % 10 === 0;
}

/** Names of the PHI-shaped patterns found in a string ("email", "ssn", "card", "phone", "ip"). */
export function phiShapes(value: string): string[] {
  const found: string[] = [];
  if (typeof value !== "string" || !value) return found;
  if (EMAIL.test(value)) found.push("email");
  if (SSN.test(value)) found.push("ssn");
  for (const m of value.matchAll(CARD_CANDIDATE)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) {
      found.push("card");
      break;
    }
  }
  if (PHONE.test(value)) found.push("phone");
  for (const m of value.matchAll(IPV4)) {
    if (m[0].split(".").every((p) => Number(p) <= 255)) {
      found.push("ip");
      break;
    }
  }
  return found;
}

export const looksLikePhi = (value: unknown): boolean =>
  typeof value === "string" && phiShapes(value).length > 0;

// ---------------------------------------------------------------------------
// URL coarsening (same rules as DFD15 template_path / referrer_domain)
// ---------------------------------------------------------------------------

const ID_SEGMENTS = [
  /^[a-z]{2,10}__[A-Za-z0-9_-]+$/, // platform ids: ord__..., cus__...
  /^\d+$/,
  /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i,
  /^[0-9a-f]{8,}$/i,
];

function idLike(segment: string): boolean {
  if (ID_SEGMENTS.some((p) => p.test(segment))) return true;
  const hasDigit = /\d/.test(segment);
  const hasAlpha = /[A-Za-z]/.test(segment);
  if (segment.length >= 16 && hasDigit && hasAlpha) return true;
  const digits = (segment.match(/\d/g) || []).length;
  return segment.length >= 4 && digits * 2 >= segment.length;
}

/**
 * A URL or path -> its path only: query and fragment dropped, id-like
 * segments replaced by `:id`, a segment that carries an email/phone/etc
 * replaced by `:redacted`. `/orders/ord__abc?email=x` -> `/orders/:id`.
 */
export function templatePath(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "/";
  let path = raw.trim();
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) path = new URL(path).pathname;
  } catch {
    /* fall through to manual split */
  }
  path = path.split(/[?#]/)[0] || "/";
  const segments = path.split("/").filter(Boolean).slice(0, 12);
  const cleaned = segments.map((s) => {
    let seg = s;
    try {
      seg = decodeURIComponent(s);
    } catch {
      /* keep raw */
    }
    if (phiShapes(seg).length) return ":redacted";
    return idLike(seg) ? ":id" : seg.toLowerCase().slice(0, 48);
  });
  return ("/" + cleaned.join("/")).slice(0, 200);
}

/** Referrer -> `https://host/` (domain only), or "" for none / an IP / garbage. */
export function referrerOrigin(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "";
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (!host || /^[\d.]+$/.test(host) || host.includes(":")) return "";
    return `${u.protocol}//${host}/`;
  } catch {
    return "";
  }
}

/** Current page as origin + templated path (no query string, no fragment). */
export function safePageUrl(href: string | null | undefined): string {
  if (!href) return "";
  try {
    const u = new URL(href);
    return `${u.origin}${templatePath(u.pathname)}`;
  } catch {
    return templatePath(href);
  }
}

/** A short token (utm value, event name) or "" when it is free text or PHI-shaped. */
export function safeToken(value: unknown, max = 64): string {
  if (typeof value !== "string") return "";
  const v = value.trim();
  if (!v || v.length > max || looksLikePhi(v)) return "";
  return /^[A-Za-z0-9][A-Za-z0-9 ._:/+-]*$/.test(v) ? v : "";
}

// ---------------------------------------------------------------------------
// Third-party property scrubbing (PostHog identify/capture, etc.)
// ---------------------------------------------------------------------------

const PII_KEYS = /(^|_|\b)(e-?mail|phone|mobile|first_?name|last_?name|full_?name|name|address|street|zip|postal|dob|birth|ssn|card|cvv|password|token|ip)(\b|_|$)/i;

/**
 * Drop keys that name personal data and values shaped like PHI. Nested
 * objects are scrubbed one level deep; arrays of scalars are kept only if no
 * element is PHI-shaped.
 */
export function scrubProperties(props: unknown): Record<string, any> {
  const out: Record<string, any> = {};
  if (!props || typeof props !== "object") return out;
  for (const [key, value] of Object.entries(props as Record<string, any>)) {
    if (PII_KEYS.test(key)) continue;
    if (value == null || typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else if (typeof value === "string") {
      if (!looksLikePhi(value)) out[key] = value;
    } else if (Array.isArray(value)) {
      if (value.every((v) => v == null || typeof v !== "string" || !looksLikePhi(v)) && value.every((v) => typeof v !== "object" || v === null)) {
        out[key] = value;
      }
    } else if (typeof value === "object") {
      const inner: Record<string, any> = {};
      for (const [k2, v2] of Object.entries(value)) {
        if (PII_KEYS.test(k2)) continue;
        if (v2 == null || typeof v2 === "number" || typeof v2 === "boolean") inner[k2] = v2;
        else if (typeof v2 === "string" && !looksLikePhi(v2)) inner[k2] = v2;
      }
      out[key] = inner;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Payment processors never see products
// ---------------------------------------------------------------------------

const OPAQUE_ID = [
  /^[a-z]{2,12}__[A-Za-z0-9_-]+$/, // prod__..., size__...
  /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i,
  /^[0-9a-f]{8,}$/i,
  /^\d+$/,
];

function opaqueId(id: unknown, index: number): string {
  const s = id == null ? "" : String(id).slice(0, 31);
  if (s && OPAQUE_ID.some((p) => p.test(s))) return s;
  return String(index + 1);
}

/**
 * Line items for a payment processor: "Item N", an opaque id, quantity and
 * unit price. Names, descriptions, SKUs and any other field are removed.
 */
export function maskLineItems(items: unknown): PaymentLineItem[] {
  if (!Array.isArray(items)) return [];
  return items.map((raw, i) => {
    const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
    const out: PaymentLineItem = { id: opaqueId(item.id, i), name: `Item ${i + 1}` };
    if (item.quantity != null && item.quantity !== "") out.quantity = item.quantity;
    if (item.unit_price != null && item.unit_price !== "") out.unit_price = item.unit_price;
    return out;
  });
}

const SAFE_DESCRIPTION = /^(order|invoice)\s*#?\s*[A-Za-z0-9_-]{1,24}$/i;

/** Keep an order description only when it is just an order/invoice reference. */
export function maskPaymentDescription(description: unknown): string {
  if (typeof description !== "string") return "";
  const d = description.trim();
  return SAFE_DESCRIPTION.test(d) ? d : "";
}

const GENERIC_SHEET_LABELS = /^(subtotal|sub-total|shipping|delivery|tax|taxes|sales tax|discount|discounts|total|fee|fees|surcharge|handling|tip|credit|store credit|gift card|coupon)\b/i;

/**
 * Google Pay sheet rows: summary rows (Subtotal, Shipping, Tax, Discount...)
 * keep their labels; any other LINE_ITEM label becomes "Item N".
 */
export function maskDisplayItemLabel(label: unknown, type: string | undefined, index: number): string {
  const l = typeof label === "string" ? label.trim() : "";
  if (type === "SUBTOTAL" || type === "TAX") return l || (type === "TAX" ? "Tax" : "Subtotal");
  if (l && GENERIC_SHEET_LABELS.test(l) && l.length <= 40) return l;
  return `Item ${index + 1}`;
}

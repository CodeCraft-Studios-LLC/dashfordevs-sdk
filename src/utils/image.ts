/**
 * Image URL helpers for media on the DashForDevs CDN (cdn.dashfordevs.com).
 *
 * production returns absolute image URLs; the rebuilt services store media on
 * cdn.dashfordevs.com and may return CDN-relative paths ("/content/...").
 * These helpers make both render the same.
 */

import { CDN_BASE } from "../core/config.js";

/**
 * An absolute https URL for an image reference:
 *   "https://..."        -> unchanged
 *   "//host/path"        -> "https://host/path"
 *   "/content/x.webp"    -> "https://cdn.dashfordevs.com/content/x.webp"
 *   "content/x.webp"     -> "https://cdn.dashfordevs.com/content/x.webp"
 *   data:/blob: URLs     -> unchanged
 *   empty / null         -> ""
 */
export function cdnImageUrl(src: string | null | undefined, cdnBase: string = CDN_BASE): string {
  if (!src || typeof src !== "string") return "";
  const s = src.trim();
  if (!s) return "";
  if (/^(https?:|data:|blob:)/i.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  const base = cdnBase.replace(/\/+$/, "");
  return `${base}/${s.replace(/^\/+/, "")}`;
}

/** Whether a URL points at the DashForDevs CDN. */
export function isDashCdnUrl(src: string | null | undefined): boolean {
  if (!src) return false;
  try {
    return new URL(cdnImageUrl(src)).hostname === new URL(CDN_BASE).hostname;
  } catch {
    return false;
  }
}

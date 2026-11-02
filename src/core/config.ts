/**
 * Which DashForDevs API host the client talks to: papi, always.
 *
 *   papi  https://papi.dashfordevs.com   the DashForDevs public API
 *
 * Since 2.1 the SDK talks only to papi. Settings written for 0.1.x and 2.0
 * still work and still decide nothing else:
 *
 *   - `target: "production"` (and DASH4DEVS_TARGET=production) means papi.
 *   - a base URL on api.dashfordevs.com (the old host, as most stores have in
 *     NEXT_PUBLIC_DEVDASH_API_URL) is rewritten to papi, path kept.
 *   - a base URL on localhost / 127.0.0.1 / *.localhost is kept, for running
 *     against a papi on your own machine.
 *   - any other base URL is ignored, with a warning, and papi is used.
 *
 * In order, the first that is set is considered: `baseURL`, `apiBase`,
 * `target`, DASH4DEVS_API_URL / NEXT_PUBLIC_DASH4DEVS_API_URL,
 * DASH4DEVS_TARGET / NEXT_PUBLIC_DASH4DEVS_TARGET, then papi.
 */

import { readEnv } from "./env.js";

/** "production" is kept as a name for compatibility; it is papi. */
export type ApiTarget = "production" | "papi";

export const PAPI_BASE = "https://papi.dashfordevs.com";

export const API_TARGETS: Readonly<Record<ApiTarget, string>> = Object.freeze({
  production: PAPI_BASE,
  papi: PAPI_BASE,
});

export const DEFAULT_API_BASE = PAPI_BASE;

/** The DashForDevs image CDN. Media served by papi lives under /content/. */
export const CDN_BASE = "https://cdn.dashfordevs.com";

export interface ApiBaseOptions {
  baseURL?: string;
  apiBase?: string;
  target?: ApiTarget | string;
}

function stripSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|.+\.localhost)$/i;
const OLD_HOST = /^api\.dashfordevs\.com$/i;
const warned = new Set<string>();

/**
 * Any configured URL, as the URL the SDK will actually use: papi, or a local
 * papi. Never another host.
 */
export function toPapi(url: string): string {
  const clean = stripSlash(url.trim());
  let parsed: URL;
  try {
    parsed = new URL(clean);
  } catch {
    return PAPI_BASE;
  }
  if (LOCAL_HOST.test(parsed.hostname)) return clean;
  if (parsed.hostname.toLowerCase() === "papi.dashfordevs.com") return stripSlash(`${PAPI_BASE}${parsed.pathname}`);
  if (OLD_HOST.test(parsed.hostname)) return stripSlash(`${PAPI_BASE}${parsed.pathname}`);
  if (!warned.has(parsed.host)) {
    warned.add(parsed.host);
    try {
      console.warn(`dash4devs: ${parsed.host} is not papi; using ${PAPI_BASE}. The SDK talks only to papi.`);
    } catch {
      /* no console */
    }
  }
  return PAPI_BASE;
}

export function targetToBase(target: string): string {
  const key = String(target).trim().toLowerCase();
  if (["production", "prod", "api", "papi", "public"].includes(key)) return PAPI_BASE;
  throw new Error(`dash4devs: unknown target "${target}". The SDK talks only to papi (${PAPI_BASE}).`);
}

/**
 * Next.js inlines NEXT_PUBLIC_* only when written literally, so each public
 * name is read here explicitly. On the server these are plain env reads.
 */
function publicEnvApiUrl(): string | undefined {
  try {
    const v = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_DASH4DEVS_API_URL : undefined;
    return v && v.trim() ? v.trim() : undefined;
  } catch {
    return undefined;
  }
}

function publicEnvTarget(): string | undefined {
  try {
    const v = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_DASH4DEVS_TARGET : undefined;
    return v && v.trim() ? v.trim() : undefined;
  } catch {
    return undefined;
  }
}

/** Resolve the API base URL from options and environment (see the module comment for the order). */
export function resolveApiBase(options: ApiBaseOptions = {}): string {
  if (options.baseURL) return toPapi(options.baseURL);
  if (options.apiBase) return toPapi(options.apiBase);
  if (options.target) return targetToBase(options.target);

  const envUrl = readEnv("DASH4DEVS_API_URL") || publicEnvApiUrl();
  if (envUrl) return toPapi(envUrl);

  const envTarget = readEnv("DASH4DEVS_TARGET") || publicEnvTarget();
  if (envTarget) return targetToBase(envTarget);

  return DEFAULT_API_BASE;
}

/** "papi" for papi, "custom" for a local papi. */
export function describeApiBase(base: string): ApiTarget | "custom" {
  return stripSlash(base).startsWith(PAPI_BASE) ? "papi" : "custom";
}

/**
 * Which DashForDevs API host the client talks to.
 *
 * Two hosts serve the same public storefront API (same paths, methods, auth,
 * request and response shapes):
 *
 *   production  https://api.dashfordevs.com    the current platform (default)
 *   papi        https://papi.dashfordevs.com   the rebuilt public API
 *
 * One setting chooses between them. In order, the first that is set wins:
 *
 *   1. `baseURL` option         (v1's option; any URL, e.g. a local backend)
 *   2. `apiBase` option         (alias of baseURL)
 *   3. `target` option          ("production" | "papi")
 *   4. DASH4DEVS_API_URL / NEXT_PUBLIC_DASH4DEVS_API_URL   (env, any URL)
 *   5. DASH4DEVS_TARGET  / NEXT_PUBLIC_DASH4DEVS_TARGET    (env, "production" | "papi")
 *   6. production
 *
 * So a store that only upgrades the package keeps talking to production, and
 * moving to papi is one option or one environment variable.
 */

import { readEnv } from "./env.js";

export type ApiTarget = "production" | "papi";

export const API_TARGETS: Readonly<Record<ApiTarget, string>> = Object.freeze({
  production: "https://api.dashfordevs.com",
  papi: "https://papi.dashfordevs.com",
});

export const DEFAULT_API_BASE = API_TARGETS.production;

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

export function targetToBase(target: string): string {
  const key = String(target).trim().toLowerCase();
  if (key === "production" || key === "prod" || key === "api") return API_TARGETS.production;
  if (key === "papi" || key === "public") return API_TARGETS.papi;
  throw new Error(
    `dash4devs: unknown target "${target}". Use "production" (${API_TARGETS.production}) or "papi" (${API_TARGETS.papi}).`
  );
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
  if (options.baseURL) return stripSlash(options.baseURL);
  if (options.apiBase) return stripSlash(options.apiBase);
  if (options.target) return targetToBase(options.target);

  const envUrl = readEnv("DASH4DEVS_API_URL") || publicEnvApiUrl();
  if (envUrl) return stripSlash(envUrl);

  const envTarget = readEnv("DASH4DEVS_TARGET") || publicEnvTarget();
  if (envTarget) return targetToBase(envTarget);

  return DEFAULT_API_BASE;
}

/** "production" | "papi" for the two known hosts, "custom" for anything else. */
export function describeApiBase(base: string): ApiTarget | "custom" {
  const clean = stripSlash(base);
  if (clean === API_TARGETS.production) return "production";
  if (clean === API_TARGETS.papi) return "papi";
  return "custom";
}

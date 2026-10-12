/**
 * The one place every API call goes through (`DashClient._fetch`).
 *
 * Behaviour kept from v1, line for line:
 *   - headers: X-API-Key, Content-Type: application/json, caller headers on top;
 *     the customer's Bearer token when signed in and the caller set none;
 *     X-Session-Id / X-Visitor-Id in the browser.
 *   - caching: `cache: "no-store"` outside production builds; in production,
 *     anonymous server-side GETs go to Next's Data Cache with
 *     `next: { revalidate: DASH4DEVS_REVALIDATE || 60, tags: ["dash4devs"] }`.
 *   - errors: Error with `.status` and `.details`, message from
 *     `body.message || body.error || "API request failed"`.
 *   - a 403 `banned` sends the browser to /banned; a locked organization sends
 *     it to codecraftstudios.net.
 *
 * Added in v2:
 *   - a timeout on every request (default 15 s);
 *   - retries for GET/HEAD only (idempotent) on network errors, timeouts and
 *     408/425/429/502/503/504, with backoff and Retry-After (capped). Writes are
 *     never retried: a repeated POST could charge a card twice;
 *   - one error type (DashApiError) for HTTP, network, timeout and non-JSON
 *     responses, instead of a raw SyntaxError when a proxy answers with HTML.
 */

import { DashApiError } from "./errors.js";
import { isProductionBuild } from "./env.js";

export interface NextFetchOptions {
  revalidate?: number | false;
  tags?: string[];
}

export interface DashFetchOptions extends RequestInit {
  /** Next.js fetch extension; passing it opts the call out of the SDK's default caching. */
  next?: NextFetchOptions;
  /** Per-call timeout override in milliseconds (0 disables). */
  timeoutMs?: number;
  /** Per-call retry override (GET/HEAD only). */
  retries?: number;
}

export interface TransportSettings {
  timeoutMs: number;
  retries: number;
  fetch?: typeof fetch;
}

export interface TransportClient {
  apiKey: string;
  auth?: { _accessToken?: string | null } | null;
  insights?: { getVisitorId?: () => string } | null;
  getSessionId(): string;
  readonly _transport: TransportSettings;
}

export const DEFAULT_TIMEOUT_MS = 15000;
export const DEFAULT_RETRIES = 2;
const RETRY_STATUSES = new Set([408, 425, 429, 502, 503, 504]);
const MAX_RETRY_AFTER_MS = 5000;

export function resolveFetch(settings: TransportSettings): typeof fetch {
  // Resolved per call, not at construction, so polyfills and test mocks that
  // replace globalThis.fetch later are honoured (as v1 did).
  const impl = settings.fetch || (typeof globalThis !== "undefined" ? globalThis.fetch : undefined);
  if (typeof impl !== "function") {
    throw new DashApiError({
      message: "dash4devs: no fetch implementation available (Node 18+ or a fetch polyfill is required)",
      status: 0,
      code: "network_error",
    });
  }
  return impl;
}

function headersToObject(h: HeadersInit | undefined): Record<string, string> {
  if (!h) return {};
  if (typeof Headers !== "undefined" && h instanceof Headers) {
    const out: Record<string, string> = {};
    h.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }
  if (Array.isArray(h)) return Object.fromEntries(h);
  return { ...(h as Record<string, string>) };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function backoffMs(attempt: number): number {
  return Math.min(4000, 250 * 2 ** attempt) + Math.floor(Math.random() * 100);
}

function retryAfterMs(response: Response): number | null {
  const raw = response.headers?.get?.("retry-after");
  if (!raw) return null;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, secs * 1000));
  const date = Date.parse(raw);
  if (Number.isFinite(date)) return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, date - Date.now()));
  return null;
}

class TimeoutSignal extends Error {}

/**
 * A 503 that says `"available": false` is a decision, not an outage: papi
 * answers PHI and payment routes that way until they are switched on
 * (`not_available_yet`). Retrying it only adds latency.
 */
async function isDeliberateUnavailable(response: Response): Promise<boolean> {
  if (response.status !== 503) return false;
  try {
    const body = JSON.parse(await response.clone().text());
    return !!body && body.available === false;
  } catch {
    return false;
  }
}

/**
 * fetch with a deadline. With Next's Data Cache options set, the deadline is a
 * race rather than an AbortSignal: Next skips request memoization for fetches
 * that carry a signal, and cached catalog reads are exactly the ones worth
 * deduplicating.
 */
async function fetchWithDeadline(
  impl: typeof fetch,
  url: string,
  init: DashFetchOptions,
  timeoutMs: number
): Promise<Response> {
  if (!timeoutMs || timeoutMs <= 0) return impl(url, init as RequestInit);

  if (init.next) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new TimeoutSignal()), timeoutMs);
    });
    try {
      return await Promise.race([impl(url, init as RequestInit), deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  if (typeof AbortController === "undefined") return impl(url, init as RequestInit);
  const controller = new AbortController();
  const userSignal = init.signal || null;
  let timedOut = false;
  const onUserAbort = () => controller.abort();
  if (userSignal) {
    if (userSignal.aborted) controller.abort();
    else userSignal.addEventListener("abort", onUserAbort, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await impl(url, { ...(init as RequestInit), signal: controller.signal });
  } catch (err) {
    if (timedOut) throw new TimeoutSignal();
    throw err;
  } finally {
    clearTimeout(timer);
    if (userSignal) userSignal.removeEventListener("abort", onUserAbort);
  }
}

async function readBody(response: Response): Promise<{ data: any; parsed: boolean; empty: boolean }> {
  let text = "";
  try {
    text = await response.text();
  } catch {
    return { data: null, parsed: false, empty: true };
  }
  if (!text || !text.trim()) return { data: {}, parsed: true, empty: true };
  try {
    return { data: JSON.parse(text), parsed: true, empty: false };
  } catch {
    return { data: null, parsed: false, empty: false };
  }
}

/** The v1 `_fetch` contract, with timeouts, GET retries and one error type. */
export async function dashFetch<T = any>(
  client: TransportClient,
  url: string,
  options: DashFetchOptions = {}
): Promise<T> {
  const { timeoutMs: callTimeout, retries: callRetries, ...rest } = options;

  const headers: Record<string, string> = {
    "X-API-Key": client.apiKey,
    "Content-Type": "application/json",
    ...headersToObject(rest.headers),
  };

  // Include auth token if available (customer-specific features like discounts).
  if (client.auth && client.auth._accessToken && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${client.auth._accessToken}`;
  }

  // Session id + first-party visitor id (browser only), as in v1.
  if (typeof window !== "undefined") {
    try {
      const sessionId = client.getSessionId();
      if (sessionId) headers["X-Session-Id"] = sessionId;
    } catch {
      /* storage blocked */
    }
    try {
      const visitorId = client.insights?.getVisitorId?.();
      if (visitorId) headers["X-Visitor-Id"] = visitorId;
    } catch {
      /* ignore */
    }
  }

  const isProd = isProductionBuild();
  const fetchOptions: DashFetchOptions = { ...rest, headers };
  const method = (rest.method || "GET").toUpperCase();
  const isServerSide = typeof window === "undefined";
  if (!isProd) {
    fetchOptions.cache = "no-store";
  } else if (
    isServerSide &&
    method === "GET" &&
    !headers["Authorization"] && // never cache personalized/authed reads
    rest.cache === undefined && // respect explicit per-call cache choices
    rest.next === undefined
  ) {
    let ttl = 60;
    try {
      ttl = Number((typeof process !== "undefined" && process.env?.DASH4DEVS_REVALIDATE) || 60);
    } catch {
      ttl = 60;
    }
    fetchOptions.next = {
      revalidate: Number.isFinite(ttl) ? ttl : 60,
      tags: ["dash4devs"],
    };
  }

  const impl = resolveFetch(client._transport);
  const idempotent = method === "GET" || method === "HEAD";
  const maxRetries = idempotent ? Math.max(0, callRetries ?? client._transport.retries) : 0;
  const timeoutMs = callTimeout ?? client._transport.timeoutMs;

  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetchWithDeadline(impl, url, fetchOptions, timeoutMs);
    } catch (err: any) {
      const userAborted = !!rest.signal?.aborted;
      const timedOut = err instanceof TimeoutSignal;
      const error = new DashApiError({
        message: timedOut
          ? `Request timed out after ${timeoutMs}ms`
          : userAborted
            ? "Request aborted"
            : `Network error: ${err?.message || "fetch failed"}`,
        status: 0,
        code: timedOut ? "timeout" : userAborted ? "aborted" : "network_error",
        method,
        url,
        retryable: !userAborted,
        cause: err,
      });
      if (!userAborted && attempt < maxRetries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw error;
    }

    if (attempt < maxRetries && RETRY_STATUSES.has(response.status) && !(await isDeliberateUnavailable(response))) {
      const wait = retryAfterMs(response) ?? backoffMs(attempt);
      try {
        await response.body?.cancel?.();
      } catch {
        /* nothing to drain */
      }
      await sleep(wait);
      continue;
    }

    return handleResponse<T>(response, method, url);
  }
}

async function handleResponse<T>(response: Response, method: string, url: string): Promise<T> {
  const requestId = response.headers?.get?.("x-request-id") ?? null;
  const { data, parsed } = await readBody(response);

  if (!response.ok) {
    const body = parsed && data && typeof data === "object" ? data : {};

    // Auto-redirect to /banned on ban responses (client-side only).
    if (response.status === 403 && body.error === "banned" && typeof window !== "undefined") {
      const reason = body.reason ? `?reason=${encodeURIComponent(body.reason)}` : "";
      window.location.href = `/banned${reason}`;
    }

    throw new DashApiError({
      message:
        body.message ||
        body.error ||
        (parsed ? "API request failed" : `API request failed (HTTP ${response.status}, non-JSON response)`),
      status: response.status,
      code: typeof body.error === "string" && body.error ? body.error : parsed ? `http_${response.status}` : "invalid_response",
      details: body,
      method,
      url,
      requestId,
      retryable: RETRY_STATUSES.has(response.status) && body.available !== false,
    });
  }

  if (!parsed) {
    throw new DashApiError({
      message: `Invalid JSON in API response (HTTP ${response.status})`,
      status: response.status,
      code: "invalid_response",
      details: {},
      method,
      url,
      requestId,
    });
  }

  // Organization locked: send the storefront to codecraftstudios.net (v1 behaviour).
  if (data && data.organization?.is_locked && typeof window !== "undefined") {
    window.location.href = "https://www.codecraftstudios.net";
    return data as T;
  }

  return data as T;
}

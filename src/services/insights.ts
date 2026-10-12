/**
 * Insights - first-party web analytics (pageviews, clicks, sessions,
 * conversions) sent to the DashForDevs API, with a persistent first-party
 * visitor id carrying first-touch / last-touch attribution.
 *
 * PRIVACY (v2). By default (`analytics: "deidentified"` on the client) the
 * collector sends only what the DFD15 de-identification door keeps:
 *
 *   - opaque visitor and session ids (random, first-party);
 *   - URL paths with the query string and fragment removed and id-like
 *     segments replaced by `:id` (a URL can carry an email, an order number or
 *     a recovery token);
 *   - the referrer as a domain only;
 *   - device class and browser family (no OS version, no screen size);
 *   - event names only when they are short tokens; numeric values.
 *
 * It never sends a customer id, page titles, click text, element ids or
 * free-form event properties: on a storefront that sells prescriptions, "who"
 * plus "what they looked at" is PHI. `identify()` still links the visitor
 * locally (and returns immediately) but sends nothing.
 *
 * `analytics: "legacy"` restores v1's full payloads for stores that have
 * decided they need them; it prints a console warning once.
 *
 * Storage keys (d4d_vid, d4d_ses, d4d_attr) and the endpoint
 * (/api/storefront/analytics/collect) are unchanged from v1.
 */

import type { DashClient } from "../client.js";
import type { OrderAttribution } from "../types.js";
import { referrerOrigin, safePageUrl, safeToken, templatePath } from "../core/privacy.js";

const VISITOR_KEY = "d4d_vid";
const SESSION_KEY = "d4d_ses";
const ATTR_KEY = "d4d_attr";
const SESSION_IDLE_MS = 30 * 60 * 1000;

type Touch = Record<string, any>;

export class InsightsModule {
  client: DashClient;
  _queue: any[];
  _started: boolean;
  _customerId: string | null;
  _flushTimer: ReturnType<typeof setInterval> | null;
  _lastPath: string | null;
  _opts: { autoPageviews: boolean; autoClicks: boolean; flushIntervalMs: number };
  _visitorId?: string;
  _sessionId?: string;
  _onPageHide: () => void;

  constructor(client: DashClient) {
    this.client = client;
    this._queue = [];
    this._started = false;
    this._customerId = null;
    this._flushTimer = null;
    this._lastPath = null;
    this._opts = { autoPageviews: true, autoClicks: true, flushIntervalMs: 8000 };

    this._onClick = this._onClick.bind(this);
    this._onHide = this._onHide.bind(this);
    this._onPageHide = () => this.flush(true);
  }

  /** True unless the client opted into v1's full payloads. */
  get _deidentified(): boolean {
    return (this.client as any)?._analyticsMode !== "legacy";
  }

  // ───────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ───────────────────────────────────────────────────────────────────────

  /** Start collecting. Idempotent; no-op on the server. */
  init(options: { autoPageviews?: boolean; autoClicks?: boolean; flushIntervalMs?: number } = {}): { active: boolean } {
    if (typeof window === "undefined") return { active: false };
    if (this._started) return { active: true };
    this._opts = { ...this._opts, ...options };
    this._started = true;

    this._ensureVisitor();
    const isNewSession = this._ensureSession();
    this._resolveAttribution();

    if (isNewSession) {
      this._enqueue("session_start", {});
    }

    if (this._opts.autoPageviews) {
      this._lastPath = this._currentPath();
      this.pageview();
      this._patchHistory();
    }
    if (this._opts.autoClicks && typeof document !== "undefined") {
      document.addEventListener("click", this._onClick, true);
    }

    document.addEventListener("visibilitychange", this._onHide);
    window.addEventListener("pagehide", this._onPageHide);

    this._flushTimer = setInterval(() => this.flush(), this._opts.flushIntervalMs);
    return { active: true };
  }

  /** Stop collecting, remove listeners and flush. */
  destroy(): void {
    if (!this._started) return;
    this._started = false;
    if (this._flushTimer) clearInterval(this._flushTimer);
    if (typeof document !== "undefined") {
      document.removeEventListener("click", this._onClick, true);
      document.removeEventListener("visibilitychange", this._onHide);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("pagehide", this._onPageHide);
    }
    this.flush(true);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Capture API
  // ───────────────────────────────────────────────────────────────────────

  /** Track a pageview (automatic; call manually for SPAs if needed). */
  pageview(path?: string): void {
    if (typeof window === "undefined") return;
    const p = path || this._currentPath();
    if (this._deidentified) {
      this._enqueue("pageview", {
        path: templatePath(p),
        url: safePageUrl(window.location.href),
        referrer: referrerOrigin(document.referrer),
        title: "",
      });
      return;
    }
    this._enqueue("pageview", {
      path: p,
      url: window.location.href,
      referrer: document.referrer || "",
      title: document.title || "",
    });
  }

  /** Track a custom event. De-identified mode sends the name (if a short token) and a numeric value only. */
  track(name: string, props: Record<string, any> = {}): void {
    if (!name) return;
    const value = typeof props?.value === "number" ? props.value : undefined;
    if (this._deidentified) {
      this._enqueue("custom", {
        name: safeToken(String(name)) || "custom",
        path: templatePath(this._currentPath()),
        props: {},
        value,
      });
      return;
    }
    this._enqueue("custom", {
      name: String(name),
      path: this._currentPath(),
      props: props && typeof props === "object" ? props : {},
      value,
    });
  }

  /**
   * Associate the visitor with a customer. De-identified mode keeps the link
   * in memory only and sends nothing (the API never receives a customer id
   * from analytics).
   */
  identify(customerId: string, props: Record<string, any> = {}): void {
    if (!customerId) return;
    this._customerId = String(customerId);
    if (this._deidentified) return;
    this._enqueue("identify", { name: "identify", props });
    this.flush();
  }

  /** Clear the customer association (logout). */
  clearIdentity(): void {
    this._customerId = null;
  }

  /** Record a client-side conversion (lead, booking, signup). */
  conversion(value?: number, props: Record<string, any> = {}): void {
    if (this._deidentified) {
      this._enqueue("conversion", {
        name: safeToken(props?.name) || "conversion",
        value: typeof value === "number" ? value : undefined,
        props: {},
      });
      this.flush();
      return;
    }
    this._enqueue("conversion", {
      name: props?.name || "conversion",
      value: typeof value === "number" ? value : undefined,
      props,
    });
    this.flush();
  }

  /** SPA route-change hook; fires a pageview when the path changed. */
  notifyRouteChange(path?: string): void {
    if (typeof window === "undefined") return;
    const next = path || this._currentPath();
    if (next === this._lastPath) return;
    this._lastPath = next;
    this._resolveAttribution();
    this.pageview(next);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Accessors used by checkout / integrations
  // ───────────────────────────────────────────────────────────────────────

  getVisitorId(): string {
    this._ensureVisitor();
    return this._visitorId || "";
  }

  getSessionId(): string {
    this._ensureSession();
    return this._sessionId || "";
  }

  /** The stored { ft, lt } attribution object. */
  getAttribution(): { ft: Record<string, any>; lt: Record<string, any> } {
    return this._readAttr() || { ft: {}, lt: {} };
  }

  /** Attribution payload for checkout.complete(). */
  attributionForOrder(): OrderAttribution {
    const attr = this.getAttribution();
    return {
      visitor_id: this.getVisitorId(),
      session_id: this.getSessionId(),
      ft: attr.ft || {},
      lt: attr.lt || {},
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Identity + attribution
  // ───────────────────────────────────────────────────────────────────────

  _store(kind: "local" | "session"): Storage | null {
    try {
      if (typeof window === "undefined") return null;
      return kind === "local" ? window.localStorage : window.sessionStorage;
    } catch {
      return null;
    }
  }

  _ensureVisitor(): void {
    if (this._visitorId) return;
    let id = this._safeGet(this._store("local"), VISITOR_KEY);
    if (!id) {
      id = "v_" + this._rand();
      this._safeSet(this._store("local"), VISITOR_KEY, id);
    }
    this._visitorId = id;
  }

  /** @returns true when a new session started. */
  _ensureSession(): boolean {
    const now = Date.now();
    const raw = this._safeGet(this._store("session"), SESSION_KEY) || this._safeGet(this._store("local"), SESSION_KEY);
    let parsed: { id: string; ts: number } | null = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }

    let isNew = false;
    if (!parsed || !parsed.id || now - (parsed.ts || 0) > SESSION_IDLE_MS) {
      parsed = { id: "s_" + this._rand(), ts: now };
      isNew = true;
    } else {
      parsed.ts = now;
    }
    this._sessionId = parsed.id;
    const serialized = JSON.stringify(parsed);
    this._safeSet(this._store("local"), SESSION_KEY, serialized);
    this._safeSet(this._store("session"), SESSION_KEY, serialized);
    return isNew;
  }

  _touchSession(): void {
    if (!this._sessionId) return;
    const serialized = JSON.stringify({ id: this._sessionId, ts: Date.now() });
    this._safeSet(this._store("local"), SESSION_KEY, serialized);
    this._safeSet(this._store("session"), SESSION_KEY, serialized);
  }

  /** Fold the current touch into first-touch (set once) and last-touch (on a real new source). */
  _resolveAttribution(): void {
    if (typeof window === "undefined") return;
    const touch = this._currentTouch();
    const stored = this._readAttr() || { ft: {}, lt: {} };

    if (!stored.ft || !stored.ft.at) {
      stored.ft = touch;
    }
    if (touch.source) {
      stored.lt = touch;
    } else if (!stored.lt || !stored.lt.at) {
      stored.lt = touch;
    }
    this._writeAttr(stored);
  }

  /** { source, medium, campaign, term, content, referrer, landing, at } */
  _currentTouch(): Touch {
    const params = new URLSearchParams(window.location.search);
    const utmSource = params.get("utm_source") || "";
    const utmMedium = params.get("utm_medium") || "";
    const referrer = document.referrer || "";

    let source = utmSource;
    let medium = utmMedium;

    if (!source && referrer) {
      try {
        const refHost = new URL(referrer).hostname;
        const curHost = window.location.hostname;
        if (refHost && refHost !== curHost) {
          source = refHost.replace(/^www\./, "");
          medium = medium || "referral";
        }
      } catch {
        /* malformed referrer */
      }
    }

    if (this._deidentified) {
      return {
        source: safeToken(source),
        medium: safeToken(medium),
        campaign: safeToken(params.get("utm_campaign") || ""),
        term: safeToken(params.get("utm_term") || ""),
        content: safeToken(params.get("utm_content") || ""),
        referrer: referrerOrigin(referrer),
        landing: safePageUrl(window.location.href),
        at: new Date().toISOString(),
      };
    }

    return {
      source,
      medium,
      campaign: params.get("utm_campaign") || "",
      term: params.get("utm_term") || "",
      content: params.get("utm_content") || "",
      referrer,
      landing: window.location.href,
      at: new Date().toISOString(),
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Click capture
  // ───────────────────────────────────────────────────────────────────────

  _onClick(e: Event): void {
    try {
      const target = (e.target as any)?.closest?.(
        "a, button, [role=button], [data-track], input[type=submit], input[type=button]"
      );
      if (!target) return;

      if (target.closest("[data-no-track]")) return;

      const tag = (target.tagName || "").toLowerCase();
      const href = target.getAttribute?.("href") || "";
      const explicit = target.getAttribute?.("data-track") || "";

      let outbound = false;
      if (href && /^https?:\/\//i.test(href)) {
        try {
          outbound = new URL(href, window.location.href).hostname !== window.location.hostname;
        } catch {
          /* ignore */
        }
      }

      if (this._deidentified) {
        const safeHref = !href
          ? ""
          : outbound
            ? referrerOrigin(href)
            : /^(mailto|tel|sms):/i.test(href)
              ? ""
              : templatePath(href);
        this._enqueue("click", {
          name: safeToken(explicit) || tag,
          path: templatePath(this._currentPath()),
          el: { tag, text: "", href: safeHref, id: "", selector: tag, outbound },
        });
        if (outbound) this.flush(true);
        return;
      }

      const text = (target.innerText || target.value || target.getAttribute?.("aria-label") || "").trim().slice(0, 200);
      this._enqueue("click", {
        name: explicit || text || href || tag,
        path: this._currentPath(),
        el: { tag, text, href, id: target.id || "", selector: this._selectorFor(target), outbound },
      });

      if (outbound) this.flush(true);
    } catch {
      /* never let analytics throw into a click handler */
    }
  }

  _selectorFor(el: any): string {
    if (!el) return "";
    if (el.id) return `#${el.id}`;
    const cls =
      el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    return `${(el.tagName || "").toLowerCase()}${cls}`.slice(0, 200);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Queue + flush
  // ───────────────────────────────────────────────────────────────────────

  _enqueue(type: string, fields: Record<string, any>): void {
    if (typeof window === "undefined") return;
    this._touchSession();
    this._queue.push({ type, ts: Date.now(), session_id: this._sessionId, ...fields });
    if (this._queue.length >= 25) this.flush();
  }

  _onHide(): void {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      this.flush(true);
    }
  }

  /** Send buffered events (sendBeacon when leaving the page, else fetch keepalive). */
  flush(useBeacon = false): void {
    if (typeof window === "undefined" || this._queue.length === 0) return;

    const events = this._queue.splice(0, this._queue.length);
    const deid = this._deidentified;
    const envelope = {
      visitor_id: this.getVisitorId(),
      session_id: this.getSessionId(),
      customer_id: deid ? "" : this._customerId || "",
      attribution: this.getAttribution(),
      device: this._device(),
      events,
    };

    // sendBeacon cannot set headers, so the PUBLIC key travels as ?k= (as in v1).
    const key = encodeURIComponent(this.client.apiKey || "");
    const url = `${this.client.baseURL}/api/storefront/analytics/collect?k=${key}`;
    const payload = JSON.stringify(envelope);

    try {
      if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
        const blob = new Blob([payload], { type: "application/json" });
        const ok = navigator.sendBeacon(url, blob);
        if (ok) return;
      }
      const impl: typeof fetch =
        (this.client as any)?._transport?.fetch || (typeof globalThis !== "undefined" ? globalThis.fetch : (undefined as any));
      impl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": this.client.apiKey },
        body: payload,
        keepalive: true,
      }).catch(() => {
        this._queue.unshift(...events);
      });
    } catch {
      this._queue.unshift(...events);
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // Env helpers
  // ───────────────────────────────────────────────────────────────────────

  _currentPath(): string {
    if (typeof window === "undefined") return "";
    return window.location.pathname + window.location.search;
  }

  _patchHistory(): void {
    const fire = () => setTimeout(() => this.notifyRouteChange(), 0);
    const origPush = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);
    history.pushState = (...a: Parameters<History["pushState"]>) => {
      origPush(...a);
      fire();
    };
    history.replaceState = (...a: Parameters<History["replaceState"]>) => {
      origReplace(...a);
      fire();
    };
    window.addEventListener("popstate", fire);
  }

  _device(): Record<string, string> {
    if (typeof navigator === "undefined") return {};
    const ua = navigator.userAgent || "";
    let type = "desktop";
    if (/Mobi|Android|iPhone|iPod/i.test(ua)) type = "mobile";
    else if (/iPad|Tablet/i.test(ua)) type = "tablet";

    let browser = "other";
    if (/Edg\//.test(ua)) browser = "Edge";
    else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
    else if (/Chrome\//.test(ua)) browser = "Chrome";
    else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = "Safari";
    else if (/Firefox\//.test(ua)) browser = "Firefox";

    if (this._deidentified) return { type, browser, os: "", screen: "" };

    let os = "other";
    if (/Windows/.test(ua)) os = "Windows";
    else if (/Mac OS X/.test(ua)) os = "macOS";
    else if (/Android/.test(ua)) os = "Android";
    else if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
    else if (/Linux/.test(ua)) os = "Linux";

    const screen = typeof window !== "undefined" && window.screen ? `${window.screen.width}x${window.screen.height}` : "";
    return { type, browser, os, screen };
  }

  _rand(): string {
    try {
      const c: Crypto | undefined = (globalThis as any).crypto;
      if (c && typeof c.getRandomValues === "function") {
        const bytes = new Uint8Array(12);
        c.getRandomValues(bytes);
        return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("") + Date.now().toString(36);
      }
    } catch {
      /* fall back */
    }
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  _readAttr(): { ft: Record<string, any>; lt: Record<string, any> } | null {
    try {
      return JSON.parse(this._safeGet(this._store("local"), ATTR_KEY) || "null");
    } catch {
      return null;
    }
  }

  _writeAttr(obj: unknown): void {
    this._safeSet(this._store("local"), ATTR_KEY, JSON.stringify(obj));
  }

  _safeGet(store: Storage | null, k: string): string | null {
    try {
      return store ? store.getItem(k) : null;
    } catch {
      return null;
    }
  }

  _safeSet(store: Storage | null, k: string, v: string): void {
    try {
      if (store) store.setItem(k, v);
    } catch {
      /* private mode / disabled storage */
    }
  }
}

export default InsightsModule;

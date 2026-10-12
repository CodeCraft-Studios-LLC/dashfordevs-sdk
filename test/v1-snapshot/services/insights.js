/**
 * Insights — first-party web analytics
 *
 * A self-hosted analytics engine: pageviews, clicks, sessions, and conversions
 * captured into YOUR backend (AnalyticsEvent / Visitor), not Google Analytics,
 * PostHog, or any third party. No cookies-consent gymnastics, no ad-blocker
 * gaps, no sampling — it's your own data.
 *
 * The defining feature vs. naive UTM logging: a persistent first-party
 * `visitor_id` (localStorage) carries first-touch + last-touch attribution
 * through the whole journey. So a customer who lands on `?utm_source=google`,
 * browses, then checks out on a UTM-less /checkout page still attributes to
 * google — fixing the "everything looks like (direct)" conversion problem.
 *
 * Usage (storefront):
 *   await dash.insights.init();           // pageviews + clicks auto-tracked
 *   dash.insights.track("add_to_cart", { product_id, price });
 *   dash.insights.identify(customerId);   // after login
 *   dash.insights.notifyRouteChange();    // on SPA route change (or use autoPageviews)
 *
 * At checkout, pass attribution so the order is source-attributed:
 *   await dash.checkout.complete({ ..., analytics: dash.insights.attributionForOrder() });
 */

const VISITOR_KEY = "d4d_vid";
const SESSION_KEY = "d4d_ses";
const ATTR_KEY = "d4d_attr";
const SESSION_IDLE_MS = 30 * 60 * 1000; // 30 min inactivity → new session

export class InsightsModule {
  constructor(client) {
    this.client = client;
    this._queue = [];
    this._started = false;
    this._customerId = null;
    this._flushTimer = null;
    this._lastPath = null;
    this._opts = { autoPageviews: true, autoClicks: true, flushIntervalMs: 8000 };

    // Bound handlers so we can add/remove them.
    this._onClick = this._onClick.bind(this);
    this._onHide = this._onHide.bind(this);
    this._onPageHide = () => this.flush(true);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Start collecting. Idempotent. No-op on the server.
   * @param {{autoPageviews?: boolean, autoClicks?: boolean, flushIntervalMs?: number}} [options]
   */
  init(options = {}) {
    if (typeof window === "undefined") return { active: false };
    if (this._started) return { active: true };
    this._opts = { ...this._opts, ...options };
    this._started = true;

    // Resolve identity + attribution before the first event.
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

    // Flush on tab hide / unload — the only reliable moment to send before the
    // page goes away. visibilitychange(hidden) fires more reliably than unload.
    document.addEventListener("visibilitychange", this._onHide);
    window.addEventListener("pagehide", this._onPageHide);

    this._flushTimer = setInterval(() => this.flush(), this._opts.flushIntervalMs);
    return { active: true };
  }

  /** Stop collecting and remove listeners. */
  destroy() {
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
  // Public capture API
  // ───────────────────────────────────────────────────────────────────────

  /** Track a pageview. Called automatically; call manually for SPAs if needed. */
  pageview(path) {
    if (typeof window === "undefined") return;
    const p = path || this._currentPath();
    this._enqueue("pageview", {
      path: p,
      url: window.location.href,
      referrer: document.referrer || "",
      title: document.title || "",
    });
  }

  /** Track a custom event. */
  track(name, props = {}) {
    if (!name) return;
    this._enqueue("custom", {
      name: String(name),
      path: this._currentPath(),
      props: props && typeof props === "object" ? props : {},
      value: typeof props?.value === "number" ? props.value : undefined,
    });
  }

  /** Associate the current visitor with a known customer (e.g. after login). */
  identify(customerId, props = {}) {
    if (!customerId) return;
    this._customerId = String(customerId);
    this._enqueue("identify", { name: "identify", props });
    this.flush(); // identity is worth sending promptly
  }

  /** Clear the customer association (e.g. on logout). */
  clearIdentity() {
    this._customerId = null;
  }

  /**
   * Record a client-side conversion. Usually unnecessary — the backend records
   * conversions automatically at checkout — but useful for non-order goals
   * (lead form, booking, signup).
   */
  conversion(value, props = {}) {
    this._enqueue("conversion", {
      name: props?.name || "conversion",
      value: typeof value === "number" ? value : undefined,
      props,
    });
    this.flush();
  }

  /** SPA route-change hook. Fires a pageview if the path actually changed. */
  notifyRouteChange(path) {
    if (typeof window === "undefined") return;
    const next = path || this._currentPath();
    if (next === this._lastPath) return;
    this._lastPath = next;
    // A new touch may have appeared in the URL (e.g. internal ?utm campaign).
    this._resolveAttribution();
    this.pageview(next);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Accessors used by checkout / external integrations
  // ───────────────────────────────────────────────────────────────────────

  getVisitorId() {
    this._ensureVisitor();
    return this._visitorId || "";
  }

  getSessionId() {
    this._ensureSession();
    return this._sessionId || "";
  }

  /** The stored { ft, lt } attribution object. */
  getAttribution() {
    return this._readAttr() || { ft: {}, lt: {} };
  }

  /**
   * Compact attribution payload to hand to checkout.complete() so the order is
   * snapshotted with its source. Shape matches the backend's `analytics` arg.
   */
  attributionForOrder() {
    const attr = this.getAttribution();
    return {
      visitor_id: this.getVisitorId(),
      session_id: this.getSessionId(),
      ft: attr.ft || {},
      lt: attr.lt || {},
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Internals: identity + attribution
  // ───────────────────────────────────────────────────────────────────────

  _ensureVisitor() {
    if (this._visitorId) return;
    let id = this._safeGet(localStorage, VISITOR_KEY);
    if (!id) {
      id = "v_" + this._rand();
      this._safeSet(localStorage, VISITOR_KEY, id);
    }
    this._visitorId = id;
  }

  /** @returns {boolean} true if a NEW session was started. */
  _ensureSession() {
    const now = Date.now();
    let raw = this._safeGet(sessionStorage, SESSION_KEY) || this._safeGet(localStorage, SESSION_KEY);
    let parsed = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }

    let isNew = false;
    if (!parsed || !parsed.id || now - (parsed.ts || 0) > SESSION_IDLE_MS) {
      parsed = { id: "s_" + this._rand(), ts: now };
      isNew = true;
    } else {
      parsed.ts = now;
    }
    this._sessionId = parsed.id;
    const serialized = JSON.stringify(parsed);
    // localStorage so the idle window survives a full reload; sessionStorage as
    // a fast per-tab cache.
    this._safeSet(localStorage, SESSION_KEY, serialized);
    this._safeSet(sessionStorage, SESSION_KEY, serialized);
    return isNew;
  }

  _touchSession() {
    // Keep the session alive on activity without minting a new id.
    if (!this._sessionId) return;
    const serialized = JSON.stringify({ id: this._sessionId, ts: Date.now() });
    this._safeSet(localStorage, SESSION_KEY, serialized);
    this._safeSet(sessionStorage, SESSION_KEY, serialized);
  }

  /**
   * Compute the current touch from URL UTMs / referrer and fold it into stored
   * first-touch (set once) + last-touch (rolling, only on a real new touch).
   */
  _resolveAttribution() {
    if (typeof window === "undefined") return;
    const touch = this._currentTouch();
    const stored = this._readAttr() || { ft: {}, lt: {} };

    // First-touch: set once, never overwrite.
    if (!stored.ft || !stored.ft.at) {
      stored.ft = touch;
    }
    // Last-touch: update only when this load carries a real source signal
    // (UTM present, or an external referrer). Internal navigations keep the
    // existing last-touch so attribution doesn't decay to (direct).
    if (touch.source) {
      stored.lt = touch;
    } else if (!stored.lt || !stored.lt.at) {
      stored.lt = touch;
    }
    this._writeAttr(stored);
  }

  /** Derive { source, medium, campaign, term, content, referrer, landing, at }. */
  _currentTouch() {
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
        /* malformed referrer — ignore */
      }
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
  // Internals: click capture
  // ───────────────────────────────────────────────────────────────────────

  _onClick(e) {
    try {
      const target = e.target?.closest?.(
        "a, button, [role=button], [data-track], input[type=submit], input[type=button]"
      );
      if (!target) return;

      // Respect opt-out.
      if (target.closest("[data-no-track]")) return;

      const tag = (target.tagName || "").toLowerCase();
      const href = target.getAttribute?.("href") || "";
      const explicit = target.getAttribute?.("data-track") || "";
      const text = (target.innerText || target.value || target.getAttribute?.("aria-label") || "")
        .trim()
        .slice(0, 200);

      let outbound = false;
      if (href && /^https?:\/\//i.test(href)) {
        try {
          outbound = new URL(href, window.location.href).hostname !== window.location.hostname;
        } catch { /* ignore */ }
      }

      this._enqueue("click", {
        name: explicit || text || href || tag,
        path: this._currentPath(),
        el: {
          tag,
          text,
          href,
          id: target.id || "",
          selector: this._selectorFor(target),
          outbound,
        },
      });

      // Outbound clicks often navigate away immediately — flush now so the
      // event isn't lost when the page unloads.
      if (outbound) this.flush(true);
    } catch {
      /* never let analytics throw into a click handler */
    }
  }

  _selectorFor(el) {
    if (!el) return "";
    if (el.id) return `#${el.id}`;
    const cls = (el.className && typeof el.className === "string")
      ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
      : "";
    return `${(el.tagName || "").toLowerCase()}${cls}`.slice(0, 200);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Internals: queue + flush
  // ───────────────────────────────────────────────────────────────────────

  _enqueue(type, fields) {
    if (typeof window === "undefined") return;
    this._touchSession();
    this._queue.push({ type, ts: Date.now(), session_id: this._sessionId, ...fields });
    // Backpressure: flush early if the buffer grows large.
    if (this._queue.length >= 25) this.flush();
  }

  _onHide() {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      this.flush(true);
    }
  }

  /**
   * Send buffered events. Uses navigator.sendBeacon when leaving the page
   * (survives unload) and falls back to fetch with keepalive.
   * @param {boolean} [useBeacon=false]
   */
  flush(useBeacon = false) {
    if (typeof window === "undefined" || this._queue.length === 0) return;

    const events = this._queue.splice(0, this._queue.length);
    const envelope = {
      visitor_id: this.getVisitorId(),
      session_id: this.getSessionId(),
      customer_id: this._customerId || "",
      attribution: this.getAttribution(),
      device: this._device(),
      events,
    };

    const key = encodeURIComponent(this.client.apiKey || "");
    const url = `${this.client.baseURL}/api/storefront/analytics/collect?k=${key}`;
    const payload = JSON.stringify(envelope);

    try {
      if (useBeacon && navigator.sendBeacon) {
        const blob = new Blob([payload], { type: "application/json" });
        const ok = navigator.sendBeacon(url, blob);
        if (ok) return;
        // sendBeacon can fail (payload too large) — fall through to fetch.
      }
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": this.client.apiKey },
        body: payload,
        keepalive: true,
      }).catch(() => {
        // Re-buffer on network failure so the next flush retries.
        this._queue.unshift(...events);
      });
    } catch {
      this._queue.unshift(...events);
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // Internals: env helpers
  // ───────────────────────────────────────────────────────────────────────

  _currentPath() {
    if (typeof window === "undefined") return "";
    return window.location.pathname + window.location.search;
  }

  _patchHistory() {
    const fire = () => setTimeout(() => this.notifyRouteChange(), 0);
    const origPush = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);
    history.pushState = (...a) => { origPush(...a); fire(); };
    history.replaceState = (...a) => { origReplace(...a); fire(); };
    window.addEventListener("popstate", fire);
  }

  _device() {
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

    let os = "other";
    if (/Windows/.test(ua)) os = "Windows";
    else if (/Mac OS X/.test(ua)) os = "macOS";
    else if (/Android/.test(ua)) os = "Android";
    else if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
    else if (/Linux/.test(ua)) os = "Linux";

    const screen = (typeof window !== "undefined" && window.screen)
      ? `${window.screen.width}x${window.screen.height}`
      : "";
    return { type, browser, os, screen };
  }

  _rand() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  _readAttr() {
    try { return JSON.parse(this._safeGet(localStorage, ATTR_KEY) || "null"); } catch { return null; }
  }
  _writeAttr(obj) {
    this._safeSet(localStorage, ATTR_KEY, JSON.stringify(obj));
  }
  _safeGet(store, k) {
    try { return store.getItem(k); } catch { return null; }
  }
  _safeSet(store, k, v) {
    try { store.setItem(k, v); } catch { /* private mode / disabled storage */ }
  }
}

export default InsightsModule;

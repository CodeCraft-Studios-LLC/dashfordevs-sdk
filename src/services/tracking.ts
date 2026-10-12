/**
 * Tracking Module
 *
 * Third-party analytics the store configured in the dashboard (PostHog,
 * ThoughtMetric), Meta Pixel helpers, UTM visit tracking and custom tracking
 * actions that double as workflow triggers.
 *
 * v2 privacy changes (no API change):
 *   - PostHog session recordings mask every input and never record network
 *     request/response bodies or headers. v1 recorded API bodies (customer
 *     profile, orders) and headers (Bearer tokens, the API key) to PostHog.
 *   - In the default de-identified analytics mode, identify()/capture()/
 *     setUserProperties() strip person fields (email, name, phone, address...)
 *     and PHI-shaped values before handing properties to PostHog, and
 *     trackVisit() sends the landing path without its query string, the
 *     referrer as a domain and never a customer id.
 *
 * Storefronts patch `dash.tracking._log` and read `_debugLogs`; both stay.
 */

import type { DashClient } from "../client.js";
import { referrerOrigin, safePageUrl, safeToken, scrubProperties } from "../core/privacy.js";

export class TrackingModule {
  client: DashClient;
  _initialized: boolean;
  _provider: string | null;
  _engine: any;
  _thoughtmetric: any;
  _debugOverlay: HTMLElement | null;
  _debugLogs: Array<{ time: string; message: string; level: string }>;
  _eventCount: number;
  _customerId: string | null;
  _autoPageviewsEnabled: boolean;
  _lastTrackedPath: string | null;
  _actionDefCache: Map<string, any>;
  actions: {
    create: (name: string, options?: { include?: object | null; description?: string }) => Promise<{ tracking: any; created: boolean }>;
    emit: (
      name: string,
      data?: Record<string, any>,
      meta?: { customer_id?: string; user_id?: string; session_id?: string; contains_phi?: boolean }
    ) => Promise<{ recorded: boolean; trigger_fired: boolean }>;
  };

  constructor(client: DashClient) {
    this.client = client;
    this._initialized = false;
    this._provider = null;
    this._engine = null;
    this._thoughtmetric = null;
    this._debugOverlay = null;
    this._debugLogs = [];
    this._eventCount = 0;
    this._customerId = null;
    this._autoPageviewsEnabled = false;
    this._lastTrackedPath = null;

    // Custom tracking actions (in-house events that also fire workflow
    // triggers). These go to the store's own API in the request body; a
    // workflow may need the customer, so `customer_id` is kept here.
    this._actionDefCache = new Map();
    this.actions = {
      create: async (name, options = {}) => {
        if (!name || typeof name !== "string") {
          throw new Error("tracking.actions.create: name (string) is required");
        }
        const url = `${this.client.baseURL}/api/storefront/analytics/tracking/actions/create`;
        const res: any = await this.client._fetch(url, {
          method: "POST",
          body: JSON.stringify({
            name,
            include: options.include ?? null,
            description: options.description ?? "",
          }),
        });
        this._actionDefCache.set(name, res?.tracking ?? null);
        return res;
      },

      emit: async (name, data = {}, meta = {}) => {
        if (!name || typeof name !== "string") {
          throw new Error("tracking.actions.emit: name (string) is required");
        }
        const url = `${this.client.baseURL}/api/storefront/analytics/tracking/events`;
        return this.client._fetch(url, {
          method: "POST",
          body: JSON.stringify({
            name,
            data: data || {},
            customer_id: meta.customer_id || this._customerId || "",
            user_id: meta.user_id || "",
            session_id: meta.session_id || "",
            contains_phi: !!meta.contains_phi,
          }),
        });
      },
    };
  }

  get _deidentified(): boolean {
    return (this.client as any)?._analyticsMode !== "legacy";
  }

  _props(properties: Record<string, any>): Record<string, any> {
    return this._deidentified ? scrubProperties(properties) : properties;
  }

  /** Fetch the org's tracking config and start its providers (browser only). */
  async init(): Promise<{ active: boolean }> {
    if (this._initialized) {
      return { active: !!this._provider };
    }

    if (typeof window === "undefined") {
      this._initialized = true;
      return { active: false };
    }

    try {
      this._log("Fetching tracking config...");
      const url = `${this.client.baseURL}/api/storefront/analytics/config`;
      const data: any = await this.client._fetch(url, { method: "GET" });

      if (!data.active || !data.provider) {
        this._log("No active tracking provider found", "warn");
        this._initialized = true;
        return { active: false };
      }

      this._provider = data.provider.slug;
      this._log(`Provider: ${data.provider.name}`);

      const providers = data.providers || [{ slug: data.provider.slug, name: data.provider.name, config: data.config }];

      for (const p of providers) {
        if (p.slug === "posthog") {
          await this._initEngine(p.config?.api_key, p.config?.host);
        } else if (p.slug === "thoughtmetric") {
          await this._initThoughtMetric(p.config?.project_id);
        }
      }

      this._initialized = true;
      return { active: true };
    } catch (err: any) {
      this._log(`Init failed: ${err.message}`, "error");
      this._initialized = true;
      return { active: false };
    }
  }

  /** Capture a custom event (also mirrored into first-party insights). */
  capture(eventName: string, properties: Record<string, any> = {}): void {
    if (this._engine) {
      this._engine.capture(eventName, this._props(properties));
      this._eventCount++;
      this._log(`Event: ${eventName}`);
      this._updateOverlay();
    }
    try {
      this.client.insights?.track(eventName, properties);
    } catch {
      /* ignore */
    }
  }

  /** Identify a user for the third-party provider (person fields stripped in de-identified mode). */
  identify(userId: string, properties: Record<string, any> = {}): void {
    if (this._engine) {
      this._engine.identify(userId, this._props(properties));
      this._log("Identified user");
      this._updateOverlay();
    }
    try {
      this.client.insights?.identify(userId, properties);
    } catch {
      /* ignore */
    }
  }

  /** Reset identity (logout). */
  reset(): void {
    if (this._engine) {
      this._engine.reset();
      this._log("Identity reset");
      this._updateOverlay();
    }
    this._customerId = null;
  }

  /** Remember the signed-in customer (used by actions.emit; never sent with visits in de-identified mode). */
  setCustomer(customerId: string | null): void {
    this._customerId = customerId || null;
    if (customerId) {
      this._log("Customer set");
    }
  }

  clearCustomer(): void {
    this._customerId = null;
    this._log("Customer cleared");
  }

  /** Pageview + visit tracking on every SPA navigation (patches history). */
  enableAutoPageviews(): void {
    if (typeof window === "undefined" || this._autoPageviewsEnabled) return;
    this._autoPageviewsEnabled = true;
    this._lastTrackedPath = window.location.pathname + window.location.search;

    const onRouteChange = () => {
      const currentPath = window.location.pathname + window.location.search;
      if (currentPath === this._lastTrackedPath) return;
      this._lastTrackedPath = currentPath;
      this.pageview();
      this.trackVisit();
    };

    const origPush = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);

    history.pushState = (...args: Parameters<History["pushState"]>) => {
      origPush(...args);
      setTimeout(onRouteChange, 0);
    };
    history.replaceState = (...args: Parameters<History["replaceState"]>) => {
      origReplace(...args);
      setTimeout(onRouteChange, 0);
    };

    window.addEventListener("popstate", () => {
      setTimeout(onRouteChange, 0);
    });

    this._log("Auto-pageviews enabled");
  }

  /** Route-change hook for Next.js / SPA routers. */
  notifyRouteChange(pathname?: string): void {
    if (typeof window === "undefined") return;
    const currentPath = pathname || window.location.pathname + window.location.search;
    if (currentPath === this._lastTrackedPath) return;
    this._lastTrackedPath = currentPath;
    this.pageview(currentPath);
    this.trackVisit();
    this.fbqPageView();
  }

  setUserProperties(properties: Record<string, any>): void {
    if (this._engine) {
      const props = this._props(properties);
      this._engine.setPersonProperties(props);
      this._log(`Set user props: ${Object.keys(props).join(", ")}`);
    }
  }

  /** PostHog pageview (path without query string in de-identified mode). */
  pageview(path?: string): void {
    if (this._engine) {
      if (path) {
        this._engine.capture("$pageview", {
          $current_url: this._deidentified && typeof window !== "undefined" ? safePageUrl(new URL(path, window.location.href).href) : path,
        });
      } else {
        this._engine.capture("$pageview");
      }
      this._eventCount++;
      this._log(`Pageview: ${path || (typeof window !== "undefined" ? window.location.pathname : "")}`);
      this._updateOverlay();
    }
  }

  getSessionId(): string {
    return this._engine?.get_session_id?.() || "";
  }

  /**
   * Record a storefront visit with its UTM parameters.
   * De-identified mode: landing path without query, referrer domain, UTM
   * values only when they are short tokens, and no customer id.
   */
  async trackVisit(options: { customer_id?: string; session_id?: string } = {}): Promise<{ success: boolean }> {
    if (typeof window === "undefined") return { success: false };

    try {
      const params = new URLSearchParams(window.location.search);
      const sessionId = options.session_id || this._engine?.get_session_id?.() || "";
      const deid = this._deidentified;
      const customerId = deid ? "" : options.customer_id || this._customerId || "";
      const tok = (v: string | null) => (deid ? safeToken(v || "", 128) : v || "");

      const body = {
        utm_source: tok(params.get("utm_source")),
        utm_medium: tok(params.get("utm_medium")),
        utm_campaign: tok(params.get("utm_campaign")),
        utm_term: tok(params.get("utm_term")),
        utm_content: tok(params.get("utm_content")),
        landing_page: deid ? safePageUrl(window.location.href) : window.location.href,
        referrer: deid ? referrerOrigin(document.referrer) : document.referrer || "",
        session_id: sessionId,
        customer_id: customerId,
      };

      const url = `${this.client.baseURL}/api/storefront/analytics/track-visit`;
      const data: any = await this.client._fetch(url, {
        method: "POST",
        body: JSON.stringify(body),
      });

      this._log(`Visit tracked: ${window.location.pathname}`);
      return data;
    } catch (err: any) {
      this._log(`trackVisit failed: ${err.message}`, "error");
      return { success: false };
    }
  }

  optIn(): void {
    if (this._engine) {
      this._engine.opt_in_capturing();
      this._log("Opted in");
    }
  }

  optOut(): void {
    if (this._engine) {
      this._engine.opt_out_capturing();
      this._log("Opted out");
    }
  }

  isFeatureEnabled(flagKey: string): boolean | string | undefined {
    if (this._engine) {
      return this._engine.isFeatureEnabled(flagKey);
    }
    return undefined;
  }

  /** Show (or hide with false) the debug overlay. */
  debug(show = true): void {
    if (typeof window === "undefined") return;

    if (!show) {
      this._destroyOverlay();
      return;
    }

    if (this._debugOverlay) {
      this._updateOverlay();
      return;
    }

    this._createOverlay();
    this._updateOverlay();
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  _log(message: string, level = "info"): void {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false });
    const entry = { time, message, level };
    this._debugLogs.push(entry);
    if (this._debugLogs.length > 50) this._debugLogs.shift();

    const key = this.client?.apiKey || "";
    const isLive = key.startsWith("pk_live") || key.startsWith("sk_live");
    if (!isLive) {
      const prefix = "[Tracking]";
      if (level === "error") console.error(prefix, message);
      else if (level === "warn") console.warn(prefix, message);
      else console.log(prefix, message);
    }

    this._updateOverlay();
  }

  // ThoughtMetric ------------------------------------------------------------

  tmEvent(eventName: string, properties: Record<string, any> = {}): void {
    if (typeof window !== "undefined" && typeof (window as any).thoughtmetric === "function") {
      (window as any).thoughtmetric("event", eventName, properties);
      this._log(`TM Event: ${eventName}`);
    }
  }

  tmIdentify(customerId: string, properties: Record<string, any> = {}): void {
    if (typeof window !== "undefined" && typeof (window as any).thoughtmetric === "function") {
      (window as any).thoughtmetric("identify", customerId, properties);
      this._log("TM Identify");
    }
  }

  tmPurchase(order: {
    transaction_id: string;
    total_price: number;
    currency?: string;
    subtotal_price?: number;
    total_tax?: number;
    total_shipping?: number;
    total_discounts?: number;
    discount_codes?: string[];
    items?: any[];
  }): void {
    this.tmEvent("order", {
      transaction_id: order.transaction_id,
      total_price: order.total_price,
      currency: order.currency || "USD",
      orderCurrency: order.currency || "USD",
      subtotal_price: order.subtotal_price,
      total_tax: order.total_tax,
      total_shipping: order.total_shipping,
      total_discounts: order.total_discounts || 0,
      discount_codes: order.discount_codes || [],
      items: order.items || [],
    });
  }

  // Meta Pixel ---------------------------------------------------------------

  fbqEvent(eventName: string, params: Record<string, any> = {}, options?: Record<string, any>): void {
    if (typeof window === "undefined" || typeof (window as any).fbq !== "function") return;
    try {
      if (options) (window as any).fbq("track", eventName, params, options);
      else (window as any).fbq("track", eventName, params);
      this._log(`fbq Event: ${eventName}`);
    } catch (err: any) {
      this._log(`fbq ${eventName} failed: ${err.message}`, "error");
    }
  }

  fbqCustom(eventName: string, params: Record<string, any> = {}, options?: Record<string, any>): void {
    if (typeof window === "undefined" || typeof (window as any).fbq !== "function") return;
    try {
      if (options) (window as any).fbq("trackCustom", eventName, params, options);
      else (window as any).fbq("trackCustom", eventName, params);
      this._log(`fbq Custom: ${eventName}`);
    } catch (err: any) {
      this._log(`fbq custom ${eventName} failed: ${err.message}`, "error");
    }
  }

  fbqPageView(): void {
    this.fbqEvent("PageView");
  }
  fbqViewContent(params: Record<string, any> = {}): void {
    this.fbqEvent("ViewContent", params);
  }
  fbqAddToCart(params: Record<string, any> = {}): void {
    this.fbqEvent("AddToCart", params);
  }
  fbqAddToWishlist(params: Record<string, any> = {}): void {
    this.fbqEvent("AddToWishlist", params);
  }
  fbqInitiateCheckout(params: Record<string, any> = {}): void {
    this.fbqEvent("InitiateCheckout", params);
  }
  fbqAddPaymentInfo(params: Record<string, any> = {}): void {
    this.fbqEvent("AddPaymentInfo", params);
  }
  fbqPurchase(params: Record<string, any> = {}): void {
    this.fbqEvent("Purchase", params);
  }
  fbqSearch(params: Record<string, any> = {}): void {
    this.fbqEvent("Search", params);
  }
  fbqLead(params: Record<string, any> = {}): void {
    this.fbqEvent("Lead", params);
  }
  fbqContact(params: Record<string, any> = {}): void {
    this.fbqEvent("Contact", params);
  }
  fbqCompleteRegistration(params: Record<string, any> = {}): void {
    this.fbqEvent("CompleteRegistration", params);
  }
  fbqSubscribe(params: Record<string, any> = {}): void {
    this.fbqEvent("Subscribe", params);
  }

  async _initThoughtMetric(projectId: string): Promise<void> {
    if (!projectId || typeof window === "undefined") return;

    try {
      this._log("Initializing ThoughtMetric...");
      const script = document.createElement("script");
      script.async = true;
      script.src = `https://app.thoughtmetric.io/pixel/${encodeURIComponent(projectId)}.js`;
      script.onload = () => {
        this._thoughtmetric = true;
        this._log("ThoughtMetric pixel loaded");
      };
      script.onerror = () => {
        this._log("ThoughtMetric pixel failed to load", "warn");
      };
      document.head.appendChild(script);
    } catch (err: any) {
      this._log(`ThoughtMetric init failed: ${err.message}`, "error");
    }
  }

  /**
   * PostHog. `posthog-js` is an optional peer: imported lazily, only in the
   * browser, only when the store configured PostHog.
   */
  async _initEngine(apiKey: string, host?: string): Promise<void> {
    if (!apiKey || typeof window === "undefined") return;

    try {
      this._log(`Connecting to ${host || "https://us.i.posthog.com"}...`);
      // Literal specifier on purpose: the store's bundler must see it to
      // include posthog-js (same as v1).
      // @ts-ignore - optional peer, not installed when building the SDK
      const mod: any = await import("posthog-js");
      const engine = mod.default || mod;

      engine.init(apiKey, {
        api_host: host || "https://us.i.posthog.com",
        defaults: "2025-11-30",
        capture_pageview: false,
        capture_pageleave: true,
        autocapture: true,
        session_recording: {
          recordCrossOriginIframes: true,
          // Every input is masked: typed values are personal data.
          maskAllInputs: true,
          maskTextSelector: ".ph-no-capture, [data-ph-no-capture]",
          maskInputOptions: { password: true },
          // Never ship API traffic to a third party: bodies carry customer
          // profiles and orders, headers carry tokens and the API key.
          networkPayloadCapture: { recordHeaders: false, recordBody: false },
        },
        enable_recording_console_log: false,
        loaded: (ph: any) => {
          this._log("Engine loaded");
          const recording = ph.sessionRecordingStarted?.();
          this._log(`Recording: ${recording ? "active" : "inactive"}`, recording ? "info" : "warn");
          this._updateOverlay();
        },
      });

      this._engine = engine;
    } catch (err: any) {
      this._log(`Engine init failed: ${err.message}`, "error");
    }
  }

  _createOverlay(): void {
    if (typeof document === "undefined") return;

    const overlay = document.createElement("div");
    overlay.id = "dash-tracking-debug";
    overlay.style.cssText =
      "position:fixed;bottom:12px;right:12px;width:360px;max-height:420px;background:#111;color:#e5e5e5;" +
      "border:1px solid #333;border-radius:8px;font-family:ui-monospace,SFMono-Regular,'SF Mono',Menlo,monospace;" +
      "font-size:11px;z-index:99999;box-shadow:0 8px 32px rgba(0,0,0,0.4);display:flex;flex-direction:column;overflow:hidden;";

    const header = document.createElement("div");
    header.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#1a1a1a;border-bottom:1px solid #333;cursor:default;";
    const title = document.createElement("span");
    title.innerHTML = `<span style="font-weight:600;color:#22c55e;">&#9679;</span>&nbsp;&nbsp;<span style="font-weight:600;">Tracking Debug</span>`;
    header.appendChild(title);

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    closeBtn.style.cssText = "background:none;border:none;color:#888;font-size:16px;cursor:pointer;padding:0 4px;line-height:1;";
    closeBtn.onclick = () => this._destroyOverlay();
    header.appendChild(closeBtn);
    overlay.appendChild(header);

    const stats = document.createElement("div");
    stats.id = "dash-tracking-stats";
    stats.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#222;border-bottom:1px solid #333;";
    overlay.appendChild(stats);

    const logArea = document.createElement("div");
    logArea.id = "dash-tracking-logs";
    logArea.style.cssText = "flex:1;overflow-y:auto;padding:6px 0;max-height:240px;";
    overlay.appendChild(logArea);

    document.body.appendChild(overlay);
    this._debugOverlay = overlay;
  }

  _updateOverlay(): void {
    if (!this._debugOverlay || typeof document === "undefined") return;

    const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    const engine = this._engine;
    const sessionId: string = engine ? engine.get_session_id?.() || "—" : "—";
    const distinctId: string = engine ? engine.get_distinct_id?.() || "anonymous" : "—";
    const recording = engine ? (engine.sessionRecordingStarted?.() ? "Active" : "Inactive") : "—";
    const status = this._initialized ? (engine ? "Connected" : "No provider") : "Initializing";

    const statsEl = this._debugOverlay.querySelector("#dash-tracking-stats");
    if (statsEl) {
      const statStyle = "padding:6px 10px;background:#1a1a1a;";
      const labelStyle = "color:#888;font-size:10px;display:block;margin-bottom:2px;";
      const valueStyle = "color:#e5e5e5;font-weight:500;word-break:break-all;";
      statsEl.innerHTML = `
        <div style="${statStyle}"><span style="${labelStyle}">Status</span><span style="${valueStyle};color:${engine ? "#22c55e" : "#eab308"}">${esc(status)}</span></div>
        <div style="${statStyle}"><span style="${labelStyle}">Recording</span><span style="${valueStyle};color:${recording === "Active" ? "#22c55e" : "#ef4444"}">${esc(recording)}</span></div>
        <div style="${statStyle}"><span style="${labelStyle}">Session</span><span style="${valueStyle};font-size:10px;">${esc(sessionId.slice(0, 20))}${sessionId.length > 20 ? "..." : ""}</span></div>
        <div style="${statStyle}"><span style="${labelStyle}">User</span><span style="${valueStyle};font-size:10px;">${esc(distinctId.slice(0, 20))}${distinctId.length > 20 ? "..." : ""}</span></div>
        <div style="${statStyle}"><span style="${labelStyle}">Events</span><span style="${valueStyle}">${this._eventCount}</span></div>
        <div style="${statStyle}"><span style="${labelStyle}">Page</span><span style="${valueStyle};font-size:10px;">${esc(typeof window !== "undefined" ? window.location.pathname : "—")}</span></div>
      `;
    }

    const logArea = this._debugOverlay.querySelector("#dash-tracking-logs") as HTMLElement | null;
    if (logArea) {
      const colors: Record<string, string> = { info: "#a3a3a3", warn: "#eab308", error: "#ef4444" };
      logArea.innerHTML = this._debugLogs
        .slice(-30)
        .map(
          (entry) =>
            `<div style="padding:2px 10px;color:${colors[entry.level] || colors.info};border-bottom:1px solid #1a1a1a;"><span style="color:#555;margin-right:6px;">${esc(entry.time)}</span>${esc(entry.message)}</div>`
        )
        .join("");
      logArea.scrollTop = logArea.scrollHeight;
    }
  }

  _destroyOverlay(): void {
    if (this._debugOverlay) {
      this._debugOverlay.remove();
      this._debugOverlay = null;
    }
  }
}

export default TrackingModule;

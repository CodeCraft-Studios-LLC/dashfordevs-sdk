/**
 * Tracking Module
 *
 * Provides built-in site tracking via the platform API.
 * Automatically configures product analytics, session replay,
 * error tracking, and web analytics.
 *
 * Usage:
 *   await dash.tracking.init();
 *   dash.tracking.capture('added_to_cart', { product: 'Shoes', price: 49.99 });
 *   dash.tracking.identify('user_123', { email: 'john@example.com' });
 *   dash.tracking.debug();  // Show debug overlay
 */

export class TrackingModule {
  constructor(client) {
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

    // Custom tracking actions (in-house, HIPAA-friendly analytics that
    // doubles as a workflow trigger). Definitions are per-org — a name
    // registered against org A is invisible to org B.
    //
    // Usage:
    //   await dash.tracking.actions.create("product.view", {
    //     include: { product: "Product" },
    //     description: "Fires when a product detail page is viewed",
    //   });
    //   await dash.tracking.actions.emit("product.view", { product: {...} });
    //
    // emit() records the event AND fires any workflows bound to this name.
    this._actionDefCache = new Map();
    this.actions = {
      /**
       * Idempotent. Registers (or updates) a custom tracking definition.
       * Safe to call on every page load — the backend get-or-creates.
       *
       * @param {string} name e.g. "product.view"
       * @param {{ include?: object, description?: string }} [options]
       * @returns {Promise<{ tracking: object, created: boolean }>}
       */
      create: async (name, options = {}) => {
        if (!name || typeof name !== "string") {
          throw new Error("tracking.actions.create: name (string) is required");
        }
        const url = `${this.client.baseURL}/api/storefront/analytics/tracking/actions/create`;
        const res = await this.client._fetch(url, {
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

      /**
       * Emit a single event. Records it in the events table AND fires the
       * automation trigger named `name` for this org's active workflows.
       *
       * @param {string} name
       * @param {object} [data]
       * @param {{ customer_id?: string, user_id?: string, session_id?: string, contains_phi?: boolean }} [meta]
       * @returns {Promise<{ recorded: boolean, trigger_fired: boolean }>}
       */
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


  /**
   * Initialize tracking by fetching your org's config.
   * Call this once on page load: `await dash.tracking.init()`
   *
   * Features enabled automatically:
   * - Product analytics (pageviews, custom events)
   * - Session replay (recordings)
   * - Error tracking (autocapture exceptions)
   * - Web analytics (referrers, UTMs, etc.)
   *
   * @returns {Promise<{active: boolean}>}
   */
  async init() {
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
      const data = await this.client._fetch(url, { method: "GET" });

      if (!data.active || !data.provider) {
        this._log("No active tracking provider found", "warn");
        this._initialized = true;
        return { active: false };
      }

      this._provider = data.provider.slug;
      this._log(`Provider: ${data.provider.name}`);

      // Initialize all active providers
      const providers = data.providers || [{ slug: data.provider.slug, name: data.provider.name, config: data.config }];

      for (const p of providers) {
        if (p.slug === "posthog") {
          await this._initEngine(p.config.api_key, p.config.host);
        } else if (p.slug === "thoughtmetric") {
          await this._initThoughtMetric(p.config.project_id);
        }
      }

      this._initialized = true;
      return { active: true };
    } catch (err) {
      this._log(`Init failed: ${err.message}`, "error");
      this._initialized = true;
      return { active: false };
    }
  }

  /**
   * Capture a custom event.
   * @param {string} eventName - Event name (e.g. "added_to_cart", "completed_purchase")
   * @param {Object} [properties] - Event properties
   */
  capture(eventName, properties = {}) {
    if (this._engine) {
      this._engine.capture(eventName, properties);
      this._eventCount++;
      this._log(`Event: ${eventName}`);
      this._updateOverlay();
    }
    // Mirror into first-party Insights so we capture our own data even when no
    // third-party provider (PostHog) is configured. Safe no-op pre-init.
    try { this.client.insights?.track(eventName, properties); } catch { /* ignore */ }
  }

  /**
   * Identify a user for tracking.
   * @param {string} userId - Unique user identifier
   * @param {Object} [properties] - User properties (email, name, plan, etc.)
   */
  identify(userId, properties = {}) {
    if (this._engine) {
      this._engine.identify(userId, properties);
      this._log(`Identified: ${userId}`);
      this._updateOverlay();
    }
    try { this.client.insights?.identify(userId, properties); } catch { /* ignore */ }
  }

  /**
   * Reset the current user identity (e.g. on logout).
   */
  reset() {
    if (this._engine) {
      this._engine.reset();
      this._log("Identity reset");
      this._updateOverlay();
    }
    this._customerId = null;
  }

  /**
   * Set the authenticated customer ID so that trackVisit() automatically
   * links visits to this customer in the backend.
   * @param {string} customerId - Customer ID from auth context
   */
  setCustomer(customerId) {
    this._customerId = customerId || null;
    if (customerId) {
      this._log(`Customer set: ${customerId}`);
    }
  }

  /**
   * Clear the stored customer ID (e.g. on logout).
   */
  clearCustomer() {
    this._customerId = null;
    this._log("Customer cleared");
  }

  /**
   * Enable automatic pageview tracking for SPA route changes.
   * Intercepts History pushState/replaceState and the popstate event
   * to fire a PostHog pageview + backend trackVisit on every navigation.
   *
   * Call once after init():
   *   await dash.tracking.init();
   *   dash.tracking.enableAutoPageviews();
   */
  enableAutoPageviews() {
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

    // Monkey-patch pushState and replaceState
    const origPush = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);

    history.pushState = (...args) => {
      origPush(...args);
      // defer so the URL has updated
      setTimeout(onRouteChange, 0);
    };
    history.replaceState = (...args) => {
      origReplace(...args);
      setTimeout(onRouteChange, 0);
    };

    window.addEventListener("popstate", () => {
      setTimeout(onRouteChange, 0);
    });

    this._log("Auto-pageviews enabled");
  }

  /**
   * Notify tracking of a route change (for frameworks like Next.js).
   * Call this from your router's pathname change handler.
   * Fires a PostHog pageview + backend trackVisit if the path actually changed.
   *
   * @param {string} [pathname] - The new pathname (defaults to window.location)
   */
  notifyRouteChange(pathname) {
    if (typeof window === "undefined") return;
    const currentPath = pathname || (window.location.pathname + window.location.search);
    if (currentPath === this._lastTrackedPath) return;
    this._lastTrackedPath = currentPath;
    this.pageview(currentPath);
    this.trackVisit();
    // Fire Meta Pixel PageView for SPA transitions (base pixel fires once on initial load)
    this.fbqPageView();
  }

  /**
   * Set properties on the current user without identifying them.
   * @param {Object} properties - Properties to set
   */
  setUserProperties(properties) {
    if (this._engine) {
      this._engine.setPersonProperties(properties);
      this._log(`Set user props: ${Object.keys(properties).join(", ")}`);
    }
  }

  /**
   * Track a pageview (called automatically, but can be called manually for SPAs).
   * @param {string} [path] - Optional path override
   */
  pageview(path) {
    if (this._engine) {
      if (path) {
        this._engine.capture("$pageview", { $current_url: path });
      } else {
        this._engine.capture("$pageview");
      }
      this._eventCount++;
      this._log(`Pageview: ${path || window.location.pathname}`);
      this._updateOverlay();
    }
  }

  /**
   * Get the current PostHog session ID (if tracking is initialized).
   * Use this to attach session recordings to orders.
   * @returns {string} Session ID or empty string
   */
  getSessionId() {
    return this._engine?.get_session_id?.() || "";
  }

  /**
   * Track a storefront visit with UTM parameters.
   * Automatically reads utm_source, utm_medium, utm_campaign, utm_term,
   * utm_content from the current URL query string and sends them to the API.
   *
   * If a customer ID has been set via `setCustomer()`, it is automatically
   * included so visits are linked to the customer in the dashboard.
   *
   * @param {Object} [options] - Optional overrides
   * @param {string} [options.customer_id] - Customer ID if authenticated
   * @param {string} [options.session_id] - Session ID override
   * @returns {Promise<{success: boolean}>}
   *
   * @example
   * // On page load:
   * await dash.tracking.trackVisit();
   *
   * // With authenticated customer:
   * await dash.tracking.trackVisit({ customer_id: "cust_abc123" });
   */
  async trackVisit(options = {}) {
    if (typeof window === "undefined") return { success: false };

    try {
      const params = new URLSearchParams(window.location.search);
      const utm_source = params.get("utm_source") || "";
      const utm_medium = params.get("utm_medium") || "";
      const utm_campaign = params.get("utm_campaign") || "";
      const utm_term = params.get("utm_term") || "";
      const utm_content = params.get("utm_content") || "";

      // Auto-include stored customer ID and PostHog session ID
      const sessionId = options.session_id || (this._engine?.get_session_id?.() || "");
      const customerId = options.customer_id || this._customerId || "";

      const body = {
        utm_source,
        utm_medium,
        utm_campaign,
        utm_term,
        utm_content,
        landing_page: window.location.href,
        referrer: document.referrer || "",
        session_id: sessionId,
        customer_id: customerId,
      };

      const url = `${this.client.baseURL}/api/storefront/analytics/track-visit`;
      const data = await this.client._fetch(url, {
        method: "POST",
        body: JSON.stringify(body),
      });

      this._log(`Visit tracked: ${window.location.pathname}${customerId ? ` (customer: ${customerId.slice(0, 8)}...)` : ""}`);
      return data;
    } catch (err) {
      this._log(`trackVisit failed: ${err.message}`, "error");
      return { success: false };
    }
  }

  /**
   * Opt the user in to tracking.
   */
  optIn() {
    if (this._engine) {
      this._engine.opt_in_capturing();
      this._log("Opted in");
    }
  }

  /**
   * Opt the user out of tracking.
   */
  optOut() {
    if (this._engine) {
      this._engine.opt_out_capturing();
      this._log("Opted out");
    }
  }

  /**
   * Check if a feature flag is enabled.
   * @param {string} flagKey - Feature flag key
   * @returns {boolean|string|undefined}
   */
  isFeatureEnabled(flagKey) {
    if (this._engine) {
      return this._engine.isFeatureEnabled(flagKey);
    }
    return undefined;
  }

  /**
   * Show or hide the debug overlay.
   * Displays tracking status, session info, and a live event log
   * in a small panel on the bottom-right of the page.
   *
   * @param {boolean} [show=true] - Pass false to hide
   *
   * @example
   * dash.tracking.debug();       // show
   * dash.tracking.debug(false);  // hide
   */
  debug(show = true) {
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

  /** @private */
  _log(message, level = "info") {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false });
    const entry = { time, message, level };
    this._debugLogs.push(entry);
    if (this._debugLogs.length > 50) this._debugLogs.shift();

    // Silence logs in production (live keys)
    const isLive = this.client?.apiKey?.startsWith("pk_live") || this.client?.apiKey?.startsWith("sk_live");
    if (!isLive) {
      const prefix = "[Tracking]";
      if (level === "error") console.error(prefix, message);
      else if (level === "warn") console.warn(prefix, message);
      else console.log(prefix, message);
    }

    this._updateOverlay();
  }

  // ---------------------------------------------------------------------------
  // ThoughtMetric
  // ---------------------------------------------------------------------------

  /**
   * Track a ThoughtMetric event.
   * @param {string} eventName - Event name: 'order', 'addToCart', 'viewContent', 'lead'
   * @param {Object} [properties] - Event properties
   */
  tmEvent(eventName, properties = {}) {
    if (typeof window !== "undefined" && typeof window.thoughtmetric === "function") {
      window.thoughtmetric("event", eventName, properties);
      this._log(`TM Event: ${eventName}`);
    }
  }

  /**
   * Identify a customer in ThoughtMetric (call after purchase).
   * @param {string} customerId - Unique customer ID or email
   * @param {Object} [properties] - Customer properties (email, first_name, last_name, etc.)
   */
  tmIdentify(customerId, properties = {}) {
    if (typeof window !== "undefined" && typeof window.thoughtmetric === "function") {
      window.thoughtmetric("identify", customerId, properties);
      this._log(`TM Identify: ${customerId}`);
    }
  }

  /**
   * Track a purchase in ThoughtMetric.
   * @param {Object} order - Order data
   * @param {string} order.transaction_id - Order/transaction ID
   * @param {number} order.total_price - Total order amount
   * @param {string} [order.currency] - Currency code (default: USD)
   * @param {number} [order.subtotal_price] - Subtotal before tax/shipping
   * @param {number} [order.total_tax] - Tax amount
   * @param {number} [order.total_shipping] - Shipping amount
   * @param {number} [order.total_discounts] - Discount amount
   * @param {string[]} [order.discount_codes] - Applied discount codes
   * @param {Array} [order.items] - Line items [{product_name, variant, sku, quantity, unit_price}]
   */
  tmPurchase(order) {
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

  // ---------------------------------------------------------------------------
  // Meta Pixel (Facebook)
  // ---------------------------------------------------------------------------

  /**
   * Fire a Meta Pixel standard event.
   * Requires the base pixel to be installed in the page.
   * Supported standard events: ViewContent, AddToCart, AddToWishlist,
   * CompleteRegistration, Contact, CustomizeProduct, Donate, FindLocation,
   * InitiateCheckout, Lead, Purchase, Schedule, Search, StartTrial,
   * SubmitApplication, Subscribe, AddPaymentInfo.
   *
   * @param {string} eventName - Meta standard event name
   * @param {Object} [params] - Event parameters (value, currency, content_ids, etc.)
   * @param {Object} [options] - Optional fbq options (eventID for deduplication)
   */
  fbqEvent(eventName, params = {}, options) {
    if (typeof window === "undefined" || typeof window.fbq !== "function") return;
    try {
      if (options) {
        window.fbq("track", eventName, params, options);
      } else {
        window.fbq("track", eventName, params);
      }
      this._log(`fbq Event: ${eventName}`);
    } catch (err) {
      this._log(`fbq ${eventName} failed: ${err.message}`, "error");
    }
  }

  /**
   * Fire a Meta Pixel custom (non-standard) event.
   * @param {string} eventName - Custom event name
   * @param {Object} [params] - Event parameters
   * @param {Object} [options] - Optional fbq options
   */
  fbqCustom(eventName, params = {}, options) {
    if (typeof window === "undefined" || typeof window.fbq !== "function") return;
    try {
      if (options) {
        window.fbq("trackCustom", eventName, params, options);
      } else {
        window.fbq("trackCustom", eventName, params);
      }
      this._log(`fbq Custom: ${eventName}`);
    } catch (err) {
      this._log(`fbq custom ${eventName} failed: ${err.message}`, "error");
    }
  }

  /**
   * Fire a Meta Pixel PageView event. The base pixel already fires one on
   * initial page load — call this only for SPA route changes.
   */
  fbqPageView() {
    this.fbqEvent("PageView");
  }

  fbqViewContent(params = {}) { this.fbqEvent("ViewContent", params); }
  fbqAddToCart(params = {}) { this.fbqEvent("AddToCart", params); }
  fbqAddToWishlist(params = {}) { this.fbqEvent("AddToWishlist", params); }
  fbqInitiateCheckout(params = {}) { this.fbqEvent("InitiateCheckout", params); }
  fbqAddPaymentInfo(params = {}) { this.fbqEvent("AddPaymentInfo", params); }
  fbqPurchase(params = {}) { this.fbqEvent("Purchase", params); }
  fbqSearch(params = {}) { this.fbqEvent("Search", params); }
  fbqLead(params = {}) { this.fbqEvent("Lead", params); }
  fbqContact(params = {}) { this.fbqEvent("Contact", params); }
  fbqCompleteRegistration(params = {}) { this.fbqEvent("CompleteRegistration", params); }
  fbqSubscribe(params = {}) { this.fbqEvent("Subscribe", params); }

  /** @private */
  async _initThoughtMetric(projectId) {
    if (!projectId || typeof window === "undefined") return;

    try {
      this._log(`Initializing ThoughtMetric (project: ${projectId})...`);

      // Inject ThoughtMetric tracking pixel script
      const script = document.createElement("script");
      script.async = true;
      script.src = `https://app.thoughtmetric.io/pixel/${projectId}.js`;
      script.onload = () => {
        this._thoughtmetric = true;
        this._log("ThoughtMetric pixel loaded");
      };
      script.onerror = () => {
        this._log("ThoughtMetric pixel failed to load", "warn");
      };
      document.head.appendChild(script);
    } catch (err) {
      this._log(`ThoughtMetric init failed: ${err.message}`, "error");
    }
  }

  /** @private */
  async _initEngine(apiKey, host) {
    if (!apiKey || typeof window === "undefined") return;

    try {
      this._log(`Connecting to ${host || "https://us.i.posthog.com"}...`);
      const mod = await import("posthog-js");
      const engine = mod.default || mod;

      engine.init(apiKey, {
        api_host: host || "https://us.i.posthog.com",
        defaults: "2025-11-30",
        capture_pageview: false,
        capture_pageleave: true,
        autocapture: true,
        session_recording: {
          recordCrossOriginIframes: true,
          // Only mask specific input types — NOT all inputs, so recordings stay useful
          maskAllInputs: false,
          maskTextSelector: ".ph-no-capture, [data-ph-no-capture]",
          maskInputSelector: ".ph-no-capture input, [data-ph-no-capture] input, input[autocomplete*='cc-'], input[name*='card'], input[name*='cvv'], input[name*='cvc'], input[name*='expir']",
          maskInputOptions: {
            password: true,
          },
          networkPayloadCapture: {
            recordHeaders: true,
            recordBody: (data) => {
              // Strip payment/checkout endpoint bodies
              const url = (data.url || data.name || "").toLowerCase();
              const blocked = [
                "/payment", "/checkout", "/charge", "/token",
                "stripe.com", "braintree", "paypal", "square",
                "/api/storefront/payment",
              ];
              if (blocked.some((p) => url.includes(p))) return null;
              return data.body;
            },
          },
        },
        enable_recording_console_log: true,
        loaded: (ph) => {
          this._log("Engine loaded");
          this._log(`Session ID: ${ph.get_session_id()}`);
          const recording = ph.sessionRecordingStarted();
          this._log(`Recording: ${recording ? "active" : "inactive"}`, recording ? "info" : "warn");
          const replayUrl = ph.get_session_replay_url();
          if (replayUrl) this._log(`Replay: ${replayUrl}`);
          this._updateOverlay();
        },
      });

      this._engine = engine;
    } catch (err) {
      this._log(`Engine init failed: ${err.message}`, "error");
    }
  }

  /** @private */
  _createOverlay() {
    if (typeof document === "undefined") return;

    const overlay = document.createElement("div");
    overlay.id = "dash-tracking-debug";
    overlay.style.cssText = `
      position: fixed;
      bottom: 12px;
      right: 12px;
      width: 360px;
      max-height: 420px;
      background: #111;
      color: #e5e5e5;
      border: 1px solid #333;
      border-radius: 8px;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
      font-size: 11px;
      z-index: 99999;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `;

    // Header
    const header = document.createElement("div");
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: #1a1a1a;
      border-bottom: 1px solid #333;
      cursor: default;
    `;
    header.innerHTML = `<span style="font-weight:600;color:#22c55e;">&#9679;</span>&nbsp;&nbsp;<span style="font-weight:600;">Tracking Debug</span>`;

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "\u00d7";
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: #888;
      font-size: 16px;
      cursor: pointer;
      padding: 0 4px;
      line-height: 1;
    `;
    closeBtn.onclick = () => this._destroyOverlay();
    header.appendChild(closeBtn);
    overlay.appendChild(header);

    // Stats bar
    const stats = document.createElement("div");
    stats.id = "dash-tracking-stats";
    stats.style.cssText = `
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1px;
      background: #222;
      border-bottom: 1px solid #333;
    `;
    overlay.appendChild(stats);

    // Log area
    const logArea = document.createElement("div");
    logArea.id = "dash-tracking-logs";
    logArea.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 6px 0;
      max-height: 240px;
    `;
    overlay.appendChild(logArea);

    document.body.appendChild(overlay);
    this._debugOverlay = overlay;
  }

  /** @private */
  _updateOverlay() {
    if (!this._debugOverlay || typeof document === "undefined") return;

    const engine = this._engine;
    const sessionId = engine ? (engine.get_session_id?.() || "—") : "—";
    const distinctId = engine ? (engine.get_distinct_id?.() || "anonymous") : "—";
    const recording = engine ? (engine.sessionRecordingStarted?.() ? "Active" : "Inactive") : "—";
    const status = this._initialized ? (engine ? "Connected" : "No provider") : "Initializing";

    const statsEl = this._debugOverlay.querySelector("#dash-tracking-stats");
    if (statsEl) {
      const statStyle = `padding:6px 10px;background:#1a1a1a;`;
      const labelStyle = `color:#888;font-size:10px;display:block;margin-bottom:2px;`;
      const valueStyle = `color:#e5e5e5;font-weight:500;word-break:break-all;`;
      statsEl.innerHTML = `
        <div style="${statStyle}"><span style="${labelStyle}">Status</span><span style="${valueStyle};color:${engine ? "#22c55e" : "#eab308"}">${status}</span></div>
        <div style="${statStyle}"><span style="${labelStyle}">Recording</span><span style="${valueStyle};color:${recording === "Active" ? "#22c55e" : "#ef4444"}">${recording}</span></div>
        <div style="${statStyle}"><span style="${labelStyle}">Session</span><span style="${valueStyle};font-size:10px;">${sessionId.slice(0, 20)}${sessionId.length > 20 ? "..." : ""}</span></div>
        <div style="${statStyle}"><span style="${labelStyle}">User</span><span style="${valueStyle};font-size:10px;">${distinctId.slice(0, 20)}${distinctId.length > 20 ? "..." : ""}</span></div>
        <div style="${statStyle}"><span style="${labelStyle}">Events</span><span style="${valueStyle}">${this._eventCount}</span></div>
        <div style="${statStyle}"><span style="${labelStyle}">Page</span><span style="${valueStyle};font-size:10px;">${typeof window !== "undefined" ? window.location.pathname : "—"}</span></div>
      `;
    }

    const logArea = this._debugOverlay.querySelector("#dash-tracking-logs");
    if (logArea) {
      const colors = { info: "#a3a3a3", warn: "#eab308", error: "#ef4444" };
      logArea.innerHTML = this._debugLogs
        .slice(-30)
        .map((entry) => `<div style="padding:2px 10px;color:${colors[entry.level] || colors.info};border-bottom:1px solid #1a1a1a;"><span style="color:#555;margin-right:6px;">${entry.time}</span>${entry.message}</div>`)
        .join("");
      logArea.scrollTop = logArea.scrollHeight;
    }
  }

  /** @private */
  _destroyOverlay() {
    if (this._debugOverlay) {
      this._debugOverlay.remove();
      this._debugOverlay = null;
    }
  }
}

export default TrackingModule;

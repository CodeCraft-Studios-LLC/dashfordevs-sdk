/**
 * dash4devs - E-commerce SDK for developers
 *
 * Solution by CodeCraft Studios (https://www.codecraftstudios.net)
 * A JavaScript SDK for integrating with DevDash e-commerce backend.
 * Provides easy access to products, categories, cart, and page data.
 */

import { ProductsModule } from "./services/products.js";
import { CategoriesModule } from "./services/categories.js";
import { CartModule } from "./services/cart.js";
import { PagesModule } from "./services/pages.js";
import { SeoModule } from "./services/seo.js";
import { AuthModule } from "./services/auth.js";
import { PaymentModule } from "./services/payment.js";
import { BlogModule } from "./services/blog.js";
import { CheckoutModule } from "./services/checkout.js";
import { EmailModule } from "./services/email.js";
import { ShippingModule } from "./services/shipping.js";
import { TrackingModule } from "./services/tracking.js";
import { printConsoleWarning } from "./security/index.js";
import { InsightsModule } from "./services/insights.js";
import { ContactModule } from "./services/contact.js";
import { UploadModule } from "./services/upload.js";
import { BrandsModule } from "./services/brands.js";
import { MarketingModule } from "./services/marketing.js";
import { AffiliatesModule } from "./services/affiliates.js";
import { TaxModule } from "./services/tax.js";
import { CoaModule } from "./services/coa.js";
import { LegalModule } from "./services/legal.js";
import { MediaModule } from "./services/media.js";
import { HtmlTemplatesModule } from "./services/html-templates.js";
import { ReferralsModule } from "./services/referrals.js";
import { PaymentMethodsModule } from "./services/payment-methods.js";
import { DiscountStoreModule } from "./services/discount-store.js";
import { LoyaltyModule } from "./services/loyalty.js";
import { EarnPointsModule } from "./services/earn-points.js";
import { SubscriptionsModule } from "./services/subscriptions.js";
import { SitemapModule } from "./services/sitemap.js";
import { AdminModule } from "./services/admin.js";
import { ContentTypesModule } from "./services/content-types.js";
import { PageGroupsModule, PageGroup } from "./services/page-groups.js";
import { FormsModule } from "./services/forms.js";
import { SurveyModule } from "./services/survey.js";
import { CalendarModule } from "./services/calendar.js";

/**
 * Keep in sync with the `version` field in package.json.
 *
 * This drives the version shown in the "Powered by DashForDevs" badge and in
 * startup table. It was previously inlined in the constructor and drifted eleven
 * releases behind package.json (storefronts were advertising v0.1.4-alpha), so
 * it lives here as the single value to bump.
 */
export const SDK_VERSION = "0.1.23-alpha";

// =============================================================================
// MAIN CLIENT
// =============================================================================

export class DashClient {
  /**
   * Create a new DashClient instance
   * @param {Object} options - Configuration options
   * @param {string} options.apiKey - Your API key (pk_* or sk_*) from DevDash dashboard
   * @param {string} [options.baseURL] - Optional: Override API URL (for local development only)
   * @param {boolean|Object} [options.consoleWarning] - The browser console "Stop" warning against
   *   self-XSS, printed once per page (never on localhost). On by default; false turns it off, an
   *   object overrides its text (see dash4devs/security).
   */
  constructor({ apiKey, baseURL = "https://api.dashfordevs.com", consoleWarning = true }) {
    // Once per page, however many clients a site creates.
    if (consoleWarning !== false && typeof window !== "undefined" && !window.__dash4devsConsoleWarned) {
      window.__dash4devsConsoleWarned = true;
      printConsoleWarning(typeof consoleWarning === "object" ? consoleWarning : {});
    }
    if (!apiKey) {
      throw new Error("apiKey is required");
    }

    if (!apiKey.startsWith("pk_") && !apiKey.startsWith("sk_")) {
      throw new Error("apiKey must start with 'pk_' or 'sk_'");
    }

    // SECURITY: Prevent secret keys from being used in browser environments
    if (typeof window !== "undefined" && apiKey.startsWith("sk_")) {
      throw new Error(
        "\n\n🚨 DASH4DEVS SECURITY ERROR 🚨\n\n" +
        "You are using a SECRET key (sk_*) in a browser environment.\n" +
        "This exposes your entire store to anyone who views your site.\n\n" +
        "SECRET keys must ONLY be used in server-side code (API routes, backend).\n" +
        "Use your PUBLIC key (pk_*) for client-side / NEXT_PUBLIC_ env vars.\n\n" +
        "If this key has been exposed, rotate it immediately in your dashboard:\n" +
        "Settings > API > Keys\n"
      );
    }

    // SECURITY: Detect if secret key was leaked via NEXT_PUBLIC_ env vars
    if (typeof process !== "undefined" && typeof process.env !== "undefined") {
      const envEntries = Object.entries(process.env || {});
      for (const [key, value] of envEntries) {
        if (key.startsWith("NEXT_PUBLIC_") && typeof value === "string" && (value.startsWith("sk_live_") || value.startsWith("sk_test_"))) {
          throw new Error(
            "\n\n🚨 DASH4DEVS SECURITY ERROR 🚨\n\n" +
            `Secret key detected in ${key}!\n` +
            "NEXT_PUBLIC_ variables are exposed to the browser.\n" +
            "Move your secret key to a non-NEXT_PUBLIC_ variable and use it only in server-side code.\n\n" +
            "Use your PUBLIC key (pk_*) for NEXT_PUBLIC_ env vars.\n"
          );
        }
      }
    }

    this.apiKey = apiKey;
    this.baseURL = baseURL.replace(/\/$/, ""); // Remove trailing slash
    this._sessionId = null;
    this.version = SDK_VERSION;

    // Startup info table — prints once per process, not per DashClient instance
    // (Next.js SSR creates a new client per request/worker, which used to spam logs)
    this._printStartupInfo();

    // Initialize modules
    this.products = new ProductsModule(this);
    this.categories = new CategoriesModule(this);
    this.cart = new CartModule(this);
    this.pages = new PagesModule(this);
    this.seo = new SeoModule(this);
    this.auth = new AuthModule(this);
    this.payment = new PaymentModule(this);
    this.blog = new BlogModule(this);
    this.checkout = new CheckoutModule(this);
    this.email = new EmailModule(this);
    this.shipping = new ShippingModule(this);
    this.tracking = new TrackingModule(this);
    this.insights = new InsightsModule(this);
    this.contact = new ContactModule(this);
    this.upload = new UploadModule(this);
    this.brands = new BrandsModule(this);
    this.marketing = new MarketingModule(this);
    this.affiliates = new AffiliatesModule(this);
    this.tax = new TaxModule(this);
    this.coa = new CoaModule(this);
    this.legal = new LegalModule(this);
    this.media = new MediaModule(this);
    this.htmlTemplates = new HtmlTemplatesModule(this);
    this.referrals = new ReferralsModule(this);
    this.paymentMethods = new PaymentMethodsModule(this);
    this.discountStore = new DiscountStoreModule(this);
    this.loyalty = new LoyaltyModule(this);
    this.earnPoints = new EarnPointsModule(this);
    this.subscriptions = new SubscriptionsModule(this);
    this.sitemap = new SitemapModule(this);
    this.calendar = new CalendarModule(this);

    // ── Forms ─────────────────────────────────────────────────────────
    // Storefront-side intake / contact / lead-capture / signed forms.
    // The dashboard owns the schema; storefronts read it via
    // `dash.forms.get(slug)` and submit via `dash.forms.submit(slug, payload)`.
    // The React `useDashForm` hook (`/react`) provides Django-template-style
    // field accessors on top of these primitives.
    this.forms = new FormsModule(this);

    // ── Surveys ───────────────────────────────────────────────────────
    // Dashboard-built surveys (typed questions: radio, checkbox, text, etc.).
    // Read the schema via `dash.survey.get(slug)`, validate locally with
    // `dash.survey.validate(schema, values)`, and submit via
    // `dash.survey.submit(slug, values)`. The responding customer is taken
    // from the logged-in Bearer token — not passed in.
    this.survey = new SurveyModule(this);

    // ── Page Groups (storefront content collections) ───────────────────
    // Public reads. Use either:
    //   const { items } = await dash.pageGroup("services").all();
    //   const list      = await dash.pageGroups.list();
    // The `pageGroup(slug)` shortcut returns a fluent builder so you can
    // chain `.all() / .get() / .filter() / .find() / .count()`.
    this.pageGroups = new PageGroupsModule(this);
    this.pageGroup = (slug) => this.pageGroups.group(slug);

    // Admin module — only available with secret keys (sk_*)
    if (apiKey.startsWith("sk_")) {
      this.admin = new AdminModule(this);
    }
    // Legacy alias — kept so existing apps keep working. New code should use
    // `dash.pageGroup(slug)` or `dash.pageGroups`. ContentTypesModule will be
    // removed in a future major version.
    this.contentTypes = new ContentTypesModule(this);

    // Inject footer branding for all keys (production and test)
    if (typeof window !== "undefined") {
      this._injectFooterBranding();
    }

    // Check org lock status on client-side init
    if (typeof window !== "undefined") {
      this._checkLockStatus();
    }
  }

  /**
   * Print startup info table to console
   * @private
   */
  _printStartupInfo() {
    // Only print on server side (terminal) — never expose key info in browser
    if (typeof window !== "undefined") return;

    // Guard: print once per (process, apiKey) pair. Next.js SSR instantiates a
    // new DashClient per request/worker so the banner used to fire dozens of
    // times per page. Setting DASH4DEVS_SILENT=1 silences it entirely.
    if (process.env.DASH4DEVS_SILENT === "1") return;
    if (!globalThis.__DASH4DEVS_PRINTED__) globalThis.__DASH4DEVS_PRINTED__ = new Set();
    const fingerprint = `${this.apiKey}|${this.baseURL}`;
    if (globalThis.__DASH4DEVS_PRINTED__.has(fingerprint)) return;
    globalThis.__DASH4DEVS_PRINTED__.add(fingerprint);

    const maskKey = (key) => {
      if (!key || key.length < 8) return key;
      const prefix = key.slice(0, key.indexOf("_", 3) + 1);
      const last4 = key.slice(-4);
      return `${prefix}${"*".repeat(Math.max(0, key.length - prefix.length - 4))}${last4}`;
    };

    const keyType = this.apiKey.startsWith("pk_") ? "Public" : "Secret";
    const env = this.apiKey.includes("_live_") ? "Production" : this.apiKey.includes("_test_") ? "Test" : "Unknown";

    console.log("");
    console.log("┌─────────────────────────────────────────────┐");
    console.log(`│  DashForDevs SDK v${this.version}                        │`);
    console.log("├──────────────────┬──────────────────────────┤");
    console.log(`│  Key Type        │  ${(keyType + " (" + env + ")").padEnd(24)} │`);
    console.log(`│  API Key         │  ${maskKey(this.apiKey).padEnd(24)} │`);
    console.log(`│  Base URL        │  ${this.baseURL.slice(0, 24).padEnd(24)} │`);
    console.log(`│  Environment     │  ${"Server (Node.js)".padEnd(24)} │`);
    console.log("└──────────────────┴──────────────────────────┘");

    if (env === "Production" && keyType === "Public") {
      console.log("  ✓ Production mode — branding will be injected");
    } else if (env === "Test") {
      console.log("  ⚡ Test mode — branding disabled");
    }
    if (keyType === "Secret") {
      console.log("  🔒 Secret key — server-side only");
    }
    console.log("");
  }

  /**
   * Inject the "Powered by DashForDevs" strip directly beneath the site's footer.
   *
   * The link is `rel="nofollow"` and must stay that way. An auto-injected,
   * identical, followed footer link across every client site is precisely what
   * Google's spam documentation calls a widget link scheme: it is the old
   * WordPress-theme-credit and embedded-counter pattern, and its guidance on
   * widget links is to nofollow them. Followed, these get devalued at best and
   * earn dashfordevs.com a manual action at worst.
   *
   * Nothing of value is lost. What this badge is actually for is referral
   * clicks, brand impressions and discovery by other store owners, and all
   * three survive nofollow intact. The href is UTM-tagged per storefront, so
   * the referral traffic is measurable in analytics, which is where the return
   * on this badge was always going to show up.
   *
   * That matters more here than on a typical SDK: a large share of these
   * storefronts are hemp and THCA sites, and a followed-link neighbourhood is
   * something Google evaluates in both directions.
   *
   * Placement matters: this used to `document.body.appendChild(...)`, which only
   * lands under the footer when <footer> happens to be the last thing in <body>.
   * On storefronts that wrap the page in <main> (or lay <body> out with flex/grid,
   * where DOM order is not paint order) the strip surfaced above the content
   * instead. Anchoring to the footer's own parent — as its next sibling — puts the
   * strip under whatever the footer is, in normal flow, on every layout.
   *
   * @private
   */
  _injectFooterBranding() {
    // Wait for DOM and hydration to complete
    const inject = () => {
      // Already present (e.g. rendered server-side) — nothing to do.
      if (document.getElementById("dash4devs-branding")) {
        return;
      }

      // Anchor to the LAST footer on the page: a site may mark up more than one
      // <footer> (e.g. a card footer), and the page's own is the final one.
      const footers = document.querySelectorAll("footer");
      const footer = footers[footers.length - 1];
      if (!footer) {
        // Footer may not have hydrated yet — retry shortly.
        setTimeout(inject, 500);
        return;
      }

      // Don't double up on an SSR-rendered credit.
      if (footer.innerHTML.includes("dashfordevs.com") ||
          footer.innerHTML.includes("Powered by Dash4Devs") ||
          footer.innerHTML.includes("Powered by DashForDevs")) {
        return;
      }

      const brandingDiv = document.createElement("div");
      brandingDiv.id = "dash4devs-branding";
      // `position: static` and no z-index: this is a normal-flow strip that sits
      // after the footer. It must never float over the page or pin to the viewport.
      brandingDiv.style.cssText = `
        position: static;
        display: block;
        width: 100%;
        box-sizing: border-box;
        text-align: center;
        padding: 12px 16px;
        margin: 0;
        font-size: 14px;
        line-height: 1.4;
        color: #6b7280;
        background: #ffffff;
        border-top: 1px solid #e5e7eb;
      `;

      // Attribute the referral back to the storefront that rendered the badge.
      const href = this._brandingHref();

      brandingDiv.innerHTML = `
        Powered by <a href="${href}" target="_blank" rel="nofollow noopener noreferrer" style="font-weight: 600; color: #0369a1; text-decoration: none;">DashForDevs</a>
        <span style="color: #4b5563; font-size: 11px; margin-left: 4px;">v${this.version}</span>
      `;

      // Directly after the footer, inside the footer's own parent — so it lands
      // under the footer whatever that parent happens to be (<body>, <main>, …).
      footer.insertAdjacentElement("afterend", brandingDiv);
    };

    // Delay injection well past SSR hydration to prevent hydration mismatches.
    // requestIdleCallback fires after the main thread is idle (post-hydration).
    const schedule = typeof requestIdleCallback === "function"
      ? requestIdleCallback
      : (fn) => setTimeout(fn, 2000);

    schedule(() => {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", inject);
      } else {
        inject();
      }
    });
  }

  /**
   * The badge's link, UTM-tagged with the storefront's own domain so referrals
   * from each site are attributable in analytics (previously it was a bare
   * https://dashfordevs.com, so every storefront's traffic looked identical).
   *
   *   https://dashfordevs.com/?utm_source=buds2godfw.com
   *     &utm_medium=referral&utm_campaign=powered_by&utm_content=sdk-badge
   *
   * @private
   */
  _brandingHref() {
    const url = new URL("https://dashfordevs.com/");
    // hostname, not href: no paths or query strings from the host page leak out.
    const host = (typeof location !== "undefined" && location.hostname) || "unknown";
    url.searchParams.set("utm_source", host);
    url.searchParams.set("utm_medium", "referral");
    url.searchParams.set("utm_campaign", "powered_by");
    url.searchParams.set("utm_content", "sdk-badge");
    return url.toString();
  }

  /**
   * Check if the organization is locked and redirect if so.
   * @private
   */
  async _checkLockStatus() {
    try {
      const res = await this.ping();
      if (res.organization?.is_locked) {
        window.location.href = "https://www.codecraftstudios.net";
      }
    } catch {
      // Silently fail — don't block the page if ping fails
    }
  }

  /**
   * Get the current session ID for analytics tracking.
   * Tries PostHog session ID first, then falls back to a generated ID stored in sessionStorage.
   * @returns {string} Session ID or empty string on server
   */
  getSessionId() {
    if (this._sessionId) return this._sessionId;
    if (typeof window !== "undefined" && window.posthog) {
      const id = window.posthog.get_session_id?.();
      if (id) return id;
    }
    if (typeof window !== "undefined") {
      let id = sessionStorage.getItem("dash4devs_session_id");
      if (!id) {
        id = "ds_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
        sessionStorage.setItem("dash4devs_session_id", id);
      }
      return id;
    }
    return "";
  }

  /**
   * Manually set the session ID (e.g., from PostHog or your own tracking)
   * @param {string} id - Session ID to use
   */
  setSessionId(id) {
    this._sessionId = id;
  }

  /**
   * Internal fetch wrapper
   * @private
   */
  async _fetch(url, options = {}) {
    const headers = {
      "X-API-Key": this.apiKey,
      "Content-Type": "application/json",
      ...options.headers,
    };

    // Include auth token if available (for customer-specific features like discounts)
    if (this.auth && this.auth._accessToken && !headers["Authorization"]) {
      headers["Authorization"] = `Bearer ${this.auth._accessToken}`;
    }

    // Include session ID + first-party visitor ID if available (client-side
    // only). The visitor id lets server-side endpoints (e.g. checkout) attribute
    // the request to the browser's persistent first-party identity.
    if (typeof window !== "undefined") {
      const sessionId = this.getSessionId();
      if (sessionId) headers["X-Session-Id"] = sessionId;
      try {
        const visitorId = this.insights?.getVisitorId?.();
        if (visitorId) headers["X-Visitor-Id"] = visitorId;
      } catch { /* ignore */ }
    }

    // Cache server reads in production; skip the cache outside production so
    // local changes show instantly. Keyed on NODE_ENV (always "production" in a
    // real build/deploy) rather than a manual DEV flag — a stray DEV=true in
    // .env.local was forcing no-store in prod builds and disabling all caching.
    const isProd =
      (typeof process !== "undefined" && process.env?.NODE_ENV) === "production";
    const fetchOptions = { ...options, headers };
    const method = (options.method || "GET").toUpperCase();
    const isServer = typeof window === "undefined";
    if (!isProd) {
      fetchOptions.cache = "no-store";
    } else if (
      isServer &&
      method === "GET" &&
      !headers["Authorization"] &&          // never cache personalized/authed reads
      options.cache === undefined &&        // respect explicit per-call cache choices
      options.next === undefined
    ) {
      // Cache anonymous server-side reads (catalog: categories/products/blogs/
      // etc.) in Next's Data Cache so SSR pages render from cache instead of
      // hitting the API on every navigation — the slow part of click-to-page.
      // The revalidate webhook (createRevalidateHandler) busts these the moment
      // data changes, so this TTL is just a safety net. Override with the
      // DASH4DEVS_REVALIDATE env var (seconds).
      const ttl = Number(
        (typeof process !== "undefined" && process.env?.DASH4DEVS_REVALIDATE) || 60
      );
      // Tag every cached read with a global "dash4devs" tag so changes that
      // can't be mapped to a specific page path (gallery/media-library images,
      // async variant-ready completion) can bust ALL cached catalog data at
      // once via revalidateTag("dash4devs"). Path-precise revalidation (stock,
      // price, product/category edits) keeps using revalidatePath, so frequent
      // inventory updates don't thrash this global tag.
      fetchOptions.next = {
        revalidate: Number.isFinite(ttl) ? ttl : 60,
        tags: ["dash4devs"],
      };
    }

    const response = await fetch(url, fetchOptions);

    const data = await response.json();

    if (!response.ok) {
      // Auto-redirect to /banned on ban responses (client-side only)
      if (response.status === 403 && data.error === "banned" && typeof window !== "undefined") {
        const reason = data.reason ? `?reason=${encodeURIComponent(data.reason)}` : "";
        window.location.href = `/banned${reason}`;
      }

      const error = new Error(data.message || data.error || "API request failed");
      error.status = response.status;
      error.details = data;
      throw error;
    }

    // Check if organization is locked — redirect storefront to codecraftstudios.net
    if (data.organization?.is_locked && typeof window !== "undefined") {
      window.location.href = "https://www.codecraftstudios.net";
      return data;
    }

    return data;
  }

  /**
   * Health check - validates API key and returns organization info
   * @returns {Promise<{status: string, organization: Object, environment: string}>}
   */
  async ping() {
    const url = `${this.baseURL}/api/storefront/ping`;
    return this._fetch(url);
  }

  /**
   * Probe the storefront API and decide whether to serve the site or a
   * maintenance page. NEVER throws — a gate must not crash the page it guards.
   *
   * Unlike ping(), this does NOT go through _fetch: it won't trigger the
   * is_locked redirect, won't be cached, and won't throw on a non-200. It's a
   * pure, timeout-bounded health probe you can put at the top of a root layout.
   *
   *   ok: true   → serve the site normally
   *   ok: false  → render <MaintenancePage/> (maintenance_mode is on, OR the
   *                backend is unreachable / 5xx / timed out)
   *
   * A 4xx (bad key, wrong origin) is a *config* problem, not an outage, so it
   * does NOT gate — you want that error visible, not hidden behind "be right
   * back". Org lock is reported as `locked` but left to the existing _fetch
   * redirect, so this doesn't change lock behavior.
   *
   * @param {Object} [opts]
   * @param {number} [opts.timeoutMs=2500] Abort the probe after this long.
   * @returns {Promise<{ok:boolean, reachable:boolean, maintenance:boolean,
   *   locked:boolean, reason:string|null, message:string|null, until:string|null}>}
   */
  async checkHealth({ timeoutMs = 2500 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const down = (reason) => ({
      ok: false,
      reachable: reason.indexOf("http_") === 0,
      maintenance: true,
      locked: false,
      reason,
      message: null,
      until: null,
    });
    try {
      const res = await fetch(`${this.baseURL}/api/storefront/ping`, {
        method: "GET",
        headers: { "X-API-Key": this.apiKey },
        cache: "no-store",
        signal: controller.signal,
      });

      // 5xx / gateway (502/503/504) → backend unhealthy → gate the site.
      if (res.status >= 500) return down(`http_${res.status}`);

      let data = null;
      try {
        data = await res.json();
      } catch {
        // reachable but no JSON — a proxy/config oddity, not an outage.
      }

      if (!res.ok || !data) {
        return {
          ok: true,
          reachable: true,
          maintenance: false,
          locked: false,
          reason: `http_${res.status}`,
          message: null,
          until: null,
        };
      }

      const locked = data.organization?.is_locked === true;
      // Tolerate either a nested maintenance object (enriched ping) or a bare
      // maintenance_mode flag, and the "True" string quirk.
      const m =
        data.maintenance && typeof data.maintenance === "object" ? data.maintenance : {};
      const inMaintenance =
        m.enabled === true ||
        m.enabled === "true" ||
        data.maintenance === true ||
        data.maintenance_mode === true;

      return {
        ok: !inMaintenance,
        reachable: true,
        maintenance: inMaintenance,
        locked,
        reason: inMaintenance ? "operator" : null,
        message: m.message || null,
        until: m.until || null,
      };
    } catch (err) {
      return down(err && err.name === "AbortError" ? "timeout" : "unreachable");
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Get page data - convenience method for SSR/SSG
   * Fetches all configured data for a page in a single request.
   *
   * @param {string} pathOrName - URL path (e.g., "/products/my-product") or page name (e.g., "home")
   * @param {Object} options - Options
   * @param {boolean} options.byName - If true, treats pathOrName as a page name instead of path
   * @returns {Promise<{page: Object, params: Object, global: Object, data: Object}>}
   *
   * @example
   * // By path (default) - matches dynamic routes like "/products/<slug>"
   * const { page, params, global, data } = await dash.getPageData("/products/my-product");
   * // params = { slug: "my-product" }
   *
   * @example
   * // By name - direct lookup
   * const { page, global, data } = await dash.getPageData("home", { byName: true });
   */
  async getPageData(pathOrName, options = {}) {
    if (options.byName) {
      return this.pages.getByName(pathOrName);
    }
    return this.pages.getByPath(pathOrName);
  }

  /**
   * Get global store data (branding, contact info, etc.)
   * This is the data configured in dashboard settings/api-branding.
   *
   * Returns store information that should be available on every page:
   * - Store name, description, logo
   * - Contact information (email, phone, website)
   * - Business address
   * - Business type and industry
   * - Global data sources (if configured)
   *
   * @returns {Promise<{global: Object}>}
   *
   * @example
   * const { global } = await dash.getGlobalData();
   * console.log(global.store_name);       // "My Store"
   * console.log(global.logo);             // "https://..."
   * console.log(global.business_email);   // "contact@mystore.com"
   * console.log(global.nav_categories);   // [...] if configured
   */
  async getGlobalData() {
    const url = `${this.baseURL}/api/storefront/global`;
    return this._fetch(url);
  }
}

// =============================================================================
// REVALIDATION HANDLER (Next.js App Router)
// =============================================================================

/**
 * Create a Next.js App Router POST handler for on-demand ISR revalidation.
 * Validates a shared secret, then calls revalidatePath() for each path.
 *
 * @param {Object} options
 * @param {string} options.secret - Shared secret (must match backend REVALIDATE_SECRET)
 * @returns {Function} POST handler for route.ts
 *
 * @example
 * // app/api/revalidate/route.ts
 * import { createRevalidateHandler } from "@/lib/dash4devs";
 * export const POST = createRevalidateHandler({ secret: process.env.REVALIDATE_SECRET });
 */
export function createRevalidateHandler({ secret }) {
  return async function POST(request) {
    const { NextResponse } = await import("next/server");
    const { revalidatePath, revalidateTag } = await import("next/cache");

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!secret || body.secret !== secret) {
      return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
    }

    const paths = Array.isArray(body.paths) ? body.paths : [];
    // `tags` busts cache by tag (revalidateTag) — used for changes that can't
    // map to a specific page path (gallery/media-library images, async
    // variant-ready completion); send ["dash4devs"] to refresh ALL cached
    // catalog data. At least one of paths/tags must be present.
    const tags = Array.isArray(body.tags) ? body.tags : [];
    if (paths.length === 0 && tags.length === 0) {
      return NextResponse.json({ error: "paths or tags must be provided" }, { status: 400 });
    }

    const revalidated = [];

    // Always revalidate the root layout so navbar/footer update
    try {
      revalidatePath("/", "layout");
      revalidated.push("/ (layout)");
    } catch {}

    for (const p of paths) {
      try {
        revalidatePath(p);
        revalidated.push(p);
      } catch (e) {
        console.error(`[revalidate] Failed for ${p}:`, e.message);
      }
    }

    for (const t of tags) {
      try {
        revalidateTag(t);
        revalidated.push(`tag:${t}`);
      } catch (e) {
        console.error(`[revalidate] Failed for tag ${t}:`, e.message);
      }
    }

    console.log(`[revalidate] Revalidated ${revalidated.length} entries:`, revalidated);
    return NextResponse.json({ revalidated });
  };
}

// Re-export modules for advanced usage
export { ProductsModule } from "./services/products.js";
export { CategoriesModule } from "./services/categories.js";
export { CartModule } from "./services/cart.js";
export { PagesModule } from "./services/pages.js";
export { SeoModule } from "./services/seo.js";
export { AuthModule } from "./services/auth.js";
export { PaymentModule } from "./services/payment.js";
export { BlogModule } from "./services/blog.js";
export { CheckoutModule } from "./services/checkout.js";
export { EmailModule } from "./services/email.js";
export { ShippingModule } from "./services/shipping.js";
export { TrackingModule } from "./services/tracking.js";
export { InsightsModule } from "./services/insights.js";
export { ContactModule } from "./services/contact.js";
export { UploadModule } from "./services/upload.js";
export { BrandsModule } from "./services/brands.js";
export { MarketingModule } from "./services/marketing.js";
export { AffiliatesModule } from "./services/affiliates.js";
export { TaxModule } from "./services/tax.js";
export { CoaModule } from "./services/coa.js";
export { LegalModule } from "./services/legal.js";
export { ReferralsModule } from "./services/referrals.js";
export { PaymentMethodsModule } from "./services/payment-methods.js";
export { DiscountStoreModule } from "./services/discount-store.js";
export { LoyaltyModule } from "./services/loyalty.js";
export { EarnPointsModule } from "./services/earn-points.js";
export { SitemapModule } from "./services/sitemap.js";
export { CalendarModule } from "./services/calendar.js";
export { PageGroupsModule, PageGroup } from "./services/page-groups.js";
export { FormsModule } from "./services/forms.js";
export { SurveyModule } from "./services/survey.js";
export { ContentTypesModule } from "./services/content-types.js";

// Re-export processor classes for advanced usage
export { AuthorizeNetCSR } from "./processors/authorize-net.js";
export { QuickBooksCSR } from "./processors/quickbooks.js";
export { GooglePayCSR } from "./processors/google-pay.js";

// Default export
export default DashClient;

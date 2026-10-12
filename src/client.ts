/**
 * DashClient - the storefront SDK client.
 *
 * Drop-in compatible with dash4devs 0.1.x: same constructor, properties,
 * modules, methods and return shapes. What is new is opt-in or invisible:
 *
 *   - choose the API host with `target: "papi"` / `apiBase` / `baseURL` or the
 *     DASH4DEVS_TARGET / DASH4DEVS_API_URL environment variables (default:
 *     production, https://api.dashfordevs.com - nothing changes on upgrade);
 *   - timeouts on every request and retries for GETs;
 *   - one error type (DashApiError) for HTTP, network, timeout and non-JSON;
 *   - PHI hygiene: processors never receive product names, analytics sends
 *     only de-identified data (see InsightsModule).
 */

import { printConsoleWarning, findPublicSecretKeyVars, maskKey } from "./security/index.js";
import { API_TARGETS, describeApiBase, resolveApiBase, type ApiTarget } from "./core/config.js";
import { dashFetch, resolveFetch, DEFAULT_RETRIES, DEFAULT_TIMEOUT_MS, type DashFetchOptions, type TransportSettings } from "./core/transport.js";
import { SDK_VERSION } from "./version.js";
import type {
  DashClientOptions,
  GetPageDataOptions,
  GlobalDataResponse,
  HealthStatus,
  PageDataResponse,
  PingResponse,
} from "./types.js";

import { ProductsModule } from "./services/products.js";
import { CategoriesModule } from "./services/categories.js";
import { CartModule } from "./services/cart.js";
import {
  PagesModule,
  SeoModule,
  BrandsModule,
  BlogModule,
  SitemapModule,
  LegalModule,
  MediaModule,
  HtmlTemplatesModule,
  CoaModule,
  ContactModule,
} from "./services/content.js";
import { AuthModule } from "./services/auth.js";
import { PaymentModule } from "./services/payment.js";
import { CheckoutModule } from "./services/checkout.js";
import {
  EmailModule,
  ReferralsModule,
  PaymentMethodsModule,
  DiscountStoreModule,
  LoyaltyModule,
  EarnPointsModule,
  SubscriptionsModule,
  CalendarModule,
} from "./services/account.js";
import { ShippingModule, TaxModule, MarketingModule, AffiliatesModule } from "./services/commerce.js";
import { TrackingModule } from "./services/tracking.js";
import { InsightsModule } from "./services/insights.js";
import { UploadModule } from "./services/upload.js";
import { AdminModule } from "./services/admin.js";
import { PageGroupsModule, PageGroup, FormsModule, SurveyModule, ContentTypesModule } from "./services/collections.js";

export class DashClient {
  /** Your API key */
  readonly apiKey: string;
  /** API base URL in use (no trailing slash) */
  readonly baseURL: string;
  /** SDK version */
  version: string;
  _sessionId: string | null;
  /** Transport settings (timeout, retries, fetch). */
  readonly _transport: TransportSettings;
  /** "deidentified" (default) or "legacy" analytics payloads. */
  readonly _analyticsMode: "deidentified" | "legacy";

  readonly products: ProductsModule;
  readonly categories: CategoriesModule;
  readonly cart: CartModule;
  readonly pages: PagesModule;
  readonly seo: SeoModule;
  readonly auth: AuthModule;
  readonly payment: PaymentModule;
  readonly blog: BlogModule;
  readonly checkout: CheckoutModule;
  readonly email: EmailModule;
  readonly shipping: ShippingModule;
  readonly tracking: TrackingModule;
  readonly insights: InsightsModule;
  readonly contact: ContactModule;
  readonly upload: UploadModule;
  readonly brands: BrandsModule;
  readonly marketing: MarketingModule;
  readonly affiliates: AffiliatesModule;
  readonly tax: TaxModule;
  readonly coa: CoaModule;
  readonly legal: LegalModule;
  readonly media: MediaModule;
  readonly htmlTemplates: HtmlTemplatesModule;
  readonly referrals: ReferralsModule;
  readonly paymentMethods: PaymentMethodsModule;
  readonly discountStore: DiscountStoreModule;
  readonly loyalty: LoyaltyModule;
  readonly earnPoints: EarnPointsModule;
  readonly subscriptions: SubscriptionsModule;
  readonly sitemap: SitemapModule;
  readonly calendar: CalendarModule;
  /** Dashboard-built forms; pair with `useDashForm` from dash4devs/react. */
  readonly forms: FormsModule;
  readonly survey: SurveyModule;
  /** Page Groups (content collections). */
  readonly pageGroups: PageGroupsModule;
  /** Shortcut: `dash.pageGroup(slug)` = `dash.pageGroups.group(slug)`. */
  readonly pageGroup: (slug: string) => PageGroup;
  /** @deprecated Use `pageGroup(slug)` or `pageGroups`. */
  readonly contentTypes: ContentTypesModule;
  /** Admin CRUD. Present only with a secret (sk_) key, server-side. */
  readonly admin?: AdminModule;

  constructor(options: DashClientOptions) {
    const opts: DashClientOptions = options || ({} as DashClientOptions);
    const { apiKey, consoleWarning = true } = opts;

    // Once per page, however many clients a site creates.
    if (consoleWarning !== false && typeof window !== "undefined" && !(window as any).__dash4devsConsoleWarned) {
      (window as any).__dash4devsConsoleWarned = true;
      printConsoleWarning(typeof consoleWarning === "object" ? consoleWarning : {});
    }
    if (!apiKey) {
      throw new Error("apiKey is required");
    }

    if (!apiKey.startsWith("pk_") && !apiKey.startsWith("sk_")) {
      throw new Error("apiKey must start with 'pk_' or 'sk_'");
    }

    // SECURITY: secret keys never run in a browser.
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

    // SECURITY: a secret key in a NEXT_PUBLIC_ variable is inlined into the browser bundle.
    const leaked = findPublicSecretKeyVars();
    if (leaked.length) {
      throw new Error(
        "\n\n🚨 DASH4DEVS SECURITY ERROR 🚨\n\n" +
          `Secret key detected in ${leaked[0]}!\n` +
          "NEXT_PUBLIC_ variables are exposed to the browser.\n" +
          "Move your secret key to a non-NEXT_PUBLIC_ variable and use it only in server-side code.\n\n" +
          "Use your PUBLIC key (pk_*) for NEXT_PUBLIC_ env vars.\n"
      );
    }

    this.apiKey = apiKey;
    this.baseURL = resolveApiBase(opts);
    this._sessionId = null;
    this.version = SDK_VERSION;
    this._transport = {
      timeoutMs: typeof opts.timeoutMs === "number" && opts.timeoutMs >= 0 ? opts.timeoutMs : DEFAULT_TIMEOUT_MS,
      retries: typeof opts.retries === "number" && opts.retries >= 0 ? Math.floor(opts.retries) : DEFAULT_RETRIES,
      fetch: typeof opts.fetch === "function" ? opts.fetch : undefined,
    };
    this._analyticsMode = opts.analytics === "legacy" ? "legacy" : "deidentified";
    if (this._analyticsMode === "legacy" && typeof console !== "undefined" && !(globalThis as any).__DASH4DEVS_LEGACY_WARNED__) {
      (globalThis as any).__DASH4DEVS_LEGACY_WARNED__ = true;
      console.warn(
        "[dash4devs] analytics: \"legacy\" sends full URLs, click text, page titles and customer ids to the analytics " +
          "endpoint. On stores that sell health products this can be PHI. Prefer the default (\"deidentified\")."
      );
    }

    this._printStartupInfo();

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
    this.forms = new FormsModule(this);
    this.survey = new SurveyModule(this);
    this.pageGroups = new PageGroupsModule(this);
    this.pageGroup = (slug: string) => this.pageGroups.group(slug);

    if (apiKey.startsWith("sk_")) {
      this.admin = new AdminModule(this);
    }
    this.contentTypes = new ContentTypesModule(this);

    if (typeof window !== "undefined") {
      this._injectFooterBranding();
      this._checkLockStatus();
    }
  }

  /** "production" | "papi" | "custom" (any other base URL, e.g. local). */
  get target(): ApiTarget | "custom" {
    return describeApiBase(this.baseURL);
  }

  /** The two known API hosts. */
  static readonly API_TARGETS = API_TARGETS;

  _printStartupInfo(): void {
    // Server only: never print key information in a browser console.
    if (typeof window !== "undefined") return;

    let silent = false;
    try {
      silent = typeof process !== "undefined" && process.env?.DASH4DEVS_SILENT === "1";
    } catch {
      silent = false;
    }
    if (silent) return;
    const g = globalThis as any;
    if (!g.__DASH4DEVS_PRINTED__) g.__DASH4DEVS_PRINTED__ = new Set();
    const fingerprint = `${maskKey(this.apiKey)}|${this.baseURL}`;
    if (g.__DASH4DEVS_PRINTED__.has(fingerprint)) return;
    g.__DASH4DEVS_PRINTED__.add(fingerprint);

    const keyType = this.apiKey.startsWith("pk_") ? "Public" : "Secret";
    const env = this.apiKey.includes("_live_") ? "Production" : this.apiKey.includes("_test_") ? "Test" : "Unknown";
    const target = this.target === "custom" ? this.baseURL.replace(/^https?:\/\//, "") : this.target;

    console.log("");
    console.log("┌─────────────────────────────────────────────┐");
    console.log(`│  DashForDevs SDK v${this.version.padEnd(26)}│`);
    console.log("├──────────────────┬──────────────────────────┤");
    console.log(`│  Key Type        │  ${(keyType + " (" + env + ")").padEnd(24)} │`);
    console.log(`│  API Key         │  ${maskKey(this.apiKey).slice(0, 24).padEnd(24)} │`);
    console.log(`│  Base URL        │  ${this.baseURL.slice(0, 24).padEnd(24)} │`);
    console.log(`│  API Target      │  ${target.slice(0, 24).padEnd(24)} │`);
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
   * "Powered by DashForDevs" strip directly under the site's last <footer>,
   * nofollow and UTM-tagged with the storefront's hostname (v1 behaviour).
   */
  _injectFooterBranding(): void {
    const inject = () => {
      if (document.getElementById("dash4devs-branding")) return;

      const footers = document.querySelectorAll("footer");
      const footer = footers[footers.length - 1];
      if (!footer) {
        setTimeout(inject, 500);
        return;
      }

      if (
        footer.innerHTML.includes("dashfordevs.com") ||
        footer.innerHTML.includes("Powered by Dash4Devs") ||
        footer.innerHTML.includes("Powered by DashForDevs")
      ) {
        return;
      }

      const brandingDiv = document.createElement("div");
      brandingDiv.id = "dash4devs-branding";
      brandingDiv.style.cssText =
        "position: static; display: block; width: 100%; box-sizing: border-box; text-align: center; " +
        "padding: 12px 16px; margin: 0; font-size: 14px; line-height: 1.4; color: #6b7280; " +
        "background: #ffffff; border-top: 1px solid #e5e7eb;";

      const link = document.createElement("a");
      link.href = this._brandingHref();
      link.target = "_blank";
      link.rel = "nofollow noopener noreferrer";
      link.style.cssText = "font-weight: 600; color: #0369a1; text-decoration: none;";
      link.textContent = "DashForDevs";

      const ver = document.createElement("span");
      ver.style.cssText = "color: #4b5563; font-size: 11px; margin-left: 4px;";
      ver.textContent = `v${this.version}`;

      brandingDiv.appendChild(document.createTextNode("Powered by "));
      brandingDiv.appendChild(link);
      brandingDiv.appendChild(document.createTextNode(" "));
      brandingDiv.appendChild(ver);

      footer.insertAdjacentElement("afterend", brandingDiv);
    };

    const schedule: (fn: () => void) => void =
      typeof (globalThis as any).requestIdleCallback === "function"
        ? (fn) => (globalThis as any).requestIdleCallback(fn)
        : (fn) => setTimeout(fn, 2000);

    schedule(() => {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", inject);
      } else {
        inject();
      }
    });
  }

  _brandingHref(): string {
    const url = new URL("https://dashfordevs.com/");
    const host = (typeof location !== "undefined" && location.hostname) || "unknown";
    url.searchParams.set("utm_source", host);
    url.searchParams.set("utm_medium", "referral");
    url.searchParams.set("utm_campaign", "powered_by");
    url.searchParams.set("utm_content", "sdk-badge");
    return url.toString();
  }

  async _checkLockStatus(): Promise<void> {
    try {
      const res: any = await this.ping();
      if (res.organization?.is_locked) {
        window.location.href = "https://www.codecraftstudios.net";
      }
    } catch {
      // never block the page on ping
    }
  }

  /** Analytics session id: PostHog's when present, else a per-tab generated id. */
  getSessionId(): string {
    if (this._sessionId) return this._sessionId;
    if (typeof window !== "undefined" && (window as any).posthog) {
      const id = (window as any).posthog.get_session_id?.();
      if (id) return id;
    }
    if (typeof window !== "undefined") {
      try {
        let id = window.sessionStorage.getItem("dash4devs_session_id");
        if (!id) {
          id = "ds_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
          window.sessionStorage.setItem("dash4devs_session_id", id);
        }
        return id;
      } catch {
        return "";
      }
    }
    return "";
  }

  /** Set the session id manually (e.g. from PostHog). */
  setSessionId(id: string): void {
    this._sessionId = id;
  }

  /**
   * The request function every module uses. Public in practice (storefronts
   * call `dash._fetch(`${dash.baseURL}/api/storefront/...`)`), so its
   * signature and behaviour are kept.
   */
  _fetch<T = any>(url: string, options: DashFetchOptions = {}): Promise<T> {
    return dashFetch<T>(this, url, options);
  }

  /** Validate the API key and get organization info. */
  async ping(): Promise<PingResponse> {
    const url = `${this.baseURL}/api/storefront/ping`;
    return this._fetch(url);
  }

  /**
   * Health probe for a maintenance gate. Never throws.
   * ok:false -> render <MaintenancePage/> (maintenance on, or backend down/5xx/timeout).
   */
  async checkHealth({ timeoutMs = 2500 }: { timeoutMs?: number } = {}): Promise<HealthStatus> {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => controller?.abort(), timeoutMs);
    const down = (reason: string): HealthStatus => ({
      ok: false,
      reachable: reason.indexOf("http_") === 0,
      maintenance: true,
      locked: false,
      reason,
      message: null,
      until: null,
    });
    try {
      const impl = resolveFetch(this._transport);
      const res = await impl(`${this.baseURL}/api/storefront/ping`, {
        method: "GET",
        headers: { "X-API-Key": this.apiKey },
        cache: "no-store",
        signal: controller?.signal,
      });

      if (res.status >= 500) return down(`http_${res.status}`);

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        /* reachable but no JSON */
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
      const m = data.maintenance && typeof data.maintenance === "object" ? data.maintenance : {};
      const inMaintenance =
        m.enabled === true || m.enabled === "true" || data.maintenance === true || data.maintenance_mode === true;

      return {
        ok: !inMaintenance,
        reachable: true,
        maintenance: inMaintenance,
        locked,
        reason: inMaintenance ? "operator" : null,
        message: m.message || null,
        until: m.until || null,
      };
    } catch (err: any) {
      return down(err && err.name === "AbortError" ? "timeout" : "unreachable");
    } finally {
      clearTimeout(timer);
    }
  }

  /** Page data by path (default) or by name ({ byName: true }). */
  async getPageData(pathOrName: string, options: GetPageDataOptions = {}): Promise<PageDataResponse> {
    if (options.byName) {
      return this.pages.getByName(pathOrName);
    }
    return this.pages.getByPath(pathOrName);
  }

  /** Global store data (branding, contact info, settings). */
  async getGlobalData(): Promise<GlobalDataResponse> {
    const url = `${this.baseURL}/api/storefront/global`;
    return this._fetch(url);
  }
}

export default DashClient;

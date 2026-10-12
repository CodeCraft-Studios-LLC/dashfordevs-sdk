/**
 * Marketing Module
 *
 * Handles client-side marketing script injection (e.g. Klaviyo onsite JS).
 * Fetches the store's email provider config and injects the appropriate script tag.
 */

export class MarketingModule {
  constructor(client) {
    this.client = client;
    this._initialized = false;
    this._config = null;
  }

  /**
   * Initialize marketing scripts based on the store's email provider config.
   * Fetches /api/storefront/email/config and injects the provider's client-side JS.
   * Safe to call multiple times — only runs once.
   *
   * @returns {Promise<{active: boolean, provider: string|null}>}
   *
   * @example
   * await client.marketing.init();
   */
  async init() {
    if (this._initialized) {
      return this._config;
    }
    this._initialized = true;

    if (typeof window === "undefined") {
      // SSR — skip script injection
      return { active: false, provider: null };
    }

    try {
      const url = `${this.client.baseURL}/api/storefront/email/config`;
      const data = await this.client._fetch(url);
      this._config = data;

      if (!data.active || !data.provider) {
        return data;
      }

      const slug = data.provider.slug;

      if (slug === "klaviyo") {
        this._injectKlaviyo(data.config);
      }

      return data;
    } catch (err) {
      console.warn("Marketing init failed:", err.message);
      this._config = { active: false, provider: null };
      return this._config;
    }
  }

  /**
   * Get the cached config (call init() first).
   * @returns {Object|null}
   */
  getConfig() {
    return this._config;
  }

  /**
   * Onsite queue handle (Klaviyo `window.klaviyo`). Present once the onsite
   * snippet/loader is on the page (via init() or a hardcoded snippet).
   * @private
   */
  _klaviyo() {
    if (typeof window === "undefined") return null;
    return window.klaviyo || null;
  }

  /**
   * Associate the current anonymous browser with a known profile so onsite
   * events (Viewed Product / Active on Site) attach to that profile and can
   * power browse-abandonment flows. Safe to call repeatedly.
   *
   * @param {Object} profile - At minimum { email }. May include first_name,
   *   last_name, phone.
   */
  identify(profile) {
    const kl = this._klaviyo();
    if (!kl || !profile || !profile.email) return;
    try {
      kl.push([
        "identify",
        {
          $email: profile.email,
          ...(profile.first_name ? { $first_name: profile.first_name } : {}),
          ...(profile.last_name ? { $last_name: profile.last_name } : {}),
          ...(profile.phone ? { $phone_number: profile.phone } : {}),
        },
      ]);
    } catch (_) {}
  }

  /**
   * Push a custom onsite event to Klaviyo (client-side, anonymous-safe).
   * @param {string} event - Klaviyo metric name (e.g. "Viewed Product")
   * @param {Object} [properties]
   */
  trackOnsite(event, properties = {}) {
    const kl = this._klaviyo();
    if (!kl || !event) return;
    try {
      kl.push(["track", event, properties]);
    } catch (_) {}
  }

  /**
   * Fire Klaviyo's product-page web tracking: the "Viewed Product" metric
   * plus `trackViewedItem` (which powers "recently viewed" / browse
   * abandonment). This is the onsite event Klaviyo's "set up product web
   * tracking" checklist looks for. Anonymous-safe; no email required.
   *
   * Call once per product detail view. Requires the Klaviyo onsite snippet
   * on the page (marketing.init() or a hardcoded loader).
   *
   * @param {Object} product
   * @param {string} product.id        - Product ID (ProductID / ItemId)
   * @param {string} product.name      - Product name (Title)
   * @param {string} product.url       - Absolute product URL
   * @param {string} [product.imageUrl]
   * @param {number|string} [product.price]
   * @param {number|string} [product.compareAtPrice]
   * @param {string} [product.brand]
   * @param {string[]} [product.categories]
   * @param {string} [product.sku]
   */
  viewedProduct(product) {
    const kl = this._klaviyo();
    if (!kl || !product || !product.id || !product.name) return;

    const price =
      product.price !== undefined && product.price !== null
        ? Number(product.price)
        : undefined;
    const compareAtPrice =
      product.compareAtPrice !== undefined && product.compareAtPrice !== null
        ? Number(product.compareAtPrice)
        : undefined;
    const categories = Array.isArray(product.categories)
      ? product.categories
      : product.categories
        ? [product.categories]
        : [];

    try {
      kl.push([
        "track",
        "Viewed Product",
        {
          ProductName: product.name,
          ProductID: String(product.id),
          ...(product.sku ? { SKU: product.sku } : {}),
          Categories: categories,
          ...(product.imageUrl ? { ImageURL: product.imageUrl } : {}),
          URL: product.url,
          ...(product.brand ? { Brand: product.brand } : {}),
          ...(price !== undefined ? { Price: price } : {}),
          ...(compareAtPrice !== undefined
            ? { CompareAtPrice: compareAtPrice }
            : {}),
        },
      ]);

      // Feeds Klaviyo's catalog "recently viewed" / browse-abandonment.
      kl.push([
        "trackViewedItem",
        {
          Title: product.name,
          ItemId: String(product.id),
          Categories: categories,
          ...(product.imageUrl ? { ImageUrl: product.imageUrl } : {}),
          Url: product.url,
          Metadata: {
            ...(product.brand ? { Brand: product.brand } : {}),
            ...(price !== undefined ? { Price: price } : {}),
            ...(compareAtPrice !== undefined
              ? { CompareAtPrice: compareAtPrice }
              : {}),
          },
        },
      ]);
    } catch (_) {}
  }

  /**
   * Inject Klaviyo onsite JS script tag.
   * @private
   */
  _injectKlaviyo(config) {
    const companyId = config?.company_id;
    if (!companyId) {
      console.warn("Klaviyo company_id not configured");
      return;
    }

    // Avoid duplicate injection
    if (document.getElementById("klaviyo-onsite-js")) {
      return;
    }

    const script = document.createElement("script");
    script.id = "klaviyo-onsite-js";
    script.async = true;
    script.type = "text/javascript";
    script.src = `https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=${companyId}`;
    document.head.appendChild(script);
  }
}

export default MarketingModule;

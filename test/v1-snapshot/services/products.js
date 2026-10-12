/**
 * Products Module
 *
 * Provides access to product listing and details from the storefront API.
 */

export class ProductsModule {
  constructor(client) {
    this.client = client;
  }

  /**
   * List products with optional filters
   * @param {Object} options - Query options
   * @param {number} options.limit - Number of products per page (default: 20, max: 100)
   * @param {number} options.offset - Pagination offset (default: 0)
   * @param {string} options.category - Filter by category slug. Comma-separate
   *   for several ("flower,deals") to match ANY of them. Matches a product's
   *   primary category and any additional categories it was assigned to, so a
   *   product listed under "deals" is returned even if its primary is "flower".
   * @param {string} options.brand - Filter by brand slug
   * @param {string} options.search - Search in product name
   * @param {string[]} options.include - Include additional fields (e.g. ["main_size", "variations"])
   * @param {Object} options.customFields - Filter by custom fields (e.g. {popular: true, homepage_section: "hero"})
   * @param {boolean} options.expand - Whether to expand per_variation products into separate cards (default: true)
   * @returns {Promise<{products: Array, pagination: Object}>}
   *
   * @example
   * // Get featured products for homepage with main_size for pricing
   * const featured = await client.products.list({
   *   customFields: { featured: true, homepage_section: "hero" },
   *   include: ["main_size"],
   *   limit: 6
   * });
   *
   * @example
   * // Get new arrivals
   * const newArrivals = await client.products.list({
   *   customFields: { new_arrival: true },
   *   limit: 12
   * });
   *
   * @example
   * // Products in a category, including ones whose PRIMARY category is
   * // something else but that were also assigned to "deals".
   * const deals = await client.products.list({ category: "deals" });
   *
   * // Each product reports its full membership; `category` stays the primary,
   * // so keep building URLs from that one.
   * deals.products.forEach((p) => {
   *   console.log(p.name, p.categories.map((c) => c.slug));
   * });
   */
  async list(options = {}) {
    const params = new URLSearchParams();

    if (options.limit) params.append("limit", options.limit);
    if (options.offset) params.append("offset", options.offset);
    if (options.category) params.append("category", options.category);
    if (options.brand) params.append("brand", options.brand);
    if (options.search || options.q) params.append("search", options.search || options.q);

    // Include additional fields (e.g., main_size for pricing details)
    if (options.include && Array.isArray(options.include)) {
      params.append("include", options.include.join(","));
    }

    // Per-variation expansion control
    if (options.expand === false) params.append("expand", "false");

    // Custom fields filtering - prefix with cf_
    if (options.customFields && typeof options.customFields === "object") {
      for (const [key, value] of Object.entries(options.customFields)) {
        params.append(`cf_${key}`, String(value));
      }
    }

    const queryString = params.toString();
    const url = `${this.client.baseURL}/api/storefront/products${queryString ? `?${queryString}` : ""}`;

    return this.client._fetch(url);
  }

  /**
   * Get a single product by slug
   * @param {string} slug - Product slug
   * @returns {Promise<{product: Object}>}
   */
  async get(slug) {
    const url = `${this.client.baseURL}/api/storefront/products/${encodeURIComponent(slug)}`;
    return this.client._fetch(url);
  }

  /**
   * Get lightweight core product data for SSR (no variations/sizes/bulk discounts).
   * Returns name, description, images, features, qna, seo, avg_rating, reviews_count, price_range.
   * @param {string} slug - Product slug
   * @returns {Promise<{product: Object}>}
   */
  async getCore(slug) {
    const url = `${this.client.baseURL}/api/storefront/products/${encodeURIComponent(slug)}/core`;
    return this.client._fetch(url);
  }

  /**
   * Get heavy options data for a product (variations, sizes, bulk discounts, related, includes).
   * Intended for client-side fetching after SSR of core data.
   * @param {string} slug - Product slug
   * @returns {Promise<{options: Object}>}
   */
  async getOptions(slug) {
    const url = `${this.client.baseURL}/api/storefront/products/${encodeURIComponent(slug)}/options`;
    return this.client._fetch(url);
  }

  /**
   * Get reviews for a product
   * @param {string} slug - Product slug
   * @param {Object} options - Query options
   * @param {number} options.limit - Number of reviews per page (default: 20)
   * @param {number} options.offset - Pagination offset (default: 0)
   * @returns {Promise<{reviews: Array, stats: Object, pagination: Object}>}
   *
   * @example
   * const { reviews, stats } = await client.products.getReviews("blue-widget");
   * console.log(`${stats.count} reviews, avg rating: ${stats.average_rating}`);
   */
  async getReviews(slug, options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.append("limit", options.limit);
    if (options.offset) params.append("offset", options.offset);

    const queryString = params.toString();
    const url = `${this.client.baseURL}/api/storefront/products/${encodeURIComponent(slug)}/reviews${queryString ? `?${queryString}` : ""}`;
    return this.client._fetch(url);
  }

  /**
   * Submit a review for a product
   * @param {string} slug - Product slug
   * @param {Object} data - Review data
   * @param {number} data.rating - Rating from 1-5 (required)
   * @param {string} data.author_name - Reviewer name (required)
   * @param {string} [data.author_email] - Reviewer email (optional)
   * @param {string} [data.title] - Review title (optional)
   * @param {string} [data.body] - Review content (optional)
   * @param {string} [data.variation_slug] - Variation slug (optional)
   * @param {string[]} [data.media_urls] - Array of media URLs (optional)
   * @returns {Promise<{review: Object}>}
   */
  async submitReview(slug, data) {
    const url = `${this.client.baseURL}/api/storefront/products/${encodeURIComponent(slug)}/reviews`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * Get all approved reviews across all products
   * @param {Object} options - Query options
   * @param {number} [options.limit] - Number of reviews per page (default: 20)
   * @param {number} [options.offset] - Pagination offset (default: 0)
   * @returns {Promise<{reviews: Array, avg_rating: number, total: number, pagination: Object}>}
   */
  async getAllReviews(options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.append("limit", options.limit);
    if (options.offset) params.append("offset", options.offset);
    if (options.product) params.append("product", options.product);
    if (options.rating) params.append("rating", options.rating);
    if (options.sort) params.append("sort", options.sort);
    if (options.has_media) params.append("has_media", options.has_media);
    const qs = params.toString();
    const url = `${this.client.baseURL}/api/storefront/reviews${qs ? `?${qs}` : ""}`;
    return this.client._fetch(url);
  }

  /**
   * Get featured variations (variations with show_in_bg custom field)
   * @returns {Promise<{variations: Array}>}
   */
  async getFeaturedVariations() {
    const url = `${this.client.baseURL}/api/storefront/featured-variations`;
    return this.client._fetch(url);
  }

  /**
   * Get the labelled file attachments for a product.
   * Files are managed per-product in the dashboard, each tagged with a `label`
   * (e.g. "coa", "lab-report", "spec-sheet", "manual"). Returned already sorted
   * by `order`.
   *
   * These hang off the product itself, so a product with no variations can
   * still carry files — unlike the per-variation files exposed via
   * `product.lab_reports`.
   *
   * @param {string} slug - Product slug
   * @param {Object} [options]
   * @param {string} [options.label] - Only return files with this exact label
   * @returns {Promise<Array<{id: string, url: string, label: string, name: string, order: number}>>}
   *
   * @example
   * const coas = await dash.products.getFiles("thca-pre-rolls-classic", { label: "coa" });
   */
  async getFiles(slug, options = {}) {
    const res = await this.get(slug);
    const files = (res && res.product && res.product.files) || [];
    if (options.label != null && options.label !== "") {
      return files.filter((f) => f.label === options.label);
    }
    return files;
  }

  /**
   * Get a single file from a product by label. When multiple files share the
   * label, the one with the lowest `order` is returned. Returns null if none.
   *
   * @param {string} slug - Product slug
   * @param {string} label - The file label to select
   * @returns {Promise<{id: string, url: string, label: string, name: string, order: number} | null>}
   *
   * @example
   * const coa = await dash.products.getFile("thca-pre-rolls-classic", "coa");
   * if (coa) window.open(coa.url);
   */
  async getFile(slug, label) {
    const files = await this.getFiles(slug, { label });
    return files.length ? files[0] : null;
  }
}

export default ProductsModule;

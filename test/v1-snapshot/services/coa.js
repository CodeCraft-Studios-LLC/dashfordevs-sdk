/**
 * COA (Certificate of Analysis) Module
 *
 * Provides access to lab report / COA data from the storefront API.
 * Products that have variations with lab-report files are considered to have COAs.
 */

export class CoaModule {
  constructor(client) {
    this.client = client;
  }

  /**
   * List products that have at least one variation with a lab-report file.
   * @param {Object} [options] - Query options
   * @param {string} [options.q] - Search query to filter by product name
   * @returns {Promise<{products: Array, total_products: number}>}
   *
   * @example
   * const { products, total_products } = await client.coa.list();
   * const filtered = await client.coa.list({ q: "gummy" });
   */
  async list(options = {}) {
    const params = new URLSearchParams();
    if (options.q) params.append("q", options.q);
    if (options.includeVariations) params.append("include_variations", "true");

    const queryString = params.toString();
    const url = `${this.client.baseURL}/api/storefront/coa${queryString ? `?${queryString}` : ""}`;
    return this.client._fetch(url);
  }

  /**
   * Get a product and its variations that have COA files.
   * @param {string} productSlug - Product SEO slug
   * @returns {Promise<{product: Object, variations: Array, total_variations: number}>}
   *
   * @example
   * const { product, variations } = await client.coa.getProduct("my-product");
   */
  async getProduct(productSlug) {
    if (!productSlug) {
      throw new Error("productSlug is required");
    }
    const url = `${this.client.baseURL}/api/storefront/coa/${encodeURIComponent(productSlug)}`;
    return this.client._fetch(url);
  }

  /**
   * Get a single variation's COA detail (lab report URL).
   * @param {string} productSlug - Product SEO slug
   * @param {string} variationSlug - Variation slug
   * @returns {Promise<{product: Object, variation: Object}>}
   *
   * @example
   * const { product, variation } = await client.coa.getVariation("my-product", "strain-a");
   * console.log(variation.lab_report_url); // "https://..."
   */
  async getVariation(productSlug, variationSlug) {
    if (!productSlug) {
      throw new Error("productSlug is required");
    }
    if (!variationSlug) {
      throw new Error("variationSlug is required");
    }
    const url = `${this.client.baseURL}/api/storefront/coa/${encodeURIComponent(productSlug)}/${encodeURIComponent(variationSlug)}`;
    return this.client._fetch(url);
  }
}

export default CoaModule;

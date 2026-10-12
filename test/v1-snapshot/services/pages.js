/**
 * Pages Module
 *
 * Provides flexible page data fetching for any routing structure.
 * The key selling point: use whatever URLs you want (/about, /shop, /products, etc.)
 * and just fetch the data - the backend handles the mapping.
 */

export class PagesModule {
  constructor(client) {
    this.client = client;
  }

  /**
   * List all configured pages
   * Useful for generating sitemaps or navigation
   * @returns {Promise<{pages: Array}>}
   */
  async list() {
    const url = `${this.client.baseURL}/api/storefront/pages`;
    return this.client._fetch(url);
  }

  /**
   * Get page data by path (with dynamic route support)
   * @param {string} path - URL path to match (e.g., "/", "/products/my-product")
   * @returns {Promise<{page: Object, params: Object, global: Object, data: Object}>}
   *
   * @example
   * // For route "/products/<slug>", passing "/products/my-product" returns:
   * // params = { slug: "my-product" }
   * // data = { product: {...}, related_products: [...] }
   */
  async getByPath(path) {
    const url = `${this.client.baseURL}/api/storefront/page?path=${encodeURIComponent(path)}`;
    return this.client._fetch(url);
  }

  /**
   * Get page data by name
   * @param {string} name - Page name identifier (e.g., "home", "product-detail")
   * @returns {Promise<{page: Object, params: Object, global: Object, data: Object}>}
   */
  async getByName(name) {
    const url = `${this.client.baseURL}/api/storefront/page?name=${encodeURIComponent(name)}`;
    return this.client._fetch(url);
  }
}

export default PagesModule;

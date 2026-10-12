/**
 * Brands Module
 *
 * Provides access to brand listing and details from the storefront API.
 */

export class BrandsModule {
  constructor(client) {
    this.client = client;
  }

  /**
   * List all active brands
   * @returns {Promise<{brands: Array}>}
   *
   * @example
   * const { brands } = await client.brands.list();
   * console.log(brands); // [{ id, name, slug, image }, ...]
   */
  async list() {
    const url = `${this.client.baseURL}/api/storefront/brands`;
    return this.client._fetch(url);
  }

  /**
   * Get a single brand with its products
   * @param {string} slug - Brand slug
   * @param {Object} options - Query options
   * @param {number} options.limit - Number of products (default: 50)
   * @param {number} options.offset - Pagination offset
   * @returns {Promise<{brand: Object, products: Array, pagination: Object}>}
   *
   * @example
   * const { brand, products } = await client.brands.get("my-brand");
   */
  async get(slug, options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.append("limit", options.limit);
    if (options.offset) params.append("offset", options.offset);

    const queryString = params.toString();
    const url = `${this.client.baseURL}/api/storefront/brands/${encodeURIComponent(slug)}${queryString ? `?${queryString}` : ""}`;
    return this.client._fetch(url);
  }
}

export default BrandsModule;

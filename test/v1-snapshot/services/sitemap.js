/**
 * Sitemap Module
 *
 * Provides lightweight slug + lastmod data for sitemap generation.
 */

export class SitemapModule {
  constructor(client) {
    this.client = client;
  }

  /**
   * Get all sitemap data (products, categories, brands, blogs)
   * @returns {Promise<{products: Array<{slug: string, updated_at: string}>, categories: Array<{slug: string, updated_at: string}>, brands: Array<{slug: string, updated_at: string}>, blogs: Array<{slug: string, updated_at: string}>}>}
   *
   * @example
   * const { products, categories, brands, blogs } = await client.sitemap.get();
   */
  async get() {
    const url = `${this.client.baseURL}/api/storefront/sitemap`;
    return this.client._fetch(url);
  }
}

export default SitemapModule;

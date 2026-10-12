/**
 * SEO Module
 *
 * Provides lightweight access to SEO metadata for products (and future content types).
 * Use this for generating meta tags without fetching full entity data.
 */

export class SeoModule {
  constructor(client) {
    this.client = client;
  }

  /**
   * Get SEO metadata for a product
   * @param {string} slug - Product slug
   * @returns {Promise<{seo: Object}>}
   *
   * @example
   * const { seo } = await dash.seo.product("my-product");
   * // Returns:
   * // {
   * //   title: "Product Title",
   * //   description: "Meta description...",
   * //   keywords: "keyword1, keyword2",
   * //   og_image: "https://...",
   * //   schema: { "@type": "Product", ... },
   * //   canonical_slug: "my-product"
   * // }
   */
  async product(slug) {
    const url = `${this.client.baseURL}/api/storefront/seo/product/${encodeURIComponent(slug)}`;
    return this.client._fetch(url);
  }

  /**
   * Get SEO metadata for a blog post
   * @param {string} slug - Blog post slug
   * @returns {Promise<{seo: Object}>}
   */
  async blogPost(slug) {
    const url = `${this.client.baseURL}/api/storefront/seo/blog/${encodeURIComponent(slug)}`;
    return this.client._fetch(url);
  }
}

export default SeoModule;

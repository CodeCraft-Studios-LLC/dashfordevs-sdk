/**
 * Content Types Module
 *
 * Fetch generic content types (Services, Industries, Locations, etc.)
 * and their items from the storefront API.
 */

export class ContentTypesModule {
  constructor(client) {
    this.client = client;
  }

  /**
   * List all active content types for this organization.
   *
   * @returns {Promise<{content_types: Array}>}
   *
   * @example
   * const { content_types } = await dash.contentTypes.list();
   * // content_types = [{ id, name, plural_name, slug, singular_path, item_count, ... }]
   */
  async list() {
    const url = `${this.client.baseURL}/api/storefront/content-types`;
    return this.client._fetch(url);
  }

  /**
   * List published items for a content type.
   *
   * @param {string} typeSlug - The content type slug (e.g., "services")
   * @param {Object} [options]
   * @param {number} [options.limit=50] - Max items to return
   * @param {number} [options.offset=0] - Pagination offset
   * @returns {Promise<{content_type: Object, items: Array, total: number}>}
   *
   * @example
   * const { items } = await dash.contentTypes.listItems("services");
   */
  async listItems(typeSlug, options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.append("limit", String(options.limit));
    if (options.offset) params.append("offset", String(options.offset));
    const qs = params.toString();
    const url = `${this.client.baseURL}/api/storefront/content-types/${encodeURIComponent(typeSlug)}${qs ? `?${qs}` : ""}`;
    return this.client._fetch(url);
  }

  /**
   * Get a single published item with full content.
   *
   * @param {string} typeSlug - The content type slug
   * @param {string} itemSlug - The item slug
   * @returns {Promise<{item: Object}>}
   *
   * @example
   * const { item } = await dash.contentTypes.getItem("services", "plumbing");
   * // item = { id, title, slug, content, featured_image, custom_fields, seo_*, ... }
   */
  async getItem(typeSlug, itemSlug) {
    const url = `${this.client.baseURL}/api/storefront/content-types/${encodeURIComponent(typeSlug)}/${encodeURIComponent(itemSlug)}`;
    return this.client._fetch(url);
  }
}

export default ContentTypesModule;

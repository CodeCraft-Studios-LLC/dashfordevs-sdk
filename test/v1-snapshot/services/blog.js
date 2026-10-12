/**
 * Blog Module
 *
 * Provides access to blog posts and categories from the storefront API.
 */

export class BlogModule {
  constructor(client) {
    this.client = client;
  }

  /**
   * List published blog posts with optional filters
   * @param {Object} options - Query options
   * @param {number} options.limit - Number of posts per page (default: 20, max: 100)
   * @param {number} options.offset - Pagination offset (default: 0)
   * @param {string} options.category - Filter by category slug
   * @param {string} options.tag - Filter by tag
   * @param {string} options.search - Search in title and excerpt
   * @param {boolean} options.featured - Only featured posts
   * @param {Object} options.customFields - Filter by custom fields (e.g. {sidebar_featured: true})
   * @returns {Promise<{posts: Array, pagination: Object}>}
   *
   * @example
   * // Get posts for sidebar widget
   * const sidebarPosts = await client.blog.list({
   *   customFields: { show_in_sidebar: true },
   *   limit: 5
   * });
   *
   * @example
   * // Get posts for a specific homepage section
   * const homepagePosts = await client.blog.list({
   *   customFields: { homepage_section: "latest_news" },
   *   limit: 3
   * });
   */
  async list(options = {}) {
    const params = new URLSearchParams();

    const limit = options.limit || 20;
    if (options.limit) params.append("limit", options.limit);
    if (options.page && options.page > 1) {
      params.append("offset", String((options.page - 1) * limit));
    } else if (options.offset) {
      params.append("offset", options.offset);
    }
    if (options.category) params.append("category", options.category);
    if (options.tag) params.append("tag", options.tag);
    if (options.search) params.append("search", options.search);
    if (options.featured) params.append("featured", "true");

    // Custom fields filtering - prefix with cf_
    if (options.customFields && typeof options.customFields === "object") {
      for (const [key, value] of Object.entries(options.customFields)) {
        params.append(`cf_${key}`, String(value));
      }
    }

    const queryString = params.toString();
    const url = `${this.client.baseURL}/api/storefront/blog/posts${queryString ? `?${queryString}` : ""}`;

    return this.client._fetch(url);
  }

  /**
   * Get a single blog post by slug (with full content)
   * @param {string} slug - Blog post slug
   * @param {Object} options - Options
   * @param {string} options.trackViews - View tracking mode: "session" (default, once per IP per 30min), "always", or "none"
   * @returns {Promise<{post: Object}>}
   */
  async get(slug, options = {}) {
    const params = new URLSearchParams();

    if (options.trackViews) params.append("track_views", options.trackViews);

    const queryString = params.toString();
    const url = `${this.client.baseURL}/api/storefront/blog/posts/${encodeURIComponent(slug)}${queryString ? `?${queryString}` : ""}`;
    return this.client._fetch(url);
  }

  /**
   * Get SEO metadata for a blog post
   * @param {string} slug - Blog post slug
   * @returns {Promise<{seo: Object}>}
   */
  async getSeo(slug) {
    const url = `${this.client.baseURL}/api/storefront/seo/blog/${encodeURIComponent(slug)}`;
    return this.client._fetch(url);
  }

  /**
   * List active blog categories
   * @returns {Promise<{categories: Array}>}
   */
  async listCategories() {
    const url = `${this.client.baseURL}/api/storefront/blog/categories`;
    return this.client._fetch(url);
  }
}

export default BlogModule;

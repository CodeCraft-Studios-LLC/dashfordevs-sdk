/**
 * Categories Module
 *
 * Provides access to category listing and details from the storefront API.
 * Supports nested categories with tree structure and depth-based filtering.
 */

export class CategoriesModule {
  constructor(client) {
    this.client = client;
  }

  /**
   * List categories
   * @param {Object} options - Query options
   * @param {boolean} options.tree - If true, returns nested tree structure with children
   * @param {string} options.parent - Filter by parent category slug
   * @param {number} options.depth - Filter by depth level (0 = root, 1 = first level children, etc.)
   * @param {Object} options.customFields - Filter by custom fields (e.g. {show_in_mega_menu: true})
   * @returns {Promise<{categories: Array}>}
   *
   * @example
   * // Get categories for mega menu
   * const menuCategories = await client.categories.list({
   *   customFields: { show_in_mega_menu: true }
   * });
   *
   * @example
   * // Get featured categories for homepage
   * const featured = await client.categories.list({
   *   customFields: { featured_on_homepage: true },
   *   depth: 0
   * });
   */
  async list(options = {}) {
    const params = new URLSearchParams();

    if (options.tree) params.append("tree", "true");
    if (options.parent) params.append("parent", options.parent);
    if (options.depth !== undefined) params.append("depth", options.depth);

    // Custom fields filtering - prefix with cf_
    if (options.customFields && typeof options.customFields === "object") {
      for (const [key, value] of Object.entries(options.customFields)) {
        params.append(`cf_${key}`, String(value));
      }
    }

    const queryString = params.toString();
    const url = `${this.client.baseURL}/api/storefront/categories${queryString ? `?${queryString}` : ""}`;

    return this.client._fetch(url);
  }

  /**
   * Get a single category with its products.
   *
   * Returns every product in the category — both the ones whose primary
   * category this is, and the ones that merely list it as an additional
   * category. Each product's own `category` field still points at ITS primary,
   * which may not be this category, so build product URLs from `product.category`
   * rather than assuming the category you fetched.
   *
   * @param {string} slug - Category slug
   * @param {Object} options - Query options
   * @param {boolean} options.includeProducts - Include products in response (default: true)
   * @param {boolean} options.includeChildren - Include nested child categories (default: true)
   * @param {number} options.limit - Number of products
   * @param {number} options.offset - Pagination offset
   * @returns {Promise<{category: Object}>}
   */
  async get(slug, options = {}) {
    const params = new URLSearchParams();

    if (options.includeProducts === false) params.append("include_products", "false");
    if (options.includeChildren === false) params.append("include_children", "false");
    if (options.limit) params.append("limit", options.limit);
    if (options.offset) params.append("offset", options.offset);

    const queryString = params.toString();
    const url = `${this.client.baseURL}/api/storefront/categories/${encodeURIComponent(slug)}${queryString ? `?${queryString}` : ""}`;

    return this.client._fetch(url);
  }

  /**
   * Get categories at a specific depth level
   * Convenience method for building navbars (depth 0) or submenus
   * @param {number} depth - Depth level (0 = root categories)
   * @returns {Promise<{categories: Array}>}
   */
  async getByDepth(depth = 0) {
    return this.list({ depth });
  }

  /**
   * Get category tree starting from root
   * Returns full nested hierarchy
   * @returns {Promise<{categories: Array}>}
   */
  async getTree() {
    return this.list({ tree: true });
  }

  /**
   * Get children of a specific category
   * @param {string} parentSlug - Parent category slug
   * @returns {Promise<{categories: Array}>}
   */
  async getChildren(parentSlug) {
    return this.list({ parent: parentSlug });
  }

  /**
   * Get the labelled file attachments for a category.
   * Files are managed per-category in the dashboard, each tagged with a `label`
   * (e.g. "menu", "coa", "lab-report"). Returned already sorted by `order`.
   *
   * @param {string} slug - Category slug
   * @param {Object} [options]
   * @param {string} [options.label] - Only return files with this exact label
   * @returns {Promise<Array<{id: string, url: string, label: string, name: string, order: number}>>}
   *
   * @example
   * const menus = await dash.categories.getFiles("thca-flower", { label: "menu" });
   */
  async getFiles(slug, options = {}) {
    const res = await this.get(slug, { includeProducts: false, includeChildren: false });
    const files = (res && res.category && res.category.files) || [];
    if (options.label != null && options.label !== "") {
      return files.filter((f) => f.label === options.label);
    }
    return files;
  }

  /**
   * Get a single file from a category by label. When multiple files share the
   * label, the one with the lowest `order` is returned. Returns null if none.
   *
   * @param {string} slug - Category slug
   * @param {string} label - The file label to select
   * @returns {Promise<{id: string, url: string, label: string, name: string, order: number} | null>}
   *
   * @example
   * const coa = await dash.categories.getFile("thca-flower", "coa");
   * if (coa) window.open(coa.url);
   */
  async getFile(slug, label) {
    const files = await this.getFiles(slug, { label });
    return files.length ? files[0] : null;
  }
}

export default CategoriesModule;

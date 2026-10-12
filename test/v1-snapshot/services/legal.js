/**
 * Legal Documents Module
 *
 * Provides access to published legal documents (privacy policy, terms, etc.)
 * from the storefront API.
 */

export class LegalModule {
  constructor(client) {
    this.client = client;
  }

  /**
   * List all published legal documents (title, slug, updated_at)
   * @returns {Promise<{documents: Array}>}
   */
  async list() {
    const url = `${this.client.baseURL}/api/storefront/legal`;
    return this.client._fetch(url);
  }

  /**
   * Get a single legal document by slug (full content)
   * @param {string} slug - Document slug (e.g. "privacy-policy")
   * @returns {Promise<{document: Object}>}
   */
  async get(slug) {
    const url = `${this.client.baseURL}/api/storefront/legal/${encodeURIComponent(slug)}`;
    return this.client._fetch(url);
  }
}

export default LegalModule;

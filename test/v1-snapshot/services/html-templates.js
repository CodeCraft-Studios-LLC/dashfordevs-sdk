/**
 * HTML Templates Module
 *
 * Fetches reusable HTML snippets managed in dashfordevs under
 * Operations > HTML Templates. Storefronts reference templates by id (or slug)
 * — typically stored in something like `product.custom_fields.snippet` —
 * and inject the returned HTML server-side or client-side.
 */

export class HtmlTemplatesModule {
  constructor(client) {
    this.client = client;
  }

  /**
   * Fetch an HTML template by id or slug. Inactive templates return 404.
   *
   * @param {string} idOrSlug - Template id (e.g. "htmltmpl__...") or slug
   * @returns {Promise<{template: {id: string, slug: string, name: string, html: string}}>}
   *
   * @example
   * const { template } = await dash.htmlTemplates.get("htmltmpl__abc123");
   * // template.html → raw HTML string ready to inject
   */
  async get(idOrSlug) {
    const url = `${this.client.baseURL}/api/storefront/html-templates/${encodeURIComponent(idOrSlug)}`;
    return this.client._fetch(url);
  }
}

export default HtmlTemplatesModule;

/**
 * Contact Module
 *
 * Provides contact form submission functionality with Cloudflare Turnstile captcha.
 */

export class ContactModule {
  constructor(client) {
    this.client = client;
  }

  /**
   * Submit a contact form
   * @param {Object} data - Form data
   * @param {string} data.name - Contact name (required)
   * @param {string} data.email - Contact email (required)
   * @param {string} data.content - Message content (required)
   * @param {string} [data.phone] - Phone number (optional)
   * @param {string} [data.subject] - Subject line (optional)
   * @param {string[]} [data.files] - Array of file URLs (optional)
   * @param {string} [data.source_url] - URL where form was submitted from (optional)
   * @param {string} [data.session_id] - Session ID for tracking (optional)
   * @param {Object} [data.cookies] - Cookies object for tracking (optional)
   * @param {Object} [data.metadata] - Additional metadata (optional)
   * @param {string} [data.turnstile_token] - Cloudflare Turnstile token (optional - for spam protection)
   * @returns {Promise<{success: boolean, message: string, submission_id: string}>}
   *
   * @example
   * const result = await dash.contact.submit({
   *   name: "John Doe",
   *   email: "john@example.com",
   *   content: "Hello, I have a question...",
   *   metadata: { page: "pricing", campaign: "summer2024" }
   * });
   */
  async submit(data) {
    const url = `${this.client.baseURL}/api/storefront/contact`;

    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
}

export default ContactModule;

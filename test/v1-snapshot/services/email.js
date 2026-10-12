/**
 * Email Module
 *
 * Provides email/marketing integration (Klaviyo) via the platform API.
 * Klaviyo API keys stay server-side — this module proxies through the platform.
 */

export class EmailModule {
  constructor(client) {
    this.client = client;
  }

  /**
   * Identify/update a customer profile in the email provider.
   * @param {Object} options
   * @param {string} options.email - Customer email (required)
   * @param {string} [options.first_name] - Customer first name
   * @param {string} [options.last_name] - Customer last name
   * @param {string} [options.phone] - Customer phone
   * @param {Object} [options.properties] - Additional custom properties
   * @returns {Promise<{message: string}>}
   */
  async identify(options) {
    const { email, first_name, last_name, phone, properties } = options;

    if (!email) {
      throw new Error("email is required");
    }

    const url = `${this.client.baseURL}/api/storefront/email/identify`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify({
        email,
        first_name,
        last_name,
        phone,
        properties,
      }),
    });
  }

  /**
   * Track an event in the email provider (e.g. Klaviyo).
   * Events can trigger flows (like order confirmations, abandoned cart, etc.)
   * @param {Object} options
   * @param {string} options.email - Customer email (required)
   * @param {string} options.event - Event name (required, e.g. "Added to Cart")
   * @param {Object} [options.properties] - Event-specific data
   * @returns {Promise<{message: string}>}
   */
  async track(options) {
    const { email, event, properties } = options;

    if (!email) {
      throw new Error("email is required");
    }
    if (!event) {
      throw new Error("event name is required");
    }

    const url = `${this.client.baseURL}/api/storefront/email/track`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify({
        email,
        event,
        properties,
      }),
    });
  }
}

export default EmailModule;

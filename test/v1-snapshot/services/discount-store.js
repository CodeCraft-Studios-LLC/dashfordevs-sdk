/**
 * Discount Store Module
 *
 * Provides loyalty-point redemption for discount products.
 * Customers spend points to receive one-time discount codes.
 */

export class DiscountStoreModule {
  constructor(client) {
    this.client = client;
  }

  /**
   * List available discount store products.
   * Optionally returns customer's point balance if authenticated.
   * @returns {Promise<{products: Array, customer_points: number|null}>}
   */
  async list() {
    const url = `${this.client.baseURL}/api/storefront/discount-store`;
    return this.client._fetch(url);
  }

  /**
   * Redeem a discount store product using loyalty points.
   * Requires Bearer token authentication.
   * @param {string} productId - The discount store product ID to redeem
   * @returns {Promise<{success: boolean, discount_code: Object, points_remaining: number}>}
   */
  async redeem(productId) {
    const token = this.client.auth._accessToken;
    if (!token) throw new Error("Not authenticated");
    const url = `${this.client.baseURL}/api/storefront/discount-store/redeem`;
    return this.client._fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ product_id: productId }),
    });
  }
}

export default DiscountStoreModule;

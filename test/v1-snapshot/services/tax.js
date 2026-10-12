/**
 * Tax Module
 *
 * Provides per-state, per-cannabinoid tax calculations via the platform API.
 * Handles tax rate lookups, legality checks, and cost breakdowns so developers
 * don't need to implement tax logic on their frontend.
 *
 * Usage:
 *   const result = await dash.tax.calculate({ state: "CA", cart_id: dash.cart.cartId });
 *   const total  = dash.tax.getTotal(result);
 *   const legal  = result.is_legal;
 */

export class TaxModule {
  constructor(client) {
    this.client = client;

    /** @private Cache of tax results keyed by "STATE:cart_id" or "STATE:items_hash" */
    this._cache = {};
  }

  // ===========================================================================
  // CORE API METHOD
  // ===========================================================================

  /**
   * Calculate tax for items in a given state.
   * Sends items or a cart_id to the backend which applies per-state,
   * per-cannabinoid rates. Falls back to flat org tax rate if no state
   * configs are set up.
   *
   * @param {Object} options
   * @param {string} options.state - Two-letter US state code (e.g., "CA")
   * @param {string} [options.zip] - Ship-to ZIP, for county/city rates where the platform has them (NY)
   * @param {string} [options.cart_id] - Cart ID to calculate tax for
   * @param {Array} [options.items] - Manual items list [{price, quantity, cannabinoid_type}]
   * @returns {Promise<TaxCalculateResponse>} Tax calculation result
   *
   * @example
   * // Using cart (recommended during checkout)
   * const result = await dash.tax.calculate({ state: "CA", cart_id: dash.cart.cartId });
   *
   * @example
   * // Using manual items (for estimates)
   * const result = await dash.tax.calculate({
   *   state: "CA",
   *   items: [{ price: 49.99, quantity: 2, cannabinoid_type: "delta9" }]
   * });
   */
  async calculate(options = {}) {
    const url = `${this.client.baseURL}/api/storefront/tax/calculate`;
    const result = await this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(options),
    });

    // Cache the result for quick re-access
    const cacheKey = this._getCacheKey(options);
    this._cache[cacheKey] = result;

    return result;
  }

  // ===========================================================================
  // CONVENIENCE HELPERS — Cart Integration
  // ===========================================================================

  /**
   * Calculate tax for the current cart in a given state.
   * Automatically uses the cart module's cart ID — no need to pass it manually.
   *
   * @param {string} state - Two-letter US state code (e.g., "CA")
   * @returns {Promise<TaxCalculateResponse>} Tax calculation result
   * @throws {Error} If no cart exists (cart is empty or not initialized)
   *
   * @example
   * const result = await dash.tax.calculateForCart("NY");
   * console.log(result.total_tax);  // "8.50"
   * console.log(result.is_legal);   // true
   */
  async calculateForCart(state) {
    const cartId = this.client.cart?.cartId;
    if (!cartId) {
      throw new Error("No active cart. Add items to cart before calculating tax.");
    }
    return this.calculate({ state, cart_id: cartId });
  }

  // ===========================================================================
  // CONVENIENCE HELPERS — Legality Checks
  // ===========================================================================

  /**
   * Check if all items in the cart are legal to sell in a given state.
   * Calls calculate() and returns a simple boolean + details about illegal items.
   *
   * @param {string} state - Two-letter US state code
   * @param {Object} [options] - Additional options
   * @param {string} [options.cart_id] - Cart ID (defaults to current cart)
   * @param {Array} [options.items] - Manual items list
   * @returns {Promise<{legal: boolean, illegal_items: Array, state_name: string}>}
   *
   * @example
   * const check = await dash.tax.checkLegality("ID");
   * if (!check.legal) {
   *   console.log("Cannot ship to", check.state_name);
   *   check.illegal_items.forEach(item => console.log(item.message));
   * }
   */
  async checkLegality(state, options = {}) {
    const calcOptions = { state, ...options };

    // Default to current cart if no items or cart_id provided
    if (!calcOptions.cart_id && !calcOptions.items) {
      const cartId = this.client.cart?.cartId;
      if (cartId) {
        calcOptions.cart_id = cartId;
      }
    }

    const result = await this.calculate(calcOptions);

    return {
      legal: result.is_legal,
      illegal_items: result.illegal_items || [],
      state_name: result.state_name,
      state_code: result.state_code,
    };
  }

  // ===========================================================================
  // CONVENIENCE HELPERS — Tax Amounts
  // ===========================================================================

  /**
   * Parse the total tax amount from a tax calculation result as a number.
   * Useful when you need the numeric value for further calculations.
   *
   * @param {Object} taxResult - Result from calculate(), calculateForCart(), etc.
   * @returns {number} Total tax as a float (e.g., 12.50)
   *
   * @example
   * const result = await dash.tax.calculateForCart("CA");
   * const taxAmount = dash.tax.getTotal(result);
   * const orderTotal = subtotal + shippingCost + taxAmount;
   */
  getTotal(taxResult) {
    if (!taxResult || !taxResult.total_tax) return 0;
    return parseFloat(taxResult.total_tax) || 0;
  }

  /**
   * Calculate the complete order total given subtotal, shipping, and tax result.
   * Returns a breakdown object with all amounts as numbers.
   *
   * @param {Object} params
   * @param {number|string} params.subtotal - Cart subtotal
   * @param {number|string} [params.shipping=0] - Shipping cost
   * @param {number|string} [params.discount=0] - Discount amount (positive number)
   * @param {Object} params.taxResult - Result from calculate()
   * @returns {{subtotal: number, shipping: number, discount: number, tax: number, total: number}}
   *
   * @example
   * const taxResult = await dash.tax.calculateForCart("CA");
   * const totals = dash.tax.getOrderTotal({
   *   subtotal: cart.subtotal,
   *   shipping: shippingRate.totalCost,
   *   discount: 5.00,
   *   taxResult,
   * });
   * console.log(totals.total);  // 112.75
   */
  getOrderTotal({ subtotal, shipping = 0, discount = 0, taxResult }) {
    const sub = typeof subtotal === "string" ? parseFloat(subtotal) : subtotal;
    const ship = typeof shipping === "string" ? parseFloat(shipping) : shipping;
    const disc = typeof discount === "string" ? parseFloat(discount) : discount;
    const tax = this.getTotal(taxResult);

    return {
      subtotal: sub,
      shipping: ship,
      discount: disc,
      tax,
      total: Math.max(0, sub - disc + ship + tax),
    };
  }

  /**
   * Format a tax breakdown into a human-readable array.
   * Useful for displaying itemized tax lines in checkout UI.
   *
   * @param {Object} taxResult - Result from calculate()
   * @returns {Array<{label: string, amount: string, rate: string}>}
   *
   * @example
   * const result = await dash.tax.calculateForCart("CA");
   * const lines = dash.tax.formatBreakdown(result);
   * // [
   * //   { label: "State Tax (general)", amount: "3.50", rate: "7.25%" },
   * //   { label: "Excise Tax (delta9)", amount: "5.00", rate: "15.00%" },
   * // ]
   */
  formatBreakdown(taxResult) {
    if (!taxResult || !taxResult.tax_breakdown) return [];

    return taxResult.tax_breakdown
      .filter(item => !item.illegal)
      .map(item => {
        const lines = [];
        const rate = item.rate !== null ? `${item.rate}%` : "N/A";

        // Use tax_class_name when available, fall back to cannabinoid_type
        const typeLabel = item.tax_class_name || item.cannabinoid_type;

        // Base tax line
        if (item.rate !== null && parseFloat(item.rate) > 0) {
          lines.push({
            label: `State Tax (${typeLabel})`,
            amount: item.tax_amount,
            rate,
          });
        }

        // Special tax line (if applicable)
        if (item.special_tax_rate && parseFloat(item.special_tax_rate) > 0) {
          lines.push({
            label: `${item.special_tax_name || "Special Tax"} (${typeLabel})`,
            amount: item.tax_amount,
            rate: `${item.special_tax_rate}%`,
          });
        }

        return lines;
      })
      .flat();
  }

  // ===========================================================================
  // INTERNAL HELPERS
  // ===========================================================================

  /**
   * Generate a cache key for a tax calculation request.
   * @private
   */
  _getCacheKey(options) {
    const state = options.state || "";
    if (options.cart_id) return `${state}:cart:${options.cart_id}`;
    if (options.items) return `${state}:items:${JSON.stringify(options.items)}`;
    return `${state}:empty`;
  }

  /**
   * Get a cached tax result if available.
   * @param {string} state - State code
   * @param {string} [cartId] - Cart ID
   * @returns {Object|null} Cached result or null
   */
  getCached(state, cartId) {
    const key = cartId ? `${state}:cart:${cartId}` : `${state}:empty`;
    return this._cache[key] || null;
  }

  /**
   * Clear the tax result cache.
   * Call this when cart contents change to ensure fresh calculations.
   */
  clearCache() {
    this._cache = {};
  }
}

export default TaxModule;

/**
 * Shipping Module
 *
 * Provides shipping rate lookup, rate comparison helpers, and shipment tracking
 * via the platform API. Shipping provider credentials stay server-side —
 * this module proxies through the platform.
 *
 * Usage:
 *   const rates = await dash.shipping.getRates({ ... });
 *   const cheapest = await dash.shipping.getCheapestRate({ ... });
 *   const fastest = await dash.shipping.getFastestRate({ ... });
 */

export class ShippingModule {
  constructor(client) {
    this.client = client;
  }

  // ===========================================================================
  // CORE API METHODS
  // ===========================================================================

  /**
   * Get all available shipping rates for a package.
   * Returns the raw list of rate options from the shipping provider.
   * Shipping provider credentials stay server-side.
   *
   * @param {Object} options
   * @param {string} [options.carrier_code] - Carrier code (e.g. "stamps_com", "fedex", "ups")
   * @param {string[]} [options.carrier_ids] - Carrier IDs (e.g. ["se-xxxxxx"])
   * @param {string} [options.service_type] - Service type filter (e.g. "ups_ground", "usps_priority_mail")
   * @param {string} [options.from_postal] - Origin zip code
   * @param {Object} [options.from_address] - Full origin address object
   * @param {string} [options.to_state] - Destination state abbreviation (e.g. "CA")
   * @param {string} [options.to_country="US"] - Destination country code
   * @param {string} options.to_postal - Destination zip code
   * @param {number} options.weight_oz - Package weight in ounces
   * @param {Object} [options.dimensions] - Package dimensions { length, width, height, units }
   * @returns {Promise<{rates: Array<ShippingRate>, provider?: string}>} List of available rates
   *
   * @example
   * const { rates } = await dash.shipping.getRates({
   *   carrier_ids: ["se-xxxxxx"],
   *   service_type: "ups_ground",
   *   to_state: "CA",
   *   to_postal: "90210",
   *   weight_oz: 16,
   * });
   */
  async getRates(options) {
    const {
      carrier_code, carrier_ids, service_type,
      from_postal, from_address,
      to_address_line1, to_city, to_name,
      to_state, to_country, to_postal,
      weight_oz, dimensions,
    } = options;

    if (!to_postal) {
      throw new Error("to_postal is required");
    }
    if (!weight_oz) {
      throw new Error("weight_oz is required");
    }

    const body = {
      to_postal,
      to_state,
      to_country: to_country || "US",
      weight_oz,
    };

    // Destination address details (needed by ShipEngine for accurate rates)
    if (to_address_line1) body.to_address_line1 = to_address_line1;
    if (to_city) body.to_city = to_city;
    if (to_name) body.to_name = to_name;

    // Carrier identification
    if (carrier_code) body.carrier_code = carrier_code;
    if (carrier_ids) body.carrier_ids = carrier_ids;
    if (service_type) body.service_type = service_type;

    // Origin address
    if (from_postal) body.from_postal = from_postal;
    if (from_address) body.from_address = from_address;

    // Package dimensions
    if (dimensions) body.dimensions = dimensions;

    const url = `${this.client.baseURL}/api/storefront/shipping/rates`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * Track a shipment by tracking number.
   * Returns the tracking URL for the carrier.
   *
   * @param {string} trackingNumber - The tracking number
   * @param {string} [carrierCode] - Optional carrier code for accurate tracking URL
   * @returns {Promise<{tracking_number: string, carrier_code: string, tracking_url: string}>}
   *
   * @example
   * const tracking = await dash.shipping.track("1Z999AA10123456784", "ups");
   * console.log(tracking.tracking_url); // "https://www.ups.com/track?tracknum=..."
   */
  async track(trackingNumber, carrierCode = "") {
    if (!trackingNumber) {
      throw new Error("trackingNumber is required");
    }

    let url = `${this.client.baseURL}/api/storefront/shipping/track/${encodeURIComponent(trackingNumber)}`;
    if (carrierCode) {
      url += `?carrier_code=${encodeURIComponent(carrierCode)}`;
    }
    return this.client._fetch(url, {
      method: "GET",
    });
  }

  /**
   * Validate and normalize a shipping address via ShipEngine.
   * Returns the validation status, the original address, the matched
   * (normalized) address, and any messages from the provider.
   *
   * @param {Object} address
   * @param {string} address.address_line1 - Street address
   * @param {string} address.city - City name
   * @param {string} address.state - State abbreviation (e.g. "CA")
   * @param {string} address.postal_code - ZIP / postal code
   * @param {string} [address.country_code="US"] - Country code
   * @returns {Promise<{status: string, original_address: Object, matched_address: Object, messages: string[]}>}
   *
   * @example
   * const result = await dash.shipping.validateAddress({
   *   address_line1: "123 Main St",
   *   city: "New York",
   *   state: "NY",
   *   postal_code: "10001",
   * });
   * if (result.status === "verified") {
   *   console.log(result.matched_address);
   * }
   */
  async validateAddress(address) {
    const { address_line1, address_line2, city, state, postal_code, country_code } = address;

    if (!address_line1 || !city || !state || !postal_code) {
      throw new Error("address_line1, city, state, and postal_code are required");
    }

    const body = { address_line1, city, state, postal_code };
    if (address_line2) body.address_line2 = address_line2;
    if (country_code) body.country_code = country_code;

    const url = `${this.client.baseURL}/api/storefront/shipping/validate-address`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  // ===========================================================================
  // CONVENIENCE HELPERS — Rate Selection
  // ===========================================================================

  /**
   * Get the cheapest shipping rate for a package.
   * Fetches all rates and returns the one with the lowest total cost.
   *
   * @param {Object} options - Same options as getRates()
   * @returns {Promise<{rate: Object|null, all_rates: Array}>} The cheapest rate and all rates
   *
   * @example
   * const { rate } = await dash.shipping.getCheapestRate({
   *   carrier_code: "stamps_com",
   *   to_state: "NY",
   *   to_postal: "10001",
   *   weight_oz: 8,
   * });
   * console.log(rate.serviceName);  // "USPS First Class Mail"
   * console.log(rate.totalCost);    // 4.25
   */
  async getCheapestRate(options) {
    const { rates } = await this.getRates(options);

    if (!rates || rates.length === 0) {
      return { rate: null, all_rates: [] };
    }

    // Normalize and sort by total cost (shipmentCost + otherCost)
    const sorted = this._sortByPrice(rates);
    return { rate: sorted[0], all_rates: sorted };
  }

  /**
   * Get the fastest shipping rate for a package.
   * Fetches all rates and returns the one with the fewest transit days.
   * If multiple rates have the same transit days, picks the cheapest among them.
   *
   * @param {Object} options - Same options as getRates()
   * @returns {Promise<{rate: Object|null, all_rates: Array}>} The fastest rate and all rates
   *
   * @example
   * const { rate } = await dash.shipping.getFastestRate({
   *   carrier_code: "fedex",
   *   to_state: "TX",
   *   to_postal: "73301",
   *   weight_oz: 32,
   * });
   * console.log(rate.serviceName);  // "FedEx 2Day"
   * console.log(rate.transitDays);  // 2
   */
  async getFastestRate(options) {
    const { rates } = await this.getRates(options);

    if (!rates || rates.length === 0) {
      return { rate: null, all_rates: [] };
    }

    // Sort by transit days first, then by price as tiebreaker
    const sorted = [...rates].sort((a, b) => {
      const daysA = a.transitDays ?? 999;
      const daysB = b.transitDays ?? 999;
      if (daysA !== daysB) return daysA - daysB;
      return this._getTotalCost(a) - this._getTotalCost(b);
    });

    // Annotate with totalCost for convenience
    sorted.forEach(rate => {
      rate.totalCost = this._getTotalCost(rate);
    });

    return { rate: sorted[0], all_rates: sorted };
  }

  /**
   * Get a single recommended shipping rate.
   * Convenience method that returns the cheapest rate by default,
   * or the fastest if prefer="fastest".
   *
   * @param {Object} options - Same options as getRates(), plus:
   * @param {string} [options.prefer="cheapest"] - "cheapest" or "fastest"
   * @returns {Promise<Object|null>} The selected rate, or null if none available
   *
   * @example
   * // Get cheapest rate (default)
   * const rate = await dash.shipping.getRate({
   *   carrier_code: "stamps_com",
   *   to_postal: "90210",
   *   weight_oz: 16,
   * });
   *
   * @example
   * // Get fastest rate
   * const rate = await dash.shipping.getRate({
   *   carrier_code: "fedex",
   *   to_postal: "10001",
   *   weight_oz: 32,
   *   prefer: "fastest",
   * });
   */
  async getRate(options) {
    const { prefer = "cheapest", ...rateOptions } = options;

    if (prefer === "fastest") {
      const { rate } = await this.getFastestRate(rateOptions);
      return rate;
    }

    const { rate } = await this.getCheapestRate(rateOptions);
    return rate;
  }

  // ===========================================================================
  // CONVENIENCE HELPERS — Cost Calculation
  // ===========================================================================

  /**
   * Check if an order qualifies for free shipping based on store config.
   * Compares the subtotal against the store's min_for_free_shipping threshold.
   *
   * @param {number|string} subtotal - Cart subtotal
   * @returns {Promise<{qualifies: boolean, threshold: number|null, remaining: number}>}
   *
   * @example
   * const result = await dash.shipping.checkFreeShipping(cart.subtotal);
   * if (result.qualifies) {
   *   console.log("Free shipping!");
   * } else {
   *   console.log(`Add $${result.remaining.toFixed(2)} more for free shipping`);
   * }
   */
  async checkFreeShipping(subtotal) {
    const data = await this.client.getGlobalData();
    const global = data?.global || {};
    const threshold = global.min_for_free_shipping
      ? parseFloat(global.min_for_free_shipping)
      : null;

    const amount = typeof subtotal === "string" ? parseFloat(subtotal) : subtotal;

    if (threshold === null) {
      // No free shipping threshold configured
      return { qualifies: false, threshold: null, remaining: 0 };
    }

    const qualifies = amount >= threshold;
    const remaining = qualifies ? 0 : Math.max(0, threshold - amount);

    return { qualifies, threshold, remaining };
  }

  // ===========================================================================
  // INTERNAL HELPERS
  // ===========================================================================

  /**
   * Get total cost of a rate (shipmentCost + otherCost).
   * @private
   */
  _getTotalCost(rate) {
    return (parseFloat(rate.shipmentCost) || 0) + (parseFloat(rate.otherCost) || 0);
  }

  /**
   * Sort rates by total cost ascending and annotate with totalCost.
   * @private
   */
  _sortByPrice(rates) {
    const sorted = [...rates].sort((a, b) => this._getTotalCost(a) - this._getTotalCost(b));
    sorted.forEach(rate => {
      rate.totalCost = this._getTotalCost(rate);
    });
    return sorted;
  }
}

export default ShippingModule;

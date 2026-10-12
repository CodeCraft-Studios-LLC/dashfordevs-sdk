/**
 * Calendar Module
 *
 * Provides access to calendar settings, days off, availability,
 * and booking from the storefront API.
 */

export class CalendarModule {
  constructor(client) {
    this.client = client;
  }

  /**
   * Get calendar settings (business hours, overlap policy)
   * @returns {Promise<{settings: {allow_overlapping: boolean, business_hours: object}}>}
   */
  async getSettings() {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/calendar/settings`);
  }

  /**
   * Get all days off
   * @returns {Promise<{days_off: Array<{id, title, start_date, end_date, recurring_yearly}>}>}
   */
  async getDaysOff() {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/calendar/days-off`);
  }

  /**
   * Get booked time slots for a given month
   * @param {string} month - Format: YYYY-MM
   * @returns {Promise<{slots: Array<{start, end, all_day}>}>}
   */
  async getAvailability(month) {
    return this.client._fetch(
      `${this.client.baseURL}/api/storefront/calendar/availability?month=${encodeURIComponent(month)}`
    );
  }

  /**
   * Create a booking
   * @param {object} data
   * @param {string} data.start - ISO datetime
   * @param {string} [data.end] - ISO datetime
   * @param {string} data.customer_name
   * @param {string} data.customer_email
   * @param {string} [data.customer_phone]
   * @param {string} [data.trip_type]
   * @param {number} [data.guests]
   * @param {string} [data.notes]
   * @param {boolean} [data.all_day]
   * @param {object} [data.metadata]
   * @returns {Promise<{success, message, booking: {id, start, end}}>}
   */
  async book(data) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/calendar/book`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
}

export default CalendarModule;

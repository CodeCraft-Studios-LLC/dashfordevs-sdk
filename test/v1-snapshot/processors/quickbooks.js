/**
 * QuickBooks Online Processor — Client-Side (CSR)
 *
 * QuickBooks uses invoice-based payments instead of card tokenization.
 * There is no client-side library to load — the customer receives an
 * invoice email from QuickBooks and pays through their payment portal.
 *
 * This processor is a no-op on the client side:
 * - load() is a no-op (nothing to load)
 * - tokenize() is not supported (no card capture)
 *
 * The SDK detects payment_type === "invoice" and skips tokenization
 * during checkout. The backend creates the QB invoice after order placement.
 */

export class QuickBooksCSR {
  constructor(config) {
    this._environment = config.environment || "test";
    this._connected = config.connected || false;
    this._loaded = false;
  }

  /**
   * No-op: QuickBooks has no client-side library to load.
   * @returns {Promise<void>}
   */
  async load() {
    this._loaded = true;
  }

  /**
   * QuickBooks does not support client-side card tokenization.
   * Throws an error — checkout flow should skip this for invoice processors.
   */
  async tokenize() {
    throw new Error(
      "QuickBooks uses invoice-based payments. Card tokenization is not supported. " +
      "The customer will receive an invoice via email after order placement."
    );
  }

  /**
   * Whether QuickBooks is connected (has OAuth tokens).
   * @returns {boolean}
   */
  get isConnected() {
    return this._connected;
  }

  /**
   * QuickBooks payment type is always "invoice".
   * @returns {string}
   */
  get paymentType() {
    return "invoice";
  }
}

export default QuickBooksCSR;

/**
 * QuickBooks Online Processor - Client-Side (CSR)
 *
 * Invoice-based: nothing to load and no card capture. Checkout skips
 * tokenization when payment_type === "invoice"; the backend creates the
 * invoice after the order is placed.
 */

export class QuickBooksCSR {
  _environment: string;
  _connected: boolean;
  _loaded: boolean;

  constructor(config: { environment?: string; connected?: boolean; [key: string]: any } = {}) {
    this._environment = config.environment || "test";
    this._connected = config.connected || false;
    this._loaded = false;
  }

  /** No-op: QuickBooks has no client-side library. */
  async load(): Promise<void> {
    this._loaded = true;
  }

  /** Not supported for invoice-based payments. */
  async tokenize(_card?: unknown): Promise<never> {
    throw new Error(
      "QuickBooks uses invoice-based payments. Card tokenization is not supported. " +
        "The customer will receive an invoice via email after order placement."
    );
  }

  get isConnected(): boolean {
    return this._connected;
  }

  get paymentType(): "invoice" {
    return "invoice";
  }
}

export default QuickBooksCSR;

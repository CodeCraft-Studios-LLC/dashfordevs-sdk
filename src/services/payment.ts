/**
 * Payment Module
 *
 * Processor-agnostic payments. In the browser, load() fetches the active
 * processor and its PUBLIC client config and loads only that processor's
 * library (Accept.js for Authorize.net); tokenize() turns card data into an
 * opaque token. charge/authorize/capture/void go through the storefront API,
 * which holds the processor credentials.
 *
 * v2: charge() and authorize() mask `line_items` (names -> "Item N",
 * descriptions dropped, non-opaque ids replaced) and keep `description` only
 * when it is just an order/invoice reference, because the API forwards both
 * to Authorize.net. Amounts, quantities, billing and invoice number are
 * unchanged.
 */

import type { DashClient } from "../client.js";
import type {
  AuthorizeData,
  AuthorizeResult,
  CaptureData,
  CaptureResult,
  CardData,
  ChargeData,
  ChargeResult,
  GooglePayOptions,
  PaymentToken,
  StorefrontPaymentProcessor,
  VoidData,
  VoidResult,
} from "../types.js";
import { AuthorizeNetCSR } from "../processors/authorize-net.js";
import { QuickBooksCSR } from "../processors/quickbooks.js";
import { GooglePayCSR } from "../processors/google-pay.js";
import { maskLineItems, maskPaymentDescription } from "../core/privacy.js";

type ProcessorInfo = StorefrontPaymentProcessor & Record<string, any>;

function paymentPayload(data: ChargeData | AuthorizeData): Record<string, any> {
  const d: any = data;
  const payload: Record<string, any> = {
    token: d.token,
    descriptor: d.descriptor || "",
    amount: String(d.amount),
    currency: d.currency || "USD",
    invoice_number: d.invoiceNumber || d.invoice_number || "",
    description: maskPaymentDescription(d.description || ""),
    billing: d.billing || {},
  };
  if (d.shipping) payload.shipping = d.shipping;
  if (d.customer) payload.customer = d.customer;
  if (d.line_items) payload.line_items = maskLineItems(d.line_items);
  return payload;
}

export class PaymentModule {
  client: DashClient;
  _processor: ProcessorInfo | null;
  _clientConfig: Record<string, any> | null;
  _handler: AuthorizeNetCSR | QuickBooksCSR | null;
  _loading: Promise<StorefrontPaymentProcessor> | null;
  _loaded: boolean;

  constructor(client: DashClient) {
    this.client = client;
    this._processor = null;
    this._clientConfig = null;
    this._handler = null;
    this._loading = null;
    this._loaded = false;
  }

  /** Load the active processor's client library (call once in a client layout). */
  async load(): Promise<StorefrontPaymentProcessor> {
    if (this._loaded) return this._processor as StorefrontPaymentProcessor;
    if (this._loading) return this._loading;

    this._loading = (async () => {
      const url = `${this.client.baseURL}/api/storefront/payment/client-config`;
      const data: any = await this.client._fetch(url);

      this._processor = data.processor;
      this._clientConfig = data.client_config;

      if (!this._processor) {
        throw new Error("No active payment processor configured for this organization.");
      }

      if (typeof window !== "undefined") {
        this._handler = this._createHandler(this._processor.slug, {
          ...(this._clientConfig || {}),
          environment: this._processor.environment,
        });
        await this._handler.load();
      }

      this._loaded = true;
      return this._processor as StorefrontPaymentProcessor;
    })();

    return this._loading;
  }

  /** Active processor info (cached after load()). */
  async getProcessor(): Promise<StorefrontPaymentProcessor | null> {
    if (this._processor) return this._processor;

    const url = `${this.client.baseURL}/api/storefront/payment/processor`;
    const data: any = await this.client._fetch(url);
    this._processor = data.processor;
    return data.processor;
  }

  /** Tokenize card data with the loaded processor (browser only). */
  async tokenize(cardData: CardData): Promise<PaymentToken> {
    if (!this._loaded || !this._handler) {
      throw new Error("Payment processor not loaded. Call dash.payment.load() first.");
    }

    if (typeof window === "undefined") {
      throw new Error(
        "tokenize() can only be called in a browser environment (CSR). Use charge() on the server side (SSR)."
      );
    }

    return this._handler.tokenize(cardData) as Promise<PaymentToken>;
  }

  /** Authorize and capture in one call. */
  async charge(chargeData: ChargeData): Promise<ChargeResult> {
    if (!chargeData || !chargeData.token || !chargeData.amount) {
      throw new Error("token and amount are required for charge().");
    }

    const url = `${this.client.baseURL}/api/storefront/payment/charge`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(paymentPayload(chargeData)),
    });
  }

  /** Place a hold without capturing (two-step flow, step 1). */
  async authorize(authData: AuthorizeData): Promise<AuthorizeResult> {
    if (!authData || !authData.token || !authData.amount) {
      throw new Error("token and amount are required for authorize().");
    }

    const url = `${this.client.baseURL}/api/storefront/payment/authorize`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(paymentPayload(authData)),
    });
  }

  /** Capture a held authorization (optionally less than authorized). */
  async capture(captureData: CaptureData): Promise<CaptureResult> {
    if (!captureData || !captureData.transactionId) {
      throw new Error("transactionId is required for capture().");
    }

    const url = `${this.client.baseURL}/api/storefront/payment/capture`;
    const body: Record<string, any> = { transaction_id: captureData.transactionId };
    if (captureData.amount !== undefined) body.amount = String(captureData.amount);

    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /** Release a held authorization. */
  async void(voidData: VoidData): Promise<VoidResult> {
    if (!voidData || !voidData.transactionId) {
      throw new Error("transactionId is required for void().");
    }

    const url = `${this.client.baseURL}/api/storefront/payment/void`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify({ transaction_id: voidData.transactionId }),
    });
  }

  /** The underlying processor handler (after load()). */
  getHandler(): AuthorizeNetCSR {
    if (!this._handler) {
      throw new Error("Payment processor not loaded. Call load() first.");
    }
    return this._handler as AuthorizeNetCSR;
  }

  get isLoaded(): boolean {
    return this._loaded;
  }

  get processorSlug(): string | null {
    return this._processor?.slug || null;
  }

  get googlePayEnabled(): boolean {
    return !!this._processor?.google_pay_enabled;
  }

  get applePayEnabled(): boolean {
    return !!this._processor?.apple_pay_enabled;
  }

  /** Invoice-based processor (e.g. QuickBooks): skip the card form. */
  get isInvoiceBased(): boolean {
    return this._processor?.payment_type === "invoice";
  }

  get isProcessorConnected(): boolean {
    return this._processor?.connected ?? true;
  }

  /** A Google Pay controller bound to the active processor (Authorize.net). Requires load(). */
  googlePay(options: GooglePayOptions = {}): GooglePayCSR {
    if (!this._loaded) {
      throw new Error("Call dash.payment.load() before dash.payment.googlePay().");
    }

    let gateway: string;
    let gatewayMerchantId: string | undefined;
    if (this._processor?.slug === "authorize-net") {
      gateway = "authorizenet";
      gatewayMerchantId = this._clientConfig?.api_login_id;
    } else {
      throw new Error(
        `Google Pay is not supported for processor "${this._processor?.slug}". ` +
          "Only Authorize.net is wired up for Google Pay."
      );
    }

    if (!gatewayMerchantId) {
      throw new Error(
        "Google Pay could not resolve a gatewayMerchantId (api_login_id) from " +
          "the processor config. Check the org's Authorize.net configuration."
      );
    }

    return new GooglePayCSR({
      gateway,
      gatewayMerchantId,
      environment: options.environment || this._processor?.environment,
      merchantName: options.merchantName,
      merchantId: options.merchantId || this._processor?.google_pay_merchant_id,
      currencyCode: options.currencyCode,
      countryCode: options.countryCode,
      cardNetworks: options.cardNetworks,
      authMethods: options.authMethods,
      emailRequired: options.emailRequired,
      shippingAddressRequired: options.shippingAddressRequired,
      shippingAddressParameters: options.shippingAddressParameters,
      billingAddressRequired: options.billingAddressRequired,
      phoneNumberRequired: options.phoneNumberRequired,
      onShippingAddressChange: options.onShippingAddressChange as any,
      debug: options.debug,
    });
  }

  _createHandler(slug: string, config: Record<string, any>): AuthorizeNetCSR | QuickBooksCSR {
    switch (slug) {
      case "authorize-net":
        return new AuthorizeNetCSR(config as any);
      case "quickbooks":
        return new QuickBooksCSR(config);
      default:
        throw new Error(`Unsupported payment processor: ${slug}. Supported: authorize-net, quickbooks.`);
    }
  }
}

export default PaymentModule;

/**
 * Payment Module
 *
 * Processor-agnostic payment abstraction for the dash4devs SDK.
 * Developers interact with a single API regardless of which payment
 * processor the organization has configured.
 *
 * CSR (browser):
 *   await dash.payment.load();        // Loads the processor's client library
 *   const token = await dash.payment.tokenize(cardData);
 *
 * SSR (server):
 *   const result = await dash.payment.charge({ token, amount, ... });
 *
 * The SDK dynamically loads only the required processor library
 * (Accept.js for Authorize.net) at runtime.
 */

import { AuthorizeNetCSR } from "../processors/authorize-net.js";
import { QuickBooksCSR } from "../processors/quickbooks.js";
import { GooglePayCSR } from "../processors/google-pay.js";

export class PaymentModule {
  constructor(client) {
    this.client = client;

    // Processor info
    this._processor = null;     // { slug, name, environment }
    this._clientConfig = null;  // Public keys only
    this._handler = null;       // CSR processor handler instance

    this._loading = null;
    this._loaded = false;
  }

  /**
   * Load the active payment processor's client library.
   *
   * Call this once in your app's layout/header. Based on the org's
   * configured processor, it will:
   * 1. Fetch the processor info + public keys from the API
   * 2. Dynamically load only that processor's client library
   *
   * @returns {Promise<{slug: string, name: string, environment: string}>}
   *
   * @example
   * // In your layout/header (CSR only)
   * const processor = await dash.payment.load();
   * console.log(processor.slug); // "authorize-net"
   */
  async load() {
    if (this._loaded) return this._processor;
    if (this._loading) return this._loading;

    this._loading = (async () => {
      // Fetch processor info + public keys
      const url = `${this.client.baseURL}/api/storefront/payment/client-config`;
      const data = await this.client._fetch(url);

      this._processor = data.processor;
      this._clientConfig = data.client_config;

      if (!this._processor) {
        throw new Error("No active payment processor configured for this organization.");
      }

      // Initialize the correct CSR handler (browser only)
      if (typeof window !== "undefined") {
        this._handler = this._createHandler(this._processor.slug, {
          ...this._clientConfig,
          environment: this._processor.environment,
        });

        // Load the processor's client library (Accept.js for Authorize.net)
        await this._handler.load();
      }

      this._loaded = true;
      return this._processor;
    })();

    return this._loading;
  }

  /**
   * Get the active processor info.
   * Returns cached data if load() has been called, otherwise fetches.
   *
   * @returns {Promise<{slug: string, name: string, environment: string} | null>}
   */
  async getProcessor() {
    if (this._processor) return this._processor;

    const url = `${this.client.baseURL}/api/storefront/payment/processor`;
    const data = await this.client._fetch(url);
    this._processor = data.processor;
    return data.processor;
  }

  /**
   * Tokenize card data using the loaded processor's client library.
   * Must call load() first. CSR only.
   *
   * For Authorize.net: pass { cardNumber, expDate, cvv }
   *
   * Returns a processor-agnostic token that can be sent to charge().
   *
   * @param {Object} cardData - Card data
   * @param {string} cardData.cardNumber - Card number
   * @param {string} cardData.expDate - Expiration date MM/YY
   * @param {string} cardData.cvv - Security code
   * @returns {Promise<{token: string, descriptor: string}>}
   *
   * @example
   * const { token, descriptor } = await dash.payment.tokenize({
   *   cardNumber: "4111111111111111",
   *   expDate: "12/25",
   *   cvv: "123",
   * });
   */
  async tokenize(cardData) {
    if (!this._loaded || !this._handler) {
      throw new Error(
        "Payment processor not loaded. Call dash.payment.load() first."
      );
    }

    if (typeof window === "undefined") {
      throw new Error(
        "tokenize() can only be called in a browser environment (CSR). " +
        "Use charge() on the server side (SSR)."
      );
    }

    return this._handler.tokenize(cardData);
  }

  /**
   * Charge a tokenized payment through the storefront API.
   * Single-step flow: Authorize AND capture in one call.
   * The backend uses the org's encrypted credentials to process the charge.
   * Works on both CSR and SSR.
   *
   * @param {Object} chargeData
   * @param {string} chargeData.token - Token from tokenize()
   * @param {string} chargeData.descriptor - Descriptor from tokenize()
   * @param {string|number} chargeData.amount - Charge amount (e.g., "99.99")
   * @param {string} [chargeData.currency] - Currency code (default: "USD")
   * @param {string} [chargeData.invoiceNumber] - Invoice/order number
   * @param {string} [chargeData.description] - Charge description
   * @param {Object} [chargeData.billing] - Billing address
   * @returns {Promise<{success: boolean, transaction: Object}>}
   *
   * @example
   * const result = await dash.payment.charge({
   *   token: tokenData.token,
   *   descriptor: tokenData.descriptor,
   *   amount: "99.99",
   *   invoiceNumber: "1001",
   *   billing: {
   *     first_name: "John",
   *     last_name: "Doe",
   *     address: "123 Main St",
   *     city: "New York",
   *     state: "NY",
   *     zip_code: "10001",
   *   },
   * });
   */
  async charge(chargeData) {
    if (!chargeData || !chargeData.token || !chargeData.amount) {
      throw new Error("token and amount are required for charge().");
    }

    const url = `${this.client.baseURL}/api/storefront/payment/charge`;

    const payload = {
      token: chargeData.token,
      descriptor: chargeData.descriptor || "",
      amount: String(chargeData.amount),
      currency: chargeData.currency || "USD",
      invoice_number: chargeData.invoiceNumber || chargeData.invoice_number || "",
      description: chargeData.description || "",
      billing: chargeData.billing || {},
    };
    if (chargeData.shipping) payload.shipping = chargeData.shipping;
    if (chargeData.customer) payload.customer = chargeData.customer;
    if (chargeData.line_items) payload.line_items = chargeData.line_items;

    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  // ===========================================================================
  // TWO-STEP PAYMENT FLOW: Authorize → Capture (or Void)
  // ===========================================================================

  /**
   * Authorize a payment without capturing (place a hold on the card).
   * Two-step flow, Step 1: The card is validated and funds are held,
   * but not actually charged yet.
   *
   * Use capture() to charge the held amount, or void() to release the hold.
   * Authorizations typically expire after 7-30 days depending on card issuer.
   *
   * @param {Object} authData
   * @param {string} authData.token - Token from tokenize()
   * @param {string} authData.descriptor - Descriptor from tokenize()
   * @param {string|number} authData.amount - Amount to authorize
   * @param {string} [authData.currency] - Currency code (default: "USD")
   * @param {string} [authData.invoiceNumber] - Invoice/order number
   * @param {string} [authData.description] - Description
   * @param {Object} [authData.billing] - Billing address
   * @returns {Promise<{success: boolean, authorization: Object}>}
   *
   * @example
   * // Step 1: Authorize (place hold)
   * const auth = await dash.payment.authorize({
   *   token: tokenData.token,
   *   descriptor: tokenData.descriptor,
   *   amount: "99.99",
   * });
   *
   * // Store auth.authorization.transaction_id for later capture
   * const transactionId = auth.authorization.transaction_id;
   *
   * // Step 2a: Capture when ready to charge
   * const result = await dash.payment.capture({ transactionId });
   *
   * // OR Step 2b: Void if you don't want to charge
   * await dash.payment.void({ transactionId });
   */
  async authorize(authData) {
    if (!authData || !authData.token || !authData.amount) {
      throw new Error("token and amount are required for authorize().");
    }

    const url = `${this.client.baseURL}/api/storefront/payment/authorize`;

    const payload = {
      token: authData.token,
      descriptor: authData.descriptor || "",
      amount: String(authData.amount),
      currency: authData.currency || "USD",
      invoice_number: authData.invoiceNumber || authData.invoice_number || "",
      description: authData.description || "",
      billing: authData.billing || {},
    };
    if (authData.shipping) payload.shipping = authData.shipping;
    if (authData.customer) payload.customer = authData.customer;
    if (authData.line_items) payload.line_items = authData.line_items;

    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /**
   * Capture a previously authorized payment.
   * Two-step flow, Step 2a: Actually charge the held funds.
   *
   * @param {Object} captureData
   * @param {string} captureData.transactionId - Transaction ID from authorize()
   * @param {string|number} [captureData.amount] - Amount to capture (optional,
   *   defaults to original auth amount. Can be less than original, not more.)
   * @returns {Promise<{success: boolean, transaction: Object}>}
   *
   * @example
   * const result = await dash.payment.capture({
   *   transactionId: "123456789",
   *   amount: "89.99", // Optional: capture less than authorized
   * });
   */
  async capture(captureData) {
    if (!captureData || !captureData.transactionId) {
      throw new Error("transactionId is required for capture().");
    }

    const url = `${this.client.baseURL}/api/storefront/payment/capture`;

    const body = {
      transaction_id: captureData.transactionId,
    };

    if (captureData.amount !== undefined) {
      body.amount = String(captureData.amount);
    }

    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * Void a previously authorized payment.
   * Two-step flow, Step 2b: Release the hold without charging.
   *
   * Use this when you don't want to capture an authorization
   * (e.g., order cancelled, fraud detected, inventory unavailable).
   *
   * @param {Object} voidData
   * @param {string} voidData.transactionId - Transaction ID from authorize()
   * @returns {Promise<{success: boolean, transaction: Object}>}
   *
   * @example
   * const result = await dash.payment.void({
   *   transactionId: "123456789",
   * });
   */
  async void(voidData) {
    if (!voidData || !voidData.transactionId) {
      throw new Error("transactionId is required for void().");
    }

    const url = `${this.client.baseURL}/api/storefront/payment/void`;

    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify({
        transaction_id: voidData.transactionId,
      }),
    });
  }

  /**
   * Get the underlying processor handler for advanced usage.
   *
   * @returns {AuthorizeNetCSR} The processor handler
   */
  getHandler() {
    if (!this._handler) {
      throw new Error("Payment processor not loaded. Call load() first.");
    }
    return this._handler;
  }

  /**
   * Whether the processor's client library has been loaded.
   * @returns {boolean}
   */
  get isLoaded() {
    return this._loaded;
  }

  /**
   * The active processor's slug (e.g., "authorize-net").
   * @returns {string|null}
   */
  get processorSlug() {
    return this._processor?.slug || null;
  }

  /**
   * Whether the store has switched Google Pay on (dashboard → connected page).
   * Reflects the active config's flag from client-config. The storefront should
   * only render the Google Pay button when this is true.
   * @returns {boolean}
   */
  get googlePayEnabled() {
    return !!this._processor?.google_pay_enabled;
  }

  /**
   * Whether the store has switched Apple Pay on. (Apple Pay checkout is not yet
   * wired end-to-end — this flag exists for when it is.)
   * @returns {boolean}
   */
  get applePayEnabled() {
    return !!this._processor?.apple_pay_enabled;
  }

  /**
   * Create the CSR handler for a given processor.
   * @private
   */
  /**
   * Whether the active processor uses invoice-based payments (e.g., QuickBooks).
   * When true, checkout should skip tokenization — no card form needed.
   * @returns {boolean}
   */
  get isInvoiceBased() {
    return this._processor?.payment_type === "invoice";
  }

  /**
   * Whether the invoice-based processor is connected (has OAuth tokens).
   * Only relevant for processors like QuickBooks that require OAuth.
   * @returns {boolean}
   */
  get isProcessorConnected() {
    return this._processor?.connected ?? true;
  }

  /**
   * Create a Google Pay controller bound to the org's active processor.
   *
   * Requires `dash.payment.load()` to have been called first (it supplies the
   * processor environment and, for Authorize.net, the API Login ID used as the
   * Google Pay gatewayMerchantId). Currently only Authorize.net is wired up.
   *
   * Developers never touch the Google API directly:
   *
   *   const gpay = dash.payment.googlePay({ merchantName: "My Store" });
   *   if (await gpay.isAvailable()) {
   *     gpay.renderButton(el, {
   *       getTransactionInfo: () => ({ totalPrice: total }),
   *       onToken: async ({ token, descriptor }) => {
   *         await dash.checkout.complete({
   *           cartId, shipping,
   *           payment_token: { token, descriptor, billing, ... },
   *         });
   *       },
   *     });
   *   }
   *
   * @param {Object} [options]
   * @param {string} [options.merchantName] - Name shown on the Google Pay sheet.
   * @param {string} [options.merchantId] - Google-issued merchant id (REQUIRED
   *   for production; obtain it in the Google Pay Business Console).
   * @param {string} [options.currencyCode] - Default "USD".
   * @param {string} [options.countryCode] - Default "US".
   * @param {string[]} [options.cardNetworks] - Override allowed card networks.
   * @param {string[]} [options.authMethods] - Override allowed auth methods.
   * @param {"test"|"live"} [options.environment] - Override the Google Pay
   *   environment. Defaults to the processor's environment. Pass "test" to force
   *   Google Pay TEST mode (e.g. on localhost) so the sheet opens without a
   *   registered production merchant — note a TEST token won't settle a real
   *   charge through a live Authorize.net account.
   * @param {Function} [options.onShippingAddressChange] - Dynamic pricing for
   *   true express checkout. Called while the sheet is open with the shopper's
   *   intermediate address ({countryCode, administrativeArea, locality,
   *   postalCode}); return { lineItems?, totalPrice, currencyCode?, error? } to
   *   update the sheet's FINAL total with live shipping+tax. Without it, the
   *   sheet can only show the pre-address estimate.
   * @returns {import("../processors/google-pay.js").GooglePayCSR}
   */
  googlePay(options = {}) {
    if (!this._loaded) {
      throw new Error(
        "Call dash.payment.load() before dash.payment.googlePay()."
      );
    }

    // Map the active processor to a Google Pay gateway + merchant id.
    let gateway;
    let gatewayMerchantId;
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
      // Explicit override wins; otherwise follow the processor env ("test"|"live").
      environment: options.environment || this._processor?.environment,
      merchantName: options.merchantName,
      // Merchant id resolution: explicit option wins, else the platform-wide id
      // the backend serves via client-config (GOOGLE_PAY_MERCHANT_ID). So stores
      // don't need their own env var — it's configured once, backend-side.
      merchantId: options.merchantId || this._processor?.google_pay_merchant_id,
      currencyCode: options.currencyCode,
      countryCode: options.countryCode,
      cardNetworks: options.cardNetworks,
      authMethods: options.authMethods,
      // Express-checkout buyer-info collection (optional).
      emailRequired: options.emailRequired,
      shippingAddressRequired: options.shippingAddressRequired,
      shippingAddressParameters: options.shippingAddressParameters,
      billingAddressRequired: options.billingAddressRequired,
      phoneNumberRequired: options.phoneNumberRequired,
      // Dynamic pricing resolver: recompute shipping+tax LIVE from the address the
      // shopper picks in the sheet so the total is correct before they authorize.
      onShippingAddressChange: options.onShippingAddressChange,
      // Console logging of every sheet event, for testing a setup.
      debug: options.debug,
    });
  }

  _createHandler(slug, config) {
    switch (slug) {
      case "authorize-net":
        return new AuthorizeNetCSR(config);

      case "quickbooks":
        return new QuickBooksCSR(config);

      default:
        throw new Error(
          `Unsupported payment processor: ${slug}. ` +
          `Supported: authorize-net, quickbooks.`
        );
    }
  }
}

export default PaymentModule;

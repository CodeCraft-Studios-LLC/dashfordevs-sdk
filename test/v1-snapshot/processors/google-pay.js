/**
 * Google Pay Processor — Client-Side (CSR)
 *
 * Wraps the Google Pay JS API and produces a processor-agnostic token in the
 * exact same shape `dash.payment.tokenize()` returns:
 *
 *     { token: "<base64 blob>", descriptor: "COMMON.GOOGLE.INAPP.PAYMENT" }
 *
 * That token drops straight into the existing charge path
 * (`dash.checkout.complete({ payment_token })` or `dash.payment.charge()`) —
 * the backend already forwards `descriptor` to Authorize.net unchanged, so no
 * server work is needed.
 *
 * Developers never touch the Google API directly. They use:
 *
 *     const gpay = dash.payment.googlePay({ merchantName: "My Store" });
 *     if (await gpay.isAvailable()) {
 *       gpay.renderButton(containerEl, {
 *         onClick: async () => {
 *           const tok = await gpay.requestToken({ totalPrice: total });
 *           // tok === { token, descriptor } → send to checkout.complete()
 *         },
 *       });
 *     }
 *
 * Authorize.net is currently the only gateway wired up. For Authorize.net the
 * Google Pay `gatewayMerchantId` is the merchant's API Login ID (which the SDK
 * already has from the public client-config).
 *
 * Refs:
 *  - https://developers.google.com/pay/api/web/guides/tutorial
 *  - Authorize.net: dataDescriptor = COMMON.GOOGLE.INAPP.PAYMENT, dataValue =
 *    btoa(paymentData.paymentMethodData.tokenizationData.token)
 */

const GOOGLE_PAY_JS = "https://pay.google.com/gp/p/js/pay.js";
// How long the sheet waits for onShippingAddressChange before showing an error.
const RESOLVER_TIMEOUT_MS = 8000;

// Authorize.net opaque-data descriptor for Google Pay tokens.
const GOOGLE_PAY_DESCRIPTOR = "COMMON.GOOGLE.INAPP.PAYMENT";

// Google Pay API version (stable as of the current Google Pay Web API).
const API_VERSION = 2;
const API_VERSION_MINOR = 0;

// Defaults — overridable via the googlePay() options.
const DEFAULT_CARD_NETWORKS = ["AMEX", "DISCOVER", "JCB", "MASTERCARD", "VISA"];
const DEFAULT_AUTH_METHODS = ["PAN_ONLY", "CRYPTOGRAM_3DS"];

export class GooglePayCSR {
  /**
   * @param {Object} config
   * @param {string} config.gateway - Payment gateway name (e.g. "authorizenet")
   * @param {string} config.gatewayMerchantId - Gateway merchant id. For
   *   Authorize.net this is the API Login ID.
   * @param {string} [config.environment] - "live" | "test" (maps to Google
   *   "PRODUCTION" | "TEST"). Defaults to "test".
   * @param {string} [config.merchantName] - Display name shown on the sheet.
   * @param {string} [config.merchantId] - Google-issued merchant id. REQUIRED
   *   for PRODUCTION; ignored in TEST.
   * @param {string} [config.currencyCode] - Default "USD".
   * @param {string} [config.countryCode] - Default "US".
   * @param {string[]} [config.cardNetworks] - Allowed card networks.
   * @param {string[]} [config.authMethods] - Allowed auth methods.
   * @param {string} [config.descriptor] - Override the opaque-data descriptor.
   */
  constructor(config = {}) {
    this._gateway = config.gateway || "authorizenet";
    this._gatewayMerchantId = config.gatewayMerchantId || "";
    this._environment = config.environment === "live" ? "PRODUCTION" : "TEST";
    this._merchantName = config.merchantName || "";
    this._merchantId = config.merchantId || "";
    this._currencyCode = config.currencyCode || "USD";
    this._countryCode = config.countryCode || "US";
    this._cardNetworks = config.cardNetworks || DEFAULT_CARD_NETWORKS;
    this._authMethods = config.authMethods || DEFAULT_AUTH_METHODS;
    this._descriptor = config.descriptor || GOOGLE_PAY_DESCRIPTOR;

    // Buyer-info collection (express checkout): let the Google sheet gather the
    // email / shipping / billing address so the merchant form can be skipped.
    this._emailRequired = !!config.emailRequired;
    this._shippingAddressRequired = !!config.shippingAddressRequired;
    this._shippingAddressParameters = config.shippingAddressParameters || null;
    this._billingAddressRequired = !!config.billingAddressRequired;
    this._phoneNumberRequired = !!config.phoneNumberRequired;

    // Dynamic pricing (true express checkout). When set, the Google Pay sheet
    // collects the shipping address and — WHILE STILL OPEN — calls this resolver
    // to recompute shipping/tax so the shopper sees (and authorizes) the correct
    // FINAL total. Without it, the sheet can only show the pre-address estimate
    // (usually the subtotal), which then mismatches the real charge.
    //
    // Signature:
    //   async ({ countryCode, administrativeArea, locality, postalCode }) =>
    //     ({ lineItems?: [{label, price, type?}], totalPrice, currencyCode?,
    //        totalPriceLabel?, error? })
    //
    // `administrativeArea` is the state, `locality` the city. Google withholds
    // the STREET line until the shopper authorizes, so the resolver must be able
    // to price on state/city/zip alone (tax needs the state; carrier rates work
    // off the zip). Return `{ error }` (a string or {message}) to reject an
    // unserviceable address right inside the sheet (e.g. a banned state).
    this._onShippingAddressChange = config.onShippingAddressChange || null;
    // Logs every sheet event to the console (address changes, the total sent
    // back, the request). For proving a setup on a test domain; leave off live.
    this._debug = !!config.debug;

    this._loaded = false;
    this._loading = null;
    this._client = null; // google.payments.api.PaymentsClient
  }

  /** @private — the allowedPaymentMethods[] CARD entry shared by every request. */
  _baseCardPaymentMethod() {
    return {
      type: "CARD",
      parameters: {
        allowedAuthMethods: this._authMethods,
        allowedCardNetworks: this._cardNetworks,
        ...(this._billingAddressRequired
          ? {
              billingAddressRequired: true,
              billingAddressParameters: {
                format: "FULL",
                phoneNumberRequired: this._phoneNumberRequired,
              },
            }
          : {}),
      },
      tokenizationSpecification: {
        type: "PAYMENT_GATEWAY",
        parameters: {
          gateway: this._gateway,
          gatewayMerchantId: this._gatewayMerchantId,
        },
      },
    };
  }

  /**
   * Load pay.js and build the PaymentsClient. Idempotent.
   * @returns {Promise<void>}
   */
  async load() {
    if (this._loaded) return;
    if (this._loading) return this._loading;

    if (typeof window === "undefined") {
      throw new Error(
        "GooglePayCSR.load() can only be called in a browser environment."
      );
    }
    if (!this._gatewayMerchantId) {
      throw new Error(
        "Google Pay is missing gatewayMerchantId. The payment processor must " +
        "be loaded (dash.payment.load()) and configured before using Google Pay."
      );
    }

    this._loading = new Promise((resolve, reject) => {
      const init = () => {
        try {
          const clientOptions = { environment: this._environment };
          // Wire dynamic pricing: Google invokes onPaymentDataChanged while the
          // sheet is open whenever the shopper picks/changes their address. We
          // bounce it through `this._handlePaymentDataChanged` (reads the
          // resolver off `this` at call time, so the consumer can hot-swap it
          // per render to avoid stale cart state).
          if (this._onShippingAddressChange) {
            clientOptions.paymentDataCallbacks = {
              onPaymentDataChanged: (intermediate) =>
                this._handlePaymentDataChanged(intermediate),
            };
          }
          this._client = new window.google.payments.api.PaymentsClient(clientOptions);
          this._loaded = true;
          resolve();
        } catch (err) {
          reject(new Error("Failed to initialize Google Pay: " + err.message));
        }
      };

      // Already loaded by another instance / earlier call.
      if (window.google && window.google.payments && window.google.payments.api) {
        init();
        return;
      }

      const existing = document.querySelector(`script[src="${GOOGLE_PAY_JS}"]`);
      if (existing) {
        existing.addEventListener("load", init, { once: true });
        existing.addEventListener(
          "error",
          () => reject(new Error("Failed to load Google Pay script.")),
          { once: true }
        );
        return;
      }

      const script = document.createElement("script");
      script.src = GOOGLE_PAY_JS;
      script.async = true;
      script.onload = init;
      script.onerror = () =>
        reject(new Error("Failed to load Google Pay. Check your network connection."));
      document.head.appendChild(script);
    });

    return this._loading;
  }

  /**
   * @private — bridges Google's onPaymentDataChanged to the consumer resolver.
   * Google calls this with an INTERMEDIATE address (country/state/city/zip, no
   * street). We hand that to `_onShippingAddressChange` and translate its result
   * back into the { newTransactionInfo } / { error } shape Google expects.
   * @param {Object} intermediatePaymentData
   * @returns {Promise<Object>}
   */
  _log(...args) {
    if (this._debug && typeof console !== "undefined") console.info("[dash4devs googlePay]", ...args);
  }

  async _handlePaymentDataChanged(intermediatePaymentData) {
    const resolver = this._onShippingAddressChange;
    if (typeof resolver !== "function") return {};

    const addr = intermediatePaymentData?.shippingAddress || {};
    this._log("address changed", intermediatePaymentData?.callbackTrigger, addr);
    const started = Date.now();
    try {
      // Google waits on this to update the sheet. A slow or hung resolver used
      // to leave the old total showing with no sign anything went wrong; past
      // the limit the shopper is told instead, and can pick the address again.
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Couldn't update the total in time. Please select the address again.")), RESOLVER_TIMEOUT_MS);
      });
      const res = await Promise.race([
        resolver({
          countryCode: addr.countryCode || this._countryCode,
          administrativeArea: addr.administrativeArea || "", // state
          locality: addr.locality || "",                     // city
          postalCode: addr.postalCode || "",
        }),
        timeout,
      ]).finally(() => clearTimeout(timer));
      this._log(`resolver answered in ${Date.now() - started}ms`, res);

      // Unserviceable address → surface the reason inside the sheet.
      if (res && res.error) {
        const message =
          typeof res.error === "string"
            ? res.error
            : res.error.message || "This address can't be shipped to.";
        return {
          error: { reason: "SHIPPING_ADDRESS_UNSERVICEABLE", message, intent: "SHIPPING_ADDRESS" },
        };
      }
      if (!res || res.totalPrice == null) {
        this._log("resolver returned no totalPrice: the sheet keeps its current total");
        return {};
      }

      const displayItems = Array.isArray(res.lineItems)
        ? res.lineItems.map((li) => ({
            label: li.label,
            type: li.type || "LINE_ITEM",
            price: String(li.price),
          }))
        : undefined;

      return {
        newTransactionInfo: {
          currencyCode: res.currencyCode || this._currencyCode,
          countryCode: this._countryCode,
          totalPriceStatus: "FINAL",
          totalPrice: String(res.totalPrice),
          totalPriceLabel: res.totalPriceLabel || "Total",
          ...(displayItems ? { displayItems } : {}),
        },
      };
    } catch (err) {
      this._log("resolver failed", err);
      return {
        error: {
          reason: "OTHER_ERROR",
          message: (err && err.message) || "Couldn't update the total for this address.",
          intent: "SHIPPING_ADDRESS",
        },
      };
    }
  }

  /**
   * Whether the current device/browser/user can pay with Google Pay.
   * Use this to decide whether to render the button at all.
   * Never throws — returns false on any error.
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    try {
      if (!this._loaded) await this.load();
      const req = {
        apiVersion: API_VERSION,
        apiVersionMinor: API_VERSION_MINOR,
        allowedPaymentMethods: [this._baseCardPaymentMethod()],
      };
      const res = await this._client.isReadyToPay(req);
      return !!res.result;
    } catch (err) {
      if (typeof console !== "undefined") {
        console.warn("[GooglePay] isReadyToPay failed:", err?.message || err);
      }
      return false;
    }
  }

  /**
   * Create the official Google Pay button element.
   * Google brand guidelines require their button — do not build your own.
   *
   * @param {Object} [options]
   * @param {Function} options.onClick - Click handler (call requestToken here).
   * @param {string} [options.buttonColor] - "default" | "black" | "white"
   * @param {string} [options.buttonType] - "buy" | "pay" | "checkout" | "order" | "plain" | "short" | "long"
   * @param {string} [options.buttonSizeMode] - "static" | "fill"
   * @param {string} [options.buttonRadius] - e.g. "8" (px)
   * @returns {HTMLElement} The button node — append it to the DOM yourself.
   */
  createButton(options = {}) {
    if (!this._client) {
      throw new Error("Google Pay not loaded. Call load() / isAvailable() first.");
    }
    const { onClick, ...buttonOpts } = options;
    return this._client.createButton({
      onClick: onClick || (() => {}),
      allowedPaymentMethods: [this._baseCardPaymentMethod()],
      buttonColor: buttonOpts.buttonColor || "black",
      buttonType: buttonOpts.buttonType || "pay",
      buttonSizeMode: buttonOpts.buttonSizeMode || "fill",
      ...(buttonOpts.buttonRadius != null
        ? { buttonRadius: buttonOpts.buttonRadius }
        : {}),
    });
  }

  /**
   * Convenience: render the Google Pay button into a container element and wire
   * its click to requestToken(). Clears the container first (safe to re-run).
   *
   * @param {HTMLElement} container - Element to render the button into.
   * @param {Object} options
   * @param {Function} options.onToken - async ({token, descriptor, paymentData}) => {}
   *   called after the shopper authorizes payment.
   * @param {Function|Object} [options.getTransactionInfo] - Function returning
   *   `{ totalPrice, currencyCode }` at click time (the total often changes as
   *   shipping/tax compute), or a static object. If omitted, pass the total to
   *   requestToken() yourself in onClick.
   * @param {Function} [options.onError] - (err) => {} for failures.
   * @param {Function} [options.onCancel] - () => {} when the shopper closes the sheet.
   * @param {Object} [options.button] - Button styling (see createButton()).
   * @returns {HTMLElement} the rendered button node.
   */
  renderButton(container, options = {}) {
    if (!container) throw new Error("renderButton(container, ...) requires a container element.");
    const { onToken, getTransactionInfo, onError, onCancel, button } = options;

    const handleClick = async () => {
      try {
        const txInfo =
          typeof getTransactionInfo === "function"
            ? getTransactionInfo()
            : getTransactionInfo || {};
        const tok = await this.requestToken(txInfo);
        if (onToken) await onToken(tok);
      } catch (err) {
        // Google throws { statusCode: "CANCELED" } when the shopper closes the sheet.
        if (err && err.statusCode === "CANCELED") {
          if (onCancel) onCancel();
          return;
        }
        if (onError) onError(err);
        else if (typeof console !== "undefined") console.error("[GooglePay]", err);
      }
    };

    const btn = this.createButton({ ...(button || {}), onClick: handleClick });
    container.innerHTML = "";
    container.appendChild(btn);
    return btn;
  }

  /**
   * Open the Google Pay sheet and return a normalized token.
   * MUST be triggered from a user gesture (the button click).
   *
   * @param {Object} [txInfo]
   * @param {string|number} [txInfo.totalPrice] - The order total (e.g. "99.99").
   * @param {string} [txInfo.currencyCode] - Overrides the configured currency.
   * @param {string} [txInfo.totalPriceLabel] - Optional label shown on the sheet.
   * @returns {Promise<{token: string, descriptor: string, paymentData: Object}>}
   */
  async requestToken(txInfo = {}) {
    if (!this._loaded) await this.load();
    if (!this._client) throw new Error("Google Pay not loaded.");

    const totalPrice =
      txInfo.totalPrice != null ? String(txInfo.totalPrice) : undefined;
    if (totalPrice == null) {
      throw new Error("requestToken requires a totalPrice.");
    }

    // With a resolver wired up, the total shown here is only the pre-address
    // ESTIMATE — onPaymentDataChanged replaces it with the FINAL shipping+tax
    // total once the shopper selects an address. SHIPPING_ADDRESS must be
    // declared as a callback intent for Google to fire that callback.
    const dynamicPricing = typeof this._onShippingAddressChange === "function";

    const paymentDataRequest = {
      apiVersion: API_VERSION,
      apiVersionMinor: API_VERSION_MINOR,
      allowedPaymentMethods: [this._baseCardPaymentMethod()],
      emailRequired: this._emailRequired,
      // Dynamic pricing needs the address, so force it on when a resolver is set.
      shippingAddressRequired: this._shippingAddressRequired || dynamicPricing,
      ...((this._shippingAddressRequired || dynamicPricing) && this._shippingAddressParameters
        ? { shippingAddressParameters: this._shippingAddressParameters }
        : {}),
      ...(dynamicPricing ? { callbackIntents: ["SHIPPING_ADDRESS"] } : {}),
      transactionInfo: {
        totalPriceStatus: dynamicPricing ? "ESTIMATED" : "FINAL",
        totalPrice,
        currencyCode: txInfo.currencyCode || this._currencyCode,
        countryCode: this._countryCode,
        ...(txInfo.totalPriceLabel ? { totalPriceLabel: txInfo.totalPriceLabel } : {}),
      },
      merchantInfo: {
        merchantName: this._merchantName || undefined,
        ...(this._environment === "PRODUCTION" && this._merchantId
          ? { merchantId: this._merchantId }
          : {}),
      },
    };

    this._log("opening sheet", { environment: this._environment, dynamicPricing, merchantId: !!paymentDataRequest.merchantInfo.merchantId, totalPrice });
    const paymentData = await this._client.loadPaymentData(paymentDataRequest);
    const rawToken = paymentData?.paymentMethodData?.tokenizationData?.token;
    if (!rawToken) {
      throw new Error("Google Pay returned no payment token.");
    }

    // Authorize.net expects the Base64-encoded token blob.
    const b64 =
      typeof window !== "undefined" && typeof window.btoa === "function"
        ? window.btoa(rawToken)
        : Buffer.from(rawToken, "utf-8").toString("base64");

    return {
      token: b64,
      descriptor: this._descriptor,
      // Buyer info collected by the sheet (present only when requested). Address
      // shape: { name, address1, address2, address3, locality, administrativeArea,
      // postalCode, countryCode, phoneNumber }. administrativeArea is the state.
      email: paymentData?.email || "",
      shippingAddress: paymentData?.shippingAddress || null,
      billingAddress: paymentData?.paymentMethodData?.info?.billingAddress || null,
      paymentData,
    };
  }
}

export default GooglePayCSR;

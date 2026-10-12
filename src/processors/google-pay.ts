/**
 * Google Pay Processor - Client-Side (CSR)
 *
 * Wraps the Google Pay JS API and returns a token in the same shape
 * `dash.payment.tokenize()` does ({ token, descriptor }), ready for
 * `dash.checkout.complete({ payment_token })`.
 *
 * v2: rows shown on the Google Pay sheet (`displayItems`, from
 * onShippingAddressChange's `lineItems`) are passed to Google. Summary rows
 * (Subtotal, Shipping, Tax, Discount...) keep their labels; any other
 * LINE_ITEM label becomes "Item N", so a product name never reaches the
 * wallet provider.
 */

import { maskDisplayItemLabel } from "../core/privacy.js";

const GOOGLE_PAY_JS = "https://pay.google.com/gp/p/js/pay.js";
const RESOLVER_TIMEOUT_MS = 8000;
const GOOGLE_PAY_DESCRIPTOR = "COMMON.GOOGLE.INAPP.PAYMENT";
const API_VERSION = 2;
const API_VERSION_MINOR = 0;
const DEFAULT_CARD_NETWORKS = ["AMEX", "DISCOVER", "JCB", "MASTERCARD", "VISA"];
const DEFAULT_AUTH_METHODS = ["PAN_ONLY", "CRYPTOGRAM_3DS"];

export interface GooglePayConfig {
  gateway: string;
  gatewayMerchantId: string;
  environment?: string;
  merchantName?: string;
  merchantId?: string;
  currencyCode?: string;
  countryCode?: string;
  cardNetworks?: string[];
  authMethods?: string[];
  descriptor?: string;
  emailRequired?: boolean;
  shippingAddressRequired?: boolean;
  shippingAddressParameters?: { allowedCountryCodes?: string[]; phoneNumberRequired?: boolean } | null;
  billingAddressRequired?: boolean;
  phoneNumberRequired?: boolean;
  onShippingAddressChange?: ((address: any) => Promise<any>) | null;
  debug?: boolean;
}

export class GooglePayCSR {
  _gateway: string;
  _gatewayMerchantId: string;
  _environment: "PRODUCTION" | "TEST";
  _merchantName: string;
  _merchantId: string;
  _currencyCode: string;
  _countryCode: string;
  _cardNetworks: string[];
  _authMethods: string[];
  _descriptor: string;
  _emailRequired: boolean;
  _shippingAddressRequired: boolean;
  _shippingAddressParameters: any;
  _billingAddressRequired: boolean;
  _phoneNumberRequired: boolean;
  _onShippingAddressChange: ((address: any) => Promise<any>) | null;
  _debug: boolean;
  _loaded: boolean;
  _loading: Promise<void> | null;
  _client: any;

  constructor(config: GooglePayConfig = {} as GooglePayConfig) {
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
    this._emailRequired = !!config.emailRequired;
    this._shippingAddressRequired = !!config.shippingAddressRequired;
    this._shippingAddressParameters = config.shippingAddressParameters || null;
    this._billingAddressRequired = !!config.billingAddressRequired;
    this._phoneNumberRequired = !!config.phoneNumberRequired;
    this._onShippingAddressChange = config.onShippingAddressChange || null;
    this._debug = !!config.debug;
    this._loaded = false;
    this._loading = null;
    this._client = null;
  }

  _baseCardPaymentMethod(): Record<string, any> {
    return {
      type: "CARD",
      parameters: {
        allowedAuthMethods: this._authMethods,
        allowedCardNetworks: this._cardNetworks,
        ...(this._billingAddressRequired
          ? {
              billingAddressRequired: true,
              billingAddressParameters: { format: "FULL", phoneNumberRequired: this._phoneNumberRequired },
            }
          : {}),
      },
      tokenizationSpecification: {
        type: "PAYMENT_GATEWAY",
        parameters: { gateway: this._gateway, gatewayMerchantId: this._gatewayMerchantId },
      },
    };
  }

  /** Load pay.js and build the PaymentsClient (idempotent, browser only). */
  async load(): Promise<void> {
    if (this._loaded) return;
    if (this._loading) return this._loading;

    if (typeof window === "undefined") {
      throw new Error("GooglePayCSR.load() can only be called in a browser environment.");
    }
    if (!this._gatewayMerchantId) {
      throw new Error(
        "Google Pay is missing gatewayMerchantId. The payment processor must " +
          "be loaded (dash.payment.load()) and configured before using Google Pay."
      );
    }

    this._loading = new Promise<void>((resolve, reject) => {
      const init = () => {
        try {
          const clientOptions: Record<string, any> = { environment: this._environment };
          if (this._onShippingAddressChange) {
            clientOptions.paymentDataCallbacks = {
              onPaymentDataChanged: (intermediate: any) => this._handlePaymentDataChanged(intermediate),
            };
          }
          this._client = new (window as any).google.payments.api.PaymentsClient(clientOptions);
          this._loaded = true;
          resolve();
        } catch (err: any) {
          reject(new Error("Failed to initialize Google Pay: " + err.message));
        }
      };

      const w = window as any;
      if (w.google && w.google.payments && w.google.payments.api) {
        init();
        return;
      }

      const existing = document.querySelector(`script[src="${GOOGLE_PAY_JS}"]`);
      if (existing) {
        existing.addEventListener("load", init, { once: true });
        existing.addEventListener("error", () => reject(new Error("Failed to load Google Pay script.")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = GOOGLE_PAY_JS;
      script.async = true;
      script.onload = init;
      script.onerror = () => reject(new Error("Failed to load Google Pay. Check your network connection."));
      document.head.appendChild(script);
    });

    return this._loading;
  }

  _log(...args: any[]): void {
    if (this._debug && typeof console !== "undefined") console.info("[dash4devs googlePay]", ...args);
  }

  /** Bridges Google's onPaymentDataChanged to the consumer's resolver. */
  async _handlePaymentDataChanged(intermediatePaymentData: any): Promise<Record<string, any>> {
    const resolver = this._onShippingAddressChange;
    if (typeof resolver !== "function") return {};

    const addr = intermediatePaymentData?.shippingAddress || {};
    this._log("address changed", intermediatePaymentData?.callbackTrigger);
    const started = Date.now();
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Couldn't update the total in time. Please select the address again.")),
          RESOLVER_TIMEOUT_MS
        );
      });
      const res: any = await Promise.race([
        resolver({
          countryCode: addr.countryCode || this._countryCode,
          administrativeArea: addr.administrativeArea || "",
          locality: addr.locality || "",
          postalCode: addr.postalCode || "",
        }),
        timeout,
      ]).finally(() => clearTimeout(timer));
      this._log(`resolver answered in ${Date.now() - started}ms`);

      if (res && res.error) {
        const message =
          typeof res.error === "string" ? res.error : res.error.message || "This address can't be shipped to.";
        return { error: { reason: "SHIPPING_ADDRESS_UNSERVICEABLE", message, intent: "SHIPPING_ADDRESS" } };
      }
      if (!res || res.totalPrice == null) {
        this._log("resolver returned no totalPrice: the sheet keeps its current total");
        return {};
      }

      const displayItems = Array.isArray(res.lineItems)
        ? res.lineItems.map((li: any, i: number) => {
            const type = li.type || "LINE_ITEM";
            return { label: maskDisplayItemLabel(li.label, type, i), type, price: String(li.price) };
          })
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
    } catch (err: any) {
      this._log("resolver failed", err && err.message);
      return {
        error: {
          reason: "OTHER_ERROR",
          message: (err && err.message) || "Couldn't update the total for this address.",
          intent: "SHIPPING_ADDRESS",
        },
      };
    }
  }

  /** Whether this device/user can pay with Google Pay. Never throws. */
  async isAvailable(): Promise<boolean> {
    try {
      if (!this._loaded) await this.load();
      const req = {
        apiVersion: API_VERSION,
        apiVersionMinor: API_VERSION_MINOR,
        allowedPaymentMethods: [this._baseCardPaymentMethod()],
      };
      const res = await this._client.isReadyToPay(req);
      return !!res.result;
    } catch (err: any) {
      if (typeof console !== "undefined") {
        console.warn("[GooglePay] isReadyToPay failed:", err?.message || err);
      }
      return false;
    }
  }

  /** The official Google Pay button element (append it yourself). */
  createButton(
    options: {
      onClick?: () => void;
      buttonColor?: string;
      buttonType?: string;
      buttonSizeMode?: string;
      buttonRadius?: string | number;
    } = {}
  ): HTMLElement {
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
      ...(buttonOpts.buttonRadius != null ? { buttonRadius: buttonOpts.buttonRadius } : {}),
    });
  }

  /** Render the button into `container` and wire its click to requestToken(). */
  renderButton(
    container: HTMLElement,
    options: {
      onToken?: (token: any) => void | Promise<void>;
      getTransactionInfo?: any;
      onError?: (err: any) => void;
      onCancel?: () => void;
      button?: Record<string, any>;
    } = {}
  ): HTMLElement {
    if (!container) throw new Error("renderButton(container, ...) requires a container element.");
    const { onToken, getTransactionInfo, onError, onCancel, button } = options;

    const handleClick = async () => {
      try {
        const txInfo = typeof getTransactionInfo === "function" ? getTransactionInfo() : getTransactionInfo || {};
        const tok = await this.requestToken(txInfo);
        if (onToken) await onToken(tok);
      } catch (err: any) {
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

  /** Open the sheet (from a user gesture) and return a normalized token. */
  async requestToken(
    txInfo: { totalPrice?: string | number; currencyCode?: string; totalPriceLabel?: string } = {}
  ): Promise<{
    token: string;
    descriptor: string;
    email: string;
    shippingAddress: any;
    billingAddress: any;
    paymentData: any;
  }> {
    if (!this._loaded) await this.load();
    if (!this._client) throw new Error("Google Pay not loaded.");

    const totalPrice = txInfo.totalPrice != null ? String(txInfo.totalPrice) : undefined;
    if (totalPrice == null) {
      throw new Error("requestToken requires a totalPrice.");
    }

    const dynamicPricing = typeof this._onShippingAddressChange === "function";

    const paymentDataRequest: Record<string, any> = {
      apiVersion: API_VERSION,
      apiVersionMinor: API_VERSION_MINOR,
      allowedPaymentMethods: [this._baseCardPaymentMethod()],
      emailRequired: this._emailRequired,
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
        ...(this._environment === "PRODUCTION" && this._merchantId ? { merchantId: this._merchantId } : {}),
      },
    };

    this._log("opening sheet", {
      environment: this._environment,
      dynamicPricing,
      merchantId: !!paymentDataRequest.merchantInfo.merchantId,
      totalPrice,
    });
    const paymentData = await this._client.loadPaymentData(paymentDataRequest);
    const rawToken = paymentData?.paymentMethodData?.tokenizationData?.token;
    if (!rawToken) {
      throw new Error("Google Pay returned no payment token.");
    }

    const b64 =
      typeof window !== "undefined" && typeof window.btoa === "function"
        ? window.btoa(rawToken)
        : (globalThis as any).Buffer.from(rawToken, "utf-8").toString("base64");

    return {
      token: b64,
      descriptor: this._descriptor,
      email: paymentData?.email || "",
      shippingAddress: paymentData?.shippingAddress || null,
      billingAddress: paymentData?.paymentMethodData?.info?.billingAddress || null,
      paymentData,
    };
  }
}

export default GooglePayCSR;

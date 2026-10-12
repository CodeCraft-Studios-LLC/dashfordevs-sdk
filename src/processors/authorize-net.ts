/**
 * Authorize.net Processor - Client-Side (CSR)
 *
 * Loads Accept.js and tokenizes card data. Card data goes straight to
 * Authorize.net and comes back as an opaque token; nothing about the order
 * (and nothing about what was bought) is part of that exchange.
 */

const ACCEPT_JS_PROD = "https://js.authorize.net/v1/Accept.js";
const ACCEPT_JS_SANDBOX = "https://jstest.authorize.net/v1/Accept.js";

const ERROR_MESSAGES: Record<string, string> = {
  E_WC_01: "Please include all required fields.",
  E_WC_02: "A card number is required.",
  E_WC_03: "A card expiration date is required.",
  E_WC_04: "Please use MM/YY format for the expiration date.",
  E_WC_05: "The card has expired. Please use a different card.",
  E_WC_06: "A card security code (CVV) is required.",
  E_WC_07: "This card type is not accepted.",
  E_WC_08: "The card number is not valid. Please check and try again.",
  E_WC_10: "The payment configuration is invalid. Please contact support.",
  E_WC_14: "An error occurred during processing. Please try again.",
  E_WC_15: "The card security code (CVV) is not valid.",
  E_WC_16: "The transaction was not accepted. Please try a different card.",
  E_WC_17: "An error occurred during processing. Please try again.",
  E_WC_19: "An unexpected error occurred. Please try again.",
  E_WC_21: "The request could not be processed. Please try again.",
};

export interface AuthorizeNetConfig {
  api_login_id: string;
  client_key?: string;
  public_client_key?: string;
  environment?: string;
  [key: string]: any;
}

export interface CardInput {
  cardNumber: string;
  expDate: string;
  cvv: string;
}

export class AuthorizeNetCSR {
  _apiLoginId: string;
  _clientKey: string | undefined;
  _environment: string;
  _loaded: boolean;
  _loading: Promise<void> | null;

  constructor(config: AuthorizeNetConfig) {
    this._apiLoginId = config.api_login_id;
    this._clientKey = config.public_client_key || config.client_key;
    this._environment = config.environment || "test";
    this._loaded = false;
    this._loading = null;
  }

  /** Load Accept.js (idempotent, browser only). */
  async load(): Promise<void> {
    if (this._loaded) return;
    if (this._loading) return this._loading;

    if (typeof window === "undefined") {
      throw new Error(
        "AuthorizeNetCSR.load() can only be called in a browser environment. " +
          "Use AuthorizeNetSSR for server-side operations."
      );
    }

    this._loading = new Promise<void>((resolve, reject) => {
      if ((window as any).Accept) {
        this._loaded = true;
        resolve();
        return;
      }

      const src = this._environment === "live" ? ACCEPT_JS_PROD : ACCEPT_JS_SANDBOX;

      const existing = document.querySelector(`script[src*="authorize.net"]`);
      if (existing) existing.remove();

      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => {
        this._loaded = true;
        resolve();
      };
      script.onerror = () => {
        reject(new Error("Failed to load Accept.js. Check your network connection."));
      };
      document.head.appendChild(script);
    });

    return this._loading;
  }

  /** Tokenize a card with Accept.js -> { token, descriptor }. */
  async tokenize(cardData: CardInput): Promise<{ token: string; descriptor: string }> {
    if (!this._loaded) {
      await this.load();
    }

    const Accept = (window as any).Accept;
    if (!Accept) {
      throw new Error("Accept.js is not loaded. Call load() first.");
    }

    const cleaned = this._validateAndClean(cardData);

    return new Promise((resolve, reject) => {
      const secureData = {
        authData: { clientKey: this._clientKey, apiLoginID: this._apiLoginId },
        cardData: {
          cardNumber: cleaned.cardNumber,
          month: cleaned.month,
          year: cleaned.year,
          cardCode: cleaned.cvv,
        },
      };

      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error("Payment processing timed out. Please check your card details and try again."));
        }
      }, 30000);

      try {
        Accept.dispatchData(secureData, (response: any) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);

          if (response.messages.resultCode === "Error") {
            const errors = response.messages.message || [];
            const firstError = errors[0] || {};
            const code = firstError.code || "";
            const friendlyMessage = ERROR_MESSAGES[code] || firstError.text || "Card validation failed.";

            const error: any = new Error(friendlyMessage);
            error.code = code;
            error.details = errors;
            reject(error);
            return;
          }

          resolve({
            token: response.opaqueData.dataValue,
            descriptor: response.opaqueData.dataDescriptor,
          });
        });
      } catch {
        settled = true;
        clearTimeout(timeout);
        reject(new Error("Failed to process card. Please try again."));
      }
    });
  }

  _validateAndClean(cardData: CardInput): { cardNumber: string; month: string; year: string; cvv: string } {
    if (!cardData) throw new Error("Card data is required.");

    const { cardNumber, expDate, cvv } = cardData;

    if (!cardNumber) throw new Error("Card number is required.");
    const cleanNumber = cardNumber.replace(/\s+/g, "");
    if (!/^\d{13,19}$/.test(cleanNumber)) {
      throw new Error("Invalid card number.");
    }

    if (!expDate) throw new Error("Expiration date is required.");
    const expMatch = expDate.match(/^(\d{1,2})\/?(\d{2,4})$/);
    if (!expMatch) throw new Error("Expiration date must be in MM/YY or MM/YYYY format.");

    const month = expMatch[1].padStart(2, "0");
    let year = expMatch[2];
    if (year.length === 4) year = year.slice(-2);

    const monthNum = parseInt(month, 10);
    if (monthNum < 1 || monthNum > 12) {
      throw new Error("Invalid expiration month.");
    }

    const now = new Date();
    const currentYear = now.getFullYear() % 100;
    const currentMonth = now.getMonth() + 1;
    const yearNum = parseInt(year, 10);

    if (yearNum < currentYear || (yearNum === currentYear && monthNum < currentMonth)) {
      throw new Error("This card has expired.");
    }

    if (!cvv) throw new Error("Security code (CVV) is required.");
    if (!/^\d{3,4}$/.test(cvv)) {
      throw new Error("Security code must be 3 or 4 digits.");
    }

    return { cardNumber: cleanNumber, month, year, cvv };
  }
}

export default AuthorizeNetCSR;

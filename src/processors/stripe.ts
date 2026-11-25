/**
 * Stripe Processor - Client-Side (CSR), added 2026-11-25.
 *
 * Loads Stripe.js and mounts Stripe Elements INSIDE the site's own checkout:
 * card number, expiry and CVC as three separate fields the site places in its
 * own layout and styles (fonts, colours, sizes) to match its inputs. No
 * Stripe-hosted page (Checkout, Payment Links, customer portal) is ever used.
 *
 * tokenize() turns the mounted fields into a PaymentMethod (`pm_...`): the card
 * goes from Stripe's fields straight to Stripe; the site and DashForDevs only
 * ever see the PaymentMethod id, which the payments service charges.
 */

const STRIPE_JS = "https://js.stripe.com/v3/";

export interface StripeConfig {
  publishable_key: string;
  environment?: string;
  [key: string]: any;
}

/** Where each Stripe field mounts: an element or a CSS selector. */
export interface StripeCardTargets {
  number: HTMLElement | string;
  expiry: HTMLElement | string;
  cvc: HTMLElement | string;
}

export interface StripeFieldStyle {
  /** Stripe Elements style object: { base: {...}, invalid: {...}, complete: {...} } */
  style?: Record<string, any>;
  /** Placeholders per field. */
  placeholders?: Partial<Record<keyof StripeCardTargets, string>>;
  /** Web fonts for Elements, e.g. [{ cssSrc: "https://fonts.googleapis.com/css2?family=Space+Grotesk" }] */
  fonts?: Record<string, any>[];
}

export interface StripeCardState {
  /** "visa", "mastercard", "amex", ... or "unknown" */
  brand: string;
  /** Every field is filled and valid. */
  complete: boolean;
  /** The first field error Stripe reports, in plain words. */
  error: string | null;
  fields: Record<keyof StripeCardTargets, { complete: boolean; empty: boolean; error: string | null }>;
}

export interface StripeBilling {
  name?: string;
  email?: string;
  phone?: string;
  zip?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
}

export class StripeCSR {
  _publishableKey: string;
  _environment: string;
  _stripe: any;
  _elements: any;
  _fields: Partial<Record<keyof StripeCardTargets, any>>;
  _state: StripeCardState;
  _loading: Promise<void> | null;

  constructor(config: StripeConfig) {
    this._publishableKey = config.publishable_key;
    this._environment = config.environment || "test";
    this._stripe = null;
    this._elements = null;
    this._fields = {};
    this._loading = null;
    const blank = { complete: false, empty: true, error: null };
    this._state = { brand: "unknown", complete: false, error: null, fields: { number: { ...blank }, expiry: { ...blank }, cvc: { ...blank } } };
  }

  /** Load Stripe.js (idempotent, browser only). */
  async load(): Promise<void> {
    if (this._stripe) return;
    if (this._loading) return this._loading;
    if (typeof window === "undefined") throw new Error("StripeCSR.load() can only run in the browser.");
    if (!this._publishableKey) throw new Error("The Stripe publishable key is missing from the payment config.");

    this._loading = new Promise<void>((resolve, reject) => {
      const ready = () => {
        const Stripe = (window as any).Stripe;
        if (!Stripe) return reject(new Error("Stripe.js did not load."));
        this._stripe = Stripe(this._publishableKey);
        resolve();
      };
      if ((window as any).Stripe) return ready();
      let script = document.querySelector<HTMLScriptElement>(`script[src^="${STRIPE_JS}"]`);
      if (!script) {
        script = document.createElement("script");
        script.src = STRIPE_JS;
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", ready, { once: true });
      script.addEventListener("error", () => reject(new Error("Stripe.js could not be loaded.")), { once: true });
    });
    return this._loading;
  }

  /**
   * Mount card number, expiry and CVC into the site's own containers.
   * `onChange` fires with the combined state (brand, complete, first error).
   * Returns an unmount function.
   */
  mount(targets: StripeCardTargets, options: StripeFieldStyle = {}, onChange?: (state: StripeCardState) => void): () => void {
    if (!this._stripe) throw new Error("Call dash.payment.load() before mounting the card fields.");
    this.unmount();
    this._elements = this._stripe.elements(options.fonts ? { fonts: options.fonts } : undefined);
    const kinds: [keyof StripeCardTargets, string][] = [["number", "cardNumber"], ["expiry", "cardExpiry"], ["cvc", "cardCvc"]];
    for (const [key, type] of kinds) {
      const field = this._elements.create(type, {
        style: options.style,
        ...(options.placeholders?.[key] ? { placeholder: options.placeholders[key] } : {}),
        ...(key === "number" ? { showIcon: true, iconStyle: "solid" } : {}),
      });
      field.on("change", (e: any) => {
        this._state.fields[key] = { complete: !!e.complete, empty: !!e.empty, error: e.error?.message ?? null };
        if (key === "number" && e.brand) this._state.brand = e.brand;
        const all = Object.values(this._state.fields);
        this._state.complete = all.every((f) => f.complete);
        this._state.error = all.find((f) => f.error)?.error ?? null;
        onChange?.({ ...this._state, fields: { ...this._state.fields } });
      });
      field.mount(targets[key]);
      this._fields[key] = field;
    }
    return () => this.unmount();
  }

  unmount(): void {
    for (const f of Object.values(this._fields)) {
      try {
        f?.destroy();
      } catch {
        /* already gone */
      }
    }
    this._fields = {};
  }

  get state(): StripeCardState {
    return this._state;
  }

  /**
   * The mounted card -> a PaymentMethod id. Card data never touches the site.
   * Returns the same { token, descriptor } shape as Accept.js.
   */
  async tokenize(billing: StripeBilling = {}): Promise<{ token: string; descriptor: string }> {
    if (!this._stripe || !this._fields.number) throw new Error("Mount the card fields first (dash.payment.mountCard).");
    const address: Record<string, string> = {};
    if (billing.zip) address.postal_code = billing.zip;
    if (billing.address) address.line1 = billing.address;
    if (billing.city) address.city = billing.city;
    if (billing.state) address.state = billing.state;
    address.country = billing.country || "US";
    const { paymentMethod, error } = await this._stripe.createPaymentMethod({
      type: "card",
      card: this._fields.number,
      billing_details: {
        ...(billing.name ? { name: billing.name } : {}),
        ...(billing.email ? { email: billing.email } : {}),
        ...(billing.phone ? { phone: billing.phone } : {}),
        address,
      },
    });
    if (error || !paymentMethod?.id) throw new Error(error?.message || "Your card could not be read. Check it and try again.");
    return { token: paymentMethod.id, descriptor: "stripe.payment_method" };
  }
}

export default StripeCSR;

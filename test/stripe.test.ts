// @vitest-environment jsdom
/**
 * Stripe (2026-11-25): the card fields are Stripe Elements mounted in the site's own
 * containers; tokenize() hands back a PaymentMethod id, never card data.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StripeCSR } from "../src/processors/stripe";

function fakeStripe() {
  const fields: Record<string, any> = {};
  const created: any[] = [];
  const stripe = {
    elements: vi.fn(() => ({
      create: (type: string, opts: any) => {
        const handlers: Record<string, (e: any) => void> = {};
        const field = { type, opts, mount: vi.fn(), destroy: vi.fn(), on: (ev: string, fn: any) => (handlers[ev] = fn), fire: (e: any) => handlers.change?.(e) };
        fields[type] = field;
        created.push(field);
        return field;
      },
    })),
    createPaymentMethod: vi.fn(async (args: any) => ({ paymentMethod: { id: "pm_test_123" }, args })),
  };
  return { stripe, fields, created };
}

describe("StripeCSR", () => {
  let fake: ReturnType<typeof fakeStripe>;
  beforeEach(() => {
    fake = fakeStripe();
    (window as any).Stripe = vi.fn(() => fake.stripe);
    document.body.innerHTML = `<div id="n"></div><div id="e"></div><div id="c"></div>`;
  });

  it("mounts three fields into the site's containers and reports state", async () => {
    const csr = new StripeCSR({ publishable_key: "pk_test_x" });
    await csr.load();
    expect((window as any).Stripe).toHaveBeenCalledWith("pk_test_x");
    const states: any[] = [];
    csr.mount({ number: "#n", expiry: "#e", cvc: "#c" }, { style: { base: { fontSize: "16px" } } }, (s) => states.push(s));
    expect(fake.created.map((f) => f.type)).toEqual(["cardNumber", "cardExpiry", "cardCvc"]);
    expect(fake.fields.cardNumber.mount).toHaveBeenCalledWith("#n");
    expect(fake.fields.cardNumber.opts.style).toEqual({ base: { fontSize: "16px" } });
    fake.fields.cardNumber.fire({ complete: true, empty: false, brand: "visa" });
    fake.fields.cardExpiry.fire({ complete: true, empty: false });
    expect(states.at(-1).complete).toBe(false);
    fake.fields.cardCvc.fire({ complete: true, empty: false });
    expect(states.at(-1)).toMatchObject({ complete: true, brand: "visa", error: null });
  });

  it("tokenize returns a PaymentMethod id with the Accept.js shape", async () => {
    const csr = new StripeCSR({ publishable_key: "pk_test_x" });
    await csr.load();
    csr.mount({ number: "#n", expiry: "#e", cvc: "#c" });
    const token = await csr.tokenize({ name: "Kai Test", zip: "96815" });
    expect(token).toEqual({ token: "pm_test_123", descriptor: "stripe.payment_method" });
    const args = fake.stripe.createPaymentMethod.mock.calls[0][0];
    expect(args.card).toBe(fake.fields.cardNumber);
    expect(args.billing_details.address).toEqual({ postal_code: "96815", country: "US" });
  });

  it("refuses to tokenize before the fields are mounted", async () => {
    const csr = new StripeCSR({ publishable_key: "pk_test_x" });
    await csr.load();
    await expect(csr.tokenize()).rejects.toThrow(/Mount the card fields/);
  });

  it("surfaces Stripe's card error in plain words", async () => {
    fake.stripe.createPaymentMethod = vi.fn(async () => ({ error: { message: "Your card number is incomplete." } })) as any;
    const csr = new StripeCSR({ publishable_key: "pk_test_x" });
    await csr.load();
    csr.mount({ number: "#n", expiry: "#e", cvc: "#c" });
    await expect(csr.tokenize()).rejects.toThrow("Your card number is incomplete.");
  });
});

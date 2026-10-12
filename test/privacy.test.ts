/**
 * PHI hygiene that v2 adds on purpose (and the documented differences from v1
 * that come with it).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { loadV1, loadV2, recorder, withGlobalFetch } from "./helpers";

let V1: any;
let V2: any;
beforeAll(async () => {
  V1 = await loadV1();
  V2 = await loadV2();
});

// The shape real storefronts send (lostthc-frontend/app/checkout/page.tsx):
// product names and size labels in line_items, which the API forwards to
// Authorize.net as lineItems[].name / description.
const LINE_ITEMS = [
  { id: "invprod__ZkxUPfeDxYUU5Ltgg", name: "BPC-157 Peptide 10mg", description: "10mg vial / Research", quantity: "2", unit_price: "49.99" },
  { id: "bpc-157-10mg", name: "Semaglutide Pen", description: "0.5mg", quantity: "1", unit_price: "199.00" },
];
const NAMES = ["BPC-157", "Peptide", "Semaglutide", "10mg vial", "0.5mg", "bpc-157-10mg"];

function assertNoProductNames(body: unknown) {
  const s = JSON.stringify(body);
  for (const n of NAMES) expect(s).not.toContain(n);
}

describe("payment processors never see products", () => {
  it("checkout.complete masks payment_token.line_items and description", async () => {
    const { fetchMock, calls } = recorder();
    const d = new V2.DashClient({ apiKey: "pk_test_x", fetch: fetchMock });
    await d.checkout.complete({
      cartId: "cart_1",
      shipping: { first_name: "A", last_name: "B", address: "1", city: "C", state: "NY", zip_code: "10001" },
      payment_token: {
        token: "tok",
        descriptor: "COMMON.ACCEPT.INAPP.PAYMENT",
        billing: { first_name: "A", last_name: "B", zip_code: "10001" },
        customer: { email: "a@b.co", id: "cus__1" },
        line_items: LINE_ITEMS,
        description: "BPC-157 order",
        save_card: true,
      },
    });
    const sent = calls[0].body.payment_token;
    assertNoProductNames(sent);
    expect(sent.line_items).toEqual([
      { id: "invprod__ZkxUPfeDxYUU5Ltgg", name: "Item 1", quantity: "2", unit_price: "49.99" },
      { id: "2", name: "Item 2", quantity: "1", unit_price: "199.00" },
    ]);
    expect(sent.description).toBe("");
    // Everything the processor legitimately needs is untouched.
    expect(sent.token).toBe("tok");
    expect(sent.billing).toEqual({ first_name: "A", last_name: "B", zip_code: "10001" });
    expect(sent.customer).toEqual({ email: "a@b.co", id: "cus__1" });
    expect(sent.save_card).toBe(true);
  });

  it("v1 sent the names (documented difference)", async () => {
    const { fetchMock, calls } = recorder();
    await withGlobalFetch(fetchMock, async () => {
      const d = new V1.DashClient({ apiKey: "pk_test_x" });
      await d.checkout.complete({ cartId: "c", shipping: {}, payment_token: { token: "t", line_items: LINE_ITEMS } });
    });
    expect(JSON.stringify(calls[0].body)).toContain("BPC-157");
  });

  it("payment.charge and payment.authorize mask line items and keep an order-number description", async () => {
    const { fetchMock, calls } = recorder();
    const d = new V2.DashClient({ apiKey: "pk_test_x", fetch: fetchMock });
    await d.payment.charge({ token: "t", amount: "248.98", invoiceNumber: "1001", description: "Order #1001", line_items: LINE_ITEMS });
    await d.payment.authorize({ token: "t", amount: "1", description: "Semaglutide refill", line_items: LINE_ITEMS });
    assertNoProductNames(calls[0].body);
    assertNoProductNames(calls[1].body);
    expect(calls[0].body.description).toBe("Order #1001");
    expect(calls[1].body.description).toBe("");
    expect(calls[0].body.amount).toBe("248.98");
    expect(calls[0].body.invoice_number).toBe("1001");
  });

  it("sanitizePaymentToken and maskLineItems are exported for custom flows", () => {
    expect(V2.maskLineItems([{ name: "X", quantity: 1, unit_price: 2, sku: "SKU-PEPTIDE" }])).toEqual([
      { id: "1", name: "Item 1", quantity: 1, unit_price: 2 },
    ]);
    expect(V2.sanitizePaymentToken({ token: "t" })).toEqual({ token: "t" });
  });
});

describe("PHI shapes and path templating match DFD15's door", () => {
  // Cases from services/analytics/backend/facts/deidentify.py and its tests.
  it.each([
    ["jane.doe@example.com", ["email"]],
    ["call 555-123-4567", ["phone"]],
    ["ssn 123-45-6789", ["ssn"]],
    ["4111 1111 1111 1111", ["card"]],
    ["from 192.168.1.20", ["ip"]],
    ["ord__x9F3k2", []],
  ])("phiShapes(%s)", (value, shapes) => {
    expect(V2.phiShapes(value)).toEqual(expect.arrayContaining(shapes));
    if (!shapes.length) expect(V2.phiShapes(value)).toEqual([]);
  });

  it.each([
    ["/orders/ord__abc?email=x@y.co", "/orders/:id"],
    ["https://shop.example/account/orders/1042?token=abc#x", "/account/orders/:id"],
    ["/products/blue-dream", "/products/blue-dream"],
    ["/u/jane@example.com/profile", "/u/:redacted/profile"],
    ["/checkout?token=checkout__abc123", "/checkout"],
    ["", "/"],
  ])("templatePath(%s) = %s", (raw, expected) => {
    expect(V2.templatePath(raw)).toBe(expected);
  });
});

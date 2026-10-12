// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://shop.example/account/orders/1042?email=jane%40example.com&utm_source=google&utm_campaign=fall&token=checkout__secret"}
/**
 * Browser behaviour: what analytics actually sends, Google Pay sheet labels,
 * branding, and the secret-key guard.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadV1, loadV2, recorder, withGlobalFetch } from "./helpers";

let V1: any;
let V2: any;
beforeAll(async () => {
  V1 = await loadV1();
  V2 = await loadV2();
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.title = "BPC-157 Peptide | Shop";
  Object.defineProperty(document, "referrer", { value: "https://www.google.com/search?q=bpc-157+for+my+knee", configurable: true });
  document.body.innerHTML = `<button id="buy-bpc-157" class="btn primary">Buy BPC-157 for Jane</button><a id="out" href="https://partner.example/deal?email=jane@example.com">Partner</a>`;
  (window as any).__dash4devsConsoleWarned = true;
});
afterEach(() => {
  vi.useRealTimers();
});

const SECRETS = ["jane", "Jane", "BPC", "bpc", "1042", "checkout__secret", "cus__42", "knee", "buy-bpc", "Peptide"];

function collectBodies(calls: any[]) {
  return calls.filter((c) => c.url.includes("/analytics/collect")).map((c) => c.body);
}

async function exerciseInsights(d: any) {
  d.insights.init({ autoClicks: true, flushIntervalMs: 60_000 });
  d.auth._customer = { id: "cus__42", email: "jane@example.com" }; // login ties identity (v1 behaviour)
  (document.getElementById("buy-bpc-157") as HTMLElement).click();
  d.insights.track("added_to_cart", { product: "BPC-157 Peptide", value: 49.99, email: "jane@example.com" });
  d.insights.conversion(49.99, { name: "lead", note: "Jane wants BPC-157" });
  d.insights.flush();
  await new Promise((r) => setTimeout(r, 0));
}

describe("insights (first-party analytics)", () => {
  it("de-identified by default: no customer id, no query strings, no titles, no click text, no free-form props", async () => {
    const { fetchMock, calls } = recorder();
    const d = new V2.DashClient({ apiKey: "pk_test_x", fetch: fetchMock });
    await exerciseInsights(d);
    const bodies = collectBodies(calls);
    expect(bodies.length).toBeGreaterThan(0);
    const all = JSON.stringify(bodies);
    for (const s of SECRETS) expect(all).not.toContain(s);
    const env = bodies[0];
    expect(env.customer_id).toBe("");
    expect(env.visitor_id).toMatch(/^v_/);
    expect(env.device.os).toBe("");
    expect(env.device.screen).toBe("");
    const pv = bodies.flatMap((b: any) => b.events).find((e: any) => e.type === "pageview");
    expect(pv.path).toBe("/account/orders/:id");
    expect(pv.url).toBe("https://shop.example/account/orders/:id");
    expect(pv.referrer).toBe("https://www.google.com/");
    expect(pv.title).toBe("");
    const custom = bodies.flatMap((b: any) => b.events).find((e: any) => e.type === "custom");
    expect(custom).toMatchObject({ name: "added_to_cart", props: {}, value: 49.99 });
    expect(env.attribution.ft).toMatchObject({ source: "google", campaign: "fall", landing: "https://shop.example/account/orders/:id" });
    // the beacon URL carries only the PUBLIC key, as in v1
    expect(calls.some((c) => c.url.endsWith("/api/storefront/analytics/collect?k=pk_test_x"))).toBe(true);
  });

  it('analytics: "legacy" restores v1 payloads (and warns once)', async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { fetchMock, calls } = recorder();
    const d = new V2.DashClient({ apiKey: "pk_test_x", fetch: fetchMock, analytics: "legacy" });
    await exerciseInsights(d);
    const all = JSON.stringify(collectBodies(calls));
    expect(all).toContain("cus__42");
    expect(all).toContain("checkout__secret");
    warn.mockRestore();
  });

  it("v1 sent the same identifiers (documented difference)", async () => {
    const { fetchMock, calls } = recorder();
    await withGlobalFetch(fetchMock, async () => {
      const d = new V1.DashClient({ apiKey: "pk_test_x" });
      await exerciseInsights(d);
    });
    const all = JSON.stringify(collectBodies(calls));
    expect(all).toContain("cus__42");
    expect(all).toContain("jane%40example.com");
    expect(all).toContain("BPC-157 Peptide | Shop"); // page title
    expect(all).toContain("buy-bpc-157"); // element id (jsdom has no innerText, so click text is empty here)
  });

  it("storage keys are v1's, so a returning visitor keeps their id across the upgrade", async () => {
    localStorage.setItem("d4d_vid", "v_existing");
    const { fetchMock } = recorder();
    const d = new V2.DashClient({ apiKey: "pk_test_x", fetch: fetchMock });
    expect(d.insights.getVisitorId()).toBe("v_existing");
  });

  it("checkout attribution is coarsened the same way", () => {
    const { fetchMock } = recorder();
    const d = new V2.DashClient({ apiKey: "pk_test_x", fetch: fetchMock });
    d.insights.init({ autoClicks: false, autoPageviews: false });
    const a = d.insights.attributionForOrder();
    expect(JSON.stringify(a)).not.toContain("jane");
    expect(a.ft.landing).toBe("https://shop.example/account/orders/:id");
    d.insights.destroy();
  });
});

describe("tracking.trackVisit", () => {
  it("de-identified: path without query, referrer domain, no customer id", async () => {
    const { fetchMock, calls } = recorder();
    const d = new V2.DashClient({ apiKey: "pk_test_x", fetch: fetchMock });
    d.tracking.setCustomer("cus__42");
    await d.tracking.trackVisit();
    const body = calls.find((c) => c.url.endsWith("/analytics/track-visit"))!.body;
    expect(body).toMatchObject({
      utm_source: "google",
      utm_campaign: "fall",
      landing_page: "https://shop.example/account/orders/:id",
      referrer: "https://www.google.com/",
      customer_id: "",
    });
  });

  it("PostHog identify/capture properties lose person fields", () => {
    const { fetchMock } = recorder();
    const d = new V2.DashClient({ apiKey: "pk_test_x", fetch: fetchMock });
    const engine = { identify: vi.fn(), capture: vi.fn(), setPersonProperties: vi.fn() };
    d.tracking._engine = engine;
    d.tracking.identify("cus__42", { email: "jane@example.com", first_name: "Jane", plan: "gold" });
    d.tracking.capture("viewed", { phone: "555-123-4567", price: 5, note: "jane@example.com" });
    expect(engine.identify).toHaveBeenCalledWith("cus__42", { plan: "gold" });
    expect(engine.capture).toHaveBeenCalledWith("viewed", { price: 5 });
  });

  it("_log and _debugLogs still exist (storefronts patch them)", () => {
    const d = new V2.DashClient({ apiKey: "pk_test_x", fetch: recorder().fetchMock });
    const seen: string[] = [];
    d.tracking._log = (m: string) => seen.push(m);
    d.tracking.clearCustomer();
    expect(seen).toContain("Customer cleared");
    expect(Array.isArray(d.tracking._debugLogs)).toBe(true);
  });
});

describe("Google Pay sheet rows", () => {
  it("summary labels stay; any other line item becomes Item N", async () => {
    const gp = new V2.GooglePayCSR({
      gateway: "authorizenet",
      gatewayMerchantId: "x",
      onShippingAddressChange: async () => ({
        totalPrice: "60.00",
        lineItems: [
          { label: "Subtotal", type: "SUBTOTAL", price: "50.00" },
          { label: "BPC-157 Peptide 10mg", type: "LINE_ITEM", price: "40.00" },
          { label: "Shipping", type: "LINE_ITEM", price: "5.00" },
          { label: "Tax", type: "TAX", price: "5.00" },
        ],
      }),
    });
    const res = await gp._handlePaymentDataChanged({ shippingAddress: { administrativeArea: "NY", postalCode: "10001" } });
    expect(res.newTransactionInfo.displayItems.map((i: any) => i.label)).toEqual(["Subtotal", "Item 2", "Shipping", "Tax"]);
  });
});

describe("browser guards and branding", () => {
  it("a secret key in the browser throws (as v1)", () => {
    expect(() => new V2.DashClient({ apiKey: "sk_live_abc" })).toThrow(/SECRET key/);
  });

  it("branding strip lands after the last footer, nofollow, UTM-tagged", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = "<main></main><footer>a</footer><footer>site</footer>";
    new V2.DashClient({ apiKey: "pk_live_abc", fetch: recorder().fetchMock });
    await vi.advanceTimersByTimeAsync(2500);
    const strip = document.getElementById("dash4devs-branding")!;
    expect(strip.previousElementSibling!.textContent).toBe("site");
    const a = strip.querySelector("a")!;
    expect(a.rel).toBe("nofollow noopener noreferrer");
    expect(a.href).toContain("utm_source=shop.example");
  });

  it("getSessionId survives blocked storage", () => {
    const d = new V2.DashClient({ apiKey: "pk_test_x", fetch: recorder().fetchMock });
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(d.getSessionId()).toBe("");
    spy.mockRestore();
  });
});

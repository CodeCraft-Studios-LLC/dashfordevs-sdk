/**
 * v1 has no test suite or example app of its own, so its README is the
 * closest thing to "v1's own examples". Each snippet below is transcribed
 * from Dash4Devs/dash4devs-sdk/README.md (section in the test name) and run
 * through v1 and v2 against the same mocked API; requests and results must
 * match. The README's error-handling section promises `error.code`, which v1
 * never set and v2 does.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { UNIVERSAL, loadV1, loadV2, recorder, withGlobalFetch } from "./helpers";

let V1: any;
let V2: any;
beforeAll(async () => {
  V1 = await loadV1();
  V2 = await loadV2();
});

const examples: Record<string, (dash: any, store: Map<string, string>) => Promise<unknown>> = {
  "Quick Start": async (dash) => {
    const { global } = await dash.getGlobalData();
    const { products } = await dash.products.list({ limit: 12 });
    return [global, products];
  },
  Products: async (dash) => {
    const { products, pagination } = await dash.products.list({ limit: 20, offset: 0, category: "electronics", search: "laptop" });
    const { product } = await dash.products.get("product-slug");
    const deals = await dash.products.list({ category: "deals" });
    return [products, pagination, product, deals];
  },
  Categories: async (dash) => {
    const a = await dash.categories.list();
    const b = await dash.categories.list({ tree: true });
    const { category } = await dash.categories.get("electronics", { includeProducts: true, limit: 10 });
    return [a, b, category];
  },
  SEO: async (dash) => dash.seo.product("product-slug"),
  Cart: async (dash, store) => {
    const result = await dash.cart.add({ productId: "prod_abc123", sizeId: "size_456", quantity: 2 });
    store.set("cart_id", result.cart_id);
    await dash.cart.load(store.get("cart_id"));
    const cart = await dash.cart.get();
    await dash.cart.update("size_456", 3);
    await dash.cart.remove("size_456");
    await dash.cart.clear();
    const { itemCount, subtotal } = dash.cart.getTotals();
    return [cart, itemCount, subtotal, dash.cart.items];
  },
  Pages: async (dash) => {
    const a = await dash.getPageData("/products/my-product");
    const b = await dash.getPageData("home", { byName: true });
    const { pages } = await dash.pages.list();
    return [a, b, pages];
  },
  "Health check": async (dash) => dash.ping(),
  "React CartProvider example (addItem)": async (dash, store) => {
    const result = await dash.cart.add({ productId: "p", sizeId: "s", quantity: 1 });
    if (result.cart_id) store.set("cart_id", result.cart_id);
    return [dash.cart.items, dash.cart.getTotals().subtotal];
  },
};

describe("v1 README examples run the same on v2", () => {
  for (const [name, run] of Object.entries(examples)) {
    it(name, async () => {
      const r1 = recorder();
      const out1 = await withGlobalFetch(r1.fetchMock, () => run(new V1.DashClient({ apiKey: "pk_test_readme", baseURL: "https://papi.dashfordevs.com" }), new Map()));
      const r2 = recorder();
      const out2 = await run(new V2.DashClient({ apiKey: "pk_test_readme", fetch: r2.fetchMock }), new Map());
      expect(r2.calls).toEqual(r1.calls);
      expect(out2).toEqual(out1);
      expect(r2.calls.length).toBeGreaterThan(0);
    });
  }

  it("Error Handling: message and status as v1; error.code as the README promised", async () => {
    const body = { error: "not_found", message: "Product not found" };
    const r1 = recorder(() => ({ status: 404, body }));
    const e1 = await withGlobalFetch(r1.fetchMock, () => new V1.DashClient({ apiKey: "pk_test_readme", baseURL: "https://papi.dashfordevs.com" }).products.get("non-existent").catch((e: any) => e));
    const r2 = recorder(() => ({ status: 404, body }));
    const e2 = await new V2.DashClient({ apiKey: "pk_test_readme", fetch: r2.fetchMock }).products.get("non-existent").catch((e: any) => e);
    expect([e2.message, e2.status]).toEqual([e1.message, e1.status]);
    expect(e1.code).toBeUndefined();
    expect(e2.code).toBe("not_found");
  });

  it("uses the universal mock body", () => {
    expect(UNIVERSAL.cart_id).toBe("cart_1");
  });
});

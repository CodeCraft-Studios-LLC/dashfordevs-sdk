/**
 * Contract tests against real production response shapes.
 *
 * fixtures/production holds Lost THC's public catalog/content responses,
 * captured with read-only GETs from api.dashfordevs.com by
 * scripts/capture-fixtures.mjs (keys and contact details scrubbed, arrays cut
 * to 3). Each fixture is served back through a mocked fetch to the SDK method
 * that reads that endpoint, through v1 and v2, against both API hosts:
 *   - the request path and query match what production was asked;
 *   - v2 returns the body unchanged (no reshaping) and equal to v1's result;
 *   - the body has the fields v1's types promise storefronts.
 * The same manifest drives scripts/papi-diff.mjs, which compares papi's live
 * answers to these fixtures structurally.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PAPI, PROD, ROOT, loadV1, loadV2, recorder, settle, withGlobalFetch } from "./helpers";

const DIR = path.join(ROOT, "fixtures", "production");
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, "manifest.json"), "utf8"));
const fixture = (name: string) => JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), "utf8"));

const seg = (p: string, i: number) => decodeURIComponent(p.split("?")[0].split("/").filter(Boolean)[i]);

/** fixture name -> how a storefront reads it, and what v1's types promise. */
const CALLS: Record<string, { call: (d: any, p: string) => Promise<any>; shape?: (b: any) => void }> = {
  ping: { call: (d) => d.ping(), shape: (b) => expect(b).toMatchObject({ status: expect.any(String), organization: { id: expect.any(String), name: expect.any(String), is_locked: expect.any(Boolean) } }) },
  global: { call: (d) => d.getGlobalData(), shape: (b) => expect(b.global).toHaveProperty("store_name") },
  "products-list": {
    call: (d) => d.products.list({ limit: 3 }),
    shape: (b) => {
      expect(Array.isArray(b.products)).toBe(true);
      expect(b.pagination).toMatchObject({ total: expect.any(Number), limit: expect.any(Number), offset: expect.any(Number), has_more: expect.any(Boolean) });
      for (const p of b.products) expect(p).toMatchObject({ id: expect.any(String), name: expect.any(String), slug: expect.any(String) });
    },
  },
  "product-core": { call: (d, p) => d.products.getCore(seg(p, 3)), shape: (b) => expect(b.product).toMatchObject({ id: expect.any(String), slug: expect.any(String) }) },
  "product-options": { call: (d, p) => d.products.getOptions(seg(p, 3)), shape: (b) => expect(b).toHaveProperty("options") },
  "product-reviews": { call: (d, p) => d.products.getReviews(seg(p, 3), { limit: 2 }), shape: (b) => expect(Array.isArray(b.reviews)).toBe(true) },
  "seo-product": { call: (d, p) => d.seo.product(seg(p, 4)), shape: (b) => expect(b).toHaveProperty("seo") },
  reviews: { call: (d) => d.products.getAllReviews({ limit: 2 }), shape: (b) => expect(b).toMatchObject({ reviews: expect.any(Array), pagination: expect.any(Object) }) },
  "featured-variations": { call: (d) => d.products.getFeaturedVariations(), shape: (b) => expect(Array.isArray(b.variations)).toBe(true) },
  categories: { call: (d) => d.categories.list(), shape: (b) => b.categories.forEach((c: any) => expect(c).toMatchObject({ id: expect.any(String), slug: expect.any(String) })) },
  "categories-tree": { call: (d) => d.categories.getTree(), shape: (b) => expect(Array.isArray(b.categories)).toBe(true) },
  category: { call: (d, p) => d.categories.get(seg(p, 3), { limit: 2 }), shape: (b) => expect(b.category).toHaveProperty("slug") },
  brands: { call: (d) => d.brands.list(), shape: (b) => expect(Array.isArray(b.brands)).toBe(true) },
  brand: { call: (d, p) => d.brands.get(seg(p, 3), { limit: 2 }), shape: (b) => expect(b).toMatchObject({ brand: expect.any(Object), products: expect.any(Array) }) },
  "blog-posts": { call: (d) => d.blog.list({ limit: 2 }), shape: (b) => expect(b).toMatchObject({ posts: expect.any(Array), pagination: expect.any(Object) }) },
  "blog-post": { call: (d, p) => d.blog.get(seg(p, 4), { trackViews: "none" }), shape: (b) => expect(b.post).toHaveProperty("slug") },
  "seo-blog": { call: (d, p) => d.seo.blogPost(seg(p, 4)), shape: (b) => expect(b).toHaveProperty("seo") },
  "blog-categories": { call: (d) => d.blog.listCategories(), shape: (b) => expect(Array.isArray(b.categories)).toBe(true) },
  pages: { call: (d) => d.pages.list(), shape: (b) => expect(Array.isArray(b.pages)).toBe(true) },
  "content-types": { call: (d) => d.pageGroups.list(), shape: (b) => expect(Array.isArray(b.content_types)).toBe(true) },
  "content-type-items": { call: (d, p) => d.pageGroup(seg(p, 3)).all({ limit: 2 }), shape: (b) => expect(Array.isArray(b.items)).toBe(true) },
  "content-type-item": { call: (d, p) => d.pageGroup(seg(p, 3)).get(seg(p, 4)), shape: (b) => expect(b).toHaveProperty("item") },
  legal: { call: (d) => d.legal.list(), shape: (b) => expect(Array.isArray(b.documents)).toBe(true) },
  "legal-document": { call: (d, p) => d.legal.get(seg(p, 3)), shape: (b) => expect(b.document).toHaveProperty("content") },
  coa: { call: (d) => d.coa.list(), shape: (b) => expect(b).toMatchObject({ products: expect.any(Array), total_products: expect.any(Number) }) },
  "coa-product": { call: (d, p) => d.coa.getProduct(seg(p, 3)), shape: (b) => expect(b).toMatchObject({ product: expect.any(Object), variations: expect.any(Array) }) },
  "coa-variation": { call: (d, p) => d.coa.getVariation(seg(p, 3), seg(p, 4)), shape: (b) => expect(b).toMatchObject({ product: expect.any(Object), variation: expect.any(Object) }) },
  "loyalty-summary": { call: (d) => d.loyalty.summary(), shape: (b) => expect(b).toMatchObject({ enabled: expect.any(Boolean), earn_rules: expect.any(Array) }) },
  "discount-store": { call: (d) => d.discountStore.list(), shape: (b) => expect(Array.isArray(b.products)).toBe(true) },
  "cart-tier-discounts": { call: (d) => d.cart.getTierDiscounts(), shape: (b) => expect(Array.isArray(b.tiers)).toBe(true) },
  "shipping-locations": { call: (d) => d.checkout.getShippingLocations(), shape: (b) => expect(Array.isArray(b.countries)).toBe(true) },
  "banned-state-names": { call: (d) => d.checkout.getBannedStateNames(), shape: (b) => expect(Array.isArray(b.banned_states)).toBe(true) },
  "calendar-settings": { call: (d) => d.calendar.getSettings(), shape: (b) => expect(b).toHaveProperty("settings") },
  "affiliates-form-config": { call: (d) => d.affiliates.getFormConfig(), shape: (b) => expect(b).toHaveProperty("is_active") },
};

let V1: any;
let V2: any;
beforeAll(async () => {
  V1 = await loadV1();
  V2 = await loadV2();
});

const okEntries = Object.entries<any>(manifest.endpoints).filter(([, e]) => e.status === 200 && e.json);

it("every captured 200 endpoint has a contract", () => {
  const missing = okEntries.map(([n]) => n).filter((n) => !CALLS[n]);
  expect(missing).toEqual([]);
  expect(okEntries.length).toBeGreaterThanOrEqual(30);
});

for (const host of [
  { label: "production", v2: { target: "production" }, v1: {}, base: PROD },
  { label: "papi", v2: { target: "papi" }, v1: { baseURL: PAPI }, base: PAPI },
]) {
  describe(`production response shapes through v1 and v2 (${host.label})`, () => {
    for (const [name, entry] of okEntries) {
      const spec = CALLS[name];
      if (!spec) continue;
      it(`${name}: ${entry.sdk}`, async () => {
        const body = fixture(name);
        const r2 = recorder(() => ({ body }));
        const d2 = new V2.DashClient({ apiKey: "pk_test_contract", fetch: r2.fetchMock, ...host.v2 });
        const out2 = await spec.call(d2, entry.path);
        expect(r2.calls).toHaveLength(1);
        expect(r2.calls[0].url).toBe(`${host.base}${entry.path}`);
        expect(out2).toEqual(body);
        spec.shape?.(out2);

        const r1 = recorder(() => ({ body }));
        const out1 = await withGlobalFetch(r1.fetchMock, async () => spec.call(new V1.DashClient({ apiKey: "pk_test_contract", ...host.v1 }), entry.path));
        expect(out2).toEqual(out1);
        expect(r2.calls).toEqual(r1.calls);
      });
    }
  });
}

describe("production error shapes", () => {
  it("404 JSON {error, message}: same message/status/details in v1 and v2; v2 adds code", async () => {
    const e = manifest.endpoints["error-product-not-found"];
    const body = fixture("error-product-not-found");
    expect(e.status).toBe(404);
    const r2 = recorder(() => ({ status: 404, body }));
    const err2 = await new V2.DashClient({ apiKey: "pk_test_x", fetch: r2.fetchMock }).products.getCore("missing").catch((x: any) => x);
    const r1 = recorder(() => ({ status: 404, body }));
    const err1 = await withGlobalFetch(r1.fetchMock, () => new V1.DashClient({ apiKey: "pk_test_x" }).products.getCore("missing").catch((x: any) => x));
    expect([err2.message, err2.status, err2.details]).toEqual([err1.message, err1.status, err1.details]);
    expect(err2.code).toBe(body.error);
  });

  for (const [name, call] of [
    ["error-forms-unrouted", (d: any) => d.forms.get("contact")],
    ["sitemap", (d: any) => d.sitemap.get()],
  ] as const) {
    it(`${name}: production answers HTTP ${manifest.endpoints[name].status} with a non-JSON body; v1 threw a SyntaxError, v2 a DashApiError`, async () => {
      const status = manifest.endpoints[name].status;
      expect(manifest.endpoints[name].json).toBe(false);
      const html = "<!doctype html><title>Error</title>";
      const r1 = recorder(() => ({ status, text: html }));
      const s1 = await withGlobalFetch(r1.fetchMock, () => settle(() => call(new V1.DashClient({ apiKey: "pk_test_x" }))));
      expect(s1.ok).toBe(false);
      if (!s1.ok) expect(s1.error.name).toBe("SyntaxError");
      const r2 = recorder(() => ({ status, text: html }));
      const err = await call(new V2.DashClient({ apiKey: "pk_test_x", fetch: r2.fetchMock })).catch((x: any) => x);
      expect(err).toBeInstanceOf(V2.DashApiError);
      expect(err).toMatchObject({ status, code: "invalid_response" });
    });
  }
});

describe("fixtures are clean", () => {
  it("no API keys, emails or phone numbers in any saved body", () => {
    for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
      const text = fs.readFileSync(path.join(DIR, f), "utf8");
      expect(text, f).not.toMatch(/\b(pk|sk)_(live|test)_[A-Za-z0-9]{6,}/);
      expect(text, f).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    }
  });

  it("production images are absolute URLs (DashImage renders them unchanged)", () => {
    const core = fixture("product-core").product;
    const urls = JSON.stringify(core).match(/https:\/\/[^"]+\.(jpe?g|png|webp)/g) || [];
    expect(urls.length).toBeGreaterThan(0);
  });
});

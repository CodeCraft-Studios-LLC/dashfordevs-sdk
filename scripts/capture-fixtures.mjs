// Capture contract fixtures: production response shapes for one store's
// public catalog/content endpoints, with READ-ONLY GET requests.
//
//   node scripts/capture-fixtures.mjs --key-from <file> [--key-prefix pk_test_] [--host api.dashfordevs.com]
//                                     [--out fixtures/production] [--origin https://www.example.com]
//
// Rules this script enforces:
//   - GET only, to an allowlisted host (api.dashfordevs.com / papi.dashfordevs.com).
//   - Endpoints that write on GET are not called: the full product detail
//     (records a ProductView) is skipped; blog detail uses track_views=none.
//   - The key is read from a file and never printed or saved (masked in logs).
//   - Saved bodies are scrubbed: API keys, secrets/tokens, email addresses and
//     phone numbers are replaced; long arrays are cut to 3 items (counts kept
//     in the manifest) so fixtures stay small.
//   - TLS certificate verification is forced on.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), [])
);
const ALLOWED_HOSTS = new Set(["api.dashfordevs.com", "papi.dashfordevs.com"]);
const host = args.host || "api.dashfordevs.com";
if (!ALLOWED_HOSTS.has(host)) throw new Error(`host not allowed: ${host}`);
const base = `https://${host}`;
const outDir = path.resolve(root, args.out || "fixtures/production");

function loadKey() {
  if (process.env.DFD_FIXTURE_KEY) return process.env.DFD_FIXTURE_KEY;
  if (!args["key-from"]) throw new Error("--key-from <file> or DFD_FIXTURE_KEY is required");
  const text = fs.readFileSync(args["key-from"], "utf8");
  const prefix = args["key-prefix"] || "pk_";
  const re = new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[A-Za-z0-9_-]{8,}`);
  const m = text.match(re);
  if (!m) throw new Error(`no key with prefix ${prefix} in that file`);
  return m[0];
}
const KEY = loadKey();
const masked = `${KEY.slice(0, KEY.indexOf("_", 3) + 1)}****${KEY.slice(-4)}`;

const SECRET_KEY_NAMES = /(api_?key|secret|token|password|places_api_key|client_key|login_id|signature)/i;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?<![\w])(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g;
const KEYLIKE = /\b(pk|sk)_(live|test)_[A-Za-z0-9_-]+/g;

const counts = {};
function scrub(value, keyPath = "") {
  if (Array.isArray(value)) {
    if (value.length > 3) counts[keyPath || "<root>"] = value.length;
    return value.slice(0, 3).map((v, i) => scrub(v, `${keyPath}[${i}]`));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEY_NAMES.test(k) && v != null && v !== "") out[k] = "<redacted>";
      else out[k] = scrub(v, keyPath ? `${keyPath}.${k}` : k);
    }
    return out;
  }
  if (typeof value === "string") {
    return value.replace(KEYLIKE, "<redacted-key>").replace(EMAIL, "<redacted-email>").replace(PHONE, "<redacted-phone>");
  }
  return value;
}

async function get(pathAndQuery) {
  const url = new URL(pathAndQuery, base);
  if (!ALLOWED_HOSTS.has(url.hostname)) throw new Error("host changed");
  const headers = { "X-API-Key": KEY, Accept: "application/json", "User-Agent": "dash4devs-sdk-v2-fixture-capture" };
  if (args.origin) headers.Origin = args.origin;
  const started = Date.now();
  const res = await fetch(url, { method: "GET", headers, redirect: "manual" });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: res.status, ms: Date.now() - started, json: body !== null, body, contentType: res.headers.get("content-type") };
}

const manifest = { host, key: masked, captured_at: new Date().toISOString(), endpoints: {} };
fs.mkdirSync(outDir, { recursive: true });

async function capture(name, pathAndQuery, sdkCall) {
  const r = await get(pathAndQuery);
  Object.keys(counts).forEach((k) => delete counts[k]);
  const body = r.body === null ? null : scrub(r.body);
  manifest.endpoints[name] = {
    path: pathAndQuery,
    sdk: sdkCall,
    status: r.status,
    json: r.json,
    content_type: r.contentType,
    top_level_keys: body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body) : null,
    truncated_arrays: { ...counts },
  };
  if (body !== null) fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(body, null, 2) + "\n");
  console.log(`${String(r.status).padEnd(4)} ${pathAndQuery}`);
  return r;
}

console.log(`capturing from ${base} with key ${masked}`);
const S = "/api/storefront";

const ping = await capture("ping", `${S}/ping`, "dash.ping()");
if (ping.status !== 200) {
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.error("ping failed - stopping (the key may not belong to this host)");
  process.exit(1);
}
const orgName = ping.body?.organization?.name || "";
console.log(`organization: ${orgName}`);
if (args["expect-org"] && orgName.toLowerCase() !== String(args["expect-org"]).toLowerCase()) {
  console.error(`expected organization "${args["expect-org"]}" - stopping before any other request`);
  process.exit(1);
}

await capture("global", `${S}/global`, "dash.getGlobalData()");
const list = await capture("products-list", `${S}/products?limit=3`, "dash.products.list({ limit: 3 })");
const slug = list.body?.products?.[0]?.slug;
if (slug) {
  // products/<slug> (full detail) records a ProductView on GET: not called.
  await capture("product-core", `${S}/products/${encodeURIComponent(slug)}/core`, "dash.products.getCore(slug)");
  await capture("product-options", `${S}/products/${encodeURIComponent(slug)}/options`, "dash.products.getOptions(slug)");
  await capture("product-reviews", `${S}/products/${encodeURIComponent(slug)}/reviews?limit=2`, "dash.products.getReviews(slug, { limit: 2 })");
  await capture("seo-product", `${S}/seo/product/${encodeURIComponent(slug)}`, "dash.seo.product(slug)");
}
await capture("reviews", `${S}/reviews?limit=2`, "dash.products.getAllReviews({ limit: 2 })");
await capture("featured-variations", `${S}/featured-variations`, "dash.products.getFeaturedVariations()");
const cats = await capture("categories", `${S}/categories`, "dash.categories.list()");
await capture("categories-tree", `${S}/categories?tree=true`, "dash.categories.getTree()");
const cslug = cats.body?.categories?.[0]?.slug;
if (cslug) await capture("category", `${S}/categories/${encodeURIComponent(cslug)}?limit=2`, "dash.categories.get(slug, { limit: 2 })");
const brands = await capture("brands", `${S}/brands`, "dash.brands.list()");
const bslug = brands.body?.brands?.[0]?.slug;
if (bslug) await capture("brand", `${S}/brands/${encodeURIComponent(bslug)}?limit=2`, "dash.brands.get(slug, { limit: 2 })");
const posts = await capture("blog-posts", `${S}/blog/posts?limit=2`, "dash.blog.list({ limit: 2 })");
const pslug = posts.body?.posts?.[0]?.slug;
if (pslug) {
  await capture("blog-post", `${S}/blog/posts/${encodeURIComponent(pslug)}?track_views=none`, 'dash.blog.get(slug, { trackViews: "none" })');
  await capture("seo-blog", `${S}/seo/blog/${encodeURIComponent(pslug)}`, "dash.seo.blogPost(slug)");
}
await capture("blog-categories", `${S}/blog/categories`, "dash.blog.listCategories()");
await capture("pages", `${S}/pages`, "dash.pages.list()");
const groups = await capture("content-types", `${S}/content-types`, "dash.pageGroups.list()");
const gslug = groups.body?.content_types?.[0]?.slug;
if (gslug) {
  const items = await capture("content-type-items", `${S}/content-types/${encodeURIComponent(gslug)}?limit=2`, 'dash.pageGroup(slug).all({ limit: 2 })');
  const islug = items.body?.items?.[0]?.slug;
  if (islug) await capture("content-type-item", `${S}/content-types/${encodeURIComponent(gslug)}/${encodeURIComponent(islug)}`, "dash.pageGroup(slug).get(item)");
}
await capture("sitemap", `${S}/sitemap`, "dash.sitemap.get()");
const legal = await capture("legal", `${S}/legal`, "dash.legal.list()");
const lslug = legal.body?.documents?.[0]?.slug;
if (lslug) await capture("legal-document", `${S}/legal/${encodeURIComponent(lslug)}`, "dash.legal.get(slug)");
const coa = await capture("coa", `${S}/coa`, "dash.coa.list()");
const coaSlug = coa.body?.products?.[0]?.slug;
if (coaSlug) {
  const cp = await capture("coa-product", `${S}/coa/${encodeURIComponent(coaSlug)}`, "dash.coa.getProduct(slug)");
  const vslug = cp.body?.variations?.[0]?.slug;
  if (vslug) await capture("coa-variation", `${S}/coa/${encodeURIComponent(coaSlug)}/${encodeURIComponent(vslug)}`, "dash.coa.getVariation(slug, v)");
}
await capture("loyalty-summary", `${S}/loyalty/summary`, "dash.loyalty.summary()");
await capture("discount-store", `${S}/discount-store`, "dash.discountStore.list()");
await capture("cart-tier-discounts", `${S}/cart-tier-discounts`, "dash.cart.getTierDiscounts()");
await capture("shipping-locations", `${S}/shipping-locations`, "dash.checkout.getShippingLocations()");
await capture("banned-state-names", `${S}/banned-state-names`, "dash.checkout.getBannedStateNames()");
await capture("calendar-settings", `${S}/calendar/settings`, "dash.calendar.getSettings()");
await capture("affiliates-form-config", `${S}/affiliates/form-config`, "dash.affiliates.getFormConfig()");
// Error shapes the SDK must handle:
await capture("error-product-not-found", `${S}/products/this-slug-does-not-exist-dash4devs-v2/core`, "dash.products.getCore(missing)");
await capture("error-forms-unrouted", `${S}/forms/contact`, "dash.forms.get(slug) - not routed in production");

fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`wrote ${Object.keys(manifest.endpoints).length} endpoints to ${path.relative(root, outDir)}`);

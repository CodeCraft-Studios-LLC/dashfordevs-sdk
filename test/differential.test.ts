/**
 * v1 vs v2, method by method.
 *
 * Every scenario runs once through the v1 snapshot (dash4devs 0.1.23-alpha,
 * test/v1-snapshot) and once through v2 (dist/), against the same mocked
 * fetch, for both API hosts:
 *   - production: v1 default        vs v2 default
 *   - papi:       v1 { baseURL }    vs v2 { target: "papi" }
 * and asserts identical requests (method, URL, X-API-Key, Content-Type,
 * Authorization, JSON body), identical results (or identical errors), and
 * identical client state afterwards.
 *
 * Intentional differences (processor masking, analytics de-identification,
 * declared-but-missing v1 members) are covered in their own suites.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { PAPI, PROD, loadV1, loadV2, recorder, settle, withGlobalFetch } from "./helpers";

type Dash = any;
interface Scenario {
  name: string;
  sk?: boolean;
  run: (d: Dash) => Promise<unknown> | unknown;
  state?: (d: Dash) => unknown;
}

const signedIn = (d: Dash) => d.auth.setToken("access_tok", "refresh_tok");
const withCart = (d: Dash) => {
  d.cart._cartId = "cart_1";
};

const SCENARIOS: Scenario[] = [
  // client
  { name: "ping", run: (d) => d.ping() },
  { name: "getGlobalData", run: (d) => d.getGlobalData() },
  { name: "getPageData(path)", run: (d) => d.getPageData("/products/my product") },
  { name: "getPageData(byName)", run: (d) => d.getPageData("home", { byName: true }) },
  { name: "checkHealth", run: (d) => d.checkHealth() },
  { name: "getSessionId (server)", run: (d) => d.getSessionId() },
  // products
  { name: "products.list()", run: (d) => d.products.list() },
  {
    name: "products.list(all options)",
    run: (d) =>
      d.products.list({ limit: 12, offset: 24, category: "flower,deals", brand: "acme", search: "blue dream", include: ["main_size", "variations"], expand: false, customFields: { featured: true, section: "hero" } }),
  },
  { name: "products.list(q alias)", run: (d) => d.products.list({ q: "gummy" }) },
  { name: "products.get", run: (d) => d.products.get("thca/pre roll") },
  { name: "products.getCore", run: (d) => d.products.getCore("slug") },
  { name: "products.getOptions", run: (d) => d.products.getOptions("slug") },
  { name: "products.getReviews", run: (d) => d.products.getReviews("slug", { limit: 5, offset: 10 }) },
  { name: "products.submitReview", run: (d) => d.products.submitReview("slug", { rating: 5, author_name: "A", body: "Great" }) },
  { name: "products.getAllReviews", run: (d) => d.products.getAllReviews({ limit: 2, offset: 4, product: "p", rating: 5, sort: "newest", has_media: true }) },
  { name: "products.getFeaturedVariations", run: (d) => d.products.getFeaturedVariations() },
  { name: "products.getFiles(label)", run: (d) => d.products.getFiles("slug", { label: "coa" }) },
  { name: "products.getFile", run: (d) => d.products.getFile("slug", "manual") },
  // categories
  { name: "categories.list", run: (d) => d.categories.list({ tree: true, parent: "p", depth: 0, customFields: { mega: true } }) },
  { name: "categories.get", run: (d) => d.categories.get("flower", { includeProducts: false, includeChildren: false, limit: 3, offset: 6 }) },
  { name: "categories.getByDepth", run: (d) => d.categories.getByDepth(1) },
  { name: "categories.getTree", run: (d) => d.categories.getTree() },
  { name: "categories.getChildren", run: (d) => d.categories.getChildren("flower") },
  { name: "categories.getFiles", run: (d) => d.categories.getFiles("flower") },
  { name: "categories.getFile", run: (d) => d.categories.getFile("flower", "menu") },
  // cart
  { name: "cart.get (no cart)", run: (d) => d.cart.get() },
  { name: "cart.load", run: (d) => d.cart.load("cart_9"), state: (d) => [d.cart.cartId, d.cart.items, d.cart.getTotals()] },
  {
    name: "cart.add",
    run: (d) => d.cart.add({ productId: "prod__1", sizeId: "size_1", quantity: 2, freestyleSelections: [{ slot_id: "a", option_id: "b" }], subscriptionPlanId: "subplan__1" }),
    state: (d) => [d.cart.cartId, d.cart.items, d.cart.getTotals(), d.cart.getTotalQuantity()],
  },
  { name: "cart.add (missing ids)", run: (d) => d.cart.add({ productId: "", sizeId: "" }) },
  { name: "cart.setLocations", run: (d) => d.cart.setLocations({ "loc-0": { label: "A", state: "TX", items: { size_1: 2 } } }), state: (d) => d.cart.cartId },
  { name: "cart.changeItem", run: (d) => (withCart(d), d.cart.changeItem("line_1", { sizeId: "size_2", subscriptionPlanId: "", quantity: 3 })) },
  { name: "cart.changeItem (no cart)", run: (d) => d.cart.changeItem("line_1") },
  { name: "cart.update", run: (d) => (withCart(d), d.cart.update("size_1", 3, { itemId: "line_1" })) },
  { name: "cart.remove(size)", run: (d) => (withCart(d), d.cart.remove("size 1")) },
  { name: "cart.remove(itemId)", run: (d) => (withCart(d), d.cart.remove(null, { itemId: "line_1" })) },
  { name: "cart.clear", run: (d) => (withCart(d), d.cart.clear()), state: (d) => [d.cart.items, d.cart.getTotals()] },
  { name: "cart.clear (no cart)", run: (d) => d.cart.clear() },
  { name: "cart.setContact", run: (d) => (withCart(d), d.cart.setContact({ email: "a@b.co", phone: "" })) },
  { name: "cart.setContact (no cart)", run: (d) => d.cart.setContact({ email: "a@b.co" }) },
  { name: "cart.applyDiscount", run: (d) => (withCart(d), d.cart.applyDiscount("SAVE10", "a@b.co")) },
  { name: "cart.removeDiscount", run: (d) => (withCart(d), d.cart.removeDiscount()) },
  { name: "cart.migrateToUser", run: (d) => (withCart(d), signedIn(d), d.cart.migrateToUser()), state: (d) => d.cart.cartId },
  { name: "cart.loadUserCart", run: (d) => (signedIn(d), d.cart.loadUserCart()) },
  { name: "cart.init(guest)", run: (d) => d.cart.init("cart_7"), state: (d) => d.cart.cartId },
  { name: "cart.init(signed in)", run: (d) => (signedIn(d), d.cart.init("cart_7")) },
  { name: "cart.reset", run: (d) => (withCart(d), d.cart.reset(), d.cart.cartId) },
  { name: "cart.getUpsells", run: (d) => (withCart(d), d.cart.getUpsells()) },
  { name: "cart.startUpsellSession", run: (d) => (withCart(d), d.cart.startUpsellSession(["u1"])) },
  { name: "cart.getUpsellStatus", run: (d) => (withCart(d), d.cart.getUpsellStatus()) },
  { name: "cart.addUpsellToCart", run: (d) => (withCart(d), d.cart.addUpsellToCart("u1", "s1", "size_2")) },
  { name: "cart.getTierDiscounts", run: (d) => d.cart.getTierDiscounts() },
  // pages / seo / brands / blog
  { name: "pages.list", run: (d) => d.pages.list() },
  { name: "pages.getByPath", run: (d) => d.pages.getByPath("/a b") },
  { name: "pages.getByName", run: (d) => d.pages.getByName("home") },
  { name: "seo.product", run: (d) => d.seo.product("s") },
  { name: "seo.blogPost", run: (d) => d.seo.blogPost("s") },
  { name: "brands.list", run: (d) => d.brands.list() },
  { name: "brands.get", run: (d) => d.brands.get("acme", { limit: 2, offset: 2 }) },
  { name: "blog.list(page)", run: (d) => d.blog.list({ limit: 5, page: 3, category: "news", tag: "t", search: "x", featured: true, customFields: { side: true } }) },
  { name: "blog.list(offset)", run: (d) => d.blog.list({ offset: 4 }) },
  { name: "blog.get", run: (d) => d.blog.get("post", { trackViews: "none" }) },
  { name: "blog.getSeo", run: (d) => d.blog.getSeo("post") },
  { name: "blog.listCategories", run: (d) => d.blog.listCategories() },
  // auth
  { name: "auth.checkExists", run: (d) => d.auth.checkExists({ email: "a@b.co" }) },
  { name: "auth.requestOTP", run: (d) => d.auth.requestOTP("a@b.co", { accepts_marketing: true, captcha_token: "c" }) },
  { name: "auth.verifyOTP", run: (d) => d.auth.verifyOTP({ email: "a@b.co", code: "123456" }), state: (d) => [d.auth.token, d.auth.refreshToken, d.auth.customer, d.auth.isAuthenticated] },
  { name: "auth.login", run: (d) => d.auth.login({ email: "a@b.co", password: "pw123456", captcha_token: "c" }), state: (d) => [d.auth.token, d.auth.customer] },
  { name: "auth.loginWithCheckoutToken", run: (d) => d.auth.loginWithCheckoutToken("checkout__abc"), state: (d) => d.auth.token },
  { name: "auth.refreshAccessToken", run: (d) => (signedIn(d), d.auth.refreshAccessToken()), state: (d) => [d.auth.token, d.auth.refreshToken] },
  { name: "auth.refreshAccessToken (none)", run: (d) => d.auth.refreshAccessToken() },
  { name: "auth.setPassword", run: (d) => (signedIn(d), d.auth.setPassword("longpassword")) },
  { name: "auth.setPassword (short)", run: (d) => (signedIn(d), d.auth.setPassword("short")) },
  { name: "auth.requestPasswordReset", run: (d) => d.auth.requestPasswordReset("a@b.co") },
  { name: "auth.resetPassword", run: (d) => d.auth.resetPassword({ email: "a@b.co", code: "1", password: "longpassword" }) },
  { name: "auth.getProfile", run: (d) => (signedIn(d), d.auth.getProfile()) },
  { name: "auth.getProfile (signed out)", run: (d) => d.auth.getProfile() },
  { name: "auth.updateProfile", run: (d) => (signedIn(d), d.auth.updateProfile({ first_name: "A" })) },
  { name: "auth.updateMetadata", run: (d) => (signedIn(d), d.auth.updateMetadata({ color: null })) },
  { name: "auth.logout", run: (d) => (signedIn(d), d.auth.logout()), state: (d) => [d.auth.token, d.auth.customer] },
  { name: "auth.getAddresses", run: (d) => (signedIn(d), d.auth.getAddresses()) },
  { name: "auth.createAddress", run: (d) => (signedIn(d), d.auth.createAddress({ line1: "1 Main" })) },
  { name: "auth.updateAddress", run: (d) => (signedIn(d), d.auth.updateAddress("addr_1", { city: "X" })) },
  { name: "auth.deleteAddress", run: (d) => (signedIn(d), d.auth.deleteAddress("addr_1")) },
  { name: "auth.setMainAddress", run: (d) => (signedIn(d), d.auth.setMainAddress("addr_1")) },
  { name: "auth.getOrders", run: (d) => (signedIn(d), d.auth.getOrders({ limit: 5, offset: 5 })) },
  { name: "auth.getOrder", run: (d) => (signedIn(d), d.auth.getOrder("ord__1")) },
  { name: "auth.requestRestock", run: (d) => (signedIn(d), d.auth.requestRestock("slug x", "size_1")) },
  { name: "auth.getRestockRequests", run: (d) => (signedIn(d), d.auth.getRestockRequests()) },
  { name: "auth.unsubscribeRestock", run: (d) => (signedIn(d), d.auth.unsubscribeRestock("rr_1")) },
  { name: "auth.checkBan", run: (d) => d.auth.checkBan() },
  { name: "auth.mergeCart", run: (d) => (signedIn(d), d.auth.mergeCart("cart_1")) },
  // payment (server side)
  { name: "payment.load (server)", run: (d) => d.payment.load(), state: (d) => [d.payment.isLoaded, d.payment.processorSlug, d.payment.isInvoiceBased, d.payment.googlePayEnabled] },
  { name: "payment.getProcessor", run: (d) => d.payment.getProcessor() },
  { name: "payment.charge (no line items)", run: (d) => d.payment.charge({ token: "t", descriptor: "d", amount: 9.99, invoiceNumber: "1001", billing: { first_name: "A" } }) },
  { name: "payment.charge (missing)", run: (d) => d.payment.charge({ amount: 1 }) },
  { name: "payment.authorize", run: (d) => d.payment.authorize({ token: "t", amount: "5", currency: "USD", invoice_number: "9" }) },
  { name: "payment.capture", run: (d) => d.payment.capture({ transactionId: "tx", amount: 4 }) },
  { name: "payment.void", run: (d) => d.payment.void({ transactionId: "tx" }) },
  { name: "payment.tokenize (server)", run: (d) => d.payment.tokenize({ cardNumber: "4111111111111111", expDate: "12/30", cvv: "123" }) },
  // checkout
  { name: "checkout.start (guest)", run: (d) => d.checkout.start({ cartId: "cart_1", email: "a@b.co", acceptsMarketing: false }) },
  { name: "checkout.start (signed in)", run: (d) => (signedIn(d), d.checkout.start({ cartId: "cart_1" })) },
  { name: "checkout.start (guest, no email)", run: (d) => d.checkout.start({ cartId: "cart_1" }) },
  { name: "checkout.getShippingLocations", run: (d) => d.checkout.getShippingLocations() },
  { name: "checkout.getBannedStateNames", run: (d) => d.checkout.getBannedStateNames() },
  { name: "checkout.resume", run: (d) => d.checkout.resume("checkout__abc") },
  {
    name: "checkout.complete (no payment_token)",
    run: (d) =>
      d.checkout.complete({
        cartId: "cart_1",
        email: "a@b.co",
        code: "123456",
        shipping: { first_name: "A", last_name: "B", address: "1", city: "C", state: "NY", zip_code: "10001" },
        customerNotes: "n",
        payment: { transaction_id: "tx", auth_code: "a" },
        captcha_token: "c",
        totals: { shipping_cost: 5, tax_amount: 1 },
        analytics: { visitor_id: "v_1", session_id: "s_1", ft: {}, lt: {} },
        affiliateLink: "aff1",
      }),
  },
  { name: "checkout.placeWholesaleRequest", run: (d) => d.checkout.placeWholesaleRequest({ cartId: "c", email: "a@b.co", shipping: { first_name: "A" }, totals: { surcharge: 1 } }) },
  // email
  { name: "email.identify", run: (d) => d.email.identify({ email: "a@b.co", first_name: "A", properties: { x: 1 } }) },
  { name: "email.track", run: (d) => d.email.track({ email: "a@b.co", event: "Viewed", properties: {} }) },
  // shipping / tax
  { name: "shipping.getRates", run: (d) => d.shipping.getRates({ to_postal: "10001", to_state: "NY", weight_oz: 16, carrier_ids: ["se-1"], dimensions: { length: 1, width: 1, height: 1 } }) },
  { name: "shipping.getRates (missing)", run: (d) => d.shipping.getRates({ weight_oz: 1 }) },
  { name: "shipping.track", run: (d) => d.shipping.track("1Z 999", "ups") },
  { name: "shipping.validateAddress", run: (d) => d.shipping.validateAddress({ address_line1: "1", city: "C", state: "NY", postal_code: "10001", country_code: "US" }) },
  { name: "shipping.getCheapestRate", run: (d) => d.shipping.getCheapestRate({ to_postal: "1", weight_oz: 1 }) },
  { name: "shipping.getFastestRate", run: (d) => d.shipping.getFastestRate({ to_postal: "1", weight_oz: 1 }) },
  { name: "shipping.getRate(fastest)", run: (d) => d.shipping.getRate({ to_postal: "1", weight_oz: 1, prefer: "fastest" }) },
  { name: "shipping.checkFreeShipping", run: (d) => d.shipping.checkFreeShipping("20.50") },
  { name: "tax.calculate", run: (d) => d.tax.calculate({ state: "NY", items: [{ price: 1, quantity: 2 }] }), state: (d) => d.tax.getCached("NY") },
  { name: "tax.calculateForCart", run: (d) => (withCart(d), d.tax.calculateForCart("NY")), state: (d) => d.tax.getCached("NY", "cart_1") },
  { name: "tax.calculateForCart (no cart)", run: (d) => d.tax.calculateForCart("NY") },
  { name: "tax.checkLegality", run: (d) => (withCart(d), d.tax.checkLegality("ID")) },
  { name: "tax helpers", run: async (d) => { const r = await d.tax.calculate({ state: "NY" }); return [d.tax.getTotal(r), d.tax.getOrderTotal({ subtotal: "10", shipping: 2, discount: "1", taxResult: r }), d.tax.formatBreakdown(r), d.tax.clearCache(), d.tax.getCached("NY")]; } },
  // tracking (server-safe parts)
  { name: "tracking.actions.create", run: (d) => d.tracking.actions.create("product.view", { description: "x" }) },
  { name: "tracking.actions.emit", run: (d) => (d.tracking.setCustomer("cus__1"), d.tracking.actions.emit("product.view", { a: 1 }, { contains_phi: true })) },
  { name: "tracking.init (server)", run: (d) => d.tracking.init() },
  { name: "tracking.trackVisit (server)", run: (d) => d.tracking.trackVisit() },
  { name: "marketing.init (server)", run: (d) => d.marketing.init() },
  // misc modules
  { name: "contact.submit", run: (d) => d.contact.submit({ name: "A", email: "a@b.co", content: "hi", metadata: { p: 1 } }) },
  { name: "affiliates.getFormConfig", run: (d) => d.affiliates.getFormConfig() },
  { name: "affiliates.apply", run: (d) => d.affiliates.apply({ name: "A", email: "a@b.co" }) },
  { name: "affiliates.getMyStatus", run: (d) => (signedIn(d), d.affiliates.getMyStatus()) },
  { name: "affiliates.getMyStatus (signed out)", run: (d) => d.affiliates.getMyStatus() },
  { name: "affiliates.getMyDashboard", run: (d) => (signedIn(d), d.affiliates.getMyDashboard()) },
  { name: "affiliates.createCode", run: (d) => (signedIn(d), d.affiliates.createCode({ code: "ABC" })) },
  { name: "affiliates.updateProfile", run: (d) => (signedIn(d), d.affiliates.updateProfile({ paypal_email: "p@b.co" })) },
  { name: "affiliates.deactivateCode", run: (d) => (signedIn(d), d.affiliates.deactivateCode("dc_1")) },
  { name: "affiliates.listProductRequests", run: (d) => (signedIn(d), d.affiliates.listProductRequests({ page: 2 })) },
  { name: "affiliates.createProductRequest", run: (d) => (signedIn(d), d.affiliates.createProductRequest({ full_name: "A" })) },
  { name: "affiliates.getProductRequest", run: (d) => (signedIn(d), d.affiliates.getProductRequest("pr_1")) },
  { name: "affiliates.updateProductRequest", run: (d) => (signedIn(d), d.affiliates.updateProductRequest("pr_1", { a: 1 })) },
  { name: "coa.list", run: (d) => d.coa.list({ q: "gummy", includeVariations: true }) },
  { name: "coa.getProduct", run: (d) => d.coa.getProduct("p") },
  { name: "coa.getProduct (missing)", run: (d) => d.coa.getProduct("") },
  { name: "coa.getVariation", run: (d) => d.coa.getVariation("p", "v") },
  { name: "legal.list", run: (d) => d.legal.list() },
  { name: "legal.get", run: (d) => d.legal.get("privacy-policy") },
  { name: "media.getFolder", run: (d) => d.media.getFolder("gallery 1", { metadata: { type: "hero", x: "y" } }) },
  { name: "media.getByName", run: (d) => d.media.getByName("brick_desktop") },
  { name: "htmlTemplates.get", run: (d) => d.htmlTemplates.get("htmltmpl__abc") },
  { name: "referrals.validate", run: (d) => d.referrals.validate({ secret: "s", subtotal: "10", cart_id: "c" }) },
  { name: "referrals.dashboard", run: (d) => (signedIn(d), d.referrals.dashboard()) },
  { name: "paymentMethods.list", run: (d) => (signedIn(d), d.paymentMethods.list()) },
  { name: "paymentMethods.remove", run: (d) => (signedIn(d), d.paymentMethods.remove(12)) },
  { name: "paymentMethods.setDefault", run: (d) => (signedIn(d), d.paymentMethods.setDefault("12")) },
  { name: "discountStore.list", run: (d) => d.discountStore.list() },
  { name: "discountStore.redeem", run: (d) => (signedIn(d), d.discountStore.redeem("dsp_1")) },
  { name: "loyalty.summary", run: (d) => d.loyalty.summary() },
  { name: "earnPoints.list", run: (d) => (signedIn(d), d.earnPoints.list()) },
  { name: "earnPoints.complete", run: (d) => (signedIn(d), d.earnPoints.complete("follow_instagram")) },
  { name: "subscriptions.list", run: (d) => (signedIn(d), d.subscriptions.list()) },
  { name: "subscriptions.create", run: (d) => (signedIn(d), d.subscriptions.create({ planId: "subplan__1", paymentProfileId: "p1", shippingAddress: { a: 1 } })) },
  { name: "subscriptions.create (missing)", run: (d) => (signedIn(d), d.subscriptions.create({})) },
  { name: "subscriptions.cancel", run: (d) => (signedIn(d), d.subscriptions.cancel("sub__1")) },
  { name: "subscriptions.pause", run: (d) => (signedIn(d), d.subscriptions.pause("sub__1")) },
  { name: "subscriptions.resume", run: (d) => (signedIn(d), d.subscriptions.resume("sub__1")) },
  { name: "subscriptions.updatePayment", run: (d) => (signedIn(d), d.subscriptions.updatePayment("sub__1", "p2")) },
  { name: "subscriptions.changePlan", run: (d) => (signedIn(d), d.subscriptions.changePlan("sub__1", { planId: "subplan__2", quantity: 2, resetBillingDate: true })) },
  { name: "sitemap.get", run: (d) => d.sitemap.get() },
  { name: "calendar.getSettings", run: (d) => d.calendar.getSettings() },
  { name: "calendar.getDaysOff", run: (d) => d.calendar.getDaysOff() },
  { name: "calendar.getAvailability", run: (d) => d.calendar.getAvailability("2026-10") },
  { name: "calendar.book", run: (d) => d.calendar.book({ start: "2026-10-12T10:00:00Z", customer_name: "A", customer_email: "a@b.co" }) },
  { name: "forms.get", run: (d) => d.forms.get("contact") },
  { name: "forms.get (bad slug)", run: (d) => d.forms.get("") },
  { name: "forms.submit", run: (d) => d.forms.submit("contact", { answers: { email: "a@b.co" }, signatures: [{ value: "A" }] }) },
  { name: "survey.get", run: (d) => d.survey.get("nps") },
  { name: "survey.validate", run: (d) => d.survey.validate({ questions: [{ id: "q1", type: "radio", required: true, options: [{ value: "a" }] }, { id: "q2", type: "email" }] }, { q1: "b", q2: "nope" }) },
  { name: "survey.submit", run: (d) => d.survey.submit("nps", { q1: "a" }, { sourceUrl: "https://x/y", respondentName: "A" }) },
  { name: "survey.submitLanding", run: (d) => d.survey.submitLanding({ campaign: "c", rating: 5 }) },
  { name: "pageGroups.list", run: (d) => d.pageGroups.list() },
  { name: "pageGroup.all", run: (d) => d.pageGroup("services").all({ limit: 10, offset: 10 }) },
  { name: "pageGroup.get", run: (d) => d.pageGroup("services").get("kitchen remodel") },
  { name: "pageGroup.filter(spec)", run: (d) => d.pageGroup("services").filter({ size_id: "size_1" }) },
  { name: "pageGroup.filter(fn)", run: (d) => d.pageGroup("services").filter((i: any) => i.quantity > 1) },
  { name: "pageGroup.find", run: (d) => d.pageGroup("services").find({ size_id: "nope" }) },
  { name: "pageGroup.count", run: (d) => d.pageGroup("services").count() },
  { name: "pageGroups.group", run: (d) => d.pageGroups.group("x").slug },
  { name: "pageGroup('') throws", run: (d) => d.pageGroup("") },
  { name: "contentTypes.list", run: (d) => d.contentTypes.list() },
  { name: "contentTypes.listItems", run: (d) => d.contentTypes.listItems("services", { limit: 3 }) },
  { name: "contentTypes.getItem", run: (d) => d.contentTypes.getItem("services", "x") },
  { name: "upload.isAllowed", run: (d) => [d.upload.isAllowed("a.PDF"), d.upload.isAllowed("a.exe"), d.upload.isAllowed("a.xyz"), d.upload.getAllowedExtensions().length, d.upload.getBlockedExtensions().length] },
  // admin (sk)
  ...adminScenarios(),
];

function adminScenarios(): Scenario[] {
  const calls: Array<[string, (a: any) => unknown]> = [
    ["listProducts", (a) => a.listProducts({ page: 2, per_page: 10, search: "x", category: "c", active: false })],
    ["getProduct", (a) => a.getProduct("p1")],
    ["createProduct", (a) => a.createProduct({ name: "N" })],
    ["updateProduct", (a) => a.updateProduct("p1", { name: "N" })],
    ["deleteProduct", (a) => a.deleteProduct("p1")],
    ["importProducts", (a) => a.importProducts({ rows: [] })],
    ["listCategories", (a) => a.listCategories({ tree: true })],
    ["getCategory", (a) => a.getCategory("c1")],
    ["createCategory", (a) => a.createCategory({ name: "C" })],
    ["updateCategory", (a) => a.updateCategory("c1", {})],
    ["deleteCategory", (a) => a.deleteCategory("c1")],
    ["importCategories", (a) => a.importCategories({})],
    ["listBrands", (a) => a.listBrands()],
    ["createBrand", (a) => a.createBrand({})],
    ["updateBrand", (a) => a.updateBrand("b1", {})],
    ["deleteBrand", (a) => a.deleteBrand("b1")],
    ["listPosts", (a) => a.listPosts({ page: 1, search: "s", status: "draft" })],
    ["getPost", (a) => a.getPost("bp1")],
    ["createPost", (a) => a.createPost({})],
    ["updatePost", (a) => a.updatePost("bp1", {})],
    ["deletePost", (a) => a.deletePost("bp1")],
    ["listReviews", (a) => a.listReviews({ page: 1, product: "p", status: "s" })],
    ["updateReview", (a) => a.updateReview("r1", {})],
    ["deleteReview", (a) => a.deleteReview("r1")],
    ["listContactForms", (a) => a.listContactForms({ status: "new", search: "s" })],
    ["getContactForm", (a) => a.getContactForm("f1")],
    ["updateContactForm", (a) => a.updateContactForm("f1", {})],
    ["deleteContactForm", (a) => a.deleteContactForm("f1")],
    ["replyContactForm", (a) => a.replyContactForm("f1", "thanks")],
    ["listOrders", (a) => a.listOrders({ page: 1, status: "paid", search: "1001" })],
    ["getOrder", (a) => a.getOrder("o1")],
    ["updateOrder", (a) => a.updateOrder("o1", {})],
    ["listCustomers", (a) => a.listCustomers({ page: 1, search: "x" })],
    ["getCustomer", (a) => a.getCustomer("cu1")],
    ["updateCustomer", (a) => a.updateCustomer("cu1", {})],
    ["listMedia", (a) => a.listMedia({ folder: "f", search: "s" })],
    ["deleteMedia", (a) => a.deleteMedia("m1")],
    ["sendEmail", (a) => a.sendEmail({})],
    ["listEmailThreads", (a) => a.listEmailThreads({ filter: "f", search: "s" })],
    ["getEmailThread", (a) => a.getEmailThread("t1")],
    ["listDiscountCodes", (a) => a.listDiscountCodes({ search: "s" })],
    ["createDiscountCode", (a) => a.createDiscountCode({})],
    ["updateDiscountCode", (a) => a.updateDiscountCode("d1", {})],
    ["deleteDiscountCode", (a) => a.deleteDiscountCode("d1")],
    ["listProductVariations", (a) => a.listProductVariations("p1")],
    ["createProductAttribute", (a) => a.createProductAttribute("p1", {})],
    ["updateProductAttribute", (a) => a.updateProductAttribute("p1", "a1", {})],
    ["deleteProductAttribute", (a) => a.deleteProductAttribute("p1", "a1")],
    ["createVariation", (a) => a.createVariation("p1", "a1", {})],
    ["updateVariation", (a) => a.updateVariation("p1", "a1", "o1", {})],
    ["deleteVariation", (a) => a.deleteVariation("p1", "a1", "o1")],
    ["listProductSizes", (a) => a.listProductSizes("p1")],
    ["createProductSize", (a) => a.createProductSize("p1", {})],
    ["updateProductSize", (a) => a.updateProductSize("p1", "s1", {})],
    ["deleteProductSize", (a) => a.deleteProductSize("p1", "s1")],
    ["listProductFiles", (a) => a.listProductFiles("p1")],
    ["deleteProductFile", (a) => a.deleteProductFile("p1", "f1")],
    ["replyToThread", (a) => a.replyToThread("t1", { body: "x" })],
    ["listContactFormReplies", (a) => a.listContactFormReplies("f1")],
    ["listBlogCategories", (a) => a.listBlogCategories()],
    ["createBlogCategory", (a) => a.createBlogCategory({})],
    ["updateBlogCategory", (a) => a.updateBlogCategory("bc1", {})],
    ["deleteBlogCategory", (a) => a.deleteBlogCategory("bc1")],
  ];
  return calls.map(([n, f]) => ({ name: `admin.${n}`, sk: true, run: (d: Dash) => f(d.admin) }));
}

let V1: any;
let V2: any;
beforeAll(async () => {
  V1 = await loadV1();
  V2 = await loadV2();
});

async function runOnce(mod: any, opts: any, s: Scenario) {
  const { calls, fetchMock } = recorder();
  const result = await withGlobalFetch(fetchMock, async () => {
    const d = new mod.DashClient(opts);
    const r = await settle(async () => s.run(d));
    const state = s.state ? s.state(d) : undefined;
    return { r, state };
  });
  return { calls, ...result };
}

for (const host of [
  { label: "default", v1: (key: string) => ({ apiKey: key, baseURL: PAPI }), v2: (key: string) => ({ apiKey: key }), base: PAPI },
  { label: "old host rewritten", v1: (key: string) => ({ apiKey: key, baseURL: PAPI }), v2: (key: string) => ({ apiKey: key, baseURL: PROD }), base: PAPI },
]) {
  describe(`v1 and v2 send the same requests (${host.label})`, () => {
    for (const s of SCENARIOS) {
      it(s.name, async () => {
        const key = s.sk ? "sk_test_differential" : "pk_test_differential";
        const a = await runOnce(V1, host.v1(key), s);
        const b = await runOnce(V2, host.v2(key), s);
        expect(b.calls).toEqual(a.calls);
        for (const c of b.calls) expect(c.url.startsWith(host.base)).toBe(true);
        if (a.r.ok) {
          expect(b.r).toEqual(a.r);
        } else {
          expect(b.r.ok).toBe(false);
          if (!b.r.ok) expect(b.r.error.message).toBe(a.r.error.message);
        }
        expect(b.state).toEqual(a.state);
      });
    }
  });
}

describe("API errors look the same", () => {
  const errorBody = { error: "not_found", message: "Product not found" };
  for (const [label, mod] of [["v1", () => V1], ["v2", () => V2]] as const) {
    it(`${label}: 404 JSON -> Error with status, details and message`, async () => {
      const { fetchMock } = recorder(() => ({ status: 404, body: errorBody }));
      const err: any = await withGlobalFetch(fetchMock, async () => {
        const d = new (mod() as any).DashClient({ apiKey: "pk_test_x" });
        try {
          await d.products.getCore("missing");
        } catch (e) {
          return e;
        }
      });
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe("Product not found");
      expect(err.status).toBe(404);
      expect(err.details).toEqual(errorBody);
    });
  }
});

it("scenario count covers the v1 runtime surface", () => {
  expect(SCENARIOS.length).toBeGreaterThan(230);
});

it("the comparison detects a divergence (self-check)", async () => {
  const s = SCENARIOS.find((x) => x.name === "products.list(all options)")!;
  // v1 left on the old host; v2 goes to papi, so the recorded calls differ.
  const a = await runOnce(V1, { apiKey: "pk_test_x" }, s);
  const b = await runOnce(V2, { apiKey: "pk_test_x" }, s);
  expect(b.calls).not.toEqual(a.calls);
});

// Storefront code as it is written today against dash4devs 0.1.x (patterns
// taken from the 44 storefronts in Dash4Devs/projects), compiled against v2's
// types. If this file stops compiling, a store's build would break.
import DefaultClient, {
  DashClient,
  createRevalidateHandler,
  type CartItem,
  type BlogPost,
  type Product,
  type ProductReview,
  type Category,
  type CheckoutOrder,
  type CustomerSubscription,
  type BlogCategory,
  type CoaProduct,
  type ProductSize,
  type RestockRequest,
  type SurveyQuestion,
  type SurveySchema,
  type DiscountStoreProduct,
  type PageGroupItem,
} from "../../dist/index.js";
import { DashImage, type DashImageData, type DashImageProps } from "../../dist/react/DashImage.js";
import { DashProvider, useCart, useDash, type DashImageData as RD } from "../../dist/react/index.js";
import { consoleWarningScript } from "../../dist/security/index.js";
import { formatPrice } from "../../dist/utils/index.js";
import { storage, cookies } from "../../dist/storage/index.js";

declare const process: { env: Record<string, string | undefined> };

// lib/dash.ts (standard pattern)
const isServer = typeof window === "undefined";
const apiKey = isServer
  ? process.env.DEVDASH_SECRET_KEY || process.env.NEXT_PUBLIC_DEVDASH_PUBLIC_KEY || "pk_unconfigured"
  : process.env.NEXT_PUBLIC_DEVDASH_PUBLIC_KEY || "pk_unconfigured";
export const dash = new DashClient({
  apiKey,
  baseURL: process.env.NEXT_PUBLIC_DEVDASH_API_URL || "https://api.dashfordevs.com",
});
const baseURL = process.env.NEXT_PUBLIC_DEVDASH_API_URL;
export const dash2 = new DashClient(baseURL ? { apiKey, baseURL } : { apiKey });
export const dash3: DashClient = new DefaultClient({ apiKey, consoleWarning: false });

// v2 switch
export const papi = new DashClient({ apiKey, target: "papi" });

// Revalidate route
export const POST = createRevalidateHandler({ secret: process.env.REVALIDATE_SECRET });

async function pages() {
  const { global } = await dash.getGlobalData();
  const name: string | null = global.store_name;
  const { items } = await dash.pageGroup("services").all();
  const first: PageGroupItem | undefined = items[0];
  const { item } = await dash.pageGroup("services").get("x");
  const { products, pagination } = await dash.products.list({ limit: 12, category: "flower", include: ["main_size"], customFields: { featured: true } });
  const p: Product = products[0];
  const total: number = pagination.total;
  const { product } = await dash.products.get("slug");
  const core = await dash.products.getCore("slug");
  const opts = await dash.products.getOptions("slug");
  const { reviews } = await dash.products.getReviews("slug", { limit: 5 });
  const r: ProductReview = reviews[0];
  const { category } = await dash.categories.get("flower", { includeProducts: true });
  const cats: Category[] = (await dash.categories.list({ tree: true })).categories;
  const { file } = await dash.media.getByName("hero");
  const folder = await dash.media.getFolder("gallery", { metadata: { type: "hero" } });
  const { posts } = await dash.blog.list({ limit: 6 });
  const post: BlogPost = posts[0];
  const blogCats = await dash.blog.categories();
  const bc: BlogCategory[] = (await dash.blog.listCategories()).categories;
  const docs = await dash.legal.list();
  const coa = await dash.coa.list();
  const cp: CoaProduct = coa.products[0];
  const page = await dash.getPageData("/products/x");
  const ping = await dash.ping();
  const html = await dash.htmlTemplates.get("x");
  const raw = await dash._fetch(`${dash.baseURL}/api/storefront/promotions`);
  const key: string = dash.apiKey;
  return { name, first, item, p, total, product, core, opts, r, category, cats, file, folder, post, blogCats, bc, docs, cp, page, ping, html, raw, key };
}

async function account() {
  await dash.auth.requestOTP("a@b.co");
  const res = await dash.auth.verifyOTP({ email: "a@b.co", code: "123456" });
  dash.auth.setToken(res.access_token, res.refresh_token);
  dash.auth.setTokens(res.access_token, res.refresh_token);
  await dash.auth.refreshAccessToken();
  const { customer } = await dash.auth.getProfile();
  const { orders } = await dash.auth.getOrders({ limit: 10 });
  const o: CheckoutOrder = orders[0];
  const { restock_requests } = await dash.auth.getRestockRequests();
  const rr: RestockRequest = restock_requests[0];
  const subs: CustomerSubscription[] = (await dash.subscriptions.list()).subscriptions;
  const ds: DiscountStoreProduct[] = (await dash.discountStore.list()).products;
  await dash.auth.logout();
  return { customer, o, rr, subs, ds };
}

async function cart() {
  await dash.cart.init(null);
  await dash.cart.add({ productId: "p", sizeId: "s", quantity: 1 });
  const items: CartItem[] = dash.cart.items;
  await dash.cart.update("s", 2);
  await dash.cart.remove(null, { itemId: "i" });
  const { itemCount, subtotal } = dash.cart.getTotals();
  await dash.checkout.start({ cartId: dash.cart.cartId!, email: "a@b.co" });
  const done = await dash.checkout.complete({
    cartId: "c",
    shipping: { first_name: "A", last_name: "B", address: "1", city: "C", state: "NY", zip_code: "10001" },
    payment_token: {
      token: "t",
      descriptor: "d",
      line_items: [{ id: "prod__x", name: "Thing", description: "10mg", quantity: "1", unit_price: "9.99" }],
    },
  });
  await dash.payment.load();
  const tok = await dash.payment.tokenize({ cardNumber: "4111111111111111", expDate: "12/30", cvv: "123" });
  const rate = await dash.shipping.getCheapestRate({ to_postal: "10001", weight_oz: 8 });
  const tax = await dash.tax.calculate({ state: "NY", cart_id: "c" });
  dash.insights.init();
  dash.insights.notifyRouteChange("/x");
  dash.tracking.capture("added_to_cart", { price: 1 });
  dash.tracking.setCustomer("cus__1");
  (dash.tracking as any)._log = () => {};
  const logs = dash.tracking._debugLogs;
  const size: ProductSize | undefined = undefined;
  const q: SurveyQuestion | undefined = undefined;
  const sc: SurveySchema | undefined = undefined;
  return { items, itemCount, subtotal, done, tok, rate, tax, logs, size, q, sc };
}

// React usage
const img: DashImageData = { url: "https://cdn.dashfordevs.com/content/x.webp" };
const imgProps: DashImageProps = { image: img, alt: "x", sizes: "100vw", priority: true };
const el = DashImage(imgProps);
const rd: RD = img;
function Comp() {
  const { client } = useDash();
  const { addItem, items } = useCart();
  return { client, addItem, items };
}

const script: string = consoleWarningScript();
const price: string = formatPrice("12.5");
storage.set("k", 1);
cookies.set("k", "v", { days: 1 });

// The helper really enforces assignability (this must be an error):
type Assignable<To, From extends To> = From;
// @ts-expect-error - number is not assignable to string
type _Negative = Assignable<string, number>;

export { pages, account, cart, el, rd, Comp, script, price, DashProvider };

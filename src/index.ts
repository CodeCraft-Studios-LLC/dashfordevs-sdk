/**
 * dash4devs - storefront SDK for DashForDevs (v2).
 *
 * Solution by CodeCraft Studios (https://www.codecraftstudios.net).
 *
 *   import { DashClient } from "dash4devs";
 *   const dash = new DashClient({ apiKey: process.env.NEXT_PUBLIC_DEVDASH_PUBLIC_KEY! });
 *   const { products } = await dash.products.list({ limit: 12 });
 *
 * Talks to https://api.dashfordevs.com by default; `target: "papi"` (or
 * DASH4DEVS_TARGET=papi) switches to https://papi.dashfordevs.com, which
 * serves the same API.
 */

import { DashClient } from "./client.js";

export { DashClient };
export { SDK_VERSION, PACKAGE_NAME } from "./version.js";

// =============================================================================
// REVALIDATION HANDLER (Next.js App Router)
// =============================================================================

/**
 * A Next.js App Router POST handler for on-demand revalidation. Validates a
 * shared secret, then revalidates the root layout, each path and each tag.
 *
 * @example
 * // app/api/revalidate/route.ts
 * export const POST = createRevalidateHandler({ secret: process.env.REVALIDATE_SECRET });
 */
export function createRevalidateHandler({ secret }: { secret: string | undefined }): (request: Request) => Promise<Response> {
  return async function POST(request: Request): Promise<Response> {
    // @ts-ignore - provided by the Next.js app at runtime
    const { NextResponse } = await import("next/server");
    // @ts-ignore - provided by the Next.js app at runtime
    const { revalidatePath, revalidateTag } = await import("next/cache");

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!secret || !body || body.secret !== secret) {
      return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
    }

    const paths: string[] = Array.isArray(body.paths) ? body.paths : [];
    const tags: string[] = Array.isArray(body.tags) ? body.tags : [];
    if (paths.length === 0 && tags.length === 0) {
      return NextResponse.json({ error: "paths or tags must be provided" }, { status: 400 });
    }

    const revalidated: string[] = [];

    try {
      revalidatePath("/", "layout");
      revalidated.push("/ (layout)");
    } catch {
      /* ignore */
    }

    for (const p of paths) {
      try {
        revalidatePath(p);
        revalidated.push(p);
      } catch (e: any) {
        console.error(`[revalidate] Failed for ${p}:`, e?.message);
      }
    }

    for (const t of tags) {
      try {
        revalidateTag(t);
        revalidated.push(`tag:${t}`);
      } catch (e: any) {
        console.error(`[revalidate] Failed for tag ${t}:`, e?.message);
      }
    }

    console.log(`[revalidate] Revalidated ${revalidated.length} entries:`, revalidated);
    return NextResponse.json({ revalidated });
  };
}

// Re-export modules for advanced usage (same names as v1)
export { ProductsModule } from "./services/products.js";
export { CategoriesModule } from "./services/categories.js";
export { CartModule } from "./services/cart.js";
export {
  PagesModule,
  SeoModule,
  BlogModule,
  BrandsModule,
  CoaModule,
  LegalModule,
  MediaModule,
  HtmlTemplatesModule,
  SitemapModule,
  ContactModule,
} from "./services/content.js";
export { AuthModule } from "./services/auth.js";
export { PaymentModule } from "./services/payment.js";
export { CheckoutModule } from "./services/checkout.js";
export {
  EmailModule,
  ReferralsModule,
  PaymentMethodsModule,
  DiscountStoreModule,
  LoyaltyModule,
  EarnPointsModule,
  SubscriptionsModule,
  CalendarModule,
} from "./services/account.js";
export { ShippingModule, TaxModule, MarketingModule, AffiliatesModule } from "./services/commerce.js";
export { TrackingModule } from "./services/tracking.js";
export { InsightsModule } from "./services/insights.js";
export { UploadModule } from "./services/upload.js";
export { PageGroupsModule, PageGroup, FormsModule, SurveyModule, ContentTypesModule } from "./services/collections.js";
export { AdminModule } from "./services/admin.js";

// Processor classes (advanced usage)
export { AuthorizeNetCSR } from "./processors/authorize-net.js";
export { QuickBooksCSR } from "./processors/quickbooks.js";
export { GooglePayCSR } from "./processors/google-pay.js";

// v2 additions
export { DashApiError, isDashApiError } from "./core/errors.js";
export { API_TARGETS, CDN_BASE, DEFAULT_API_BASE, resolveApiBase, describeApiBase } from "./core/config.js";
export type { ApiTarget } from "./core/config.js";
export type { DashFetchOptions } from "./core/transport.js";
export { maskLineItems, maskPaymentDescription, templatePath, phiShapes } from "./core/privacy.js";
export { sanitizePaymentToken } from "./services/checkout.js";
export type { UploadCheck, UploadResult } from "./services/upload.js";
export type { ContactSubmitData } from "./services/content.js";

// Every v1 type
export type * from "./types.js";

export default DashClient;

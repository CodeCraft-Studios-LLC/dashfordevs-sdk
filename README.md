# dash4devs (v2)

The storefront SDK for [DashForDevs](https://dashfordevs.com), by CodeCraft Studios: products,
categories, cart, checkout, customer accounts, content, analytics and the `dash4devs` build CLI,
for Next.js and any JavaScript site.

**v2 is a drop-in replacement for `dash4devs@0.1.x`.** Same imports, classes, methods, arguments,
return shapes, React components, CLI commands and environment variables. A store that only swaps
the package keeps working and keeps talking to the same API. See [MIGRATION.md](MIGRATION.md) for
the few intentional differences (all privacy or bug fixes) and [CHANGELOG.md](CHANGELOG.md).

```bash
npm install dash4devs        # once published; replaces "github:CodeCraftStudios/dash4devs-sdk"
```

```ts
import { DashClient } from "dash4devs";

const dash = new DashClient({ apiKey: process.env.NEXT_PUBLIC_DEVDASH_PUBLIC_KEY! });

const { global } = await dash.getGlobalData();
const { products } = await dash.products.list({ limit: 12, include: ["main_size"] });
const { items } = await dash.pageGroup("services").all();
```

## Choosing the API host

DashForDevs serves the same public API from two hosts:

| Target | URL | |
|---|---|---|
| `production` | `https://api.dashfordevs.com` | current platform, **default** |
| `papi` | `https://papi.dashfordevs.com` | rebuilt public API: same paths, methods, auth, request and response shapes |

One setting picks the host. The first of these that is set wins:

1. `baseURL` option (v1's option, any URL, e.g. `http://localhost:8000`)
2. `apiBase` option (alias of `baseURL`)
3. `target` option: `"production"` or `"papi"`
4. `DASH4DEVS_API_URL` / `NEXT_PUBLIC_DASH4DEVS_API_URL` (any URL)
5. `DASH4DEVS_TARGET` / `NEXT_PUBLIC_DASH4DEVS_TARGET` (`production` or `papi`)
6. production

```ts
new DashClient({ apiKey, target: "papi" });          // in code
// or, with no code change:  DASH4DEVS_TARGET=papi  and  NEXT_PUBLIC_DASH4DEVS_TARGET=papi
dash.target;   // "production" | "papi" | "custom"
dash.baseURL;  // the URL in use
```

Next.js inlines `NEXT_PUBLIC_*` values at build time, so set the `NEXT_PUBLIC_` variant for code that
runs in the browser and rebuild after changing it. Stores scaffolded with `dash4devs init` (and most
existing stores) pass `baseURL: process.env.NEXT_PUBLIC_DEVDASH_API_URL`; setting that variable to
`https://papi.dashfordevs.com` switches them too, on v1 or v2.

## Keys: public in the browser, secret on the server

- `pk_*` public keys are safe in browser bundles (origin-checked by the API for live keys).
- `sk_*` secret keys bypass origin checks and unlock `dash.admin`. The client **throws** if it is
  created with an `sk_` key in a browser, or if any `NEXT_PUBLIC_*` variable holds a secret key
  (the variable's name is reported, never its value). The server startup banner masks keys.

Recommended Next.js layout (keeps the secret out of client bundles by construction):

```ts
// lib/dash.server.ts   (import only from server components, route handlers, server actions)
import "server-only";
import { DashClient } from "dash4devs";
import { assertServerOnlyKey } from "dash4devs/security";
assertServerOnlyKey(process.env.DEVDASH_SECRET_KEY);
export const dash = new DashClient({ apiKey: process.env.DEVDASH_SECRET_KEY! });

// lib/dash.client.ts   (browser)
import { DashClient } from "dash4devs";
export const dash = new DashClient({ apiKey: process.env.NEXT_PUBLIC_DEVDASH_PUBLIC_KEY! });
```

The single shared `lib/dash.ts` that picks `DEVDASH_SECRET_KEY` on the server and the public key in
the browser (the scaffold's pattern) is also safe, because a non-`NEXT_PUBLIC_` variable is never
inlined into a client bundle; the split above simply makes that impossible to get wrong.

## Reliability

- Every request has a timeout (`timeoutMs`, default 15000; 0 disables).
- GET/HEAD requests are retried (`retries`, default 2) on network errors, timeouts and
  408/425/429/502/503/504, with backoff and `Retry-After` (capped at 5 s). Writes are never
  retried. A 503 whose body says `"available": false` (papi's not-yet-enabled routes) is final.
- One error type: `DashApiError` (an `Error`, so v1 code keeps working) with `message`, `status`,
  `details` (the parsed body, as v1), plus `code` (`body.error`, or `network_error`, `timeout`,
  `aborted`, `invalid_response`), `fields` (422 validation), `method`, `url` (no query string),
  `requestId` and `retryable`. A proxy's HTML error page is a `DashApiError`, not a `SyntaxError`.
- Server-side Next.js caching is unchanged from v1: anonymous GETs in production builds use the
  Data Cache with `revalidate: DASH4DEVS_REVALIDATE || 60` and tag `dash4devs`.

```ts
import { DashApiError } from "dash4devs";
try {
  await dash.products.getCore(slug);
} catch (e) {
  if (e instanceof DashApiError && e.status === 404) notFound();
  throw e;
}
```

## Privacy (on by default)

DashForDevs stores sell prescriptions and peptides; a person plus a product is protected health
information. v2 makes the SDK's own traffic safe without any code change:

- **Payment processors never see products.** `checkout.complete({ payment_token })`,
  `payment.charge()` and `payment.authorize()` send line items as `Item 1`, `Item 2`... with opaque
  ids, quantities and prices; product names, size labels and descriptions are removed, and a free-text
  `description` is dropped unless it is just `Order #1234`. (The API forwards these to Authorize.net.)
  Google Pay sheet rows other than Subtotal/Shipping/Tax/Discount become `Item N`.
- **First-party analytics is de-identified** (`dash.insights`, `dash.tracking.trackVisit`): opaque
  visitor/session ids, URL paths without query strings (id-like segments become `:id`), referrer
  domains, device class. Never a customer id, page title, click text or free-form properties. This
  is what the DashForDevs analytics service keeps anyway. `new DashClient({ analytics: "legacy" })`
  restores v1's full payloads and warns once.
- **PostHog** session recordings mask every input and never record API request/response bodies or
  headers; person fields (email, name, phone, address...) are stripped from properties sent to PostHog.
- Third-party pixels the store calls directly (`tracking.fbq*`, `tracking.tm*`, `marketing.*` for
  Klaviyo) still receive what the store passes them. On health catalogs, only send product names to
  vendors that are covered by a BAA.

## Entry points

| Import | Contents |
|---|---|
| `dash4devs` | `DashClient` (default export too), `createRevalidateHandler`, every module class, processor classes, `DashApiError`, `API_TARGETS`, `resolveApiBase`, all v1 types |
| `dash4devs/react` | `DashProvider`, `useDash`, `CartProvider`, `useCart`, `AuthProvider`, `useAuth`, `DashImage`, `SignaturePad`, `useDashForm`, `MaintenancePage` |
| `dash4devs/react/DashImage` | `DashImage` (and the React types) |
| `dash4devs/utils` | price, loyalty and bulk-discount helpers; `cdnImageUrl` |
| `dash4devs/storage` | `storage`, `cookies`, `createStorage`, `StorageManager` |
| `dash4devs/security` | `consoleWarningScript`, `printConsoleWarning`, `assertServerOnlyKey`, `maskKey` |
| `dash4devs/processors` | `AuthorizeNetCSR`, `GooglePayCSR`, `QuickBooksCSR` |
| `dash4devs/styles/raw-html.css` | styles for API-rendered HTML |

The package ships compiled ES modules with `"use client"` on the client components, so
`transpilePackages: ["dash4devs"]` is no longer required (keeping it is harmless). Everything is
SSR-safe: every browser API is guarded, so server components and route handlers can import any
entry point (verified with a Next.js 16 App Router build that server-renders `DashClient`,
`DashImage` and `DashProvider`).

### Images

`<DashImage>` renders absolute URLs exactly as v1. Media from the rebuilt services may come as
CDN-relative paths (`/content/...`); those resolve against `https://cdn.dashfordevs.com`
(`cdnImageUrl()` does the same for your own markup). If you also use `next/image`, allow both hosts:

```js
images: { remotePatterns: [
  { protocol: "https", hostname: "cdn.dashfordevs.com" },
  { protocol: "https", hostname: "dashfordevs.nyc3.cdn.digitaloceanspaces.com" },
] }
```

## CLI

`dash4devs init | build | deploy | status`, unchanged. The API host follows
`NEXT_PUBLIC_DEVDASH_API_URL`, `DASH4DEVS_API_URL`, then `DASH4DEVS_TARGET` (`production` | `papi`),
then production. `build` still degrades to a plain `next build` when the CDN upload cannot run.

PostHog is loaded with `import("posthog-js")` exactly as in v1. Turbopack (Next 16's default)
builds without `posthog-js` installed; webpack builds (Next 14/15) need `npm i posthog-js` or
`resolve.alias["posthog-js"] = false`.

## Development

```bash
npm ci
npm run build        # tsc -> dist/
npm test             # 668 tests: v1 vs v2 differential, contract fixtures, browser, React, CLI, surface
npm run test:types   # compile-time: v2 assignable to every v1 declaration + storefront usage
npm run lint
npm run surface      # human-readable public-surface diff v1 -> v2
npm run fixtures:capture -- --key-from <file> --expect-org "Lost THC"   # read-only GETs to production
npm run papi:diff -- --key-from <file>                                    # papi vs production shapes
```

`test/v1-snapshot` is a read-only copy of dash4devs 0.1.23-alpha used only by the tests.

## Package name and version

The name and version live only in `package.json` (`npm run sync-version` writes `src/version.ts`,
used by the startup banner, the "Powered by" badge, the CLI and `dash4devs init`). Renaming the
package is that one line; stores can then install it under the old import name with an npm alias
(`"dash4devs": "npm:<new-name>@^0.2.0"`), which `dash4devs init` does automatically.

## License

MIT - CodeCraft Studios (John Molina).

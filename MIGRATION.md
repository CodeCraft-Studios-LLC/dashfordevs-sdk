# Migration guide

Two independent moves:

- **A. dash4devs v1 (0.1.x) -> v2 (0.2.x).** Swap the package. No code changes.
- **B. production (`api.dashfordevs.com`) -> papi (`papi.dashfordevs.com`).** Change one setting.
  Works on v1 too, without upgrading.

Do them in either order; doing A first gives you timeouts, retries, the privacy defaults and a
cleaner switch for B.

---

## A. v1 -> v2

### 1. Change the dependency

```diff
- "dash4devs": "github:CodeCraftStudios/dash4devs-sdk",
+ "dash4devs": "^0.2.0",
```

(`#main` / `#<commit>` pins included.) Then `npm install`. Imports, `transpilePackages: ["dash4devs"]`
and the `npx dash4devs build --no-video` build script stay as they are.

### 2. That's it - unless you depend on one of these

All differences are intentional; each is a privacy fix or a bug fix.

| Area | v1 | v2 | What to do |
|---|---|---|---|
| Line items to the payment processor | product names, size labels, descriptions forwarded to Authorize.net | `Item N`, opaque id, quantity, price | nothing (receipts/order records come from the cart, not from these fields) |
| Free-text payment `description` | forwarded | kept only if it is `Order #1234`-style | put product info nowhere near payments |
| `insights` / `tracking.trackVisit` payloads | full URLs with query strings, page titles, click text, customer id, free-form props | paths only (`/orders/:id`), referrer domain, event names, numeric values | if a report truly needs v1's data: `new DashClient({ ..., analytics: "legacy" })` |
| PostHog session recording | inputs unmasked, API bodies and headers recorded | inputs masked, no network bodies/headers | nothing |
| Errors | `Error` with `status`/`details`; `SyntaxError` on HTML error pages | `DashApiError` (still an `Error`, same `message`/`status`/`details`) | `instanceof SyntaxError` checks no longer match; use `e.code === "invalid_response"` |
| GET failures | one attempt, no timeout | timeout 15 s, 2 retries on transient errors | tune with `timeoutMs` / `retries` |
| `CartProvider` (from `dash4devs/react`) | add/update/remove threw (wrong module calls) | works | if you worked around it, you can remove the workaround |
| `useDashForm` | conditional fields never validated client-side; server field errors not shown | both work | nothing |
| `products.get(slug, options)` | `options` ignored | sent as query parameters | don't pass options you don't mean |
| `blog.categories()`, `auth.setTokens()`, `auth.accessToken`, `auth.refresh()`, `verifyOTP(email, code)` | declared in types, missing at runtime (threw) | implemented | nothing |
| Node | needed global fetch (18+) | 18+ | nothing |
| PostHog with webpack (Next 14/15) | needed `posthog-js` installed | same | Turbopack (Next 16) is unaffected |

### 3. Verify

```bash
npm run build          # your store
```

Load a product page, add to cart, check out on a test key. `dash.version` should read `0.2.0`.

---

## B. production -> papi

papi serves the same paths, methods, auth, request and response shapes as production, so only the
host changes. Before switching a store, confirm on papi (see "Is papi ready for this store?" below).

### Stores on v2

Pick one:

```bash
# no code change: both server and browser
DASH4DEVS_TARGET=papi
NEXT_PUBLIC_DASH4DEVS_TARGET=papi
```

```ts
// or in code
new DashClient({ apiKey, target: "papi" });
```

```bash
# or the variable most stores already pass as baseURL (also works on v1, below)
NEXT_PUBLIC_DEVDASH_API_URL=https://papi.dashfordevs.com
```

Rebuild and redeploy (Next.js inlines `NEXT_PUBLIC_*` at build time). `dash.target` reports `"papi"`.
An explicit `baseURL`/`apiBase` in code wins over the variables: if your `lib/dash.ts` hardcodes
`baseURL: "https://api.dashfordevs.com"`, change that line instead.

### Stores on v1 (no upgrade)

v1 does **not** hardcode the host. Its constructor takes `baseURL` (default
`https://api.dashfordevs.com`), and the standard `lib/dash.ts` from `dash4devs init` - used by
almost every store - passes it from an environment variable:

```ts
baseURL: process.env.NEXT_PUBLIC_DEVDASH_API_URL || "https://api.dashfordevs.com",
```

So:

1. Set `NEXT_PUBLIC_DEVDASH_API_URL=https://papi.dashfordevs.com` in the store's deployment
   environment (and `.env.production` if the build reads it from there).
2. Rebuild and redeploy.

Stores whose `lib/dash.ts` only passes `baseURL` when the variable is set (`baseURL ? { apiKey,
baseURL } : { apiKey }`) switch with the same variable. A store that reads another name
(e.g. `DASH4DEVS_BASE_URL`) sets that one. A store that hardcodes a URL edits that line.

`dash4devs build` (the CLI) reads the same `NEXT_PUBLIC_DEVDASH_API_URL`, so CDN uploads follow the
store to papi; if papi does not serve the CDN deploy routes yet, the build falls back to serving
static assets from the origin (the site still deploys).

### Rollback

Unset the variable (or set `target: "production"`), rebuild, redeploy.

### Is papi ready for this store?

Check, in this order:

1. **The store's keys work on papi.** `curl -H "X-API-Key: <the store's pk_ key>" https://papi.dashfordevs.com/api/storefront/ping`
   must return the store's organization (not `401 invalid_api_key`). papi imports production's keys,
   so the store keeps its keys; nothing is rotated.
2. **Its catalog and content are on papi** (`npm run papi:diff` in this package compares papi's
   answers with production's shapes).
3. **Customer and checkout routes are switched on.** Until the HIPAA business associate agreement is
   in place, papi answers cart, account, checkout and payment routes with
   `503 {"error": "not_available_yet", "available": false}`. Content-only sites can move before
   that; stores that sell online move after.
4. **Images.** papi serves rehosted media from `https://cdn.dashfordevs.com/content/...`. `<DashImage>`
   handles it; `next/image` needs that host in `images.remotePatterns`.

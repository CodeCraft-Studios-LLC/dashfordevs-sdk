# Changelog

## 0.3.1

### Fixed
- `<DashImage>` / `cdnImageUrl` sent a site's own `public/` files (`/images/logo.webp`, `/brand/x.svg`)
  to the CDN, where they do not exist (broken logos). A root-relative path now goes to the CDN only
  under one of its folders (`/content/`, `/inventory/`, `/media/`, `/sites/`, ...); anything else stays
  on the site.

## 0.3.0 (unreleased)

### Changed
- The SDK and the `dash4devs` CLI talk only to papi (`https://papi.dashfordevs.com`), the default.
  `target: "production"`, `DASH4DEVS_TARGET=production` and a base URL on the old host
  `api.dashfordevs.com` (what most stores have in `NEXT_PUBLIC_DEVDASH_API_URL`) all mean papi, so
  existing stores move with no code change. A localhost URL is kept, for a local papi; any other
  host is ignored with a warning. `API_TARGETS.production` is now papi's URL.
- `dash4devs build` clears a stale `NEXT_PUBLIC_ASSET_PREFIX` (a site moved from the old platform
  names its CDN in `.env.production`) when papi supplies none, so the build never points at a CDN
  that lacks its chunks. While papi offers no asset CDN (`/api/v1/cdn/*` answers 404), the build
  says so and finishes with the site serving its own assets.

### Added
- `<DashVideo>` (`dash4devs/react`, `dash4devs/react/DashVideo`): a `<video>` for organization
  videos (plays the tallest rendition within `maxHeight`, poster + blurred poster) and for the
  site's own sized videos. Hook-free, so it renders in Server Components.
- `dash4devs media` and `dash4devs/media`: size a site's own `media/` folder (WebP widths + LQIP
  for images, an H.264 MP4 at the drawn width for videos) into `public/_media`, with a manifest
  read by `createMedia(manifest)` -> `imageOf(key)` / `videoOf(key)`. `dash4devs build` runs it
  first when `media.config.mjs` exists. Encoders come from the site (`sharp`, `ffmpeg-static`).
- `<DashImage>` keeps site media paths (`/_media/...`) on the site instead of the org CDN.

## 0.2.0 (unreleased)

The second SDK: a drop-in replacement for 0.1.23-alpha that can talk to either API host.
Every export, entry point, client property, module method, argument and return shape of
0.1.23-alpha is kept (checked by `npm test`: a v1-vs-v2 differential suite over 250 calls on
both hosts, and a compile-time check that v2 satisfies every v1 declaration).

### Added
- Choose the API host: `target: "production" | "papi"`, `apiBase` (alias of `baseURL`), or the
  `DASH4DEVS_TARGET` / `DASH4DEVS_API_URL` environment variables (and their `NEXT_PUBLIC_` forms).
  Default stays `https://api.dashfordevs.com`. `dash.target` reports the host in use.
- Request timeouts (`timeoutMs`, default 15 s) and retries for GET/HEAD (`retries`, default 2) on
  network errors, timeouts and 408/425/429/502/503/504, honouring `Retry-After`. Writes are never
  retried; papi's deliberate 503 (`available: false`) is not retried.
- `DashApiError` for every failure (HTTP, network, timeout, non-JSON) with `status`, `details` (as
  v1), `code`, `fields`, `method`, `url` (no query string), `requestId`, `retryable`.
- `fetch` option (custom fetch for tests and polyfills).
- `dash4devs/processors` entry point; `dash4devs/styles/*` is now exported and published.
- `dash4devs/security`: `assertServerOnlyKey`, `findPublicSecretKeyVars`, `maskKey`, `isSecretKey`,
  `isPublicKey`. `dash4devs/utils`: `cdnImageUrl`, `isDashCdnUrl`.
- Root exports: `SDK_VERSION`, `PACKAGE_NAME`, `API_TARGETS`, `resolveApiBase`, `describeApiBase`,
  `maskLineItems`, `maskPaymentDescription`, `sanitizePaymentToken`, `templatePath`, `phiShapes`,
  `AdminModule`, `MediaModule`, `HtmlTemplatesModule`, `SubscriptionsModule`.
- Full TypeScript sources; declarations generated from them (v1's hand-written `.d.ts` had drifted
  from its runtime). v1's type names are all still exported.

### Changed (privacy, no API change)
- Payment processors never see products: line items in `checkout.complete({ payment_token })`,
  `payment.charge()` and `payment.authorize()` are sent as `Item N` with opaque ids, quantities and
  prices; names, size labels and descriptions are removed; a free-text payment `description` is
  dropped unless it is only an order/invoice reference. Google Pay sheet rows other than
  Subtotal/Shipping/Tax/Discount/Total are labelled `Item N`.
- First-party analytics (`insights`, `tracking.trackVisit`) sends de-identified payloads by default:
  no customer id, no query strings (paths templated), referrer domain only, no page titles, click
  text, element ids or free-form properties, no OS/screen size. `analytics: "legacy"` restores v1.
  Envelope keys, endpoints and localStorage keys are unchanged.
- PostHog session recording: all inputs masked, network bodies and headers never recorded (v1
  recorded API bodies and headers, including Bearer tokens and the API key), console log recording
  off. Person fields are stripped from properties sent to PostHog in the default mode.
- Debug/log lines no longer print customer ids; Google Pay debug logs no longer print addresses.

### Fixed
- Members v1's types declared but its runtime lacked now exist: `auth.accessToken`, `auth.setTokens`,
  `auth.clearTokens`, `auth.refresh`, positional `auth.verifyOTP(email, code)`, `blog.categories()`,
  `useAuth().register` (rejects with guidance: there is no password sign-up endpoint).
- `products.get(slug, options)` forwards `options` as query parameters, as its type promised.
- `CartProvider` called the cart module with arguments it does not take (`cart.add(productId, ...)`,
  `cart.get(cartId)`, `cart.update(cartId, ...)`), so add/update/remove failed; it now works.
- `useDashForm` now validates visible conditional fields client-side and shows the server's 422
  field errors (v1 skipped both).
- `DashImage` accepts a URL string for `image` at runtime, resolves CDN-relative paths against
  `https://cdn.dashfordevs.com`, and emits `fetchpriority` without React 18's unknown-prop warning.
- An empty 2xx body resolves to `{}`; an HTML error page (e.g. production's 500 on
  `/api/storefront/sitemap`, the unrouted `/api/storefront/forms/*`) is a `DashApiError` instead of a
  `SyntaxError`. A 422's `fields` is on the error (`error.fields`).
- `upload.file()` works where `XMLHttpRequest` does not exist (server, workers) via fetch.
- `getSessionId()` and analytics survive blocked storage (Safari private mode, sandboxed iframes).
- The CLI's `build` reported a stale SDK version (0.1.19-alpha); it now reports the package version.
- `dash4devs init` scaffolds depend on the published package instead of the GitHub repo.

### Compatibility notes
- ESM only, as before. Node 18+ (v1 also needed a global `fetch`).
- `posthog-js` is still imported lazily with a literal specifier: Turbopack builds without it
  installed, webpack builds need it installed or aliased to `false` (unchanged from v1).

## 0.1.23-alpha

Baseline: `Dash4Devs/dash4devs-sdk`, installed by storefronts from GitHub. Not published to npm.

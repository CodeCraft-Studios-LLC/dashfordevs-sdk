# dash4devs CLI

Ship your Next.js storefront's static assets to the Dash4Devs global CDN with
one command. Nothing to configure per-org — the CLI detects your organization
from your secret API key.

---

## How it works

```
your laptop          api.dashfordevs.com           DO Spaces CDN
    │                         │                          │
    │  1. next build          │                          │
    │                         │                          │
    │  2. POST manifest       │                          │
    │  (sha256 of every file) │                          │
    │ ──────────────────────▶ │                          │
    │                         │                          │
    │  3. signed PUT URLs     │                          │
    │  (only new files)       │                          │
    │ ◀────────────────────── │                          │
    │                         │                          │
    │  4. PUT each file direct to bucket                 │
    │ ──────────────────────────────────────────────────▶│
    │                         │                          │
    │  5. POST activate       │                          │
    │ ──────────────────────▶ │                          │
    │                         │                          │
    │                         │  6. flip active pointer  │
    │                         │      for your org        │
    │                         │                          │
    │  7. asset_prefix URL    │                          │
    │ ◀────────────────────── │                          │
    │                         │                          │
    │  8. write .env.production                          │
    │                         │                          │
    visitors' browsers ──────────────────────────────────▶ (direct CDN hit)
```

**Key properties**

- **Hash-addressed dedup** — unchanged files from the previous build aren't
  uploaded again. First deploy uploads everything; subsequent deploys usually
  ship 2–5% of the bundle.
- **Atomic activation** — a deploy is only "live" after `activate` succeeds.
  Partial uploads can never serve broken pages.
- **No CDN credentials on your machine** — the API issues short-lived (5 min)
  signed PUT URLs scoped to one object each.
- **Content-hashed file names** (Next's default) mean no cache invalidation is
  ever needed.

---

## Requirements

- Node.js ≥ 18
- A Next.js app with `next build` working
- A **secret** API key from your Dash4Devs dashboard (`sk_test_…` or
  `sk_live_…`). Public keys cannot deploy.

---

## Setup

### 1. Install

```bash
npm install dash4devs
```

This adds the `dash4devs` binary to `./node_modules/.bin`.

### 2. Add your API key

Create `.env.local` in the project root:

```
DASH4DEVS_API_KEY=sk_live_your_secret_here
```

Optional overrides:

```
DASH4DEVS_API_URL=https://api.dashfordevs.com   # default
DASH4DEVS_BUILD_DIR=.next                       # default
DASH4DEVS_PUBLIC_DIR=public                     # default
```

### 3. Wire `assetPrefix` in `next.config.mjs`

```js
const nextConfig = {
  assetPrefix: process.env.NEXT_PUBLIC_ASSET_PREFIX || undefined,
  images: { unoptimized: true },
};
export default nextConfig;
```

That's it. `dash4devs build` writes `NEXT_PUBLIC_ASSET_PREFIX` into
`.env.production` after every deploy, so Next picks up the CDN URL on the next
build. It deliberately does **not** write `.env.local` — `next dev` must never
point at the CDN, since dev-mode chunks only exist on your machine. (If an
older CLI left the var in `.env.local`, the next build strips it out.)

---

## Commands

### `dash4devs build`

The main command. Builds your Next.js app and ships static assets.

```bash
npx dash4devs build
```

**What it does, in order:**

1. Runs `next build`
2. Walks `.next/static/` and `public/`, computing SHA-256 of every file
3. Sends the manifest to `api.dashfordevs.com/v1/cdn/manifest`
4. Server returns the list of files not already on the CDN (plus signed
   upload URLs, one per file)
5. Uploads missing files in parallel (concurrency 8) directly to DO Spaces
6. Confirms each upload with `api.dashfordevs.com/v1/cdn/uploaded`
7. Calls `api.dashfordevs.com/v1/cdn/activate` — atomic pointer flip
8. Writes `NEXT_PUBLIC_ASSET_PREFIX` into `.env.production`
9. Optimizes media: image WebP/LQIP variants are generated **server-side**;
   videos are transcoded **locally** with ffmpeg and pushed to the CDN, so the
   heavy work stays off the API and concurrent builds scale
10. Prints a summary box

**Flags**

| Flag | Effect |
|------|--------|
| `--skip-build` | Don't run `next build`, use the existing `.next/` folder |
| `--dry-run` | Go through the diff step, print what would change, upload nothing |
| `--no-activate` | Upload files but don't flip the active pointer (useful for staging) |
| `--no-video` | Skip the local ffmpeg video transcode. Images still get variants |
| `--force-video` | Re-transcode videos even if a transcode already exists |
| `--no-media` (`--no-images`) | Skip media optimization entirely (images and videos) |

Video transcoding runs ffmpeg on your machine and is slow, so most projects
ship with `--no-video` in their build script:

```json
"scripts": { "build": "npx dash4devs build --no-video" }
```

### `dash4devs deploy`

Alias for `dash4devs build`. Reads better in CI scripts.

### `dash4devs init [dir]`

Scaffolds a new Next.js storefront wired to the SDK, prompting for your API
keys.

### `dash4devs status`

Shows your organization's currently active deployment and the last five
deploys.

```bash
npx dash4devs status
```

Output includes:
- Active deploy ID
- Activation timestamp
- File count and total bytes
- Asset prefix URL currently serving traffic
- Recent deployment history with status badges

---

## Sample output

```
  ╭────────────────────────────────╮
  │  DASH4DEVS  build · deploy     │
  ╰────────────────────────────────╯

  ◇  Auth · key ····7f3a · https://api.dashfordevs.com
  ◇  Building Next.js app
     ✓ Built .next
  ◇  Hashing static files
     ✓ 184 files · 3.24 MB
  ◇  Diffing against CDN
     ✓ 12 new · 172 cached · 247 KB to upload
  ◇  Uploading to edge (12 files)
     ████████████████████████████████ 100% · 12/12 · 247 KB
     ✓ All files uploaded
  ◇  Activating dep_a8f2c1
     ✓ Live at https://dashfordevs.nyc3.cdn.digitaloceanspaces.com/cdn/orgs/org_…

  ╭────────────────────────────────────────────╮
  │  Deploy successful                         │
  │                                            │
  │  deploy   dep_a8f2c1                       │
  │  prefix   https://…/cdn/orgs/org_…         │
  │  saved    2.99 MB via dedup                │
  ╰────────────────────────────────────────────╯
```

---

## FAQ

**Do I need to configure DigitalOcean / my own bucket?**
No. The Dash4Devs backend handles all bucket operations. You never see
credentials.

**What files get uploaded?**
Only `.next/static/` and `public/`. The `.next/server/` folder (Node
handlers) stays on your server — it's what renders HTML on each request.

**What happens to old deploys?**
They become `superseded` in the database. Assets referenced by active or
superseded deploys are kept; the underlying bucket files are shared across
deploys via content hash.

**Do I need to purge the cache between deploys?**
No. Next produces content-hashed filenames, so a new deploy creates brand-new
URLs. Browsers and the CDN edge automatically fetch the new files.

**Can I use this with `output: 'export'` (fully static)?**
Yes. Point `DASH4DEVS_BUILD_DIR` at `out` and everything in there will be
uploaded.

**What counts as a "new" file?**
Any file whose SHA-256 isn't already stored for your organization. This means
branding assets, bundled code, or renamed chunks only upload once across all
deploys.

**Can a public `pk_*` key deploy?**
No — deploys require a secret key. Public keys are rejected at the API layer.

---

## Troubleshooting

**`DASH4DEVS_API_KEY not set`**
Add it to `.env.local` in the directory where you run the command.

**`401: Invalid API key`**
The key was deleted, regenerated, or belongs to the wrong environment. Get a
fresh one from your dashboard's API Keys page.

**`409: incomplete` during activate**
One or more file uploads failed silently. Re-run `dash4devs build` — only the
missing files will be retried.

**Assets load but all 404 in production**
Your `next.config.mjs` isn't reading `NEXT_PUBLIC_ASSET_PREFIX`. Make sure
the `assetPrefix` line is in place and rebuild.

**CORS errors loading fonts or JS in production**
DO Spaces sets permissive CORS by default; if you've tightened it, add your
storefront origin to the bucket's CORS config.

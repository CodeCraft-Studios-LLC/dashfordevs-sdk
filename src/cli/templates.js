/**
 * File templates for `dash4devs init`.
 *
 * `buildFiles(ctx)` returns [{ path, content }] for a complete, compiling
 * Next.js (App Router) + Tailwind v4 storefront wired to the dash4devs SDK.
 * ctx = { name, url, apiUrl, publicKey, secretKey }
 */

import { PACKAGE_NAME, SDK_VERSION } from "../version.js";

export function buildFiles(ctx) {
  const { name, url, apiUrl, publicKey, secretKey, welcome } = ctx;
  const safeName = name.replace(/"/g, '\\"');
  const pkgName = name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "storefront";

  const files = [];
  const add = (path, content) => files.push({ path, content });

  // ─── Root config ──────────────────────────────────────────────────────────
  add("package.json", JSON.stringify({
    name: pkgName,
    version: "0.1.0",
    private: true,
    scripts: { dev: "next dev", build: "next build", start: "next start", lint: "next lint" },
    dependencies: {
      // Generated code imports "dash4devs"; if the SDK is published under another
      // name, install it under this alias so those imports keep working.
      "dash4devs": PACKAGE_NAME === "dash4devs" ? `^${SDK_VERSION}` : `npm:${PACKAGE_NAME}@^${SDK_VERSION}`,
      "next": "^15.0.0",
      "react": "^18.3.1",
      "react-dom": "^18.3.1",
      "lucide-react": "^0.456.0",
      "@radix-ui/react-dialog": "^1.1.2",
      "@radix-ui/react-dropdown-menu": "^2.1.2",
      "@radix-ui/react-slot": "^1.1.0",
      "clsx": "^2.1.1",
      "tailwind-merge": "^2.5.4",
    },
    devDependencies: {
      "@tailwindcss/postcss": "^4.0.0",
      "tailwindcss": "^4.0.0",
      "typescript": "^5.6.3",
      "@types/node": "^22.9.0",
      "@types/react": "^18.3.12",
      "@types/react-dom": "^18.3.1",
    },
  }, null, 2) + "\n");

  add(".env.local", [
    `# ${safeName} — DashForDevs storefront`,
    `NEXT_PUBLIC_SITE_NAME="${safeName}"`,
    `NEXT_PUBLIC_SITE_URL=${url}`,
    `NEXT_PUBLIC_DEVDASH_API_URL=${apiUrl}`,
    `NEXT_PUBLIC_DEVDASH_PUBLIC_KEY=${publicKey}`,
    `# Server-only secret key — never exposed to the browser.`,
    `DEVDASH_SECRET_KEY=${secretKey}`,
    `# Analytics, marketing (Klaviyo), welcome discount, free-shipping threshold,`,
    `# etc. are all configured in DashForDevs and pulled at runtime — no extra env.`,
    "",
  ].join("\n"));

  add(".gitignore", ["node_modules", ".next", ".env*.local", "*.tsbuildinfo", "next-env.d.ts", ""].join("\n"));

  add("next.config.mjs", `import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static chunks + CSS serve from the dash4devs CDN edge. \`dash4devs build\`
  // resolves your org's (stable) prefix and exports it into the build, so it gets
  // inlined into the client bundle — that matters: if the server renders CDN urls
  // while the bundle was compiled without them, Turbopack's chunks never register
  // and React silently never hydrates. Unset it stays undefined and the origin
  // serves the assets, which is always safe.
  assetPrefix: process.env.NEXT_PUBLIC_ASSET_PREFIX || undefined,

  // Pin the workspace root so Turbopack resolves modules from this project
  // rather than a stray lockfile higher up the tree.
  turbopack: { root: __dirname },

  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
};
export default nextConfig;
`);

  add("postcss.config.mjs", `export default { plugins: { "@tailwindcss/postcss": {} } };\n`);

  add("tsconfig.json", JSON.stringify({
    compilerOptions: {
      target: "ES2020", lib: ["dom", "dom.iterable", "esnext"], allowJs: true,
      skipLibCheck: true, strict: true, noEmit: true, esModuleInterop: true,
      module: "esnext", moduleResolution: "bundler", resolveJsonModule: true,
      isolatedModules: true, jsx: "preserve", incremental: true,
      plugins: [{ name: "next" }], paths: { "@/*": ["./*"] },
    },
    include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
    exclude: ["node_modules"],
  }, null, 2) + "\n");

  // ─── lib ──────────────────────────────────────────────────────────────────
  add("lib/dash.ts", `import { DashClient } from "dash4devs";

// Server uses the secret key (bypasses Origin checks); browser uses the public key.
const isServer = typeof window === "undefined";
const apiKey = isServer
  ? (process.env.DEVDASH_SECRET_KEY || process.env.NEXT_PUBLIC_DEVDASH_PUBLIC_KEY || "")
  : (process.env.NEXT_PUBLIC_DEVDASH_PUBLIC_KEY || "");

export const dash = new DashClient({
  apiKey,
  // Set NEXT_PUBLIC_DEVDASH_API_URL, or leave it unset and use
  // NEXT_PUBLIC_DASH4DEVS_TARGET=papi | production (default production).
  baseURL: process.env.NEXT_PUBLIC_DEVDASH_API_URL || undefined,
});

export default dash;
`);

  add("lib/utils.ts", `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function money(v: string | number | null | undefined) {
  return \`$\${parseFloat(String(v ?? 0)).toFixed(2)}\`;
}
`);

  add("lib/consts.ts", `export const NAME = process.env.NEXT_PUBLIC_SITE_NAME || "${safeName}";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "${url}";
`);

  // ─── Styles ─────────────────────────────────────────────────────────────--
  add("app/globals.css", `@import "tailwindcss";

:root { --background: #ffffff; --foreground: #0a0a0a; --accent: #6d28d9; }

html, body { background: var(--background); color: var(--foreground); }
body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
`);

  // ─── Root layout ────────────────────────────────────────────────────────--
  add("app/layout.tsx", `// Load webfonts from Google's CDN with a <link> in <head>, NOT via next/font.
//
// next/font self-hosts the .woff2 under /_next/static, which the CDN assetPrefix
// points at DO Spaces, and it preloads the file with \`crossorigin\`. Spaces sends no
// Access-Control-Allow-Origin, so the browser blocks that fetch outright and the
// site silently falls back to system faces. Google's CDN is CORS-correct, so a
// plain <link> keeps the fonts working while the app's chunks serve from the edge:
//
//   <link rel="preconnect" href="https://fonts.googleapis.com" />
//   <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
//   <link href="https://fonts.googleapis.com/css2?family=Inter..." rel="stylesheet" />
//
// then expose the family as a CSS var on <html style={{ "--font-sans": "'Inter', ..." }}>.
import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { NAME } from "@/lib/consts";

export const metadata: Metadata = {
  title: { default: NAME, template: \`%s | \${NAME}\` },
  description: \`\${NAME} — online store\`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <Providers>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
`);

  // ─── Providers + contexts ─────────────────────────────────────────────────
  add("components/Providers.tsx", `"use client";
import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import { CartSidebar } from "@/components/CartSidebar";
import { SiteInit } from "@/components/SiteInit";
import { JoinDiscount } from "@/components/JoinDiscount";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <CartProvider>
        <SiteInit />
        {children}
        <CartSidebar />
        <JoinDiscount />
      </CartProvider>
    </AuthProvider>
  );
}
`);

  // ─── SiteInit: trackers + RXC redirect + affiliate/referral capture ───────--
  add("components/SiteInit.tsx", `"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import dash from "@/lib/dash";

// One-time, client-side initialization for the storefront. Everything (the
// analytics provider, Klaviyo, etc.) is configured in DashForDevs and pulled
// by the SDK — no per-tracker env vars here.
//  - dash.tracking.init()  → your configured analytics provider + pageviews
//  - dash.marketing.init() → Klaviyo onsite (when enabled in DashForDevs)
//  - ?RXC=<base64 path> inbound redirect (drops RXC, keeps other params)
//  - ?aflnk= / ?refrl= affiliate + referral capture into 30-day cookies
function setCookie(name: string, value: string, days: number) {
  const d = new Date(); d.setTime(d.getTime() + days * 864e5);
  document.cookie = name + "=" + encodeURIComponent(value) + ";expires=" + d.toUTCString() + ";path=/";
}

export function SiteInit() {
  const pathname = usePathname();

  useEffect(() => {
    // RXC inbound redirect.
    try {
      const u = new URL(window.location.href);
      const r = u.searchParams.get("RXC");
      if (r) {
        let path: string | null = null;
        try {
          let b = r.replace(/-/g, "+").replace(/_/g, "/");
          while (b.length % 4) b += "=";
          path = decodeURIComponent(escape(atob(b)));
        } catch { path = null; }
        u.searchParams.delete("RXC");
        if (path && path.charAt(0) === "/" && path.charAt(1) !== "/") {
          const merged = new URLSearchParams(path.includes("?") ? path.split("?")[1] : "");
          u.searchParams.forEach((v, k) => { if (!merged.has(k)) merged.append(k, v); });
          const base = path.split("?")[0];
          const qs = merged.toString();
          window.location.replace(base + (qs ? "?" + qs : ""));
          return;
        }
      }
    } catch {}

    // Affiliate + referral capture (read at checkout).
    try {
      const p = new URLSearchParams(window.location.search);
      const aflnk = p.get("aflnk");
      const refrl = p.get("refrl");
      if (aflnk) setCookie("aflnk", aflnk, 30);
      if (refrl) setCookie("refrl", refrl, 30);
    } catch {}

    // Trackers — config comes from DashForDevs.
    try { dash.tracking.init?.(); } catch {}
    try { dash.marketing.init?.(); } catch {}
  }, []);

  // Pageview on every route change.
  useEffect(() => {
    try { dash.tracking.notifyRouteChange?.(pathname); } catch {}
  }, [pathname]);

  return null;
}
`);

  // ─── Store config (welcome discount, free-shipping threshold, …) ──────────--
  add("hooks/useStoreConfig.ts", `"use client";
import { useEffect, useState } from "react";
import dash from "@/lib/dash";

export interface StoreConfig {
  initial_discount_amount: number;
  min_for_free_shipping: number | null;
  [key: string]: any;
}

const DEFAULT: StoreConfig = { initial_discount_amount: 10, min_for_free_shipping: null };

// Pulls global store settings from DashForDevs (discount %, free-shipping
// threshold, etc.). Configure these in the dashboard — not in code.
export function useStoreConfig() {
  const [config, setConfig] = useState<StoreConfig>(DEFAULT);
  useEffect(() => {
    dash.getGlobalData().then((data: any) => {
      const g = data?.global || {};
      setConfig({
        ...g,
        initial_discount_amount: g.initial_discount_amount != null ? parseFloat(g.initial_discount_amount) : DEFAULT.initial_discount_amount,
        min_for_free_shipping: g.min_for_free_shipping != null ? parseFloat(g.min_for_free_shipping) : null,
      });
    }).catch(() => {});
  }, []);
  return config;
}
`);

  // ─── Welcome discount modal (button trigger, no OTP) ─────────────────────--
  add("components/JoinDiscount.tsx", `"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Tag } from "lucide-react";
import { JoinDiscountModal } from "@/components/JoinDiscountModal";
import { useAuth } from "@/context/AuthContext";
import { useStoreConfig } from "@/hooks/useStoreConfig";

const HIDE_ON = ["/checkout", "/auth/login"];

export function JoinDiscount() {
  const { customer } = useAuth();
  const { initial_discount_amount } = useStoreConfig();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const discount = String(initial_discount_amount);
  if (customer || HIDE_ON.some((p) => pathname.startsWith(p))) return null;
  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Get a discount"
          className="fixed bottom-4 left-4 z-40 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-3 text-sm font-bold text-white shadow-lg hover:opacity-90">
          <Tag className="h-4 w-4" /> Want {discount}% Off?
        </button>
      )}
      <JoinDiscountModal active={open} close={() => setOpen(false)} discount={discount} />
    </>
  );
}
`);

  add("components/JoinDiscountModal.tsx", `"use client";
import { useState } from "react";
import { X, Mail } from "lucide-react";
import dash from "@/lib/dash";

// No OTP — captures the email straight into the marketing provider (Klaviyo).
export function JoinDiscountModal({ active, close, discount }: { active: boolean; close: () => void; discount: string }) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!active) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <button onClick={close} aria-label="Close" className="absolute right-3 top-3 text-gray-400 hover:text-black"><X className="h-5 w-5" /></button>
        {done ? (
          <div className="text-center">
            <h2 className="text-2xl font-bold">You&apos;re in!</h2>
            <p className="mt-2 text-gray-500">Your {discount}% discount is unlocked at checkout.</p>
          </div>
        ) : (
          <form onSubmit={async (e) => { e.preventDefault();
            if (!/\\S+@\\S+\\.\\S+/.test(email)) return; setBusy(true);
            try { await dash.email.identify({ email: email.trim(), properties: { source: "welcome_modal" } }); } catch {}
            try { localStorage.setItem("marketing_email", email.trim()); } catch {}
            setBusy(false); setDone(true); }}>
            <h2 className="text-2xl font-bold">Get {discount}% Off</h2>
            <p className="mt-1 text-sm text-gray-500">Join our list for exclusive deals.</p>
            <div className="relative mt-4">
              <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
                className="w-full rounded-lg border py-3 pl-10 pr-3" />
            </div>
            <button disabled={busy} className="mt-4 w-full rounded-lg bg-[var(--accent)] py-3 font-medium text-white disabled:opacity-50">
              {busy ? "…" : "Claim Discount"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
`);

  add("context/AuthContext.tsx", `"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import dash from "@/lib/dash";

interface Customer { id: string; email: string; first_name?: string; last_name?: string; }
interface AuthCtx {
  customer: Customer | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);
const TOKEN = "devdash_access_token";
const REFRESH = "devdash_refresh_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem(TOKEN);
    if (!t) { setLoading(false); return; }
    dash.auth.setToken(t, localStorage.getItem(REFRESH));
    dash.auth.getProfile()
      .then((r: any) => setCustomer(r.customer))
      .catch(() => { localStorage.removeItem(TOKEN); localStorage.removeItem(REFRESH); })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r: any = await dash.auth.login({ email, password });
    localStorage.setItem(TOKEN, r.access_token);
    if (r.refresh_token) localStorage.setItem(REFRESH, r.refresh_token);
    setCustomer(r.customer);
  }, []);

  const logout = useCallback(async () => {
    try { await dash.auth.logout(); } catch {}
    localStorage.removeItem(TOKEN); localStorage.removeItem(REFRESH);
    setCustomer(null);
  }, []);

  return <Ctx.Provider value={{ customer, loading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
`);

  add("context/CartContext.tsx", `"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import dash from "@/lib/dash";

interface CartCtx {
  cart: any | null;
  count: number;
  open: boolean;
  setOpen: (o: boolean) => void;
  add: (productId: string, sizeId: string, qty?: number) => Promise<void>;
  remove: (sizeId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<CartCtx | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<any | null>(null);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    try { const r: any = await dash.cart.get(); setCart(r.cart ?? r); } catch {}
  }, []);

  useEffect(() => { dash.cart.init?.().then(refresh).catch(() => refresh()); }, [refresh]);

  const add = useCallback(async (productId: string, sizeId: string, qty = 1) => {
    await dash.cart.add({ productId, sizeId, quantity: qty });
    await refresh();
    setOpen(true);
  }, [refresh]);

  const remove = useCallback(async (sizeId: string) => {
    await dash.cart.remove(sizeId);
    await refresh();
  }, [refresh]);

  const count = (cart?.items || []).reduce((n: number, i: any) => n + (i.quantity || 0), 0);

  return <Ctx.Provider value={{ cart, count, open, setOpen, add, remove, refresh }}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart must be used within CartProvider");
  return c;
}
`);

  // ─── DashImage (CdnImage) ─────────────────────────────────────────────────
  add("components/ui/DashImage.tsx", `"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";

type Variant = { width: number; url: string };

// Serves images straight from the DO CDN with a responsive webp srcset (when
// pre-generated variants are supplied) + a blur-up placeholder — no /_next proxy.
export default function DashImage({
  src, alt = "", fill, width, height, sizes, className, style, variants, lqip,
}: {
  src?: string | null; alt?: string; fill?: boolean; width?: number; height?: number;
  sizes?: string; className?: string; style?: CSSProperties;
  variants?: Variant[] | null; lqip?: string | null;
}) {
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => { if (ref.current?.complete) setLoaded(true); }, []);
  if (!src) return null;

  const sorted = (variants ?? []).filter((v) => v?.url && v?.width).sort((a, b) => a.width - b.width);
  const srcSet = sorted.length ? sorted.map((v) => \`\${v.url} \${v.width}w\`).join(", ") : undefined;
  const primary = sorted.length ? (sorted.find((v) => v.width >= 1024) ?? sorted[sorted.length - 1]).url : src;
  const blur = !loaded ? lqip : null;
  const merged: CSSProperties = {
    ...(blur ? { backgroundImage: \`url("\${blur}")\`, backgroundSize: "cover", backgroundPosition: "center" } : {}),
    ...(fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : {}),
    ...style,
  };
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} src={primary} srcSet={srcSet} sizes={sizes} alt={alt}
      width={fill ? undefined : width} height={fill ? undefined : height}
      loading="lazy" decoding="async" onLoad={() => setLoaded(true)} onError={() => setLoaded(true)}
      className={className} style={merged} />
  );
}
`);

  // ─── DashVideo: CDN renditions + poster blur-up, connection-aware ─────────--
  add("components/ui/DashVideo.tsx", `"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";

interface Rendition { height: number; url: string; }
export interface VideoData {
  url?: string; ready?: boolean; poster?: string | null; poster_lqip?: string | null; renditions?: Rendition[] | null;
}

// Plays transcoded renditions straight from the CDN. Shows the poster (blurred
// from poster_lqip) first, then loads the rendition that fits the viewer's
// connection — low res on slow networks, 1080p on fast. Pass the media item's
// \`video_data\` (from dash.media.getByName(...).file.video_data).
export default function DashVideo({
  data, className, style, autoPlay = true, loop = true, muted = true, controls = false,
}: {
  data?: VideoData | null; className?: string; style?: CSSProperties;
  autoPlay?: boolean; loop?: boolean; muted?: boolean; controls?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    const rends = (data?.renditions || []).slice().sort((a, b) => a.height - b.height);
    if (!rends.length) { setSrc(data?.url || undefined); return; }
    const eff = (navigator as any)?.connection?.effectiveType || "4g";
    const target = eff === "4g" ? 1080 : eff === "3g" ? 720 : 640;
    const pick = rends.find((r) => r.height >= target) || rends[rends.length - 1];
    setSrc(pick.url);
  }, [data]);

  if (!data?.url && !src) return null;
  const lqip = data?.poster_lqip || undefined;

  return (
    <div className={className} style={{ position: "relative", overflow: "hidden", ...style }}>
      {lqip && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={lqip} alt="" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "blur(12px)", transform: "scale(1.05)" }} />
      )}
      <video
        ref={ref}
        src={src || data?.url || undefined}
        poster={data?.poster || undefined}
        autoPlay={autoPlay}
        loop={loop}
        muted={muted}
        controls={controls}
        playsInline
        preload="metadata"
        style={{ position: "relative", width: "100%", height: "100%", objectFit: "cover" }}
      />
    </div>
  );
}
`);

  add("components/ProductCard.tsx", `import Link from "next/link";
import DashImage from "@/components/ui/DashImage";
import { money } from "@/lib/utils";

export function ProductCard({ product }: { product: any }) {
  const img = product.main_image_data?.url || product.main_image || product.display_image;
  const variants = product.main_image_data?.variants?.webp ?? null;
  const lqip = product.main_image_data?.lqip ?? null;
  const cat = product.category?.slug || "all";
  const price = product.price_range?.min ?? product.price;
  return (
    <Link href={\`/products/\${cat}/\${product.slug}\`} className="group block">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-gray-100">
        <DashImage src={img} alt={product.name} fill variants={variants} lqip={lqip}
          sizes="(min-width:768px) 25vw, 50vw"
          className="object-cover transition-transform duration-300 group-hover:scale-105" />
      </div>
      <h3 className="mt-2 text-sm font-medium line-clamp-1">{product.name}</h3>
      {price != null && <p className="text-sm text-gray-500">{money(price)}</p>}
    </Link>
  );
}
`);

  // ─── Navbar / Footer / CartSidebar ────────────────────────────────────────
  add("components/Navbar.tsx", `"use client";
import Link from "next/link";
import { ShoppingBag, User } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { NAME } from "@/lib/consts";

export function Navbar() {
  const { count, setOpen } = useCart();
  return (
    <header className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold">{NAME}</Link>
        <div className="flex items-center gap-5 text-sm">
          <Link href="/products" className="hover:text-[var(--accent)]">Shop</Link>
          <Link href="/about" className="hidden sm:block hover:text-[var(--accent)]">About</Link>
          <Link href="/contact" className="hidden sm:block hover:text-[var(--accent)]">Contact</Link>
          <Link href="/auth/account" aria-label="Account"><User className="h-5 w-5" /></Link>
          <button onClick={() => setOpen(true)} aria-label="Cart" className="relative">
            <ShoppingBag className="h-5 w-5" />
            {count > 0 && <span className="absolute -right-2 -top-2 rounded-full bg-[var(--accent)] px-1.5 text-xs text-white">{count}</span>}
          </button>
        </div>
      </nav>
    </header>
  );
}
`);

  add("components/Footer.tsx", `import Link from "next/link";
import { NAME } from "@/lib/consts";

export function Footer() {
  return (
    <footer className="border-t mt-16">
      <div className="mx-auto max-w-7xl px-4 py-10 text-sm text-gray-500 flex flex-col sm:flex-row justify-between gap-4">
        <p>&copy; {new Date().getFullYear()} {NAME}</p>
        <div className="flex gap-4">
          <Link href="/reviews">Reviews</Link>
          <Link href="/legal">Legal</Link>
          <Link href="/contact">Contact</Link>
        </div>
      </div>
    </footer>
  );
}
`);

  add("components/CartSidebar.tsx", `"use client";
import Link from "next/link";
import { X } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { money } from "@/lib/utils";

export function CartSidebar() {
  const { cart, open, setOpen, remove } = useCart();
  const items = cart?.items || [];
  return (
    <div className={\`fixed inset-0 z-50 \${open ? "" : "pointer-events-none"}\`}>
      <div onClick={() => setOpen(false)}
        className={\`absolute inset-0 bg-black/40 transition-opacity \${open ? "opacity-100" : "opacity-0"}\`} />
      <aside className={\`absolute right-0 top-0 h-full w-full max-w-sm bg-white shadow-xl transition-transform \${open ? "translate-x-0" : "translate-x-full"}\`}>
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="font-semibold">Your Cart</h2>
          <button onClick={() => setOpen(false)} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {items.length === 0 && <p className="text-sm text-gray-500">Your cart is empty.</p>}
          {items.map((it: any) => (
            <div key={it.size_id || it.id} className="flex justify-between gap-3 text-sm">
              <div>
                <p className="font-medium">{it.product_name}</p>
                <p className="text-gray-500">{it.size_label} &middot; Qty {it.quantity}</p>
              </div>
              <div className="text-right">
                <p>{money(it.unit_price)}</p>
                <button onClick={() => remove(it.size_id)} className="text-xs text-red-500">Remove</button>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t p-4">
          <div className="mb-3 flex justify-between font-semibold">
            <span>Subtotal</span><span>{money(cart?.subtotal)}</span>
          </div>
          <Link href="/checkout" onClick={() => setOpen(false)}
            className="block rounded-lg bg-[var(--accent)] py-3 text-center font-medium text-white">
            Checkout
          </Link>
        </div>
      </aside>
    </div>
  );
}
`);

  // ─── Pages ────────────────────────────────────────────────────────────────
  // Home page. A freshly-initialized site (welcome:true — what the AI builder's
  // "Initialize Project" ships) gets a branded, server-rendered "setup complete"
  // splash. Manual CLI scaffolds get the storefront home that lists products.
  const STOREFRONT_HOME = `import Link from "next/link";
import dash from "@/lib/dash";
import { ProductCard } from "@/components/ProductCard";
import { NAME } from "@/lib/consts";

export default async function HomePage() {
  let products: any[] = [];
  try { const r: any = await dash.products.list({ limit: 8, expand: true }); products = r.products || []; } catch {}
  return (
    <div>
      <section className="mx-auto max-w-7xl px-4 py-20 text-center">
        <h1 className="text-4xl font-bold sm:text-6xl">{NAME}</h1>
        <p className="mt-4 text-gray-500">Quality products, shipped fast.</p>
        <Link href="/products" className="mt-8 inline-block rounded-full bg-[var(--accent)] px-6 py-3 font-medium text-white">Shop Now</Link>
      </section>
      <section className="mx-auto max-w-7xl px-4 pb-16">
        <h2 className="mb-6 text-2xl font-bold">Featured</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {products.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>
    </div>
  );
}
`;

  // Server-rendered on purpose: the splash itself demonstrates the SEO pitch.
  const WELCOME_HOME = `import Link from "next/link";
import { NAME } from "@/lib/consts";

export const metadata = { title: "Setup complete" };

export default function HomePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-20">
      <div className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium text-gray-500">
          <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
          Powered by DashForDevs
        </span>
        <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">Project setup complete</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-gray-500">
          {NAME} is live. This is your starting point — open the builder and tell Betty what to
          change. She edits the code and publishes it for you.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/products" className="rounded-full bg-[var(--accent)] px-6 py-3 font-medium text-white">View store</Link>
          <a href="https://dashfordevs.com" className="rounded-full border px-6 py-3 font-medium">Learn more</a>
        </div>
      </div>

      <div className="mt-20">
        <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-gray-400">
          Why this beats the other AI site builders
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border p-6">
            <h3 className="font-semibold">Real SEO, not a blank shell</h3>
            <p className="mt-2 text-sm text-gray-500">
              Tools like Lovable ship client-rendered React — search engines first see an empty
              page and the content loads later, so you rank poorly. Your site is server-rendered
              with Next.js: Google gets the full page on the first request. You show up.
            </p>
          </div>
          <div className="rounded-2xl border p-6">
            <h3 className="font-semibold">Batteries included</h3>
            <p className="mt-2 text-sm text-gray-500">
              Products, cart, checkout, customer accounts, analytics and tracing are already wired
              through the DashForDevs SDK. No plumbing — just build.
            </p>
          </div>
          <div className="rounded-2xl border p-6">
            <h3 className="font-semibold">Edit by chatting</h3>
            <p className="mt-2 text-sm text-gray-500">
              Describe what you want — &quot;make the hero green&quot;, &quot;add a wholesale page&quot; — and
              Betty changes the code and ships it. No deploys to manage.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
`;

  add("app/page.tsx", welcome ? WELCOME_HOME : STOREFRONT_HOME);

  add("app/about/page.tsx", `import { NAME } from "@/lib/consts";
export const metadata = { title: "About" };
export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 prose">
      <h1 className="text-3xl font-bold">About {NAME}</h1>
      <p className="mt-4 text-gray-600">Tell your story here. Edit <code>app/about/page.tsx</code>.</p>
    </div>
  );
}
`);

  add("app/products/page.tsx", `import dash from "@/lib/dash";
import { ProductCard } from "@/components/ProductCard";
export const metadata = { title: "Shop" };
export default async function ProductsPage() {
  let products: any[] = [];
  try { const r: any = await dash.products.list({ limit: 48, expand: true }); products = r.products || []; } catch {}
  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold">All Products</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {products.map((p) => <ProductCard key={p.id} product={p} />)}
        {products.length === 0 && <p className="text-gray-500">No products yet.</p>}
      </div>
    </div>
  );
}
`);

  add("app/products/[category]/page.tsx", `import dash from "@/lib/dash";
import { ProductCard } from "@/components/ProductCard";

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  let products: any[] = [];
  try { const r: any = await dash.products.list({ category, limit: 48, expand: true }); products = r.products || []; } catch {}
  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold capitalize">{category.replace(/-/g, " ")}</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {products.map((p) => <ProductCard key={p.id} product={p} />)}
        {products.length === 0 && <p className="text-gray-500">No products in this category.</p>}
      </div>
    </div>
  );
}
`);

  add("app/products/[category]/[slug]/page.tsx", `import dash from "@/lib/dash";
import { AddToCart } from "./AddToCart";
import DashImage from "@/components/ui/DashImage";
import { money } from "@/lib/utils";
import { notFound } from "next/navigation";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let product: any = null;
  try { const r: any = await dash.products.get(slug); product = r.product || r; } catch {}
  if (!product) notFound();
  const img = product.main_image_data?.url || product.main_image;
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-2">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-gray-100">
        <DashImage src={img} alt={product.name} fill
          variants={product.main_image_data?.variants?.webp ?? null}
          lqip={product.main_image_data?.lqip ?? null} sizes="(min-width:768px) 50vw, 100vw" className="object-cover" />
      </div>
      <div>
        <h1 className="text-3xl font-bold">{product.name}</h1>
        {product.price_range?.min != null && <p className="mt-2 text-xl">{money(product.price_range.min)}</p>}
        {product.description && <div className="mt-4 text-gray-600" dangerouslySetInnerHTML={{ __html: product.description }} />}
        <AddToCart slug={slug} productId={product.id} />
      </div>
    </div>
  );
}
`);

  add("app/products/[category]/[slug]/AddToCart.tsx", `"use client";
import { useEffect, useState } from "react";
import dash from "@/lib/dash";
import { useCart } from "@/context/CartContext";

export function AddToCart({ slug, productId }: { slug: string; productId: string }) {
  const { add } = useCart();
  const [options, setOptions] = useState<any>(null);
  const [sizeId, setSizeId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    dash.products.getOptions(slug).then((r: any) => {
      setOptions(r.options);
      const first = r.options?.sizes?.[0] || r.options?.variations?.[0]?.sizes?.[0];
      if (first) setSizeId(first.id);
    }).catch(() => {});
  }, [slug]);

  const sizes = options?.sizes || options?.variations?.flatMap((v: any) => v.sizes || []) || [];

  return (
    <div className="mt-6 space-y-3">
      {sizes.length > 1 && (
        <select value={sizeId} onChange={(e) => setSizeId(e.target.value)} className="w-full rounded-lg border p-2">
          {sizes.map((s: any) => <option key={s.id} value={s.id}>{s.label} — \${s.price}</option>)}
        </select>
      )}
      <button
        disabled={!sizeId || busy}
        onClick={async () => { setBusy(true); try { await add(productId, sizeId); } finally { setBusy(false); } }}
        className="w-full rounded-lg bg-[var(--accent)] py-3 font-medium text-white disabled:opacity-50">
        {busy ? "Adding…" : "Add to Cart"}
      </button>
    </div>
  );
}
`);

  add("app/cart/page.tsx", `"use client";
import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { money } from "@/lib/utils";

export default function CartPage() {
  const { cart, remove } = useCart();
  const items = cart?.items || [];
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold">Cart</h1>
      {items.length === 0 ? <p className="text-gray-500">Your cart is empty.</p> : (
        <div className="space-y-4">
          {items.map((it: any) => (
            <div key={it.size_id} className="flex justify-between border-b pb-3">
              <div><p className="font-medium">{it.product_name}</p><p className="text-sm text-gray-500">{it.size_label} &middot; Qty {it.quantity}</p></div>
              <div className="text-right"><p>{money(it.unit_price)}</p><button onClick={() => remove(it.size_id)} className="text-xs text-red-500">Remove</button></div>
            </div>
          ))}
          <div className="flex justify-between pt-2 font-semibold"><span>Subtotal</span><span>{money(cart?.subtotal)}</span></div>
          <Link href="/checkout" className="block rounded-lg bg-[var(--accent)] py-3 text-center font-medium text-white">Checkout</Link>
        </div>
      )}
    </div>
  );
}
`);

  add("app/checkout/page.tsx", `"use client";
import { useState } from "react";
import { useCart } from "@/context/CartContext";
import { money } from "@/lib/utils";

// Minimal single-page checkout starter. Wire dash.checkout.start / .complete +
// dash.payment + dash.shipping here for a full flow.
export default function CheckoutPage() {
  const { cart } = useCart();
  const [email, setEmail] = useState("");
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold">Checkout</h1>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
        className="mb-4 w-full rounded-lg border p-3" />
      <div className="mb-4 flex justify-between font-semibold"><span>Total</span><span>{money(cart?.total ?? cart?.subtotal)}</span></div>
      <button className="w-full rounded-lg bg-[var(--accent)] py-3 font-medium text-white">Place Order</button>
      <p className="mt-3 text-xs text-gray-400">Starter checkout — connect dash.checkout / dash.payment to finish.</p>
    </div>
  );
}
`);

  add("app/auth/login/page.tsx", `"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-6 text-2xl font-bold">Sign in</h1>
      <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setError("");
        try { await login(email, password); router.push("/auth/account"); }
        catch (err: any) { setError(err.message || "Login failed"); } finally { setBusy(false); } }}
        className="space-y-3">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full rounded-lg border p-3" />
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="w-full rounded-lg border p-3" />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-[var(--accent)] py-3 font-medium text-white disabled:opacity-50">{busy ? "…" : "Sign in"}</button>
      </form>
    </div>
  );
}
`);

  add("app/auth/account/page.tsx", `"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import dash from "@/lib/dash";
import { useAuth } from "@/context/AuthContext";

export default function AccountPage() {
  const { customer, loading, logout } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [form, setForm] = useState({ first_name: "", last_name: "", phone: "" });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!customer) return;
    dash.auth.getProfile().then((r: any) => {
      const c = r.customer || {};
      setProfile(c);
      setForm({ first_name: c.first_name || "", last_name: c.last_name || "", phone: c.phone || "" });
    }).catch(() => {});
  }, [customer]);

  if (loading) return <div className="mx-auto max-w-2xl px-4 py-16">Loading…</div>;
  if (!customer) return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <p>Please <Link href="/auth/login" className="text-[var(--accent)] underline">sign in</Link>.</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Account</h1>
        <button onClick={logout} className="text-sm text-gray-500 hover:text-black">Sign out</button>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <Link href="/auth/account/orders" className="rounded-lg border px-4 py-2">My Orders</Link>
        <Link href="/auth/account/affiliates" className="rounded-lg border px-4 py-2">Affiliate Program</Link>
        {profile?.points != null && (
          <span className="rounded-lg bg-[var(--accent)]/10 px-4 py-2 text-[var(--accent)] font-medium">{profile.points} points</span>
        )}
      </div>

      <h2 className="mt-10 text-lg font-semibold">Account details</h2>
      <form className="mt-3 space-y-3"
        onSubmit={async (e) => { e.preventDefault(); setBusy(true); setSaved(false);
          try { await dash.auth.updateProfile(form); setSaved(true); } finally { setBusy(false); } }}>
        <div className="grid grid-cols-2 gap-3">
          <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} placeholder="First name" className="rounded-lg border p-3" />
          <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} placeholder="Last name" className="rounded-lg border p-3" />
        </div>
        <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className="w-full rounded-lg border p-3" />
        <input value={profile?.email || customer.email} disabled className="w-full rounded-lg border bg-gray-50 p-3 text-gray-500" />
        <button disabled={busy} className="rounded-lg bg-[var(--accent)] px-5 py-3 font-medium text-white disabled:opacity-50">{busy ? "Saving…" : "Save changes"}</button>
        {saved && <span className="ml-3 text-sm text-green-600">Saved!</span>}
      </form>
    </div>
  );
}
`);

  add("app/auth/account/affiliates/page.tsx", `"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import dash from "@/lib/dash";
import { useAuth } from "@/context/AuthContext";

export default function AffiliatesPage() {
  const { customer, loading } = useAuth();
  const [status, setStatus] = useState<any>(null);
  const [dashboard, setDashboard] = useState<any>(null);
  const [applied, setApplied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!customer) return;
    dash.affiliates.getMyStatus().then((r: any) => {
      setStatus(r);
      if (r?.is_affiliate) dash.affiliates.getMyDashboard().then(setDashboard).catch(() => {});
    }).catch(() => {});
  }, [customer]);

  if (loading) return <div className="mx-auto max-w-2xl px-4 py-16">Loading…</div>;
  if (!customer) return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <p>Please <Link href="/auth/login" className="text-[var(--accent)] underline">sign in</Link> to access the affiliate program.</p>
    </div>
  );

  const isAffiliate = status?.is_affiliate;

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <Link href="/auth/account" className="text-sm text-gray-500">&larr; Account</Link>
      <h1 className="mt-2 text-2xl font-bold">Affiliate Program</h1>

      {isAffiliate ? (
        <div className="mt-6 space-y-4">
          <p className="text-green-600 font-medium">You&apos;re an affiliate 🎉</p>
          {dashboard?.referral_link && (
            <div>
              <label className="text-sm text-gray-500">Your referral link</label>
              <input readOnly value={dashboard.referral_link} className="mt-1 w-full rounded-lg border bg-gray-50 p-3 text-sm" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border p-4"><p className="text-xs text-gray-500">Total earned</p><p className="text-xl font-bold">{dashboard?.total_earned ?? "—"}</p></div>
            <div className="rounded-lg border p-4"><p className="text-xs text-gray-500">Orders</p><p className="text-xl font-bold">{dashboard?.total_orders ?? "—"}</p></div>
          </div>
        </div>
      ) : applied ? (
        <p className="mt-6 text-green-600">Application submitted — we&apos;ll be in touch!</p>
      ) : (
        <form className="mt-6 space-y-3"
          onSubmit={async (e) => { e.preventDefault(); setBusy(true);
            try { await dash.affiliates.apply({ email: customer.email }); setApplied(true); } catch {} finally { setBusy(false); } }}>
          <p className="text-gray-600">Join our affiliate program and earn on every referral.</p>
          <button disabled={busy} className="rounded-lg bg-[var(--accent)] px-5 py-3 font-medium text-white disabled:opacity-50">{busy ? "…" : "Apply to become an affiliate"}</button>
        </form>
      )}
    </div>
  );
}
`);

  add("app/auth/account/orders/page.tsx", `"use client";
import { useEffect, useState } from "react";
import dash from "@/lib/dash";
import { useAuth } from "@/context/AuthContext";
import { money } from "@/lib/utils";

export default function OrdersPage() {
  const { customer, loading } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  useEffect(() => { if (customer) dash.auth.getOrders().then((r: any) => setOrders(r.orders || [])).catch(() => {}); }, [customer]);
  if (loading) return <div className="mx-auto max-w-2xl px-4 py-16">Loading…</div>;
  if (!customer) return <div className="mx-auto max-w-2xl px-4 py-16">Please sign in.</div>;
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="mb-6 text-2xl font-bold">My Orders</h1>
      {orders.length === 0 && <p className="text-gray-500">No orders yet.</p>}
      {orders.map((o) => (
        <div key={o.id} className="flex justify-between border-b py-3">
          <span>#{o.order_number}</span><span className="capitalize">{o.status}</span><span>{money(o.total)}</span>
        </div>
      ))}
    </div>
  );
}
`);

  add("app/contact/page.tsx", `export const metadata = { title: "Contact" };
export default function ContactPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <h1 className="mb-6 text-2xl font-bold">Contact Us</h1>
      <form className="space-y-3">
        <input placeholder="Name" className="w-full rounded-lg border p-3" />
        <input type="email" placeholder="Email" className="w-full rounded-lg border p-3" />
        <textarea placeholder="Message" rows={5} className="w-full rounded-lg border p-3" />
        <button className="rounded-lg bg-[var(--accent)] px-5 py-3 font-medium text-white">Send</button>
      </form>
    </div>
  );
}
`);

  add("app/reviews/page.tsx", `export const metadata = { title: "Reviews" };
export default function ReviewsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="mb-6 text-2xl font-bold">Reviews</h1>
      <p className="text-gray-500">Customer reviews will appear here. Wire dash.products.getReviews().</p>
    </div>
  );
}
`);

  add("app/legal/page.tsx", `import Link from "next/link";
export const metadata = { title: "Legal" };
export default function LegalPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="mb-6 text-2xl font-bold">Legal</h1>
      <ul className="space-y-2 text-[var(--accent)] underline">
        <li><Link href="/legal/terms">Terms of Service</Link></li>
        <li><Link href="/legal/privacy">Privacy Policy</Link></li>
        <li><Link href="/legal/shipping">Shipping Policy</Link></li>
      </ul>
    </div>
  );
}
`);

  add("app/legal/[slug]/page.tsx", `export default async function LegalDocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="mb-6 text-2xl font-bold capitalize">{slug.replace(/-/g, " ")}</h1>
      <p className="text-gray-500">Edit <code>app/legal/[slug]/page.tsx</code> or load from dash.legal.</p>
    </div>
  );
}
`);

  add("README.md", `# ${safeName}

Headless storefront scaffolded with **dash4devs init** (DashForDevs).

## Develop
\`\`\`bash
npm install
npm run dev
\`\`\`

Keys live in \`.env.local\`. Pages are in \`app/\`, shared UI in \`components/\`,
SDK client in \`lib/dash.ts\`. Images use \`components/ui/DashImage.tsx\` (webp + blur-up).
`);

  return files;
}

/**
 * The "Stop" warning in the browser console against self-XSS, the same one
 * the DashForDevs dashboard prints. Localhost is skipped by default.
 *
 *   // Next.js root layout, first thing in <head> or <body>:
 *   import { consoleWarningScript } from "dash4devs/security"
 *   <script dangerouslySetInnerHTML={{ __html: consoleWarningScript() }} />
 *
 *   // Or from client code:
 *   import { printConsoleWarning } from "dash4devs/security"
 *   printConsoleWarning()
 *
 * v2 also exports the secret-key guards the client uses, so server code can
 * check a key before it ever reaches a bundle (`assertServerOnlyKey`).
 */

export interface ConsoleWarningOptions {
  /** Big red first line. Default "Stop". */
  title?: string;
  heading?: string;
  body?: string;
  /** CSS color for the title and heading. Default #c1341f. */
  color?: string;
  /** Stay quiet on localhost / 127.0.0.1 / *.localhost. Default true. */
  skipLocalhost?: boolean;
}

export const DEFAULT_CONSOLE_WARNING: { title: string; heading: string; body: string; color: string } = {
  title: "Stop",
  heading: "This console is for developers.",
  body:
    "If someone told you to copy and paste something here, they are trying to " +
    "take over your account. Pasting it can give them your orders, your customers " +
    "and their addresses, and the ability to act as you.\n\n" +
    "Do not paste anything into this window unless you wrote it and you understand " +
    "exactly what it does.",
  color: "#c1341f",
};

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

function resolve(options: ConsoleWarningOptions = {}) {
  return {
    ...DEFAULT_CONSOLE_WARNING,
    ...options,
    skipLocalhost: options.skipLocalhost !== false,
  };
}

/** Print the warning now (browser only; skipped on localhost unless skipLocalhost: false). */
export function printConsoleWarning(options: ConsoleWarningOptions = {}): boolean {
  if (typeof window === "undefined" || typeof console === "undefined") return false;
  (window as any).__dash4devsConsoleWarned = true;
  const o = resolve(options);
  try {
    const host = window.location.hostname;
    if (o.skipLocalhost && (LOCAL_HOSTS.includes(host) || host.endsWith(".localhost"))) return false;
    console.log(`%c${o.title}`, `color:${o.color};font-size:44px;font-weight:800;-webkit-text-stroke:1px #000`);
    console.log(`%c${o.heading}`, `color:${o.color};font-size:18px;font-weight:700`);
    console.log(`%c${o.body}`, "color:inherit;font-size:14px;line-height:1.5");
    return true;
  } catch {
    return false;
  }
}

/** The same warning as inline script source (no <script> tags), for server-rendered pages. */
export function consoleWarningScript(options: ConsoleWarningOptions = {}): string {
  const o = resolve(options);
  const lit = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");
  return (
    "(function(){try{window.__dash4devsConsoleWarned=true;" +
    `var h=location.hostname;if(${o.skipLocalhost ? "true" : "false"}&&(${lit(LOCAL_HOSTS)}.indexOf(h)>-1||/\\.localhost$/.test(h)))return;` +
    `console.log("%c"+${lit(o.title)},${lit(`color:${o.color};font-size:44px;font-weight:800;-webkit-text-stroke:1px #000`)});` +
    `console.log("%c"+${lit(o.heading)},${lit(`color:${o.color};font-size:18px;font-weight:700`)});` +
    `console.log("%c"+${lit(o.body)},"color:inherit;font-size:14px;line-height:1.5");` +
    "}catch(e){}})();"
  );
}

// ---------------------------------------------------------------------------
// Secret keys stay on the server
// ---------------------------------------------------------------------------

export const isSecretKey = (key: unknown): boolean => typeof key === "string" && key.startsWith("sk_");
export const isPublicKey = (key: unknown): boolean => typeof key === "string" && key.startsWith("pk_");

/** Mask a key for logs: `sk_live_****abcd`. */
export function maskKey(key: string): string {
  if (!key || key.length < 8) return key ? "****" : "";
  const prefix = key.slice(0, key.indexOf("_", 3) + 1);
  return `${prefix}${"*".repeat(Math.max(0, key.length - prefix.length - 4))}${key.slice(-4)}`;
}

/**
 * Names of NEXT_PUBLIC_* variables that hold a secret key. Next.js inlines
 * every NEXT_PUBLIC_* value into the browser bundle, so any hit here is a
 * leaked key. Values are never returned.
 */
export function findPublicSecretKeyVars(env: Record<string, string | undefined> | undefined = undefined): string[] {
  let source: Record<string, string | undefined> = {};
  try {
    source = env || (typeof process !== "undefined" && process.env ? (process.env as any) : {});
  } catch {
    source = {};
  }
  const hits: string[] = [];
  for (const [k, v] of Object.entries(source)) {
    if (k.startsWith("NEXT_PUBLIC_") && typeof v === "string" && /^sk_(live|test)_/.test(v)) hits.push(k);
  }
  return hits;
}

/**
 * Throw when called in a browser. Use at the top of server-only modules that
 * build an sk_ client:  `assertServerOnlyKey(process.env.DEVDASH_SECRET_KEY)`.
 */
export function assertServerOnlyKey(key: string | undefined): void {
  if (isSecretKey(key) && typeof window !== "undefined") {
    throw new Error(
      "dash4devs: a SECRET key (sk_*) reached browser code. Secret keys belong in server-only " +
        "modules (route handlers, server components, server actions). Use the PUBLIC key (pk_*) in the browser " +
        "and rotate this key in Settings > API > Keys if it was ever shipped."
    );
  }
}

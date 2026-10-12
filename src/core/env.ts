/**
 * Runtime environment probes. Every check is guarded so the SDK can be
 * imported in Node, the browser, edge runtimes and React Server Components
 * without touching a global that does not exist there.
 */

export const isBrowser = (): boolean =>
  typeof window !== "undefined" && typeof document !== "undefined";

export const isServer = (): boolean => !isBrowser();

/**
 * Read an environment variable on the server, or a value Next.js inlined at
 * build time on the client.
 *
 * Next.js only inlines `process.env.NEXT_PUBLIC_*` when the member expression
 * is written out literally, so the public names are read one by one in
 * `config.ts` rather than through this helper. This one is for server-side
 * names, read dynamically.
 */
export function readEnv(name: string): string | undefined {
  try {
    if (typeof process === "undefined" || !process.env) return undefined;
    const value = process.env[name];
    return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}

export const isProductionBuild = (): boolean => {
  try {
    return typeof process !== "undefined" && process.env?.NODE_ENV === "production";
  } catch {
    return false;
  }
};

/** sessionStorage / localStorage access that never throws (Safari private mode, sandboxed iframes). */
export function safeStorage(kind: "local" | "session"): Storage | null {
  if (!isBrowser()) return null;
  try {
    const store = kind === "local" ? window.localStorage : window.sessionStorage;
    const probe = "__dash4devs_probe__";
    store.setItem(probe, "1");
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

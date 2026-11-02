/**
 * CLI config loader.
 *
 * Precedence (highest wins):
 *   1. process.env
 *   2. .env.local in cwd
 *   3. .env in cwd
 *
 * Not using dotenv to keep zero-dependency-at-runtime for this file;
 * the SDK already ships with minimal deps.
 */

import fs from "node:fs";
import path from "node:path";

// The CLI, like the SDK, talks only to papi (see src/core/config.ts). The old
// host in a store's .env is rewritten; a localhost URL is kept for a local papi.
const DEFAULT_API = "https://papi.dashfordevs.com";
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|.+\.localhost)$/i;

function toPapi(url) {
  if (!url) return DEFAULT_API;
  let parsed;
  try {
    parsed = new URL(String(url).trim());
  } catch {
    return DEFAULT_API;
  }
  if (LOCAL_HOST.test(parsed.hostname)) return parsed.origin + parsed.pathname.replace(/\/+$/, "");
  if (!/^(papi|api)\.dashfordevs\.com$/i.test(parsed.hostname)) {
    console.warn(`dash4devs: ${parsed.host} is not papi; using ${DEFAULT_API}.`);
  }
  return DEFAULT_API;
}

function parseEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

export function loadConfig() {
  const cwd = process.cwd();
  const fromEnv = parseEnvFile(path.join(cwd, ".env"));
  const fromLocal = parseEnvFile(path.join(cwd, ".env.local"));
  const merged = { ...fromEnv, ...fromLocal, ...process.env };

  // Prefer the storefront's own secret-key var (DEVDASH_SECRET_KEY, as written
  // by `dash4devs init` and used by lib/dash.ts). DASH4DEVS_API_KEY is kept as
  // a legacy fallback.
  const apiKey = merged.DEVDASH_SECRET_KEY || merged.DASH4DEVS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "No secret key found. Add DEVDASH_SECRET_KEY=sk_... to .env.local (from your DashForDevs org's API settings)."
    );
  }
  if (!apiKey.startsWith("sk_")) {
    throw new Error("Secret key must start with sk_. Public pk_ keys cannot build/deploy.");
  }

  return {
    apiKey,
    // Same order as v1, then the v2 target switch: an explicit URL wins over a target.
    apiUrl: toPapi(
      merged.NEXT_PUBLIC_DEVDASH_API_URL || merged.DASH4DEVS_API_URL || merged.NEXT_PUBLIC_DASH4DEVS_API_URL
    ),
    cwd,
    buildDir: merged.DASH4DEVS_BUILD_DIR || ".next",
    publicDir: merged.DASH4DEVS_PUBLIC_DIR || "public",
  };
}

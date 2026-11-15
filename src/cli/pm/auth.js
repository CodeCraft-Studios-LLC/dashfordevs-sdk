/**
 * Browser login for the CLI: OAuth 2.0 authorization code + PKCE (RFC 7636) with a
 * loopback redirect (RFC 8252), against the accounts service's OIDC provider (/o/).
 *
 * REAL mode needs a public OIDC client registered for the CLI in accounts with the
 * redirect http://127.0.0.1:53682/callback. Set DASH4DEVS_CLIENT_ID to use it.
 * Until then the CLI runs in PREVIEW mode: the same browser round trip, but the
 * sign-in page is served by the CLI itself and the "account" is a local sample.
 *
 * Credentials live in ~/.dash4devs/credentials.json (0600). Never printed.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export const HOME = process.env.DASH4DEVS_HOME || path.join(os.homedir(), ".dash4devs");
const CRED_FILE = path.join(HOME, "credentials.json");
export const ACCOUNTS_URL = (process.env.DASH4DEVS_ACCOUNTS_URL || "https://accounts.dashfordevs.com").replace(/\/+$/, "");
const CLIENT_ID = process.env.DASH4DEVS_CLIENT_ID || "";
export const PREVIEW = !CLIENT_ID;
const PORT = Number(process.env.DASH4DEVS_LOGIN_PORT || 53682);
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
const SCOPES = "openid profile email accounts:orgs:read";
const TIMEOUT_MS = 5 * 60 * 1000;

const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// ── Credentials ────────────────────────────────────────────

export function readCredentials() {
  try {
    const c = JSON.parse(fs.readFileSync(CRED_FILE, "utf8"));
    if (c.expires_at && Date.parse(c.expires_at) < Date.now() && !c.refresh_token) return null;
    return c;
  } catch {
    return null;
  }
}

function writeCredentials(c) {
  fs.mkdirSync(HOME, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CRED_FILE, JSON.stringify(c, null, 2) + "\n", { mode: 0o600 });
  try {
    fs.chmodSync(CRED_FILE, 0o600);
  } catch {
    /* Windows */
  }
}

export function logout() {
  const had = fs.existsSync(CRED_FILE);
  if (had) fs.rmSync(CRED_FILE);
  return had;
}

// ── Browser ────────────────────────────────────────────────

export function openBrowser(url) {
  if (process.env.DASH4DEVS_NO_BROWSER) return false;
  try {
    const [cmd, args] =
      process.platform === "win32"
        ? ["rundll32", ["url.dll,FileProtocolHandler", url]] // no shell: & in the URL stays intact
        : process.platform === "darwin"
          ? ["open", [url]]
          : ["xdg-open", [url]];
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

// ── Pages the browser lands on ─────────────────────────────

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
:root{color-scheme:dark}*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0a;color:#fafafa;font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;padding:16px}
.card{width:100%;max-width:400px;border:1px solid #262626;border-radius:20px;padding:32px;background:#111}
.dog{font:12px/1.15 ui-monospace,Menlo,Consolas,monospace;color:#e8aa42;white-space:pre;margin:0 0 16px}
h1{font-size:22px;margin:0 0 6px}p{color:#a3a3a3;margin:0 0 20px}
.tag{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.04em;padding:3px 10px;border-radius:999px;background:#facc15;color:#000;margin-bottom:14px}
label{display:block;font-size:13px;color:#a3a3a3;margin:0 0 6px}
input{width:100%;padding:12px 18px;border-radius:999px;border:1px solid #333;background:#0a0a0a;color:#fafafa;font:inherit;margin-bottom:14px}
input:focus{outline:2px solid #fafafa;outline-offset:1px}
button{width:100%;padding:12px 18px;border-radius:999px;border:0;background:#fafafa;color:#000;font:inherit;font-weight:600;cursor:pointer}
button:hover{background:#e5e5e5}.muted{font-size:12px;color:#737373;margin:16px 0 0;text-align:center}
</style></head><body><main class="card">${body}</main></body></html>`;
}

const DOG = esc(`    ,-.__
  ,'    @ \`-.___
 (  ,)        O)
  \\/ \\  (_____/
   |  \`--' U`);

function previewLoginPage(state) {
  return page(
    "Sign in to DashForDevs",
    `<pre class="dog">${DOG}</pre><span class="tag">PREVIEW</span>
<h1>Sign in to DashForDevs</h1><p>The <b>dash4devs CLI</b> wants to use your account to list your organizations and create site keys.</p>
<form method="get" action="/callback">
<input type="hidden" name="state" value="${esc(state)}"><input type="hidden" name="code" value="preview_${b64url(crypto.randomBytes(12))}">
<label for="n">Name</label><input id="n" name="name" value="${esc(os.userInfo().username)}" autocomplete="name">
<label for="e">Email</label><input id="e" name="email" type="email" value="you@example.com" autocomplete="email">
<button type="submit">Authorize the CLI</button></form>
<p class="muted">Preview: nothing leaves your computer. Real sign-in uses accounts.dashfordevs.com.</p>`
  );
}

const donePage = () =>
  page("Logged in", `<pre class="dog">${DOG}</pre><h1>You're logged in!</h1><p>Biscuit fetched your login. You can close this tab and go back to your terminal.</p>`);
const failPage = (why) => page("Login failed", `<h1>Login didn't work</h1><p>${esc(why)}</p><p>Go back to your terminal and try again.</p>`);

// ── The flow ───────────────────────────────────────────────

/**
 * Log in through the browser. onUrl(url, opened) is called once the callback server is up.
 * Resolves to the saved credentials.
 */
export async function login({ onUrl = () => {}, signal } = {}) {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));

  const authorizeUrl = PREVIEW
    ? `http://127.0.0.1:${PORT}/preview-login?state=${state}`
    : `${ACCOUNTS_URL}/o/authorize/?` +
      new URLSearchParams({
        response_type: "code",
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT,
        scope: SCOPES,
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      });

  const params = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
      const send = (code, html) => {
        res.writeHead(code, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(html);
      };
      if (PREVIEW && u.pathname === "/preview-login") {
        if (u.searchParams.get("state") !== state) return send(400, failPage("This login link is stale."));
        return send(200, previewLoginPage(state));
      }
      if (u.pathname !== "/callback") return send(404, failPage("Nothing here."));
      if (u.searchParams.get("state") !== state) return send(400, failPage("The login didn't match this terminal (state mismatch)."));
      const err = u.searchParams.get("error");
      if (err) {
        send(400, failPage(u.searchParams.get("error_description") || err));
        finish(new Error(err === "access_denied" ? "You declined the login." : `Login failed: ${err}`));
        return;
      }
      send(200, donePage());
      finish(null, Object.fromEntries(u.searchParams));
    });
    const timer = setTimeout(() => finish(new Error("Login timed out after 5 minutes.")), TIMEOUT_MS);
    const onAbort = () => finish(new Error("Login cancelled."));
    signal?.addEventListener("abort", onAbort);
    function finish(e, v) {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      server.close();
      server.closeAllConnections?.();
      e ? reject(e) : resolve(v);
    }
    server.on("error", (e) =>
      finish(new Error(e.code === "EADDRINUSE" ? `Port ${PORT} is busy (another login running?). Set DASH4DEVS_LOGIN_PORT to use another.` : e.message))
    );
    server.listen(PORT, "127.0.0.1", () => onUrl(authorizeUrl, openBrowser(authorizeUrl)));
  });

  let creds;
  if (PREVIEW) {
    creds = {
      mode: "preview",
      user: { name: params.name || os.userInfo().username, email: params.email || "you@example.com" },
      access_token: params.code,
      expires_at: new Date(Date.now() + 30 * 864e5).toISOString(),
    };
  } else {
    const tok = await fetch(`${ACCOUNTS_URL}/o/token/`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code: params.code, redirect_uri: REDIRECT, client_id: CLIENT_ID, code_verifier: verifier }),
    });
    if (!tok.ok) throw new Error(`Token exchange failed (${tok.status}).`);
    const t = await tok.json();
    const me = await fetch(`${ACCOUNTS_URL}/o/userinfo/`, { headers: { authorization: `Bearer ${t.access_token}` } });
    const info = me.ok ? await me.json() : {};
    creds = {
      mode: "live",
      user: { name: info.name || info.preferred_username || "", email: info.email || "", sub: info.sub },
      access_token: t.access_token,
      refresh_token: t.refresh_token || null,
      expires_at: new Date(Date.now() + (t.expires_in || 600) * 1000).toISOString(),
    };
  }
  writeCredentials(creds);
  return creds;
}

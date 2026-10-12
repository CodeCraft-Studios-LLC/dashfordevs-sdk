// Compare papi.dashfordevs.com with production, structurally, using the
// production fixtures as the reference.
//
//   node scripts/papi-diff.mjs --key-from <file> [--key-prefix pk_test_] [--host papi.dashfordevs.com]
//
// For every endpoint in fixtures/production/manifest.json it sends the same
// read-only GET to papi and reports:
//   - status / JSON-ness differences;
//   - keys production returns that papi does not (breaking for storefronts);
//   - value-type changes at the same path (string vs number, object vs null...);
//   - keys papi adds (fine: tolerant readers ignore them).
// Values are not compared (papi may hold different data); shapes are.
// Output is Markdown, ready for notes/services/DFD6-api-gateway.md ("SDK findings").
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), [])
);
const host = args.host || "papi.dashfordevs.com";
if (!["papi.dashfordevs.com"].includes(host)) throw new Error("papi-diff only targets papi.dashfordevs.com");
const dir = path.join(root, "fixtures", "production");
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));

function loadKey() {
  if (process.env.DFD_FIXTURE_KEY) return process.env.DFD_FIXTURE_KEY;
  if (!args["key-from"]) throw new Error("--key-from <file> or DFD_FIXTURE_KEY is required");
  const prefix = args["key-prefix"] || "pk_";
  const m = fs.readFileSync(args["key-from"], "utf8").match(new RegExp(`${prefix}[A-Za-z0-9_-]{8,}`));
  if (!m) throw new Error(`no key with prefix ${prefix}`);
  return m[0];
}

const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);

function shapeDiff(prod, papi, at = "", out = { missing: [], changed: [], added: [] }) {
  const tp = typeOf(prod);
  const tq = typeOf(papi);
  if (tp !== tq) {
    // null <-> value differences are data, not shape, unless one side is an object/array.
    if (!(tp === "null" || tq === "null") || ["object", "array"].includes(tp === "null" ? tq : tp)) {
      out.changed.push(`${at || "<root>"}: ${tp} -> ${tq}`);
    }
    return out;
  }
  if (tp === "array") {
    if (prod.length && papi.length) shapeDiff(prod[0], papi[0], `${at}[]`, out);
    return out;
  }
  if (tp === "object") {
    for (const k of Object.keys(prod)) {
      if (!(k in papi)) out.missing.push(`${at ? at + "." : ""}${k}`);
      else shapeDiff(prod[k], papi[k], `${at ? at + "." : ""}${k}`, out);
    }
    for (const k of Object.keys(papi)) if (!(k in prod)) out.added.push(`${at ? at + "." : ""}${k}`);
  }
  return out;
}

async function get(p, key) {
  const url = new URL(p, `https://${host}`);
  try {
    const res = await fetch(url, { method: "GET", headers: { "X-API-Key": key, Accept: "application/json" }, redirect: "manual" });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: res.status, json };
  } catch (e) {
    return { status: 0, error: e?.cause?.code || e?.message };
  }
}

const key = loadKey();
const lines = [`papi structural diff vs production fixtures (${manifest.captured_at.slice(0, 10)}), ${new Date().toISOString()}`, ""];
let breaking = 0;
for (const [name, e] of Object.entries(manifest.endpoints)) {
  const r = await get(e.path, key);
  if (r.status === 0) {
    lines.push(`- \`${e.path}\`: unreachable (${r.error})`);
    breaking++;
    continue;
  }
  const prodBody = e.json && fs.existsSync(path.join(dir, `${name}.json`)) ? JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), "utf8")) : null;
  const notes = [];
  if (r.status !== e.status) notes.push(`status ${e.status} -> ${r.status}`);
  if (e.json !== (r.json !== null)) notes.push(`JSON ${e.json} -> ${r.json !== null}`);
  if (prodBody && r.json) {
    const d = shapeDiff(prodBody, r.json);
    if (d.missing.length) notes.push(`missing: ${d.missing.slice(0, 12).join(", ")}${d.missing.length > 12 ? ` (+${d.missing.length - 12})` : ""}`);
    if (d.changed.length) notes.push(`type changes: ${d.changed.slice(0, 8).join(", ")}`);
    if (d.added.length) notes.push(`added (ok): ${d.added.slice(0, 6).join(", ")}${d.added.length > 6 ? " ..." : ""}`);
    if (d.missing.length || d.changed.length) breaking++;
  } else if (r.status !== e.status) {
    breaking++;
  }
  lines.push(`- \`${e.path}\` (${e.sdk}): ${notes.length ? notes.join("; ") : "same shape"}`);
}
lines.push("", `${breaking} endpoint(s) differ in a way a storefront would notice.`);
console.log(lines.join("\n"));
process.exit(breaking ? 1 : 0);

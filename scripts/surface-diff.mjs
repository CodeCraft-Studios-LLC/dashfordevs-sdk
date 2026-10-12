// Public-surface diff between v1 (test/v1-snapshot) and v2 (dist).
//
//   node scripts/surface-diff.mjs          human report, exit 1 if v2 lacks anything v1 has
//   import { surfaceDiff } from ...        used by test/surface.test.ts
//
// Three layers:
//   1. type exports of every entry point's .d.ts (TypeScript compiler API)
//   2. runtime exports of every entry point that runs in Node
//   3. the DashClient object graph: every property and method of the client
//      and of each module object (own properties + prototype chain), compared
//      on live instances.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const V1 = path.join(root, "test", "v1-snapshot");
const V2 = path.join(root, "dist");

export const ENTRIES = [
  { entry: ".", v1: "index.d.ts", v2: "index.d.ts", v1js: "index.js", v2js: "index.js" },
  { entry: "./react", v1: "react/index.d.ts", v2: "react/index.d.ts", v1js: null, v2js: null },
  // v1 typed ./react/DashImage with react/index.d.ts
  { entry: "./react/DashImage", v1: "react/index.d.ts", v2: "react/DashImage.d.ts", v1js: null, v2js: null },
  { entry: "./utils", v1: "utils/index.d.ts", v2: "utils/index.d.ts", v1js: "utils/index.js", v2js: "utils/index.js" },
  { entry: "./storage", v1: "storage/index.d.ts", v2: "storage/index.d.ts", v1js: "storage/index.js", v2js: "storage/index.js" },
  { entry: "./security", v1: "security/index.d.ts", v2: "security/index.d.ts", v1js: "security/index.js", v2js: "security/index.js" },
];

function typeExports(files) {
  const program = ts.createProgram(files, {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX,
    skipLibCheck: true,
    noEmit: true,
    types: [],
  });
  const checker = program.getTypeChecker();
  const out = {};
  for (const f of files) {
    const sf = program.getSourceFile(f);
    const sym = sf && checker.getSymbolAtLocation(sf);
    out[f] = sym ? checker.getExportsOfModule(sym).map((s) => s.getName()).sort() : [];
  }
  return out;
}

function members(obj) {
  const names = new Set();
  let o = obj;
  while (o && o !== Object.prototype) {
    for (const k of Object.getOwnPropertyNames(o)) if (k !== "constructor") names.add(k);
    o = Object.getPrototypeOf(o);
  }
  return names;
}

export async function surfaceDiff() {
  const report = { types: [], runtime: [], graph: [] };

  // 1. type exports
  for (const e of ENTRIES) {
    const f1 = path.join(V1, e.v1);
    const f2 = path.join(V2, e.v2);
    const ex = typeExports([f1, f2]);
    const a = new Set(ex[f1]);
    const b = new Set(ex[f2]);
    report.types.push({
      entry: e.entry,
      v1: a.size,
      v2: b.size,
      missing: [...a].filter((n) => !b.has(n)),
      added: [...b].filter((n) => !a.has(n)),
    });
  }

  // 2. runtime exports
  process.env.DASH4DEVS_SILENT = "1";
  for (const e of ENTRIES) {
    if (!e.v1js) continue;
    const m1 = await import(pathToFileURL(path.join(V1, e.v1js)).href);
    const m2 = await import(pathToFileURL(path.join(V2, e.v2js)).href);
    const a = new Set(Object.keys(m1));
    const b = new Set(Object.keys(m2));
    report.runtime.push({
      entry: e.entry,
      v1: a.size,
      v2: b.size,
      missing: [...a].filter((n) => !b.has(n)),
      added: [...b].filter((n) => !a.has(n)),
    });
  }

  // 3. client object graph (pk and sk clients; sk adds `admin`)
  const m1 = await import(pathToFileURL(path.join(V1, "index.js")).href);
  const m2 = await import(pathToFileURL(path.join(V2, "index.js")).href);
  for (const key of ["pk_test_surface", "sk_test_surface"]) {
    const c1 = new m1.DashClient({ apiKey: key });
    const c2 = new m2.DashClient({ apiKey: key });
    const top1 = members(c1);
    const top2 = members(c2);
    report.graph.push({
      path: `DashClient(${key.slice(0, 2)})`,
      missing: [...top1].filter((n) => !top2.has(n)),
      added: [...top2].filter((n) => !top1.has(n)),
    });
    for (const name of top1) {
      const v1 = c1[name];
      const v2 = c2[name];
      if (v1 && typeof v1 === "object" && !Array.isArray(v1)) {
        const a = members(v1);
        const b = v2 && typeof v2 === "object" ? members(v2) : new Set();
        report.graph.push({
          path: `dash.${name}`,
          missing: [...a].filter((n) => !b.has(n)),
          added: [...b].filter((n) => !a.has(n)),
        });
        for (const sub of a) {
          if (v1[sub] && typeof v1[sub] === "object" && !Array.isArray(v1[sub]) && !(v1[sub] instanceof Map) && sub !== "client") {
            const sa = members(v1[sub]);
            const sb = v2 && v2[sub] && typeof v2[sub] === "object" ? members(v2[sub]) : new Set();
            report.graph.push({
              path: `dash.${name}.${sub}`,
              missing: [...sa].filter((n) => !sb.has(n)),
              added: [...sb].filter((n) => !sa.has(n)),
            });
          }
        }
      }
    }
    // the pageGroup() builder
    const g1 = members(c1.pageGroup("x"));
    const g2 = members(c2.pageGroup("x"));
    report.graph.push({
      path: "dash.pageGroup(slug)",
      missing: [...g1].filter((n) => !g2.has(n)),
      added: [...g2].filter((n) => !g1.has(n)),
    });
  }

  const missingCount =
    report.types.reduce((n, r) => n + r.missing.length, 0) +
    report.runtime.reduce((n, r) => n + r.missing.length, 0) +
    report.graph.reduce((n, r) => n + r.missing.length, 0);
  return { ...report, missingCount };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (!fs.existsSync(V2)) {
    console.error("dist/ missing - run npm run build first");
    process.exit(2);
  }
  const r = await surfaceDiff();
  const line = (label, rows, key) => {
    console.log(`\n## ${label}`);
    for (const row of rows) {
      const counts = row.v1 !== undefined ? ` (v1 ${row.v1}, v2 ${row.v2})` : "";
      console.log(
        `${row[key]}${counts}: missing ${row.missing.length ? row.missing.join(", ") : "none"}` +
          (row.added.length ? `; added ${row.added.join(", ")}` : "")
      );
    }
  };
  line("Type exports per entry point", r.types, "entry");
  line("Runtime exports per entry point", r.runtime, "entry");
  line("Client object graph", r.graph.filter((g) => g.missing.length || g.added.length), "path");
  console.log(`\nMissing in v2: ${r.missingCount}`);
  process.exit(r.missingCount ? 1 : 0);
}

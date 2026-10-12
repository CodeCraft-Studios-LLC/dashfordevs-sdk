/**
 * Public-surface parity (scripts/surface-diff.mjs) and the type-level
 * assignability check (scripts/gen-compat-test.mjs -> tsc), run as tests so
 * `npm test` fails if v2 drops anything v1 exposed.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "./helpers";

describe("public surface", () => {
  it("v2 has every export, entry point, client property and module method v1 had", () => {
    // Child process: keeps the TypeScript compiler out of Vite's module graph.
    const out = execFileSync(process.execPath, [path.join(ROOT, "scripts/surface-diff.mjs")], { cwd: ROOT, stdio: "pipe" }).toString();
    expect(out).toContain("Missing in v2: 0");
  }, 120000);

  it("every v1 declaration is satisfied by v2's (tsc over the generated assertions + storefront usage)", () => {
    execFileSync(process.execPath, [path.join(ROOT, "scripts/gen-compat-test.mjs")], { cwd: ROOT, stdio: "pipe" });
    const tsc = path.join(ROOT, "node_modules/typescript/bin/tsc");
    const out = execFileSync(process.execPath, [tsc, "-p", path.join(ROOT, "test/types/tsconfig.json")], { cwd: ROOT, stdio: "pipe" }).toString();
    expect(out.trim()).toBe("");
  }, 180000);
});

/**
 * The `dash4devs` CLI: 41 of 44 storefronts run `dash4devs build` as their
 * build script, so its entry, config resolution and scaffold must keep
 * working. Nothing here touches the network.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { ROOT } from "./helpers";

const BIN = path.join(ROOT, "dist/cli/bin.js");
const ENV = ["DEVDASH_SECRET_KEY", "DASH4DEVS_API_KEY", "NEXT_PUBLIC_DEVDASH_API_URL", "DASH4DEVS_API_URL", "NEXT_PUBLIC_DASH4DEVS_API_URL", "DASH4DEVS_TARGET", "NEXT_PUBLIC_DASH4DEVS_TARGET"];
const saved: Record<string, string | undefined> = {};
for (const k of ENV) saved[k] = process.env[k];
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  process.chdir(ROOT);
});

async function loadConfigIn(dir: string) {
  process.chdir(dir);
  const mod = await import(pathToFileURL(path.join(ROOT, "dist/cli/config.js")).href + `?t=${Math.random()}`);
  return mod.loadConfig();
}

describe("dash4devs CLI", () => {
  it("bin has a shebang and --help lists the commands and the target switch", () => {
    expect(fs.readFileSync(BIN, "utf8").startsWith("#!/usr/bin/env node")).toBe(true);
    const out = execFileSync(process.execPath, [BIN, "--help"], { env: { ...process.env, NO_COLOR: "1" } }).toString();
    for (const word of ["init", "build", "deploy", "status", "DASH4DEVS_API_URL", "DASH4DEVS_TARGET"]) expect(out).toContain(word);
  });

  it("config: v1 precedence kept (NEXT_PUBLIC_DEVDASH_API_URL, then DASH4DEVS_API_URL), then target, then production", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "d4d-cli-"));
    for (const k of ENV) delete process.env[k];
    process.env.DEVDASH_SECRET_KEY = "sk_test_cli";
    expect((await loadConfigIn(dir)).apiUrl).toBe("https://api.dashfordevs.com");
    process.env.DASH4DEVS_TARGET = "papi";
    expect((await loadConfigIn(dir)).apiUrl).toBe("https://papi.dashfordevs.com");
    process.env.DASH4DEVS_API_URL = "https://custom.example/";
    expect((await loadConfigIn(dir)).apiUrl).toBe("https://custom.example");
    process.env.NEXT_PUBLIC_DEVDASH_API_URL = "http://localhost:8000";
    expect((await loadConfigIn(dir)).apiUrl).toBe("http://localhost:8000");
  });

  it("config reads .env.local like v1 and refuses public keys", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "d4d-cli-"));
    for (const k of ENV) delete process.env[k];
    fs.writeFileSync(path.join(dir, ".env.local"), 'DEVDASH_SECRET_KEY="sk_test_file"\nNEXT_PUBLIC_DASH4DEVS_TARGET=papi\n');
    const cfg = await loadConfigIn(dir);
    expect(cfg.apiKey).toBe("sk_test_file");
    expect(cfg.apiUrl).toBe("https://papi.dashfordevs.com");
    fs.writeFileSync(path.join(dir, ".env.local"), "DEVDASH_SECRET_KEY=pk_test_nope\n");
    await expect(loadConfigIn(dir)).rejects.toThrow(/sk_/);
  });

  it("init scaffold depends on the published package and lets the env choose the host", async () => {
    const { buildFiles } = await import(pathToFileURL(path.join(ROOT, "dist/cli/templates.js")).href);
    const { SDK_VERSION } = await import(pathToFileURL(path.join(ROOT, "dist/version.js")).href);
    const files = buildFiles({ name: "Demo", url: "https://demo.example", apiUrl: "https://api.dashfordevs.com", publicKey: "", secretKey: "" });
    const pkg = JSON.parse(files.find((f: any) => f.path === "package.json").content);
    expect(pkg.dependencies.dash4devs).toBe(`^${SDK_VERSION}`);
    const lib = files.find((f: any) => f.path === "lib/dash.ts").content;
    expect(lib).toContain("NEXT_PUBLIC_DASH4DEVS_TARGET");
    expect(lib).not.toMatch(/sk_(live|test)_/);
  });
});

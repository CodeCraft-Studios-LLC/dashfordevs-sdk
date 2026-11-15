import fs from "node:fs";
import path from "node:path";

export const CONFIG_FILE = "dash4devs.config.json";

export function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** Look at the current folder and guess what kind of frontend it is. */
export function detectProject(cwd = process.cwd()) {
  const pkg = readJson(path.join(cwd, "package.json"));
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  let framework = "unknown";
  if (deps.next) framework = "Next.js";
  else if (deps.nuxt) framework = "Nuxt";
  else if (deps["@sveltejs/kit"]) framework = "SvelteKit";
  else if (deps.astro) framework = "Astro";
  else if (deps["@remix-run/react"]) framework = "Remix";
  else if (deps.vite) framework = "Vite";
  else if (deps.react) framework = "React";

  let pm = "npm";
  if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) pm = "pnpm";
  else if (fs.existsSync(path.join(cwd, "yarn.lock"))) pm = "yarn";
  else if (fs.existsSync(path.join(cwd, "bun.lockb")) || fs.existsSync(path.join(cwd, "bun.lock"))) pm = "bun";

  return {
    name: pkg?.name || path.basename(cwd),
    framework,
    pm,
    hasPackageJson: Boolean(pkg),
    hasSdk: Boolean(deps.dash4devs),
    config: readJson(path.join(cwd, CONFIG_FILE)),
  };
}

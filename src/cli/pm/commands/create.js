/**
 * `dash4devs create [dir] [--yes] [--no-install] [--no-git]` — log in, pick an org, get keys, scaffold a project.
 *
 * Real today: the browser login round trip, the files, dash4devs.config.json,
 * the dependency install and git init.
 * Preview today: orgs, site/database creation and keys (see ../cloud.js).
 */
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { pc, sym, badge, banner, sleep } from "../ui.js";
import * as p from "../prompt.js";
import * as cloud from "../cloud.js";
import { ensureLogin } from "./login.js";
import { dogSays, fetchRun } from "../mascot.js";
import { DASHBOARDS } from "../dashboards.js";
import { CONFIG_FILE } from "../project.js";
import { buildFiles } from "../../templates.js";
import { SDK_VERSION } from "../../../version.js";

const SDK_REPO = "github:CodeCraft-Studios-LLC/dashfordevs-sdk";
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// Only the storefront has a template today; the rest are shown so people know they're coming.
const TEMPLATE_READY = new Set(["ecommerce-standard"]);

function detectPm() {
  const ua = process.env.npm_config_user_agent || "";
  for (const pm of ["pnpm", "yarn", "bun"]) if (ua.startsWith(pm)) return pm;
  return "npm";
}

const has = (cmd) => {
  try {
    return spawnSync(cmd, ["--version"], { stdio: "ignore", shell: process.platform === "win32" }).status === 0;
  } catch {
    return false;
  }
};

function exec(cmd, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: "ignore", shell: process.platform === "win32" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

const mask = (k) => k.slice(0, 8) + "•".repeat(10) + k.slice(-4);

export async function run(args = [], version = SDK_VERSION) {
  const yes = args.includes("-y") || args.includes("--yes");
  const dirArg = args.find((a) => !a.startsWith("-"));
  const bye = () => p.cancel("Cancelled. Nothing was created.");

  await banner(version);
  p.intro(pc.bgCyan(pc.black(pc.bold(" dash4devs create "))) + " " + badge.preview());

  // 1. Who are you?
  const creds = await ensureLogin();
  if (!creds) {
    process.exitCode = 1;
    return p.outro(pc.dim("Log in first, then run create again."));
  }

  // 2. Which org?
  const s = p.spinner();
  s.start("Fetching your organizations");
  let orgs = await cloud.listOrgs(creds);
  s.stop(`Found ${orgs.length} organizations`);
  let orgId = await p.select({
    message: "Which organization is this for?",
    options: [
      ...orgs.map((o) => ({ value: o.id, label: o.name, hint: `${o.role} · ${o.sites} site${o.sites === 1 ? "" : "s"}${o.hipaa ? " · HIPAA" : ""}` })),
      { value: "__new", label: pc.cyan("+ New organization") },
    ],
  });
  if (p.isCancel(orgId)) return bye();
  if (orgId === "__new") {
    const name = await p.text({ message: "Organization name", placeholder: "Acme Inc", validate: (v) => (v ? undefined : "It needs a name") });
    if (p.isCancel(name)) return bye();
    const org = await cloud.createOrg(creds, name);
    orgs = [...orgs, org];
    orgId = org.id;
    p.log.success(`Created ${pc.bold(org.name)} ${pc.dim(`(${org.slug})`)}`);
  }
  const org = orgs.find((o) => o.id === orgId);

  // 3. The project
  const name = await p.text({
    message: "Project name",
    placeholder: dirArg ? slugify(path.basename(dirArg)) : "my-site",
    defaultValue: dirArg ? slugify(path.basename(dirArg)) : "my-site",
    validate: (v) => (SLUG.test(v) ? undefined : "Lowercase letters, numbers and dashes"),
  });
  if (p.isCancel(name)) return bye();

  const dir = dirArg || name;
  const root = path.resolve(process.cwd(), dir);
  if (fs.existsSync(root) && fs.readdirSync(root).length > 0) {
    const ok = await p.confirm({ message: `${pc.bold(dir)} isn't empty. Write into it anyway?`, initialValue: false });
    if (p.isCancel(ok) || !ok) return bye();
  }

  const dashboard = await p.select({
    message: "What are you building?",
    initialValue: "ecommerce-standard",
    options: DASHBOARDS.map((d) => ({
      value: d.value,
      label: d.label,
      hint: TEMPLATE_READY.has(d.value) ? d.hint : "template coming soon",
      disabled: !TEMPLATE_READY.has(d.value),
    })),
  });
  if (p.isCancel(dashboard)) return bye();
  const dash = DASHBOARDS.find((d) => d.value === dashboard);
  const hipaa = Boolean(dash.hipaa || org.hipaa);

  const home = await p.select({
    message: "Home page",
    options: [
      { value: "welcome", label: "Welcome page", hint: "a clean start, build your own" },
      { value: "storefront", label: "Full storefront", hint: "hero, categories, featured products" },
    ],
  });
  if (p.isCancel(home)) return bye();

  const url = await p.text({
    message: "Site URL",
    placeholder: "http://localhost:3000",
    defaultValue: "http://localhost:3000",
    validate: (v) => (/^https?:\/\/\S+$/.test(v) ? undefined : "Starts with http:// or https://"),
  });
  if (p.isCancel(url)) return bye();

  const region = await p.select({
    message: "Where should its database live?",
    options: [
      { value: "us-east-1", label: "US East", hint: "N. Virginia" },
      { value: "us-west-2", label: "US West", hint: "Oregon" },
    ],
  });
  if (p.isCancel(region)) return bye();

  const env = await p.select({
    message: "Which keys?",
    options: [
      { value: "test", label: "Test keys", hint: "safe to play, no real orders" },
      { value: "live", label: "Live keys", hint: "real orders and payments" },
    ],
  });
  if (p.isCancel(env)) return bye();

  const detected = detectPm();
  const pm = await p.select({
    message: "Package manager",
    initialValue: detected,
    options: ["npm", "pnpm", "yarn", "bun"].map((x) => ({
      value: x,
      label: x,
      hint: x === detected ? "detected" : has(x) ? "" : "not installed",
      disabled: x !== "npm" && x !== detected && !has(x),
    })),
  });
  if (p.isCancel(pm)) return bye();

  const install = args.includes("--no-install") ? false : await p.confirm({ message: `Install dependencies now? ${pc.dim(`(${pm} install)`)}`, initialValue: true });
  if (p.isCancel(install)) return bye();
  const git = args.includes("--no-git") || !has("git") ? false : await p.confirm({ message: "Start a git repo?", initialValue: true });
  if (p.isCancel(git)) return bye();

  p.note(
    [
      `${pc.dim("org")}        ${pc.bold(org.name)} ${pc.dim(org.slug)}`,
      `${pc.dim("project")}    ${pc.bold(name)} ${pc.dim("→ ./" + path.relative(process.cwd(), root).replace(/\\/g, "/"))}`,
      `${pc.dim("type")}       ${pc.cyan(dash.label)} ${pc.dim(`· ${home === "welcome" ? "welcome page" : "full storefront"}`)}`,
      `${pc.dim("database")}   ${badge.own()} ${pc.dim(region)}${hipaa ? " " + badge.hipaa() : ""}`,
      `${pc.dim("keys")}       ${env === "live" ? pc.red("live") : pc.green("test")}`,
      `${pc.dim("setup")}      ${pm}${install ? " · install" : ""}${git ? " · git" : ""}`,
    ],
    "Here's the plan"
  );
  if (!yes) {
    const go = await p.confirm({ message: "Create it?", initialValue: true });
    if (p.isCancel(go) || !go) return bye();
  }

  // 4. DashForDevs side (preview)
  let site, keys;
  {
    const t = p.spinner();
    t.start(`Creating ${pc.bold(name)} in ${org.name}`);
    site = await cloud.createSite(creds, org, { name });
    t.stop(`Created ${pc.bold(name)} in ${org.name} ${pc.dim("(preview)")}`);
  }
  await p.fakeStep(`Creating its own database in ${region}`, 900);
  if (hipaa) await p.fakeStep("Turning on encryption, audit log and access rules", 700);
  {
    const t = p.spinner();
    t.start(`Creating ${env} keys`);
    keys = await cloud.createKeys(creds, site, { environment: env });
    t.stop(`Created ${env} keys ${pc.dim("(preview)")}`);
  }

  // 5. Files (real)
  const files = buildFiles({
    name,
    url,
    apiUrl: "https://papi.dashfordevs.com",
    // Preview keys are not real: leave them blank so `dash4devs build` falls back cleanly.
    publicKey: keys.preview ? "" : keys.publicKey,
    secretKey: keys.preview ? "" : keys.secretKey,
    welcome: home === "welcome",
  });
  for (const f of files) {
    if (f.path === "package.json") {
      // The SDK installs from GitHub at a tag (it is not on npm).
      const pkg = JSON.parse(f.content);
      pkg.dependencies.dash4devs = `${SDK_REPO}#v${SDK_VERSION}`;
      f.content = JSON.stringify(pkg, null, 2) + "\n";
    }
    if (f.path === ".env.local" && keys.preview) {
      f.content += "# Preview project: keys are blank on purpose. Real ones are filled in once key creation is live.\n";
    }
  }
  files.push({
    path: CONFIG_FILE,
    content:
      JSON.stringify(
        {
          $schema: "https://dashfordevs.com/schema/dash4devs.config.json",
          site: name,
          org: org.slug,
          database: { region, hipaa },
          dashboard: dash.value,
        },
        null,
        2
      ) + "\n",
  });
  for (const f of files) {
    const full = path.join(root, f.path);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, f.content, "utf8");
  }
  p.log.success(`Wrote ${files.length} files to ${pc.cyan("./" + path.relative(process.cwd(), root).replace(/\\/g, "/"))}`);

  let installed = false;
  if (install) {
    const t = p.spinner();
    t.start(`Installing dependencies with ${pm} ${pc.dim("(this can take a minute)")}`);
    installed = await exec(pm, ["install"], root);
    t.stop(installed ? "Dependencies installed" : pc.yellow(`${pm} install didn't finish. Run it yourself in the folder.`));
  }
  if (git) {
    const ok = (await exec("git", ["init", "-q"], root)) && (await exec("git", ["add", "-A"], root)) && (await exec("git", ["commit", "-qm", "Start with dash4devs create"], root));
    p.log.step(ok ? "Started a git repo with a first commit" : pc.yellow("git repo started, but the first commit didn't go through"));
  }

  // 6. Keys + next steps
  p.note(
    [
      `${pc.dim("public")}   ${pc.cyan(keys.publicKey)}`,
      `${pc.dim("secret")}   ${pc.cyan(mask(keys.secretKey))} ${pc.dim("(server only)")}`,
      "",
      keys.preview ? `${sym.warn} ${pc.yellow("Preview keys, not real.")} ${pc.dim(".env.local leaves them blank.")}` : `${sym.ok} Saved to .env.local`,
    ],
    `Keys for ${name}`
  );
  const runCmd = pm === "npm" ? "npm run dev" : `${pm} dev`;
  p.note(
    [
      `${pc.cyan(`cd ${path.relative(process.cwd(), root) || "."}`)}`,
      ...(installed ? [] : [pc.cyan(`${pm} install`)]),
      `${pc.cyan(runCmd)}   ${pc.dim("→ http://localhost:3000")}`,
    ],
    "Next steps"
  );
  p.outro(keys.preview ? pc.dim("Preview: the org, database and keys aren't real yet. The files are.") : pc.green("All set!"));
  await sleep(100);
  await fetchRun("fetching your project...");
  await dogSays(`${pc.bold(pc.cyan("Woof!"))} ${name} is ready. Go make it pretty!`);
  console.log("");
}

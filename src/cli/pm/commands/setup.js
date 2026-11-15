/**
 * `dash4devs setup` — set up THIS folder's site on DashForDevs (writes dash4devs.config.json).
 * Not the same as `dash4devs init`, which scaffolds a brand-new storefront.
 *
 * UI preview: the server steps are simulated. Only the config file is written.
 */
import fs from "node:fs";
import path from "node:path";
import { pc, sym, badge, sleep } from "../ui.js";
import * as p from "../prompt.js";
import { detectProject, CONFIG_FILE } from "../project.js";
import { dogSays, fetchRun } from "../mascot.js";
import { DASHBOARDS, dashboardByValue } from "../dashboards.js";
import * as cloud from "../cloud.js";
import { ensureLogin } from "./login.js";

export async function run(args = []) {
  const yes = args.includes("-y") || args.includes("--yes");
  const bye = () => p.cancel("Cancelled. Nothing was written.");
  const proj = detectProject();

  p.intro(pc.bgCyan(pc.black(pc.bold(" dash4devs setup "))) + " " + badge.preview());

  p.note(
    [
      `${pc.dim("project")}    ${pc.bold(proj.name)}`,
      `${pc.dim("framework")}  ${proj.framework === "unknown" ? pc.yellow("not detected") : pc.cyan(proj.framework)}`,
      `${pc.dim("packages")}   ${pc.cyan(proj.pm)}`,
      `${pc.dim("sdk")}        ${proj.hasSdk ? pc.green("dash4devs installed") : pc.yellow("not installed yet")}`,
    ],
    "Looking at this folder"
  );

  if (proj.config && !yes) {
    const overwrite = await p.confirm({ message: `${CONFIG_FILE} already exists. Overwrite it?`, initialValue: false });
    if (p.isCancel(overwrite)) return bye();
    if (!overwrite) return p.outro(pc.dim("Kept your existing config."));
  }

  const site = await p.text({ message: "Site name", placeholder: proj.name, defaultValue: proj.name });
  if (p.isCancel(site)) return bye();
  const creds = await ensureLogin();
  if (!creds) {
    process.exitCode = 1;
    return p.outro(pc.dim("Log in first, then run setup again."));
  }
  const orgs = await cloud.listOrgs(creds);
  const orgId = await p.select({
    message: "Which organization?",
    options: orgs.map((o) => ({ value: o.id, label: o.name, hint: o.role })),
  });
  if (p.isCancel(orgId)) return bye();
  const org = orgs.find((o) => o.id === orgId).slug;
  const dashboard = await p.select({
    message: "Which dashboard type?",
    initialValue: "ecommerce-standard",
    options: DASHBOARDS.map((d) => ({ value: d.value, label: d.label, hint: d.hipaa ? `${d.hint} · HIPAA` : d.hint })),
  });
  if (p.isCancel(dashboard)) return bye();
  const region = await p.select({
    message: "Database region",
    initialValue: "us-east-1",
    options: [
      { value: "us-east-1", label: "US East", hint: "N. Virginia" },
      { value: "us-west-2", label: "US West", hint: "Oregon" },
    ],
  });
  if (p.isCancel(region)) return bye();

  const dash = dashboardByValue(dashboard);
  p.note(
    [
      `${pc.dim("site")}       ${pc.bold(site)}`,
      `${pc.dim("org")}        ${org ? pc.bold(org) : pc.yellow("(not set)")}`,
      `${pc.dim("database")}   ${badge.own()} ${pc.dim(region)}${dash.hipaa ? " " + badge.hipaa() : ""}`,
      `${pc.dim("dashboard")}  ${pc.cyan(dash.label)}`,
    ],
    "Summary"
  );

  if (!yes) {
    const go = await p.confirm({ message: "Look good?", initialValue: true });
    if (p.isCancel(go) || !go) return bye();
  }

  // Simulated: nothing leaves this machine yet.
  const steps = [
    ["Checking your organization", 500],
    [`Creating database for ${pc.bold(site)}`, 1100],
    dash.hipaa ? ["Turning on encryption, audit log and access rules", 800] : null,
    ["Setting up tables", 900],
    ["Creating site key", 400],
  ].filter(Boolean);
  for (const [label, ms] of steps) await p.fakeStep(label, ms);

  const config = {
    $schema: "https://dashfordevs.com/schema/dash4devs.config.json",
    site,
    org: org || null,
    database: { region, hipaa: Boolean(dash.hipaa) },
    dashboard: dash.value,
  };
  fs.writeFileSync(path.join(process.cwd(), CONFIG_FILE), JSON.stringify(config, null, 2) + "\n");
  p.log.success(`Wrote ${pc.cyan(CONFIG_FILE)}`);

  const install = { npm: "npm install", pnpm: "pnpm add", yarn: "yarn add", bun: "bun add" }[proj.pm];
  p.note(
    [
      proj.hasSdk ? `${sym.ok} ${pc.dim("SDK already installed")}` : pc.cyan(install + " github:CodeCraft-Studios-LLC/dashfordevs-sdk"),
      `${pc.cyan("dash4devs site")}     ${pc.dim("check the setup")}`,
    ],
    "Next steps"
  );
  p.outro(pc.dim("Preview mode: no database was actually created yet."));
  await sleep(100);
  await fetchRun("fetching your site...");
  await dogSays(`${pc.bold(pc.cyan("Woof!"))} ${site} is all set up.`);
  console.log("");
}

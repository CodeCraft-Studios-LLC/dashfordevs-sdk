/**
 * `dash4devs site` — this folder's DashForDevs setup (dash4devs.config.json).
 * `dash4devs status` stays the deploy status; this one is local and offline.
 */
import { pc, sym, badge, box } from "../ui.js";
import { detectProject, CONFIG_FILE } from "../project.js";
import { dashboardByValue } from "../dashboards.js";

export async function run() {
  const proj = detectProject();
  const c = proj.config;

  if (!c) {
    box([`${sym.warn} No ${pc.cyan(CONFIG_FILE)} in this folder.`, "", `Run ${pc.bold(pc.cyan("dash4devs setup"))} to set this site up.`], {
      title: "site",
      color: pc.yellow,
    });
    process.exitCode = 1;
    return;
  }

  const db = `${badge.own()} ${pc.dim(c.database?.region || "")}${c.database?.hipaa ? " " + badge.hipaa() : ""}`;
  box(
    [
      `${pc.dim("site")}        ${pc.bold(c.site)}`,
      `${pc.dim("org")}         ${c.org ? pc.bold(c.org) : pc.yellow("not set")}`,
      `${pc.dim("framework")}   ${pc.cyan(proj.framework)}`,
      `${pc.dim("database")}    ${db}`,
      `${pc.dim("dashboard")}   ${pc.cyan(dashboardByValue(c.dashboard)?.label || c.dashboard || "not set")}`,
      "",
      `${proj.hasSdk ? sym.ok : sym.warn} ${proj.hasSdk ? "SDK installed" : pc.yellow("SDK not installed")}`,
      `${sym.ok} Config found`,
      `${pc.yellow("○")} ${pc.dim("Live checks come when the API is connected")} ${badge.preview()}`,
    ],
    { title: c.site }
  );
}

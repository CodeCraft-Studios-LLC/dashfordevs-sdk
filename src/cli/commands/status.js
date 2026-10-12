/**
 * `dash4devs status` — show the active deploy and recent history.
 */

import chalk from "chalk";
import { loadConfig } from "../config.js";
import { createApi } from "../api.js";
import { printBanner, step, formatBytes, warn } from "../ui.js";

export async function run() {
  printBanner();
  const cfg = loadConfig();
  const api = createApi(cfg);

  const res = await api.status();
  if (!res.active) {
    warn("No active deployment for this organization yet");
  } else {
    step("Active deployment");
    const a = res.active;
    console.log(
      `     ${chalk.dim("deploy")}  ${a.deploy_id}\n` +
      `     ${chalk.dim("since")}   ${a.activated_at}\n` +
      `     ${chalk.dim("files")}   ${a.total_files} · ${formatBytes(a.total_bytes)}\n` +
      `     ${chalk.dim("prefix")}  ${res.asset_prefix}`
    );
  }

  if (res.recent.length > 1) {
    step("Recent");
    for (const d of res.recent.slice(0, 5)) {
      const badge =
        d.status === "active" ? chalk.green("●") :
        d.status === "superseded" ? chalk.dim("○") :
        chalk.yellow("○");
      console.log(`     ${badge} ${d.deploy_id}  ${chalk.dim(d.status)}  ${chalk.dim(d.created_at)}`);
    }
  }
}

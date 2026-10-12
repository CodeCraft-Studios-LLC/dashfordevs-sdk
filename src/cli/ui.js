/**
 * Terminal UI helpers.
 *
 * All output flows through this module so styling, indent, and padding are
 * consistent. If a user has NO_COLOR or isn't in a TTY, chalk auto-degrades.
 */

import chalk from "chalk";
import boxen from "boxen";

const INDENT = "  ";

export function printBanner() {
  const title = chalk.bold.cyan("DASH4DEVS");
  const sub = chalk.dim("build · deploy · cache");
  console.log(
    boxen(`${title}  ${sub}`, {
      padding: { top: 0, bottom: 0, left: 2, right: 2 },
      borderStyle: "round",
      borderColor: "cyan",
    })
  );
}

export function step(label, detail = "") {
  const marker = chalk.cyan("◇");
  const extra = detail ? chalk.dim(` · ${detail}`) : "";
  console.log(`${INDENT}${marker}  ${label}${extra}`);
}

export function success(label) {
  console.log(`${INDENT}${chalk.green("✓")}  ${chalk.green(label)}`);
}

export function warn(label) {
  console.log(`${INDENT}${chalk.yellow("!")}  ${chalk.yellow(label)}`);
}

export function printError(msg) {
  console.error(`\n${INDENT}${chalk.red("✗")}  ${chalk.red(msg)}\n`);
}

export function printSummary(lines) {
  const body = lines.map((l) => l).join("\n");
  console.log(
    boxen(body, {
      padding: 1,
      borderStyle: "round",
      borderColor: "green",
      margin: { top: 1, bottom: 1, left: 2, right: 0 },
    })
  );
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

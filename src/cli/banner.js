import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";

// ASCII art lives in a plain .txt so backticks/backslashes render verbatim.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ART = fs.readFileSync(path.join(__dirname, "banner.txt"), "utf8");

/** Just the ASCII art (used by every command's header). */
export function printArt() {
  console.log(chalk.cyan(ART));
}

export function printInitBanner() {
  printArt();
  console.log(
    chalk.dim("  Scaffold a headless storefront powered by ") +
      chalk.bold.cyan("DashForDevs") +
      chalk.dim(" — www.dashfordevs.com\n")
  );
}

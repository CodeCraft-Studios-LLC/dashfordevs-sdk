// Writes src/version.ts from package.json, so the package name and version
// live in one place (package.json). Renaming the package = edit "name" there.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const out = path.join(root, "src", "version.ts");
const body =
  "// Generated from package.json by scripts/sync-version.mjs - do not edit by hand.\n" +
  `export const PACKAGE_NAME = ${JSON.stringify(pkg.name)};\n` +
  `export const SDK_VERSION = ${JSON.stringify(pkg.version)};\n`;
if (!fs.existsSync(out) || fs.readFileSync(out, "utf8") !== body) {
  fs.writeFileSync(out, body);
  console.log(`version.ts -> ${pkg.name}@${pkg.version}`);
}

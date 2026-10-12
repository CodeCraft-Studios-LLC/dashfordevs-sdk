// Copies non-TS assets into dist and marks the CLI entry executable.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const copies = [
  ["src/styles/raw-html.css", "dist/styles/raw-html.css"],
  ["src/cli/banner.txt", "dist/cli/banner.txt"],
];
for (const [from, to] of copies) {
  fs.mkdirSync(path.dirname(path.join(root, to)), { recursive: true });
  fs.copyFileSync(path.join(root, from), path.join(root, to));
}
const bin = path.join(root, "dist/cli/bin.js");
const src = fs.readFileSync(bin, "utf8");
if (!src.startsWith("#!")) fs.writeFileSync(bin, "#!/usr/bin/env node\n" + src);
try {
  fs.chmodSync(bin, 0o755);
} catch {
  /* Windows */
}
console.log("assets copied");

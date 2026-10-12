/**
 * `dash4devs init [dir]` — scaffold a Next.js storefront wired to the SDK.
 *
 * Prompts for org name / URL / keys, writes a complete App Router project +
 * pages, installs deps, and (optionally) seeds demo categories + products.
 */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import chalk from "chalk";
import ora from "ora";
import { printInitBanner } from "../banner.js";
import { ask, askSecret, confirm } from "../prompt.js";
import { step, success, warn } from "../ui.js";
import { buildFiles } from "../templates.js";

const DEFAULT_API = "https://api.dashfordevs.com";

function writeFiles(root, files) {
  for (const { path: rel, content } of files) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf8");
  }
}

function runNpmInstall(cwd) {
  return new Promise((resolve) => {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const child = spawn(npm, ["install"], { cwd, stdio: "ignore", shell: process.platform === "win32" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

// Non-hemp demo catalog.
const DEMO = [
  { category: "Apparel", products: [
    { name: "Classic Tee", description: "Soft 100% cotton tee.", price: "24.00" },
    { name: "Logo Hoodie", description: "Cozy fleece hoodie.", price: "54.00" },
  ]},
  { category: "Accessories", products: [
    { name: "Enamel Mug", description: "12oz camp-style mug.", price: "18.00" },
    { name: "Canvas Tote", description: "Heavyweight everyday tote.", price: "22.00" },
    { name: "Sticker Pack", description: "Set of 5 die-cut stickers.", price: "8.00" },
  ]},
];

async function seedCatalog({ apiUrl, secretKey }) {
  const { DashClient } = await import("../../index.js");
  const client = new DashClient({ apiKey: secretKey, baseURL: apiUrl });
  let cats = 0, prods = 0;
  for (const group of DEMO) {
    let categoryId = null;
    try {
      const r = await client.admin.createCategory({ name: group.category, description: `${group.category} collection` });
      categoryId = (r.category || r).id; cats++;
    } catch (e) { warn(`category "${group.category}": ${e.message}`); }
    for (const p of group.products) {
      try {
        const r = await client.admin.createProduct({ name: p.name, description: p.description, category_id: categoryId, active: true });
        const pid = (r.product || r).id;
        // One default size with a price so the product is purchasable.
        await client._fetch(`${client.baseURL}/api/storefront/admin/products/${pid}/sizes`, {
          method: "POST",
          body: JSON.stringify({ label: "One Size", price: p.price, stock: 100, is_main: true }),
        });
        prods++;
      } catch (e) { warn(`product "${p.name}": ${e.message}`); }
    }
  }
  return { cats, prods };
}

export async function run(args) {
  printInitBanner();

  // Target directory
  let dir = args.find((a) => !a.startsWith("-"));
  const name = await ask("Store name", { def: "My Store" });
  if (!dir) {
    const suggested = name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "storefront";
    dir = await ask("Project directory", { def: suggested });
  }
  const root = path.resolve(process.cwd(), dir);
  if (fs.existsSync(root) && fs.readdirSync(root).length > 0) {
    const ok = await confirm(`Directory "${dir}" is not empty. Continue and overwrite files?`, { def: false });
    if (!ok) { console.log(chalk.dim("Aborted.")); return; }
  }

  const url = await ask("Storefront URL", {
    def: "https://example.com",
    validate: (v) => (/^https?:\/\//.test(v) ? null : "Must start with http(s)://"),
  });
  const apiUrl = await ask("DevDash API URL", { def: DEFAULT_API });
  // Keys are OPTIONAL — you may not have them yet. Leave blank and add them to
  // .env.local later. Only validate the format when a value is actually entered.
  const publicKey = await ask("Public key (pk_*) — optional, Enter to skip", {
    validate: (v) => (!v || v.startsWith("pk_") ? null : "Must start with pk_ (or leave blank to add later)"),
  });
  const secretKey = await askSecret("Secret key (sk_*) — optional, Enter to skip", {
    validate: (v) => (!v || v.startsWith("sk_") ? null : "Must start with sk_ (or leave blank to add later)"),
  });
  // Seeding needs a secret key — only offer it when one was provided.
  const wantSeed = secretKey
    ? await confirm("Generate demo categories + products?", { def: true })
    : false;

  // Scaffold
  console.log();
  step("Scaffolding project", dir);
  const files = buildFiles({ name, url, apiUrl, publicKey, secretKey });
  writeFiles(root, files);
  success(`Wrote ${files.length} files`);

  // Install
  const spinner = ora({ text: "Installing dependencies (npm install)…", color: "cyan" }).start();
  const installed = await runNpmInstall(root);
  if (installed) spinner.succeed("Dependencies installed");
  else spinner.fail("npm install failed — run it manually in the project dir");

  // Seed
  if (wantSeed) {
    const s = ora({ text: "Seeding demo catalog…", color: "cyan" }).start();
    try {
      const { cats, prods } = await seedCatalog({ apiUrl, secretKey });
      s.succeed(`Seeded ${cats} categories, ${prods} products`);
    } catch (e) {
      s.fail(`Seeding failed: ${e.message}`);
    }
  }

  if (!publicKey || !secretKey) {
    console.log("\n" + chalk.yellow("  ⚠ No API keys set yet.") +
      chalk.dim(" Add them to .env.local when ready:"));
    if (!publicKey) console.log(chalk.dim("      NEXT_PUBLIC_DEVDASH_PUBLIC_KEY=pk_..."));
    if (!secretKey) console.log(chalk.dim("      DEVDASH_SECRET_KEY=sk_..."));
  }

  console.log("\n" + chalk.green.bold("  Done!") + chalk.dim(" Next steps:"));
  console.log(chalk.cyan(`    cd ${dir}`));
  if (!installed) console.log(chalk.cyan("    npm install"));
  console.log(chalk.cyan("    npm run dev") + chalk.dim("   → http://localhost:3000\n"));
}

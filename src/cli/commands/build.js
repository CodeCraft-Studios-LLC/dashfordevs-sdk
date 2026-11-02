/**
 * `dash4devs build` — build Next.js app, upload changed static files, activate.
 *
 * Flow:
 *   1. Shell out to `next build` (or npm run build if a package script wins).
 *   2. Scan .next/static + public/ → manifest.
 *   3. POST /v1/cdn/manifest → deploy_id + signed URLs for new files only.
 *   4. PUT each signed URL in parallel (uploader.js).
 *   5. POST /v1/cdn/activate → atomic flip.
 *   6. Print summary box and write .env.local's NEXT_PUBLIC_ASSET_PREFIX.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { loadConfig } from "../config.js";
import { createApi } from "../api.js";
import { scanBuild } from "../scanner.js";
import { uploadAll } from "../uploader.js";
import { processOrgVideos } from "../video.js";
import { buildMedia, findMediaConfig } from "../media.js";
import {
  step,
  success,
  warn,
  printSummary,
  formatBytes,
} from "../ui.js";
import { printArt } from "../banner.js";
import chalk from "chalk";
import ora from "ora";

import { SDK_VERSION as PKG_VERSION } from "../../version.js";

export async function run(args) {
  const skipBuild = args.includes("--skip-build");
  const dryRun = args.includes("--dry-run");
  const noActivate = args.includes("--no-activate");
  const noMedia = args.includes("--no-media") || args.includes("--no-images");
  const noVideo = args.includes("--no-video");
  const forceVideo = args.includes("--force-video");

  printArt();

  // The site's own media (media.config.mjs) first: the pages import the
  // manifest it writes, so it has to exist before `next build`. Like the CDN,
  // an optimisation - a failure keeps whatever is already in public/_media.
  if (!skipBuild && !args.includes("--skip-media") && findMediaConfig(process.cwd())) {
    step("Media", "media/ -> public/_media");
    try {
      await buildMedia(process.cwd(), { log: (line) => console.log(line) });
      success("Media ready");
    } catch (e) {
      warn(`Media step failed, keeping the media already built: ${e.message}`);
    }
  }

  // The CDN upload is an OPTIMISATION, not a build requirement. When this command
  // is wired into package.json's "build" script it becomes the deploy's build
  // step, so anything thrown here fails the whole deploy and takes the site with
  // it. The classic case: CI (DigitalOcean) has no DEVDASH_SECRET_KEY, because
  // .env.local is not committed — loadConfig() threw, the deploy went red, and the
  // storefront never shipped at all. A missing key must degrade to a plain
  // `next build`, never break the site.
  let cfg;
  try {
    cfg = loadConfig();
  } catch (e) {
    warn(`CDN upload disabled: ${e.message}`);
    warn("Falling back to a plain `next build` — the site will build and deploy,");
    warn("it just serves its static assets from the origin instead of the edge.");
    clearAssetPrefix(process.cwd());
    await runNextBuild(process.cwd());
    success("Built (no CDN upload)");
    return;
  }

  const api = createApi(cfg);

  step("Auth", `key ${chalk.dim("····" + cfg.apiKey.slice(-4))} · ${cfg.apiUrl}`);

  // Resolve the asset prefix BEFORE building.
  //
  // This used to be written to .env.production *after* `next build`, which meant
  // the build never saw it — only the running server did, on its next render. The
  // two then disagreed: the server emitted <script src="{CDN}/_next/..."> while
  // the client bundle had been compiled with an empty asset base. Turbopack's
  // chunks registered under CDN urls that its runtime never looked for, so the
  // client entry silently never ran: every chunk 200s, no console error, and React
  // simply never hydrates. Symptom is a page that renders but is frozen at its
  // pre-animation state, with images stuck on their LQIP placeholders.
  //
  // The prefix is stable per org ({cdn}/cdn/orgs/{org_id}) and GET /cdn/status
  // returns it without needing a prior deploy, so we can just ask up front and
  // build with it baked in. Build-time and runtime then agree.
  let assetPrefix = null;
  // papi answers 404 for /api/v1/cdn/* until the asset CDN service exists.
  // That is not a failure: the site builds and serves its own assets.
  let cdnAvailable = true;
  if (!skipBuild) {
    try {
      const status = await api.status();
      assetPrefix = status.asset_prefix || null;
    } catch (e) {
      if (e.status === 404) {
        cdnAvailable = false;
        step("Asset CDN", chalk.dim("not offered by papi yet - assets serve from the site itself"));
      } else {
        warn(`Could not resolve the CDN asset prefix: ${e.message}`);
        warn("Building without it — assets will serve from the origin.");
      }
    }
  }

  if (assetPrefix) {
    writeAssetPrefix(cfg.cwd, assetPrefix);
    step("Asset prefix", chalk.dim(assetPrefix));
  } else if (!skipBuild) {
    // No prefix from papi: drop any left in .env.production (a site moved
    // from the old platform still names its CDN there). `next build` reads
    // that file itself, and HTML naming chunks a CDN never received renders
    // but never hydrates.
    clearAssetPrefix(cfg.cwd);
  }

  if (!skipBuild) {
    step("Building Next.js app");
    // NEXT_PUBLIC_ASSET_PREFIX is inlined into the client bundle at build time,
    // so it has to be in the env of the build itself — .env.production alone is
    // not enough if the file is written too late.
    await runNextBuild(cfg.cwd, assetPrefix);
    success(`Built ${path.join(cfg.cwd, cfg.buildDir)}`);
  } else {
    warn("Skipping build (--skip-build)");
  }

  // The app has built. The edge upload below is an optimisation, and a failure
  // there (API down, key rotated, upload 5xx) must not fail the deploy.
  //
  // But if we baked the CDN prefix into that build and the upload then fails, the
  // built HTML points at chunks that aren't on the edge — a broken site, which is
  // worse than no CDN at all. So in that case, rebuild without the prefix and let
  // the origin serve the assets.
  if (!cdnAvailable) {
    printSummary([chalk.bold.green("Build successful"), "", "Assets serve from the site (no asset CDN on papi yet)."]);
    return;
  }

  try {
    await uploadToEdge({ cfg, api, dryRun, noActivate, noMedia, noVideo, forceVideo });
  } catch (e) {
    warn(`CDN upload failed: ${e.message}`);
    if (assetPrefix && !skipBuild) {
      warn("That build references the edge, so rebuilding without the asset prefix.");
      clearAssetPrefix(cfg.cwd);
      await runNextBuild(cfg.cwd, null);
      success("Rebuilt without CDN — assets serve from the origin.");
    } else {
      warn("The app built fine and will deploy — assets serve from the origin.");
    }
  }
}

async function uploadToEdge({ cfg, api, dryRun, noActivate, noMedia, noVideo, forceVideo }) {
  step("Hashing static files");
  const entries = await scanBuild(cfg);
  const totalBytes = entries.reduce((n, e) => n + e.size, 0);
  success(`${entries.length} files · ${formatBytes(totalBytes)}`);

  step("Diffing against CDN");
  const spinner = ora({ text: "uploading manifest…", indent: 4 }).start();
  const manifestRes = await api.manifest({
    sdk_version: PKG_VERSION,
    next_version: readNextVersion(cfg.cwd),
    files: entries.map((e) => ({
      path: e.path,
      sha256: e.sha256,
      size: e.size,
      content_type: e.content_type,
    })),
  });
  spinner.stop();

  const { deploy_id, needs_upload, stats } = manifestRes;
  const unchanged = stats.total_files - stats.new_files;
  success(
    `${stats.new_files} new · ${unchanged} cached · ${formatBytes(stats.new_bytes)} to upload`
  );

  if (dryRun) {
    warn("Dry run — skipping upload + activation");
    return;
  }

  if (needs_upload.length === 0) {
    success("Nothing to upload — all assets already on CDN");
  } else {
    step(`Uploading to edge (${needs_upload.length} files)`);
    const { failures } = await uploadAll({ api, entries, needsUpload: needs_upload });
    if (failures.length) {
      throw new Error(`${failures.length} uploads failed. First: ${failures[0].error}`);
    }
    success("All files uploaded");
  }

  if (noActivate) {
    warn(`Deploy ${deploy_id} uploaded but not activated (--no-activate)`);
    return;
  }

  step(`Activating ${deploy_id}`);
  const activated = await api.activate(deploy_id);
  success(`Live at ${activated.asset_prefix}`);

  // Persist asset prefix so next.config.mjs can pick it up via env.
  writeAssetPrefix(cfg.cwd, activated.asset_prefix);

  // Media optimization. Images: webp/LQIP variants generated server-side (light
  // + cached). Videos: transcoded LOCALLY on this machine (ffmpeg) and uploaded
  // to the CDN — heavy work stays off our servers so concurrent builds scale.
  if (!noMedia) {
    step("Optimizing media", "image variants (server) + video transcodes (local → CDN)");
    let res = null;
    const trigger = ora({ text: "Scanning library…", indent: 4 }).start();
    try {
      res = await api.generateImageVariants();
      trigger.stop();
    } catch (e) {
      trigger.warn(`Media optimization skipped: ${e.message}`);
    }
    if (res) {
      const img = res.images || { total: 0, ready: 0 };
      success(`Images: ${img.ready}/${img.total} already optimized` + (img.total > img.ready ? ` · ${img.total - img.ready} queued` : ""));
      const videos = res.videos || [];
      if (videos.length === 0) {
        success("No videos to transcode");
      } else if (noVideo) {
        warn(`${videos.length} video(s) skipped (--no-video)`);
      } else {
        // Heavy ffmpeg runs locally on this machine, then uploads to the CDN.
        await processOrgVideos(api, videos, { force: forceVideo });
      }
    }
  }

  const savedBytes = stats.total_bytes - stats.new_bytes;
  printSummary([
    chalk.bold.green("Deploy successful"),
    "",
    `${chalk.dim("deploy")}  ${activated.deploy_id}`,
    `${chalk.dim("prefix")} ${activated.asset_prefix}`,
    `${chalk.dim("saved")}  ${formatBytes(savedBytes)} via dedup`,
  ]);
}

function runNextBuild(cwd, assetPrefix) {
  return new Promise((resolve, reject) => {
    // shell: true is required on Windows so Node can resolve `.cmd` shims
    // (npx.cmd, next.cmd). Harmless on POSIX.
    const env = { ...process.env };
    if (assetPrefix) env.NEXT_PUBLIC_ASSET_PREFIX = assetPrefix;
    else delete env.NEXT_PUBLIC_ASSET_PREFIX;

    const child = spawn("npx next build", {
      cwd,
      stdio: "inherit",
      env,
      shell: true,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`next build exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

function readNextVersion(cwd) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
    return (pkg.dependencies && pkg.dependencies.next) || (pkg.devDependencies && pkg.devDependencies.next) || "";
  } catch {
    return "";
  }
}

// Drop the prefix again — used when the build referenced the edge but the upload
// failed, so the rebuilt app serves from the origin instead of 404-ing on chunks.
function clearAssetPrefix(cwd) {
  for (const name of [".env.production", ".env.local"]) {
    const p = path.join(cwd, name);
    if (!fs.existsSync(p)) continue;
    const lines = fs
      .readFileSync(p, "utf8")
      .split(/\r?\n/)
      .filter((l) => !l.startsWith("NEXT_PUBLIC_ASSET_PREFIX="));
    fs.writeFileSync(p, lines.join("\n"));
  }
}

function writeAssetPrefix(cwd, prefix) {
  // Write to .env.production so `next build` picks it up but `next dev`
  // never sees it. Dev mode chunks are local-only and would 404 on the CDN.
  const envPath = path.join(cwd, ".env.production");
  let lines = [];
  if (fs.existsSync(envPath)) {
    lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/).filter(
      (l) => !l.startsWith("NEXT_PUBLIC_ASSET_PREFIX=")
    );
  }
  lines.push(`NEXT_PUBLIC_ASSET_PREFIX=${prefix}`);
  fs.writeFileSync(envPath, lines.join("\n"));

  // If the prefix is stuck in .env.local from an older CLI, remove it so
  // dev mode stops trying to hit the CDN.
  const localPath = path.join(cwd, ".env.local");
  if (fs.existsSync(localPath)) {
    const localLines = fs.readFileSync(localPath, "utf8").split(/\r?\n/);
    const hadPrefix = localLines.some((l) => l.startsWith("NEXT_PUBLIC_ASSET_PREFIX="));
    if (hadPrefix) {
      const cleaned = localLines.filter((l) => !l.startsWith("NEXT_PUBLIC_ASSET_PREFIX="));
      fs.writeFileSync(localPath, cleaned.join("\n"));
    }
  }
}

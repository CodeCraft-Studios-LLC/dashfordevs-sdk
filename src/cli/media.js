/**
 * `dash4devs media`: turns the files in a site's `media/` folder into the
 * files its pages load, for <DashImage> and <DashVideo>.
 *
 * Images: a WebP per width in the config, plus a tiny blurred WebP inlined as
 * the placeholder (LQIP). Videos: one H.264 MP4 scaled down to the width the
 * page draws it at, silent, with the index at the front so it starts playing
 * before it has finished downloading.
 *
 * What to make is `media.config.mjs` at the site root:
 *
 *   export default {
 *     images: [{ src: "gallery/*.jpg", widths: [480, 800, 1200] }],
 *     videos: [{ src: "video/hero-*.mp4", width: 1280 }],
 *     // manifest: "src/lib/media-manifest.json",   (default: src/lib if src/ exists, else lib)
 *   };
 *
 * `src` is a pattern under `media/`: `*` is any run of characters other than
 * `/`, `{a,b}` is one of several. The key is the path without its extension
 * (`video/hero-day`), which `imageOf()` / `videoOf()` from "dash4devs/media"
 * look up.
 *
 * Outputs land in `public/_media/` under names that carry a hash of the
 * source and its settings, so an unchanged file is never encoded twice and a
 * changed one gets a new URL (cacheable forever). Files no longer listed are
 * removed. The work runs on the builder's own machine, like video transcodes
 * in `dash4devs build`.
 *
 * Encoders come from the SITE's dependencies, so the SDK itself stays light:
 *   npm i -D sharp ffmpeg-static
 * (an `ffmpeg` on PATH works too).
 *
 * Ported from VoxCore's `voxcore media` (VOXCORE/frontend/scripts/voxcore/media.mjs).
 */

import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const CONFIG_NAMES = ["media.config.mjs", "media.config.js"];

/** The site's media config path, or null when the site has none. */
export function findMediaConfig(root) {
  for (const name of CONFIG_NAMES) {
    const p = path.join(root, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export async function buildMedia(root, { log = console.log } = {}) {
  const configPath = findMediaConfig(root);
  if (!configPath) {
    throw new Error("No media.config.mjs at the site root. See `dash4devs media --help`.");
  }
  const config = (await import(pathToFileURL(configPath).href)).default ?? {};
  const siteRequire = createRequire(path.join(root, "package.json"));

  const srcDir = path.join(root, "media");
  const outDir = path.join(root, "public", "_media");
  const manifestPath = path.join(
    root,
    config.manifest ?? (fs.existsSync(path.join(root, "src")) ? "src/lib/media-manifest.json" : "lib/media-manifest.json"),
  );
  fs.mkdirSync(outDir, { recursive: true });
  const files = listFiles(srcDir);

  const manifest = { images: {}, videos: {} };
  const keep = new Set();

  const imageRules = config.images ?? [];
  const imageFiles = imageRules.flatMap((rule) => files.filter((f) => matches(rule.src, f)).map((rel) => ({ rule, rel })));
  let sharp = null;
  if (imageFiles.length) {
    try {
      sharp = siteRequire("sharp");
    } catch {
      throw new Error("Images need sharp in the site: npm i -D sharp");
    }
  }
  for (const { rule, rel } of imageFiles) {
    const key = rel.replace(/\.[^.]+$/, "");
    const source = path.join(srcDir, rel);
    const hash = hashOf(source, rule);
    const meta = await sharp(source).metadata();
    const widths = [...new Set((rule.widths ?? [1200]).map((w) => Math.min(w, meta.width)))].sort((a, b) => a - b);
    const variants = [];
    for (const width of widths) {
      const name = `${key}.${hash}.w${width}.webp`;
      const out = path.join(outDir, name);
      keep.add(name);
      if (!fs.existsSync(out)) {
        fs.mkdirSync(path.dirname(out), { recursive: true });
        await sharp(source).resize({ width }).webp({ quality: rule.quality ?? 78 }).toFile(out);
      }
      variants.push({ path: `/_media/${name}`, width });
    }
    const lqip = await sharp(source).resize({ width: 16 }).webp({ quality: 40 }).toBuffer();
    manifest.images[key] = {
      width: meta.width,
      height: meta.height,
      lqip: `data:image/webp;base64,${lqip.toString("base64")}`,
      variants,
    };
    log(`  image  ${key}  ${widths.join(", ")}`);
  }

  const jobs = [];
  for (const rule of config.videos ?? []) {
    for (const rel of files.filter((f) => matches(rule.src, f))) {
      const key = rel.replace(/\.[^.]+$/, "");
      const source = path.join(srcDir, rel);
      const name = `${key}.${hashOf(source, rule)}.w${rule.width}.mp4`;
      keep.add(name);
      manifest.videos[key] = { path: `/_media/${name}`, width: rule.width };
      jobs.push({ key, source, out: path.join(outDir, name), width: rule.width, audio: !!rule.audio });
    }
  }

  const todo = jobs.filter((j) => !fs.existsSync(j.out));
  log(`  videos ${jobs.length} total, ${todo.length} to encode`);
  const ffmpeg = todo.length ? findFfmpeg(siteRequire) : null;
  // Encodes run a few at a time: each one already uses several cores.
  const lanes = Math.max(1, Math.min(3, Math.floor(os.cpus().length / 4)));
  await pool(todo, lanes, async (job) => {
    fs.mkdirSync(path.dirname(job.out), { recursive: true });
    const tmp = `${job.out}.part.mp4`;
    await run(ffmpeg, [
      "-y", "-v", "error",
      "-i", job.source,
      // Never upscale: a source narrower than the target keeps its width.
      "-vf", `scale='min(${job.width},iw)':-2:flags=lanczos`,
      "-c:v", "libx264", "-preset", "slow", "-crf", "26",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart",
      ...(job.audio ? ["-c:a", "aac", "-b:a", "128k"] : ["-an"]),
      tmp,
    ]);
    fs.renameSync(tmp, job.out);
    log(`  video  ${job.key}  ${kb(fs.statSync(job.source).size)} -> ${kb(fs.statSync(job.out).size)}`);
  });

  // Whatever is in the output folder and no longer listed is stale.
  for (const rel of listFiles(outDir)) {
    if (!keep.has(rel)) fs.rmSync(path.join(outDir, rel));
  }

  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  log(`  manifest ${path.relative(root, manifestPath)}`);
  return manifest;
}

/* ------------------------------------------------------------------ helpers */

function findFfmpeg(siteRequire) {
  try {
    const bin = siteRequire("ffmpeg-static");
    if (bin) return bin;
  } catch {
    /* fall through to PATH */
  }
  try {
    if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0) return "ffmpeg";
  } catch {
    /* none */
  }
  throw new Error("Videos need ffmpeg: npm i -D ffmpeg-static (or install ffmpeg on PATH)");
}

function listFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full, base);
    return [path.relative(base, full).split(path.sep).join("/")];
  });
}

/** `*` is any run of characters other than `/`, `{a,b}` is one of several. */
export function matches(pattern, rel) {
  const re = pattern
    .replace(/[.+^$()|[\]\\]/g, "\\$&")
    .replace(/\{([^}]+)\}/g, (_, alts) => `(?:${alts.split(",").join("|")})`)
    .replace(/\*/g, "[^/]*");
  return new RegExp(`^${re}$`).test(rel);
}

function hashOf(file, rule) {
  return createHash("sha256").update(fs.readFileSync(file)).update(JSON.stringify(rule)).digest("hex").slice(0, 10);
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err.trim()}`))));
  });
}

async function pool(items, size, worker) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (queue.length) await worker(queue.shift());
    }),
  );
}

function kb(bytes) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

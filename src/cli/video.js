/**
 * Client-side video transcoding for `dash4devs build`.
 *
 * The heavy ffmpeg work runs HERE, on the builder's own machine — not on the
 * DashForDevs servers — so 50 people building at once just use 50 of their own
 * CPUs. For each org video we: download the source from the CDN, transcode to
 * 640/720/1080p (downscale >1080p, never upscale) + a first-frame poster, then
 * upload the renditions straight to the CDN via short-lived signed URLs. The
 * server only hands out URLs + records the result.
 *
 * No-ops with a clear message when ffmpeg/ffprobe aren't installed.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ora from "ora";
import { step, success, warn } from "./ui.js";

const HEIGHTS = [640, 720, 1080];

function hasBin(bin) {
  try { return spawnSync(bin, ["-version"], { stdio: "ignore" }).status === 0; }
  catch { return false; }
}

function probe(file) {
  const r = spawnSync("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height:format=duration", "-of", "json", file,
  ], { encoding: "utf8" });
  try {
    const d = JSON.parse(r.stdout);
    const s = (d.streams || [{}])[0];
    const dur = d.format && d.format.duration;
    return { width: +s.width || 0, height: +s.height || 0, duration: dur ? +dur : null };
  } catch {
    return { width: 0, height: 0, duration: null };
  }
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function putFile(url, file, contentType) {
  const res = await fetch(url, { method: "PUT", headers: { "Content-Type": contentType }, body: fs.readFileSync(file) });
  if (!res.ok) throw new Error(`upload ${res.status}`);
}

export async function processOrgVideos(api, videos, { force = false } = {}) {
  if (!hasBin("ffmpeg") || !hasBin("ffprobe")) {
    warn("Videos: ffmpeg/ffprobe not found on PATH — install ffmpeg to transcode locally. Skipping video step.");
    return;
  }

  const todo = (videos || []).filter((v) => v.url && (force || !v.ready));
  const cached = (videos || []).length - todo.length;
  if (todo.length === 0) {
    success(`Videos: ${(videos || []).length} already transcoded`);
    return;
  }
  step("Transcoding videos", `${todo.length} on this machine${cached ? ` · ${cached} cached` : ""} → CDN`);

  for (let i = 0; i < todo.length; i++) {
    const v = todo[i];
    const tag = `(${i + 1}/${todo.length})`;
    const spin = ora({ text: `${tag} ${v.name} — downloading…`, indent: 4 }).start();
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "dashvid_"));
    try {
      let ext = ".mp4";
      try { ext = (path.extname(new URL(v.url).pathname) || ".mp4").toLowerCase(); } catch {}
      const src = path.join(work, "src" + ext);
      await download(v.url, src);

      const { width, height, duration } = probe(src);
      if (!height) { spin.stop(); warn(`${v.name}: could not probe video`); continue; }

      const heights = HEIGHTS.filter((h) => h <= height);
      if (heights.length === 0) heights.push(Math.min(...HEIGHTS));

      // Poster (first frame) + tiny base64 blur.
      const poster = path.join(work, "poster.webp");
      spawnSync("ffmpeg", ["-y", "-i", src, "-vframes", "1", "-vf", "scale=-2:720", poster], { stdio: "ignore" });
      const lqipFile = path.join(work, "lqip.webp");
      spawnSync("ffmpeg", ["-y", "-i", src, "-vframes", "1", "-vf", "scale=24:-2", lqipFile], { stdio: "ignore" });
      const poster_lqip = fs.existsSync(lqipFile)
        ? "data:image/webp;base64," + fs.readFileSync(lqipFile).toString("base64")
        : "";

      // Renditions — live progress as each finishes.
      const made = [];
      for (const h of heights) {
        spin.text = `${tag} ${v.name} → ${[...made.map((x) => x + "p"), h + "p…"].join(", ")}`;
        const out = path.join(work, `${h}.mp4`);
        const r = spawnSync("ffmpeg", [
          "-y", "-i", src, "-vf", `scale=-2:${h}`,
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
          "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out,
        ], { stdio: "ignore" });
        if (r.status === 0 && fs.existsSync(out)) made.push(h);
      }
      if (made.length === 0) { spin.stop(); warn(`${v.name}: no renditions produced`); continue; }

      // Upload straight to the CDN via signed URLs.
      spin.text = `${tag} ${v.name} → uploading ${made.map((h) => h + "p").join(", ")}…`;
      const prep = await api.videoPrepare(v.key, made);
      await putFile(prep.uploads.poster, poster, "image/webp");
      for (const h of made) await putFile(prep.uploads[String(h)], path.join(work, `${h}.mp4`), "video/mp4");
      await api.videoComplete({ key: v.key, heights: made, poster_lqip, width, height, duration });

      spin.stop();
      success(`${v.name} → ${made.map((h) => h + "p").join(", ")}`);
    } catch (e) {
      spin.stop();
      warn(`${v.name}: ${e.message}`);
    } finally {
      try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
    }
  }
}

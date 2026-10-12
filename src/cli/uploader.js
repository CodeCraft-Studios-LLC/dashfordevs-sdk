/**
 * Parallel uploader with progress bar.
 *
 * Uploads each file to its signed PUT URL. Reads bodies as Buffers because
 * many signed-URL providers reject chunked/streaming PUTs without a
 * Content-Length header.
 */

import fs from "node:fs";
import cliProgress from "cli-progress";
import chalk from "chalk";

const DEFAULT_CONCURRENCY = 8;

export async function uploadAll({ api, entries, needsUpload, concurrency = DEFAULT_CONCURRENCY }) {
  // index entries by sha so we can find the source file for each needed upload
  const bySha = new Map();
  for (const e of entries) {
    if (!bySha.has(e.sha256)) bySha.set(e.sha256, e);
  }

  const bar = new cliProgress.SingleBar(
    {
      format: `  ${chalk.cyan("{bar}")} {percentage}% · {value}/{total} files · {uploaded}`,
      barCompleteChar: "█",
      barIncompleteChar: "░",
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic
  );

  bar.start(needsUpload.length, 0, { uploaded: "0 B" });

  let uploadedBytes = 0;
  let cursor = 0;
  const failures = [];

  async function worker() {
    while (cursor < needsUpload.length) {
      const i = cursor++;
      const item = needsUpload[i];
      const entry = bySha.get(item.sha256);
      if (!entry) {
        failures.push({ sha256: item.sha256, error: "source file not found" });
        bar.increment();
        continue;
      }
      try {
        const body = fs.readFileSync(entry.absolute);
        const res = await fetch(item.upload_url, {
          method: "PUT",
          headers: { "Content-Type": entry.content_type || "application/octet-stream" },
          body,
        });
        if (!res.ok) throw new Error(`PUT ${res.status}`);
        await api.confirmUpload(item.sha256);
        uploadedBytes += entry.size;
      } catch (err) {
        failures.push({ sha256: item.sha256, path: entry.path, error: err.message });
      }
      bar.increment(1, { uploaded: formatBytes(uploadedBytes) });
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, needsUpload.length) }, () => worker());
  await Promise.all(workers);
  bar.stop();

  return { uploadedBytes, failures };
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

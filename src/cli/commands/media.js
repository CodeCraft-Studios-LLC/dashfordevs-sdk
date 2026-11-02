/**
 * `dash4devs media`: size the site's own images and videos (media/ ->
 * public/_media + the manifest). See ../media.js.
 */

import { buildMedia } from "../media.js";
import { step, success } from "../ui.js";

export async function run(args) {
  if (args.includes("-h") || args.includes("--help")) {
    console.log(`
Usage: dash4devs media

Reads media.config.mjs at the site root and makes, from media/:
  images  WebP widths + an inlined blurred placeholder, for <DashImage image={imageOf(key)}>
  videos  an H.264 MP4 sized to the width the page draws it, for <DashVideo video={videoOf(key)}>

Outputs go to public/_media/ and src/lib/media-manifest.json (lib/ when there is no src/).
Needs, in the site: npm i -D sharp ffmpeg-static
`);
    return;
  }
  step("Media", "media/ -> public/_media");
  await buildMedia(process.cwd(), { log: (line) => console.log(line) });
  success("Media ready");
}

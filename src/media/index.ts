/**
 * Site media made by `dash4devs media` (dash4devs/media).
 *
 *   // src/lib/media.ts
 *   import manifest from "@/lib/media-manifest.json";
 *   import { createMedia } from "dash4devs/media";
 *   export const { imageOf, videoOf } = createMedia(manifest);
 *
 *   <DashImage image={imageOf("gallery/porsche")} alt="" />
 *   <DashVideo video={videoOf("video/hero")} autoPlay muted loop playsInline />
 *
 * The manifest's paths are site-relative (`/_media/...`). With an asset prefix
 * (NEXT_PUBLIC_ASSET_PREFIX, set by `dash4devs build` when the site's assets go
 * to a CDN) they resolve under it; without one they are served from
 * `public/_media` by the site itself, which is what `next dev` does.
 */

import type { DashImageData } from "../react/DashImage.js";
import type { DashVideoData } from "../react/DashVideo.js";

export interface MediaManifest {
  images: Record<string, { width: number; height: number; lqip: string; variants: { path: string; width: number }[] }>;
  videos: Record<string, { path: string; width: number }>;
}

function envPrefix(): string {
  try {
    // Written literally so Next.js inlines it into the browser bundle.
    return (typeof process !== "undefined" && process.env.NEXT_PUBLIC_ASSET_PREFIX) || "";
  } catch {
    return "";
  }
}

export function createMedia(manifest: MediaManifest, options: { prefix?: string } = {}) {
  const prefix = (options.prefix ?? envPrefix()).replace(/\/+$/, "");
  const url = (p: string) => `${prefix}${p}`;

  /** An image by key, shaped for <DashImage image={...}>, or null if the build has not made it. */
  function imageOf(key: string): DashImageData | null {
    const entry = manifest.images?.[key];
    if (!entry || !entry.variants?.length) return null;
    const webp = entry.variants.map((v) => ({ url: url(v.path), width: v.width }));
    return {
      url: webp[webp.length - 1].url,
      width: entry.width,
      height: entry.height,
      lqip: entry.lqip,
      variants_ready: true,
      variants: { webp },
    };
  }

  /** A video by key, for <DashVideo video={...}>, or null if the build has not made it. */
  function videoOf(key: string): DashVideoData | null {
    const entry = manifest.videos?.[key];
    return entry ? { url: url(entry.path), width: entry.width } : null;
  }

  return { imageOf, videoOf };
}

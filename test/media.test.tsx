/**
 * DashVideo, dash4devs/media and the `dash4devs media` pattern matcher.
 */
import { describe, expect, it } from "vitest";
import path from "node:path";
import { pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ROOT } from "./helpers";

const load = (p: string) => import(pathToFileURL(path.join(ROOT, p)).href);

describe("DashVideo", () => {
  it("plays the tallest rendition within maxHeight, CDN-relative paths resolved", async () => {
    const { pickVideoUrl } = await load("dist/react/DashVideo.js");
    const video = {
      url: "https://cdn.dashfordevs.com/media/o/source.mov",
      ready: true,
      renditions: [
        { height: 1080, url: "/media/o/1080.mp4" },
        { height: 640, url: "/media/o/640.mp4" },
        { height: 720, url: "/media/o/720.mp4" },
      ],
    };
    expect(pickVideoUrl(video)).toBe("https://cdn.dashfordevs.com/media/o/1080.mp4");
    expect(pickVideoUrl(video, 720)).toBe("https://cdn.dashfordevs.com/media/o/720.mp4");
    expect(pickVideoUrl(video, 300)).toBe("https://cdn.dashfordevs.com/media/o/640.mp4");
    expect(pickVideoUrl({ url: "https://x/a.mp4", renditions: [] })).toBe("https://x/a.mp4");
  });

  it("keeps site media (/_media/...) on the site, and renders as a plain <video>", async () => {
    const { DashVideo } = await load("dist/react/DashVideo.js");
    const html = renderToStaticMarkup(
      React.createElement(DashVideo, {
        video: { url: "/_media/video/hero.abc.w1280.mp4", width: 1280 },
        fragment: "#t=1",
        muted: true,
        className: "hero",
      }),
    );
    expect(html).toContain('src="/_media/video/hero.abc.w1280.mp4#t=1"');
    expect(html).toContain('class="hero"');
  });

  it("uses the poster and inlines the blurred poster as a background", async () => {
    const { DashVideo } = await load("dist/react/DashVideo.js");
    const html = renderToStaticMarkup(
      React.createElement(DashVideo, {
        video: { url: "https://x/a.mp4", poster: "/media/o/poster.webp", poster_lqip: "data:image/webp;base64,AA" },
      }),
    );
    expect(html).toContain('poster="https://cdn.dashfordevs.com/media/o/poster.webp"');
    expect(html).toContain("data:image/webp;base64,AA");
  });

  it("is exported from dash4devs/react", async () => {
    const mod = await load("dist/react/index.js");
    expect(typeof mod.DashVideo).toBe("object");
  });
});

describe("dash4devs/media", () => {
  const manifest = {
    images: {
      "gallery/car": {
        width: 2400,
        height: 1600,
        lqip: "data:image/webp;base64,BB",
        variants: [
          { path: "/_media/gallery/car.h.w480.webp", width: 480 },
          { path: "/_media/gallery/car.h.w1200.webp", width: 1200 },
        ],
      },
    },
    videos: { "video/hero": { path: "/_media/video/hero.h.w1280.mp4", width: 1280 } },
  };

  it("imageOf / videoOf shape the manifest for DashImage / DashVideo, under an asset prefix", async () => {
    const { createMedia } = await load("dist/media/index.js");
    const { imageOf, videoOf } = createMedia(manifest, { prefix: "https://cdn.example/site/" });
    const img = imageOf("gallery/car");
    expect(img.url).toBe("https://cdn.example/site/_media/gallery/car.h.w1200.webp");
    expect(img.variants.webp).toHaveLength(2);
    expect(img.lqip).toBe("data:image/webp;base64,BB");
    expect(videoOf("video/hero")).toEqual({ url: "https://cdn.example/site/_media/video/hero.h.w1280.mp4", width: 1280 });
    expect(imageOf("missing")).toBeNull();
    expect(videoOf("missing")).toBeNull();
  });

  it("without a prefix the paths stay site-relative", async () => {
    const { createMedia } = await load("dist/media/index.js");
    expect(createMedia(manifest, { prefix: "" }).videoOf("video/hero")?.url).toBe("/_media/video/hero.h.w1280.mp4");
  });
});

describe("dash4devs media patterns", () => {
  it("* is one path segment, {a,b} is one of several", async () => {
    const { matches } = await load("dist/cli/media.js");
    expect(matches("video/hero-*.mp4", "video/hero-day.mp4")).toBe(true);
    expect(matches("video/hero-*.mp4", "video/sub/hero-day.mp4")).toBe(false);
    expect(matches("video/{hero,cta}-*.mp4", "video/cta-night.mp4")).toBe(true);
    expect(matches("gallery/*.jpg", "gallery/car.png")).toBe(false);
  });
});

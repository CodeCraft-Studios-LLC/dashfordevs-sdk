/**
 * <DashVideo /> - a <video> for DashForDevs media.
 *
 * Two kinds of video data, one component:
 *
 *   - an organization video from the API: `{ url, ready, poster, poster_lqip,
 *     renditions: [{ height, url }] }`. `dash4devs build` transcodes these on
 *     the builder's machine to 640/720/1080p plus a poster; the component plays
 *     the largest rendition no taller than `maxHeight` (default 1080) and falls
 *     back to the original `url` until renditions exist.
 *   - a site video `dash4devs media` sized from the site's own `media/` folder
 *     (`videoOf("video/hero")` from "dash4devs/media"): `{ url, width }`.
 *
 * Everything else is a plain <video>: every attribute and the ref pass
 * straight through, so it drops in wherever a <video> was. A bare `src` works
 * too, and so does neither, for a video that should not load yet. `fragment`
 * is appended to the URL, for a start time like `#t=3.2`.
 *
 * No hooks and no state, so it renders in Server Components as well.
 */

import React from "react";
import { cdnImageUrl } from "../utils/image.js";

export interface DashVideoRendition {
  height: number;
  url: string;
}

export interface DashVideoData {
  url: string;
  /** Site media: the width the file was sized to. */
  width?: number;
  height?: number;
  /** Organization media: whether the renditions have been made. */
  ready?: boolean;
  poster?: string | null;
  /** A tiny blurred poster, inlined, shown until the poster arrives. */
  poster_lqip?: string | null;
  renditions?: DashVideoRendition[];
}

export interface DashVideoProps extends Omit<React.VideoHTMLAttributes<HTMLVideoElement>, "src"> {
  video?: DashVideoData | string | null;
  src?: string | null;
  fragment?: string;
  /** The tallest rendition to play (organization videos). Default 1080. */
  maxHeight?: number;
}

/** The URL a video should play, given its data and the tallest allowed rendition. */
export function pickVideoUrl(video: DashVideoData | string | null | undefined, maxHeight = 1080): string {
  if (!video) return "";
  if (typeof video === "string") return cdnImageUrl(video);
  const renditions = (video.renditions ?? []).filter((r) => r && r.url && r.height > 0);
  if (renditions.length) {
    const sorted = [...renditions].sort((a, b) => a.height - b.height);
    const fits = sorted.filter((r) => r.height <= maxHeight);
    const pick = fits.length ? fits[fits.length - 1] : sorted[0];
    return cdnImageUrl(pick.url);
  }
  return cdnImageUrl(video.url);
}

export const DashVideo = React.forwardRef<HTMLVideoElement, DashVideoProps>(function DashVideo(
  { video, src, fragment = "", maxHeight = 1080, poster, style, ...rest },
  ref
) {
  const url = pickVideoUrl(video, maxHeight) || cdnImageUrl(src ?? "");
  const data = video && typeof video === "object" ? video : null;
  const posterUrl = poster ?? (data?.poster ? cdnImageUrl(data.poster) : undefined);
  const lqip = data?.poster_lqip;
  const merged: React.CSSProperties | undefined = lqip
    ? { backgroundImage: `url(${lqip})`, backgroundSize: "cover", backgroundPosition: "center", ...style }
    : style;
  return <video ref={ref} {...rest} poster={posterUrl} style={merged} src={url ? `${url}${fragment}` : undefined} />;
});

export default DashVideo;

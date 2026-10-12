"use client";

/**
 * <DashImage /> - responsive image with LQIP blur-up and progressive loading.
 *
 * Renders a plain <img> with a srcset across the pre-generated WebP widths on
 * the CDN. The LQIP shows as a CSS background while loading. Drop-in for
 * <img>/<Image>: pass `image` (variant data) or just `src`.
 *
 * v2: `image` may also be a URL string, and CDN-relative paths
 * ("/content/...", as the rebuilt services return them) resolve against
 * https://cdn.dashfordevs.com. Absolute URLs render exactly as in v1.
 */

import React, { useEffect, useRef, useState } from "react";
import { cdnImageUrl } from "../utils/image.js";

const SHIMMER_SOURCE =
  '<svg width="400" height="400" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#222"><animate attributeName="offset" values="-2;1" dur="1.4s" repeatCount="indefinite"/></stop><stop offset="50%" stop-color="#2a2a2a"><animate attributeName="offset" values="-1;2" dur="1.4s" repeatCount="indefinite"/></stop><stop offset="100%" stop-color="#222"><animate attributeName="offset" values="0;3" dur="1.4s" repeatCount="indefinite"/></stop></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/></svg>';

// Same bytes on server and client (no hydration mismatch). The SVG is ASCII.
const SHIMMER_SVG =
  "data:image/svg+xml;base64," +
  (typeof btoa === "function" ? btoa(SHIMMER_SOURCE) : (globalThis as any).Buffer.from(SHIMMER_SOURCE).toString("base64"));

export interface DashImageVariant {
  width: number;
  url: string;
}

export interface DashImageData {
  url: string;
  lqip?: string | null;
  variants_ready?: boolean;
  variants?: {
    webp?: DashImageVariant[];
    avif?: DashImageVariant[];
  };
  width?: number;
  height?: number;
}

export interface DashImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  /**
   * Pre-generated responsive image data (variants + LQIP). Typed exactly as in
   * v1; at runtime a plain URL string is also accepted.
   */
  image?: DashImageData | null | undefined;
  /** Bare image URL fallback, used when `image` is not supplied. */
  src?: string | null;
  alt?: string;
  sizes?: string;
  className?: string;
  style?: React.CSSProperties;
  priority?: boolean;
  noBlur?: boolean;
  fill?: boolean;
}

function buildSrcSet(variantList: DashImageVariant[] | undefined): string | undefined {
  if (!Array.isArray(variantList) || variantList.length === 0) return undefined;
  return variantList
    .filter((v) => v && v.url && v.width)
    .sort((a, b) => a.width - b.width)
    .map((v) => `${cdnImageUrl(v.url)} ${v.width}w`)
    .join(", ");
}

// React 19 knows `fetchPriority`; React 17/18 warn about it and want the
// lowercase DOM attribute. Same <img fetchpriority="high"> either way.
const FETCH_PRIORITY_PROP = parseInt(String(React.version || "18"), 10) >= 19 ? "fetchPriority" : "fetchpriority";

const OWN_PROPS: Record<string, 1> = {
  image: 1, alt: 1, sizes: 1, className: 1, style: 1, priority: 1,
  noBlur: 1, fill: 1, onLoad: 1, onError: 1, src: 1, width: 1,
  height: 1, loading: 1,
};

export function DashImage(props: DashImageProps): React.JSX.Element | null {
  const rawImage = props.image as DashImageData | string | null | undefined;
  let image: DashImageData | null | undefined =
    typeof rawImage === "string" ? (rawImage ? { url: rawImage } : null) : rawImage;
  const alt = props.alt || "";
  const sizes = props.sizes || "100vw";
  const className = props.className || "";
  const style = props.style || {};
  const priority = props.priority || false;
  const noBlur = props.noBlur || false;
  const fill = props.fill || false;
  const onLoad = props.onLoad;
  const onError = props.onError;
  const src = props.src;
  const width = props.width;
  const height = props.height;
  const loadingProp = props.loading;

  // Forward every attribute this component does not consume (aria-*, data-*, title...).
  const passthrough: Record<string, unknown> = {};
  for (const key in props) {
    if (Object.prototype.hasOwnProperty.call(props, key) && !OWN_PROPS[key]) {
      passthrough[key] = (props as any)[key];
    }
  }

  const [loaded, setLoaded] = useState(false);
  const [variantError, setVariantError] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (imgRef.current && imgRef.current.complete) setLoaded(true);
  }, []);

  if ((!image || !image.url) && src) image = { url: src };
  if (!image || !image.url) return null;

  const variants = !variantError && image.variants_ready ? image.variants : null;
  const webpSet = variants ? buildSrcSet(variants.webp) : undefined;

  const sorted = ((variants && variants.webp) || [])
    .filter((v) => v && v.url && v.width)
    .sort((a, b) => a.width - b.width);
  const primarySrc = sorted.length
    ? cdnImageUrl((sorted.find((v) => v.width >= 1024) || sorted[sorted.length - 1]).url)
    : cdnImageUrl(image.url);

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    if (!variantError) setVariantError(true);
    setLoaded(true);
    if (onError) onError(e);
  };

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    setLoaded(true);
    if (onLoad) onLoad(e);
  };

  const blur = !loaded && !noBlur ? image.lqip || (sorted.length ? SHIMMER_SVG : null) : null;

  const mergedStyle: React.CSSProperties = Object.assign(
    {},
    blur ? { backgroundImage: `url("${blur}")`, backgroundSize: "cover", backgroundPosition: "center" } : {},
    fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : {},
    style
  );

  // passthrough first: srcSet, sizes and the handlers are what this component computes.
  return React.createElement(
    "img",
    Object.assign({}, passthrough, {
      ref: imgRef,
      src: primarySrc,
      srcSet: webpSet,
      sizes,
      alt,
      width: fill ? undefined : width,
      height: fill ? undefined : height,
      loading: loadingProp || (priority ? "eager" : "lazy"),
      decoding: "async" as const,
      onLoad: handleLoad,
      onError: handleError,
      className,
      style: mergedStyle,
    }, priority ? { [FETCH_PRIORITY_PROP]: "high" } : {}) as any
  );
}

export default DashImage;

// v1 typed "dash4devs/react/DashImage" with the whole react index, so type
// imports such as `import type { DashImageData, CartItem } from "dash4devs/react/DashImage"`
// keep resolving.
export type * from "./index.js";

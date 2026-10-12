"use client";

/**
 * <DashImage /> — responsive image with LQIP blur-up + progressive loading.
 *
 * Renders a raw <img> with srcset across pre-generated WebP widths served
 * directly from the CDN. LQIP base64 blur shows as CSS background while
 * loading, clears once real pixels paint. Shimmer fallback when no LQIP.
 *
 * It is a client component (uses hooks) so it can be rendered directly inside
 * Server Components — drop it in anywhere as a replacement for <img>/<Image>.
 *
 * Uses React.createElement instead of JSX to avoid Turbopack parse errors
 * when bundled as a dependency in older Next.js versions.
 */

import React, { useState, useRef, useEffect } from "react";

const SHIMMER_SVG = "data:image/svg+xml;base64," + (typeof window === "undefined"
  ? Buffer.from('<svg width="400" height="400" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#222"><animate attributeName="offset" values="-2;1" dur="1.4s" repeatCount="indefinite"/></stop><stop offset="50%" stop-color="#2a2a2a"><animate attributeName="offset" values="-1;2" dur="1.4s" repeatCount="indefinite"/></stop><stop offset="100%" stop-color="#222"><animate attributeName="offset" values="0;3" dur="1.4s" repeatCount="indefinite"/></stop></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/></svg>').toString("base64")
  : btoa('<svg width="400" height="400" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#222"><animate attributeName="offset" values="-2;1" dur="1.4s" repeatCount="indefinite"/></stop><stop offset="50%" stop-color="#2a2a2a"><animate attributeName="offset" values="-1;2" dur="1.4s" repeatCount="indefinite"/></stop><stop offset="100%" stop-color="#222"><animate attributeName="offset" values="0;3" dur="1.4s" repeatCount="indefinite"/></stop></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/></svg>'));

function buildSrcSet(variantList) {
  if (!Array.isArray(variantList) || variantList.length === 0) return undefined;
  return variantList
    .filter(function(v) { return v && v.url && v.width; })
    .sort(function(a, b) { return a.width - b.width; })
    .map(function(v) { return v.url + " " + v.width + "w"; })
    .join(", ");
}

export function DashImage(props) {
  var image = props.image;
  var alt = props.alt || "";
  var sizes = props.sizes || "100vw";
  var className = props.className || "";
  var style = props.style || {};
  var priority = props.priority || false;
  var noBlur = props.noBlur || false;
  var fill = props.fill || false;
  var onLoad = props.onLoad;
  var onError = props.onError;
  // Drop-in <img>/<Image> compatibility props.
  var src = props.src;
  var width = props.width;
  var height = props.height;
  var loadingProp = props.loading;

  // Everything the caller passed that this component does not name itself.
  //
  // The type declaration says DashImageProps extends ImgHTMLAttributes, so
  // TypeScript accepts title, id, aria-*, data-*, crossOrigin, referrerPolicy
  // and the rest. The implementation named thirteen props and dropped the
  // remainder on the floor, which meant tsc actively told callers it was safe
  // to pass an attribute that would silently vanish at runtime.
  //
  // That is worse than an undeclared prop: a fleet sweep converting raw <img>
  // tags found an `aria-hidden="true"` that would have disappeared on
  // conversion, taking a real accessibility marker with it, and a `title`
  // tooltip that already had. Forwarding the rest makes the declaration true.
  var OWN_PROPS = {
    image: 1, alt: 1, sizes: 1, className: 1, style: 1, priority: 1,
    noBlur: 1, fill: 1, onLoad: 1, onError: 1, src: 1, width: 1,
    height: 1, loading: 1,
  };
  var passthrough = {};
  for (var key in props) {
    if (Object.prototype.hasOwnProperty.call(props, key) && !OWN_PROPS[key]) {
      passthrough[key] = props[key];
    }
  }

  var _loaded = useState(false);
  var loaded = _loaded[0];
  var setLoaded = _loaded[1];

  var _variantError = useState(false);
  var variantError = _variantError[0];
  var setVariantError = _variantError[1];

  var imgRef = useRef(null);

  useEffect(function() {
    if (imgRef.current && imgRef.current.complete) setLoaded(true);
  }, []);

  // Accept a bare `src` URL as a drop-in replacement for <img>/<Image>: when no
  // image-data object is supplied we synthesize a minimal one so DashImage can
  // be used anywhere. The responsive variant srcset + LQIP blur-up only kick in
  // when real image data (carrying variants) is passed via `image` — a plain
  // url renders the original (still lazy/decoded), which the build step /
  // backend can later upgrade by supplying variants for that url.
  if ((!image || !image.url) && src) image = { url: src };
  if (!image || !image.url) return null;

  var variants = !variantError && image.variants_ready ? image.variants : null;
  var webpSet = variants ? buildSrcSet(variants.webp) : undefined;

  var sorted = (variants && variants.webp || [])
    .filter(function(v) { return v && v.url && v.width; })
    .sort(function(a, b) { return a.width - b.width; });
  var primarySrc = sorted.length
    ? (sorted.find(function(v) { return v.width >= 1024; }) || sorted[sorted.length - 1]).url
    : image.url;

  var handleError = function(e) {
    if (!variantError) setVariantError(true);
    setLoaded(true);
    if (onError) onError(e);
  };

  var handleLoad = function(e) {
    setLoaded(true);
    if (onLoad) onLoad(e);
  };

  var blur = !loaded && !noBlur
    ? (image.lqip || (sorted.length ? SHIMMER_SVG : null))
    : null;

  var mergedStyle = Object.assign(
    {},
    blur ? { backgroundImage: 'url("' + blur + '")', backgroundSize: "cover", backgroundPosition: "center" } : {},
    fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : {},
    style
  );

  // `passthrough` is spread first on purpose: srcSet, sizes and the load
  // handlers are what this component exists to compute, and a caller passing
  // one of them by accident must not win over the variant pipeline.
  return React.createElement("img", Object.assign({}, passthrough, {
    ref: imgRef,
    src: primarySrc,
    srcSet: webpSet,
    sizes: sizes,
    alt: alt,
    width: fill ? undefined : width,
    height: fill ? undefined : height,
    loading: loadingProp || (priority ? "eager" : "lazy"),
    decoding: "async",
    fetchPriority: priority ? "high" : undefined,
    onLoad: handleLoad,
    onError: handleError,
    className: className,
    style: mergedStyle,
  }));
}

export default DashImage;

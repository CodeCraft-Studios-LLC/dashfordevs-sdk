"use client";

/**
 * SignaturePad — vanilla HTML5 canvas signature capture.
 *
 * Captures a freehand signature with mouse, touch, or stylus via the
 * pointer-events API. Emits a base64 PNG `data:` URL through `onChange`.
 * Empty value === empty string so callers can distinguish "blank" from
 * "drawn".
 *
 * Why no library:
 *   We deliberately avoid signature_pad / react-signature-canvas — they
 *   pull in their own deps and need a wrapper anyway. The pointer-events
 *   API gives us mouse + touch + stylus in ~100 lines.
 *
 * The data URL is what the storefront submits to the backend. The
 * backend stores it on the signature column, the same column it uses
 * for typed signatures, so the field is value-agnostic. The dashboard's
 * submission viewer renders any value starting with `data:image/` as <img>.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export const SignaturePad = forwardRef(function SignaturePad(
  {
    value,
    onChange,
    width = 480,
    height = 160,
    className = "",
    style,
    strokeColor = "#0A2540",
    backgroundColor = "transparent",
    disabled = false,
    clearLabel = "Clear",
    placeholder = "Sign above",
    signedLabel = "Signed",
    showStatus = true,
  },
  ref,
) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const dirtyRef = useRef(false);
  const [hasContent, setHasContent] = useState(false);

  const getCanvas = () => canvasRef.current;
  const getCtx = () => {
    const c = getCanvas();
    if (!c) return null;
    return c.getContext("2d");
  };

  // HiDPI: scale the drawing buffer so strokes stay crisp on retina /
  // mobile displays. CSS box stays at width × height.
  useEffect(() => {
    const c = getCanvas();
    if (!c) return;
    const dpr =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    c.width = width * dpr;
    c.height = height * dpr;
    c.style.width = `${width}px`;
    c.style.height = `${height}px`;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = strokeColor;

    if (value && typeof value === "string" && value.startsWith("data:image/")) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        setHasContent(true);
        dirtyRef.current = true;
      };
      img.src = value;
    } else {
      ctx.clearRect(0, 0, width, height);
      setHasContent(false);
      dirtyRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, strokeColor]);

  const pointFromEvent = (e) => {
    const c = getCanvas();
    if (!c) return null;
    const rect = c.getBoundingClientRect();
    return {
      x: (e.clientX || 0) - rect.left,
      y: (e.clientY || 0) - rect.top,
    };
  };

  const onPointerDown = (e) => {
    if (disabled) return;
    e.preventDefault();
    const c = getCanvas();
    if (!c) return;
    try {
      c.setPointerCapture(e.pointerId);
    } catch (_) {
      // setPointerCapture can throw on some old browsers; non-fatal.
    }
    drawingRef.current = true;
    lastPointRef.current = pointFromEvent(e);
    const ctx = getCtx();
    const p = lastPointRef.current;
    if (!ctx || !p) return;
    // Single-tap dot — paint a tiny circle so the mark is visible
    // even if the user lifts immediately.
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.2, 0, 2 * Math.PI);
    ctx.fillStyle = strokeColor;
    ctx.fill();
    dirtyRef.current = true;
    setHasContent(true);
  };

  const onPointerMove = (e) => {
    if (disabled || !drawingRef.current) return;
    const ctx = getCtx();
    const last = lastPointRef.current;
    const p = pointFromEvent(e);
    if (!ctx || !last || !p) return;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPointRef.current = p;
  };

  const finishStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    const c = getCanvas();
    if (c && onChange) onChange(c.toDataURL("image/png"));
  };

  const clear = useCallback(() => {
    const ctx = getCtx();
    const c = getCanvas();
    if (!ctx || !c) return;
    ctx.clearRect(0, 0, c.width, c.height);
    dirtyRef.current = false;
    setHasContent(false);
    if (onChange) onChange("");
  }, [onChange]);

  useImperativeHandle(
    ref,
    () => ({
      clear,
      isEmpty: () => !dirtyRef.current,
      toDataURL: () => {
        const c = getCanvas();
        return c ? c.toDataURL("image/png") : "";
      },
    }),
    [clear],
  );

  const wrapperStyle = {
    display: "inline-flex",
    flexDirection: "column",
    gap: 8,
    ...(style || {}),
  };

  const canvasStyle = {
    width,
    height,
    background: backgroundColor,
    borderRadius: 6,
    border: "1px solid rgba(10, 37, 64, 0.18)",
    touchAction: "none",
    cursor: disabled ? "default" : "crosshair",
    opacity: disabled ? 0.6 : 1,
  };

  return (
    <div className={className} style={wrapperStyle}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
        onPointerLeave={finishStroke}
        style={canvasStyle}
      />
      {!disabled && showStatus && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            fontSize: 12,
            color: "rgba(10, 37, 64, 0.6)",
          }}
        >
          <span>{hasContent ? signedLabel : placeholder}</span>
          <button
            type="button"
            onClick={clear}
            disabled={!hasContent}
            style={{
              fontSize: 12,
              padding: "4px 8px",
              borderRadius: 4,
              border: "1px solid rgba(10, 37, 64, 0.18)",
              background: "transparent",
              cursor: hasContent ? "pointer" : "not-allowed",
              opacity: hasContent ? 1 : 0.5,
            }}
          >
            {clearLabel}
          </button>
        </div>
      )}
    </div>
  );
});

export default SignaturePad;

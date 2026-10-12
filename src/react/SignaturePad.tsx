"use client";

/**
 * SignaturePad - canvas signature capture (mouse, touch, stylus via pointer
 * events). Emits a base64 PNG data URL through onChange; "" means empty.
 */

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

export interface SignaturePadHandle {
  /** Wipe the canvas and emit "" to onChange. */
  clear: () => void;
  /** True if no strokes have been drawn since the last clear. */
  isEmpty: () => boolean;
  /** Current canvas as a base64 PNG data URL. */
  toDataURL: () => string;
}

export interface SignaturePadProps {
  value?: string;
  onChange?: (value: string) => void;
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
  strokeColor?: string;
  backgroundColor?: string;
  disabled?: boolean;
  clearLabel?: string;
  placeholder?: string;
  signedLabel?: string;
  showStatus?: boolean;
}

export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad(
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
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const dirtyRef = useRef(false);
  const [hasContent, setHasContent] = useState(false);

  const getCanvas = () => canvasRef.current;
  const getCtx = () => {
    const c = getCanvas();
    return c ? c.getContext("2d") : null;
  };

  useEffect(() => {
    const c = getCanvas();
    if (!c) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
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
    // Intentionally keyed on size/colour only (v1 behaviour): value changes repaint via strokes.
  }, [width, height, strokeColor]);

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = getCanvas();
    if (!c) return null;
    const rect = c.getBoundingClientRect();
    return { x: (e.clientX || 0) - rect.left, y: (e.clientY || 0) - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.preventDefault();
    const c = getCanvas();
    if (!c) return;
    try {
      c.setPointerCapture(e.pointerId);
    } catch {
      /* old browsers */
    }
    drawingRef.current = true;
    lastPointRef.current = pointFromEvent(e);
    const ctx = getCtx();
    const p = lastPointRef.current;
    if (!ctx || !p) return;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.2, 0, 2 * Math.PI);
    ctx.fillStyle = strokeColor;
    ctx.fill();
    dirtyRef.current = true;
    setHasContent(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
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
    [clear]
  );

  const wrapperStyle: React.CSSProperties = { display: "inline-flex", flexDirection: "column", gap: 8, ...(style || {}) };

  const canvasStyle: React.CSSProperties = {
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

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { buildAuthHeaders } from "../client";

export type InpaintCanvasHandle = {
  exportMaskedImage: (options?: { invert?: boolean }) => Promise<{
    dataUrl: string;
    maskDataUrl: string;
    width: number;
    height: number;
    hasMask: boolean;
  }>;
  clearMask: () => void;
  undo: () => void;
};

type Point = { x: number; y: number };

type InpaintCanvasProps = {
  imageSrc: string;
  /** URL to fetch image bytes from (avoids S3 CORS). Falls back to imageSrc. */
  fetchSrc?: string;
  brushSize: number;
  mode: "paint" | "erase";
  showMask: boolean;
};

export const InpaintCanvas = forwardRef<InpaintCanvasHandle, InpaintCanvasProps>(
  function InpaintCanvas(props, ref) {
    const imageRef = useRef<HTMLImageElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawingRef = useRef(false);
    const lastPointRef = useRef<Point | null>(null);
    const historyRef = useRef<ImageData[]>([]);
    const [localSrc, setLocalSrc] = useState<string | null>(null);

    useEffect(() => {
      let active = true;
      let objectUrl: string | null = null;
      const fetchUrl = props.fetchSrc ?? props.imageSrc;
      (async () => {
        try {
          const res = await fetch(fetchUrl, { headers: buildAuthHeaders(), credentials: "include" });
          if (!res.ok) throw new Error("Failed to load image");
          const blob = await res.blob();
          if (!active) return;
          objectUrl = URL.createObjectURL(blob);
          setLocalSrc(objectUrl);
        } catch {
          if (active) setLocalSrc(props.imageSrc);
        }
      })();
      return () => {
        active = false;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }, [props.imageSrc, props.fetchSrc]);

    const resetMask = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      historyRef.current = [];
    }, []);

    const handleImageLoad = useCallback(() => {
      const img = imageRef.current;
      const canvas = canvasRef.current;
      if (!img || !canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      resetMask();
    }, [resetMask]);

    const clampMaskAlpha = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;
      for (let i = 3; i < d.length; i += 4) {
        d[i] = d[i] > 128 ? 255 : 0;
      }
      ctx.putImageData(imageData, 0, 0);
    }, []);

    const saveHistory = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
      historyRef.current.push(snapshot);
      if (historyRef.current.length > 20) historyRef.current.shift();
    }, []);

    const getPointFromEvent = useCallback((e: React.PointerEvent<HTMLCanvasElement>): Point | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    }, []);

    const drawStroke = useCallback((from: Point, to: Point) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(1, props.brushSize);
      ctx.globalCompositeOperation = props.mode === "erase" ? "destination-out" : "source-over";
      ctx.strokeStyle = "#ef4444";
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();
    }, [props.brushSize, props.mode]);

    const drawPoint = useCallback((pt: Point) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.save();
      ctx.globalCompositeOperation = props.mode === "erase" ? "destination-out" : "source-over";
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, Math.max(1, props.brushSize) / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }, [props.brushSize, props.mode]);

    const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
      const pt = getPointFromEvent(e);
      if (!pt) return;
      saveHistory();
      drawingRef.current = true;
      lastPointRef.current = pt;
      drawPoint(pt);
      e.currentTarget.setPointerCapture(e.pointerId);
    }, [drawPoint, getPointFromEvent, saveHistory]);

    const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      const pt = getPointFromEvent(e);
      const last = lastPointRef.current;
      if (!pt || !last) return;
      drawStroke(last, pt);
      lastPointRef.current = pt;
    }, [drawStroke, getPointFromEvent]);

    const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      lastPointRef.current = null;
      clampMaskAlpha();
      e.currentTarget.releasePointerCapture(e.pointerId);
    }, [clampMaskAlpha]);

    const undo = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const prev = historyRef.current.pop();
      if (!prev) return;
      ctx.putImageData(prev, 0, 0);
    }, []);

    useImperativeHandle(ref, () => ({
      exportMaskedImage: async (options) => {
        const canvas = canvasRef.current;
        const img = imageRef.current;
        if (!canvas || !img) throw new Error("Mask editor not ready");
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Mask editor not ready");
        const width = canvas.width;
        const height = canvas.height;
        if (width <= 0 || height <= 0) throw new Error("Mask editor not ready");
        const maskData = ctx.getImageData(0, 0, width, height);

        let hasMask = false;
        for (let i = 3; i < maskData.data.length; i += 4) {
          if (maskData.data[i] > 0) {
            hasMask = true;
            break;
          }
        }

        // Export the original image fully opaque (no alpha channel manipulation)
        const imgCanvas = document.createElement("canvas");
        imgCanvas.width = width;
        imgCanvas.height = height;
        const imgCtx = imgCanvas.getContext("2d");
        if (!imgCtx) throw new Error("Mask editor not ready");
        imgCtx.drawImage(img, 0, 0, width, height);
        const dataUrl = imgCanvas.toDataURL("image/png");

        // Export a separate binary mask image (white = inpaint area, black = keep)
        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = width;
        maskCanvas.height = height;
        const maskCtx = maskCanvas.getContext("2d");
        if (!maskCtx) throw new Error("Mask editor not ready");
        const maskOutput = maskCtx.createImageData(width, height);
        const invert = options?.invert === true;
        for (let i = 0; i < maskData.data.length; i += 4) {
          const maskAlpha = maskData.data[i + 3] ?? 0;
          const binary = maskAlpha > 128 ? 255 : 0;
          // When invert=true (default): painted area should be white (inpaint region)
          // painted area has maskAlpha>128 → binary=255 → invert: 255-255=0 → black (keep)
          // Actually, re-examine: with invert=true, the OLD code did alpha = 255-binary
          // painted=255 → alpha=0 (transparent=inpaint). Unpainted=0 → alpha=255 (opaque=keep).
          // For the mask image: white=inpaint, black=keep.
          // So with invert=true: painted area → white mask, unpainted → black mask.
          const maskValue = invert ? binary : 255 - binary;
          maskOutput.data[i] = maskValue;     // R
          maskOutput.data[i + 1] = maskValue; // G
          maskOutput.data[i + 2] = maskValue; // B
          maskOutput.data[i + 3] = 255;       // A (fully opaque)
        }
        maskCtx.putImageData(maskOutput, 0, 0);
        const maskDataUrl = maskCanvas.toDataURL("image/png");

        return { dataUrl, maskDataUrl, width, height, hasMask };
      },
      clearMask: resetMask,
      undo
    }), [resetMask, undo]);

    return (
      <div className="relative w-full overflow-hidden rounded-xl border border-zinc-200 bg-zinc-950/20 dark:border-zinc-800">
        <img
          ref={imageRef}
          src={localSrc ?? undefined}
          alt="Inpaint base"
          className="block w-full h-auto"
          onLoad={handleImageLoad}
          crossOrigin="anonymous"
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none"
          style={{ opacity: props.showMask ? 0.9 : 0 }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      </div>
    );
  }
);

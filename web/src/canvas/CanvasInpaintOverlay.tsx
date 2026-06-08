import { useCallback, useEffect, useRef, useState } from "react";
import { TbBrush, TbEraser, TbArrowBackUp, TbX, TbSend } from "react-icons/tb";
import { buildAuthHeaders } from "../client";
import type { ApiBaseUrl } from "../client";
import { assetProxyUrl } from "./ImageNode";
import type { CanvasNode, CanvasViewport } from "./types";
import { extractError } from "../utils/extractError";

type Point = { x: number; y: number };

type Props = {
  node: CanvasNode;
  viewport: CanvasViewport;
  apiBaseUrl: ApiBaseUrl;
  onComplete: (src: string, naturalWidth: number, naturalHeight: number) => void;
  onCancel: () => void;
};

export function CanvasInpaintOverlay({ node, viewport, apiBaseUrl, onComplete, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const historyRef = useRef<ImageData[]>([]);

  const [loaded, setLoaded] = useState(false);
  const [brushSize, setBrushSize] = useState(30);
  const [mode, setMode] = useState<"paint" | "erase">("paint");
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cursorPos, setCursorPos] = useState<Point | null>(null);

  // Screen position & size of the overlay, matching the node
  const screenX = node.x * viewport.scale + viewport.x;
  const screenY = node.y * viewport.scale + viewport.y;
  const screenW = node.width * viewport.scale;
  const screenH = node.height * viewport.scale;

  // Load image via API proxy (avoids S3 CORS), falling back to direct fetch
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    (async () => {
      try {
        const proxyUrl = assetProxyUrl(apiBaseUrl, node);
        const fetchUrl = proxyUrl ?? node.src!;
        const res = await fetch(fetchUrl, { headers: buildAuthHeaders(), credentials: "include" });
        if (!res.ok) throw new Error("Failed to load image");
        const blob = await res.blob();
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        const img = new window.Image();
        img.onload = () => {
          if (!active) return;
          imageRef.current = img;
          const canvas = canvasRef.current;
          if (canvas) {
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
          }
          setLoaded(true);
        };
        img.src = objectUrl;
      } catch {
        if (active) setLoaded(false);
      }
    })();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [node.src, apiBaseUrl, node.asset, node.generationId]);

  // Drawing helpers (reused from InpaintCanvas pattern)
  const getPointFromEvent = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): Point | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      return {
        x: (e.clientX - rect.left) * (canvas.width / rect.width),
        y: (e.clientY - rect.top) * (canvas.height / rect.height),
      };
    },
    []
  );

  const drawStroke = useCallback(
    (from: Point, to: Point) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(1, brushSize);
      ctx.globalCompositeOperation = mode === "erase" ? "destination-out" : "source-over";
      ctx.strokeStyle = "#ef4444";
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();
    },
    [brushSize, mode]
  );

  const drawPoint = useCallback(
    (pt: Point) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.save();
      ctx.globalCompositeOperation = mode === "erase" ? "destination-out" : "source-over";
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, Math.max(1, brushSize) / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
    [brushSize, mode]
  );

  const saveHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    historyRef.current.push(snapshot);
    if (historyRef.current.length > 20) historyRef.current.shift();
  }, []);

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

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const pt = getPointFromEvent(e);
      if (!pt) return;
      saveHistory();
      drawingRef.current = true;
      lastPointRef.current = pt;
      drawPoint(pt);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [drawPoint, getPointFromEvent, saveHistory]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      const pt = getPointFromEvent(e);
      const last = lastPointRef.current;
      if (!pt || !last) return;
      drawStroke(last, pt);
      lastPointRef.current = pt;
    },
    [drawStroke, getPointFromEvent]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      lastPointRef.current = null;
      clampMaskAlpha();
      e.currentTarget.releasePointerCapture(e.pointerId);
    },
    [clampMaskAlpha]
  );

  const handleUndo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const prev = historyRef.current.pop();
    if (!prev) return;
    ctx.putImageData(prev, 0, 0);
  }, []);

  const exportMaskedImage = useCallback((): { imageDataUrl: string; maskDataUrl: string } | null => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return null;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const { width, height } = canvas;
    const maskData = ctx.getImageData(0, 0, width, height);

    // Export the original image fully opaque (no alpha manipulation)
    const imgCanvas = document.createElement("canvas");
    imgCanvas.width = width;
    imgCanvas.height = height;
    const imgCtx = imgCanvas.getContext("2d");
    if (!imgCtx) return null;
    imgCtx.drawImage(img, 0, 0);
    const imageDataUrl = imgCanvas.toDataURL("image/png");

    // Export a separate binary mask (white = inpaint area, black = keep)
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return null;
    const maskOutput = maskCtx.createImageData(width, height);
    for (let i = 0; i < maskData.data.length; i += 4) {
      const maskAlpha = maskData.data[i + 3] ?? 0;
      const maskValue = maskAlpha > 128 ? 255 : 0;
      maskOutput.data[i] = maskValue;     // R
      maskOutput.data[i + 1] = maskValue; // G
      maskOutput.data[i + 2] = maskValue; // B
      maskOutput.data[i + 3] = 255;       // A (fully opaque)
    }
    maskCtx.putImageData(maskOutput, 0, 0);
    const maskDataUrl = maskCanvas.toDataURL("image/png");

    return { imageDataUrl, maskDataUrl };
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!prompt.trim() || !node.generationId) return;
    const exported = exportMaskedImage();
    if (!exported) return;

    setSubmitting(true);
    try {
      const { createInpaintAssetVersion } = await import("../client");
      const result = await createInpaintAssetVersion(apiBaseUrl, node.generationId, {
        assetType: "image",
        prompt: prompt.trim(),
        imageDataUrl: exported.imageDataUrl,
        maskDataUrl: exported.maskDataUrl,
      });
      // For now, we mark complete - the SSE system will handle the actual result
      // In a full implementation, we'd listen for the SSE event and update
      onComplete(node.src!, node.naturalWidth, node.naturalHeight);
    } catch (err) {
      console.error("Inpaint failed:", extractError(err, "Unknown error"));
    } finally {
      setSubmitting(false);
    }
  }, [prompt, node, apiBaseUrl, exportMaskedImage, onComplete]);

  return (
    <>
      {/* Darkened backdrop */}
      <div className="absolute inset-0 z-40 bg-black/30" onClick={onCancel} />

      {/* Overlay positioned over the node */}
      <div
        className="absolute z-50"
        style={{ left: screenX, top: screenY, width: screenW, height: screenH }}
      >
        {/* Source image underneath */}
        {loaded && imageRef.current && (
          <img
            src={imageRef.current.src}
            alt=""
            className="absolute inset-0 h-full w-full object-contain"
            draggable={false}
          />
        )}

        {/* Mask canvas on top */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ opacity: 0.5, cursor: "none" }}
          onPointerDown={handlePointerDown}
          onPointerMove={(e) => {
            setCursorPos({ x: e.clientX, y: e.clientY });
            handlePointerMove(e);
          }}
          onPointerUp={handlePointerUp}
          onPointerEnter={(e) => setCursorPos({ x: e.clientX, y: e.clientY })}
          onPointerLeave={() => setCursorPos(null)}
        />

        {/* Custom brush cursor */}
        {cursorPos && (
          <div
            className="pointer-events-none fixed rounded-full border-2"
            style={{
              left: cursorPos.x,
              top: cursorPos.y,
              width: brushSize * (screenW / (canvasRef.current?.width || 1)),
              height: brushSize * (screenH / (canvasRef.current?.height || 1)),
              transform: "translate(-50%, -50%)",
              borderColor: mode === "erase" ? "#3b82f6" : "#ef4444",
              backgroundColor: mode === "erase" ? "rgba(59, 130, 246, 0.1)" : "rgba(239, 68, 68, 0.1)",
            }}
          />
        )}
      </div>

      {/* Toolbar */}
      <div
        className="absolute z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
        style={{ left: screenX + screenW / 2, top: screenY - 56 }}
      >
        <button
          onClick={() => setMode("paint")}
          className={`rounded p-1.5 ${mode === "paint" ? "bg-zinc-200 text-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700"}`}
          title="Paint mask"
        >
          <TbBrush size={16} />
        </button>
        <button
          onClick={() => setMode("erase")}
          className={`rounded p-1.5 ${mode === "erase" ? "bg-zinc-200 text-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700"}`}
          title="Erase mask"
        >
          <TbEraser size={16} />
        </button>

        <div className="h-5 w-px bg-zinc-200 dark:bg-zinc-700" />

        <input
          type="range"
          min={5}
          max={100}
          value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
          className="w-20"
          title={`Brush size: ${brushSize}`}
        />

        <button onClick={handleUndo} className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700" title="Undo">
          <TbArrowBackUp size={16} />
        </button>

        <button onClick={onCancel} className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700" title="Cancel">
          <TbX size={16} />
        </button>
      </div>

      {/* Prompt bar below the image */}
      <div
        className="absolute z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
        style={{ left: screenX + screenW / 2, top: screenY + screenH + 12 }}
      >
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe what to paint..."
          className="w-64 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSubmit();
          }}
        />
        <button
          onClick={() => void handleSubmit()}
          disabled={!prompt.trim() || submitting}
          className="rounded-lg bg-zinc-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {submitting ? "..." : <TbSend size={16} />}
        </button>
      </div>
    </>
  );
}

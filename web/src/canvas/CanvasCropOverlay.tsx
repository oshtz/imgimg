import { useCallback, useEffect, useRef, useState } from "react";
import { TbCheck, TbX, TbArrowBackUp } from "react-icons/tb";
import { buildAuthHeaders } from "../client";
import type { ApiBaseUrl } from "../client";
import { assetProxyUrl } from "./ImageNode";
import type { CanvasNode, CanvasViewport } from "./types";

type CropRect = { x: number; y: number; width: number; height: number };

/** Which edge/corner is being dragged, or "move" for the entire rect. */
type DragHandle =
  | "move"
  | "n" | "s" | "e" | "w"
  | "nw" | "ne" | "sw" | "se"
  | null;

type AspectPreset = "free" | "1:1" | "4:3" | "16:9" | "original";

type Props = {
  node: CanvasNode;
  viewport: CanvasViewport;
  apiBaseUrl: ApiBaseUrl;
  onApply: (crop: CropRect) => void;
  onReset: () => void;
  onCancel: () => void;
};

/** Minimum crop size in source image pixels. */
const MIN_CROP_PX = 16;
/** Size of the corner/edge drag handles (screen pixels). */
const HANDLE_SIZE = 12;
/** Duration of the reset animation in milliseconds. */
const RESET_DURATION_MS = 200;

// ─── Utility functions ──────────────────────────────────────────────────

function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

function simplifiedRatio(w: number, h: number): string | null {
  const rw = Math.round(w);
  const rh = Math.round(h);
  if (rw <= 0 || rh <= 0) return null;
  const d = gcd(rw, rh);
  const a = rw / d;
  const b = rh / d;
  if (a > 50 || b > 50) return null;
  return `${a}:${b}`;
}

/**
 * Non-destructive crop overlay for a single canvas node.
 * Renders an HTML overlay positioned over the selected node with a
 * draggable/resizable crop rectangle. The area outside the crop is dimmed.
 */
export function CanvasCropOverlay({ node, viewport, apiBaseUrl, onApply, onReset, onCancel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  // Crop rect in source-image pixel space (0..naturalWidth, 0..naturalHeight)
  const [crop, setCrop] = useState<CropRect>(() =>
    node.crop ?? { x: 0, y: 0, width: node.naturalWidth, height: node.naturalHeight }
  );

  // Aspect ratio preset
  const [aspectPreset, setAspectPreset] = useState<AspectPreset>("free");
  const aspectPresetRef = useRef(aspectPreset);
  aspectPresetRef.current = aspectPreset;

  // Animated reset state
  const [animatingCrop, setAnimatingCrop] = useState<CropRect | null>(null);
  const isResettingRef = useRef(false);
  const rafRef = useRef(0);

  // The crop rect used for rendering (animated during reset, otherwise the real crop)
  const renderCrop = animatingCrop ?? crop;

  // Drag state
  const dragHandle = useRef<DragHandle>(null);
  const dragStart = useRef<{ mx: number; my: number; crop: CropRect }>({ mx: 0, my: 0, crop: crop });

  // ─── Screen geometry ──────────────────────────────────────────────────
  const screenX = node.x * viewport.scale + viewport.x;
  const screenY = node.y * viewport.scale + viewport.y;
  const screenW = node.width * viewport.scale;
  const screenH = node.height * viewport.scale;

  // Source-to-screen conversion factors
  const sxRatio = screenW / node.naturalWidth;
  const syRatio = screenH / node.naturalHeight;

  // Crop rect in screen-space (relative to the overlay container)
  const cropScreen = {
    x: renderCrop.x * sxRatio,
    y: renderCrop.y * syRatio,
    w: renderCrop.width * sxRatio,
    h: renderCrop.height * syRatio,
  };

  // ─── Load image ───────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    (async () => {
      try {
        const proxyUrl = assetProxyUrl(apiBaseUrl, node);
        const fetchUrl = proxyUrl ?? node.src!;
        const headers = proxyUrl ? { ...buildAuthHeaders() } : {};
        const res = await fetch(fetchUrl, { headers, ...(proxyUrl ? { credentials: "include" as const } : {}) });
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const blob = await res.blob();
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setImgSrc(objectUrl);
        setLoaded(true);
      } catch {
        if (!active) return;
        setImgSrc(node.src!);
        setLoaded(true);
      }
    })();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [node.src, apiBaseUrl, node.asset, node.generationId]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ─── Clamp helper ─────────────────────────────────────────────────────
  const clampCrop = useCallback(
    (c: CropRect): CropRect => {
      let { x, y, width, height } = c;
      // Enforce minimum size
      width = Math.max(MIN_CROP_PX, width);
      height = Math.max(MIN_CROP_PX, height);
      // Clamp to image bounds
      x = Math.max(0, Math.min(x, node.naturalWidth - width));
      y = Math.max(0, Math.min(y, node.naturalHeight - height));
      width = Math.min(width, node.naturalWidth - x);
      height = Math.min(height, node.naturalHeight - y);
      return { x, y, width, height };
    },
    [node.naturalWidth, node.naturalHeight]
  );

  // ─── Apply ────────────────────────────────────────────────────────────
  const handleApply = useCallback(() => {
    // If the crop covers (nearly) the entire image, treat as "no crop"
    const isFullImage =
      crop.x < 1 &&
      crop.y < 1 &&
      Math.abs(crop.width - node.naturalWidth) < 1 &&
      Math.abs(crop.height - node.naturalHeight) < 1;

    if (isFullImage) {
      onReset();
    } else {
      onApply(crop);
    }
  }, [crop, node.naturalWidth, node.naturalHeight, onApply, onReset]);

  const handleApplyRef = useRef(handleApply);
  handleApplyRef.current = handleApply;

  // ─── Animated reset ───────────────────────────────────────────────────
  const handleAnimatedReset = useCallback(() => {
    if (isResettingRef.current) return;
    isResettingRef.current = true;
    const startCrop = { ...crop };
    const endCrop = { x: 0, y: 0, width: node.naturalWidth, height: node.naturalHeight };
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / RESET_DURATION_MS);
      const eased = 1 - (1 - t) * (1 - t); // ease-out quadratic

      setAnimatingCrop({
        x: startCrop.x + (endCrop.x - startCrop.x) * eased,
        y: startCrop.y + (endCrop.y - startCrop.y) * eased,
        width: startCrop.width + (endCrop.width - startCrop.width) * eased,
        height: startCrop.height + (endCrop.height - startCrop.height) * eased,
      });

      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        isResettingRef.current = false;
        setAnimatingCrop(null);
        onReset();
      }
    };

    rafRef.current = requestAnimationFrame(animate);
  }, [crop, node.naturalWidth, node.naturalHeight, onReset]);

  // ─── Aspect ratio preset change ───────────────────────────────────────
  const handlePresetChange = useCallback((preset: AspectPreset) => {
    setAspectPreset(preset);
    if (preset === "free") return;

    let ratio: number;
    switch (preset) {
      case "1:1": ratio = 1; break;
      case "4:3": ratio = 4 / 3; break;
      case "16:9": ratio = 16 / 9; break;
      case "original": ratio = node.naturalWidth / node.naturalHeight; break;
      default: return;
    }

    setCrop(prev => {
      const centerX = prev.x + prev.width / 2;
      const centerY = prev.y + prev.height / 2;
      let newW = prev.width;
      let newH = prev.height;

      if (newW / newH > ratio) {
        newW = newH * ratio;
      } else {
        newH = newW / ratio;
      }

      // Ensure fits within image bounds while preserving ratio
      if (newW > node.naturalWidth) { newW = node.naturalWidth; newH = newW / ratio; }
      if (newH > node.naturalHeight) { newH = node.naturalHeight; newW = newH * ratio; }

      let x = centerX - newW / 2;
      let y = centerY - newH / 2;
      x = Math.max(0, Math.min(x, node.naturalWidth - newW));
      y = Math.max(0, Math.min(y, node.naturalHeight - newH));

      return { x, y, width: newW, height: newH };
    });
  }, [node.naturalWidth, node.naturalHeight]);

  // ─── Keyboard shortcuts ───────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isResettingRef.current) return;

      if (e.key === "Enter") {
        e.preventDefault();
        handleApplyRef.current();
        return;
      }
      // Escape is handled by CanvasWorkspace (resets editMode to "select")

      const arrowKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
      if (!arrowKeys.includes(e.key)) return;

      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      let dx = 0, dy = 0;
      if (e.key === "ArrowLeft") dx = -step;
      if (e.key === "ArrowRight") dx = step;
      if (e.key === "ArrowUp") dy = -step;
      if (e.key === "ArrowDown") dy = step;

      if (e.altKey) {
        // Resize
        setCrop(prev => clampCrop({ ...prev, width: prev.width + dx, height: prev.height + dy }));
      } else {
        // Move
        setCrop(prev => clampCrop({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [clampCrop]);

  // ─── Pointer handlers ────────────────────────────────────────────────
  const handlePointerDown = useCallback(
    (handle: DragHandle, e: React.PointerEvent) => {
      if (isResettingRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      dragHandle.current = handle;
      dragStart.current = { mx: e.clientX, my: e.clientY, crop: { ...crop } };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [crop]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragHandle.current || isResettingRef.current) return;
      const dx = e.clientX - dragStart.current.mx;
      const dy = e.clientY - dragStart.current.my;
      // Convert screen delta to source-image delta
      const sdx = dx / sxRatio;
      const sdy = dy / syRatio;
      const prev = dragStart.current.crop;
      const h = dragHandle.current;

      let next: CropRect;

      if (h === "move") {
        next = { ...prev, x: prev.x + sdx, y: prev.y + sdy };
      } else {
        let { x, y, width, height } = prev;

        // Horizontal edges
        if (h === "w" || h === "nw" || h === "sw") {
          const newX = prev.x + sdx;
          const maxX = prev.x + prev.width - MIN_CROP_PX;
          x = Math.max(0, Math.min(newX, maxX));
          width = prev.x + prev.width - x;
        }
        if (h === "e" || h === "ne" || h === "se") {
          width = Math.max(MIN_CROP_PX, prev.width + sdx);
        }

        // Vertical edges
        if (h === "n" || h === "nw" || h === "ne") {
          const newY = prev.y + sdy;
          const maxY = prev.y + prev.height - MIN_CROP_PX;
          y = Math.max(0, Math.min(newY, maxY));
          height = prev.y + prev.height - y;
        }
        if (h === "s" || h === "sw" || h === "se") {
          height = Math.max(MIN_CROP_PX, prev.height + sdy);
        }

        next = { x, y, width, height };

        // Apply aspect ratio constraint for corner handles
        const isCorner = h === "nw" || h === "ne" || h === "sw" || h === "se";
        if (isCorner) {
          let lockedRatio: number | null = null;
          const preset = aspectPresetRef.current;
          switch (preset) {
            case "1:1": lockedRatio = 1; break;
            case "4:3": lockedRatio = 4 / 3; break;
            case "16:9": lockedRatio = 16 / 9; break;
            case "original": lockedRatio = node.naturalWidth / node.naturalHeight; break;
            default:
              // In free mode, shift+drag locks to current crop's ratio
              if (e.shiftKey) lockedRatio = prev.width / prev.height;
          }

          if (lockedRatio) {
            let w = Math.max(MIN_CROP_PX, next.width);
            let ht = Math.max(MIN_CROP_PX, next.height);

            // Constrain to locked ratio (shrink the over-extended dimension)
            if (w / ht > lockedRatio) {
              w = ht * lockedRatio;
            } else {
              ht = w / lockedRatio;
            }

            // Enforce minimums after ratio constraint
            if (w < MIN_CROP_PX) { w = MIN_CROP_PX; ht = w / lockedRatio; }
            if (ht < MIN_CROP_PX) { ht = MIN_CROP_PX; w = ht * lockedRatio; }

            // Re-anchor to the opposite corner
            const anchorX = (h === "nw" || h === "sw") ? prev.x + prev.width : prev.x;
            const anchorY = (h === "nw" || h === "ne") ? prev.y + prev.height : prev.y;

            next = {
              x: (h === "nw" || h === "sw") ? anchorX - w : anchorX,
              y: (h === "nw" || h === "ne") ? anchorY - ht : anchorY,
              width: w,
              height: ht,
            };
          }
        }
      }

      setCrop(clampCrop(next));
    },
    [sxRatio, syRatio, clampCrop, node.naturalWidth, node.naturalHeight]
  );

  const handlePointerUp = useCallback(() => {
    dragHandle.current = null;
  }, []);

  // ─── Cursor per handle ────────────────────────────────────────────────
  const cursorForHandle = (h: DragHandle): string => {
    switch (h) {
      case "n": case "s": return "ns-resize";
      case "e": case "w": return "ew-resize";
      case "nw": case "se": return "nwse-resize";
      case "ne": case "sw": return "nesw-resize";
      case "move": return "move";
      default: return "default";
    }
  };

  // ─── Render helpers ───────────────────────────────────────────────────

  /** Render a single drag handle at the given screen position. */
  const renderHandle = (handle: DragHandle, left: number, top: number) => (
    <div
      key={handle}
      className="absolute z-10 rounded border-2 border-zinc-500 bg-white shadow-lg transition-transform duration-100 hover:scale-125"
      style={{
        left: left - HANDLE_SIZE / 2,
        top: top - HANDLE_SIZE / 2,
        width: HANDLE_SIZE,
        height: HANDLE_SIZE,
        cursor: cursorForHandle(handle),
      }}
      onPointerDown={(e) => handlePointerDown(handle, e)}
    />
  );

  /** Render an invisible edge hitbox for easier dragging. */
  const renderEdge = (handle: DragHandle, style: React.CSSProperties) => (
    <div
      key={handle}
      className="absolute z-10"
      style={{ ...style, cursor: cursorForHandle(handle) }}
      onPointerDown={(e) => handlePointerDown(handle, e)}
    />
  );

  const edgeThickness = 10;

  // ─── Dimension feedback ───────────────────────────────────────────────
  const cropW = Math.round(crop.width);
  const cropH = Math.round(crop.height);
  const ratio = simplifiedRatio(cropW, cropH);
  const areaPercent = Math.round((crop.width * crop.height) / (node.naturalWidth * node.naturalHeight) * 100);

  // ─── Smart toolbar positioning ────────────────────────────────────────
  const toolbarGap = 12;
  const toolbarHeight = 44;
  const toolbarTopY = screenY - toolbarGap;
  const flipBelow = toolbarTopY - toolbarHeight < 0;
  const toolbarY = flipBelow ? screenY + screenH + toolbarGap : toolbarTopY;
  const toolbarCenterX = screenX + screenW / 2;
  // Clamp horizontal center so toolbar stays within viewport
  const clampedToolbarX = Math.max(220, Math.min(toolbarCenterX, window.innerWidth - 220));

  // ─── Aspect preset config ─────────────────────────────────────────────
  const presets: { key: AspectPreset; label: string }[] = [
    { key: "free", label: "Free" },
    { key: "1:1", label: "1:1" },
    { key: "4:3", label: "4:3" },
    { key: "16:9", label: "16:9" },
    { key: "original", label: "Orig" },
  ];

  return (
    <>
      {/* Darkened backdrop */}
      <div className="absolute inset-0 z-40 bg-black/30" onClick={onCancel} />

      {/* Overlay container positioned over the node */}
      <div
        ref={containerRef}
        className="absolute z-50 select-none"
        style={{ left: screenX, top: screenY, width: screenW, height: screenH }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Source image */}
        {loaded && imgSrc && (
          <img
            src={imgSrc}
            alt=""
            className="absolute inset-0 h-full w-full object-fill"
            draggable={false}
          />
        )}

        {/* Dimming overlay — 4 rects around the crop area */}
        <div
          className="pointer-events-none absolute bg-black/50"
          style={{ left: 0, top: 0, width: cropScreen.x, height: screenH }}
        />
        <div
          className="pointer-events-none absolute bg-black/50"
          style={{ left: cropScreen.x + cropScreen.w, top: 0, right: 0, height: screenH }}
        />
        <div
          className="pointer-events-none absolute bg-black/50"
          style={{ left: cropScreen.x, top: 0, width: cropScreen.w, height: cropScreen.y }}
        />
        <div
          className="pointer-events-none absolute bg-black/50"
          style={{ left: cropScreen.x, top: cropScreen.y + cropScreen.h, width: cropScreen.w, bottom: 0 }}
        />

        {/* Crop rectangle border */}
        <div
          className="absolute border-2 border-white/90"
          style={{
            left: cropScreen.x,
            top: cropScreen.y,
            width: cropScreen.w,
            height: cropScreen.h,
          }}
        >
          {/* Rule-of-thirds grid lines */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/3 top-0 h-full w-px bg-white/30" />
            <div className="absolute left-2/3 top-0 h-full w-px bg-white/30" />
            <div className="absolute left-0 top-1/3 h-px w-full bg-white/30" />
            <div className="absolute left-0 top-2/3 h-px w-full bg-white/30" />
          </div>

          {/* Move handle (entire crop area) */}
          <div
            className="absolute inset-0 z-0"
            style={{ cursor: "move" }}
            onPointerDown={(e) => handlePointerDown("move", e)}
          />
        </div>

        {/* Edge hitboxes */}
        {renderEdge("n", {
          left: cropScreen.x + edgeThickness,
          top: cropScreen.y - edgeThickness / 2,
          width: cropScreen.w - edgeThickness * 2,
          height: edgeThickness,
        })}
        {renderEdge("s", {
          left: cropScreen.x + edgeThickness,
          top: cropScreen.y + cropScreen.h - edgeThickness / 2,
          width: cropScreen.w - edgeThickness * 2,
          height: edgeThickness,
        })}
        {renderEdge("w", {
          left: cropScreen.x - edgeThickness / 2,
          top: cropScreen.y + edgeThickness,
          width: edgeThickness,
          height: cropScreen.h - edgeThickness * 2,
        })}
        {renderEdge("e", {
          left: cropScreen.x + cropScreen.w - edgeThickness / 2,
          top: cropScreen.y + edgeThickness,
          width: edgeThickness,
          height: cropScreen.h - edgeThickness * 2,
        })}

        {/* Corner handles */}
        {renderHandle("nw", cropScreen.x, cropScreen.y)}
        {renderHandle("ne", cropScreen.x + cropScreen.w, cropScreen.y)}
        {renderHandle("sw", cropScreen.x, cropScreen.y + cropScreen.h)}
        {renderHandle("se", cropScreen.x + cropScreen.w, cropScreen.y + cropScreen.h)}

        {/* Crop dimensions label */}
        <div
          className="pointer-events-none absolute z-20 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white"
          style={{
            left: cropScreen.x + cropScreen.w / 2,
            top: cropScreen.y + cropScreen.h + 6,
            transform: "translateX(-50%)",
          }}
        >
          {cropW} x {cropH}
          <span className="text-white/60">
            {ratio ? ` (${ratio})` : ""}
            {` \u00b7 ${areaPercent}%`}
          </span>
        </div>
      </div>

      {/* ─── Toolbar above (or below) the crop area ──────────────── */}
      <div
        className={`absolute z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-800 ${flipBelow ? "" : "-translate-y-full"}`}
        style={{ left: clampedToolbarX, top: toolbarY }}
      >
        {/* Aspect ratio presets */}
        <div className="flex items-center gap-0.5">
          {presets.map((p) => (
            <button
              key={p.key}
              onClick={() => handlePresetChange(p.key)}
              className={`rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors ${
                aspectPreset === p.key
                  ? "bg-zinc-500 text-white"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="h-5 w-px bg-zinc-200 dark:bg-zinc-700" />

        {/* Reset crop */}
        {node.crop && (
          <>
            <button
              onClick={handleAnimatedReset}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
              title="Reset crop (show full image)"
            >
              <TbArrowBackUp size={14} />
              Reset
            </button>
            <div className="h-5 w-px bg-zinc-200 dark:bg-zinc-700" />
          </>
        )}

        {/* Cancel */}
        <button
          onClick={onCancel}
          className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700"
          title="Cancel (Esc)"
        >
          <TbX size={16} />
        </button>

        {/* Apply */}
        <button
          onClick={handleApply}
          className="rounded bg-zinc-500 p-1.5 text-white transition-colors hover:bg-zinc-600"
          title="Apply crop (Enter)"
        >
          <TbCheck size={16} />
        </button>
      </div>
    </>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { TbMinus, TbPlus, TbLoader } from "react-icons/tb";

const MIN_SCALE = 0.05;
const MAX_SCALE = 8;
const ZOOM_FACTOR = 1.15;
const DRAG_THRESHOLD = 3;
const PAN_MARGIN = 50; // px of image that must remain visible

type Props = {
  src: string;
  alt: string;
  onLoad?: () => void;
  onError?: () => void;
  imgClassName?: string;
  loading?: boolean;
  resetKey?: string | null;
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function ZoomableImage({
  src,
  alt,
  onLoad,
  onError,
  imgClassName,
  loading,
  resetKey,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });

  // scale = absolute pixel ratio (1.0 = 1 image px = 1 screen px)
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);

  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const hasDragged = useRef(false);

  // fitScale: scale at which the image fits the container
  const fitScale =
    naturalSize.w > 0 && naturalSize.h > 0 && containerSize.w > 0 && containerSize.h > 0
      ? Math.min(containerSize.w / naturalSize.w, containerSize.h / naturalSize.h, 1)
      : 1;

  const isAtFit = Math.abs(scale - fitScale) < 0.001;

  // Clamp translate so image can't be panned entirely out of view
  const clampTranslate = useCallback(
    (newTx: number, newTy: number, s: number) => {
      if (naturalSize.w === 0) return { tx: newTx, ty: newTy };
      const displayW = naturalSize.w * s;
      const displayH = naturalSize.h * s;
      // How much the image extends beyond the container
      const overflowX = Math.max(0, displayW - containerSize.w);
      const overflowY = Math.max(0, displayH - containerSize.h);
      return {
        tx: clamp(newTx, -overflowX / 2 - PAN_MARGIN, overflowX / 2 + PAN_MARGIN),
        ty: clamp(newTy, -overflowY / 2 - PAN_MARGIN, overflowY / 2 + PAN_MARGIN),
      };
    },
    [naturalSize, containerSize]
  );

  // Reset zoom to fit
  const resetToFit = useCallback(() => {
    setScale(fitScale);
    setTx(0);
    setTy(0);
  }, [fitScale]);

  // Observe container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setContainerSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // When fitScale changes and user is at fit, stay at fit
  useEffect(() => {
    if (isAtFit || scale === 1) {
      // 1 is the initial default before naturalSize is known
      setScale(fitScale);
      setTx(0);
      setTy(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitScale]);

  // Reset when resetKey changes
  useEffect(() => {
    setScale(fitScale);
    setTx(0);
    setTy(0);
    setNaturalSize({ w: 0, h: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Refs for current values so wheel handler reads latest state without re-attaching
  const scaleRef = useRef(scale);
  const txRef = useRef(tx);
  const tyRef = useRef(ty);
  const fitScaleRef = useRef(fitScale);
  scaleRef.current = scale;
  txRef.current = tx;
  tyRef.current = ty;
  fitScaleRef.current = fitScale;

  // Wheel zoom — imperative listener for passive:false (React synthetic onWheel is passive in Chrome)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (fitScaleRef.current >= 1) return; // No zoom for images that fit naturally
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left - containerSize.w / 2;
      const my = e.clientY - rect.top - containerSize.h / 2;
      const direction = e.deltaY < 0 ? 1 : -1;
      const factor = direction > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;

      const oldScale = scaleRef.current;
      const newScale = clamp(oldScale * factor, MIN_SCALE, MAX_SCALE);
      const ratio = newScale / oldScale;
      const newTx = mx - (mx - txRef.current) * ratio;
      const newTy = my - (my - tyRef.current) * ratio;
      const clamped = clampTranslate(newTx, newTy, newScale);

      setScale(newScale);
      setTx(clamped.tx);
      setTy(clamped.ty);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [containerSize, clampTranslate]);

  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      onLoad?.();
    },
    [onLoad]
  );

  // Double-click: toggle between fit and 1:1 (or 2x if image is small)
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (fitScale >= 1) return; // No zoom for images that fit naturally
      if (isAtFit) {
        // Zoom to 1:1, or 2x if already larger than container
        const targetScale = fitScale >= 1 ? 2 : 1;
        const rect = containerRef.current!.getBoundingClientRect();
        const mx = e.clientX - rect.left - containerSize.w / 2;
        const my = e.clientY - rect.top - containerSize.h / 2;
        const ratio = targetScale / scale;
        const newTx = mx - (mx - tx) * ratio;
        const newTy = my - (my - ty) * ratio;
        const clamped = clampTranslate(newTx, newTy, targetScale);
        setScale(targetScale);
        setTx(clamped.tx);
        setTy(clamped.ty);
      } else {
        resetToFit();
      }
    },
    [isAtFit, fitScale, scale, tx, ty, containerSize, clampTranslate, resetToFit]
  );

  // Pan: mouse down — only start panning when clicking on the image itself
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isAtFit) return;
      if (imgRef.current && !imgRef.current.contains(e.target as Node)) return;
      e.preventDefault();
      setIsPanning(true);
      hasDragged.current = false;
      panStart.current = { x: e.clientX, y: e.clientY, tx, ty };
    },
    [isAtFit, tx, ty]
  );

  // Pan: mouse move + mouse up (document-level)
  useEffect(() => {
    if (!isPanning) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        hasDragged.current = true;
      }
      const clamped = clampTranslate(
        panStart.current.tx + dx,
        panStart.current.ty + dy,
        scale
      );
      setTx(clamped.tx);
      setTy(clamped.ty);
    };
    const onUp = () => setIsPanning(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [isPanning, scale, clampTranslate]);

  // Click handler — only capture clicks on the image itself when zoomed in
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (fitScale < 1 && !isAtFit && imgRef.current && imgRef.current.contains(e.target as Node)) {
        e.stopPropagation();
      }
    },
    [fitScale, isAtFit]
  );

  // Zoom buttons
  const zoomIn = useCallback(() => {
    const newScale = clamp(scale * ZOOM_FACTOR, MIN_SCALE, MAX_SCALE);
    const clamped = clampTranslate(tx * (newScale / scale), ty * (newScale / scale), newScale);
    setScale(newScale);
    setTx(clamped.tx);
    setTy(clamped.ty);
  }, [scale, tx, ty, clampTranslate]);

  const zoomOut = useCallback(() => {
    const newScale = clamp(scale / ZOOM_FACTOR, MIN_SCALE, MAX_SCALE);
    const clamped = clampTranslate(tx * (newScale / scale), ty * (newScale / scale), newScale);
    setScale(newScale);
    setTx(clamped.tx);
    setTy(clamped.ty);
  }, [scale, tx, ty, clampTranslate]);

  // The <img> already fits via max-w-full max-h-full object-contain at the "fit" baseline.
  // We apply CSS transform relative to that: scale(scale / fitScale) and translate.
  const cssScale = fitScale > 0 ? scale / fitScale : 1;
  const pct = Math.round(scale * 100);

  const cursor = isAtFit ? "default" : isPanning ? "grabbing" : "grab";

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      style={{ cursor }}
    >
      <img
        ref={imgRef}
        className={[
          "max-h-full max-w-full object-contain transition-opacity duration-300",
          loading ? "opacity-40" : "opacity-100",
          imgClassName ?? "",
        ].join(" ")}
        src={src}
        alt={alt}
        draggable={false}
        onLoad={handleImageLoad}
        onError={onError}
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${cssScale})`,
          transformOrigin: "center center",
          willChange: "transform",
        }}
      />

      {/* Loading spinner overlay */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2">
            <TbLoader className="h-8 w-8 text-white animate-spin drop-shadow-lg" />
            <span className="text-sm text-white drop-shadow-lg">Loading...</span>
          </div>
        </div>
      )}

      {/* Zoom controls — bottom-left, only for images larger than container */}
      {naturalSize.w > 0 && !loading && fitScale < 1 && (
        <div className="absolute bottom-3 left-3 flex items-center gap-0.5 rounded-lg bg-black/50 px-1 py-0.5 backdrop-blur-sm">
          <button
            onClick={(e) => {
              e.stopPropagation();
              zoomOut();
            }}
            className="rounded p-1 text-zinc-300 hover:bg-white/10 hover:text-white"
            title="Zoom out"
          >
            <TbMinus size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              resetToFit();
            }}
            className="min-w-[40px] rounded px-1 py-0.5 text-center text-xs font-medium text-zinc-200 hover:bg-white/10 hover:text-white"
            title="Reset to fit"
          >
            {pct}%
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              zoomIn();
            }}
            className="rounded p-1 text-zinc-300 hover:bg-white/10 hover:text-white"
            title="Zoom in"
          >
            <TbPlus size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

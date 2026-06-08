import { useCallback, useEffect, useRef, useState } from "react";
import { TbChevronDown, TbChevronUp } from "react-icons/tb";
import type { OutpaintParams } from "../GenerationDetailPanel";
import {
  OUTPAINT_ASPECT_RATIOS,
  type OutpaintAspectRatio,
  calculateExpansionForAspectRatio,
} from "./outpaintUtils";

/**
 * Interactive drag-to-uncrop component
 * Users drag edges outward to expand the canvas
 */
export function OutpaintCanvas(props: {
  imageSrc: string;
  params: OutpaintParams;
  onParamsChange: (params: OutpaintParams) => void;
  selectedAspectRatio: OutpaintAspectRatio;
  onAspectRatioChange: (ar: OutpaintAspectRatio) => void;
  imageSize: { width: number; height: number };
  onImageSizeChange: (size: { width: number; height: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"left" | "right" | "top" | "bottom" | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; value: number } | null>(null);
  const [aspectDropdownOpen, setAspectDropdownOpen] = useState(false);
  const aspectDropdownRef = useRef<HTMLDivElement>(null);

  const imageSize = props.imageSize;

  // Calculate scale to fit image in container (max 200px base size)
  const baseSize = 180;
  const aspectRatio = imageSize.width / imageSize.height;
  const displayWidth = aspectRatio >= 1 ? baseSize : baseSize * aspectRatio;
  const displayHeight = aspectRatio >= 1 ? baseSize / aspectRatio : baseSize;

  // Scale expansion values for display (show proportionally but capped)
  const maxExpand = 512;
  const scaleFactor = 0.3; // Display at 30% of actual pixel values
  const displayExpand = {
    left: props.params.expandLeft * scaleFactor,
    right: props.params.expandRight * scaleFactor,
    top: props.params.expandTop * scaleFactor,
    bottom: props.params.expandBottom * scaleFactor
  };

  const totalWidth = displayWidth + displayExpand.left + displayExpand.right;
  const totalHeight = displayHeight + displayExpand.top + displayExpand.bottom;

  // Load image dimensions
  useEffect(() => {
    const img = new Image();
    img.onload = () => props.onImageSizeChange({ width: img.width, height: img.height });
    img.src = props.imageSrc;
  }, [props.imageSrc, props.onImageSizeChange]);

  // Close aspect dropdown when clicking outside
  useEffect(() => {
    if (!aspectDropdownOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (aspectDropdownRef.current && e.target instanceof Node && !aspectDropdownRef.current.contains(e.target)) {
        setAspectDropdownOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setAspectDropdownOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [aspectDropdownOpen]);

  // When aspect ratio changes, calculate and apply expansion
  const handleAspectRatioSelect = useCallback((ar: OutpaintAspectRatio) => {
    props.onAspectRatioChange(ar);
    setAspectDropdownOpen(false);
    if (!ar) {
      // Clear to manual mode - reset all expansions
      props.onParamsChange({ ...props.params, expandLeft: 0, expandRight: 0, expandTop: 0, expandBottom: 0 });
      return;
    }
    const expansion = calculateExpansionForAspectRatio(imageSize.width, imageSize.height, ar);
    if (expansion) {
      props.onParamsChange({
        ...props.params,
        expandLeft: expansion.left,
        expandRight: expansion.right,
        expandTop: expansion.top,
        expandBottom: expansion.bottom,
      });
    }
  }, [imageSize, props]);

  const handleMouseDown = useCallback((edge: "left" | "right" | "top" | "bottom", e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(edge);
    const currentValue = props.params[edge === "left" ? "expandLeft" : edge === "right" ? "expandRight" : edge === "top" ? "expandTop" : "expandBottom"];
    setDragStart({ x: e.clientX, y: e.clientY, value: currentValue });
  }, [props.params]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging || !dragStart) return;

    const sensitivity = 2; // Pixels moved per pixel of expansion
    let delta: number;

    if (dragging === "left") {
      delta = dragStart.x - e.clientX; // Dragging left increases expansion
    } else if (dragging === "right") {
      delta = e.clientX - dragStart.x; // Dragging right increases expansion
    } else if (dragging === "top") {
      delta = dragStart.y - e.clientY; // Dragging up increases expansion
    } else {
      delta = e.clientY - dragStart.y; // Dragging down increases expansion
    }

    // Calculate new value, snapped to 64px grid
    const rawValue = Math.max(0, Math.min(maxExpand, dragStart.value + delta * sensitivity));
    const snappedValue = Math.round(rawValue / 64) * 64;

    const key = dragging === "left" ? "expandLeft" : dragging === "right" ? "expandRight" : dragging === "top" ? "expandTop" : "expandBottom";
    if (props.params[key] !== snappedValue) {
      props.onParamsChange({ ...props.params, [key]: snappedValue });
      // Clear aspect ratio selection when manually dragging
      if (props.selectedAspectRatio) {
        props.onAspectRatioChange(null);
      }
    }
  }, [dragging, dragStart, props]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setDragStart(null);
  }, []);

  useEffect(() => {
    if (dragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [dragging, handleMouseMove, handleMouseUp]);

  const hasExpansion = props.params.expandLeft > 0 || props.params.expandRight > 0 || props.params.expandTop > 0 || props.params.expandBottom > 0;

  // Calculate current aspect ratio for display
  const finalWidth = imageSize.width + props.params.expandLeft + props.params.expandRight;
  const finalHeight = imageSize.height + props.params.expandTop + props.params.expandBottom;
  const currentAspectLabel = props.selectedAspectRatio
    ? OUTPAINT_ASPECT_RATIOS.find((ar) => ar.value === props.selectedAspectRatio)?.label ?? props.selectedAspectRatio
    : "Manual";

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Aspect Ratio Selector */}
      <div className="w-full" ref={aspectDropdownRef}>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-zinc-400">Target Aspect Ratio</label>
          <span className="text-xs text-zinc-500">
            {finalWidth}×{finalHeight}
          </span>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setAspectDropdownOpen((v) => !v)}
            className={[
              "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm",
              "border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800",
              aspectDropdownOpen ? "ring-2 ring-zinc-500/40" : ""
            ].join(" ")}
          >
            <span className="flex items-center gap-2">
              {props.selectedAspectRatio ? (
                <span
                  className="shrink-0 rounded border border-zinc-600 bg-zinc-800"
                  style={{
                    width: `${Math.max(8, Math.min(20, 16 * (Number(props.selectedAspectRatio.split(":")[0]) / Number(props.selectedAspectRatio.split(":")[1]))))}px`,
                    height: "16px"
                  }}
                />
              ) : (
                <span className="shrink-0 w-4 h-4 flex items-center justify-center text-zinc-500 text-[11px]">⤡</span>
              )}
              <span>{currentAspectLabel}</span>
            </span>
            {aspectDropdownOpen ? (
              <TbChevronUp className="h-4 w-4 text-zinc-400" />
            ) : (
              <TbChevronDown className="h-4 w-4 text-zinc-400" />
            )}
          </button>
          {aspectDropdownOpen && (
            <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-lg max-h-64 overflow-auto">
              <button
                type="button"
                onClick={() => handleAspectRatioSelect(null)}
                className={[
                  "w-full px-3 py-2 text-left text-sm hover:bg-zinc-800 flex items-center gap-2",
                  !props.selectedAspectRatio ? "bg-zinc-800 text-zinc-400" : "text-zinc-300"
                ].join(" ")}
              >
                <span className="shrink-0 w-4 h-4 flex items-center justify-center text-zinc-500 text-[11px]">⤡</span>
                <span>Manual (drag edges)</span>
              </button>
              {OUTPAINT_ASPECT_RATIOS.map((ar) => {
                const isSelected = props.selectedAspectRatio === ar.value;
                const [w, h] = ar.value.split(":").map(Number);
                const ratio = w / h;
                return (
                  <button
                    key={ar.value}
                    type="button"
                    onClick={() => handleAspectRatioSelect(ar.value)}
                    className={[
                      "w-full px-3 py-2 text-left text-sm hover:bg-zinc-800 flex items-center gap-2",
                      isSelected ? "bg-zinc-800 text-zinc-400" : "text-zinc-300"
                    ].join(" ")}
                  >
                    <span
                      className="shrink-0 rounded border border-zinc-600 bg-zinc-800"
                      style={{
                        width: `${Math.max(8, Math.min(20, 16 * ratio))}px`,
                        height: "16px"
                      }}
                    />
                    <span>{ar.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Interactive canvas */}
      <div
        ref={containerRef}
        className="relative select-none"
        style={{
          width: totalWidth + 40,
          height: totalHeight + 40,
          cursor: dragging ? (dragging === "left" || dragging === "right" ? "ew-resize" : "ns-resize") : "default"
        }}
      >
        {/* Checkerboard background for expanded areas */}
        <div
          className="absolute rounded-lg overflow-hidden"
          style={{
            left: 20,
            top: 20,
            width: totalWidth,
            height: totalHeight,
            background: `
              repeating-conic-gradient(
                #3b82f620 0% 25%,
                #1e3a5a30 0% 50%
              ) 50% / 16px 16px
            `
          }}
        />

        {/* Original image area */}
        <div
          className="absolute rounded border-2 border-dashed border-zinc-400/50 overflow-hidden"
          style={{
            left: 20 + displayExpand.left,
            top: 20 + displayExpand.top,
            width: displayWidth,
            height: displayHeight
          }}
        >
          <img
            src={props.imageSrc}
            alt="Original"
            className="w-full h-full object-cover"
            draggable={false}
          />
        </div>

        {/* Expansion overlays with labels */}
        {displayExpand.left > 2 && (
          <div
            className="absolute flex items-center justify-center text-[11px] font-medium text-zinc-400 bg-zinc-500/20"
            style={{
              left: 20,
              top: 20 + displayExpand.top,
              width: displayExpand.left,
              height: displayHeight
            }}
          >
            +{props.params.expandLeft}
          </div>
        )}
        {displayExpand.right > 2 && (
          <div
            className="absolute flex items-center justify-center text-[11px] font-medium text-zinc-400 bg-zinc-500/20"
            style={{
              left: 20 + displayExpand.left + displayWidth,
              top: 20 + displayExpand.top,
              width: displayExpand.right,
              height: displayHeight
            }}
          >
            +{props.params.expandRight}
          </div>
        )}
        {displayExpand.top > 2 && (
          <div
            className="absolute flex items-center justify-center text-[11px] font-medium text-zinc-400 bg-zinc-500/20"
            style={{
              left: 20,
              top: 20,
              width: totalWidth,
              height: displayExpand.top
            }}
          >
            +{props.params.expandTop}
          </div>
        )}
        {displayExpand.bottom > 2 && (
          <div
            className="absolute flex items-center justify-center text-[11px] font-medium text-zinc-400 bg-zinc-500/20"
            style={{
              left: 20,
              top: 20 + displayExpand.top + displayHeight,
              width: totalWidth,
              height: displayExpand.bottom
            }}
          >
            +{props.params.expandBottom}
          </div>
        )}

        {/* Drag handles - LEFT */}
        <div
          className={`absolute flex items-center justify-center cursor-ew-resize group ${dragging === "left" ? "z-20" : "z-10"}`}
          style={{
            left: 0,
            top: 20 + displayExpand.top,
            width: 20 + displayExpand.left,
            height: displayHeight
          }}
          onMouseDown={(e) => handleMouseDown("left", e)}
        >
          <div className={`w-1.5 h-12 rounded-full transition-colors ${dragging === "left" ? "bg-zinc-400" : "bg-zinc-400 group-hover:bg-zinc-400"}`} />
        </div>

        {/* Drag handles - RIGHT */}
        <div
          className={`absolute flex items-center justify-center cursor-ew-resize group ${dragging === "right" ? "z-20" : "z-10"}`}
          style={{
            left: 20 + displayExpand.left + displayWidth,
            top: 20 + displayExpand.top,
            width: 20 + displayExpand.right,
            height: displayHeight
          }}
          onMouseDown={(e) => handleMouseDown("right", e)}
        >
          <div className={`w-1.5 h-12 rounded-full transition-colors ${dragging === "right" ? "bg-zinc-400" : "bg-zinc-400 group-hover:bg-zinc-400"}`} />
        </div>

        {/* Drag handles - TOP */}
        <div
          className={`absolute flex items-center justify-center cursor-ns-resize group ${dragging === "top" ? "z-20" : "z-10"}`}
          style={{
            left: 20 + displayExpand.left,
            top: 0,
            width: displayWidth,
            height: 20 + displayExpand.top
          }}
          onMouseDown={(e) => handleMouseDown("top", e)}
        >
          <div className={`w-12 h-1.5 rounded-full transition-colors ${dragging === "top" ? "bg-zinc-400" : "bg-zinc-400 group-hover:bg-zinc-400"}`} />
        </div>

        {/* Drag handles - BOTTOM */}
        <div
          className={`absolute flex items-center justify-center cursor-ns-resize group ${dragging === "bottom" ? "z-20" : "z-10"}`}
          style={{
            left: 20 + displayExpand.left,
            top: 20 + displayExpand.top + displayHeight,
            width: displayWidth,
            height: 20 + displayExpand.bottom
          }}
          onMouseDown={(e) => handleMouseDown("bottom", e)}
        >
          <div className={`w-12 h-1.5 rounded-full transition-colors ${dragging === "bottom" ? "bg-zinc-400" : "bg-zinc-400 group-hover:bg-zinc-400"}`} />
        </div>
      </div>

      {/* Dimensions info */}
      <div className="text-center space-y-1">
        <div className="text-xs text-zinc-400">
          {props.selectedAspectRatio ? "Aspect ratio applied • drag edges to adjust" : "Drag edges outward to expand canvas"}
        </div>
        {hasExpansion ? (
          <div className="text-sm font-medium text-zinc-200">
            {imageSize.width}×{imageSize.height} → {finalWidth}×{finalHeight}
          </div>
        ) : (
          <div className="text-sm text-zinc-500">
            Original: {imageSize.width}×{imageSize.height}
          </div>
        )}
      </div>
    </div>
  );
}

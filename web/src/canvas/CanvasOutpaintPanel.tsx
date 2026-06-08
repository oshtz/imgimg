import { useCallback, useMemo, useState } from "react";
import { TbArrowsMaximize, TbX, TbSend } from "react-icons/tb";
import { createOutpaintGeneration } from "../client";
import type { ApiBaseUrl } from "../api";
import type { CanvasNode, CanvasViewport } from "./types";

const DEFAULT_OUTPAINT_PROMPT = "Seamlessly extend the image, maintaining the style and content";

const ASPECT_RATIO_PRESETS = [
  { label: "Manual", value: "manual" },
  { label: "1:1", value: "1:1" },
  { label: "4:3", value: "4:3" },
  { label: "3:2", value: "3:2" },
  { label: "16:9", value: "16:9" },
  { label: "21:9", value: "21:9" },
  { label: "3:4", value: "3:4" },
  { label: "2:3", value: "2:3" },
  { label: "9:16", value: "9:16" },
] as const;

/** Round up to nearest multiple of 64 (ComfyUI-friendly) */
function roundUp64(n: number): number {
  return Math.ceil(n / 64) * 64;
}

/**
 * Given current image dimensions and a target aspect ratio string (e.g. "16:9"),
 * compute the minimum symmetrical expansion per direction to reach that ratio.
 */
function computeExpansionForAR(
  natW: number,
  natH: number,
  ar: string,
): { left: number; right: number; top: number; bottom: number } {
  const [aw, ah] = ar.split(":").map(Number);
  const targetRatio = aw / ah;
  const currentRatio = natW / natH;

  if (Math.abs(targetRatio - currentRatio) < 0.01) {
    // Already at target — no expansion needed
    return { left: 0, right: 0, top: 0, bottom: 0 };
  }

  if (targetRatio > currentRatio) {
    // Need to go wider — expand left + right
    const targetW = natH * targetRatio;
    const totalExpand = roundUp64(targetW - natW);
    const half = totalExpand / 2;
    return { left: half, right: half, top: 0, bottom: 0 };
  } else {
    // Need to go taller — expand top + bottom
    const targetH = natW / targetRatio;
    const totalExpand = roundUp64(targetH - natH);
    const half = totalExpand / 2;
    return { left: 0, right: 0, top: half, bottom: half };
  }
}

type Props = {
  node: CanvasNode;
  viewport: CanvasViewport;
  apiBaseUrl: ApiBaseUrl;
  modelId: string;
  onComplete: (result: { generationId: string; jobId: string; queuePosition: number | null; naturalWidth: number; naturalHeight: number }) => void;
  onCancel: () => void;
  outpaintWorkflowId: string;
};

type Direction = "left" | "right" | "top" | "bottom";

export function CanvasOutpaintPanel({ node, viewport, apiBaseUrl, modelId, onComplete, onCancel, outpaintWorkflowId }: Props) {
  const [prompt, setPrompt] = useState("");
  const [expandPixels, setExpandPixels] = useState(256);
  const [directions, setDirections] = useState<Set<Direction>>(new Set(["right"]));
  const [submitting, setSubmitting] = useState(false);
  const [selectedAR, setSelectedAR] = useState("manual");
  const [edgeBlend, setEdgeBlend] = useState(64);
  const [denoise, setDenoise] = useState(0.8);

  const screenX = node.x * viewport.scale + viewport.x;
  const screenY = node.y * viewport.scale + viewport.y;
  const screenW = node.width * viewport.scale;
  const screenH = node.height * viewport.scale;

  const isManual = selectedAR === "manual";

  // Pre-computed expansion for the selected aspect ratio
  const arExpansion = useMemo(() => {
    if (isManual) return null;
    return computeExpansionForAR(node.naturalWidth, node.naturalHeight, selectedAR);
  }, [isManual, selectedAR, node.naturalWidth, node.naturalHeight]);

  // Effective expansion per direction (manual or AR-driven)
  const effectiveExpand = useMemo(() => {
    if (arExpansion) return arExpansion;
    return {
      left: directions.has("left") ? expandPixels : 0,
      right: directions.has("right") ? expandPixels : 0,
      top: directions.has("top") ? expandPixels : 0,
      bottom: directions.has("bottom") ? expandPixels : 0,
    };
  }, [arExpansion, directions, expandPixels]);

  const totalExpand = effectiveExpand.left + effectiveExpand.right + effectiveExpand.top + effectiveExpand.bottom;

  const toggleDirection = (dir: Direction) => {
    setDirections((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return next;
    });
  };

  const handleSubmit = useCallback(async () => {
    if (totalExpand === 0) return;

    setSubmitting(true);
    try {
      // Calculate new dimensions
      const newW = node.naturalWidth + effectiveExpand.left + effectiveExpand.right;
      const newH = node.naturalHeight + effectiveExpand.top + effectiveExpand.bottom;

      // Convert node.src to a data URL (it may be an asset:// protocol URL in Tauri)
      let imageDataUrl = node.src!;
      if (!node.src!.startsWith("data:")) {
        const res = await fetch(node.src!);
        const blob = await res.blob();
        imageDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      }

      const outpaintPrompt = prompt.trim() || DEFAULT_OUTPAINT_PROMPT;
      const result = await createOutpaintGeneration(apiBaseUrl, {
        modelId,
        prompt: outpaintPrompt,
        imageDataUrl,
        outpaintWorkflowId,
        outpaintParams: {
          expandLeft: effectiveExpand.left,
          expandRight: effectiveExpand.right,
          expandTop: effectiveExpand.top,
          expandBottom: effectiveExpand.bottom,
          denoise,
          edgeBlend,
        },
      });

      onComplete({
        generationId: result.generationId,
        jobId: result.jobId ?? "",
        queuePosition: result.queuePosition,
        naturalWidth: newW,
        naturalHeight: newH,
      });
    } catch (err) {
      console.error("Outpaint failed:", err);
    } finally {
      setSubmitting(false);
    }
  }, [prompt, node, apiBaseUrl, effectiveExpand, totalExpand, onComplete, modelId, denoise, edgeBlend, outpaintWorkflowId]);

  return (
    <>
      <div className="absolute inset-0 z-40 bg-black/30" onClick={onCancel} />

      {/* Preview area */}
      <div
        className="absolute z-50 border-2 border-dashed border-zinc-400"
        style={{
          left: screenX - effectiveExpand.left * viewport.scale,
          top: screenY - effectiveExpand.top * viewport.scale,
          width: screenW + (effectiveExpand.left + effectiveExpand.right) * viewport.scale,
          height: screenH + (effectiveExpand.top + effectiveExpand.bottom) * viewport.scale,
        }}
      >
        <div
          className="absolute bg-zinc-400/10"
          style={{
            left: effectiveExpand.left * viewport.scale,
            top: effectiveExpand.top * viewport.scale,
            width: screenW,
            height: screenH,
          }}
        />
      </div>

      {/* Controls panel */}
      <div
        className="absolute z-50 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
        style={{ left: screenX + screenW / 2, top: screenY + screenH + 16 }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            <TbArrowsMaximize className="mr-1.5 inline" size={14} />
            Outpaint
          </h4>
          <button onClick={onCancel} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
            <TbX size={16} />
          </button>
        </div>

        {/* Aspect ratio selector */}
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs text-zinc-500">Ratio:</span>
          <select
            value={selectedAR}
            onChange={(e) => setSelectedAR(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-700 focus:border-zinc-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
          >
            {ASPECT_RATIO_PRESETS.map((ar) => (
              <option key={ar.value} value={ar.value}>{ar.label}</option>
            ))}
          </select>
          {!isManual && arExpansion && (
            <span className="text-[10px] text-zinc-400">
              {node.naturalWidth + arExpansion.left + arExpansion.right}×{node.naturalHeight + arExpansion.top + arExpansion.bottom}px
            </span>
          )}
        </div>

        {/* Direction toggles (manual mode only) */}
        {isManual && (
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs text-zinc-500">Expand:</span>
            {(["top", "right", "bottom", "left"] as Direction[]).map((dir) => (
              <button
                key={dir}
                onClick={() => toggleDirection(dir)}
                className={[
                  "rounded-lg px-2 py-1 text-xs font-medium capitalize transition-colors",
                  directions.has(dir)
                    ? "bg-zinc-200 text-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400"
                    : "bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400",
                ].join(" ")}
              >
                {dir}
              </button>
            ))}
          </div>
        )}

        {/* Pixels slider (manual mode only) */}
        {isManual && (
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs text-zinc-500">Pixels:</span>
            <input
              type="range"
              min={64}
              max={1024}
              step={64}
              value={expandPixels}
              onChange={(e) => setExpandPixels(Number(e.target.value))}
              className="flex-1"
            />
            <span className="w-10 text-right text-xs text-zinc-600 dark:text-zinc-400">{expandPixels}</span>
          </div>
        )}

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs text-zinc-500">Blend</span>
              <span className="text-xs tabular-nums text-zinc-600 dark:text-zinc-400">{edgeBlend}px</span>
            </div>
            <input
              type="range"
              min={0}
              max={256}
              step={16}
              value={edgeBlend}
              onChange={(e) => setEdgeBlend(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs text-zinc-500">Creativity</span>
              <span className="text-xs tabular-nums text-zinc-600 dark:text-zinc-400">{Math.round(denoise * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={1}
              step={0.05}
              value={denoise}
              onChange={(e) => setDenoise(Number(e.target.value))}
              className="w-full"
            />
          </div>
        </div>

        {/* Prompt + submit */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Optional: describe the expanded area..."
            className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSubmit();
            }}
          />
          <button
            onClick={() => void handleSubmit()}
            disabled={submitting || totalExpand === 0}
            className="rounded-lg bg-zinc-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {submitting ? "..." : <TbSend size={16} />}
          </button>
        </div>
      </div>
    </>
  );
}

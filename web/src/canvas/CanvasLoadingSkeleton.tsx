import type { CanvasViewport } from "./types";

export type PendingGeneration = {
  id: string;
  /** Position on the canvas (canvas coordinates) */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Display label (e.g. truncated prompt) */
  label: string;
  status: "queued" | "running" | "failed";
  /** Linked generation ID (set once the API responds) */
  generationId?: string;
};

type Props = {
  pending: PendingGeneration[];
  viewport: CanvasViewport;
};

/**
 * Renders HTML-based loading skeletons overlaid on the canvas for pending generations.
 * These are positioned to match where the generated images will be placed.
 * Features a shimmer background, spinner, status badge, and indeterminate progress bar.
 */
export function CanvasLoadingSkeletons({ pending, viewport }: Props) {
  if (pending.length === 0) return null;

  return (
    <>
      {pending.map((gen) => {
        // Convert canvas coordinates to screen coordinates
        const screenX = gen.x * viewport.scale + viewport.x;
        const screenY = gen.y * viewport.scale + viewport.y;
        const screenW = gen.width * viewport.scale;
        const screenH = gen.height * viewport.scale;

        const isFailed = gen.status === "failed";
        return (
          <div
            key={gen.id}
            className={`pointer-events-none absolute z-[1] animate-fade-in ${isFailed ? "opacity-70" : "opacity-50"}`}
            style={{ left: screenX, top: screenY, width: screenW, height: screenH }}
          >
            <div className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg border ${isFailed ? "border-red-400 bg-red-100 dark:border-red-800 dark:bg-red-900/40" : "border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800"}`}>
              {!isFailed && (
                <div
                  className="absolute inset-0 animate-skeleton-shimmer"
                  style={{
                    backgroundImage: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)",
                    backgroundSize: "200% 100%",
                  }}
                />
              )}
              {isFailed && (
                <p className="px-2 text-center text-[10px] text-red-600 dark:text-red-400">{gen.label}</p>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

import { useEffect, useRef, useState } from "react";
import { TbDice, TbWand, TbSparkles, TbBolt } from "react-icons/tb";

export type ExploreMode = "seed" | "mutate";

export type ExploreOptions = {
  mode: ExploreMode;
  count: number;
  /** Creativity level 0–1. Only used for "mutate" mode. */
  creativity: number;
};

type Props = {
  /** Anchor position (screen coordinates) */
  anchorX: number;
  anchorY: number;
  /** Whether the popover should render above or below the anchor */
  above: boolean;
  onExplore: (options: ExploreOptions) => void;
  /** Quick explore fires immediately with seed × 4 */
  onQuickExplore: () => void;
  onClose: () => void;
};

const BATCH_SIZES = [2, 4, 6, 8] as const;

export function ExplorePopover({ anchorX, anchorY, above, onExplore, onQuickExplore, onClose }: Props) {
  const [mode, setMode] = useState<ExploreMode>("seed");
  const [count, setCount] = useState(4);
  const [creativity, setCreativity] = useState(0.5);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid closing on the same click that opened the popover
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleExplore = () => {
    onExplore({ mode, count, creativity });
  };

  const creativityLabel =
    creativity <= 0.3 ? "Subtle" : creativity >= 0.7 ? "Wild" : "Balanced";

  return (
    <div
      ref={popoverRef}
      className={`pointer-events-auto absolute z-40 w-64 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-800 ${above ? "-translate-y-full" : ""}`}
      style={{ left: anchorX, top: anchorY, transform: `translateX(-50%)${above ? " translateY(-100%)" : ""}` }}
    >
      {/* Header */}
      <div className="mb-2.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
        Explore Variations
      </div>

      {/* Mode selection */}
      <div className="mb-3 flex gap-2">
        <button
          onClick={() => setMode("seed")}
          className={[
            "flex flex-1 flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
            mode === "seed"
              ? "border-zinc-400 bg-zinc-100 text-zinc-700 dark:border-zinc-500 dark:bg-zinc-900/20 dark:text-zinc-400"
              : "border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:bg-zinc-700/50",
          ].join(" ")}
        >
          <TbDice size={18} />
          Seed Vary
        </button>
        <button
          onClick={() => setMode("mutate")}
          className={[
            "flex flex-1 flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
            mode === "mutate"
              ? "border-zinc-400 bg-zinc-100 text-zinc-700 dark:border-zinc-500 dark:bg-zinc-900/20 dark:text-zinc-400"
              : "border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:bg-zinc-700/50",
          ].join(" ")}
        >
          <TbWand size={18} />
          Prompt Mutate
        </button>
      </div>

      {/* Creativity slider — only for mutate mode */}
      {mode === "mutate" && (
        <div className="mb-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Creativity</span>
            <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">{creativityLabel}</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={creativity}
            onChange={(e) => setCreativity(parseFloat(e.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-200 accent-zinc-500 dark:bg-zinc-600"
          />
          <div className="mt-0.5 flex justify-between text-[11px] text-zinc-400 dark:text-zinc-500">
            <span>Subtle</span>
            <span>Wild</span>
          </div>
        </div>
      )}

      {/* Batch size */}
      <div className="mb-3">
        <div className="mb-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Count</div>
        <div className="flex gap-1.5">
          {BATCH_SIZES.map((n) => (
            <button
              key={n}
              onClick={() => setCount(n)}
              className={[
                "flex-1 rounded-lg py-1 text-xs font-medium transition-colors",
                count === n
                  ? "bg-zinc-200 text-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-400"
                  : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-600",
              ].join(" ")}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Explore button */}
      <button
        onClick={handleExplore}
        className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-500 dark:hover:bg-zinc-600"
      >
        <TbSparkles size={14} />
        Explore
      </button>

      {/* Quick explore shortcut */}
      <button
        onClick={() => {
          onQuickExplore();
          onClose();
        }}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1 text-[11px] font-medium text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
      >
        <TbBolt size={12} />
        Quick explore (seed x4)
      </button>
    </div>
  );
}

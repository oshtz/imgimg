import {
  TbLoader2,
  TbAlertCircle,
  TbCheck,
  TbClock,
} from "react-icons/tb";
import type { Asset } from "../types";
import type { CompareModel } from "../api";
import { cn } from "../utils/cn";

const ENGINE_LOGOS: Record<string, string> = {
  comfyui: "/comfyui.svg",
  openrouter: "/openrouter.svg",
  replicate: "/replicate.svg",
  fal: "/fal.svg",
  kie: "/kieai.svg",
};

export type CompareEntry = {
  model: CompareModel;
  generationId: string | null;
  status: "idle" | "pending" | "queued" | "running" | "succeeded" | "failed";
  assets: Asset[];
  error: string | null;
};

function StatusDot({ status }: { status: CompareEntry["status"] }) {
  if (status === "idle") return null;
  if (status === "running")
    return <TbLoader2 className="h-3 w-3 shrink-0 animate-spin text-accent-sky" />;
  if (status === "succeeded")
    return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-forest" />;
  if (status === "failed")
    return <TbAlertCircle className="h-3 w-3 shrink-0 text-accent-coral" />;
  return <TbClock className="h-3 w-3 shrink-0 text-zinc-400" />;
}

interface CompareResultsGridProps {
  entries: CompareEntry[];
  prompt: string;
  assetUrl: (asset: Asset) => string;
}

export function CompareResultsGrid({
  entries,
  prompt,
  assetUrl,
}: CompareResultsGridProps) {
  if (entries.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* Prompt — inline, tiny */}
      <p className="line-clamp-1 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">Prompt:</span>{" "}
        {prompt}
      </p>

      {/* Results grid */}
      <div
        className={cn(
          "grid gap-1.5",
          entries.length <= 2
            ? "grid-cols-2"
            : entries.length <= 4
              ? "grid-cols-2 lg:grid-cols-4"
              : "grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
        )}
      >
        {entries.map((entry) => {
          const imageAsset = entry.assets.find(
            (a) => a.type !== "video" && a.type !== "audio" && a.type !== "preview"
          );
          return (
            <div
              key={entry.model.id}
              className="flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
            >
              {/* Header — compact single row */}
              <div className="flex items-center gap-1.5 px-2 py-1 text-[11px]">
                {ENGINE_LOGOS[entry.model.provider] && (
                  <img
                    src={ENGINE_LOGOS[entry.model.provider]}
                    alt=""
                    className="h-3 w-3 shrink-0 dark:invert"
                  />
                )}
                <span className="truncate font-medium text-zinc-800 dark:text-zinc-200">
                  {entry.model.displayName}
                </span>
                <span className="ml-auto"><StatusDot status={entry.status} /></span>
              </div>

              {/* Body */}
              <div className="relative flex aspect-square items-center justify-center bg-zinc-50 dark:bg-zinc-900/50">
                {entry.status === "idle" || entry.status === "pending" || entry.status === "queued" ? (
                  <TbClock className="h-5 w-5 text-zinc-300 dark:text-zinc-600" />
                ) : entry.status === "running" ? (
                  <TbLoader2 className="h-5 w-5 animate-spin text-accent-sky" />
                ) : entry.status === "failed" ? (
                  <div className="flex flex-col items-center gap-1 px-2 text-center">
                    <TbAlertCircle className="h-5 w-5 text-accent-coral" />
                    <span className="line-clamp-2 text-[10px] text-accent-coral">{entry.error || "Failed"}</span>
                  </div>
                ) : imageAsset ? (
                  <img
                    src={assetUrl(imageAsset)}
                    alt={prompt}
                    className="h-full w-full object-contain"
                    loading="lazy"
                  />
                ) : (
                  <TbCheck className="h-5 w-5 text-zinc-300 dark:text-zinc-600" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

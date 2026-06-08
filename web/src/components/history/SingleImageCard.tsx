import type { WorkflowSummary, ApiBaseUrl } from "../../client";
import type { Asset, Generation } from "../../types";
import { CopyableText } from "../CopyableText";
import { statusPill } from "./generationUtils";
import { UserBadge } from "./UserBadge";
import { AssetSlot } from "./AssetSlot";

export function SingleImageCard(props: {
  generation: Generation;
  workflow: WorkflowSummary | null;
  isSelected: boolean;
  previewAssets: (Asset | null)[];
  latestBatchPreview: Asset | null;
  apiBaseUrl: ApiBaseUrl;
  assetUrl: (apiBaseUrl: ApiBaseUrl, asset: Asset) => string;
  onOpenGeneration: (g: Generation) => void;
  onOpenAsset: (g: Generation, asset: Asset) => void;
  onDelete?: (generationId: string) => void;
  onFillSlot?: (generationId: string, slotIndex: number) => void;
  fillingSlots?: Set<string>;
  queuedSlots?: Set<string>;
  loading: boolean;
  showDelete?: boolean;
  userId?: string;
  userLabel?: string;
}) {
  const { generation: g, workflow, isSelected, previewAssets, latestBatchPreview } = props;
  const label = workflow?.label ?? g.workflowUsed;
  const runningOrQueued = g.status === "running" || g.status === "queued";
  const showDelete = props.showDelete !== false && Boolean(props.onDelete);

  return (
    <div
      className={[
        "py-4",
        isSelected
          ? "bg-zinc-50 dark:bg-zinc-900/50"
          : ""
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => props.onOpenGeneration(g)}
          disabled={props.loading}
          title={g.id}
        >
          <CopyableText text={g.prompt} className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{g.prompt}</CopyableText>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
            <span>{label}</span>
            {props.userId ? <UserBadge userId={props.userId} label={props.userLabel} /> : null}
            <span className={["rounded-full px-2 py-0.5", statusPill(g.status)].join(" ")}>{g.status}</span>
            {g.queuePosition !== undefined && g.queuePosition !== null ? <span>#{g.queuePosition}</span> : null}
            <span>{new Date(g.createdAt).toLocaleString()}</span>
          </div>
        </button>
        {showDelete ? (
          <button
            className="text-xs text-zinc-600 hover:text-red-600 disabled:opacity-60 dark:text-zinc-400 dark:hover:text-red-300"
            onClick={() => props.onDelete?.(g.id)}
            disabled={props.loading}
            type="button"
          >
            Delete
          </button>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: runningOrQueued ? (g.batchSize ?? 1) : 4 }).map((_, idx) => {
          const asset = previewAssets[idx] ?? null;
          const slotKey = `${g.id}:${idx}`;
          const isSlotFilling = props.fillingSlots?.has(slotKey) ?? false;
          const isSlotQueued = props.queuedSlots?.has(slotKey) ?? false;
          const canFillSlot =
            !asset &&
            g.status === "succeeded" &&
            (workflow?.outputMode ?? "single_image") === "single_image" &&
            props.onFillSlot !== undefined &&
            !props.loading &&
            !isSlotFilling;

          return (
            <AssetSlot
              key={idx}
              asset={asset}
              generation={g}
              idx={idx}
              apiBaseUrl={props.apiBaseUrl}
              assetUrl={props.assetUrl}
              onOpenAsset={props.onOpenAsset}
              isRunningOrQueued={runningOrQueued}
              isSlotFilling={isSlotFilling}
              isSlotQueued={isSlotQueued}
              latestBatchPreview={latestBatchPreview}
              canFillSlot={canFillSlot}
              onFillSlot={props.onFillSlot}
            />
          );
        })}
      </div>
    </div>
  );
}

import { TbChevronDown, TbChevronUp } from "react-icons/tb";
import type { WorkflowSummary, ApiBaseUrl } from "../../client";
import type { Asset, Generation } from "../../types";
import type { AssetTypeRegistry } from "../../assetTypeRegistry";
import { CopyableText } from "../CopyableText";
import { statusPill, pickFullSetAssets } from "./generationUtils";
import { UserBadge } from "./UserBadge";
import { AssetSlot } from "./AssetSlot";

export function FullSetCard(props: {
  generation: Generation;
  workflow: WorkflowSummary | null;
  isSelected: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  apiBaseUrl: ApiBaseUrl;
  assetUrl: (apiBaseUrl: ApiBaseUrl, asset: Asset) => string;
  onOpenGeneration: (g: Generation) => void;
  onOpenAsset: (g: Generation, asset: Asset) => void;
  onDelete?: (generationId: string) => void;
  loading: boolean;
  fillingSlots?: Set<string>;
  queuedSlots?: Set<string>;
  showDelete?: boolean;
  userId?: string;
  userLabel?: string;
  assetTypeRegistry: AssetTypeRegistry;
}) {
  const { generation: g, workflow, isSelected, expanded } = props;
  const label = workflow?.label ?? g.workflowUsed;
  const runningOrQueued = g.status === "running" || g.status === "queued";
  const showDelete = props.showDelete !== false && Boolean(props.onDelete);
  const slots = workflow?.fullSetSlots;
  const fullSetAssets = pickFullSetAssets(g, slots);
  const isSlotFilling = (slotKey: string | number | null | undefined) => {
    if (slotKey === null || slotKey === undefined) return false;
    return props.fillingSlots?.has(`${g.id}:${slotKey}`) ?? false;
  };
  const isSlotQueued = (slotKey: string | number | null | undefined) => {
    if (slotKey === null || slotKey === undefined) return false;
    return props.queuedSlots?.has(`${g.id}:${slotKey}`) ?? false;
  };

  const slotKey = (slot: { type: string; itemIndex?: number }) =>
    slot.itemIndex !== undefined ? slot.itemIndex : slot.type;

  const firstAsset = fullSetAssets.find(Boolean) ?? null;
  const allVisibleAssets = fullSetAssets.filter(Boolean);
  const assetCount = allVisibleAssets.length;

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
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={props.onToggleExpand}
          disabled={props.loading}
          title={expanded ? "Collapse full set" : "Expand full set"}
        >
          <div className="flex h-5 w-5 shrink-0 items-center justify-center">
            {expanded ? (
              <TbChevronUp className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
            ) : (
              <TbChevronDown className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <CopyableText text={g.prompt} className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{g.prompt}</CopyableText>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
              <span className="rounded bg-zinc-500/10 px-1.5 py-0.5 text-zinc-700 dark:text-zinc-400">Full Set</span>
              <span>{label}</span>
              {props.userId ? <UserBadge userId={props.userId} label={props.userLabel} /> : null}
              <span className={["rounded-full px-2 py-0.5", statusPill(g.status)].join(" ")}>{g.status}</span>
              {g.queuePosition !== undefined && g.queuePosition !== null ? <span>#{g.queuePosition}</span> : null}
              <span>{new Date(g.createdAt).toLocaleString()}</span>
            </div>
          </div>
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            onClick={() => props.onOpenGeneration(g)}
            disabled={props.loading}
            title="View details"
          >
            Details
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
      </div>

      {/* Collapsed preview */}
      {!expanded && firstAsset ? (
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            className="group relative h-16 shrink-0 overflow-hidden rounded-lg aspect-square"
            onClick={() => props.onOpenAsset(g, firstAsset)}
          >
            <img
              className="h-full w-full object-cover"
              src={props.assetUrl(props.apiBaseUrl, firstAsset)}
              alt="Preview"
            />
          </button>
          <div className="min-w-0 flex-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{assetCount} images:</span>{" "}
            {slots ? (
              (() => {
                const counts: Record<string, number> = {};
                for (const s of slots) counts[s.type] = (counts[s.type] ?? 0) + 1;
                return Object.entries(counts).map(([t, c]) => `${c} ${t}${c !== 1 ? "s" : ""}`).join(", ");
              })()
            ) : (
              <>{assetCount} asset{assetCount !== 1 ? "s" : ""}</>
            )}
          </div>
        </div>
      ) : null}

      {/* Expanded full-set layout */}
      {expanded ? (
        slots ? (
          (() => {
            const parseAr = (ar: string) => {
              const parts = ar.split(":").map(Number);
              if (parts.length === 2 && parts[0] && parts[1]) return parts[0] / parts[1];
              return 1;
            };
            const indexed = slots.map((slot, i) => ({ slot, i, ratio: parseAr(slot.aspectRatio) }));
            const squareSlots = indexed.filter((s) => s.ratio === 1);
            const landscapeSlots = indexed.filter((s) => s.ratio > 1);

            const useStackedLayout = squareSlots.length === 1 && landscapeSlots.length === slots.length - 1 && landscapeSlots.length >= 1;

            if (useStackedLayout) {
              const sq = squareSlots[0];
              const lands = landscapeSlots.sort((a, b) => a.i - b.i);
              return (
                <div className="mt-2 flex gap-2">
                  <div className="w-1/3 shrink-0">
                    <div className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{sq.slot.type}</div>
                    <AssetSlot
                      asset={fullSetAssets[sq.i]}
                      generation={g}
                      idx={sq.i}
                      apiBaseUrl={props.apiBaseUrl}
                      assetUrl={props.assetUrl}
                      onOpenAsset={props.onOpenAsset}
                      isRunningOrQueued={runningOrQueued}
                      isSlotFilling={isSlotFilling(slotKey(sq.slot))}
                      isSlotQueued={isSlotQueued(slotKey(sq.slot))}
                      latestBatchPreview={null}
                      canFillSlot={false}
                      aspectClass="aspect-square"
                      label={sq.slot.type}
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    {lands.map(({ slot, i }) => (
                      <div key={`${slot.type}-${i}`}>
                        <div className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{slot.type}</div>
                        <AssetSlot
                          asset={fullSetAssets[i]}
                          generation={g}
                          idx={i}
                          apiBaseUrl={props.apiBaseUrl}
                          assetUrl={props.assetUrl}
                          onOpenAsset={props.onOpenAsset}
                          isRunningOrQueued={runningOrQueued}
                          isSlotFilling={isSlotFilling(slotKey(slot))}
                          isSlotQueued={isSlotQueued(slotKey(slot))}
                          latestBatchPreview={null}
                          canFillSlot={false}
                          aspectClass="aspect-video"
                          label={slot.type}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            }

            const reg = props.assetTypeRegistry;
            const row1 = indexed.filter(({ slot }) => reg.gridRow(slot.type) === "row1");
            const row2 = indexed.filter(({ slot }) => reg.gridRow(slot.type) === "row2");
            row1.sort((a, b) => reg.sortOrder(a.slot.type) - reg.sortOrder(b.slot.type));
            row2.sort((a, b) => {
              const aIsItem = a.slot.itemIndex !== undefined;
              const bIsItem = b.slot.itemIndex !== undefined;
              if (aIsItem && bIsItem) return (a.slot.itemIndex ?? 0) - (b.slot.itemIndex ?? 0);
              if (aIsItem) return -1;
              if (bIsItem) return 1;
              return reg.sortOrder(a.slot.type) - reg.sortOrder(b.slot.type);
            });
            const row1WidthClass = (type: string) => reg.gridSizeClass(type);
            const row1AspectClass = (type: string) => reg.aspectClass(type);
            return (
              <div className="mt-2 space-y-2">
                {row1.length > 0 ? <div className="flex gap-2">
                  {row1.map(({ slot, i }) => (
                    <div key={`${slot.type}-${i}`} className={row1WidthClass(slot.type)}>
                      <div className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{slot.type}</div>
                      <AssetSlot
                        asset={fullSetAssets[i]}
                        generation={g}
                        idx={i}
                        apiBaseUrl={props.apiBaseUrl}
                        assetUrl={props.assetUrl}
                        onOpenAsset={props.onOpenAsset}
                        isRunningOrQueued={runningOrQueued}
                        isSlotFilling={isSlotFilling(slotKey(slot))}
                        isSlotQueued={isSlotQueued(slotKey(slot))}
                        latestBatchPreview={null}
                        canFillSlot={false}
                        aspectClass={row1AspectClass(slot.type)}
                        label={slot.type}
                      />
                    </div>
                  ))}
                </div> : null}
                {row2.length > 0 ? <div className="grid grid-cols-4 gap-2">
                  {row2.map(({ slot, i }) => {
                    const lbl = slot.itemIndex !== undefined ? `${slot.type} ${(slot.itemIndex) + 1}` : slot.type;
                    return (
                      <div key={`${slot.type}-${slot.itemIndex ?? i}`}>
                        <div className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                          {slot.itemIndex !== undefined ? `${slot.type} ${(slot.itemIndex) + 1}` : slot.type}
                        </div>
                        <AssetSlot
                          asset={fullSetAssets[i]}
                          generation={g}
                          idx={i}
                          apiBaseUrl={props.apiBaseUrl}
                          assetUrl={props.assetUrl}
                          onOpenAsset={props.onOpenAsset}
                          isRunningOrQueued={runningOrQueued}
                          isSlotFilling={isSlotFilling(slotKey(slot))}
                          isSlotQueued={isSlotQueued(slotKey(slot))}
                          latestBatchPreview={null}
                          canFillSlot={false}
                          label={lbl}
                        />
                      </div>
                    );
                  })}
                </div> : null}
              </div>
            );
          })()
        ) : (
          <div className="mt-3">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {fullSetAssets.map((asset, i) => (
                <AssetSlot
                  key={i}
                  asset={asset}
                  generation={g}
                  idx={i}
                  apiBaseUrl={props.apiBaseUrl}
                  assetUrl={props.assetUrl}
                  onOpenAsset={props.onOpenAsset}
                  isRunningOrQueued={runningOrQueued}
                  isSlotFilling={isSlotFilling(asset?.itemIndex ?? i)}
                  isSlotQueued={isSlotQueued(asset?.itemIndex ?? i)}
                  latestBatchPreview={null}
                  canFillSlot={false}
                  label={asset?.type ?? `asset ${i + 1}`}
                />
              ))}
            </div>
          </div>
        )
      ) : null}
    </div>
  );
}

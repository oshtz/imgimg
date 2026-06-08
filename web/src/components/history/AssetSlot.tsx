import type { ApiBaseUrl } from "../../client";
import type { Asset, Generation } from "../../types";
import { isVideoAsset, isAudioAsset, displayItemIndex } from "./generationUtils";

export function AssetSlot(props: {
  asset: Asset | null;
  generation: Generation;
  idx: number;
  apiBaseUrl: ApiBaseUrl;
  assetUrl: (apiBaseUrl: ApiBaseUrl, asset: Asset) => string;
  onOpenAsset: (g: Generation, asset: Asset) => void;
  isRunningOrQueued: boolean;
  isSlotFilling: boolean;
  isSlotQueued: boolean;
  latestBatchPreview: Asset | null;
  canFillSlot: boolean;
  onFillSlot?: (generationId: string, slotIndex: number) => void;
  aspectClass?: string;
  label?: string;
}) {
  const { asset, generation: g, idx, isRunningOrQueued, isSlotFilling, latestBatchPreview, canFillSlot, aspectClass = "aspect-square", label } = props;
  const displayIndex = asset ? displayItemIndex(asset.itemIndex) : null;

  const showMissingOverlay = ((isRunningOrQueued && !asset) || (isSlotFilling && !asset)) && !props.isSlotQueued;
  const showPreviewOverlay = isRunningOrQueued && !!asset && asset.type === "preview";
  const showRegeneratingOverlay = isSlotFilling && !!asset && !showPreviewOverlay;
  const showQueuedOverlay = props.isSlotQueued && !showPreviewOverlay && !showRegeneratingOverlay;
  const isLivePreview =
    !!asset &&
    asset.type === "preview" &&
    !!latestBatchPreview &&
    asset.itemIndex === latestBatchPreview.itemIndex;

  return (
    <div
      className={`group relative ${aspectClass} overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900`}
    >
      {asset ? (
        <button
          type="button"
          className="h-full w-full cursor-pointer"
          onClick={() => props.onOpenAsset(g, asset)}
          aria-label={`Open ${asset.type}`}
        >
          {isAudioAsset(asset) ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-zinc-100 dark:bg-zinc-900">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 10v3a1 1 0 0 0 1 1h3l5 6V1L6 7H3a1 1 0 0 0-1 1z" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
              <span className="text-[11px] text-zinc-500">Audio</span>
            </div>
          ) : isVideoAsset(asset) ? (
            <>
              <video
                className="h-full w-full object-cover"
                src={props.assetUrl(props.apiBaseUrl, asset)}
                muted
                playsInline
                preload="metadata"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80">
                  <div className="ml-0.5 h-0 w-0 border-y-[6px] border-l-[10px] border-y-transparent border-l-zinc-900" />
                </div>
              </div>
            </>
          ) : (
            <img className="h-full w-full object-cover" src={props.assetUrl(props.apiBaseUrl, asset)} alt={asset.type} />
          )}
        </button>
      ) : (
        <div className="h-full w-full bg-zinc-200 dark:bg-zinc-800" />
      )}
      {showPreviewOverlay ? (
        <div className="absolute inset-0 overflow-hidden bg-black/20">
          <div
            className="absolute inset-0 animate-skeleton-shimmer"
            style={{
              backgroundImage: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)",
              backgroundSize: "200% 100%",
            }}
          />
        </div>
      ) : null}
      {showRegeneratingOverlay ? (
        <div className="absolute inset-0 overflow-hidden bg-black/25">
          <div
            className="absolute inset-0 animate-skeleton-shimmer"
            style={{
              backgroundImage: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)",
              backgroundSize: "200% 100%",
            }}
          />
        </div>
      ) : null}
      {showQueuedOverlay ? (
        <div className="absolute inset-0 overflow-hidden bg-black/25">
          <div
            className="absolute inset-0 animate-skeleton-shimmer"
            style={{
              backgroundImage: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)",
              backgroundSize: "200% 100%",
            }}
          />
        </div>
      ) : null}
      {showMissingOverlay ? (
        <div className="absolute inset-0 overflow-hidden bg-zinc-200 dark:bg-zinc-800">
          <div
            className="absolute inset-0 animate-skeleton-shimmer"
            style={{
              backgroundImage: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)",
              backgroundSize: "200% 100%",
            }}
          />
        </div>
      ) : null}
      {canFillSlot && props.onFillSlot ? (
        <button
          type="button"
          className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-2 bg-black/50 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
          onClick={() => props.onFillSlot!(g.id, idx)}
          aria-label="Generate image for this slot"
        >
          <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="text-xs font-medium">Fill slot</span>
        </button>
      ) : null}
      {asset && asset.type === "preview" ? (
        <div className="absolute left-2 top-2 inline-flex items-center gap-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white backdrop-blur">
          {isLivePreview ? (
            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-zinc-400" aria-hidden="true" />
          ) : null}
          <span>{isLivePreview ? "Generating…" : "Preview"}</span>
        </div>
      ) : null}
      {(asset || label) ? (
        <div className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white opacity-0 backdrop-blur group-hover:opacity-100">
          {label ?? asset?.type}
          {asset && displayIndex !== null && !label ? ` #${displayIndex}` : ""}
        </div>
      ) : null}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TbArrowsMaximize, TbBrush, TbChevronDown, TbCopy, TbDownload, TbHistory, TbPhotoOff, TbRefresh, TbSend, TbTrash, TbX, TbLoader, TbCheck, TbEdit, TbPlayerPlay } from "react-icons/tb";
import type { ApiBaseUrl, AssetTypeForInpaint, AssetTypeForRegen, WorkflowSummary } from "../api";
import type { Asset, Generation } from "../types";
import type { AssetTypeRegistry } from "../assetTypeRegistry";
import { InpaintCanvas, type InpaintCanvasHandle } from "./InpaintCanvas";
import { CopyableText } from "./CopyableText";
import { ZoomableImage } from "./ZoomableImage";
import { copyToClipboard } from "../utils/clipboard";
import { extractError } from "../utils/extractError";
import { OutpaintCanvas } from "./detail/OutpaintCanvas";
import type { OutpaintAspectRatio } from "./detail/outpaintUtils";
import {
  assetKey,
  isVideoAsset,
  isAudioAsset,
  downloadUrl,
  displayItemIndex,
  makeSortAssets,
  workflowLabel,
  pickDefaultAsset,
  statusPill,
} from "./detail/generationUtils";

export { statusPill } from "./detail/generationUtils";

export type OutpaintParams = {
  expandLeft: number;
  expandRight: number;
  expandTop: number;
  expandBottom: number;
  denoise: number;
  edgeBlend: number;
};

export type GenerationDetailSelection = {
  generationId: string;
  assetKey: string | null;
};

export function GenerationDetailPanel(props: {
  open: boolean;
  selection: GenerationDetailSelection | null;
  generation: Generation | null;
  workflows: WorkflowSummary[];
  assetTypeRegistry: AssetTypeRegistry;
  apiBaseUrl: ApiBaseUrl;
  assetUrl: (apiBaseUrl: ApiBaseUrl, asset: Asset) => string;
  modelNameById?: Record<string, string>;
  isAdmin: boolean;
  loading: boolean;
  onClose: () => void;
  onSelectAssetKey: (next: string | null) => void;
  onDeleteGeneration: (generationId: string) => void;
  onCancelGeneration: (generationId: string) => void;
  onRetryGeneration: (generationId: string) => void;
  onUsePrompt: (prompt: string, imageInputUrl?: string | null, imageInputUrls?: string[]) => void;
  onGenerateAgain: (g: Generation) => void;
  /** Callback to regenerate an asset. For items, pass itemIndex; for album/background, itemIndex is ignored. */
  onRegenerateItem: (generationId: string, itemIndex: number | null, assetType: AssetTypeForRegen, promptPrefix?: string) => void;
  onSendToWorkflow?: (workflowId: string, imageUrl: string) => void;
  onOutpaint?: (imageUrl: string, params: OutpaintParams, sourcePrompt: string) => void;
  onInpaint?: (params: {
    generationId: string;
    assetType: AssetTypeForInpaint;
    itemIndex: number | null;
    imageDataUrl: string;
    maskDataUrl: string;
    prompt: string;
    seed?: number;
  }) => void;
  onDownloadAll?: (generationId: string) => void;
  /** Callback to remove background from an asset. Returns true if started, false if already processing. */
  onRemoveBackground?: (generationId: string, itemIndex: number) => Promise<void>;
  /** Set of itemIndexes currently being processed for background removal */
  rembgProcessing?: Set<number>;
  /** Asset versions for the currently selected asset (sorted newest first) */
  assetVersions?: Asset[];
  /** Callback to switch to a different asset version */
  onSetActiveVersion?: (generationId: string, assetId: string) => Promise<void>;
  /** Whether version switching is in progress */
  versionSwitching?: boolean;
  /** Feature workflow configuration status */
  featureWorkflowStatus?: {
    inpaintConfigured: boolean;
    outpaintConfigured: boolean;
    rembgConfigured: boolean;
  };
}) {
  const [sendToMenuOpen, setSendToMenuOpen] = useState(false);
  const [outpaintModalOpen, setOutpaintModalOpen] = useState(false);
  const [outpaintParams, setOutpaintParams] = useState<OutpaintParams>({
    expandLeft: 0,
    expandRight: 0,
    expandTop: 0,
    expandBottom: 0,
    denoise: 1.0,
    edgeBlend: 64
  });
  const [outpaintAspectRatio, setOutpaintAspectRatio] = useState<OutpaintAspectRatio>(null);
  const [outpaintImageSize, setOutpaintImageSize] = useState<{ width: number; height: number }>({ width: 256, height: 256 });
  const [inpaintModalOpen, setInpaintModalOpen] = useState(false);
  const [inpaintBrushSize, setInpaintBrushSize] = useState(48);
  const [inpaintMode, setInpaintMode] = useState<"paint" | "erase">("paint");
  const [inpaintShowMask, setInpaintShowMask] = useState(true);
  const [inpaintInvertMask, setInpaintInvertMask] = useState(true);
  const [inpaintPrompt, setInpaintPrompt] = useState("");
  const [inpaintSeed, setInpaintSeed] = useState("");
  const [inpaintError, setInpaintError] = useState<string | null>(null);
  const inpaintCanvasRef = useRef<InpaintCanvasHandle>(null);
  const [regenPromptOpen, setRegenPromptOpen] = useState(false);
  const [regenPromptValue, setRegenPromptValue] = useState("");
  const [regenPromptTarget, setRegenPromptTarget] = useState<{ assetType: AssetTypeForRegen; itemIndex: number | null } | null>(null);
  // Toggle state: when true, show the rembg version instead of the original
  const [showRembg, setShowRembg] = useState(false);
  // Track whether the main preview image is still loading (e.g. downloading from S3)
  const [imageLoading, setImageLoading] = useState(false);
  // Stabilize the preview URL: only update when the underlying asset actually
  // changes (by ID), not when presigned URL params rotate on re-render.
  // This prevents the browser from aborting in-flight S3 downloads.
  const stablePreviewSrcRef = useRef<string | null>(null);
  const stablePreviewAssetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!props.open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") props.onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props.open, props.onClose]);

  useEffect(() => {
    if (!props.open) {
      setRegenPromptOpen(false);
      setRegenPromptTarget(null);
      setRegenPromptValue("");
    }
  }, [props.open]);

  const generation = props.generation;

  const inputImageUrls = useMemo(() => {
    if (!generation) return [];
    const rawInputs = Array.isArray(generation.workflowParams?.image_inputs)
      ? generation.workflowParams.image_inputs
      : generation.imageInputUrl
        ? [generation.imageInputUrl]
        : [];
    return rawInputs
      .filter((url): url is string => typeof url === "string" && url.trim().length > 0)
      .map((url) => (url.startsWith("http") || url.startsWith("data:") ? url : `${props.apiBaseUrl}${url}`));
  }, [generation, props.apiBaseUrl]);

  const sortAssets = useMemo(() => makeSortAssets(props.assetTypeRegistry), [props.assetTypeRegistry]);
  const visibleTypes = useMemo(() => props.assetTypeRegistry.visibleIds(), [props.assetTypeRegistry]);

  const assets = useMemo(() => {
    if (!generation) return [];
    // Filter to visible types only (excludes preview, rembg, placeholder)
    return [...generation.assets].filter((a) => visibleTypes.has(a.type)).sort(sortAssets);
  }, [generation, visibleTypes, sortAssets]);

  // Arrow key navigation between assets
  useEffect(() => {
    if (!props.open || !generation) return;
    if (assets.length <= 1) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;

      // Prevent default scroll behavior
      e.preventDefault();

      const currentKey = props.selection?.assetKey ?? null;
      let currentIndex = -1;
      if (currentKey) {
        currentIndex = assets.findIndex((a) => assetKey(a) === currentKey);
      }
      if (currentIndex === -1) {
        // If no asset selected, select based on direction
        currentIndex = e.key === "ArrowLeft" ? assets.length : -1;
      }

      let nextIndex: number;
      if (e.key === "ArrowLeft") {
        nextIndex = currentIndex - 1;
        if (nextIndex < 0) nextIndex = assets.length - 1; // wrap to end
      } else {
        nextIndex = currentIndex + 1;
        if (nextIndex >= assets.length) nextIndex = 0; // wrap to start
      }

      const nextAsset = assets[nextIndex];
      if (nextAsset) {
        props.onSelectAssetKey(assetKey(nextAsset));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props.open, generation, assets, props.selection?.assetKey, props.onSelectAssetKey]);

  const livePreview = useMemo(() => {
    if (!generation) return null;
    if (generation.status !== "running" && generation.status !== "queued") return null;
    let latest: Asset | null = null;
    for (const a of generation.assets) {
      if (a.type !== "preview") continue;
      if (!latest || a.createdAt.localeCompare(latest.createdAt) > 0) latest = a;
    }
    return latest;
  }, [generation]);

  const selectedAsset = useMemo(() => {
    if (!generation) return null;
    const key = props.selection?.assetKey ?? null;
    if (key) {
      const found = generation.assets.find((a) => visibleTypes.has(a.type) && assetKey(a) === key) ?? null;
      if (found) return found;
    }
    return pickDefaultAsset(generation, props.assetTypeRegistry);
  }, [generation, props.selection?.assetKey, visibleTypes, props.assetTypeRegistry]);

  // Find matching rembg asset for the selected asset (matched by itemIndex)
  const rembgAsset = useMemo(() => {
    if (!generation || !selectedAsset) return null;
    if (selectedAsset.itemIndex === null || selectedAsset.itemIndex === undefined) return null;
    return generation.assets.find(
      (a) => a.type === "rembg" && a.itemIndex === selectedAsset.itemIndex
    ) ?? null;
  }, [generation, selectedAsset]);

  // Check if the current asset is being processed for rembg
  const isRembgProcessing = useMemo(() => {
    if (!selectedAsset || selectedAsset.itemIndex === null || selectedAsset.itemIndex === undefined) return false;
    return props.rembgProcessing?.has(selectedAsset.itemIndex) ?? false;
  }, [selectedAsset, props.rembgProcessing]);

  // Set showRembg based on whether the asset has a rembg version
  // When rembg exists, default to showing it; otherwise show original
  // This also handles the auto-toggle when processing completes (rembgAsset appears)
  useEffect(() => {
    setShowRembg(Boolean(rembgAsset));
  }, [rembgAsset]);

  // Filter workflows that support image input for "Send to" feature
  // Must be before any early returns to satisfy React hooks rules
  const imageInputWorkflows = useMemo(() => {
    return props.workflows.filter((w) => w.supportsImageInput === true);
  }, [props.workflows]);

  // Derive a stable identity for the asset that will be displayed in the main preview.
  // When this changes, we know a new image needs to download (e.g. version switch,
  // asset selection change, rembg toggle) so we trigger the loading state.
  const displayedAssetIdentity = useMemo(() => {
    if (!generation || !selectedAsset) return null;
    const da = (showRembg && rembgAsset) ? rembgAsset : selectedAsset;
    if (isVideoAsset(da) || isAudioAsset(da)) return null; // don't track loading for videos/audio
    return da.id;
  }, [generation, selectedAsset, showRembg, rembgAsset]);

  // Track which asset identity we last marked as "loading".
  // Setting imageLoading synchronously during render (not in useEffect) ensures
  // onLoad always fires AFTER imageLoading=true, even for fast local images.
  const prevDisplayedIdentityRef = useRef<string | null>(null);
  if (displayedAssetIdentity !== prevDisplayedIdentityRef.current) {
    prevDisplayedIdentityRef.current = displayedAssetIdentity;
    if (displayedAssetIdentity !== null) {
      // Synchronously mark loading so onLoad (which fires after paint) always clears it
      if (!imageLoading) setImageLoading(true);
    } else {
      if (imageLoading) setImageLoading(false);
    }
  }

  const fullSetIndicators = useMemo(() => props.assetTypeRegistry.fullSetIndicatorIds(), [props.assetTypeRegistry]);
  const downloadableTypes = useMemo(() => props.assetTypeRegistry.downloadableIds(), [props.assetTypeRegistry]);

  useEffect(() => {
    if (!props.open) return;
    if (!generation) return;
    if (!selectedAsset) return;
    const k = assetKey(selectedAsset);
    if (props.selection?.assetKey === k) return;
    props.onSelectAssetKey(k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, generation?.id, selectedAsset ? assetKey(selectedAsset) : null]);

  if (!props.open || !props.selection || !generation) return null;

  // When toggle is on and rembg version exists, show that instead
  const displayedAsset = (showRembg && rembgAsset) ? rembgAsset : (selectedAsset ?? livePreview);
  const previewSrc = displayedAsset ? props.assetUrl(props.apiBaseUrl, displayedAsset) : null;

  // Only update the stable src when the asset ID actually changes.
  // This prevents the browser from aborting in-flight S3 downloads when
  // React re-renders with a new presigned URL for the same object.
  const currentAssetId = displayedAsset?.id ?? null;
  if (currentAssetId !== stablePreviewAssetIdRef.current) {
    stablePreviewAssetIdRef.current = currentAssetId;
    stablePreviewSrcRef.current = previewSrc;
  }
  const stablePreviewSrc = stablePreviewSrcRef.current;

  // Can remove background from images (not videos, not audio, not system types)
  const canRemoveBackground = selectedAsset && !isVideoAsset(selectedAsset) && !isAudioAsset(selectedAsset) && visibleTypes.has(selectedAsset.type) && props.onRemoveBackground;
  const canDownload = displayedAsset ? visibleTypes.has(displayedAsset.type) : false;
  const label = workflowLabel(props.workflows, generation.workflowUsed);
  const modelDisplayName = props.modelNameById?.[generation.modelId];
  const modelLabel = props.isAdmin
    ? modelDisplayName
      ? `${modelDisplayName} (${generation.modelId})`
      : generation.modelId
    : modelDisplayName ?? "Unknown model";

  const selectedTitleParts: string[] = [];
  if (displayedAsset) {
    selectedTitleParts.push(displayedAsset.type);
    const displayIndex = displayItemIndex(displayedAsset.itemIndex);
    if (displayIndex !== null) selectedTitleParts.push(`#${displayIndex}`);
  }
  const selectedTitle = selectedTitleParts.join(" ");

  const inferredOutputMode = generation.assets.some((a) => fullSetIndicators.has(a.type)) ? "full_set" : "single_image";
  const outputMode = props.workflows.find((w) => w.id === generation.workflowUsed)?.outputMode ?? inferredOutputMode;
  const canRegenerateItems = outputMode === "full_set";
  const canDownloadAll =
    outputMode === "full_set" &&
    props.onDownloadAll &&
    generation.assets.some((a) => downloadableTypes.has(a.type));

  // Check if current asset is an image (not video/audio) and can be sent
  const canSendToWorkflow = displayedAsset && !isVideoAsset(displayedAsset) && !isAudioAsset(displayedAsset) && visibleTypes.has(displayedAsset.type) && imageInputWorkflows.length > 0;

  // Check if we can outpaint this asset (only images, not videos/audio or previews)
  const canOutpaint = displayedAsset && !isVideoAsset(displayedAsset) && !isAudioAsset(displayedAsset) && visibleTypes.has(displayedAsset.type) && props.onOutpaint;
  const canInpaint = selectedAsset && !isVideoAsset(selectedAsset) && !isAudioAsset(selectedAsset) && visibleTypes.has(selectedAsset.type) && props.onInpaint;

  // Calculate if outpaint params are valid (at least one direction must be expanded)
  const hasValidOutpaintParams = outpaintParams.expandLeft > 0 || outpaintParams.expandRight > 0 || outpaintParams.expandTop > 0 || outpaintParams.expandBottom > 0;
  const openRegenPrompt = (assetType: AssetTypeForRegen, itemIndex: number | null) => {
    setRegenPromptTarget({ assetType, itemIndex });
    setRegenPromptValue("");
    setRegenPromptOpen(true);
  };

  return (
    <div className="fixed inset-x-0 top-8 bottom-0 z-50">
      <button type="button" className="absolute inset-0 bg-black/70" onClick={props.onClose} aria-label="Close details" />

      <div className="absolute inset-0 flex" role="dialog" aria-modal="true">
        <div className="min-w-0 flex-1 p-6" onClick={props.onClose}>
          <div className="relative h-full overflow-hidden" onClick={props.onClose}>
            <div className="absolute right-2 top-2 z-10 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              {/* Background toggle - show when rembg version is available or processing */}
              {(rembgAsset || isRembgProcessing) && !isVideoAsset(selectedAsset!) && !isAudioAsset(selectedAsset!) ? (
                <button
                  type="button"
                  onClick={() => setShowRembg((v) => !v)}
                  disabled={isRembgProcessing && !rembgAsset}
                  className={[
                    "inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs backdrop-blur transition-colors",
                    showRembg && rembgAsset
                      ? "bg-zinc-600/90 text-white hover:bg-zinc-600"
                      : "bg-zinc-900/70 text-white hover:bg-zinc-900",
                    isRembgProcessing && !rembgAsset ? "opacity-60 cursor-wait" : ""
                  ].join(" ")}
                  title={showRembg ? "Show original background" : "Show removed background"}
                >
                  {isRembgProcessing && !rembgAsset ? (
                    <TbLoader className="h-4 w-4 animate-spin" />
                  ) : (
                    <TbPhotoOff className="h-4 w-4" />
                  )}
                  {showRembg && rembgAsset ? "Original" : "No BG"}
                </button>
              ) : null}
              {previewSrc && canDownload ? (
                <button
                  type="button"
                  onClick={() => {
                    const ext = previewSrc.split("?")[0].split(".").pop() ?? "bin";
                    const filename = `${displayedAsset?.type ?? "asset"}.${ext}`;
                    void downloadUrl(previewSrc, filename);
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-zinc-900/70 px-3 py-2 text-xs text-white backdrop-blur hover:bg-zinc-900"
                >
                  <TbDownload className="h-4 w-4" />
                  Download
                </button>
              ) : null}
              {canDownloadAll ? (
                <button
                  type="button"
                  onClick={() => props.onDownloadAll?.(generation.id)}
                  className="inline-flex items-center gap-2 rounded-full bg-zinc-900/70 px-3 py-2 text-xs text-white backdrop-blur hover:bg-zinc-900 disabled:opacity-60"
                  disabled={props.loading}
                >
                  <TbDownload className="h-4 w-4" />
                  Download all
                </button>
              ) : null}
              <button
                type="button"
                onClick={props.onClose}
                className="inline-flex items-center justify-center rounded-full bg-zinc-900/70 p-2 text-white backdrop-blur hover:bg-zinc-900"
                aria-label="Close"
              >
                <TbX className="h-4 w-4" />
              </button>
            </div>

            <div className="flex h-full items-center justify-center">
              {stablePreviewSrc ? (
                displayedAsset && isAudioAsset(displayedAsset) ? (
                  <div className="flex flex-col items-center justify-center gap-6 rounded-xl border border-zinc-200 bg-zinc-50 p-10 dark:border-zinc-800 dark:bg-zinc-900/60" onClick={(e) => e.stopPropagation()}>
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-800">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 10v3a1 1 0 0 0 1 1h3l5 6V1L6 7H3a1 1 0 0 0-1 1z" />
                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                      </svg>
                    </div>
                    <audio
                      controls
                      src={stablePreviewSrc}
                      className="w-full max-w-md"
                    />
                    <p className="max-w-md text-center text-sm text-zinc-500 dark:text-zinc-400">
                      {generation.prompt}
                    </p>
                  </div>
                ) : displayedAsset && isVideoAsset(displayedAsset) ? (
                  <video
                    className="max-h-full max-w-full rounded-xl border border-zinc-200 object-contain dark:border-zinc-800"
                    src={stablePreviewSrc}
                    controls
                    autoPlay
                    loop
                    muted
                    playsInline
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <ZoomableImage
                    src={stablePreviewSrc}
                    alt={selectedTitle}
                    onLoad={() => setImageLoading(false)}
                    onError={() => setImageLoading(false)}
                    imgClassName="rounded-xl border border-zinc-200 dark:border-zinc-800"
                    loading={imageLoading}
                    resetKey={displayedAssetIdentity}
                  />
                )
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-xl bg-zinc-900/40" onClick={(e) => e.stopPropagation()}>
                  <div className="text-sm text-zinc-200">
                    {generation.status === "queued" ? "Queued…" : generation.status === "running" ? "Generating…" : "No image yet"}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="h-full w-[420px] shrink-0 bg-white dark:bg-zinc-950" onClick={(e) => e.stopPropagation()}>
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="px-5 pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={["inline-flex h-2 w-2 shrink-0 rounded-full", generation.status === "succeeded" ? "bg-emerald-500" : generation.status === "failed" ? "bg-red-500" : generation.status === "running" ? "bg-blue-500 animate-pulse" : "bg-zinc-400"].join(" ")} />
                  <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{selectedTitle || "Details"}</span>
                </div>
                <button
                  type="button"
                  onClick={props.onClose}
                  className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-900 dark:hover:text-zinc-300"
                  aria-label="Close"
                >
                  <TbX className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-1 flex items-center gap-1.5 pl-[18px] text-[11px] text-zinc-400 dark:text-zinc-500">
                <span className="truncate">{label}</span>
                <span className="text-zinc-300 dark:text-zinc-700">&middot;</span>
                <span>{new Date(generation.createdAt).toLocaleString()}</span>
                {generation.queuePosition !== undefined && generation.queuePosition !== null ? (
                  <>
                    <span className="text-zinc-300 dark:text-zinc-700">&middot;</span>
                    <span>Queue #{generation.queuePosition}</span>
                  </>
                ) : null}
              </div>
            </div>

            {/* Asset thumbnails */}
            <div className="px-5 pb-3">
              <div className="flex gap-1.5 overflow-x-auto p-1">
                {assets.length === 0
                  ? Array.from({ length: 6 }).map((_, idx) => (
                      <div
                        key={idx}
                        className="h-12 w-12 shrink-0 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900"
                      />
                    ))
                  : assets.map((a) => {
                    const k = assetKey(a);
                    const src = props.assetUrl(props.apiBaseUrl, a);
                    const selected = props.selection?.assetKey === k;
                    const isVideo = isVideoAsset(a);
                    const isAudio = isAudioAsset(a);
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => props.onSelectAssetKey(k)}
                        className={[
                          "relative h-12 w-12 shrink-0 overflow-hidden rounded-lg transition-all",
                          selected
                            ? "ring-2 ring-zinc-900 ring-offset-1 dark:ring-zinc-100 dark:ring-offset-zinc-950"
                            : "opacity-60 hover:opacity-100",
                        ].join(" ")}
                        aria-label={`Select ${a.type}`}
                      >
                        {isAudio ? (
                          <div className="flex h-full w-full items-center justify-center bg-zinc-100 dark:bg-zinc-900">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M2 10v3a1 1 0 0 0 1 1h3l5 6V1L6 7H3a1 1 0 0 0-1 1z" />
                              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                            </svg>
                          </div>
                        ) : isVideo ? (
                          <>
                            <video className="h-full w-full object-cover" src={src} muted playsInline preload="metadata" />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                              <TbPlayerPlay className="h-4 w-4 text-white" />
                            </div>
                          </>
                        ) : (
                          <img className="h-full w-full object-cover" src={src} alt={a.type} />
                        )}
                      </button>
                    );
                  })
                }
              </div>

              {/* Version History */}
              {props.assetVersions && props.assetVersions.length > 1 && selectedAsset ? (
                <div className="mt-2">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <TbHistory className="h-3 w-3 text-zinc-400" />
                    <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                      Versions ({props.assetVersions.length})
                    </span>
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {props.assetVersions.map((version, idx) => {
                      const src = props.assetUrl(props.apiBaseUrl, version);
                      const isActive = version.isActive === true;
                      return (
                        <button
                          key={version.id}
                          type="button"
                          onClick={() => {
                            if (props.onSetActiveVersion && !isActive && !props.versionSwitching) {
                              void props.onSetActiveVersion(generation.id, version.id);
                            }
                          }}
                          disabled={isActive || props.versionSwitching}
                          className={[
                            "relative h-10 w-10 shrink-0 overflow-hidden rounded-md transition-all",
                            isActive
                              ? "ring-2 ring-zinc-900 ring-offset-1 dark:ring-zinc-100 dark:ring-offset-zinc-950"
                              : "opacity-50 hover:opacity-100",
                            props.versionSwitching ? "cursor-wait" : ""
                          ].join(" ")}
                          title={isActive ? `Current (v${props.assetVersions!.length - idx})` : `Switch to v${props.assetVersions!.length - idx}`}
                        >
                          <img className="h-full w-full object-cover" src={src} alt={`Version ${props.assetVersions!.length - idx}`} />
                          {isActive && (
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 py-px text-center text-[8px] font-medium text-white">
                              v{props.assetVersions!.length - idx}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mx-5 border-t border-zinc-100 dark:border-zinc-900" />

            {/* Scrollable body */}
            <div className="flex-1 overflow-auto px-5 py-4">

              {/* Primary actions row */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => props.onGenerateAgain(generation)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                  disabled={props.loading}
                >
                  <TbRefresh className="h-3.5 w-3.5" />
                  Generate again
                </button>
                <button
                  type="button"
                  onClick={() => props.onUsePrompt(generation.prompt, generation.imageInputUrl, inputImageUrls)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  disabled={props.loading}
                >
                  <TbEdit className="h-3.5 w-3.5" />
                  Edit
                </button>
              </div>

              {/* Prompt section */}
              {(() => {
                const assetPrompt = selectedAsset?.prompt ?? null;
                const loraPrefix = generation.workflowParams?.lora_prompt_prefix
                  ? String(generation.workflowParams.lora_prompt_prefix)
                  : null;
                const aspectRatio = generation.workflowParams?.aspect_ratio
                  ? String(generation.workflowParams.aspect_ratio)
                  : null;
                const isOpenRouter = generation.workflowUsed?.includes("openrouter") ?? false;

                let reconstructed = generation.prompt;
                if (loraPrefix) {
                  reconstructed = `${loraPrefix}, ${reconstructed}`;
                }
                let aspectPrefix: string | null = null;
                if (isOpenRouter && aspectRatio) {
                  const arParts = aspectRatio.split(":");
                  const w = Number(arParts[0]);
                  const h = Number(arParts[1]);
                  if (w > h) {
                    aspectPrefix = `Create a wide horizontal ${aspectRatio} landscape image of`;
                  } else if (h > w) {
                    aspectPrefix = `Create a tall vertical ${aspectRatio} portrait image of`;
                  } else {
                    aspectPrefix = `Create a square ${aspectRatio} image of`;
                  }
                  reconstructed = `${aspectPrefix} ${reconstructed}`;
                }

                const hasModifications = reconstructed !== generation.prompt;
                const primaryPrompt = assetPrompt ?? (hasModifications ? reconstructed : generation.prompt);
                const showAssetPrompt = Boolean(assetPrompt);

                return (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                        {showAssetPrompt ? "Asset prompt" : hasModifications ? "Final prompt" : "Prompt"}
                      </span>
                      <button
                        type="button"
                        onClick={() => { void copyToClipboard(primaryPrompt); }}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-900 dark:hover:text-zinc-300"
                        disabled={props.loading}
                      >
                        <TbCopy className="h-3 w-3" />
                        Copy
                      </button>
                    </div>
                    <div className="rounded-xl bg-zinc-50 px-3.5 py-3 dark:bg-zinc-900/50">
                      <CopyableText text={primaryPrompt} className="block text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-words">
                        {primaryPrompt}
                      </CopyableText>

                      {hasModifications && !showAssetPrompt ? (
                        <div className="mt-3 space-y-1.5 border-t border-zinc-200/60 pt-3 dark:border-zinc-800/60">
                          {loraPrefix ? (
                            <div className="rounded-lg bg-zinc-100 px-2.5 py-1.5 dark:bg-zinc-800/50">
                              <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">LoRA prefix</div>
                              <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">{loraPrefix}</div>
                            </div>
                          ) : null}
                          {aspectPrefix ? (
                            <div className="rounded-lg bg-zinc-100 px-2.5 py-1.5 dark:bg-zinc-800/50">
                              <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Aspect prefix ({aspectRatio})</div>
                              <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">{aspectPrefix}</div>
                            </div>
                          ) : null}
                          <div className="rounded-lg bg-zinc-100 px-2.5 py-1.5 dark:bg-zinc-800/50">
                            <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Your input</div>
                            <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">{generation.prompt}</div>
                          </div>
                        </div>
                      ) : null}

                      {showAssetPrompt ? (
                        <div className="mt-3 border-t border-zinc-200/60 pt-3 dark:border-zinc-800/60">
                          <div className="rounded-lg bg-zinc-100 px-2.5 py-1.5 dark:bg-zinc-800/50">
                            <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Your input</div>
                            <CopyableText text={generation.prompt} className="block mt-0.5 text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap break-words">
                              {generation.prompt}
                            </CopyableText>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })()}

              {/* Input images */}
              {inputImageUrls.length > 0 ? (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      {inputImageUrls.length > 1 ? "Input images" : "Input image"}
                    </span>
                    <button
                      type="button"
                      onClick={() => props.onUsePrompt(generation.prompt, generation.imageInputUrl, inputImageUrls)}
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-900 dark:hover:text-zinc-300"
                      disabled={props.loading}
                    >
                      <TbRefresh className="h-3 w-3" />
                      Reuse
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {inputImageUrls.map((url, index) => (
                      <button
                        key={`${url}-${index}`}
                        type="button"
                        onClick={() => {
                          void (async () => {
                            try {
                              const res = await fetch(url);
                              const blob = await res.blob();
                              const objectUrl = URL.createObjectURL(blob);
                              const w = window.open("", "_blank");
                              if (w) {
                                w.document.title = `Input image ${index + 1}`;
                                w.document.body.style.margin = "0";
                                w.document.body.style.background = "#000";
                                w.document.body.style.display = "flex";
                                w.document.body.style.alignItems = "center";
                                w.document.body.style.justifyContent = "center";
                                w.document.body.style.height = "100vh";
                                const img = w.document.createElement("img");
                                img.src = objectUrl;
                                img.style.maxWidth = "100%";
                                img.style.maxHeight = "100%";
                                img.style.objectFit = "contain";
                                w.document.body.appendChild(img);
                              }
                            } catch {
                              console.error("Failed to open input image");
                            }
                          })();
                        }}
                        className="group relative shrink-0"
                      >
                        <img
                          src={url}
                          alt={`Input image ${index + 1}`}
                          className="h-14 w-14 rounded-lg object-cover transition-all group-hover:brightness-90 dark:group-hover:brightness-75"
                        />
                        <div className="absolute inset-0 flex items-center justify-center rounded-lg opacity-0 transition-opacity group-hover:opacity-100">
                          <TbArrowsMaximize className="h-4 w-4 text-white drop-shadow-md" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Tools & editing */}
              {(canSendToWorkflow || canOutpaint || canInpaint || canRemoveBackground) ? (
                <div className="mt-5">
                  <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Tools</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {canSendToWorkflow && props.onSendToWorkflow && previewSrc ? (
                      <div className="relative col-span-2">
                        <button
                          type="button"
                          onClick={() => setSendToMenuOpen((prev) => !prev)}
                          className="inline-flex w-full items-center gap-2 rounded-lg border border-zinc-150 px-3 py-2 text-xs text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
                          disabled={props.loading}
                        >
                          <TbSend className="h-3.5 w-3.5" />
                          Send to workflow
                          <TbChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform ${sendToMenuOpen ? "rotate-180" : ""}`} />
                        </button>
                        {sendToMenuOpen ? (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setSendToMenuOpen(false)} />
                            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
                              {imageInputWorkflows.map((w) => (
                                <button
                                  key={w.id}
                                  type="button"
                                  onClick={() => {
                                    const sendUrl = displayedAsset
                                      ? `${props.apiBaseUrl}/generations/${encodeURIComponent(displayedAsset.generationId)}/assets/${encodeURIComponent(displayedAsset.id)}/raw`
                                      : previewSrc;
                                    props.onSendToWorkflow!(w.id, sendUrl);
                                    setSendToMenuOpen(false);
                                  }}
                                  className="w-full px-3 py-2 text-left text-xs text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
                                >
                                  {w.label}
                                </button>
                              ))}
                            </div>
                          </>
                        ) : null}
                      </div>
                    ) : null}

                    {canOutpaint && previewSrc ? (
                      <button
                        type="button"
                        onClick={() => setOutpaintModalOpen(true)}
                        className="inline-flex items-center gap-2 rounded-lg border border-zinc-150 px-3 py-2 text-xs text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
                        disabled={props.loading}
                      >
                        <TbArrowsMaximize className="h-3.5 w-3.5" />
                        Outpaint
                      </button>
                    ) : null}

                    {canInpaint && previewSrc ? (
                      <button
                        type="button"
                        onClick={() => {
                          setInpaintPrompt(generation.prompt);
                          setInpaintSeed("");
                          setInpaintMode("paint");
                          setInpaintShowMask(true);
                          setInpaintInvertMask(true);
                          setInpaintError(null);
                          setInpaintBrushSize(48);
                          inpaintCanvasRef.current?.clearMask();
                          setInpaintModalOpen(true);
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-zinc-150 px-3 py-2 text-xs text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
                        disabled={props.loading}
                      >
                        <TbBrush className="h-3.5 w-3.5" />
                        Inpaint
                      </button>
                    ) : null}

                    {canRemoveBackground && selectedAsset && selectedAsset.itemIndex !== null && selectedAsset.itemIndex !== undefined ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (props.onRemoveBackground && selectedAsset.itemIndex !== null && selectedAsset.itemIndex !== undefined) {
                            void props.onRemoveBackground(generation.id, selectedAsset.itemIndex);
                          }
                        }}
                        className={[
                          "inline-flex items-center gap-2 rounded-lg border border-zinc-150 px-3 py-2 text-xs transition-colors disabled:opacity-50 dark:border-zinc-800",
                          rembgAsset
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900"
                        ].join(" ")}
                        disabled={props.loading || isRembgProcessing || !!rembgAsset}
                      >
                        {isRembgProcessing ? (
                          <TbLoader className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <TbPhotoOff className="h-3.5 w-3.5" />
                        )}
                        {isRembgProcessing ? "Removing..." : rembgAsset ? "BG removed" : "Remove BG"}
                      </button>
                    ) : null}
                  </div>
                  {/* Feature workflow hints when not configured */}
                  {displayedAsset && !isVideoAsset(displayedAsset) && !isAudioAsset(displayedAsset) && visibleTypes.has(displayedAsset.type) && props.featureWorkflowStatus && (
                    !props.featureWorkflowStatus.outpaintConfigured || !props.featureWorkflowStatus.inpaintConfigured || !props.featureWorkflowStatus.rembgConfigured
                  ) ? (
                    <p className="mt-1 text-[10px] leading-tight text-zinc-400 dark:text-zinc-500">
                      {[
                        !props.featureWorkflowStatus.outpaintConfigured && "Outpaint",
                        !props.featureWorkflowStatus.inpaintConfigured && "Inpaint",
                        !props.featureWorkflowStatus.rembgConfigured && "Remove BG",
                      ].filter(Boolean).join(", ")}{" "}
                      — configure in Settings &gt; Feature Workflows
                    </p>
                  ) : null}
                </div>
              ) : null}

              {/* Regenerate section */}
              {canRegenerateItems ? (() => {
                const currentWorkflow = props.workflows.find((w) => w.id === generation.workflowUsed);
                const regenSlots = currentWorkflow?.fullSetSlots;

                const renderSlots = (slots: Array<{ type: string; itemIndex?: number }>) => (
                  <div className="mt-5">
                    <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Regenerate</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {slots.map((slot, i) => {
                        const slotLabel = slot.itemIndex !== undefined
                          ? `${slot.type.charAt(0).toUpperCase() + slot.type.slice(1)} ${slot.itemIndex + 1}`
                          : slot.type.charAt(0).toUpperCase() + slot.type.slice(1);
                        const itemIdx = slot.itemIndex ?? null;
                        const assetType = slot.type as AssetTypeForRegen;
                        return (
                          <button
                            key={`${slot.type}-${slot.itemIndex ?? i}`}
                            type="button"
                            onClick={() =>
                              slot.itemIndex !== undefined
                                ? openRegenPrompt(assetType, itemIdx)
                                : props.onRegenerateItem(generation.id, itemIdx, assetType)
                            }
                            className="rounded-lg border border-zinc-150 px-2.5 py-2 text-xs text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
                            disabled={props.loading}
                          >
                            {slotLabel}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );

                if (regenSlots) {
                  return renderSlots(regenSlots);
                }

                const visibleAssets = generation.assets.filter(
                  (a) => a.type !== "rembg" && a.type !== "preview" && a.type !== "placeholder"
                );
                return renderSlots(visibleAssets.map((a) => ({ type: a.type, itemIndex: a.itemIndex ?? undefined })));
              })() : null}

              {/* Error */}
              {generation.error ? (
                <div className="mt-5 rounded-xl bg-red-50 px-3.5 py-2.5 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
                  {generation.error}
                </div>
              ) : null}

              {/* Footer: metadata + delete */}
              <div className="mt-6 border-t border-zinc-100 pt-4 dark:border-zinc-900">
                <div className="space-y-1 text-[11px] text-zinc-400 dark:text-zinc-600">
                  <div className="flex justify-between">
                    <span>Model</span>
                    <span className={["text-zinc-500 dark:text-zinc-500 truncate ml-4 text-right", props.isAdmin ? "font-mono" : ""].join(" ")}>{modelLabel}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Workflow</span>
                    <span className="font-mono text-zinc-500 dark:text-zinc-500 truncate ml-4 text-right">{generation.workflowUsed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ID</span>
                    <span className="font-mono text-zinc-500 dark:text-zinc-500 truncate ml-4 text-right">{generation.id}</span>
                  </div>
                </div>

                {generation.status === "queued" || generation.status === "running" || generation.status === "cancel_requested" ? (
                  <button
                    type="button"
                    onClick={() => props.onCancelGeneration(generation.id)}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-amber-200 py-2 text-xs text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-50 dark:border-amber-900 dark:text-amber-300 dark:hover:bg-amber-950/20"
                    disabled={props.loading || generation.status === "cancel_requested"}
                  >
                    <TbX className="h-3.5 w-3.5" />
                    {generation.status === "cancel_requested" ? "Cancelling…" : "Cancel generation"}
                  </button>
                ) : null}

                {generation.status === "failed" || generation.status === "cancelled" || generation.status === "interrupted" ? (
                  <button
                    type="button"
                    onClick={() => props.onRetryGeneration(generation.id)}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 py-2 text-xs text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    disabled={props.loading}
                  >
                    <TbRefresh className="h-3.5 w-3.5" />
                    Retry as new generation
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => props.onDeleteGeneration(generation.id)}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/20 dark:hover:text-red-400"
                  disabled={props.loading}
                >
                  <TbTrash className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Outpaint Modal */}
      {outpaintModalOpen && previewSrc ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOutpaintModalOpen(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Expand Image</h3>
              <button
                type="button"
                onClick={() => setOutpaintModalOpen(false)}
                className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white"
              >
                <TbX className="h-5 w-5" />
              </button>
            </div>

            {/* Interactive drag-to-uncrop canvas */}
            <div className="mt-4">
              <OutpaintCanvas
                imageSrc={previewSrc}
                params={outpaintParams}
                onParamsChange={setOutpaintParams}
                selectedAspectRatio={outpaintAspectRatio}
                onAspectRatioChange={setOutpaintAspectRatio}
                imageSize={outpaintImageSize}
                onImageSizeChange={setOutpaintImageSize}
              />
            </div>

            <div className="mt-4 space-y-4 px-2">
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Edge Blend</label>
                  <span className="text-xs text-zinc-500">{outpaintParams.edgeBlend}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="256"
                  step="16"
                  value={outpaintParams.edgeBlend}
                  onChange={(e) => setOutpaintParams((p) => ({ ...p, edgeBlend: Number(e.target.value) }))}
                  className="mt-1 w-full"
                />
                <div className="flex justify-between text-[11px] text-zinc-400">
                  <span>Hard edge</span>
                  <span>Soft edge</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Creativity</label>
                  <span className="text-xs text-zinc-500">{Math.round(outpaintParams.denoise * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="1.0"
                  step="0.05"
                  value={outpaintParams.denoise}
                  onChange={(e) => setOutpaintParams((p) => ({ ...p, denoise: Number(e.target.value) }))}
                  className="mt-1 w-full"
                />
                <div className="flex justify-between text-[11px] text-zinc-400">
                  <span>More consistent</span>
                  <span>More creative</span>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setOutpaintModalOpen(false);
                  // Reset params
                  setOutpaintParams({
                    expandLeft: 0,
                    expandRight: 0,
                    expandTop: 0,
                    expandBottom: 0,
                    denoise: 1.0,
                    edgeBlend: 64
                  });
                  setOutpaintAspectRatio(null);
                }}
                className="flex-1 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (props.onOutpaint && previewSrc && hasValidOutpaintParams) {
                    props.onOutpaint(previewSrc, outpaintParams, generation.prompt);
                    setOutpaintModalOpen(false);
                    // Reset params for next time
                    setOutpaintParams({
                      expandLeft: 0,
                      expandRight: 0,
                      expandTop: 0,
                      expandBottom: 0,
                      denoise: 1.0,
                      edgeBlend: 64
                    });
                    setOutpaintAspectRatio(null);
                  }
                }}
                disabled={!hasValidOutpaintParams || props.loading}
                className="flex-1 rounded-lg bg-zinc-600 px-4 py-2 text-sm text-white hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Expand Image
              </button>
            </div>

            {!hasValidOutpaintParams && (
              <p className="mt-2 text-center text-xs text-zinc-600 dark:text-zinc-400">
                Select an aspect ratio or drag edges to expand
              </p>
            )}
          </div>
        </div>
      ) : null}

      {/* Inpaint Modal */}
      {inpaintModalOpen && previewSrc ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setInpaintModalOpen(false)} />
          <div className="relative z-10 w-full max-w-5xl rounded-xl border border-zinc-200 bg-white p-6 shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Inpaint Mask</h3>
              <button
                type="button"
                onClick={() => setInpaintModalOpen(false)}
                className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white"
              >
                <TbX className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div>
                <InpaintCanvas
                  ref={inpaintCanvasRef}
                  imageSrc={previewSrc}
                  fetchSrc={displayedAsset ? `${props.apiBaseUrl}/generations/${encodeURIComponent(displayedAsset.generationId)}/assets/${encodeURIComponent(displayedAsset.id)}/raw` : undefined}
                  brushSize={inpaintBrushSize}
                  mode={inpaintMode}
                  showMask={inpaintShowMask}
                />
                <div className="mt-2 text-[11px] text-zinc-500">
                  Paint the area to replace. The mask is stored in the alpha channel.
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-300">
                    <span>Brush size</span>
                    <span>{Math.round(inpaintBrushSize)}px</span>
                  </div>
                  <input
                    type="range"
                    min="8"
                    max="128"
                    step="2"
                    value={inpaintBrushSize}
                    onChange={(e) => setInpaintBrushSize(Number(e.target.value))}
                    className="mt-1 w-full"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setInpaintMode("paint")}
                    className={[
                      "flex-1 rounded-lg border px-3 py-2 text-xs",
                      inpaintMode === "paint"
                        ? "border-zinc-500 bg-zinc-100 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950/40 dark:text-zinc-300"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    ].join(" ")}
                  >
                    Paint
                  </button>
                  <button
                    type="button"
                    onClick={() => setInpaintMode("erase")}
                    className={[
                      "flex-1 rounded-lg border px-3 py-2 text-xs",
                      inpaintMode === "erase"
                        ? "border-zinc-500 bg-zinc-100 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950/40 dark:text-zinc-300"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    ].join(" ")}
                  >
                    Erase
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setInpaintShowMask((v) => !v)}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  >
                    {inpaintShowMask ? "Hide mask" : "Show mask"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setInpaintInvertMask((v) => !v)}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  >
                    {inpaintInvertMask ? "Invert mask: On" : "Invert mask: Off"}
                  </button>
                  <button
                    type="button"
                    onClick={() => inpaintCanvasRef.current?.undo()}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    onClick={() => inpaintCanvasRef.current?.clearMask()}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  >
                    Clear
                  </button>
                </div>

                <div>
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Prompt</label>
                  <textarea
                    className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                    rows={4}
                    placeholder="Describe what to add or change"
                    value={inpaintPrompt}
                    onChange={(e) => setInpaintPrompt(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Seed (optional)</label>
                  <input
                    type="number"
                    min="0"
                    className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                    placeholder="Leave blank for random"
                    value={inpaintSeed}
                    onChange={(e) => setInpaintSeed(e.target.value)}
                  />
                </div>

                {inpaintError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                    {inpaintError}
                  </div>
                ) : null}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setInpaintModalOpen(false)}
                    className="flex-1 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        setInpaintError(null);
                        const result = await inpaintCanvasRef.current?.exportMaskedImage({ invert: inpaintInvertMask });
                        if (!result || !result.hasMask) {
                          setInpaintError("Add a mask before running inpaint.");
                          return;
                        }
                        const seedRaw = inpaintSeed.trim();
                        const seedValue = seedRaw.length > 0 ? Number(seedRaw) : undefined;
                        if (seedValue !== undefined && (!Number.isFinite(seedValue) || seedValue < 0)) {
                          setInpaintError("Seed must be a non-negative number.");
                          return;
                        }
                        const promptText = inpaintPrompt.trim() || generation.prompt;
                        if (!selectedAsset) {
                          setInpaintError("Select an asset to inpaint.");
                          return;
                        }
                        props.onInpaint?.({
                          generationId: generation.id,
                          assetType: selectedAsset.type as AssetTypeForInpaint,
                          itemIndex: selectedAsset.itemIndex ?? null,
                          imageDataUrl: result.dataUrl,
                          maskDataUrl: result.maskDataUrl,
                          prompt: promptText,
                          seed: seedValue
                        });
                        setInpaintModalOpen(false);
                      } catch (e) {
                        setInpaintError(extractError(e, "Inpaint failed"));
                      }
                    }}
                    disabled={props.loading}
                    className="flex-1 rounded-lg bg-zinc-600 px-4 py-2 text-sm text-white hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Run Inpaint
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Regen prompt modal */}
      {regenPromptOpen && regenPromptTarget ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setRegenPromptOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Add prompt for {regenPromptTarget.assetType} {regenPromptTarget.itemIndex !== null ? `#${displayItemIndex(regenPromptTarget.itemIndex)}` : ""}
              </h3>
              <button
                type="button"
                onClick={() => setRegenPromptOpen(false)}
                className="rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white"
                aria-label="Close prompt dialog"
              >
                <TbX className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">
              Optional: prepend a short directive to the regeneration prompt.
            </p>
            <textarea
              className="mt-3 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              rows={3}
              placeholder="e.g. add more sparkle, brighter lighting"
              value={regenPromptValue}
              onChange={(e) => setRegenPromptValue(e.target.value)}
              autoFocus
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setRegenPromptOpen(false)}
                className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const prefix = regenPromptValue.trim();
                  props.onRegenerateItem(
                    generation.id,
                    regenPromptTarget.itemIndex,
                    regenPromptTarget.assetType,
                    prefix.length > 0 ? prefix : undefined
                  );
                  setRegenPromptOpen(false);
                }}
                disabled={props.loading}
                className="flex-1 rounded-lg bg-zinc-600 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Regenerate
              </button>
            </div>
            <div className="mt-2 text-[11px] text-zinc-400">
              Leave blank to use the original prompt as-is.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

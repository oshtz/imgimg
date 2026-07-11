import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import { TbChevronDown, TbDownload, TbEye, TbEyeOff, TbFocus2, TbRefresh, TbZoomIn, TbZoomOut } from "react-icons/tb";
import type { WorkflowSummary, ApiBaseUrl } from "../../client";
import type { Asset, Generation } from "../../types";
import {
  type LayerUiState,
  type LayerViewState,
  type ResizeHandle,
  type ResizeState,
  type LayerExportFormat,
  type LayerImageInfo,
  fetchAssetImage,
  loadLayerImageInfo,
  readLayerStateFromStorage,
  layerStateStorageKey,
  exportComposition,
} from "./layerUtils";
import { statusPill, displayItemIndex } from "./generationUtils";
import { UserBadge } from "./UserBadge";
import { CopyableText } from "../CopyableText";

export function LayeredImageCard(props: {
  generation: Generation;
  workflow: WorkflowSummary | null;
  isSelected: boolean;
  apiBaseUrl: ApiBaseUrl;
  assetUrl: (apiBaseUrl: ApiBaseUrl, asset: Asset) => string;
  onOpenGeneration: (g: Generation) => void;
  onOpenAsset: (g: Generation, asset: Asset) => void;
  onDelete?: (generationId: string) => void;
  loading: boolean;
  showDelete?: boolean;
  userId?: string;
  userLabel?: string;
}) {
  const { generation: g, workflow, isSelected } = props;
  const label = workflow?.label ?? g.workflowUsed;
  const runningOrQueued = g.status === "running" || g.status === "queued";
  const showDelete = props.showDelete !== false && Boolean(props.onDelete);
  const zoomLimits = { min: 0.5, max: 2.5, step: 0.1 };
  const layerScaleLimits = { min: 0.4, max: 2.5, step: 0.05 };

  const layerAssets = useMemo(() => {
    return [...g.assets]
      .filter((a) => a.type !== "rembg" && a.type !== "preview" && a.type !== "placeholder" && a.type !== "video" && a.type !== "audio")
      .sort((a, b) => (a.itemIndex ?? 0) - (b.itemIndex ?? 0));
  }, [g.assets]);

  const [layerState, setLayerState] = useState<Record<string, LayerUiState>>({});
  const [dragState, setDragState] = useState<{
    layerId: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [viewState, setViewState] = useState<LayerViewState>({ x: 0, y: 0, scale: 1 });
  const [panState, setPanState] = useState<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const layerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const compositionRef = useRef<HTMLDivElement | null>(null);
  const [layerImages, setLayerImages] = useState<Record<string, LayerImageInfo>>({});
  const layerImagesRef = useRef<Record<string, LayerImageInfo>>({});
  const [compositionSize, setCompositionSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    layerImagesRef.current = layerImages;
  }, [layerImages]);

  useLayoutEffect(() => {
    const node = compositionRef.current;
    if (!node) return;
    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      setCompositionSize({ width: rect.width, height: rect.height });
    };
    updateSize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }
    const observer = new ResizeObserver(() => updateSize());
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const activeIds = new Set(layerAssets.map((layer) => layer.id));
    setLayerImages((prev) => {
      const next: Record<string, LayerImageInfo> = {};
      for (const layer of layerAssets) {
        const existing = prev[layer.id];
        if (existing) next[layer.id] = existing;
      }
      for (const [id, info] of Object.entries(prev)) {
        if (!activeIds.has(id) && info.objectUrl) {
          URL.revokeObjectURL(info.objectUrl);
        }
      }
      return next;
    });

    const missing = layerAssets.filter((layer) => !layerImagesRef.current[layer.id]);
    if (missing.length > 0) {
      (async () => {
        const updates: Record<string, LayerImageInfo> = {};
        for (const layer of missing) {
          try {
            const blobUrl = await fetchAssetImage(props.apiBaseUrl, layer, props.assetUrl);
            if (cancelled) { URL.revokeObjectURL(blobUrl); return; }
            const info = await loadLayerImageInfo(blobUrl, blobUrl);
            if (cancelled) {
              if (info.objectUrl) URL.revokeObjectURL(info.objectUrl);
              return;
            }
            updates[layer.id] = info;
          } catch (err) {
            console.error(err);
          }
        }
        if (!cancelled && Object.keys(updates).length > 0) {
          setLayerImages((prev) => ({ ...prev, ...updates }));
        } else if (cancelled) {
          for (const info of Object.values(updates)) {
            if (info.objectUrl) URL.revokeObjectURL(info.objectUrl);
          }
        }
      })();
    }

    return () => {
      cancelled = true;
    };
  }, [layerAssets, props.apiBaseUrl, props.assetUrl]);

  useEffect(() => {
    return () => {
      for (const info of Object.values(layerImagesRef.current)) {
        if (info.objectUrl) URL.revokeObjectURL(info.objectUrl);
      }
    };
  }, []);

  const baseDimensions = useMemo(() => {
    const widths = layerAssets
      .map((layer) => layerImages[layer.id]?.originalWidth)
      .filter((value): value is number => typeof value === "number");
    const heights = layerAssets
      .map((layer) => layerImages[layer.id]?.originalHeight)
      .filter((value): value is number => typeof value === "number");
    if (widths.length === 0 || heights.length === 0) return null;
    return { width: Math.max(...widths), height: Math.max(...heights) };
  }, [layerAssets, layerImages]);

  const baseScale = useMemo(() => {
    if (!compositionSize || !baseDimensions) return 1;
    const { width, height } = compositionSize;
    if (width <= 0 || height <= 0) return 1;
    const scale = Math.min(1, width / baseDimensions.width, height / baseDimensions.height);
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  }, [compositionSize, baseDimensions]);

  useEffect(() => {
    if (layerAssets.length === 0) return;
    const handle = window.setTimeout(() => {
      try {
        const payload: Record<string, LayerUiState> = {};
        for (const layer of layerAssets) {
          const state = layerState[layer.id] ?? { x: 0, y: 0, visible: true, scale: 1 };
          payload[layer.id] = state;
        }
        localStorage.setItem(layerStateStorageKey(g.id), JSON.stringify(payload));
      } catch (err) {
        console.error(err);
      }
    }, 150);

    return () => window.clearTimeout(handle);
  }, [layerAssets, layerState, g.id]);

  useEffect(() => {
    const saved = readLayerStateFromStorage(g.id);
    setLayerState((prev) => {
      const next: Record<string, LayerUiState> = {};
      for (const layer of layerAssets) {
        const existing = prev[layer.id] ?? saved[layer.id];
        next[layer.id] = existing ?? { x: 0, y: 0, visible: true, scale: 1 };
      }
      return next;
    });
    if (selectedLayerId && !layerAssets.some((layer) => layer.id === selectedLayerId)) {
      setSelectedLayerId(null);
    }
  }, [layerAssets, selectedLayerId, g.id]);

  useEffect(() => {
    if (!dragState) return;

    const handleMove = (event: PointerEvent) => {
      const scale = viewState.scale || 1;
      const dx = (event.clientX - dragState.startX) / scale;
      const dy = (event.clientY - dragState.startY) / scale;
      setLayerState((prev) => {
        const current = prev[dragState.layerId];
        if (!current) return prev;
        return {
          ...prev,
          [dragState.layerId]: {
            ...current,
            x: dragState.originX + dx,
            y: dragState.originY + dy
          }
        };
      });
    };

    const handleUp = () => {
      setDragState(null);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [dragState, viewState.scale]);

  useEffect(() => {
    if (!panState) return;

    const handleMove = (event: PointerEvent) => {
      const dx = event.clientX - panState.startX;
      const dy = event.clientY - panState.startY;
      setViewState((prev) => ({
        ...prev,
        x: panState.originX + dx,
        y: panState.originY + dy
      }));
    };

    const handleUp = () => {
      setPanState(null);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [panState]);

  useEffect(() => {
    if (!resizeState) return;

    const handleMove = (event: PointerEvent) => {
      const viewScale = viewState.scale || 1;
      const dx = (event.clientX - resizeState.startX) / viewScale;
      const dy = (event.clientY - resizeState.startY) / viewScale;
      const xDir = resizeState.handle.includes("e") ? 1 : -1;
      const yDir = resizeState.handle.includes("s") ? 1 : -1;
      const nextWidth = Math.max(24, resizeState.startWidth + dx * xDir);
      const nextHeight = Math.max(24, resizeState.startHeight + dy * yDir);
      const ratio = Math.min(nextWidth / resizeState.startWidth, nextHeight / resizeState.startHeight);
      const nextScale = Math.min(
        layerScaleLimits.max,
        Math.max(layerScaleLimits.min, Number((resizeState.startScale * ratio).toFixed(3)))
      );

      setLayerState((prev) => {
        const current = prev[resizeState.layerId] ?? { x: 0, y: 0, visible: true, scale: 1 };
        return {
          ...prev,
          [resizeState.layerId]: { ...current, scale: nextScale }
        };
      });
    };

    const handleUp = () => {
      setResizeState(null);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [resizeState, viewState.scale, layerScaleLimits.max, layerScaleLimits.min]);

  const resetLayers = () => {
    setLayerState((prev) => {
      const next: Record<string, LayerUiState> = {};
      for (const layer of layerAssets) {
        const existing = prev[layer.id] ?? { x: 0, y: 0, visible: true, scale: 1 };
        next[layer.id] = { ...existing, x: 0, y: 0, scale: 1 };
      }
      return next;
    });
  };

  const resetView = () => {
    setViewState({ x: 0, y: 0, scale: 1 });
  };

  const updateZoom = (delta: number) => {
    setViewState((prev) => {
      const nextScale = Math.min(zoomLimits.max, Math.max(zoomLimits.min, Number((prev.scale + delta).toFixed(2))));
      return { ...prev, scale: nextScale };
    });
  };

  const handleZoomWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (props.loading) return;
    event.preventDefault();
    const delta = event.deltaY < 0 ? zoomLimits.step : -zoomLimits.step;
    updateZoom(delta);
  };

  const toggleVisibility = (layerId: string) => {
    setLayerState((prev) => {
      const current = prev[layerId] ?? { x: 0, y: 0, visible: true, scale: 1 };
      return {
        ...prev,
        [layerId]: { ...current, visible: !current.visible }
      };
    });
  };

  const startResize = (layerId: string, handle: ResizeHandle, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (props.loading) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedLayerId(layerId);
    const node = layerRefs.current[layerId];
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const viewScale = viewState.scale || 1;
    const startScale = layerState[layerId]?.scale ?? 1;
    setResizeState({
      layerId,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      startScale,
      startWidth: rect.width / viewScale,
      startHeight: rect.height / viewScale
    });
  };

  const hiddenCount = layerAssets.filter((layer) => layerState[layer.id] && !layerState[layer.id].visible).length;
  const canExport = layerAssets.length > 0 && !props.loading && !exporting;

  const handleExport = async (format: LayerExportFormat) => {
    if (!canExport) return;
    setExporting(true);
    setExportMenuOpen(false);
    try {
      await exportComposition(
        format,
        layerAssets,
        layerState,
        props.assetUrl,
        props.apiBaseUrl,
        compositionRef.current?.getBoundingClientRect() ?? null,
        layerImages,
        g.id,
      );
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

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
            <span className="rounded bg-zinc-500/10 px-1.5 py-0.5 text-zinc-700 dark:text-zinc-400">Layered</span>
            <span>{label}</span>
            {props.userId ? <UserBadge userId={props.userId} label={props.userLabel} /> : null}
            <span className={["rounded-full px-2 py-0.5", statusPill(g.status)].join(" ")}>{g.status}</span>
            {g.queuePosition !== undefined && g.queuePosition !== null ? <span>#{g.queuePosition}</span> : null}
            <span>{new Date(g.createdAt).toLocaleString()}</span>
          </div>
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            onClick={() => props.onOpenGeneration(g)}
            disabled={props.loading}
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

      <div className="mt-3 grid items-stretch gap-3 sm:grid-cols-[1.2fr_0.8fr]">
        <div className="flex min-h-0 flex-col gap-2">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>Layer composition</span>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                <button
                  type="button"
                  className="rounded p-0.5 hover:text-zinc-900 disabled:opacity-50 dark:hover:text-zinc-200"
                  onClick={() => updateZoom(-zoomLimits.step)}
                  disabled={props.loading}
                  title="Zoom out"
                >
                  <TbZoomOut className="h-3 w-3" />
                </button>
                <span className="min-w-[36px] text-center">{Math.round(viewState.scale * 100)}%</span>
                <button
                  type="button"
                  className="rounded p-0.5 hover:text-zinc-900 disabled:opacity-50 dark:hover:text-zinc-200"
                  onClick={() => updateZoom(zoomLimits.step)}
                  disabled={props.loading}
                  title="Zoom in"
                >
                  <TbZoomIn className="h-3 w-3" />
                </button>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-200"
                onClick={resetView}
                disabled={props.loading}
                title="Reset zoom and pan"
              >
                <TbFocus2 className="h-3 w-3" />
                Reset view
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-200"
                onClick={resetLayers}
                disabled={props.loading || layerAssets.length === 0}
                title="Reset layer positions and scale"
              >
                <TbRefresh className="h-3 w-3" />
                Reset layers
              </button>
              <div className="relative">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-200"
                  onClick={() => setExportMenuOpen((prev) => !prev)}
                  disabled={!canExport}
                  title="Export layered composition"
                >
                  <TbDownload className="h-3 w-3" />
                  {exporting ? "Exporting\u2026" : "Export"}
                  <TbChevronDown className={`h-3 w-3 transition-transform ${exportMenuOpen ? "rotate-180" : ""}`} />
                </button>
                {exportMenuOpen ? (
                  <>
                    <button
                      type="button"
                      className="fixed inset-0 z-10"
                      onClick={() => setExportMenuOpen(false)}
                      aria-label="Close export menu"
                    />
                    <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-[11px] text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        onClick={() => void handleExport("png")}
                      >
                        Download PNG
                      </button>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-[11px] text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        onClick={() => void handleExport("psd")}
                      >
                        Download PSD
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
          <div
            className={[
              "relative aspect-square overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900",
              panState ? "cursor-grabbing" : "cursor-grab"
            ].join(" ")}
            style={{
              backgroundImage: "linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(0deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
              backgroundSize: "18px 18px",
              touchAction: "none"
            }}
            ref={compositionRef}
            onWheel={handleZoomWheel}
            onPointerDown={(event) => {
              if (props.loading) return;
              if (event.button !== 0) return;
              const target = event.target as HTMLElement;
              if (target.closest("[data-layer]")) return;
              event.preventDefault();
              setSelectedLayerId(null);
              setPanState({
                startX: event.clientX,
                startY: event.clientY,
                originX: viewState.x,
                originY: viewState.y
              });
            }}
          >
            <div className="absolute inset-0" style={{ transform: `translate(${viewState.x}px, ${viewState.y}px)` }}>
              <div
                className="absolute inset-0"
                style={{ transform: `scale(${viewState.scale})`, transformOrigin: "50% 50%" }}
              >
                {layerAssets.map((layer, idx) => {
                  const state = layerState[layer.id];
                  if (state && !state.visible) return null;
                  const isDragging = dragState?.layerId === layer.id;
                  const layerInfo = layerImages[layer.id];
                  const bounds = layerInfo?.bounds;
                  const baseOffsetX =
                    layerInfo && bounds
                      ? (bounds.left + bounds.width / 2 - layerInfo.originalWidth / 2) * baseScale
                      : 0;
                  const baseOffsetY =
                    layerInfo && bounds
                      ? (bounds.top + bounds.height / 2 - layerInfo.originalHeight / 2) * baseScale
                      : 0;
                  const offsetX = (state?.x ?? 0) + baseOffsetX;
                  const offsetY = (state?.y ?? 0) + baseOffsetY;
                  const scale = state?.scale ?? 1;
                  const isSelected = selectedLayerId === layer.id;
                  const sizeStyle =
                    layerInfo && bounds
                      ? {
                          width: Math.max(1, bounds.width * baseScale),
                          height: Math.max(1, bounds.height * baseScale)
                        }
                      : undefined;
                  const imageClassName = layerInfo
                    ? "h-full w-full select-none object-contain"
                    : "max-h-full max-w-full select-none object-contain";
                  const imageSrc = layerInfo ? layerInfo.src : props.assetUrl(props.apiBaseUrl, layer);
                  return (
                    <div
                      key={layer.id}
                      data-layer="true"
                      className={[
                        "absolute left-1/2 top-1/2 max-h-full max-w-full",
                        isDragging ? "cursor-grabbing" : "cursor-grab"
                      ].join(" ")}
                      style={{
                        transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`,
                        zIndex: idx + 1
                      }}
                      onPointerDown={(event) => {
                        if (props.loading) return;
                        event.preventDefault();
                        event.stopPropagation();
                        setSelectedLayerId(layer.id);
                        const current = layerState[layer.id] ?? { x: 0, y: 0, visible: true, scale: 1 };
                        setDragState({
                          layerId: layer.id,
                          startX: event.clientX,
                          startY: event.clientY,
                          originX: current.x,
                          originY: current.y
                        });
                      }}
                    >
                      <div
                        ref={(node) => {
                          layerRefs.current[layer.id] = node;
                        }}
                        className="relative"
                        style={{
                          transform: `scale(${scale})`,
                          transformOrigin: "50% 50%",
                          ...sizeStyle
                        }}
                      >
                        <img
                          className={imageClassName}
                          src={imageSrc}
                          alt={`Layer ${displayItemIndex(layer.itemIndex ?? idx)}`}
                          draggable={false}
                        />
                        {isSelected ? (
                          <>
                            <div className="pointer-events-none absolute inset-0 rounded-lg border border-zinc-400/80 shadow-[0_0_0_1px_rgba(14,116,144,0.25)]" />
                            {(["nw", "ne", "sw", "se"] as ResizeHandle[]).map((handle) => (
                              <button
                                key={handle}
                                type="button"
                                onPointerDown={(event) => startResize(layer.id, handle, event)}
                                className={[
                                  "absolute h-2.5 w-2.5 rounded border border-zinc-400 bg-white shadow",
                                  "dark:border-zinc-400 dark:bg-zinc-900"
                                ].join(" ")}
                                style={{
                                  left: handle.includes("w") ? -5 : undefined,
                                  right: handle.includes("e") ? -5 : undefined,
                                  top: handle.includes("n") ? -5 : undefined,
                                  bottom: handle.includes("s") ? -5 : undefined,
                                  cursor: handle === "nw" || handle === "se" ? "nwse-resize" : "nesw-resize"
                                }}
                                aria-label={`Resize ${handle}`}
                              />
                            ))}
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {!layerAssets.length ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                {runningOrQueued ? (
                  <>
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300/60 border-t-zinc-500 dark:border-zinc-600/60 dark:border-t-zinc-300" />
                    <div>Separating layers...</div>
                  </>
                ) : (
                  <div>No layers yet</div>
                )}
              </div>
            ) : null}
          </div>
          <div className="text-[11px] text-zinc-500">
            Drag layers to reposition. Click a layer to select, then drag a corner to resize. Drag the canvas to pan, scroll to zoom.
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>Layers ({layerAssets.length})</span>
            {hiddenCount > 0 ? (
              <button
                type="button"
                className="text-[11px] text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                onClick={() => {
                  setLayerState((prev) => {
                    const next: Record<string, LayerUiState> = {};
                    for (const layer of layerAssets) {
                      const existing = prev[layer.id] ?? { x: 0, y: 0, visible: true, scale: 1 };
                      next[layer.id] = { ...existing, visible: true };
                    }
                    return next;
                  });
                }}
                disabled={props.loading}
              >
                Show all
              </button>
            ) : null}
          </div>

          <div className="flex-1 min-h-0 space-y-1 overflow-y-auto pr-1">
            {layerAssets.length === 0 ? (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-black dark:text-zinc-400">
                Layers will appear here once separation finishes.
              </div>
            ) : (
              layerAssets.map((layer, idx) => {
                    const state = layerState[layer.id];
                    const isVisible = state ? state.visible : true;
                    const labelText = `Layer ${layer.itemIndex !== null && layer.itemIndex !== undefined ? layer.itemIndex + 1 : idx + 1}`;
                    const isSelected = selectedLayerId === layer.id;
                    return (
                      <div
                        key={layer.id}
                        className={[
                          "flex flex-col gap-2 rounded-lg px-2 py-2 text-xs",
                          isSelected
                            ? "bg-zinc-100/60 dark:bg-zinc-800/40"
                            : ""
                        ].join(" ")}
                        onClick={() => setSelectedLayerId(layer.id)}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="rounded-lg p-1 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                            onClick={() => toggleVisibility(layer.id)}
                            aria-label={isVisible ? `Hide ${labelText}` : `Show ${labelText}`}
                            disabled={props.loading}
                          >
                            {isVisible ? <TbEye className="h-4 w-4" /> : <TbEyeOff className="h-4 w-4" />}
                          </button>
                          <button
                            type="button"
                            className="h-10 w-10 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900"
                            onClick={() => props.onOpenAsset(g, layer)}
                            disabled={props.loading}
                            aria-label={`Open ${labelText}`}
                          >
                            <img
                              className="h-full w-full object-cover"
                              src={props.assetUrl(props.apiBaseUrl, layer)}
                              alt={labelText}
                            />
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs text-zinc-700 dark:text-zinc-300">{labelText}</div>
                            <div className="text-[11px] text-zinc-500">{isVisible ? "Visible" : "Hidden"}</div>
                          </div>
                        </div>
                        <div className="pl-8 text-[11px] text-zinc-500">
                          {isSelected ? "Drag a corner in the canvas to resize." : "Click to select this layer."}
                        </div>
                      </div>
                    );
                  })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

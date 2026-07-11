import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TbCloudOff, TbFolder, TbLayoutBoard, TbMusic, TbPlus } from "react-icons/tb";
import type { WorkflowSummary, WorkflowOrganization } from "../api";
import type { CanvasMeta } from "../canvas/canvasStorage";
import type { CardSize, CardThumbnailMode } from "./preferences";

/** Grid column classes per card size */
const GRID_CLASSES: Record<CardSize, string> = {
  small: "grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-7",
  medium: "grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5",
  large: "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4",
};

export function isWorkflowVisibleInGrid(
  workflow: WorkflowSummary,
  enabledProviders?: Record<string, boolean>,
): boolean {
  return !(
    workflow.providerAvailable === false ||
    (enabledProviders != null && workflow.engine != null && enabledProviders[workflow.engine] === false)
  );
}

/**
 * App accent palette — used for card gradients, badges, and tag indicators.
 * Each color pair is [from, to] for a gradient.
 */
const PALETTE = [
  "#dee3e2",
  "#fccbcb",
  "#78b3d6",
  "#d86969",
  "#4f7969",
] as const;

/** Pick a deterministic palette color from a string hash */
function paletteIndex(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % PALETTE.length;
}

/** Simple seeded PRNG so the pattern is stable per-card */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Parse a hex color to [r, g, b] */
function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/** Lerp between two RGB colors */
function lerpColor(a: [number, number, number], b: [number, number, number], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

const CANVAS_SIZE = 16;
const MIN_CELL = 1;
const MAX_CELL = 8;

/** Recursively subdivide a rect into varied-size cells (BSP / mondrian) */
function subdivide(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  rgbA: [number, number, number], rgbB: [number, number, number],
  rand: () => number,
) {
  // If small enough, fill it
  if (w <= MAX_CELL && h <= MAX_CELL) {
    const t = ((x + w / 2) + (y + h / 2)) / (CANVAS_SIZE * 2);
    ctx.fillStyle = lerpColor(rgbA, rgbB, t);
    ctx.fillRect(x, y, w, h);
    return;
  }

  // Decide split direction: prefer splitting the longer axis
  const splitH = w > h ? false : h > w ? true : rand() > 0.5;

  if (splitH && h > MIN_CELL * 2) {
    const split = MIN_CELL + Math.floor(rand() * (h - MIN_CELL * 2));
    subdivide(ctx, x, y, w, split, rgbA, rgbB, rand);
    subdivide(ctx, x, y + split, w, h - split, rgbA, rgbB, rand);
  } else if (!splitH && w > MIN_CELL * 2) {
    const split = MIN_CELL + Math.floor(rand() * (w - MIN_CELL * 2));
    subdivide(ctx, x, y, split, h, rgbA, rgbB, rand);
    subdivide(ctx, x + split, y, w - split, h, rgbA, rgbB, rand);
  } else {
    // Can't split further
    const t = ((x + w / 2) + (y + h / 2)) / (CANVAS_SIZE * 2);
    ctx.fillStyle = lerpColor(rgbA, rgbB, t);
    ctx.fillRect(x, y, w, h);
  }
}

/** Renders a masonry-style pixelated gradient using recursive subdivision */
function PixelatedGradient(props: { colorA: string; colorB: string; seed: number; className?: string; children?: React.ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const rgbA = hexToRgb(props.colorA);
    const rgbB = hexToRgb(props.colorB);
    const rand = mulberry32(props.seed);
    subdivide(ctx, 0, 0, CANVAS_SIZE, CANVAS_SIZE, rgbA, rgbB, rand);
  }, [props.colorA, props.colorB, props.seed]);

  useEffect(() => { draw(); }, [draw]);

  return (
    <div className={props.className} style={{ position: "relative" }}>
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          imageRendering: "pixelated",
        }}
      />
      {props.children}
    </div>
  );
}

function isVideoUrl(url: string): boolean {
  const videoExtensions = [".mp4", ".webm", ".mov", ".m4v"];
  return videoExtensions.some(ext => url.toLowerCase().includes(ext));
}

function WorkflowCard(props: {
  workflow: WorkflowSummary;
  previewUrl?: string | null;
  cardThumbnailMode?: CardThumbnailMode;
  onClick: () => void;
  disabled?: boolean;
}) {
  const { workflow, previewUrl, cardThumbnailMode = "latest", onClick, disabled = false } = props;
  const isAudioWorkflow = workflow.outputMode === "single_audio";
  // Audio workflows can't render image previews — always use gradient fallback
  const effectivePreviewUrl = isAudioWorkflow ? undefined : previewUrl;
  const [loaded, setLoaded] = useState(!effectivePreviewUrl);

  // For "random-gradient" mode, generate a random seed once on mount
  const randomSeed = useMemo(
    () => cardThumbnailMode === "random-gradient" ? Math.floor(Math.random() * 100000) : 0,
    [cardThumbnailMode],
  );

  useEffect(() => {
    if (effectivePreviewUrl) setLoaded(false);
  }, [effectivePreviewUrl]);

  const isVideoPreview = effectivePreviewUrl && isVideoUrl(effectivePreviewUrl);

  const engineLabel = workflow.engine === "replicate"
    ? "Replicate"
    : workflow.engine === "openrouter"
      ? "OpenRouter"
      : workflow.engine === "fal"
        ? "fal.ai"
        : workflow.engine === "kie"
          ? "kie.ai"
          : "ComfyUI";

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`group relative flex flex-col overflow-hidden rounded-lg border transition-all ${
        disabled
          ? "cursor-not-allowed border-zinc-300 bg-zinc-100 opacity-60 dark:border-zinc-700 dark:bg-zinc-800/50"
          : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
      }`}
      title={disabled ? `${engineLabel} is currently unavailable` : workflow.label}
    >
      {/* Preview area */}
      <div className="relative aspect-[3/2] w-full overflow-hidden">
        {effectivePreviewUrl && isVideoPreview ? (
          <video
            src={effectivePreviewUrl}
            className={`h-full w-full object-cover transition-transform ${disabled ? "grayscale" : "group-hover:scale-105"}`}
            autoPlay
            loop
            muted
            playsInline
            onLoadedData={() => setLoaded(true)}
            onError={() => setLoaded(true)}
            onClick={(e) => e.preventDefault()}
          />
        ) : effectivePreviewUrl ? (
          <img
            src={effectivePreviewUrl}
            alt=""
            className={`h-full w-full object-cover transition-transform ${disabled ? "grayscale" : "group-hover:scale-105"}`}
            onLoad={() => setLoaded(true)}
            onError={() => setLoaded(true)}
          />
        ) : (
          <PixelatedGradient
            colorA={disabled ? "#71717a" : PALETTE[cardThumbnailMode === "random-gradient" ? randomSeed % PALETTE.length : paletteIndex(workflow.id)]}
            colorB={disabled ? "#a1a1aa" : PALETTE[cardThumbnailMode === "random-gradient" ? (randomSeed + 1 + (randomSeed >> 2)) % PALETTE.length : (paletteIndex(workflow.id) + 1 + paletteIndex(workflow.id + "_salt")) % PALETTE.length]}
            seed={cardThumbnailMode === "random-gradient" ? randomSeed : paletteIndex(workflow.id + "_seed")}
            className={`h-full w-full transition-transform ${disabled ? "" : "group-hover:scale-105"}`}
          />
        )}

        {!loaded && effectivePreviewUrl && (
          <div className="pointer-events-none absolute inset-0 bg-zinc-200 dark:bg-zinc-800" />
        )}

        {isAudioWorkflow && !disabled && (
          <div className="absolute inset-0 flex items-center justify-center">
            <TbMusic className="h-6 w-6 text-white/70" />
          </div>
        )}

        {disabled && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
            <TbCloudOff className="h-5 w-5 text-white/80" />
          </div>
        )}

      </div>

      {/* Info area */}
      <div className="px-2 py-1.5">
        <h3 className={`truncate text-center text-xs font-medium ${disabled ? "text-zinc-500 dark:text-zinc-500" : "text-zinc-900 dark:text-zinc-100"}`}>
          {workflow.label}
        </h3>
      </div>
    </button>
  );
}

function CanvasCard(props: {
  canvas: CanvasMeta;
  previewUrl?: string | null;
  onClick: () => void;
}) {
  const { canvas, previewUrl, onClick } = props;
  const [loaded, setLoaded] = useState(!previewUrl);

  useEffect(() => {
    if (previewUrl) setLoaded(false);
  }, [previewUrl]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white transition-all hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
      title={canvas.name}
    >
      {/* Preview area */}
      <div className="relative aspect-[3/2] w-full overflow-hidden">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt=""
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            onLoad={() => setLoaded(true)}
            onError={() => setLoaded(true)}
          />
        ) : (
          <PixelatedGradient
            colorA={PALETTE[paletteIndex(canvas.id)]}
            colorB={PALETTE[(paletteIndex(canvas.id) + 1 + paletteIndex(canvas.id + "_salt")) % PALETTE.length]}
            seed={paletteIndex(canvas.id + "_seed")}
            className="h-full w-full transition-transform group-hover:scale-105"
          />
        )}

        {!loaded && previewUrl && (
          <div className="pointer-events-none absolute inset-0 bg-zinc-200 dark:bg-zinc-800" />
        )}
      </div>

      {/* Info area */}
      <div className="px-2 py-1.5">
        <h3 className="truncate text-center text-xs font-medium text-zinc-900 dark:text-zinc-100">
          {canvas.name}
        </h3>
      </div>
    </button>
  );
}

function WorkflowCardSection(props: {
  workflows: WorkflowSummary[];
  workflowPreviews: Record<string, string>;
  onSelectWorkflow: (workflowId: string) => void;
  respectProviderAvailability: boolean;
  enabledProviders?: Record<string, boolean>;
  cardSize: CardSize;
  cardThumbnailMode: CardThumbnailMode;
}) {
  const { workflows, workflowPreviews, onSelectWorkflow, respectProviderAvailability, enabledProviders, cardSize, cardThumbnailMode } = props;
  return (
    <div className={GRID_CLASSES[cardSize]}>
      {workflows.map((workflow) => (
        <WorkflowCard
          key={workflow.id}
          workflow={workflow}
          previewUrl={cardThumbnailMode === "latest" ? workflowPreviews[workflow.id] : undefined}
          cardThumbnailMode={cardThumbnailMode}
          onClick={() => onSelectWorkflow(workflow.id)}
          disabled={respectProviderAvailability && (
            workflow.providerAvailable === false ||
            (enabledProviders != null && workflow.engine != null && enabledProviders[workflow.engine] === false)
          )}
        />
      ))}
    </div>
  );
}

export function WorkflowCardGrid(props: {
  workflows: WorkflowSummary[];
  workflowPreviews?: Record<string, string>;
  onSelectWorkflow: (workflowId: string) => void;
  respectProviderAvailability?: boolean;
  organization?: WorkflowOrganization | null;
  canvases?: CanvasMeta[];
  canvasPreviews?: Record<string, string>;
  onCanvasSelect?: (canvasId: string) => void;
  onCanvasCreate?: () => void;
  enabledProviders?: Record<string, boolean>;
  cardSize?: CardSize;
  cardThumbnailMode?: CardThumbnailMode;
}) {
  const { workflows, workflowPreviews = {}, onSelectWorkflow, respectProviderAvailability = true, organization, enabledProviders } = props;
  const cardSize = props.cardSize ?? "medium";
  const cardThumbnailMode = props.cardThumbnailMode ?? "latest";
  const { canvases = [], canvasPreviews = {}, onCanvasSelect, onCanvasCreate } = props;

  const visibleWorkflows = respectProviderAvailability
    ? workflows.filter((workflow) => isWorkflowVisibleInGrid(workflow, enabledProviders))
    : workflows;

  if (visibleWorkflows.length === 0 && canvases.length === 0) {
    return null;
  }

  const workflowMap = new Map(visibleWorkflows.map(w => [w.id, w]));

  // Build grouped structure from organization
  const hasOrg = organization && (organization.folders.length > 0 || organization.items.length > 0);

  let groups: { folderId: string | null; folderName: string | null; workflows: WorkflowSummary[] }[] = [];

  if (hasOrg) {
    const folders = [...organization.folders].sort((a, b) => a.sortOrder - b.sortOrder);
    const assignedIds = new Set(organization.items.map(i => i.workflowId));

    // Root-level workflows (items with folderId === null, sorted)
    const rootItems = organization.items
      .filter(i => i.folderId === null && workflowMap.has(i.workflowId))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(i => workflowMap.get(i.workflowId)!);

    // Unassigned workflows (not in any organization item)
    const unassigned = visibleWorkflows.filter(w => !assignedIds.has(w.id));
    const rootWorkflows = [...rootItems, ...unassigned];

    if (rootWorkflows.length > 0) {
      groups.push({ folderId: null, folderName: null, workflows: rootWorkflows });
    }

    // Each folder
    for (const folder of folders) {
      const folderWorkflows = organization.items
        .filter(i => i.folderId === folder.id && workflowMap.has(i.workflowId))
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(i => workflowMap.get(i.workflowId)!);

      if (folderWorkflows.length > 0) {
        groups.push({ folderId: folder.id, folderName: folder.name, workflows: folderWorkflows });
      }
    }
  } else {
    groups = [{ folderId: null, folderName: null, workflows: visibleWorkflows }];
  }

  return (
    <div className="flex flex-col gap-8">
      {/* ── Canvases section ── */}
      {canvases.length > 0 && onCanvasSelect && (
        <div>
          <div className="mb-4 flex items-center gap-3">
            <TbLayoutBoard className="h-5 w-5 text-zinc-400 dark:text-zinc-500" />
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Canvases
            </h2>
            {onCanvasCreate && (
              <button
                type="button"
                onClick={onCanvasCreate}
                className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                title="New canvas"
                aria-label="New canvas"
              >
                <TbPlus className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className={GRID_CLASSES[cardSize]}>
            {canvases.map((canvas) => (
              <CanvasCard
                key={canvas.id}
                canvas={canvas}
                previewUrl={canvasPreviews[canvas.id]}
                onClick={() => onCanvasSelect(canvas.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Workflows section ── */}
      {visibleWorkflows.length > 0 && (
        <div>
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Select a Workflow
            </h2>
          </div>
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <div key={group.folderId ?? "__root"}>
                {group.folderName && (
                  <div className="mb-3 flex items-center gap-2">
                    <TbFolder className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
                    <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                      {group.folderName}
                    </h3>
                  </div>
                )}
                <WorkflowCardSection
                  workflows={group.workflows}
                  workflowPreviews={workflowPreviews}
                  onSelectWorkflow={onSelectWorkflow}
                  respectProviderAvailability={respectProviderAvailability}
                  enabledProviders={enabledProviders}
                  cardSize={cardSize}
                  cardThumbnailMode={cardThumbnailMode}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useRef, useEffect } from "react";
import { TbPointer, TbTrash, TbArrowBackUp, TbArrowForwardUp, TbNote, TbFrame, TbGitBranch, TbArrowNarrowRight, TbDownload, TbSquare, TbCircle, TbDiamond, TbTriangle, TbShape, TbStack2, TbPencil, TbGrid4X4, TbPresentation, TbTemplate, TbChevronDown } from "react-icons/tb";
import type Konva from "konva";
import { exportCanvasAsImage } from "./exportCanvas";
import { useCanvas } from "./CanvasProvider";
import { ZoomControls } from "./ZoomControls";
import { AssetImporter } from "./AssetImporter";
import type { Generation, Asset } from "../types";
import type { ApiBaseUrl } from "../api";

type Props = {
  history: Generation[];
  assetUrl: (asset: Asset) => string;
  apiBaseUrl: ApiBaseUrl;
  containerWidth?: number;
  containerHeight?: number;
  stageRef?: Konva.Stage | null;
  layersOpen?: boolean;
  onToggleLayers?: () => void;
  onPresent?: () => void;
  onTemplate?: () => void;
  drawColor?: string;
  drawWidth?: number;
  onDrawColorChange?: (color: string) => void;
  onDrawWidthChange?: (width: number) => void;
  /** Deduplicated list of available engine types */
  engines?: string[];
  activeEngine?: string;
  onEngineChange?: (engine: string) => void;
};

const SHAPE_OPTIONS = [
  { kind: "rect" as const, icon: TbSquare, label: "Rectangle" },
  { kind: "circle" as const, icon: TbCircle, label: "Circle" },
  { kind: "diamond" as const, icon: TbDiamond, label: "Diamond" },
  { kind: "triangle" as const, icon: TbTriangle, label: "Triangle" },
];

const DRAW_COLORS = [
  { color: "#1e293b", label: "Slate" },
  { color: "#dc2626", label: "Red" },
  { color: "#2563eb", label: "Blue" },
  { color: "#16a34a", label: "Green" },
  { color: "#9333ea", label: "Purple" },
  { color: "#ea580c", label: "Orange" },
];
const DRAW_WIDTHS = [
  { width: 2, label: "Thin" },
  { width: 4, label: "Medium" },
  { width: 8, label: "Thick" },
];

const ENGINE_LABELS: Record<string, string> = {
  comfyui: "ComfyUI",
  replicate: "Replicate",
  fal: "Fal",
  openrouter: "OpenRouter",
  kie: "Kie",
};

const ICON = 16;

const active = "bg-zinc-200 text-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400";
const idle = "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700";
const btn = "rounded p-1 transition-colors";
const sep = "h-4 w-px shrink-0 bg-zinc-200 dark:bg-zinc-700";

export function CanvasToolbar({ history, assetUrl, apiBaseUrl, containerWidth, containerHeight, stageRef, layersOpen, onToggleLayers, onPresent, onTemplate, drawColor = "#1e293b", drawWidth = 3, onDrawColorChange, onDrawWidthChange, engines, activeEngine = "comfyui", onEngineChange }: Props) {
  const { state, dispatch, canUndo, canRedo } = useCanvas();
  const [shapePickerOpen, setShapePickerOpen] = useState(false);
  const shapePickerRef = useRef<HTMLDivElement>(null);
  const [drawPickerOpen, setDrawPickerOpen] = useState(false);
  const drawPickerRef = useRef<HTMLDivElement>(null);
  const [enginePickerOpen, setEnginePickerOpen] = useState(false);
  const enginePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!shapePickerOpen && !drawPickerOpen && !enginePickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (shapePickerOpen && shapePickerRef.current && !shapePickerRef.current.contains(e.target as Node)) {
        setShapePickerOpen(false);
      }
      if (drawPickerOpen && drawPickerRef.current && !drawPickerRef.current.contains(e.target as Node)) {
        setDrawPickerOpen(false);
      }
      if (enginePickerOpen && enginePickerRef.current && !enginePickerRef.current.contains(e.target as Node)) {
        setEnginePickerOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [shapePickerOpen, drawPickerOpen, enginePickerOpen]);

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-white/80 px-1 py-0.5 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-800/80">
      {/* Engine selector */}
      {engines && engines.length > 1 && onEngineChange && (
        <>
          <div ref={enginePickerRef} className="relative">
            <button
              onClick={() => setEnginePickerOpen((p) => !p)}
              className={`${btn} flex items-center gap-1 px-1.5 ${idle}`}
              title="Switch engine"
            >
              <span className="inline-block rounded bg-accent-sky/15 px-1 py-px text-[10px] font-semibold leading-tight text-accent-sky">
                {ENGINE_LABELS[activeEngine] ?? activeEngine}
              </span>
              <TbChevronDown size={12} />
            </button>
            {enginePickerOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 min-w-[140px] rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                {engines.map((engine) => {
                  const isActive = engine === activeEngine;
                  return (
                    <button
                      key={engine}
                      onClick={() => {
                        onEngineChange(engine);
                        setEnginePickerOpen(false);
                      }}
                      className={`flex w-full items-center rounded px-2 py-1.5 text-left text-xs transition-colors ${
                        isActive
                          ? "bg-accent-sky/10 font-medium text-accent-sky"
                          : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-700/50"
                      }`}
                    >
                      {ENGINE_LABELS[engine] ?? engine}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className={sep} />
        </>
      )}

      {/* Select tool */}
      <button
        onClick={() => dispatch({ type: "SET_EDIT_MODE", mode: "select" })}
        className={`${btn} ${state.editMode === "select" ? active : idle}`}
        title="Select tool (V)"
      >
        <TbPointer size={ICON} />
      </button>

      <div className={sep} />

      {/* Asset importer */}
      <AssetImporter assetUrl={assetUrl} apiBaseUrl={apiBaseUrl} containerWidth={containerWidth} containerHeight={containerHeight} />

      <div className={sep} />

      {/* Add Sticky Note */}
      <button
        onClick={() => {
          const vp = state.viewport;
          const cx = (-vp.x + (containerWidth ?? 800) / 2) / vp.scale - 100;
          const cy = (-vp.y + (containerHeight ?? 600) / 2) / vp.scale - 100;
          dispatch({
            type: "ADD_NODE",
            node: {
              id: crypto.randomUUID(),
              type: "text",
              src: "",
              x: cx,
              y: cy,
              width: 200,
              height: 200,
              naturalWidth: 200,
              naturalHeight: 200,
              zIndex: 0,
              text: "",
              stickyColor: "yellow",
            },
          });
        }}
        className={`${btn} ${idle}`}
        title="Add Sticky Note"
      >
        <TbNote size={ICON} />
      </button>

      {/* Add Frame */}
      <button
        onClick={() => {
          const vp = state.viewport;
          const cx = (-vp.x + (containerWidth ?? 800) / 2) / vp.scale - 300;
          const cy = (-vp.y + (containerHeight ?? 600) / 2) / vp.scale - 200;
          dispatch({
            type: "ADD_NODE",
            node: {
              id: crypto.randomUUID(),
              type: "frame",
              src: "",
              x: cx,
              y: cy,
              width: 600,
              height: 400,
              naturalWidth: 600,
              naturalHeight: 400,
              zIndex: 0,
              title: "Frame",
            },
          });
        }}
        className={`${btn} ${idle}`}
        title="Add Frame"
      >
        <TbFrame size={ICON} />
      </button>

      {/* Templates */}
      {onTemplate && (
        <button
          onClick={onTemplate}
          className={`${btn} ${idle}`}
          title="Insert template"
        >
          <TbTemplate size={ICON} />
        </button>
      )}

      {/* Add Shape */}
      <div ref={shapePickerRef} className="relative">
        <button
          onClick={() => setShapePickerOpen((p) => !p)}
          className={`${btn} ${idle}`}
          title="Add Shape"
        >
          <TbShape size={ICON} />
        </button>
        {shapePickerOpen && (
          <div className="absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white p-1.5 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
            <div className="flex gap-1">
              {SHAPE_OPTIONS.map((opt) => (
                <button
                  key={opt.kind}
                  onClick={() => {
                    const vp = state.viewport;
                    const cx = (-vp.x + (containerWidth ?? 800) / 2) / vp.scale - 60;
                    const cy = (-vp.y + (containerHeight ?? 600) / 2) / vp.scale - 60;
                    dispatch({
                      type: "ADD_NODE",
                      node: {
                        id: crypto.randomUUID(),
                        type: "shape",
                        src: "",
                        x: cx,
                        y: cy,
                        width: 120,
                        height: 120,
                        naturalWidth: 120,
                        naturalHeight: 120,
                        zIndex: 0,
                        shapeKind: opt.kind,
                      },
                    });
                    setShapePickerOpen(false);
                  }}
                  className="rounded p-1.5 text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  title={opt.label}
                >
                  <opt.icon size={ICON} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Connector tool */}
      <button
        onClick={() => dispatch({ type: "SET_EDIT_MODE", mode: state.editMode === "connect" ? "select" : "connect" })}
        className={`${btn} ${state.editMode === "connect" ? active : idle}`}
        title="Connector tool"
      >
        <TbArrowNarrowRight size={ICON} />
      </button>

      {/* Draw tool + brush settings popover */}
      <div ref={drawPickerRef} className="relative">
        <button
          onClick={() => {
            if (state.editMode !== "draw") {
              dispatch({ type: "SET_EDIT_MODE", mode: "draw" });
            } else {
              setDrawPickerOpen((p) => !p);
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setDrawPickerOpen((p) => !p);
          }}
          className={`${btn} ${state.editMode === "draw" ? active : idle}`}
          title="Draw tool (click again for brush settings)"
        >
          <TbPencil size={ICON} />
        </button>
        {drawPickerOpen && (
          <div className="absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
            <div className="flex gap-1">
              {DRAW_COLORS.map((c) => (
                <button
                  key={c.color}
                  onClick={() => onDrawColorChange?.(c.color)}
                  className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c.color,
                    borderColor: drawColor === c.color ? "#fff" : "transparent",
                    boxShadow: drawColor === c.color ? `0 0 0 2px ${c.color}` : undefined,
                  }}
                  title={c.label}
                />
              ))}
            </div>
            <div className="mt-1.5 flex gap-1">
              {DRAW_WIDTHS.map((w) => (
                <button
                  key={w.width}
                  onClick={() => onDrawWidthChange?.(w.width)}
                  className={[
                    "flex-1 rounded px-1.5 py-0.5 text-xs font-medium transition-colors",
                    drawWidth === w.width
                      ? "bg-zinc-200 text-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-600",
                  ].join(" ")}
                  title={w.label}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className={sep} />

      {/* Toggle Lineage */}
      <button
        onClick={() => dispatch({ type: "TOGGLE_LINEAGE" })}
        className={`${btn} ${state.showLineage ? active : idle}`}
        title="Toggle lineage connectors"
      >
        <TbGitBranch size={ICON} />
      </button>

      {/* Layers panel toggle */}
      {onToggleLayers && (
        <button
          onClick={onToggleLayers}
          className={`${btn} ${layersOpen ? active : idle}`}
          title="Layers panel"
        >
          <TbStack2 size={ICON} />
        </button>
      )}

      {/* Snap to grid toggle */}
      <button
        onClick={() => dispatch({ type: "TOGGLE_SNAP_TO_GRID" })}
        className={`${btn} ${state.snapToGrid ? active : idle}`}
        title={state.snapToGrid ? "Snap to grid: ON" : "Snap to grid: OFF"}
      >
        <TbGrid4X4 size={ICON} />
      </button>

      <div className={sep} />

      {/* Undo / Redo */}
      <button
        onClick={() => dispatch({ type: "UNDO" })}
        disabled={!canUndo}
        className={`${btn} ${idle} disabled:opacity-30 disabled:cursor-not-allowed`}
        title="Undo (Ctrl+Z)"
      >
        <TbArrowBackUp size={ICON} />
      </button>
      <button
        onClick={() => dispatch({ type: "REDO" })}
        disabled={!canRedo}
        className={`${btn} ${idle} disabled:opacity-30 disabled:cursor-not-allowed`}
        title="Redo (Ctrl+Shift+Z)"
      >
        <TbArrowForwardUp size={ICON} />
      </button>

      <div className={sep} />

      {/* Zoom controls */}
      <ZoomControls containerWidth={containerWidth} containerHeight={containerHeight} />

      <div className="flex-1" />

      {/* Presentation mode */}
      {onPresent && (
        <button
          onClick={onPresent}
          className={`${btn} ${idle}`}
          title="Presentation mode"
        >
          <TbPresentation size={ICON} />
        </button>
      )}

      {/* Export canvas as PNG */}
      <button
        onClick={() => {
          if (stageRef && state.nodes.length > 0) {
            exportCanvasAsImage(stageRef, state.nodes);
          }
        }}
        disabled={state.nodes.length === 0}
        className={`${btn} ${idle} disabled:opacity-30 disabled:cursor-not-allowed`}
        title="Export canvas as PNG"
      >
        <TbDownload size={ICON} />
      </button>

      {/* Clear canvas */}
      <button
        onClick={() => {
          if (state.nodes.length === 0 || confirm("Clear all items from canvas?")) {
            dispatch({ type: "CLEAR_CANVAS" });
          }
        }}
        className={`${btn} text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-900/20 dark:hover:text-red-400`}
        title="Clear canvas"
      >
        <TbTrash size={ICON} />
      </button>
    </div>
  );
}

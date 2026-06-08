import type { Asset, Generation } from "../types";

export type StickyColor = "yellow" | "green" | "blue" | "pink" | "orange" | "purple";

export type CanvasNodeType = "image" | "text" | "frame" | "shape" | "drawing";

export type CanvasNode = {
  id: string;
  /** Node type — defaults to "image" when undefined (backward compat) */
  type?: CanvasNodeType;
  /** URL of the image (resolved via assetUrl or object URL). Undefined while the node is a loading skeleton. */
  src?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Original natural width of the image */
  naturalWidth: number;
  /** Original natural height of the image */
  naturalHeight: number;
  /** z-order index (higher = on top) */
  zIndex: number;
  /** Source generation ID (for linking back) */
  generationId?: string;
  /** Source asset info */
  asset?: Asset;
  /** Who placed this node on the canvas */
  placedBy?: { userId: string; email: string };
  /** The prompt used to generate this image */
  prompt?: string;
  /**
   * Non-destructive crop region in source image pixel space.
   * When set, only this sub-rectangle of the original image is rendered.
   * Coordinates are relative to naturalWidth × naturalHeight.
   */
  crop?: { x: number; y: number; width: number; height: number };

  // ─── Sticky note fields ──────────────────────────────────────────
  /** Text content for sticky note nodes */
  text?: string;
  /** Sticky note background color */
  stickyColor?: StickyColor;

  // ─── Frame fields ────────────────────────────────────────────────
  /** Frame title text */
  title?: string;
  /** Frame background color (CSS hex) */
  frameColor?: string;
  /** Whether frame children are hidden */
  collapsed?: boolean;
  /** Original height before collapse (for restoring) */
  expandedHeight?: number;

  // ─── Shape fields ───────────────────────────────────────────────
  /** Kind of shape (for shape nodes) */
  shapeKind?: "rect" | "circle" | "diamond" | "triangle";
  /** Fill color for shape nodes */
  fillColor?: string;
  /** Stroke color for shape/drawing nodes */
  strokeColor?: string;

  // ─── Drawing fields ────────────────────────────────────────────
  /** SVG path data for freehand drawing nodes */
  pathData?: string;
  /** Stroke width for drawing nodes */
  strokeWidth?: number;

  // ─── Loading state ────────────────────────────────────────────────
  /** Loading status for skeleton placeholder nodes (undefined = fully loaded) */
  loadingStatus?: "queued" | "running" | "failed";
  /** Label shown on loading skeleton (e.g. truncated prompt) */
  loadingLabel?: string;

  // ─── Interaction ─────────────────────────────────────────────────
  /** Whether this node is locked (non-draggable, non-deletable) */
  locked?: boolean;
  /** Whether this node is hidden (not rendered on canvas) */
  hidden?: boolean;

  // ─── Relationships ───────────────────────────────────────────────
  /** ID of the parent frame this node belongs to */
  parentFrameId?: string;
  /** ID of the canvas node this was derived from (explore/inpaint lineage) */
  sourceNodeId?: string;
};

export type CanvasViewport = {
  x: number;
  y: number;
  scale: number;
};

export type ToolCallInfo = {
  id: string;
  name: string;
  arguments: Record<string, any>;
  /** Whether the user has approved/rejected this tool call */
  status: "pending" | "approved" | "rejected" | "executing" | "completed" | "failed";
  /** Result after execution */
  result?: {
    generationId?: string;
    error?: string;
    success?: boolean;
    nodeId?: string;
    deletedCount?: number;
    movedCount?: number;
    arrangedCount?: number;
    resizedCount?: number;
  };
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  /** Generation created from this message */
  generation?: Generation;
  /** Tool calls proposed by the agent (pending user approval) */
  toolCalls?: ToolCallInfo[];
  /** Timestamp */
  createdAt: number;
};

export type CanvasEditMode = "select" | "inpaint" | "outpaint" | "crop" | "connect" | "draw";

export type CanvasConnector = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  color?: string;
  /** Whether to show an arrowhead at the end */
  arrowEnd?: boolean;
};

export type CanvasState = {
  viewport: CanvasViewport;
  nodes: CanvasNode[];
  /** Set of currently selected node IDs (supports multi-select) */
  selectedNodeIds: Set<string>;
  editMode: CanvasEditMode;
  chatMessages: ChatMessage[];
  chatWorkflowId: string | null;
  /** Counter for z-index assignment */
  nextZIndex: number;
  /** Whether to show lineage connectors between related nodes */
  showLineage: boolean;
  /** Connectors (arrows) between nodes */
  connectors: CanvasConnector[];
  /** Whether to snap nodes to grid on drag end */
  snapToGrid: boolean;
  /** LoRA model IDs pinned for use by the canvas agent */
  pinnedModelIds: string[];
  /** Workflow IDs pinned for use by the canvas agent */
  pinnedWorkflowIds: string[];
  /** Selected provider model ID for non-comfyui engines (replicate, fal, etc.) */
  selectedProviderModelId: string | null;
  /** Persisted engine choice for this canvas (e.g. "comfyui", "replicate", "fal") */
  activeEngine: string | null;
  /** Active chat thread ID (null = unsaved thread) */
  activeThreadId: string | null;
};

/** State wrapper that includes undo/redo history */
export type UndoableCanvasState = {
  /** Current canvas state */
  present: CanvasState;
  /** Past states for undo (most recent last) */
  past: CanvasState[];
  /** Future states for redo (most recent first) */
  future: CanvasState[];
};

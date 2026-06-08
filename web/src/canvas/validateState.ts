import type {
  CanvasNode,
  CanvasNodeType,
  CanvasConnector,
  ChatMessage,
  StickyColor,
  ToolCallInfo,
} from "./types";

export type PersistedCanvasState = {
  nodes: CanvasNode[];
  chatMessages: ChatMessage[];
  chatWorkflowId: string | null;
  nextZIndex: number;
  connectors: CanvasConnector[];
  pinnedModelIds: string[];
  pinnedWorkflowIds: string[];
  selectedProviderModelId: string | null;
  activeEngine: string | null;
};

const NODE_TYPES = new Set<CanvasNodeType>(["image", "text", "frame", "shape", "drawing"]);
const STICKY_COLORS = new Set<StickyColor>(["yellow", "green", "blue", "pink", "orange", "purple"]);
const SHAPE_KINDS = new Set(["rect", "circle", "diamond", "triangle"]);
const LOADING_STATUSES = new Set(["queued", "running", "failed"]);
const CHAT_ROLES = new Set(["user", "assistant", "system"]);
const TOOL_CALL_STATUSES = new Set([
  "pending",
  "approved",
  "rejected",
  "executing",
  "completed",
  "failed",
]);

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function bool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function validateNode(raw: unknown): CanvasNode | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  if (!id) return null;
  // Coordinates and dimensions are required for the node to be renderable.
  const x = num(raw.x);
  const y = num(raw.y);
  const width = num(raw.width);
  const height = num(raw.height);
  const naturalWidth = num(raw.naturalWidth);
  const naturalHeight = num(raw.naturalHeight);
  const zIndex = num(raw.zIndex);
  if (
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined ||
    naturalWidth === undefined ||
    naturalHeight === undefined ||
    zIndex === undefined
  ) {
    return null;
  }

  const node: CanvasNode = { id, x, y, width, height, naturalWidth, naturalHeight, zIndex };

  const type = str(raw.type);
  if (type && NODE_TYPES.has(type as CanvasNodeType)) node.type = type as CanvasNodeType;

  const src = str(raw.src);
  if (src) node.src = src;

  const generationId = str(raw.generationId);
  if (generationId) node.generationId = generationId;

  if (isObj(raw.asset)) node.asset = raw.asset as CanvasNode["asset"];

  if (isObj(raw.placedBy)) {
    const userId = str(raw.placedBy.userId);
    const email = str(raw.placedBy.email);
    if (userId && email) node.placedBy = { userId, email };
  }

  const prompt = str(raw.prompt);
  if (prompt) node.prompt = prompt;

  if (isObj(raw.crop)) {
    const cx = num(raw.crop.x);
    const cy = num(raw.crop.y);
    const cw = num(raw.crop.width);
    const ch = num(raw.crop.height);
    if (cx !== undefined && cy !== undefined && cw !== undefined && ch !== undefined) {
      node.crop = { x: cx, y: cy, width: cw, height: ch };
    }
  }

  const text = str(raw.text);
  if (text !== undefined) node.text = text;

  const stickyColor = str(raw.stickyColor);
  if (stickyColor && STICKY_COLORS.has(stickyColor as StickyColor)) {
    node.stickyColor = stickyColor as StickyColor;
  }

  const title = str(raw.title);
  if (title !== undefined) node.title = title;

  const frameColor = str(raw.frameColor);
  if (frameColor) node.frameColor = frameColor;

  const collapsed = bool(raw.collapsed);
  if (collapsed !== undefined) node.collapsed = collapsed;

  const expandedHeight = num(raw.expandedHeight);
  if (expandedHeight !== undefined) node.expandedHeight = expandedHeight;

  const shapeKind = str(raw.shapeKind);
  if (shapeKind && SHAPE_KINDS.has(shapeKind)) node.shapeKind = shapeKind as CanvasNode["shapeKind"];

  const fillColor = str(raw.fillColor);
  if (fillColor) node.fillColor = fillColor;

  const strokeColor = str(raw.strokeColor);
  if (strokeColor) node.strokeColor = strokeColor;

  const pathData = str(raw.pathData);
  if (pathData) node.pathData = pathData;

  const strokeWidth = num(raw.strokeWidth);
  if (strokeWidth !== undefined) node.strokeWidth = strokeWidth;

  const loadingStatus = str(raw.loadingStatus);
  if (loadingStatus && LOADING_STATUSES.has(loadingStatus)) {
    node.loadingStatus = loadingStatus as CanvasNode["loadingStatus"];
  }

  const loadingLabel = str(raw.loadingLabel);
  if (loadingLabel !== undefined) node.loadingLabel = loadingLabel;

  const locked = bool(raw.locked);
  if (locked !== undefined) node.locked = locked;

  const hidden = bool(raw.hidden);
  if (hidden !== undefined) node.hidden = hidden;

  const parentFrameId = str(raw.parentFrameId);
  if (parentFrameId) node.parentFrameId = parentFrameId;

  const sourceNodeId = str(raw.sourceNodeId);
  if (sourceNodeId) node.sourceNodeId = sourceNodeId;

  return node;
}

function validateConnector(raw: unknown): CanvasConnector | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  const fromNodeId = str(raw.fromNodeId);
  const toNodeId = str(raw.toNodeId);
  if (!id || !fromNodeId || !toNodeId) return null;
  const connector: CanvasConnector = { id, fromNodeId, toNodeId };
  const color = str(raw.color);
  if (color) connector.color = color;
  const arrowEnd = bool(raw.arrowEnd);
  if (arrowEnd !== undefined) connector.arrowEnd = arrowEnd;
  return connector;
}

function validateToolCall(raw: unknown): ToolCallInfo | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  const name = str(raw.name);
  const status = str(raw.status);
  if (!id || !name || !status || !TOOL_CALL_STATUSES.has(status)) return null;
  const tc: ToolCallInfo = {
    id,
    name,
    arguments: isObj(raw.arguments) ? (raw.arguments as Record<string, unknown>) : {},
    status: status as ToolCallInfo["status"],
  };
  if (isObj(raw.result)) tc.result = raw.result as ToolCallInfo["result"];
  return tc;
}

function validateChatMessage(raw: unknown): ChatMessage | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  const role = str(raw.role);
  const content = str(raw.content);
  const createdAt = num(raw.createdAt);
  if (!id || !role || !CHAT_ROLES.has(role) || content === undefined || createdAt === undefined) {
    return null;
  }
  const msg: ChatMessage = {
    id,
    role: role as ChatMessage["role"],
    content,
    createdAt,
  };
  if (isObj(raw.generation)) msg.generation = raw.generation as ChatMessage["generation"];
  if (Array.isArray(raw.toolCalls)) {
    const toolCalls = raw.toolCalls.map(validateToolCall).filter((t): t is ToolCallInfo => !!t);
    if (toolCalls.length > 0) msg.toolCalls = toolCalls;
  }
  return msg;
}

/**
 * Salvage a persisted canvas-state payload of unknown provenance.
 *
 * Returns `null` for inputs that can't be coerced into the persisted shape
 * (non-objects, null, primitives). Otherwise returns a fully typed snapshot
 * with bad nodes/messages/connectors dropped individually — partial corruption
 * never wipes the whole canvas.
 */
export function validatePersistedCanvasState(raw: unknown): PersistedCanvasState | null {
  if (!isObj(raw)) return null;

  const inputNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const nodes: CanvasNode[] = [];
  let droppedNodes = 0;
  for (const r of inputNodes) {
    const node = validateNode(r);
    if (node) nodes.push(node);
    else droppedNodes++;
  }

  const inputMessages = Array.isArray(raw.chatMessages) ? raw.chatMessages : [];
  const chatMessages: ChatMessage[] = [];
  let droppedMessages = 0;
  for (const r of inputMessages) {
    const msg = validateChatMessage(r);
    if (msg) chatMessages.push(msg);
    else droppedMessages++;
  }

  const inputConnectors = Array.isArray(raw.connectors) ? raw.connectors : [];
  const connectors: CanvasConnector[] = [];
  let droppedConnectors = 0;
  for (const r of inputConnectors) {
    const c = validateConnector(r);
    if (c) connectors.push(c);
    else droppedConnectors++;
  }

  if (droppedNodes || droppedMessages || droppedConnectors) {
    console.warn(
      `[canvas] Persisted state had invalid items — dropped ${droppedNodes} nodes, ${droppedMessages} messages, ${droppedConnectors} connectors`,
    );
  }

  const nextZIndex = num(raw.nextZIndex) ?? 1;
  const chatWorkflowId = str(raw.chatWorkflowId) ?? null;
  const selectedProviderModelId = str(raw.selectedProviderModelId) ?? null;
  const activeEngine = str(raw.activeEngine) ?? null;

  return {
    nodes,
    chatMessages,
    chatWorkflowId,
    nextZIndex,
    connectors,
    pinnedModelIds: strArray(raw.pinnedModelIds),
    pinnedWorkflowIds: strArray(raw.pinnedWorkflowIds),
    selectedProviderModelId,
    activeEngine,
  };
}

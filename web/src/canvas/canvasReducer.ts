import type { CanvasNode, CanvasConnector, CanvasState, CanvasViewport, ChatMessage, CanvasEditMode, ToolCallInfo, UndoableCanvasState } from "./types";
import type { Asset } from "../types";
import { arrangeGrid, arrangeMasonry, arrangeLineageTree, type ArrangeMode } from "./placement";

export type CanvasAction =
  | { type: "SET_VIEWPORT"; viewport: CanvasViewport }
  | { type: "ZOOM"; delta: number; centerX: number; centerY: number }
  | { type: "RESET_ZOOM" }
  | { type: "ADD_NODE"; node: CanvasNode; transient?: boolean }
  | { type: "UPDATE_NODE"; id: string; updates: Partial<Omit<CanvasNode, "id">>; transient?: boolean }
  | { type: "REMOVE_NODE"; id: string }
  | { type: "REMOVE_NODES"; ids: string[] }
  | { type: "DUPLICATE_NODE"; id: string }
  | { type: "DUPLICATE_NODES"; ids: string[] }
  | { type: "SELECT_NODE"; id: string | null; additive?: boolean }
  | { type: "SELECT_NODES"; ids: string[] }
  | { type: "MOVE_NODES"; ids: string[]; dx: number; dy: number }
  | { type: "DRAG_MOVE_NODES"; ids: string[]; excludeId: string; dx: number; dy: number; origins: Map<string, { x: number; y: number }> }
  | { type: "DRAG_END"; ids: string[]; dx: number; dy: number; origins: Map<string, { x: number; y: number }> }
  | { type: "BRING_TO_FRONT"; id: string }
  | { type: "BRING_TO_FRONT_BATCH"; ids: string[] }
  | { type: "SEND_TO_BACK"; id: string }
  | { type: "SEND_TO_BACK_BATCH"; ids: string[] }
  | { type: "REPLACE_NODE_IMAGE"; id: string; src: string; naturalWidth: number; naturalHeight: number; asset?: Asset }
  | { type: "SET_EDIT_MODE"; mode: CanvasEditMode }
  | { type: "ADD_CHAT_MESSAGE"; message: ChatMessage }
  | { type: "REMOVE_CHAT_MESSAGE"; id: string }
  | { type: "UPDATE_CHAT_MESSAGE"; id: string; updates: Partial<Omit<ChatMessage, "id">> }
  | { type: "UPDATE_TOOL_CALL_STATUS"; messageId: string; toolCallId: string; status: ToolCallInfo["status"]; result?: ToolCallInfo["result"] }
  | { type: "SET_CHAT_WORKFLOW"; workflowId: string | null }
  | { type: "SET_ENGINE"; engine: string }
  | { type: "CLEAR_CHAT" }
  | { type: "CLEAR_CANVAS" }
  | { type: "LOAD_STATE"; nodes: CanvasNode[]; chatMessages: ChatMessage[]; chatWorkflowId: string | null; nextZIndex: number; connectors?: CanvasConnector[]; pinnedModelIds?: string[]; pinnedWorkflowIds?: string[]; selectedProviderModelId?: string | null; activeEngine?: string | null }
  | { type: "FIT_TO_CONTENT"; containerWidth: number; containerHeight: number; padding?: number }
  | { type: "FIT_TO_SELECTION"; ids: string[]; containerWidth: number; containerHeight: number }
  | { type: "SET_PARENT_FRAME"; nodeIds: string[]; frameId: string | null }
  | { type: "TOGGLE_LINEAGE" }
  | { type: "TOGGLE_SNAP_TO_GRID" }
  | { type: "SET_NODE_VISIBLE"; id: string; visible: boolean }
  | { type: "REORDER_Z"; id: string; newZIndex: number }
  | { type: "TOGGLE_FRAME_COLLAPSE"; id: string }
  | { type: "ADD_CONNECTOR"; connector: CanvasConnector }
  | { type: "REMOVE_CONNECTOR"; id: string }
  | { type: "UPDATE_CONNECTOR"; id: string; updates: Partial<Omit<CanvasConnector, "id" | "fromNodeId" | "toNodeId">> }
  | { type: "TOGGLE_LOCK"; ids: string[] }
  | { type: "ALIGN_NODES"; ids: string[]; edge: "left" | "center" | "right" | "top" | "middle" | "bottom" }
  | { type: "DISTRIBUTE_NODES"; ids: string[]; axis: "horizontal" | "vertical" }
  | { type: "MATCH_SIZE"; ids: string[]; dimension: "width" | "height" }
  | { type: "NORMALIZE_SIZE"; ids: string[]; target: "small" | "medium" | "large" | "original" }
  | { type: "AUTO_ARRANGE"; ids: string[]; mode: ArrangeMode }
  | { type: "SET_PINNED_MODELS"; modelIds: string[] }
  | { type: "SET_PINNED_WORKFLOWS"; workflowIds: string[] }
  | { type: "SET_ACTIVE_THREAD"; threadId: string | null }
  | { type: "LOAD_THREAD"; threadId: string | null; messages: ChatMessage[] }
  | { type: "SET_PROVIDER_MODEL"; modelId: string | null }
  | { type: "UNDO" }
  | { type: "REDO" };

const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const ZOOM_FACTOR = 1.1;
const GRID_SNAP_SIZE = 40;

export const initialCanvasState: CanvasState = {
  viewport: { x: 0, y: 0, scale: 1 },
  nodes: [],
  selectedNodeIds: new Set(),
  editMode: "select",
  chatMessages: [],
  chatWorkflowId: null,
  nextZIndex: 1,
  showLineage: false,
  connectors: [],
  snapToGrid: false,
  pinnedModelIds: [],
  pinnedWorkflowIds: [],
  selectedProviderModelId: null,
  activeEngine: null,
  activeThreadId: null,
};

export function canvasReducer(state: CanvasState, action: CanvasAction): CanvasState {
  switch (action.type) {
    case "SET_VIEWPORT":
      return { ...state, viewport: action.viewport };

    case "ZOOM": {
      const direction = action.delta > 0 ? 1 / ZOOM_FACTOR : ZOOM_FACTOR;
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, state.viewport.scale * direction));
      // Zoom toward cursor position
      const mouseX = action.centerX;
      const mouseY = action.centerY;
      const newX = mouseX - (mouseX - state.viewport.x) * (newScale / state.viewport.scale);
      const newY = mouseY - (mouseY - state.viewport.y) * (newScale / state.viewport.scale);
      return { ...state, viewport: { x: newX, y: newY, scale: newScale } };
    }

    case "RESET_ZOOM":
      return { ...state, viewport: { x: 0, y: 0, scale: 1 } };

    case "ADD_NODE":
      return {
        ...state,
        nodes: [...state.nodes, { ...action.node, zIndex: state.nextZIndex }],
        nextZIndex: state.nextZIndex + 1,
      };

    case "UPDATE_NODE":
      return {
        ...state,
        nodes: state.nodes.map((n) => (n.id === action.id ? { ...n, ...action.updates } : n)),
      };

    case "REMOVE_NODE": {
      const newSelected = new Set(state.selectedNodeIds);
      newSelected.delete(action.id);
      return {
        ...state,
        nodes: state.nodes.filter((n) => n.id !== action.id),
        selectedNodeIds: newSelected,
        connectors: state.connectors.filter((c) => c.fromNodeId !== action.id && c.toNodeId !== action.id),
      };
    }

    case "REMOVE_NODES": {
      const idsToRemove = new Set(action.ids);
      const newSelected = new Set(state.selectedNodeIds);
      for (const id of action.ids) newSelected.delete(id);
      return {
        ...state,
        nodes: state.nodes.filter((n) => !idsToRemove.has(n.id)),
        selectedNodeIds: newSelected,
        connectors: state.connectors.filter((c) => !idsToRemove.has(c.fromNodeId) && !idsToRemove.has(c.toNodeId)),
      };
    }

    case "DUPLICATE_NODE": {
      const src = state.nodes.find((n) => n.id === action.id);
      if (!src) return state;
      const newNode: CanvasNode = {
        ...src,
        id: crypto.randomUUID(),
        x: src.x + 20,
        y: src.y + 20,
        zIndex: state.nextZIndex,
      };
      return {
        ...state,
        nodes: [...state.nodes, newNode],
        selectedNodeIds: new Set([newNode.id]),
        nextZIndex: state.nextZIndex + 1,
      };
    }

    case "DUPLICATE_NODES": {
      const newNodes: CanvasNode[] = [];
      const newIds: string[] = [];
      let zi = state.nextZIndex;
      for (const id of action.ids) {
        const src = state.nodes.find((n) => n.id === id);
        if (!src) continue;
        const newId = crypto.randomUUID();
        newNodes.push({ ...src, id: newId, x: src.x + 20, y: src.y + 20, zIndex: zi++ });
        newIds.push(newId);
      }
      if (newNodes.length === 0) return state;
      return {
        ...state,
        nodes: [...state.nodes, ...newNodes],
        selectedNodeIds: new Set(newIds),
        nextZIndex: zi,
      };
    }

    case "SELECT_NODE": {
      if (action.id === null) {
        return { ...state, selectedNodeIds: new Set() };
      }
      if (action.additive) {
        const newSet = new Set(state.selectedNodeIds);
        if (newSet.has(action.id)) {
          newSet.delete(action.id);
        } else {
          newSet.add(action.id);
        }
        return { ...state, selectedNodeIds: newSet };
      }
      return { ...state, selectedNodeIds: new Set([action.id]) };
    }

    case "SELECT_NODES":
      return { ...state, selectedNodeIds: new Set(action.ids) };

    case "MOVE_NODES": {
      const idsSet = new Set(action.ids);
      // Also move children of any frames being moved
      const frameIds = action.ids.filter((id) => {
        const n = state.nodes.find((nd) => nd.id === id);
        return n && (n.type === "frame");
      });
      if (frameIds.length > 0) {
        const frameIdSet = new Set(frameIds);
        for (const n of state.nodes) {
          if (n.parentFrameId && frameIdSet.has(n.parentFrameId)) {
            idsSet.add(n.id);
          }
        }
      }
      const gs = state.snapToGrid ? GRID_SNAP_SIZE : 0;
      return {
        ...state,
        nodes: state.nodes.map((n) => {
          if (!idsSet.has(n.id)) return n;
          const nx = n.x + action.dx;
          const ny = n.y + action.dy;
          return { ...n, x: gs ? Math.round(nx / gs) * gs : nx, y: gs ? Math.round(ny / gs) * gs : ny };
        }),
      };
    }

    case "DRAG_MOVE_NODES": {
      // Move all selected nodes EXCEPT the one being Konva-dragged,
      // using absolute positions computed from snapshot origins + total delta.
      const idsSet = new Set(action.ids);
      // Also include children of any frames being moved
      const frameIds = action.ids.filter((id) => {
        const n = state.nodes.find((nd) => nd.id === id);
        return n && n.type === "frame";
      });
      if (frameIds.length > 0) {
        const frameIdSet = new Set(frameIds);
        for (const n of state.nodes) {
          if (n.parentFrameId && frameIdSet.has(n.parentFrameId)) {
            idsSet.add(n.id);
          }
        }
      }
      return {
        ...state,
        nodes: state.nodes.map((n) => {
          if (!idsSet.has(n.id) || n.id === action.excludeId) return n;
          const origin = action.origins.get(n.id);
          if (!origin) return { ...n, x: n.x + action.dx, y: n.y + action.dy };
          return { ...n, x: origin.x + action.dx, y: origin.y + action.dy };
        }),
      };
    }

    case "DRAG_END": {
      // Final commit: set all selected nodes (including the dragged one)
      // to their origin + total delta positions. Single undoable action.
      const idsSet = new Set(action.ids);
      const frameIds = action.ids.filter((id) => {
        const n = state.nodes.find((nd) => nd.id === id);
        return n && n.type === "frame";
      });
      if (frameIds.length > 0) {
        const frameIdSet = new Set(frameIds);
        for (const n of state.nodes) {
          if (n.parentFrameId && frameIdSet.has(n.parentFrameId)) {
            idsSet.add(n.id);
          }
        }
      }
      const gsDrag = state.snapToGrid ? GRID_SNAP_SIZE : 0;
      return {
        ...state,
        nodes: state.nodes.map((n) => {
          if (!idsSet.has(n.id)) return n;
          const origin = action.origins.get(n.id);
          let nx = origin ? origin.x + action.dx : n.x + action.dx;
          let ny = origin ? origin.y + action.dy : n.y + action.dy;
          if (gsDrag) { nx = Math.round(nx / gsDrag) * gsDrag; ny = Math.round(ny / gsDrag) * gsDrag; }
          return { ...n, x: nx, y: ny };
        }),
      };
    }

    case "BRING_TO_FRONT": {
      const node = state.nodes.find((n) => n.id === action.id);
      if (!node) return state;
      return {
        ...state,
        nodes: state.nodes.map((n) => (n.id === action.id ? { ...n, zIndex: state.nextZIndex } : n)),
        nextZIndex: state.nextZIndex + 1,
      };
    }

    case "SEND_TO_BACK": {
      if (state.nodes.length === 0) return state;
      const minZ = Math.min(...state.nodes.map((n) => n.zIndex));
      return {
        ...state,
        nodes: state.nodes.map((n) => (n.id === action.id ? { ...n, zIndex: minZ - 1 } : n)),
      };
    }

    case "BRING_TO_FRONT_BATCH": {
      const idsSet = new Set(action.ids);
      let zi = state.nextZIndex;
      return {
        ...state,
        nodes: state.nodes.map((n) => (idsSet.has(n.id) ? { ...n, zIndex: zi++ } : n)),
        nextZIndex: zi,
      };
    }

    case "SEND_TO_BACK_BATCH": {
      if (state.nodes.length === 0) return state;
      const idsSet = new Set(action.ids);
      const minZ = Math.min(...state.nodes.map((n) => n.zIndex));
      let zi = minZ - action.ids.length;
      return {
        ...state,
        nodes: state.nodes.map((n) => (idsSet.has(n.id) ? { ...n, zIndex: zi++ } : n)),
      };
    }

    case "REPLACE_NODE_IMAGE":
      return {
        ...state,
        nodes: state.nodes.map((n) =>
          n.id === action.id
            ? { ...n, src: action.src, naturalWidth: action.naturalWidth, naturalHeight: action.naturalHeight, ...(action.asset ? { asset: action.asset } : {}) }
            : n
        ),
      };

    case "SET_EDIT_MODE":
      return { ...state, editMode: action.mode };

    case "ADD_CHAT_MESSAGE":
      return { ...state, chatMessages: [...state.chatMessages, action.message] };

    case "REMOVE_CHAT_MESSAGE":
      return { ...state, chatMessages: state.chatMessages.filter((m) => m.id !== action.id) };

    case "UPDATE_CHAT_MESSAGE":
      return {
        ...state,
        chatMessages: state.chatMessages.map((m) =>
          m.id === action.id ? { ...m, ...action.updates } : m
        ),
      };

    case "UPDATE_TOOL_CALL_STATUS":
      return {
        ...state,
        chatMessages: state.chatMessages.map((m) =>
          m.id === action.messageId
            ? {
                ...m,
                toolCalls: m.toolCalls?.map((tc) =>
                  tc.id === action.toolCallId
                    ? { ...tc, status: action.status, ...(action.result ? { result: action.result } : {}) }
                    : tc
                ),
              }
            : m
        ),
      };

    case "SET_CHAT_WORKFLOW":
      return { ...state, chatWorkflowId: action.workflowId };

    case "SET_ENGINE":
      return { ...state, activeEngine: action.engine };

    case "CLEAR_CHAT":
      return { ...state, chatMessages: [], activeThreadId: null };

    case "CLEAR_CANVAS":
      return { ...initialCanvasState, chatWorkflowId: state.chatWorkflowId, showLineage: state.showLineage, connectors: [], pinnedModelIds: state.pinnedModelIds, pinnedWorkflowIds: state.pinnedWorkflowIds, selectedProviderModelId: state.selectedProviderModelId, activeEngine: state.activeEngine };

    case "LOAD_STATE":
      return {
        ...state,
        nodes: action.nodes,
        chatMessages: action.chatMessages,
        chatWorkflowId: action.chatWorkflowId,
        nextZIndex: action.nextZIndex,
        connectors: action.connectors ?? [],
        pinnedModelIds: action.pinnedModelIds ?? [],
        pinnedWorkflowIds: action.pinnedWorkflowIds ?? [],
        selectedProviderModelId: action.selectedProviderModelId ?? null,
        activeEngine: action.activeEngine ?? null,
        selectedNodeIds: new Set(),
        editMode: "select",
      };

    case "FIT_TO_CONTENT": {
      if (state.nodes.length === 0) return state;
      const pad = action.padding ?? 80;
      const minX = Math.min(...state.nodes.map((n) => n.x)) - pad;
      const minY = Math.min(...state.nodes.map((n) => n.y)) - pad;
      const maxX = Math.max(...state.nodes.map((n) => n.x + n.width)) + pad;
      const maxY = Math.max(...state.nodes.map((n) => n.y + n.height)) + pad;
      const contentW = maxX - minX;
      const contentH = maxY - minY;
      const fitScale = Math.min(
        action.containerWidth / contentW,
        action.containerHeight / contentH,
        1 // don't zoom in past 100%
      );
      const fitX = (action.containerWidth - contentW * fitScale) / 2 - minX * fitScale;
      const fitY = (action.containerHeight - contentH * fitScale) / 2 - minY * fitScale;
      return { ...state, viewport: { x: fitX, y: fitY, scale: fitScale } };
    }

    case "FIT_TO_SELECTION": {
      const targetNodes = state.nodes.filter((n) => action.ids.includes(n.id));
      if (targetNodes.length === 0) return state;
      const pad = 80;
      const minX = Math.min(...targetNodes.map((n) => n.x)) - pad;
      const minY = Math.min(...targetNodes.map((n) => n.y)) - pad;
      const maxX = Math.max(...targetNodes.map((n) => n.x + n.width)) + pad;
      const maxY = Math.max(...targetNodes.map((n) => n.y + n.height)) + pad;
      const contentW = maxX - minX;
      const contentH = maxY - minY;
      const fitScale = Math.min(
        action.containerWidth / contentW,
        action.containerHeight / contentH,
        1,
      );
      const fitX = (action.containerWidth - contentW * fitScale) / 2 - minX * fitScale;
      const fitY = (action.containerHeight - contentH * fitScale) / 2 - minY * fitScale;
      return { ...state, viewport: { x: fitX, y: fitY, scale: fitScale } };
    }

    case "SET_PARENT_FRAME": {
      const idsSet = new Set(action.nodeIds);
      return {
        ...state,
        nodes: state.nodes.map((n) =>
          idsSet.has(n.id) ? { ...n, parentFrameId: action.frameId ?? undefined } : n
        ),
      };
    }

    case "TOGGLE_LINEAGE":
      return { ...state, showLineage: !state.showLineage };

    case "TOGGLE_SNAP_TO_GRID":
      return { ...state, snapToGrid: !state.snapToGrid };

    case "SET_NODE_VISIBLE":
      return {
        ...state,
        nodes: state.nodes.map((n) =>
          n.id === action.id ? { ...n, hidden: action.visible ? undefined : true } : n
        ),
      };

    case "REORDER_Z": {
      return {
        ...state,
        nodes: state.nodes.map((n) =>
          n.id === action.id ? { ...n, zIndex: action.newZIndex } : n
        ),
      };
    }

    case "TOGGLE_FRAME_COLLAPSE": {
      const frame = state.nodes.find((n) => n.id === action.id);
      if (!frame || frame.type !== "frame") return state;
      const isCollapsing = !frame.collapsed;
      return {
        ...state,
        nodes: state.nodes.map((n) => {
          if (n.id !== action.id) return n;
          if (isCollapsing) {
            return { ...n, collapsed: true, expandedHeight: n.height, height: 32 };
          } else {
            return { ...n, collapsed: false, height: n.expandedHeight ?? 400, expandedHeight: undefined };
          }
        }),
      };
    }

    case "ADD_CONNECTOR":
      return { ...state, connectors: [...state.connectors, action.connector] };

    case "REMOVE_CONNECTOR":
      return { ...state, connectors: state.connectors.filter((c) => c.id !== action.id) };

    case "UPDATE_CONNECTOR":
      return {
        ...state,
        connectors: state.connectors.map((c) =>
          c.id === action.id ? { ...c, ...action.updates } : c
        ),
      };

    case "TOGGLE_LOCK": {
      const idsSet = new Set(action.ids);
      // If any node is unlocked, lock all; otherwise unlock all
      const targetNodes = state.nodes.filter((n) => idsSet.has(n.id));
      const shouldLock = targetNodes.some((n) => !n.locked);
      return {
        ...state,
        nodes: state.nodes.map((n) =>
          idsSet.has(n.id) ? { ...n, locked: shouldLock || undefined } : n
        ),
      };
    }

    case "ALIGN_NODES": {
      const targetNodes = state.nodes.filter((n) => action.ids.includes(n.id));
      if (targetNodes.length < 2) return state;
      const minX = Math.min(...targetNodes.map((n) => n.x));
      const maxX = Math.max(...targetNodes.map((n) => n.x + n.width));
      const minY = Math.min(...targetNodes.map((n) => n.y));
      const maxY = Math.max(...targetNodes.map((n) => n.y + n.height));
      const idsSet = new Set(action.ids);
      return {
        ...state,
        nodes: state.nodes.map((n) => {
          if (!idsSet.has(n.id)) return n;
          switch (action.edge) {
            case "left": return { ...n, x: minX };
            case "center": return { ...n, x: (minX + maxX) / 2 - n.width / 2 };
            case "right": return { ...n, x: maxX - n.width };
            case "top": return { ...n, y: minY };
            case "middle": return { ...n, y: (minY + maxY) / 2 - n.height / 2 };
            case "bottom": return { ...n, y: maxY - n.height };
            default: return n;
          }
        }),
      };
    }

    case "DISTRIBUTE_NODES": {
      const targetNodes = state.nodes.filter((n) => action.ids.includes(n.id));
      if (targetNodes.length < 3) return state;
      const idsSet = new Set(action.ids);
      if (action.axis === "horizontal") {
        const sorted = [...targetNodes].sort((a, b) => a.x - b.x);
        const totalNodeWidth = sorted.reduce((sum, n) => sum + n.width, 0);
        const minX = sorted[0].x;
        const maxX = sorted[sorted.length - 1].x + sorted[sorted.length - 1].width;
        const gap = (maxX - minX - totalNodeWidth) / (sorted.length - 1);
        const posMap = new Map<string, number>();
        let cx = minX;
        for (const n of sorted) {
          posMap.set(n.id, cx);
          cx += n.width + gap;
        }
        return {
          ...state,
          nodes: state.nodes.map((n) => {
            if (!idsSet.has(n.id)) return n;
            const newX = posMap.get(n.id);
            return newX !== undefined ? { ...n, x: newX } : n;
          }),
        };
      } else {
        const sorted = [...targetNodes].sort((a, b) => a.y - b.y);
        const totalNodeHeight = sorted.reduce((sum, n) => sum + n.height, 0);
        const minY = sorted[0].y;
        const maxY = sorted[sorted.length - 1].y + sorted[sorted.length - 1].height;
        const gap = (maxY - minY - totalNodeHeight) / (sorted.length - 1);
        const posMap = new Map<string, number>();
        let cy = minY;
        for (const n of sorted) {
          posMap.set(n.id, cy);
          cy += n.height + gap;
        }
        return {
          ...state,
          nodes: state.nodes.map((n) => {
            if (!idsSet.has(n.id)) return n;
            const newY = posMap.get(n.id);
            return newY !== undefined ? { ...n, y: newY } : n;
          }),
        };
      }
    }

    case "MATCH_SIZE": {
      const targetNodes = state.nodes.filter((n) => action.ids.includes(n.id));
      if (targetNodes.length < 2) return state;
      const idsSet = new Set(action.ids);
      const maxVal = Math.max(...targetNodes.map((n) => n[action.dimension]));
      return {
        ...state,
        nodes: state.nodes.map((n) =>
          idsSet.has(n.id) ? { ...n, [action.dimension]: maxVal } : n
        ),
      };
    }

    case "NORMALIZE_SIZE": {
      const targetNodes = state.nodes.filter((n) => action.ids.includes(n.id));
      if (targetNodes.length === 0) return state;
      const idsSet = new Set(action.ids);

      // Target bounding dimension for the longest edge
      const TARGET_DIM: Record<string, number> = {
        small: 200,
        medium: 400,
        large: 600,
        original: 0, // special: use naturalWidth/naturalHeight
      };
      const maxDim = TARGET_DIM[action.target];

      return {
        ...state,
        nodes: state.nodes.map((n) => {
          if (!idsSet.has(n.id)) return n;
          // Only resize image nodes (skip frames, text, shapes, drawings)
          if (n.type && n.type !== "image") return n;

          const nw = n.naturalWidth || n.width;
          const nh = n.naturalHeight || n.height;
          const aspect = nw / nh;

          let newW: number;
          let newH: number;

          if (action.target === "original") {
            newW = nw;
            newH = nh;
          } else if (aspect >= 1) {
            // Landscape or square: constrain width
            newW = maxDim;
            newH = Math.round(maxDim / aspect);
          } else {
            // Portrait: constrain height
            newH = maxDim;
            newW = Math.round(maxDim * aspect);
          }

          return { ...n, width: newW, height: newH };
        }),
      };
    }

    case "AUTO_ARRANGE": {
      const targetNodes = state.nodes.filter((n) => action.ids.includes(n.id));
      if (targetNodes.length < 2) return state;
      const posMap = action.mode === "tree"
        ? arrangeLineageTree(targetNodes, state.connectors)
        : action.mode === "masonry"
        ? arrangeMasonry(targetNodes)
        : arrangeGrid(targetNodes);
      if (posMap.size === 0) return state;
      return {
        ...state,
        nodes: state.nodes.map((n) => {
          const pos = posMap.get(n.id);
          if (!pos) return n;
          const updated = { ...n, x: pos.x, y: pos.y };
          // Masonry layout may include size changes
          const w = (pos as { width?: number }).width;
          const h = (pos as { height?: number }).height;
          if (w != null) updated.width = w;
          if (h != null) updated.height = h;
          return updated;
        }),
      };
    }

    case "SET_PINNED_MODELS":
      return { ...state, pinnedModelIds: action.modelIds };

    case "SET_PINNED_WORKFLOWS":
      return { ...state, pinnedWorkflowIds: action.workflowIds };

    case "SET_ACTIVE_THREAD":
      return { ...state, activeThreadId: action.threadId };

    case "LOAD_THREAD":
      return { ...state, activeThreadId: action.threadId, chatMessages: action.messages };

    case "SET_PROVIDER_MODEL":
      return { ...state, selectedProviderModelId: action.modelId };

    default:
      return state;
  }
}

// ─── Undo / Redo wrapper ───────────────────────────────────────────────────

const MAX_UNDO_HISTORY = 50;

/** Actions that modify canvas nodes and should be undoable */
const UNDOABLE_ACTIONS = new Set([
  "ADD_NODE",
  "REMOVE_NODE",
  "REMOVE_NODES",
  "DUPLICATE_NODE",
  "DUPLICATE_NODES",
  "MOVE_NODES",
  "DRAG_END",
  "REPLACE_NODE_IMAGE",
  "BRING_TO_FRONT",
  "BRING_TO_FRONT_BATCH",
  "SEND_TO_BACK",
  "SEND_TO_BACK_BATCH",
  "UPDATE_NODE",
  "SET_PARENT_FRAME",
  "CLEAR_CANVAS",
  "SET_NODE_VISIBLE",
  "REORDER_Z",
  "TOGGLE_FRAME_COLLAPSE",
  "ADD_CONNECTOR",
  "REMOVE_CONNECTOR",
  "UPDATE_CONNECTOR",
  "TOGGLE_LOCK",
  "ALIGN_NODES",
  "DISTRIBUTE_NODES",
  "MATCH_SIZE",
  "NORMALIZE_SIZE",
  "AUTO_ARRANGE",
]);

export const initialUndoableState: UndoableCanvasState = {
  present: initialCanvasState,
  past: [],
  future: [],
};

/**
 * Wraps the base canvasReducer with undo/redo history.
 * Only destructive canvas-node actions push onto the undo stack.
 * Viewport, chat, and selection changes are NOT undoable (they'd be noisy).
 */
export function undoableCanvasReducer(
  state: UndoableCanvasState,
  action: CanvasAction
): UndoableCanvasState {
  if (action.type === "UNDO") {
    if (state.past.length === 0) return state;
    const previous = state.past[state.past.length - 1];
    return {
      past: state.past.slice(0, -1),
      present: { ...previous, viewport: state.present.viewport, selectedNodeIds: new Set(), editMode: "select" },
      future: [state.present, ...state.future],
    };
  }

  if (action.type === "REDO") {
    if (state.future.length === 0) return state;
    const next = state.future[0];
    return {
      past: [...state.past, state.present],
      present: { ...next, viewport: state.present.viewport, selectedNodeIds: new Set(), editMode: "select" },
      future: state.future.slice(1),
    };
  }

  const newPresent = canvasReducer(state.present, action);

  // If state didn't change, return as-is
  if (newPresent === state.present) return state;

  // Transient actions are the async lifecycle churn of a layered op — the
  // loading-status update and the skeleton-fill that follow an ADD_NODE, or the
  // asset swap of an inpaint. They fold into the op's anchor action so a whole
  // generate/inpaint/outpaint collapses to a single undo step instead of 2–3.
  const isTransient = "transient" in action && action.transient === true;

  // Only push to undo stack for undoable, non-transient actions
  if (UNDOABLE_ACTIONS.has(action.type) && !isTransient) {
    const newPast = [...state.past, state.present].slice(-MAX_UNDO_HISTORY);
    return {
      past: newPast,
      present: newPresent,
      future: [], // clear redo stack on new action
    };
  }

  // Non-undoable / transient action: update present, keep history intact
  return { ...state, present: newPresent };
}

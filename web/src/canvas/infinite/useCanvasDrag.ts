import { useRef, useCallback, useLayoutEffect } from "react";
import type Konva from "konva";
import { computeSnapGuides, type SnapGuide } from "../snapGuides";
import type { CanvasNode } from "../types";

type CanvasState = {
  nodes: CanvasNode[];
  selectedNodeIds: Set<string>;
  viewport: { x: number; y: number; scale: number };
  editMode: string;
  connectors: any[];
  showLineage?: boolean;
};

type Dispatch = (action: any) => void;

export function useCanvasDrag(
  stateRef: { readonly current: CanvasState },
  groupRefs: { readonly current: Map<string, Konva.Group> },
  dispatch: Dispatch,
  onDragDelta: ((dx: number, dy: number) => void) | undefined,
  dropTargetRectRef: { current: { x: number; y: number; width: number; height: number } | null },
  dropHighlightLayerRef: React.RefObject<Konva.Layer | null>,
  snapGuidesRef: { current: SnapGuide[] },
  snapLayerRef: React.RefObject<Konva.Layer | null>,
) {
  // Snapshot of selected node positions at drag start, keyed by node ID.
  const dragOrigins = useRef<Map<string, { x: number; y: number }> | null>(null);
  const dragSelectedIds = useRef<string[]>([]);
  const dragOtherNodes = useRef<CanvasNode[]>([]);
  const dragIdSet = useRef<Set<string>>(new Set());
  const pendingDrag = useRef<{ nodeId: string; dx: number; dy: number } | null>(null);
  const lastSnappedDelta = useRef<{ nodeId: string; sdx: number; sdy: number } | null>(null);
  const prevDropTarget = useRef<string | null>(null);
  const prevSnapKey = useRef("");

  /**
   * Find the topmost frame whose bounds contain the given center point.
   * Excludes any frames in `excludeIds` (e.g. frames being dragged themselves).
   */
  const findFrameAtPoint = useCallback(
    (cx: number, cy: number, excludeIds: Set<string>): string | null => {
      let bestFrame: { id: string; zIndex: number } | null = null;
      for (const n of stateRef.current.nodes) {
        if (n.type !== "frame" || excludeIds.has(n.id)) continue;
        if (cx >= n.x && cx <= n.x + n.width && cy >= n.y && cy <= n.y + n.height) {
          if (!bestFrame || n.zIndex > bestFrame.zIndex) {
            bestFrame = { id: n.id, zIndex: n.zIndex };
          }
        }
      }
      return bestFrame?.id ?? null;
    },
    []
  );

  const handleNodeDragStart = useCallback(
    (nodeId: string) => {
      const s = stateRef.current;
      const draggedNode = s.nodes.find((n) => n.id === nodeId);
      if (draggedNode?.locked) return;
      if (!s.selectedNodeIds.has(nodeId)) {
        dispatch({ type: "SELECT_NODE", id: nodeId });
      }
      dropTargetRectRef.current = null;
      dropHighlightLayerRef.current?.batchDraw();
      const ids = s.selectedNodeIds.has(nodeId)
        ? [...s.selectedNodeIds]
        : [nodeId];
      const origins = new Map<string, { x: number; y: number }>();
      for (const id of ids) {
        const n = s.nodes.find((nd) => nd.id === id);
        if (n) origins.set(id, { x: n.x, y: n.y });
      }
      const frameIds = ids.filter((id) => {
        const n = s.nodes.find((nd) => nd.id === id);
        return n && n.type === "frame";
      });
      if (frameIds.length > 0) {
        const frameIdSet = new Set(frameIds);
        for (const n of s.nodes) {
          if (n.parentFrameId && frameIdSet.has(n.parentFrameId) && !origins.has(n.id)) {
            origins.set(n.id, { x: n.x, y: n.y });
            ids.push(n.id);
          }
        }
      }
      dragOrigins.current = origins;
      dragSelectedIds.current = ids;
      const idSet = new Set(ids);
      dragIdSet.current = idSet;
      dragOtherNodes.current = s.nodes.filter((n) => !idSet.has(n.id));
      prevDropTarget.current = null;
      prevSnapKey.current = "";
    },
    [dispatch]
  );

  const processDragFrame = useCallback(() => {
    const pending = pendingDrag.current;
    if (!pending || !dragOrigins.current) return;
    const { nodeId, dx, dy } = pending;

    const origins = dragOrigins.current;
    const ids = dragSelectedIds.current;
    const otherNodes = dragOtherNodes.current;

    const draggedNodes: typeof otherNodes = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const origin = origins.get(id);
      if (!origin) continue;
      const n = stateRef.current.nodes.find((nd) => nd.id === id);
      if (n) draggedNodes.push({ ...n, x: origin.x, y: origin.y });
    }

    const snap = computeSnapGuides(draggedNodes, otherNodes, dx, dy);
    const sdx = snap.snappedDx;
    const sdy = snap.snappedDy;
    lastSnappedDelta.current = { nodeId, sdx, sdy };

    snapGuidesRef.current = snap.guides;
    const snapKey = snap.guides.length === 0
      ? ""
      : snap.guides.map((g) => `${g.orientation}${g.position}`).join("|");
    if (snapKey !== prevSnapKey.current) {
      prevSnapKey.current = snapKey;
      snapLayerRef.current?.batchDraw();
    }

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const origin = origins.get(id);
      if (!origin) continue;
      const group = groupRefs.current.get(id);
      if (group) {
        group.position({ x: origin.x + sdx, y: origin.y + sdy });
      }
    }
    groupRefs.current.get(nodeId)?.getLayer()?.batchDraw();

    const draggedIdSet = dragIdSet.current;
    const origin = origins.get(nodeId);
    const n = stateRef.current.nodes.find((nd) => nd.id === nodeId);
    if (origin && n && n.type !== "frame") {
      const cx = origin.x + sdx + n.width / 2;
      const cy = origin.y + sdy + n.height / 2;
      const frameId = findFrameAtPoint(cx, cy, draggedIdSet);
      if (frameId !== prevDropTarget.current) {
        prevDropTarget.current = frameId;
        const frameNode = frameId ? stateRef.current.nodes.find((nd) => nd.id === frameId) : null;
        dropTargetRectRef.current = frameNode
          ? { x: frameNode.x, y: frameNode.y, width: frameNode.width, height: frameNode.height }
          : null;
        dropHighlightLayerRef.current?.batchDraw();
      }
    } else if (prevDropTarget.current !== null) {
      prevDropTarget.current = null;
      dropTargetRectRef.current = null;
      dropHighlightLayerRef.current?.batchDraw();
    }

    onDragDelta?.(sdx, sdy);
  }, [findFrameAtPoint, onDragDelta]);

  const handleNodeDragMove = useCallback(
    (nodeId: string, dx: number, dy: number) => {
      if ((dx === 0 && dy === 0) || !dragOrigins.current) return;
      pendingDrag.current = { nodeId, dx, dy };
      processDragFrame();
    },
    [processDragFrame]
  );

  const handleNodeDragEnd = useCallback(
    (nodeId: string, dx: number, dy: number) => {
      pendingDrag.current = null;
      lastSnappedDelta.current = null;

      if (!dragOrigins.current) return;
      const origins = dragOrigins.current;
      const draggedIds = dragSelectedIds.current;
      const s = stateRef.current;

      const draggedNodes: typeof s.nodes = [];
      for (const id of draggedIds) {
        const n = s.nodes.find((nd) => nd.id === id);
        if (!n) continue;
        const origin = origins.get(id);
        draggedNodes.push(origin ? { ...n, x: origin.x, y: origin.y } : n);
      }
      const snap = computeSnapGuides(draggedNodes, dragOtherNodes.current, dx, dy);
      dx = snap.snappedDx;
      dy = snap.snappedDy;

      snapGuidesRef.current = [];
      prevSnapKey.current = "";
      snapLayerRef.current?.batchDraw();

      onDragDelta?.(0, 0);

      dispatch({
        type: "DRAG_END",
        ids: draggedIds,
        dx,
        dy,
        origins,
      });

      const draggedIdSet = dragIdSet.current;
      const assignToFrame: string[] = [];
      const unparent: string[] = [];
      let targetFrameId: string | null = null;

      const draggedFrameIds = new Set<string>();
      for (const id of draggedIds) {
        const n = s.nodes.find((nd) => nd.id === id);
        if (n && n.type === "frame") draggedFrameIds.add(id);
      }

      for (const id of draggedIds) {
        const n = s.nodes.find((nd) => nd.id === id);
        if (!n || n.type === "frame") continue;
        if (n.parentFrameId && draggedFrameIds.has(n.parentFrameId)) continue;

        const origin = origins.get(id);
        const finalX = origin ? origin.x + dx : n.x + dx;
        const finalY = origin ? origin.y + dy : n.y + dy;
        const cx = finalX + n.width / 2;
        const cy = finalY + n.height / 2;

        const frameId = findFrameAtPoint(cx, cy, draggedIdSet);
        if (frameId) {
          if (n.parentFrameId !== frameId) {
            assignToFrame.push(id);
            targetFrameId = frameId;
          }
        } else {
          if (n.parentFrameId) {
            unparent.push(id);
          }
        }
      }

      if (assignToFrame.length > 0 && targetFrameId) {
        dispatch({ type: "SET_PARENT_FRAME", nodeIds: assignToFrame, frameId: targetFrameId });
      }
      if (unparent.length > 0) {
        dispatch({ type: "SET_PARENT_FRAME", nodeIds: unparent, frameId: null });
      }

      prevDropTarget.current = null;
      dropTargetRectRef.current = null;
      dropHighlightLayerRef.current?.batchDraw();
      dragOrigins.current = null;
      dragSelectedIds.current = [];
      dragOtherNodes.current = [];
      dragIdSet.current = new Set();
    },
    [dispatch, findFrameAtPoint, onDragDelta]
  );

  // Re-apply imperative positions after every React re-render during drag.
  useLayoutEffect(() => {
    const delta = lastSnappedDelta.current;
    const origins = dragOrigins.current;
    if (!delta || !origins) return;
    const { sdx, sdy } = delta;
    const ids = dragSelectedIds.current;
    let layer: ReturnType<Konva.Group["getLayer"]> | null = null;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const origin = origins.get(id);
      if (!origin) continue;
      const group = groupRefs.current.get(id);
      if (group) {
        group.position({ x: origin.x + sdx, y: origin.y + sdy });
        if (!layer) layer = group.getLayer();
      }
    }
    layer?.batchDraw();
  });

  return {
    handleNodeDragStart,
    handleNodeDragMove,
    handleNodeDragEnd,
  };
}

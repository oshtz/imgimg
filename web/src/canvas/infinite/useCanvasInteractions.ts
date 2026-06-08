import { useRef, useCallback, useEffect, useState } from "react";
import type Konva from "konva";
import { rdpSimplify, smoothPathToSVG } from "../drawUtils";
import { pointInPolygon } from "./canvasUtils";
import type { MarqueeRect } from "./types";
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

export function useSpaceKey() {
  const [spaceHeld, setSpaceHeld] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setSpaceHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  return spaceHeld;
}

export function useCanvasInteractions(
  stateRef: { readonly current: CanvasState },
  viewportRef: { readonly current: { x: number; y: number; scale: number } },
  stageRef: React.RefObject<Konva.Stage | null>,
  dispatch: Dispatch,
  locked: boolean,
  spaceHeld: boolean,
  screenToWorld: (sx: number, sy: number) => { x: number; y: number },
  drawColor: string,
  drawWidth: number,
  onConnectorSelect: ((connectorId: string | null) => void) | undefined,
  selectedConnectorId: string | null | undefined,
) {
  const isPanning = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const marqueeRef = useRef<MarqueeRect | null>(null);
  const isMarquee = useRef(false);
  const justFinishedMarquee = useRef(false);

  // Connector drawing state (connect mode)
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [connectPreview, setConnectPreview] = useState<{ x: number; y: number } | null>(null);

  // Drawing state
  const isDrawing = useRef(false);
  const drawPoints = useRef<{ x: number; y: number }[]>([]);
  const [drawingActive, setDrawingActive] = useState(false);
  const liveDrawLineRef = useRef<Konva.Line>(null);

  // Drag-to-connect state
  const connectDragSource = useRef<string | null>(null);
  const connectDragMoved = useRef(false);
  const [connectHoverTarget, setConnectHoverTarget] = useState<string | null>(null);

  // Lasso selection state
  const isLasso = useRef(false);
  const lassoPoints = useRef<{ x: number; y: number }[]>([]);
  const [lassoPath, setLassoPath] = useState<{ x: number; y: number }[]>([]);

  // Wheel zoom
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      if (locked) return;
      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      dispatch({ type: "ZOOM", delta: e.evt.deltaY, centerX: pointer.x, centerY: pointer.y });
    },
    [dispatch, locked]
  );

  // Mouse down -- pan or marquee
  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (locked) return;
      if (e.evt.button === 1 || (spaceHeld && e.evt.button === 0)) {
        isPanning.current = true;
        lastPointer.current = { x: e.evt.clientX, y: e.evt.clientY };
        e.evt.preventDefault();
        return;
      }
      // Alt+drag on empty stage = lasso selection
      if (e.evt.button === 0 && e.evt.altKey && e.target === stageRef.current) {
        const stage = stageRef.current;
        if (!stage) return;
        const rect = stage.container().getBoundingClientRect();
        const sx = e.evt.clientX - rect.left;
        const sy = e.evt.clientY - rect.top;
        const vp = viewportRef.current;
        const world = { x: (sx - vp.x) / vp.scale, y: (sy - vp.y) / vp.scale };
        isLasso.current = true;
        lassoPoints.current = [world];
        setLassoPath([world]);
        return;
      }
      // Drawing mode: start path
      if (e.evt.button === 0 && stateRef.current.editMode === "draw") {
        const stage = stageRef.current;
        if (!stage) return;
        const rect = stage.container().getBoundingClientRect();
        const sx = e.evt.clientX - rect.left;
        const sy = e.evt.clientY - rect.top;
        const vp = viewportRef.current;
        const world = { x: (sx - vp.x) / vp.scale, y: (sy - vp.y) / vp.scale };
        isDrawing.current = true;
        drawPoints.current = [world];
        setDrawingActive(true);
        requestAnimationFrame(() => {
          liveDrawLineRef.current?.points([world.x, world.y]);
          liveDrawLineRef.current?.getLayer()?.batchDraw();
        });
        return;
      }
      // Left-click on empty stage -> start marquee selection
      if (e.evt.button === 0 && e.target === stageRef.current) {
        const stage = stageRef.current;
        if (!stage) return;
        const rect = stage.container().getBoundingClientRect();
        const sx = e.evt.clientX - rect.left;
        const sy = e.evt.clientY - rect.top;
        const world = screenToWorld(sx, sy);
        isMarquee.current = true;
        const initial = { startX: world.x, startY: world.y, endX: world.x, endY: world.y };
        marqueeRef.current = initial;
        setMarquee(initial);
      }
    },
    [locked, spaceHeld, screenToWorld]
  );

  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Panning
      if (isPanning.current) {
        const dx = e.evt.clientX - lastPointer.current.x;
        const dy = e.evt.clientY - lastPointer.current.y;
        lastPointer.current = { x: e.evt.clientX, y: e.evt.clientY };
        const vp = viewportRef.current;
        dispatch({
          type: "SET_VIEWPORT",
          viewport: { ...vp, x: vp.x + dx, y: vp.y + dy },
        });
        return;
      }
      // Lasso selection: append point
      if (isLasso.current) {
        const stage = stageRef.current;
        if (stage) {
          const rect = stage.container().getBoundingClientRect();
          const sx = e.evt.clientX - rect.left;
          const sy = e.evt.clientY - rect.top;
          const vp = viewportRef.current;
          const world = { x: (sx - vp.x) / vp.scale, y: (sy - vp.y) / vp.scale };
          lassoPoints.current.push(world);
          setLassoPath([...lassoPoints.current]);
        }
        return;
      }
      // Drawing mode: append point
      if (isDrawing.current) {
        const stage = stageRef.current;
        if (stage) {
          const rect = stage.container().getBoundingClientRect();
          const sx = e.evt.clientX - rect.left;
          const sy = e.evt.clientY - rect.top;
          const vp = viewportRef.current;
          const world = { x: (sx - vp.x) / vp.scale, y: (sy - vp.y) / vp.scale };
          const last = drawPoints.current[drawPoints.current.length - 1];
          if (last) {
            const ddx = world.x - last.x;
            const ddy = world.y - last.y;
            if (ddx * ddx + ddy * ddy < 4) return;
          }
          drawPoints.current.push(world);
          const flatPts = drawPoints.current.flatMap((p) => [p.x, p.y]);
          liveDrawLineRef.current?.points(flatPts);
          liveDrawLineRef.current?.getLayer()?.batchDraw();
        }
        return;
      }
      // Connect-mode preview line + drag-to-connect hover
      if (connectFrom && stateRef.current.editMode === "connect") {
        const stage = stageRef.current;
        if (stage) {
          const rect = stage.container().getBoundingClientRect();
          const sx = e.evt.clientX - rect.left;
          const sy = e.evt.clientY - rect.top;
          const vp = viewportRef.current;
          const world = { x: (sx - vp.x) / vp.scale, y: (sy - vp.y) / vp.scale };
          setConnectPreview(world);
          if (connectDragSource.current) connectDragMoved.current = true;
          let hoverNodeId: string | null = null;
          const dragSrc = connectDragSource.current;
          for (const n of stateRef.current.nodes) {
            if (dragSrc && n.id === dragSrc) continue;
            if (world.x >= n.x && world.x <= n.x + n.width && world.y >= n.y && world.y <= n.y + n.height) {
              hoverNodeId = n.id;
            }
          }
          setConnectHoverTarget(hoverNodeId);
        }
      }
      // Marquee
      if (isMarquee.current) {
        const stage = stageRef.current;
        if (!stage) return;
        const rect = stage.container().getBoundingClientRect();
        const sx = e.evt.clientX - rect.left;
        const sy = e.evt.clientY - rect.top;
        const vp = viewportRef.current;
        const world = { x: (sx - vp.x) / vp.scale, y: (sy - vp.y) / vp.scale };
        setMarquee((prev) => {
          if (!prev) return null;
          const next = { ...prev, endX: world.x, endY: world.y };
          marqueeRef.current = next;
          return next;
        });
      }
    },
    [dispatch]
  );

  const handleMouseUp = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      isPanning.current = false;

      // Lasso selection: finish and select
      if (isLasso.current && lassoPoints.current.length > 2) {
        isLasso.current = false;
        const pts = lassoPoints.current;
        const s = stateRef.current;
        const hitIds: string[] = [];
        for (const n of s.nodes) {
          const cx = n.x + n.width / 2;
          const cy = n.y + n.height / 2;
          if (pointInPolygon(cx, cy, pts)) hitIds.push(n.id);
        }
        if (e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey) {
          const merged = new Set(s.selectedNodeIds);
          for (const id of hitIds) merged.add(id);
          dispatch({ type: "SELECT_NODES", ids: [...merged] });
        } else {
          dispatch({ type: "SELECT_NODES", ids: hitIds });
        }
        lassoPoints.current = [];
        setLassoPath([]);
        justFinishedMarquee.current = true;
        return;
      }
      isLasso.current = false;
      lassoPoints.current = [];
      setLassoPath([]);

      // Drawing mode: finish and create node
      if (isDrawing.current && drawPoints.current.length > 1) {
        isDrawing.current = false;
        setDrawingActive(false);
        const pts = drawPoints.current;
        const simplified = rdpSimplify(pts, 1.5);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of pts) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
        const pad = 4;
        minX -= pad; minY -= pad; maxX += pad; maxY += pad;
        const w = maxX - minX;
        const h = maxY - minY;
        const pathData = smoothPathToSVG(simplified, minX, minY);
        dispatch({
          type: "ADD_NODE",
          node: {
            id: crypto.randomUUID(),
            type: "drawing",
            src: "",
            x: minX,
            y: minY,
            width: Math.max(w, 1),
            height: Math.max(h, 1),
            naturalWidth: Math.max(w, 1),
            naturalHeight: Math.max(h, 1),
            zIndex: 0,
            pathData,
            strokeWidth: drawWidth,
            strokeColor: drawColor,
          },
        });
        drawPoints.current = [];
        return;
      }
      isDrawing.current = false;
      setDrawingActive(false);
      drawPoints.current = [];

      // Drag-to-connect: if we dragged after clicking source, hit-test at release point
      if (connectDragSource.current && connectDragMoved.current && stateRef.current.editMode === "connect") {
        const stage = stageRef.current;
        if (stage) {
          const rect = stage.container().getBoundingClientRect();
          const sx = e.evt.clientX - rect.left;
          const sy = e.evt.clientY - rect.top;
          const vp = viewportRef.current;
          const world = { x: (sx - vp.x) / vp.scale, y: (sy - vp.y) / vp.scale };
          let targetNodeId: string | null = null;
          for (const n of stateRef.current.nodes) {
            if (n.id === connectDragSource.current) continue;
            if (world.x >= n.x && world.x <= n.x + n.width && world.y >= n.y && world.y <= n.y + n.height) {
              targetNodeId = n.id;
            }
          }
          if (targetNodeId) {
            dispatch({
              type: "ADD_CONNECTOR",
              connector: {
                id: crypto.randomUUID(),
                fromNodeId: connectDragSource.current,
                toNodeId: targetNodeId,
                arrowEnd: true,
              },
            });
            connectDragSource.current = null;
            connectDragMoved.current = false;
            setConnectFrom(null);
            setConnectPreview(null);
            setConnectHoverTarget(null);
            justFinishedMarquee.current = true;
            return;
          }
        }
        connectDragMoved.current = false;
        setConnectHoverTarget(null);
      }

      // Finish marquee selection
      const currentMarquee = marqueeRef.current;
      if (isMarquee.current && currentMarquee) {
        isMarquee.current = false;
        const state = stateRef.current;
        const minX = Math.min(currentMarquee.startX, currentMarquee.endX);
        const minY = Math.min(currentMarquee.startY, currentMarquee.endY);
        const maxX = Math.max(currentMarquee.startX, currentMarquee.endX);
        const maxY = Math.max(currentMarquee.startY, currentMarquee.endY);
        const marqW = maxX - minX;
        const marqH = maxY - minY;

        if (marqW > 5 || marqH > 5) {
          const intersecting = state.nodes.filter((n) =>
            n.x < maxX && n.x + n.width > minX &&
            n.y < maxY && n.y + n.height > minY
          );
          if (e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey) {
            const merged = new Set(state.selectedNodeIds);
            for (const n of intersecting) merged.add(n.id);
            dispatch({ type: "SELECT_NODES", ids: [...merged] });
          } else {
            dispatch({ type: "SELECT_NODES", ids: intersecting.map((n) => n.id) });
          }
          justFinishedMarquee.current = true;
        } else {
          dispatch({ type: "SELECT_NODE", id: null });
        }
        marqueeRef.current = null;
        setMarquee(null);
        return;
      }
    },
    [dispatch, drawColor, drawWidth]
  );

  // Deselect on clicking empty canvas
  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (justFinishedMarquee.current) {
        justFinishedMarquee.current = false;
        return;
      }
      if (e.target === stageRef.current && !isMarquee.current) {
        if (connectFrom) {
          setConnectFrom(null);
          setConnectPreview(null);
          return;
        }
        onConnectorSelect?.(null);
        dispatch({ type: "SELECT_NODE", id: null });
      }
    },
    [dispatch, connectFrom, onConnectorSelect]
  );

  // Node select (with connect mode logic)
  const handleNodeSelect = useCallback(
    (nodeId: string, additive: boolean) => {
      const s = stateRef.current;
      if (s.editMode === "connect") {
        if (!connectFrom) {
          setConnectFrom(nodeId);
          connectDragSource.current = nodeId;
          connectDragMoved.current = false;
        } else if (nodeId !== connectFrom) {
          dispatch({
            type: "ADD_CONNECTOR",
            connector: {
              id: crypto.randomUUID(),
              fromNodeId: connectFrom,
              toNodeId: nodeId,
              arrowEnd: true,
            },
          });
          setConnectFrom(null);
          setConnectPreview(null);
          setConnectHoverTarget(null);
          connectDragSource.current = null;
        }
        return;
      }
      onConnectorSelect?.(null);
      dispatch({ type: "SELECT_NODE", id: nodeId, additive });
    },
    [dispatch, connectFrom, onConnectorSelect]
  );

  const handleNodeContextMenu = useCallback(
    (nodeId: string, e: Konva.KonvaEventObject<MouseEvent>) => {
      e.evt.preventDefault();
      dispatch({ type: "SELECT_NODE", id: nodeId });
    },
    [dispatch]
  );

  const handleConnectorSelect = useCallback(
    (connId: string) => {
      dispatch({ type: "SELECT_NODE", id: null });
      onConnectorSelect?.(selectedConnectorId === connId ? null : connId);
    },
    [dispatch, onConnectorSelect, selectedConnectorId]
  );

  return {
    isPanning,
    isMarquee,
    marquee,
    connectFrom,
    connectPreview,
    connectHoverTarget,
    drawingActive,
    liveDrawLineRef,
    lassoPath,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleStageClick,
    handleNodeSelect,
    handleNodeContextMenu,
    handleConnectorSelect,
  };
}

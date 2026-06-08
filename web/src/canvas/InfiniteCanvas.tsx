import React, { useRef, useCallback, useEffect, useMemo } from "react";
import { Stage, Layer, Rect, Transformer, Shape, Arrow, Line } from "react-konva";
import KonvaLib from "konva";
import type Konva from "konva";

// Only allow left-click to initiate Konva drags (default is [0, 1] which includes middle-click)
KonvaLib.dragButtons = [0];
import { useCanvas } from "./CanvasProvider";
import { ImageNode } from "./ImageNode";
import { TextNode } from "./TextNode";
import { FrameNode } from "./FrameNode";
import { ShapeNode } from "./ShapeNode";
import { DrawingNode } from "./DrawingNode";
import { computeEdgePoint } from "./connectorUtils";
import type { SnapGuide } from "./snapGuides";

import { MemoizedConnector } from "./infinite/MemoizedConnector";
import { useGridSceneFunc, useDropTargetSceneFunc, useSnapGuideSceneFunc } from "./infinite/sceneFunctions";
import { useCanvasDrag } from "./infinite/useCanvasDrag";
import { useSpaceKey, useCanvasInteractions } from "./infinite/useCanvasInteractions";
import type { Props } from "./infinite/types";

export function InfiniteCanvas({ width, height, apiBaseUrl, locked = false, onContextMenu, onNodeDblClick, editingNodeId, onDragDelta, onStageRef, drawColor = "#1e293b", drawWidth = 3, onConnectorSelect, selectedConnectorId }: Props) {
  const { state, dispatch } = useCanvas();
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);

  // Track which frame a dragged node is hovering over (for drop-target highlight)
  const dropTargetRectRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const dropHighlightLayerRef = useRef<Konva.Layer>(null);
  // Active snap guide lines during drag
  const snapGuidesRef = useRef<SnapGuide[]>([]);
  const snapLayerRef = useRef<Konva.Layer>(null);

  // Ref to avoid stale closure in panning handler
  const viewportRef = useRef(state.viewport);
  viewportRef.current = state.viewport;
  // Ref to avoid stale closures in drag/select callbacks
  const stateRef = useRef(state);
  stateRef.current = state;
  // Store group refs for shared Transformer
  const groupRefs = useRef<Map<string, Konva.Group>>(new Map());

  // Expose stage ref to parent
  useEffect(() => {
    onStageRef?.(stageRef.current);
    return () => onStageRef?.(null);
  }, [onStageRef]);

  // Space-to-pan keyboard hook
  const spaceHeld = useSpaceKey();

  // Attach shared Transformer to selected nodes.
  const lockedNodeIds = useMemo(() => {
    const set = new Set<string>();
    for (const n of state.nodes) {
      if (n.locked) set.add(n.id);
    }
    return set;
  }, [state.nodes]);

  useEffect(() => {
    if (!trRef.current) return;
    const selectedGroups: Konva.Group[] = [];
    for (const id of state.selectedNodeIds) {
      if (lockedNodeIds.has(id)) continue;
      const g = groupRefs.current.get(id);
      if (g) selectedGroups.push(g);
    }
    trRef.current.nodes(selectedGroups);
    trRef.current.getLayer()?.batchDraw();
  }, [state.selectedNodeIds, lockedNodeIds]);

  // Group ref registration callback
  const handleGroupRef = useCallback((id: string, ref: Konva.Group | null) => {
    if (ref) {
      groupRefs.current.set(id, ref);
    } else {
      groupRefs.current.delete(id);
    }
  }, []);

  // Convert screen coordinates to world coordinates
  const screenToWorld = useCallback(
    (sx: number, sy: number) => ({
      x: (sx - state.viewport.x) / state.viewport.scale,
      y: (sy - state.viewport.y) / state.viewport.scale,
    }),
    [state.viewport]
  );

  // ─── Drag handlers ───
  const { handleNodeDragStart, handleNodeDragMove, handleNodeDragEnd } = useCanvasDrag(
    stateRef,
    groupRefs,
    dispatch,
    onDragDelta,
    dropTargetRectRef,
    dropHighlightLayerRef,
    snapGuidesRef,
    snapLayerRef,
  );

  // ─── Mouse / keyboard interaction handlers ───
  const {
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
    handleNodeContextMenu: handleNodeContextMenuBase,
    handleConnectorSelect,
  } = useCanvasInteractions(
    stateRef,
    viewportRef,
    stageRef,
    dispatch,
    locked,
    spaceHeld,
    screenToWorld,
    drawColor,
    drawWidth,
    onConnectorSelect,
    selectedConnectorId,
  );

  // Wrap handleNodeContextMenu to also call the onContextMenu prop
  const handleNodeContextMenu = useCallback(
    (nodeId: string, e: Konva.KonvaEventObject<MouseEvent>) => {
      handleNodeContextMenuBase(nodeId, e);
      onContextMenu?.({ nodeId, x: e.evt.clientX, y: e.evt.clientY });
    },
    [handleNodeContextMenuBase, onContextMenu]
  );

  // Live transform — bake scale into width/height during drag for text nodes
  const handleTransform = useCallback(() => {
    const tr = trRef.current;
    if (!tr) return;
    for (const group of tr.nodes()) {
      const nodeId = [...groupRefs.current.entries()].find(([, g]) => g === group)?.[0];
      if (!nodeId) continue;
      const canvasNode = state.nodes.find((n) => n.id === nodeId);
      if (!canvasNode || (canvasNode.type !== "text" && canvasNode.type !== "frame")) continue;
      const scaleX = group.scaleX();
      const scaleY = group.scaleY();
      group.scaleX(1);
      group.scaleY(1);
      dispatch({
        type: "UPDATE_NODE",
        id: nodeId,
        updates: {
          width: Math.max(10, canvasNode.width * scaleX),
          height: Math.max(10, canvasNode.height * scaleY),
          x: group.x(),
          y: group.y(),
        },
      });
    }
  }, [state.nodes, dispatch]);

  // Transformer resize end
  const handleTransformEnd = useCallback(() => {
    const tr = trRef.current;
    if (!tr) return;
    const nodes = tr.nodes();
    for (const group of nodes) {
      const scaleX = group.scaleX();
      const scaleY = group.scaleY();
      const nodeId = [...groupRefs.current.entries()].find(([, g]) => g === group)?.[0];
      if (!nodeId) continue;
      const canvasNode = state.nodes.find((n) => n.id === nodeId);
      if (!canvasNode) continue;
      group.scaleX(1);
      group.scaleY(1);
      dispatch({
        type: "UPDATE_NODE",
        id: nodeId,
        updates: {
          width: Math.max(10, canvasNode.width * scaleX),
          height: Math.max(10, canvasNode.height * scaleY),
          x: group.x(),
          y: group.y(),
        },
      });
    }
  }, [state.nodes, dispatch]);

  // ─── Render ─────────────────────────────────────────────────────────────

  const { x: vx, y: vy, scale } = state.viewport;

  // Sorted nodes by zIndex (memoized).
  const sortedNodes = useMemo(
    () => [...state.nodes].sort((a, b) => {
      const aIsFrame = a.type === "frame" ? 0 : 1;
      const bIsFrame = b.type === "frame" ? 0 : 1;
      if (aIsFrame !== bIsFrame) return aIsFrame - bIsFrame;
      return a.zIndex - b.zIndex;
    }),
    [state.nodes]
  );

  // Filter out children of collapsed frames
  const collapsedFrameIds = useMemo(() => {
    const ids = new Set<string>();
    for (const n of state.nodes) {
      if (n.type === "frame" && n.collapsed) ids.add(n.id);
    }
    return ids;
  }, [state.nodes]);

  const renderableNodes = useMemo(() => {
    let nodes = sortedNodes;
    nodes = nodes.filter((n) => !n.hidden);
    if (collapsedFrameIds.size > 0) {
      nodes = nodes.filter((n) => !n.parentFrameId || !collapsedFrameIds.has(n.parentFrameId));
    }
    return nodes;
  }, [sortedNodes, collapsedFrameIds]);

  // Viewport culling
  const visibleNodes = useMemo(() => {
    const vw = width / scale;
    const vh = height / scale;
    const left = -vx / scale;
    const top = -vy / scale;
    const pad = 200;
    return renderableNodes.filter(n =>
      n.x + n.width > left - pad && n.x < left + vw + pad &&
      n.y + n.height > top - pad && n.y < top + vh + pad
    );
  }, [renderableNodes, vx, vy, scale, width, height]);

  // Node lookup map for O(1) access
  const nodeMap = useMemo(() => {
    const map = new Map<string, typeof state.nodes[0]>();
    for (const n of state.nodes) map.set(n.id, n);
    return map;
  }, [state.nodes]);

  // Detect dark mode
  const isDark = document.documentElement.classList.contains("dark");

  // Scene functions
  const gridSceneFunc = useGridSceneFunc(vx, vy, scale, width, height, isDark);
  const dropTargetSceneFunc = useDropTargetSceneFunc(dropTargetRectRef);
  const snapGuideSceneFunc = useSnapGuideSceneFunc(snapGuidesRef, vx, vy, scale, width, height);

  // Marquee rect in world coords
  const marqueeRect = marquee
    ? {
        x: Math.min(marquee.startX, marquee.endX),
        y: Math.min(marquee.startY, marquee.endY),
        width: Math.abs(marquee.endX - marquee.startX),
        height: Math.abs(marquee.endY - marquee.startY),
      }
    : null;

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      x={vx}
      y={vy}
      scaleX={scale}
      scaleY={scale}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={handleStageClick}
      style={{ cursor: spaceHeld || isPanning.current ? "grab" : isMarquee.current ? "crosshair" : "default" }}
    >
      {/* Grid dots layer */}
      <Layer listening={false}>
        <Shape sceneFunc={gridSceneFunc} />
      </Layer>

      {/* Lineage connectors layer (behind nodes) */}
      {state.showLineage && (
        <Layer listening={false}>
          {sortedNodes
            .filter((n) => n.sourceNodeId)
            .map((n) => {
              const source = nodeMap.get(n.sourceNodeId!);
              if (!source) return null;
              const srcCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
              const tgtCenter = { x: n.x + n.width / 2, y: n.y + n.height / 2 };
              const from = computeEdgePoint(source, tgtCenter.x, tgtCenter.y);
              const to = computeEdgePoint(n, srcCenter.x, srcCenter.y);
              return (
                <Arrow
                  key={`lineage-${n.id}`}
                  points={[from.x, from.y, to.x, to.y]}
                  stroke="#d97706"
                  strokeWidth={1.5 / scale}
                  opacity={0.4}
                  dash={[6 / scale, 4 / scale]}
                  pointerLength={8 / scale}
                  pointerWidth={6 / scale}
                  fill="#d97706"
                />
              );
            })}
        </Layer>
      )}

      {/* Connectors layer */}
      {state.connectors.length > 0 && (
        <Layer>
          {state.connectors.map((conn) => {
            const fromNode = nodeMap.get(conn.fromNodeId);
            const toNode = nodeMap.get(conn.toNodeId);
            if (!fromNode || !toNode) return null;
            return (
              <MemoizedConnector
                key={`conn-${conn.id}`}
                conn={conn}
                fromNode={fromNode}
                toNode={toNode}
                scale={scale}
                isSelected={selectedConnectorId === conn.id}
                onSelect={handleConnectorSelect}
              />
            );
          })}
        </Layer>
      )}

      {/* Connect-mode preview line + hover target highlight */}
      {connectFrom && connectPreview && (
        <Layer listening={false}>
          {(() => {
            const fromNode = nodeMap.get(connectFrom);
            if (!fromNode) return null;
            const from = computeEdgePoint(fromNode, connectPreview.x, connectPreview.y);
            return (
              <Arrow
                points={[from.x, from.y, connectPreview.x, connectPreview.y]}
                stroke="#71717a"
                strokeWidth={2 / scale}
                dash={[6 / scale, 4 / scale]}
                pointerLength={10 / scale}
                pointerWidth={8 / scale}
                fill="#71717a"
                opacity={0.6}
              />
            );
          })()}
          {connectHoverTarget && (() => {
            const targetNode = nodeMap.get(connectHoverTarget);
            if (!targetNode) return null;
            return (
              <Rect
                x={targetNode.x - 3}
                y={targetNode.y - 3}
                width={targetNode.width + 6}
                height={targetNode.height + 6}
                stroke="#52525b"
                strokeWidth={2 / scale}
                dash={[6 / scale, 4 / scale]}
                cornerRadius={4}
              />
            );
          })()}
        </Layer>
      )}

      {/* Nodes layer + shared Transformer */}
      <Layer>
        {visibleNodes.map((node) => {
          const commonProps = {
            node,
            isSelected: state.selectedNodeIds.has(node.id),
            editMode: state.editMode,
            panActive: spaceHeld,
            onSelect: handleNodeSelect,
            onDragStart: handleNodeDragStart,
            onDragMove: handleNodeDragMove,
            onDragEnd: handleNodeDragEnd,
            onContextMenu: handleNodeContextMenu,
            onGroupRef: handleGroupRef,
            onDblClick: onNodeDblClick,
          };

          if (node.type === "text") {
            return <TextNode key={node.id} {...commonProps} isEditing={editingNodeId === node.id} />;
          }
          if (node.type === "frame") {
            return <FrameNode key={node.id} {...commonProps} isDark={isDark} onToggleCollapse={(id) => dispatch({ type: "TOGGLE_FRAME_COLLAPSE", id })} />;
          }
          if (node.type === "shape") {
            return <ShapeNode key={node.id} {...commonProps} />;
          }
          if (node.type === "drawing") {
            return <DrawingNode key={node.id} {...commonProps} />;
          }
          return (
            <ImageNode
              key={node.id}
              {...commonProps}
              apiBaseUrl={apiBaseUrl}
            />
          );
        })}

        {/* Shared Transformer for all selected nodes */}
        {state.selectedNodeIds.size > 0 && state.editMode === "select" && (
          <Transformer
            ref={trRef}
            rotateEnabled={false}
            borderStroke="#52525b"
            borderStrokeWidth={1}
            anchorStroke="#52525b"
            anchorFill="#ffffff"
            anchorSize={8}
            anchorCornerRadius={2}
            keepRatio={true}
            onTransform={handleTransform}
            onTransformEnd={handleTransformEnd}
            boundBoxFunc={(_oldBox, newBox) => {
              if (newBox.width < 10 || newBox.height < 10) return _oldBox;
              return newBox;
            }}
          />
        )}
      </Layer>

      {/* Drop-target highlight */}
      <Layer ref={dropHighlightLayerRef} listening={false}>
        <Shape sceneFunc={dropTargetSceneFunc} />
      </Layer>

      {/* Snap guide lines */}
      <Layer ref={snapLayerRef} listening={false}>
        <Shape sceneFunc={snapGuideSceneFunc} />
      </Layer>

      {/* Lasso selection overlay */}
      {lassoPath.length > 2 && (
        <Layer listening={false}>
          <Line
            points={lassoPath.flatMap((p) => [p.x, p.y])}
            stroke="#52525b"
            strokeWidth={1.5 / scale}
            dash={[4 / scale, 4 / scale]}
            closed
            fill="rgba(59, 130, 246, 0.06)"
          />
        </Layer>
      )}

      {/* Live freehand drawing preview */}
      {drawingActive && (
        <Layer listening={false}>
          <Line
            ref={liveDrawLineRef}
            points={[]}
            stroke={drawColor}
            strokeWidth={drawWidth}
            lineCap="round"
            lineJoin="round"
            tension={0.3}
          />
        </Layer>
      )}

      {/* Marquee selection overlay */}
      {marqueeRect && (
        <Layer listening={false}>
          <Rect
            x={marqueeRect.x}
            y={marqueeRect.y}
            width={marqueeRect.width}
            height={marqueeRect.height}
            fill="rgba(59, 130, 246, 0.08)"
            stroke="#52525b"
            strokeWidth={1 / scale}
            dash={[4 / scale, 4 / scale]}
          />
        </Layer>
      )}
    </Stage>
  );
}

import { memo, useRef, useEffect, useCallback } from "react";
import { Group, Path, Rect, Text } from "react-konva";
import { KonvaLockIcon } from "./KonvaLockIcon";
import type Konva from "konva";
import type { CanvasNode, CanvasEditMode } from "./types";

type Props = {
  node: CanvasNode;
  isSelected: boolean;
  editMode: CanvasEditMode;
  panActive?: boolean;
  onSelect: (nodeId: string, additive: boolean) => void;
  onDragStart: (nodeId: string) => void;
  onDragMove: (nodeId: string, dx: number, dy: number) => void;
  onDragEnd: (nodeId: string, dx: number, dy: number) => void;
  onContextMenu: (nodeId: string, e: Konva.KonvaEventObject<MouseEvent>) => void;
  onGroupRef?: (id: string, ref: Konva.Group | null) => void;
  onDblClick?: (nodeId: string) => void;
};

export const DrawingNode = memo(function DrawingNode({
  node, isSelected, editMode, panActive,
  onSelect, onDragStart, onDragMove, onDragEnd,
  onContextMenu, onGroupRef, onDblClick,
}: Props) {
  const groupRef = useRef<Konva.Group>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    onGroupRef?.(node.id, groupRef.current);
    return () => onGroupRef?.(node.id, null);
  }, [node.id, onGroupRef]);

  const handleClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.evt.button !== 0 || panActive) return;
      onSelect(node.id, e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey);
    },
    [node.id, onSelect, panActive]
  );

  const handleContextMenu = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      onContextMenu(node.id, e);
    },
    [node.id, onContextMenu]
  );

  const handleDragStart = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      dragStartPos.current = { x: e.evt.clientX, y: e.evt.clientY };
      onDragStart(node.id);
    },
    [node.id, onDragStart]
  );

  const handleDragMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      if (!dragStartPos.current) return;
      const scale = e.target.getStage()!.scaleX();
      const dx = (e.evt.clientX - dragStartPos.current.x) / scale;
      const dy = (e.evt.clientY - dragStartPos.current.y) / scale;
      e.target.position({ x: node.x, y: node.y });
      onDragMove(node.id, dx, dy);
    },
    [node.id, node.x, node.y, onDragMove]
  );

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      if (!dragStartPos.current) { onDragEnd(node.id, 0, 0); return; }
      const scale = e.target.getStage()!.scaleX();
      const dx = (e.evt.clientX - dragStartPos.current.x) / scale;
      const dy = (e.evt.clientY - dragStartPos.current.y) / scale;
      dragStartPos.current = null;
      onDragEnd(node.id, dx, dy);
    },
    [node.id, onDragEnd]
  );

  const draggable = editMode === "select" && !node.locked && !panActive;

  return (
    <Group
      ref={groupRef}
      x={node.x}
      y={node.y}
      width={node.width}
      height={node.height}
      draggable={draggable}
      onClick={handleClick}
      onTap={handleClick}
      onDblClick={() => onDblClick?.(node.id)}
      onDblTap={() => onDblClick?.(node.id)}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onContextMenu={handleContextMenu}
    >
      {/* Invisible hit area */}
      <Rect width={node.width} height={node.height} fill="transparent" />

      {node.pathData && (
        <Path
          data={node.pathData}
          stroke={node.strokeColor ?? "#1e293b"}
          strokeWidth={node.strokeWidth ?? 3}
          lineCap="round"
          lineJoin="round"
          listening={false}
        />
      )}

      {/* Selection border */}
      {isSelected && (
        <Rect
          width={node.width}
          height={node.height}
          stroke="#3b82f6"
          strokeWidth={2}
          dash={[4, 4]}
          listening={false}
        />
      )}

      {node.locked && <KonvaLockIcon x={4} y={4} size={12} />}
    </Group>
  );
});

import { memo, useRef, useEffect, useCallback } from "react";
import { Group, Rect, Circle, Line, Text, RegularPolygon } from "react-konva";
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

const DEFAULT_FILL = "#e4e4e7"; // zinc-200
const DEFAULT_STROKE = "#71717a"; // zinc-500

export const ShapeNode = memo(function ShapeNode({
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
  const fill = node.fillColor ?? DEFAULT_FILL;
  const stroke = node.strokeColor ?? DEFAULT_STROKE;
  const kind = node.shapeKind ?? "rect";
  const w = node.width;
  const h = node.height;

  const renderShape = () => {
    switch (kind) {
      case "circle":
        return (
          <Circle
            x={w / 2}
            y={h / 2}
            radiusX={w / 2}
            radiusY={h / 2}
            fill={fill}
            stroke={stroke}
            strokeWidth={2}
          />
        );
      case "diamond":
        return (
          <Line
            points={[w / 2, 0, w, h / 2, w / 2, h, 0, h / 2]}
            closed
            fill={fill}
            stroke={stroke}
            strokeWidth={2}
          />
        );
      case "triangle":
        return (
          <Line
            points={[w / 2, 0, w, h, 0, h]}
            closed
            fill={fill}
            stroke={stroke}
            strokeWidth={2}
          />
        );
      case "rect":
      default:
        return (
          <Rect
            width={w}
            height={h}
            cornerRadius={6}
            fill={fill}
            stroke={stroke}
            strokeWidth={2}
          />
        );
    }
  };

  return (
    <Group
      ref={groupRef}
      x={node.x}
      y={node.y}
      width={w}
      height={h}
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
      {renderShape()}

      {/* Optional label */}
      {node.text && (
        <Text
          x={0}
          y={h / 2 - 7}
          width={w}
          text={node.text}
          fontSize={14}
          fontFamily="Azeret Mono"
          fill={stroke}
          align="center"
          listening={false}
        />
      )}

      {/* Selection border */}
      {isSelected && (
        <Rect
          width={w}
          height={h}
          stroke="#3b82f6"
          strokeWidth={2}
          listening={false}
        />
      )}

      {/* Lock icon */}
      {node.locked && <KonvaLockIcon x={4} y={4} size={12} />}
    </Group>
  );
});

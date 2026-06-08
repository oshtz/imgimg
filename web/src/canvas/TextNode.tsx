import { memo, useRef, useEffect, useCallback } from "react";
import { Group, Rect, Text } from "react-konva";
import { KonvaLockIcon } from "./KonvaLockIcon";
import type Konva from "konva";
import type { CanvasNode, CanvasEditMode, StickyColor } from "./types";

export const STICKY_COLORS: Record<StickyColor, { bg: string; text: string; darkBg: string }> = {
  yellow: { bg: "#f4f4f5", text: "#3f3f46", darkBg: "#d4d4d8" },
  green:  { bg: "#e4e4e7", text: "#27272a", darkBg: "#a1a1aa" },
  blue:   { bg: "#e4e4e7", text: "#27272a", darkBg: "#a1a1aa" },
  pink:   { bg: "#f4f4f5", text: "#3f3f46", darkBg: "#d4d4d8" },
  orange: { bg: "#f4f4f5", text: "#3f3f46", darkBg: "#d4d4d8" },
  purple: { bg: "#e4e4e7", text: "#27272a", darkBg: "#a1a1aa" },
};

const CORNER_RADIUS = 6;
const PADDING = 16;
const TITLE_FONT_SIZE = 14;
const SHADOW_BLUR = 8;
const SHADOW_OPACITY = 0.15;

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
  /** When true, the node is being edited via an HTML overlay — hide the Konva text to avoid doubling */
  isEditing?: boolean;
};

export const TextNode = memo(function TextNode({
  node, isSelected, editMode, panActive,
  onSelect, onDragStart, onDragMove, onDragEnd,
  onContextMenu, onGroupRef, onDblClick, isEditing,
}: Props) {
  const groupRef = useRef<Konva.Group>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);

  // Register group ref
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
  const color = node.stickyColor ?? "yellow";
  const colors = STICKY_COLORS[color];
  const text = node.text || "";

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
      {/* Shadow */}
      <Rect
        width={node.width}
        height={node.height}
        cornerRadius={CORNER_RADIUS}
        shadowColor="#000"
        shadowBlur={SHADOW_BLUR}
        shadowOpacity={SHADOW_OPACITY}
        shadowOffsetY={2}
        fill={colors.bg}
      />

      {/* Colored header strip */}
      <Rect
        width={node.width}
        height={8}
        cornerRadius={[CORNER_RADIUS, CORNER_RADIUS, 0, 0]}
        fill={colors.darkBg}
        opacity={0.6}
      />

      {/* Text content — hidden while the HTML textarea overlay is active */}
      <Text
        x={PADDING}
        y={PADDING + 4}
        width={node.width - PADDING * 2}
        height={node.height - PADDING * 2 - 4}
        text={text}
        fontSize={TITLE_FONT_SIZE}
        fontFamily="Azeret Mono"
        fill={colors.text}
        wrap="word"
        ellipsis={true}
        opacity={isEditing ? 0 : 1}
      />

      {/* Selection border */}
      {isSelected && (
        <Rect
          width={node.width}
          height={node.height}
          cornerRadius={CORNER_RADIUS}
          stroke="#3b82f6"
          strokeWidth={2}
          listening={false}
        />
      )}
      {/* Lock icon */}
      {node.locked && <KonvaLockIcon x={4} y={node.height - 18} size={14} />}
    </Group>
  );
});

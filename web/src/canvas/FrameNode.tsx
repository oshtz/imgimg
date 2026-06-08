import { memo, useRef, useEffect, useCallback } from "react";
import { Group, Rect, Text } from "react-konva";
import { KonvaLockIcon } from "./KonvaLockIcon";
import type Konva from "konva";
import type { CanvasNode, CanvasEditMode } from "./types";

const TITLE_BAR_HEIGHT = 32;
const TITLE_FONT_SIZE = 13;
const TITLE_PADDING = 12;
const CORNER_RADIUS = 8;

const DEFAULT_FRAME_COLOR = "#f5f5f4"; // stone-100
const DARK_FRAME_COLOR = "#27272a"; // zinc-800

type Props = {
  node: CanvasNode;
  isSelected: boolean;
  editMode: CanvasEditMode;
  panActive?: boolean;
  isDark: boolean;
  onSelect: (nodeId: string, additive: boolean) => void;
  onDragStart: (nodeId: string) => void;
  onDragMove: (nodeId: string, dx: number, dy: number) => void;
  onDragEnd: (nodeId: string, dx: number, dy: number) => void;
  onContextMenu: (nodeId: string, e: Konva.KonvaEventObject<MouseEvent>) => void;
  onGroupRef?: (id: string, ref: Konva.Group | null) => void;
  onDblClick?: (nodeId: string) => void;
  onToggleCollapse?: (nodeId: string) => void;
};

export const FrameNode = memo(function FrameNode({
  node, isSelected, editMode, panActive, isDark,
  onSelect, onDragStart, onDragMove, onDragEnd,
  onContextMenu, onGroupRef, onDblClick, onToggleCollapse,
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
  const frameColor = node.frameColor ?? (isDark ? DARK_FRAME_COLOR : DEFAULT_FRAME_COLOR);
  const title = node.title || "Frame";
  const titleColor = isDark ? "#a1a1aa" : "#71717a"; // zinc-400 / zinc-500
  const borderColor = isDark ? "#3f3f46" : "#d4d4d8"; // zinc-700 / zinc-300

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
      {/* Frame background */}
      <Rect
        width={node.width}
        height={node.height}
        cornerRadius={CORNER_RADIUS}
        fill={frameColor}
        opacity={0.5}
        stroke={borderColor}
        strokeWidth={1}
      />

      {/* Title bar */}
      <Rect
        width={node.width}
        height={TITLE_BAR_HEIGHT}
        cornerRadius={[CORNER_RADIUS, CORNER_RADIUS, 0, 0]}
        fill={frameColor}
        opacity={0.8}
      />

      {/* Collapse/expand chevron */}
      <Text
        x={TITLE_PADDING - 2}
        y={(TITLE_BAR_HEIGHT - TITLE_FONT_SIZE) / 2 - 1}
        text={node.collapsed ? "▸" : "▾"}
        fontSize={TITLE_FONT_SIZE}
        fontFamily="Azeret Mono"
        fontStyle="bold"
        fill={titleColor}
        onClick={(e) => {
          e.cancelBubble = true;
          onToggleCollapse?.(node.id);
        }}
      />

      {/* Title text */}
      <Text
        x={TITLE_PADDING + 14}
        y={(TITLE_BAR_HEIGHT - TITLE_FONT_SIZE) / 2}
        width={node.width - TITLE_PADDING * 2 - 14}
        text={title}
        fontSize={TITLE_FONT_SIZE}
        fontFamily="Azeret Mono"
        fontStyle="bold"
        fill={titleColor}
        ellipsis={true}
        wrap="none"
      />

      {/* Divider line under title */}
      <Rect
        y={TITLE_BAR_HEIGHT}
        width={node.width}
        height={1}
        fill={borderColor}
        opacity={0.5}
      />

      {/* Selection border */}
      {isSelected && (
        <Rect
          width={node.width}
          height={node.height}
          cornerRadius={CORNER_RADIUS}
          stroke="#3b82f6"
          strokeWidth={2}
          dash={[6, 3]}
          listening={false}
        />
      )}

      {/* Lock icon */}
      {node.locked && (
        <KonvaLockIcon
          x={node.width - TITLE_PADDING - 14}
          y={(TITLE_BAR_HEIGHT - 14) / 2}
          size={14}
        />
      )}

    </Group>
  );
});

import React, { useCallback } from "react";
import { Arrow, Line } from "react-konva";
import type Konva from "konva";
import { computeEdgePoint } from "../connectorUtils";
import type { CanvasConnector, CanvasNode } from "../types";

export type ConnectorProps = {
  conn: CanvasConnector;
  fromNode: CanvasNode;
  toNode: CanvasNode;
  scale: number;
  isSelected: boolean;
  onSelect: (connId: string) => void;
};

export const MemoizedConnector = React.memo(function MemoizedConnector({
  conn, fromNode, toNode, scale, isSelected, onSelect,
}: ConnectorProps) {
  const fromCenter = { x: fromNode.x + fromNode.width / 2, y: fromNode.y + fromNode.height / 2 };
  const toCenter = { x: toNode.x + toNode.width / 2, y: toNode.y + toNode.height / 2 };
  const from = computeEdgePoint(fromNode, toCenter.x, toCenter.y);
  const to = computeEdgePoint(toNode, fromCenter.x, fromCenter.y);
  const color = isSelected ? "#52525b" : (conn.color ?? "#71717a");
  const sw = isSelected ? 3 / scale : 2 / scale;

  const handleClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    onSelect(conn.id);
  }, [conn.id, onSelect]);

  return (
    <>
      {/* Invisible wider hit area for click detection */}
      <Line
        points={[from.x, from.y, to.x, to.y]}
        stroke="transparent"
        strokeWidth={14 / scale}
        hitStrokeWidth={14 / scale}
        onClick={handleClick}
      />
      <Arrow
        points={[from.x, from.y, to.x, to.y]}
        stroke={color}
        strokeWidth={sw}
        pointerLength={conn.arrowEnd !== false ? 10 / scale : 0}
        pointerWidth={conn.arrowEnd !== false ? 8 / scale : 0}
        fill={color}
        listening={false}
      />
    </>
  );
}, (prev, next) =>
  prev.fromNode.x === next.fromNode.x
  && prev.fromNode.y === next.fromNode.y
  && prev.fromNode.width === next.fromNode.width
  && prev.fromNode.height === next.fromNode.height
  && prev.toNode.x === next.toNode.x
  && prev.toNode.y === next.toNode.y
  && prev.toNode.width === next.toNode.width
  && prev.toNode.height === next.toNode.height
  && prev.scale === next.scale
  && prev.isSelected === next.isSelected
  && prev.conn.color === next.conn.color
  && prev.conn.arrowEnd === next.conn.arrowEnd
);

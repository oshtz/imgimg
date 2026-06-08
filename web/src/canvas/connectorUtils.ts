/**
 * Connector utilities: edge-intersection computation for arrows.
 */

type NodeRect = { x: number; y: number; width: number; height: number };

/**
 * Compute the point where a line from `node` center toward (targetX, targetY)
 * intersects the node's bounding rectangle. Adds `padding` pixels outward
 * so arrowheads don't overlap the node border.
 */
export function computeEdgePoint(
  node: NodeRect,
  targetX: number,
  targetY: number,
  padding = 4,
): { x: number; y: number } {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const dx = targetX - cx;
  const dy = targetY - cy;

  // If target is at the center, just return center
  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const halfW = node.width / 2 + padding;
  const halfH = node.height / 2 + padding;

  // Find the smallest positive t such that the line hits the rect boundary
  const tx = dx !== 0 ? halfW / Math.abs(dx) : Infinity;
  const ty = dy !== 0 ? halfH / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);

  return {
    x: cx + dx * t,
    y: cy + dy * t,
  };
}

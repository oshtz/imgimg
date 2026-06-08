import { describe, it, expect } from "vitest";
import { computeEdgePoint } from "../connectorUtils";

describe("computeEdgePoint", () => {
  const node = { x: 0, y: 0, width: 200, height: 100 };
  // center = (100, 50)

  it("returns intersection on right edge when target is to the right", () => {
    const result = computeEdgePoint(node, 500, 50);
    // dx=400, dy=0 => tx = (100+4)/400 = 0.26, ty = Infinity => t=0.26
    // x = 100 + 400*0.26 = 204, y = 50
    expect(result.x).toBe(100 + (100 + 4)); // 204
    expect(result.y).toBe(50);
  });

  it("returns intersection on left edge when target is to the left", () => {
    const result = computeEdgePoint(node, -500, 50);
    // dx=-600, dy=0 => tx = 104/600 = ~0.1733, ty = Infinity
    // x = 100 + (-600)*0.1733 = 100-104 = -4
    expect(result.x).toBeCloseTo(-4, 5);
    expect(result.y).toBeCloseTo(50, 5);
  });

  it("returns intersection on top edge when target is above", () => {
    const result = computeEdgePoint(node, 100, -500);
    // dx=0, dy=-550 => tx=Infinity, ty=(50+4)/550
    // y = 50 + (-550)*(54/550) = 50-54 = -4
    expect(result.x).toBe(100);
    expect(result.y).toBeCloseTo(-4, 5);
  });

  it("returns intersection on bottom edge when target is below", () => {
    const result = computeEdgePoint(node, 100, 500);
    // dx=0, dy=450 => tx=Infinity, ty=54/450
    // y = 50 + 450*(54/450) = 50+54 = 104
    expect(result.x).toBe(100);
    expect(result.y).toBeCloseTo(104, 5);
  });

  it("returns center when target is at center", () => {
    const result = computeEdgePoint(node, 100, 50);
    expect(result).toEqual({ x: 100, y: 50 });
  });

  it("returns correct intersection for diagonal target", () => {
    // Target at (300, 150): dx=200, dy=100
    // tx = 104/200 = 0.52, ty = 54/100 = 0.54 => t = 0.52 (hits right first)
    const result = computeEdgePoint(node, 300, 150);
    expect(result.x).toBeCloseTo(100 + 200 * 0.52, 5);
    expect(result.y).toBeCloseTo(50 + 100 * 0.52, 5);
  });

  it("uses custom padding to expand the rectangle", () => {
    const result = computeEdgePoint(node, 500, 50, 20);
    // halfW = 100+20 = 120, dx=400 => tx=120/400=0.3
    // x = 100 + 400*0.3 = 220
    expect(result.x).toBe(220);
    expect(result.y).toBe(50);
  });

  it("uses zero padding when specified", () => {
    const result = computeEdgePoint(node, 500, 50, 0);
    // halfW = 100+0 = 100, dx=400 => tx=100/400=0.25
    // x = 100 + 400*0.25 = 200 (exact right edge)
    expect(result.x).toBe(200);
    expect(result.y).toBe(50);
  });
});

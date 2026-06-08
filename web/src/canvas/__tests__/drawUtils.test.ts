import { describe, it, expect } from "vitest";
import { rdpSimplify, smoothPathToSVG } from "../drawUtils";

describe("rdpSimplify", () => {
  it("returns empty array as-is", () => {
    expect(rdpSimplify([], 1)).toEqual([]);
  });

  it("returns single point as-is", () => {
    const pts = [{ x: 5, y: 10 }];
    expect(rdpSimplify(pts, 1)).toEqual(pts);
  });

  it("returns two points as-is", () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
    expect(rdpSimplify(pts, 1)).toEqual(pts);
  });

  it("simplifies collinear points to endpoints", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
      { x: 4, y: 4 },
    ];
    const result = rdpSimplify(pts, 0.1);
    expect(result).toEqual([{ x: 0, y: 0 }, { x: 4, y: 4 }]);
  });

  it("preserves points far from the line", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 5, y: 100 }, // far off the line
      { x: 10, y: 0 },
    ];
    const result = rdpSimplify(pts, 1);
    expect(result).toHaveLength(3);
    expect(result).toEqual(pts);
  });

  it("handles first and last being the same point (lenSq === 0)", () => {
    const pts = [
      { x: 5, y: 5 },
      { x: 10, y: 10 }, // far from the center point
      { x: 5, y: 5 },   // same as first
    ];
    const result = rdpSimplify(pts, 1);
    // Point at (10,10) is far from (5,5), should be preserved
    expect(result).toHaveLength(3);
    expect(result).toEqual(pts);
  });

  it("handles first and last same point with collinear middle points", () => {
    const pts = [
      { x: 5, y: 5 },
      { x: 5, y: 5 }, // same as first and last
      { x: 5, y: 5 }, // same as first and last
    ];
    // All points are at the same location, distance is 0
    const result = rdpSimplify(pts, 1);
    expect(result).toEqual([{ x: 5, y: 5 }, { x: 5, y: 5 }]);
  });

  it("high epsilon simplifies more aggressively", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 2, y: 3 },
      { x: 5, y: 1 },
      { x: 8, y: 4 },
      { x: 10, y: 0 },
    ];
    const looseResult = rdpSimplify(pts, 100);
    const tightResult = rdpSimplify(pts, 0.01);
    expect(looseResult.length).toBeLessThanOrEqual(tightResult.length);
  });
});

describe("smoothPathToSVG", () => {
  it("returns empty string for no points", () => {
    expect(smoothPathToSVG([], 0, 0)).toBe("");
  });

  it("returns M command for single point", () => {
    const result = smoothPathToSVG([{ x: 10, y: 20 }], 0, 0);
    expect(result).toMatch(/^M/);
    expect(result).toContain("10.0");
    expect(result).toContain("20.0");
  });

  it("returns M...L path for two points", () => {
    const result = smoothPathToSVG(
      [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      0,
      0
    );
    expect(result).toMatch(/^M/);
    expect(result).toContain("L");
  });

  it("returns cubic bezier commands for three+ points", () => {
    const result = smoothPathToSVG(
      [{ x: 0, y: 0 }, { x: 5, y: 10 }, { x: 10, y: 0 }],
      0,
      0
    );
    expect(result).toMatch(/^M/);
    expect(result).toContain("C");
  });

  it("subtracts offset correctly", () => {
    const result = smoothPathToSVG([{ x: 100, y: 200 }], 50, 75);
    expect(result).toContain("50.0");
    expect(result).toContain("125.0");
  });
});

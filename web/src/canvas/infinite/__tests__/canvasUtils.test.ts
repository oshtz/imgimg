import { describe, it, expect } from "vitest";
import {
  GRID_SPACING,
  DOT_RADIUS,
  DOT_COLOR,
  DOT_COLOR_DARK,
  pointInPolygon,
} from "../canvasUtils";

describe("constants", () => {
  it("exports GRID_SPACING as a number", () => {
    expect(typeof GRID_SPACING).toBe("number");
    expect(GRID_SPACING).toBe(40);
  });

  it("exports DOT_RADIUS as a number", () => {
    expect(typeof DOT_RADIUS).toBe("number");
    expect(DOT_RADIUS).toBe(1.5);
  });

  it("exports DOT_COLOR as a string", () => {
    expect(typeof DOT_COLOR).toBe("string");
  });

  it("exports DOT_COLOR_DARK as a string", () => {
    expect(typeof DOT_COLOR_DARK).toBe("string");
  });
});

describe("pointInPolygon", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it("returns true for point inside square", () => {
    expect(pointInPolygon(5, 5, square)).toBe(true);
  });

  it("returns false for point outside square", () => {
    expect(pointInPolygon(15, 15, square)).toBe(false);
  });

  it("does not crash for point on edge", () => {
    // Edge behavior is implementation-dependent; just verify no exception
    const result = pointInPolygon(0, 5, square);
    expect(typeof result).toBe("boolean");
  });

  it("works with triangle polygon", () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 10 },
    ];
    expect(pointInPolygon(5, 3, triangle)).toBe(true);
    expect(pointInPolygon(0, 10, triangle)).toBe(false);
  });

  it("works with concave polygon", () => {
    // L-shaped concave polygon
    const concave = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(pointInPolygon(2, 2, concave)).toBe(true);   // inside the L
    expect(pointInPolygon(8, 8, concave)).toBe(false);   // in the cutout
  });

  it("returns false for empty polygon", () => {
    expect(pointInPolygon(5, 5, [])).toBe(false);
  });
});

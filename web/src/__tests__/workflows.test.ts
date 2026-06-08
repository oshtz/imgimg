import { describe, it, expect } from "vitest";
import {
  isAspectRatio,
  nearestAspectRatio,
  aspectRatioToNumber,
  aspectRatioToSize,
  ASPECT_RATIOS,
} from "../workflows";
import type { AspectRatio } from "../workflows";

describe("isAspectRatio", () => {
  it("returns true for all valid aspect ratios", () => {
    for (const ar of ASPECT_RATIOS) {
      expect(isAspectRatio(ar)).toBe(true);
    }
  });

  it("returns false for invalid strings", () => {
    expect(isAspectRatio("1:0")).toBe(false);
    expect(isAspectRatio("invalid")).toBe(false);
    expect(isAspectRatio("10:10")).toBe(false);
    expect(isAspectRatio("")).toBe(false);
  });

  it("returns false for non-string values", () => {
    expect(isAspectRatio(null)).toBe(false);
    expect(isAspectRatio(undefined)).toBe(false);
    expect(isAspectRatio(16)).toBe(false);
    expect(isAspectRatio({ w: 16, h: 9 })).toBe(false);
  });
});

describe("aspectRatioToNumber", () => {
  it("returns 1 for 1:1", () => {
    expect(aspectRatioToNumber("1:1")).toBe(1);
  });

  it("returns 16/9 for 16:9", () => {
    expect(aspectRatioToNumber("16:9")).toBeCloseTo(16 / 9);
  });

  it("returns 9/16 for 9:16", () => {
    expect(aspectRatioToNumber("9:16")).toBeCloseTo(9 / 16);
  });

  it("returns 2/3 for 2:3", () => {
    expect(aspectRatioToNumber("2:3")).toBeCloseTo(2 / 3);
  });

  it("returns 3/2 for 3:2", () => {
    expect(aspectRatioToNumber("3:2")).toBeCloseTo(3 / 2);
  });

  it("returns 2 for 2:1", () => {
    expect(aspectRatioToNumber("2:1")).toBe(2);
  });

  it("returns 0.5 for 1:2", () => {
    expect(aspectRatioToNumber("1:2")).toBe(0.5);
  });

  it("returns 1 for invalid aspect ratio (non-finite values)", () => {
    expect(aspectRatioToNumber("abc:def" as any)).toBe(1);
  });

  it("returns 1 for zero width or height", () => {
    expect(aspectRatioToNumber("0:1" as any)).toBe(1);
    expect(aspectRatioToNumber("1:0" as any)).toBe(1);
  });

  it("returns 1 for negative values", () => {
    expect(aspectRatioToNumber("-1:1" as any)).toBe(1);
  });
});

describe("nearestAspectRatio", () => {
  it("returns 1:1 for a square", () => {
    expect(nearestAspectRatio(1024, 1024)).toBe("1:1");
  });

  it("returns 16:9 for a standard landscape", () => {
    expect(nearestAspectRatio(1920, 1080)).toBe("16:9");
  });

  it("returns 9:16 for a standard portrait", () => {
    expect(nearestAspectRatio(1080, 1920)).toBe("9:16");
  });

  it("returns 4:3 for 1600x1200", () => {
    expect(nearestAspectRatio(1600, 1200)).toBe("4:3");
  });

  it("returns 3:4 for 1200x1600", () => {
    expect(nearestAspectRatio(1200, 1600)).toBe("3:4");
  });

  it("returns 2:1 for a very wide image", () => {
    expect(nearestAspectRatio(2000, 1000)).toBe("2:1");
  });

  it("returns 1:2 for a very tall image", () => {
    expect(nearestAspectRatio(1000, 2000)).toBe("1:2");
  });
});

describe("aspectRatioToSize", () => {
  it("returns 1024x1024 for 1:1", () => {
    const size = aspectRatioToSize("1:1");
    expect(size).toEqual({ width: 1024, height: 1024 });
  });

  it("returns dimensions that are multiples of 64", () => {
    for (const ar of ASPECT_RATIOS) {
      const { width, height } = aspectRatioToSize(ar);
      expect(width % 64).toBe(0);
      expect(height % 64).toBe(0);
    }
  });

  it("returns width > height for landscape ratios", () => {
    const landscapes: AspectRatio[] = ["16:9", "3:2", "4:3", "2:1"];
    for (const ar of landscapes) {
      const { width, height } = aspectRatioToSize(ar);
      expect(width).toBeGreaterThan(height);
    }
  });

  it("returns height > width for portrait ratios", () => {
    const portraits: AspectRatio[] = ["9:16", "2:3", "3:4", "1:2"];
    for (const ar of portraits) {
      const { width, height } = aspectRatioToSize(ar);
      expect(height).toBeGreaterThan(width);
    }
  });

  it("does not exceed 2048 in any dimension", () => {
    for (const ar of ASPECT_RATIOS) {
      const { width, height } = aspectRatioToSize(ar);
      expect(width).toBeLessThanOrEqual(2048);
      expect(height).toBeLessThanOrEqual(2048);
    }
  });

  it("returns positive dimensions for all ratios", () => {
    for (const ar of ASPECT_RATIOS) {
      const { width, height } = aspectRatioToSize(ar);
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
    }
  });
});

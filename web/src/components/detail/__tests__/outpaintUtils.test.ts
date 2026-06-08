import { describe, it, expect } from "vitest";
import {
  calculateExpansionForAspectRatio,
  OUTPAINT_ASPECT_RATIOS,
} from "../outpaintUtils";

describe("OUTPAINT_ASPECT_RATIOS", () => {
  it("exists and is a non-empty array", () => {
    expect(Array.isArray(OUTPAINT_ASPECT_RATIOS)).toBe(true);
    expect(OUTPAINT_ASPECT_RATIOS.length).toBeGreaterThan(0);
  });

  it("contains expected entries", () => {
    const values = OUTPAINT_ASPECT_RATIOS.map((r) => r.value);
    expect(values).toContain("1:1");
    expect(values).toContain("16:9");
    expect(values).toContain("9:16");
    expect(values).toContain("4:3");
    expect(values).toContain("21:9");
  });

  it("each entry has label and value", () => {
    for (const entry of OUTPAINT_ASPECT_RATIOS) {
      expect(typeof entry.label).toBe("string");
      expect(typeof entry.value).toBe("string");
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.value).toMatch(/^\d+:\d+$/);
    }
  });
});

describe("calculateExpansionForAspectRatio", () => {
  it("expands width for square image to 16:9", () => {
    const result = calculateExpansionForAspectRatio(512, 512, "16:9");
    expect(result).not.toBeNull();
    expect(result!.left).toBeGreaterThan(0);
    expect(result!.right).toBeGreaterThan(0);
    expect(result!.top).toBe(0);
    expect(result!.bottom).toBe(0);
    // left and right should be equal (centered)
    expect(result!.left).toBe(result!.right);
  });

  it("expands height for square image to 9:16", () => {
    const result = calculateExpansionForAspectRatio(512, 512, "9:16");
    expect(result).not.toBeNull();
    expect(result!.top).toBeGreaterThan(0);
    expect(result!.bottom).toBeGreaterThan(0);
    expect(result!.left).toBe(0);
    expect(result!.right).toBe(0);
    // top and bottom should be equal (centered)
    expect(result!.top).toBe(result!.bottom);
  });

  it("returns all zeros when already at target ratio", () => {
    // 16:9 image targeting 16:9
    const result = calculateExpansionForAspectRatio(1600, 900, "16:9");
    expect(result).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
  });

  it("returns null for invalid aspect ratio string", () => {
    expect(calculateExpansionForAspectRatio(512, 512, "invalid")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(calculateExpansionForAspectRatio(512, 512, "")).toBeNull();
  });

  it("returns null for negative ratio components", () => {
    expect(calculateExpansionForAspectRatio(512, 512, "-1:9")).toBeNull();
  });

  it("returns null for zero ratio component", () => {
    expect(calculateExpansionForAspectRatio(512, 512, "0:9")).toBeNull();
  });

  it("snaps expansion values to 64px multiples", () => {
    const result = calculateExpansionForAspectRatio(512, 512, "16:9");
    expect(result).not.toBeNull();
    expect(result!.left % 64).toBe(0);
    expect(result!.right % 64).toBe(0);
    expect(result!.top % 64).toBe(0);
    expect(result!.bottom % 64).toBe(0);
  });

  it("snaps expansion values to 64px multiples for portrait", () => {
    const result = calculateExpansionForAspectRatio(512, 512, "9:16");
    expect(result).not.toBeNull();
    expect(result!.top % 64).toBe(0);
    expect(result!.bottom % 64).toBe(0);
  });

  it("expands width for landscape image to ultrawide", () => {
    const result = calculateExpansionForAspectRatio(1600, 900, "21:9");
    expect(result).not.toBeNull();
    // 21:9 is wider than 16:9, so should expand width
    expect(result!.left).toBeGreaterThanOrEqual(0);
    expect(result!.right).toBeGreaterThanOrEqual(0);
  });

  it("values are never negative", () => {
    const result = calculateExpansionForAspectRatio(512, 512, "4:3");
    expect(result).not.toBeNull();
    expect(result!.left).toBeGreaterThanOrEqual(0);
    expect(result!.right).toBeGreaterThanOrEqual(0);
    expect(result!.top).toBeGreaterThanOrEqual(0);
    expect(result!.bottom).toBeGreaterThanOrEqual(0);
  });
});

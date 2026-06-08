import { describe, it, expect } from "vitest";
import { clampBatchSize } from "../clamp";

describe("clampBatchSize", () => {
  describe("valid number inputs", () => {
    it.each([1, 2, 3, 4] as const)("returns %d when given %d", (n) => {
      expect(clampBatchSize(n)).toBe(n);
    });
  });

  describe("valid string inputs", () => {
    it.each(["1", "2", "3", "4"])('returns parsed number for "%s"', (s) => {
      expect(clampBatchSize(s)).toBe(Number(s));
    });
  });

  describe("out-of-range numbers", () => {
    it.each([0, 5, -1, 100, -100])("returns 4 for %d", (n) => {
      expect(clampBatchSize(n)).toBe(4);
    });
  });

  describe("floats", () => {
    it("returns 4 for 2.5", () => {
      expect(clampBatchSize(2.5)).toBe(4);
    });

    it("returns 4 for 1.1", () => {
      expect(clampBatchSize(1.1)).toBe(4);
    });

    it("returns 4 for 3.9", () => {
      expect(clampBatchSize(3.9)).toBe(4);
    });
  });

  describe("NaN and non-numeric", () => {
    it("returns 4 for NaN", () => {
      expect(clampBatchSize(NaN)).toBe(4);
    });

    it("returns 4 for null", () => {
      expect(clampBatchSize(null)).toBe(4);
    });

    it("returns 4 for undefined", () => {
      expect(clampBatchSize(undefined)).toBe(4);
    });

    it("returns 4 for an object", () => {
      expect(clampBatchSize({ value: 2 })).toBe(4);
    });

    it("returns 4 for an array", () => {
      expect(clampBatchSize([1])).toBe(4);
    });

    it("returns 4 for boolean true", () => {
      expect(clampBatchSize(true)).toBe(4);
    });

    it("returns 4 for empty string", () => {
      expect(clampBatchSize("")).toBe(4);
    });

    it("returns 4 for non-numeric string", () => {
      expect(clampBatchSize("abc")).toBe(4);
    });
  });
});

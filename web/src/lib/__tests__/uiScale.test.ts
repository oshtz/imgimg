import { describe, expect, it } from "vitest";
import {
  DEFAULT_UI_SCALE,
  MAX_UI_SCALE,
  MIN_UI_SCALE,
  applyUiScaleShortcut,
  clampUiScale,
  parseUiScale,
} from "../uiScale";

describe("uiScale", () => {
  it("parses persisted scale values with a bounded fallback", () => {
    expect(parseUiScale("1.15")).toBe(1.15);
    expect(parseUiScale("")).toBe(DEFAULT_UI_SCALE);
    expect(parseUiScale("not-a-number")).toBe(DEFAULT_UI_SCALE);
    expect(parseUiScale("9")).toBe(MAX_UI_SCALE);
    expect(parseUiScale("0")).toBe(MIN_UI_SCALE);
  });

  it("clamps scale to the supported range", () => {
    expect(clampUiScale(0.25)).toBe(MIN_UI_SCALE);
    expect(clampUiScale(1)).toBe(1);
    expect(clampUiScale(3)).toBe(MAX_UI_SCALE);
  });

  it("increments and decrements from Ctrl plus/minus shortcuts", () => {
    expect(applyUiScaleShortcut(1, { key: "+", ctrlKey: true })).toBe(1.1);
    expect(applyUiScaleShortcut(1, { key: "=", ctrlKey: true })).toBe(1.1);
    expect(applyUiScaleShortcut(1, { key: "-", ctrlKey: true })).toBe(0.9);
  });

  it("supports macOS Command shortcuts and reset", () => {
    expect(applyUiScaleShortcut(1, { key: "+", metaKey: true })).toBe(1.1);
    expect(applyUiScaleShortcut(1.3, { key: "0", metaKey: true })).toBe(DEFAULT_UI_SCALE);
  });

  it("ignores unrelated keyboard events", () => {
    expect(applyUiScaleShortcut(1, { key: "+", ctrlKey: false, metaKey: false })).toBeNull();
    expect(applyUiScaleShortcut(1, { key: "x", ctrlKey: true })).toBeNull();
    expect(applyUiScaleShortcut(1, { key: "+", ctrlKey: true, altKey: true })).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { pillBase, selectPill, togglePill } from "../pillStyles";

describe("pillBase", () => {
  it("returns a non-empty string", () => {
    const result = pillBase();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes base layout classes", () => {
    const result = pillBase();
    expect(result).toContain("inline-flex");
    expect(result).toContain("items-center");
    expect(result).toContain("rounded-lg");
  });

  it("does not include opacity when not disabled", () => {
    const result = pillBase();
    expect(result).not.toContain("opacity-60");
  });

  it("does not include opacity when disabled is false", () => {
    const result = pillBase(false);
    expect(result).not.toContain("opacity-60");
  });

  it("adds opacity class when disabled", () => {
    const result = pillBase(true);
    expect(result).toContain("opacity-60");
  });
});

describe("selectPill", () => {
  it("returns a non-empty string", () => {
    const result = selectPill();
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes gap class", () => {
    const result = selectPill();
    expect(result).toContain("gap-2");
  });

  it("includes justify-between", () => {
    const result = selectPill();
    expect(result).toContain("justify-between");
  });

  it("includes base classes from pillBase", () => {
    const result = selectPill();
    expect(result).toContain("inline-flex");
    expect(result).toContain("rounded-lg");
  });

  it("adds opacity when disabled", () => {
    const result = selectPill(true);
    expect(result).toContain("opacity-60");
  });
});

describe("togglePill", () => {
  it("returns a non-empty string", () => {
    const result = togglePill(false);
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes ring class when active", () => {
    const result = togglePill(true);
    expect(result).toContain("ring-2");
    expect(result).toContain("ring-zinc-400/40");
  });

  it("does not include ring class when inactive", () => {
    const result = togglePill(false);
    // Should not have the active ring (but may have focus ring)
    // The active-specific ring is "ring-2 ring-zinc-400/40" added by togglePill
    // pillBase has focus:ring-2 which is different (has focus: prefix)
    expect(result).not.toMatch(/(?<![:\w])ring-2(?!\S*focus)/);
  });

  it("includes base classes from pillBase", () => {
    const result = togglePill(false);
    expect(result).toContain("inline-flex");
    expect(result).toContain("rounded-lg");
  });

  it("adds opacity when disabled and active", () => {
    const result = togglePill(true, true);
    expect(result).toContain("opacity-60");
    expect(result).toContain("ring-2");
  });

  it("adds opacity when disabled and inactive", () => {
    const result = togglePill(false, true);
    expect(result).toContain("opacity-60");
  });
});

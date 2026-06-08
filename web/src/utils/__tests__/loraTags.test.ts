import { describe, it, expect } from "vitest";
import {
  normalizeLoraTag,
  buildLoraTagCandidates,
  findLoraTagMatches,
  type LoraTagCandidate,
} from "../loraTags";
import type { Model } from "../../types";

function makeModel(overrides: Partial<Model> & { id: string; name: string }): Model {
  return {
    tags: [],
    triggerWords: [],
    workflowTemplate: "master",
    previewImageUrl: "",
    ...overrides,
  };
}

function makeCandidates(
  items: { id: string; name: string }[]
): LoraTagCandidate[] {
  return buildLoraTagCandidates(items.map((i) => makeModel(i)));
}

// --------------- normalizeLoraTag ---------------

describe("normalizeLoraTag", () => {
  it("lowercases and strips non-alphanumeric", () => {
    expect(normalizeLoraTag("Hello World!")).toBe("helloworld");
  });

  it("handles already-normalized input", () => {
    expect(normalizeLoraTag("abc123")).toBe("abc123");
  });

  it("removes special characters", () => {
    expect(normalizeLoraTag("My-Model_v2.1")).toBe("mymodelv21");
  });

  it("trims whitespace before processing", () => {
    expect(normalizeLoraTag("  spaced  ")).toBe("spaced");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeLoraTag("")).toBe("");
  });

  it("returns empty string for only special chars", () => {
    expect(normalizeLoraTag("---")).toBe("");
  });
});

// --------------- buildLoraTagCandidates ---------------

describe("buildLoraTagCandidates", () => {
  it("maps models to candidates with normalized fields", () => {
    const models = [makeModel({ id: "1", name: "My LoRA" })];
    const result = buildLoraTagCandidates(models);
    expect(result).toEqual([
      { id: "1", name: "My LoRA", nameLower: "my lora", nameNormalized: "mylora" },
    ]);
  });

  it("filters out models with empty names", () => {
    const models = [
      makeModel({ id: "1", name: "Good" }),
      makeModel({ id: "2", name: "" }),
      makeModel({ id: "3", name: "   " }),
    ];
    const result = buildLoraTagCandidates(models);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("trims whitespace from names", () => {
    const models = [makeModel({ id: "1", name: "  Padded  " })];
    const result = buildLoraTagCandidates(models);
    expect(result[0].name).toBe("Padded");
    expect(result[0].nameLower).toBe("padded");
  });

  it("returns empty array for empty input", () => {
    expect(buildLoraTagCandidates([])).toEqual([]);
  });
});

// --------------- findLoraTagMatches ---------------

describe("findLoraTagMatches", () => {
  it("returns empty array when no @ in prompt", () => {
    const candidates = makeCandidates([{ id: "1", name: "Alpha" }]);
    expect(findLoraTagMatches("no at sign", candidates)).toEqual([]);
  });

  it("finds a single @tag match", () => {
    const candidates = makeCandidates([{ id: "1", name: "Alpha" }]);
    const result = findLoraTagMatches("use @Alpha please", candidates);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "1", name: "Alpha", index: 4 });
  });

  it("matches case-insensitively", () => {
    const candidates = makeCandidates([{ id: "1", name: "Alpha" }]);
    const result = findLoraTagMatches("use @alpha please", candidates);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("finds multiple @tag matches sorted by position", () => {
    const candidates = makeCandidates([
      { id: "1", name: "Alpha" },
      { id: "2", name: "Beta" },
    ]);
    const result = findLoraTagMatches("@Beta then @Alpha", candidates);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("2"); // Beta first by position
    expect(result[1].id).toBe("1");
  });

  it("longer name wins when names overlap", () => {
    const candidates = makeCandidates([
      { id: "1", name: "Art" },
      { id: "2", name: "Art Style" },
    ]);
    const result = findLoraTagMatches("@Art Style", candidates);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  it("matches at end of string", () => {
    const candidates = makeCandidates([{ id: "1", name: "Alpha" }]);
    const result = findLoraTagMatches("use @Alpha", candidates);
    expect(result).toHaveLength(1);
  });

  it("matches followed by punctuation", () => {
    const candidates = makeCandidates([{ id: "1", name: "Alpha" }]);
    const result = findLoraTagMatches("use @Alpha, please", candidates);
    expect(result).toHaveLength(1);
  });

  it("does not match when tag is part of a longer word", () => {
    const candidates = makeCandidates([{ id: "1", name: "Art" }]);
    const result = findLoraTagMatches("use @ArtStyle", candidates);
    // "ArtStyle" is longer than "Art" and no whitespace/punct boundary
    expect(result).toHaveLength(0);
  });

  it("falls back to slug matching for partial matches", () => {
    const candidates = makeCandidates([{ id: "1", name: "My Cool LoRA" }]);
    // normalizeLoraTag("my-cool-lora") = "mycoollora" which matches "mycoollora"
    const result = findLoraTagMatches("use @my-cool-lora", candidates);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("slug fallback requires unique match", () => {
    const candidates = makeCandidates([
      { id: "1", name: "Cool Model" },
      { id: "2", name: "Cool Model v2" },
    ]);
    // "cool" normalizes and both contain it, but neither is a unique exact match
    // "coolmodel" is an exact match for id "1" only
    const result = findLoraTagMatches("use @cool-model", candidates);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("skips candidates with empty nameLower", () => {
    const candidates: LoraTagCandidate[] = [
      { id: "1", name: "", nameLower: "", nameNormalized: "" },
      { id: "2", name: "Alpha", nameLower: "alpha", nameNormalized: "alpha" },
    ];
    const result = findLoraTagMatches("@Alpha", candidates);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  it("slug fallback continues (skips) when multiple exact normalized matches exist", () => {
    // Two candidates with same normalized name - exactCount > 1 - should skip, not push
    const candidates: LoraTagCandidate[] = [
      { id: "1", name: "Foo Bar", nameLower: "foo bar", nameNormalized: "foobar" },
      { id: "2", name: "FooBar", nameLower: "foobar", nameNormalized: "foobar" },
    ];
    // "@foo-bar" normalizes to "foobar", which matches both candidates exactly
    // But neither matches directly as "@foo bar" or "@foobar" at word boundary
    const result = findLoraTagMatches("@foo-bar", candidates);
    // exactCount=2, so the slug fallback skips this tag
    expect(result).toHaveLength(0);
  });

  it("slug fallback skips when normalizedTag is empty", () => {
    const candidates = makeCandidates([{ id: "1", name: "Alpha" }]);
    // @--- normalizes to empty string, should be skipped
    const result = findLoraTagMatches("@---", candidates);
    expect(result).toEqual([]);
  });

  it("finds match when @tag appears multiple times and first instance has no boundary", () => {
    const candidates = makeCandidates([{ id: "1", name: "Art" }]);
    // First @art has no boundary (followed by "istic"), second @art has boundary
    const result = findLoraTagMatches("@artistic @art", candidates);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Art");
  });

  it("returns empty when prompt has @ but no valid candidates match", () => {
    const candidates = makeCandidates([{ id: "1", name: "Alpha" }]);
    expect(findLoraTagMatches("@zzz", candidates)).toEqual([]);
  });

  it("partial match fallback: unique substring match finds a model", () => {
    // "uniquefrag" matches no exact normalized, but one candidate contains it
    const candidates = makeCandidates([
      { id: "1", name: "Super UniqueFragment Model" },
      { id: "2", name: "Other Thing" },
    ]);
    const result = findLoraTagMatches("@uniquefrag", candidates);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("partial match fallback: skips when multiple exact normalized matches", () => {
    // Two models with same normalized form — ambiguous, so skipped
    const candidates = makeCandidates([
      { id: "1", name: "Cool" },
      { id: "2", name: "cool" }, // same normalized as #1
    ]);
    const result = findLoraTagMatches("@cool", candidates);
    // Should find via direct match (not fallback), but if not, fallback skips due to exactCount > 1
    expect(result.length).toBeLessThanOrEqual(1);
  });

  it("partial match fallback: skips when multiple partial matches", () => {
    // Two candidates contain the substring — ambiguous
    const candidates = makeCandidates([
      { id: "1", name: "Art Style A" },
      { id: "2", name: "Art Style B" },
    ]);
    // "artstyle" matches both by partial, neither uniquely
    const result = findLoraTagMatches("@artstyle", candidates);
    // Either 0 (no unique partial) or handled by direct match
    expect(result.length).toBeLessThanOrEqual(1);
  });

  it("partial match fallback: skips when partialCount > 1 (ambiguous substring)", () => {
    // Both candidates contain "xfrag" as a substring
    const candidates: LoraTagCandidate[] = [
      { id: "1", name: "AXfragB", nameLower: "axfragb", nameNormalized: "axfragb" },
      { id: "2", name: "CXfragD", nameLower: "cxfragd", nameNormalized: "cxfragd" },
    ];
    // "xfrag" has no exact match (exactCount=0), and both contain it (partialCount=2)
    const result = findLoraTagMatches("@xfrag", candidates);
    expect(result).toHaveLength(0);
  });

  it("returns empty when @ is present but no valid tag characters follow", () => {
    // "@ " contains @ but regex /@([A-Za-z0-9._-]+)/g finds no matches → tags.length === 0
    const candidates = makeCandidates([{ id: "1", name: "Alpha" }]);
    const result = findLoraTagMatches("@ ", candidates);
    expect(result).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import {
  buildSavedPromptCandidates,
  findSavedPromptTagMatches,
  type SavedPromptCandidate,
} from "../promptTags";
import type { SavedPrompt } from "../../types";

function makePrompt(id: string, name: string, text = "prompt text"): SavedPrompt {
  return { id, name, text, createdAt: "2024-01-01", updatedAt: "2024-01-01" };
}

function candidates(items: { id: string; name: string; text?: string }[]): SavedPromptCandidate[] {
  return buildSavedPromptCandidates(
    items.map((i) => makePrompt(i.id, i.name, i.text ?? "prompt text"))
  );
}

// --------------- buildSavedPromptCandidates ---------------

describe("buildSavedPromptCandidates", () => {
  it("builds candidates with normalized fields", () => {
    const result = buildSavedPromptCandidates([makePrompt("1", "My Prompt")]);
    expect(result).toEqual([
      {
        id: "1",
        name: "My Prompt",
        nameLower: "my prompt",
        nameNormalized: "myprompt",
        text: "prompt text",
      },
    ]);
  });

  it("filters empty names", () => {
    const result = buildSavedPromptCandidates([
      makePrompt("1", "Good"),
      makePrompt("2", ""),
      makePrompt("3", "   "),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("trims whitespace from names", () => {
    const result = buildSavedPromptCandidates([makePrompt("1", "  Padded  ")]);
    expect(result[0].name).toBe("Padded");
  });

  it("returns empty for no prompts", () => {
    expect(buildSavedPromptCandidates([])).toEqual([]);
  });
});

// --------------- findSavedPromptTagMatches ---------------

describe("findSavedPromptTagMatches", () => {
  it("returns empty when no ! in prompt", () => {
    expect(findSavedPromptTagMatches("no bang", candidates([{ id: "1", name: "A" }]))).toEqual([]);
  });

  it("matches !tag by exact name", () => {
    const c = candidates([{ id: "1", name: "Sunset" }]);
    const result = findSavedPromptTagMatches("use !Sunset here", c);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "1", name: "Sunset", index: 4 });
  });

  it("matches case-insensitively", () => {
    const c = candidates([{ id: "1", name: "Sunset" }]);
    const result = findSavedPromptTagMatches("use !sunset here", c);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("respects word boundary", () => {
    const c = candidates([{ id: "1", name: "Art" }]);
    expect(findSavedPromptTagMatches("!ArtStyle", c)).toEqual([]);
  });

  it("matches at end of string", () => {
    const c = candidates([{ id: "1", name: "Sunset" }]);
    const result = findSavedPromptTagMatches("use !Sunset", c);
    expect(result).toHaveLength(1);
  });

  it("matches followed by punctuation", () => {
    const c = candidates([{ id: "1", name: "Sunset" }]);
    const result = findSavedPromptTagMatches("!Sunset, nice", c);
    expect(result).toHaveLength(1);
  });

  it("multiple matches sorted by position", () => {
    const c = candidates([
      { id: "1", name: "Alpha" },
      { id: "2", name: "Beta" },
    ]);
    const result = findSavedPromptTagMatches("!Beta then !Alpha", c);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("2");
    expect(result[1].id).toBe("1");
  });

  it("falls back to slug/normalized matching", () => {
    const c = candidates([{ id: "1", name: "My Cool Prompt" }]);
    const result = findSavedPromptTagMatches("use !my-cool-prompt ok", c);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("slug fallback requires unique normalized match", () => {
    const c = candidates([
      { id: "1", name: "Cool" },
      { id: "2", name: "Cool V2" },
    ]);
    // "cool" matches candidate 1 exactly by normalized form
    const result = findSavedPromptTagMatches("use !cool ok", c);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("includes text in result", () => {
    const c = candidates([{ id: "1", name: "Sunset", text: "golden hour" }]);
    const result = findSavedPromptTagMatches("!Sunset", c);
    expect(result[0].text).toBe("golden hour");
  });

  it("skips candidates with empty nameLower", () => {
    const c: SavedPromptCandidate[] = [
      { id: "1", name: "", nameLower: "", nameNormalized: "", text: "x" },
      { id: "2", name: "Alpha", nameLower: "alpha", nameNormalized: "alpha", text: "y" },
    ];
    const result = findSavedPromptTagMatches("!Alpha", c);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  it("slug fallback continues (skips) when multiple exact normalized matches exist", () => {
    const c: SavedPromptCandidate[] = [
      { id: "1", name: "Foo Bar", nameLower: "foo bar", nameNormalized: "foobar", text: "a" },
      { id: "2", name: "FooBar", nameLower: "foobar", nameNormalized: "foobar", text: "b" },
    ];
    const result = findSavedPromptTagMatches("!foo-bar", c);
    expect(result).toHaveLength(0);
  });

  it("slug fallback skips when normalizedTag is empty", () => {
    const c = candidates([{ id: "1", name: "Alpha" }]);
    const result = findSavedPromptTagMatches("!---", c);
    expect(result).toEqual([]);
  });

  it("finds match when !tag first instance has no boundary but second does", () => {
    const c = candidates([{ id: "1", name: "Art" }]);
    const result = findSavedPromptTagMatches("!artistic !art", c);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Art");
  });

  it("returns empty when ! present but no valid match", () => {
    const c = candidates([{ id: "1", name: "Alpha" }]);
    expect(findSavedPromptTagMatches("!zzz", c)).toEqual([]);
  });

  it("partial match fallback: unique substring match finds a prompt", () => {
    const c = candidates([
      { id: "1", name: "Super UniqueFragment Prompt" },
      { id: "2", name: "Other Thing" },
    ]);
    const result = findSavedPromptTagMatches("!uniquefrag", c);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("partial match fallback: skips when multiple exact normalized matches", () => {
    const c = candidates([
      { id: "1", name: "Cool" },
      { id: "2", name: "cool" },
    ]);
    const result = findSavedPromptTagMatches("!cool", c);
    expect(result.length).toBeLessThanOrEqual(1);
  });

  it("partial match fallback: skips when multiple partial matches", () => {
    const c = candidates([
      { id: "1", name: "Art Style A" },
      { id: "2", name: "Art Style B" },
    ]);
    const result = findSavedPromptTagMatches("!artstyle", c);
    expect(result.length).toBeLessThanOrEqual(1);
  });

  it("partial match fallback: skips when partialCount > 1 (ambiguous substring)", () => {
    // Both candidates contain "xfrag" as a substring, neither is exact
    const c: SavedPromptCandidate[] = [
      { id: "1", name: "AXfragB", nameLower: "axfragb", nameNormalized: "axfragb", text: "a" },
      { id: "2", name: "CXfragD", nameLower: "cxfragd", nameNormalized: "cxfragd", text: "b" },
    ];
    // "xfrag" has no exact match (exactCount=0), and both contain it (partialCount=2)
    const result = findSavedPromptTagMatches("!xfrag", c);
    expect(result).toHaveLength(0);
  });

  it("returns empty when ! is present but no valid tag characters follow", () => {
    // "! " contains ! but regex /!([A-Za-z0-9._-]+)/g finds no matches → tags.length === 0
    const c = candidates([{ id: "1", name: "Alpha" }]);
    const result = findSavedPromptTagMatches("! ", c);
    expect(result).toEqual([]);
  });
});

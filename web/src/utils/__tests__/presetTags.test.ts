import { describe, it, expect } from "vitest";
import {
  slugifyPreset,
  buildPresetTagCandidates,
  findPresetTagMatches,
  getPresetTagContext,
  findPresetTagRanges,
  removePresetTags,
  type PresetTagCandidate,
} from "../presetTags";

import type { UserPreset } from "../../api";

function makePreset(id: string, name: string): UserPreset {
  return { id, name, image_count: 0, preview_url: "" };
}

function candidates(items: { id: string; name: string }[]): PresetTagCandidate[] {
  return buildPresetTagCandidates(items.map((i) => makePreset(i.id, i.name)));
}

// --------------- slugifyPreset ---------------

describe("slugifyPreset", () => {
  it("converts spaces to dashes", () => {
    expect(slugifyPreset("My Preset")).toBe("my-preset");
  });

  it("removes special characters and replaces with dashes", () => {
    expect(slugifyPreset("Hello!@#World")).toBe("hello-world");
  });

  it("strips leading and trailing dashes", () => {
    expect(slugifyPreset("--trimmed--")).toBe("trimmed");
  });

  it("collapses multiple non-alphanumeric runs into a single dash", () => {
    expect(slugifyPreset("a   b___c")).toBe("a-b-c");
  });

  it("handles empty string", () => {
    expect(slugifyPreset("")).toBe("");
  });

  it("trims whitespace", () => {
    expect(slugifyPreset("  padded  ")).toBe("padded");
  });
});

// --------------- buildPresetTagCandidates ---------------

describe("buildPresetTagCandidates", () => {
  it("builds candidates with slug", () => {
    const result = buildPresetTagCandidates([makePreset("1", "My Preset")]);
    expect(result).toEqual([
      { id: "1", name: "My Preset", nameLower: "my preset", nameSlug: "my-preset" },
    ]);
  });

  it("filters empty names", () => {
    const result = buildPresetTagCandidates([
      makePreset("1", "Good"),
      makePreset("2", ""),
      makePreset("3", "   "),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("returns empty for no presets", () => {
    expect(buildPresetTagCandidates([])).toEqual([]);
  });
});

// --------------- findPresetTagMatches ---------------

describe("findPresetTagMatches", () => {
  it("returns empty when no # in prompt", () => {
    expect(findPresetTagMatches("no hash", candidates([{ id: "1", name: "A" }]))).toEqual([]);
  });

  it("matches #tag by exact name", () => {
    const c = candidates([{ id: "1", name: "Vivid" }]);
    const result = findPresetTagMatches("use #Vivid here", c);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "1", name: "Vivid", index: 4 });
  });

  it("matches #tag by slug", () => {
    const c = candidates([{ id: "1", name: "My Preset" }]);
    const result = findPresetTagMatches("use #my-preset here", c);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("respects word boundary (followed by punctuation)", () => {
    const c = candidates([{ id: "1", name: "Art" }]);
    const result = findPresetTagMatches("#Art, please", c);
    expect(result).toHaveLength(1);
  });

  it("does not match when tag continues without boundary", () => {
    const c = candidates([{ id: "1", name: "Art" }]);
    const result = findPresetTagMatches("#ArtStyle", c);
    expect(result).toHaveLength(0);
  });

  it("falls back to slug matching", () => {
    const c = candidates([{ id: "1", name: "Cool Style" }]);
    const result = findPresetTagMatches("use #cool-style ok", c);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("matches at end of string", () => {
    const c = candidates([{ id: "1", name: "Vivid" }]);
    const result = findPresetTagMatches("use #Vivid", c);
    expect(result).toHaveLength(1);
  });

  it("slug fallback: matches exactly one candidate by slug when name doesn't match", () => {
    // The name is "Cool_Style" but the tag is #cool-style
    // Exact name match (#cool_style or #cool-style as name) won't match because
    // the name "Cool_Style" lowered is "cool_style", the tag is "cool-style"
    // We need a scenario where the first-pass exact match fails, then slug fallback runs.
    // Use a name with characters that slug differently:
    const c = candidates([{ id: "1", name: "My!!!Preset" }]);
    // nameLower = "my!!!preset", nameSlug = "my-preset"
    // Tag #my-preset won't match nameLower "#my!!!preset" in first pass,
    // but will match nameSlug in first pass via the slug needle.
    // To truly test slug fallback (lines 90-91), we need the first-pass to fail entirely.
    // That means the tag must not match either nameLower or nameSlug directly.
    // The fallback regex extracts tags and normalizes them.
    // Use a tag with dots: #my.preset → slugified = "my-preset" → matches nameSlug
    const c2 = candidates([{ id: "2", name: "My!!!Preset" }]);
    const result = findPresetTagMatches("use #my.preset ok", c2);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  it("slug fallback: skips ambiguous matches when multiple candidates share same slug", () => {
    // Two presets whose slugs are the same
    const c = candidates([
      { id: "1", name: "My!!!Preset" },
      { id: "2", name: "My---Preset" },
    ]);
    // Both have nameSlug = "my-preset"
    // Tag #my.preset → slugified = "my-preset" → matches both → ambiguous, skipped
    const result = findPresetTagMatches("use #my.preset ok", c);
    expect(result).toHaveLength(0);
  });
});

// --------------- getPresetTagContext ---------------

describe("getPresetTagContext", () => {
  it("returns context when cursor is after # with query", () => {
    const result = getPresetTagContext("#viv", 4);
    expect(result).toEqual({ start: 0, query: "viv" });
  });

  it("returns context when # is after a space", () => {
    const result = getPresetTagContext("hello #vi", 9);
    expect(result).toEqual({ start: 6, query: "vi" });
  });

  it("returns context at start of input", () => {
    const result = getPresetTagContext("#", 1);
    expect(result).toEqual({ start: 0, query: "" });
  });

  it("returns null when no # present", () => {
    expect(getPresetTagContext("hello", 3)).toBeNull();
  });

  it("returns null when # is preceded by alphanumeric", () => {
    expect(getPresetTagContext("abc#def", 7)).toBeNull();
  });

  it("returns null when segment contains whitespace", () => {
    expect(getPresetTagContext("# spaced", 8)).toBeNull();
  });

  it("returns null for negative cursor", () => {
    expect(getPresetTagContext("#hello", -1)).toBeNull();
  });
});

// --------------- findPresetTagRanges ---------------

describe("findPresetTagRanges", () => {
  it("returns ranges for matched tags", () => {
    const c = candidates([{ id: "1", name: "Vivid" }]);
    const ranges = findPresetTagRanges("use #Vivid here", c);
    expect(ranges).toEqual([{ start: 4, end: 10 }]); // "#Vivid" = 6 chars
  });

  it("returns multiple ranges", () => {
    const c = candidates([
      { id: "1", name: "Vivid" },
      { id: "2", name: "Dark" },
    ]);
    const ranges = findPresetTagRanges("#Vivid and #Dark", c);
    expect(ranges).toHaveLength(2);
    expect(ranges[0].start).toBeLessThan(ranges[1].start);
  });

  it("returns empty when no # present", () => {
    const c = candidates([{ id: "1", name: "Vivid" }]);
    expect(findPresetTagRanges("no hash", c)).toEqual([]);
  });

  it("does not overlap ranges for similar names", () => {
    const c = candidates([
      { id: "1", name: "Art" },
      { id: "2", name: "Art Style" },
    ]);
    const ranges = findPresetTagRanges("#Art Style here", c);
    // "Art Style" is longer, matched first; no overlap
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toEqual({ start: 0, end: 10 }); // "#Art Style" = 10 chars
  });

  it("matches by slug too", () => {
    const c = candidates([{ id: "1", name: "My Preset" }]);
    const ranges = findPresetTagRanges("use #my-preset here", c);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toEqual({ start: 4, end: 14 }); // "#my-preset"
  });

  it("skips range when preceded by alphanumeric character", () => {
    const c = candidates([{ id: "1", name: "Art" }]);
    // "x#Art" — the # is preceded by 'x', so should not match
    const ranges = findPresetTagRanges("x#Art here", c);
    expect(ranges).toEqual([]);
  });

  it("skips range when followed by non-boundary character", () => {
    const c = candidates([{ id: "1", name: "Art" }]);
    // "#ArtStyle" — nextChar is 'S', not whitespace/punct
    const ranges = findPresetTagRanges("#ArtStyle here", c);
    expect(ranges).toEqual([]);
  });
});

// --------------- removePresetTags ---------------

describe("removePresetTags", () => {
  it("removes a single tag", () => {
    const c = candidates([{ id: "1", name: "Vivid" }]);
    expect(removePresetTags("use #Vivid here", c)).toBe("use here");
  });

  it("removes multiple tags", () => {
    const c = candidates([
      { id: "1", name: "Vivid" },
      { id: "2", name: "Dark" },
    ]);
    expect(removePresetTags("#Vivid and #Dark", c)).toBe("and");
  });

  it("removes slug-form tags", () => {
    const c = candidates([{ id: "1", name: "My Preset" }]);
    expect(removePresetTags("use #my-preset here", c)).toBe("use here");
  });

  it("collapses extra whitespace", () => {
    const c = candidates([{ id: "1", name: "Vivid" }]);
    expect(removePresetTags("#Vivid   extra   spaces", c)).toBe("extra spaces");
  });

  it("returns original when no tags match", () => {
    const c = candidates([{ id: "1", name: "Vivid" }]);
    expect(removePresetTags("nothing here", c)).toBe("nothing here");
  });

  it("removes tag matched by name needle (exact name)", () => {
    const c = candidates([{ id: "1", name: "Vivid" }]);
    // #vivid matches via nameLower needle
    expect(removePresetTags("use #vivid here", c)).toBe("use here");
  });

  it("removes tag matched by slug needle (slugified name)", () => {
    const c = candidates([{ id: "1", name: "My Preset" }]);
    // #my-preset matches via nameSlug needle
    expect(removePresetTags("use #my-preset here", c)).toBe("use here");
  });
});

// --------------- findPresetTagRanges (additional branch coverage) ---------------

describe("findPresetTagMatches (additional branches)", () => {
  it("skips candidates with empty nameLower", () => {
    const c: PresetTagCandidate[] = [
      { id: "1", name: "", nameLower: "", nameSlug: "" },
      { id: "2", name: "Vivid", nameLower: "vivid", nameSlug: "vivid" },
    ];
    const result = findPresetTagMatches("#Vivid", c);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  it("slug fallback skips when normalizedTag is empty (e.g. #---)", () => {
    // Use a candidate whose name won't match the first pass
    const c: PresetTagCandidate[] = [
      { id: "1", name: "Stuff!!!", nameLower: "stuff!!!", nameSlug: "stuff" },
    ];
    // #--- slugifies to "", so it should be skipped
    const result = findPresetTagMatches("use #--- ok", c);
    expect(result).toHaveLength(0);
  });
});

describe("findPresetTagRanges (additional branches)", () => {
  it("continues searching when # is preceded by alphanumeric (mid-string)", () => {
    const c = candidates([{ id: "1", name: "Art" }]);
    // "test#Art #Art" — first # preceded by 't' (alphanumeric), second is valid
    const ranges = findPresetTagRanges("test#Art #Art", c);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].start).toBe(9);
  });

  it("continues searching when followed by non-boundary character (mid-string)", () => {
    const c = candidates([{ id: "1", name: "Art" }]);
    // "#ArtXYZ #Art" — first has non-boundary 'X', second is at end
    const ranges = findPresetTagRanges("#ArtXYZ #Art", c);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].start).toBe(8);
  });
});

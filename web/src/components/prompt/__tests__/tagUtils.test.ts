import { describe, it, expect } from "vitest";
import {
  escapeRegExp,
  getTagContext,
  getPromptTagContext,
  removeModelTags,
  findTagRanges,
} from "../tagUtils";
import type { Model } from "../../../types";

function makeModel(name: string, id = "m1"): Model {
  return {
    id,
    name,
    tags: [],
    triggerWords: [],
    workflowTemplate: "master",
    previewImageUrl: "",
  };
}

// --------------- escapeRegExp ---------------

describe("escapeRegExp", () => {
  it("escapes dots", () => {
    expect(escapeRegExp("a.b")).toBe("a\\.b");
  });

  it("escapes brackets", () => {
    expect(escapeRegExp("[test]")).toBe("\\[test\\]");
  });

  it("escapes parentheses", () => {
    expect(escapeRegExp("(a)")).toBe("\\(a\\)");
  });

  it("escapes pipes", () => {
    expect(escapeRegExp("a|b")).toBe("a\\|b");
  });

  it("escapes all special regex characters", () => {
    const specials = ".*+?^${}()|[]\\";
    const escaped = escapeRegExp(specials);
    expect(escaped).toBe("\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\");
  });

  it("leaves alphanumeric unchanged", () => {
    expect(escapeRegExp("abc123")).toBe("abc123");
  });

  it("handles empty string", () => {
    expect(escapeRegExp("")).toBe("");
  });
});

// --------------- getTagContext ---------------

describe("getTagContext", () => {
  it("returns context when typing after @", () => {
    const result = getTagContext("@alp", 4);
    expect(result).toEqual({ start: 0, query: "alp" });
  });

  it("returns context with empty query right after @", () => {
    const result = getTagContext("@", 1);
    expect(result).toEqual({ start: 0, query: "" });
  });

  it("returns context when @ is after a space", () => {
    const result = getTagContext("hello @mod", 10);
    expect(result).toEqual({ start: 6, query: "mod" });
  });

  it("returns null when no @", () => {
    expect(getTagContext("hello", 3)).toBeNull();
  });

  it("returns null when alphanumeric precedes @", () => {
    expect(getTagContext("abc@def", 7)).toBeNull();
  });

  it("returns null when segment contains whitespace", () => {
    expect(getTagContext("@ spaced", 8)).toBeNull();
  });

  it("returns null for negative cursor", () => {
    expect(getTagContext("@hello", -1)).toBeNull();
  });

  it("returns context mid-word", () => {
    const result = getTagContext("use @mo", 7);
    expect(result).toEqual({ start: 4, query: "mo" });
  });
});

// --------------- getPromptTagContext ---------------

describe("getPromptTagContext", () => {
  it("returns context when typing after !", () => {
    const result = getPromptTagContext("!sun", 4);
    expect(result).toEqual({ start: 0, query: "sun" });
  });

  it("returns context with empty query right after !", () => {
    const result = getPromptTagContext("!", 1);
    expect(result).toEqual({ start: 0, query: "" });
  });

  it("returns null when no !", () => {
    expect(getPromptTagContext("hello", 3)).toBeNull();
  });

  it("returns null when alphanumeric precedes !", () => {
    expect(getPromptTagContext("abc!def", 7)).toBeNull();
  });

  it("returns null when segment contains whitespace", () => {
    expect(getPromptTagContext("! spaced", 8)).toBeNull();
  });

  it("returns null for negative cursor", () => {
    expect(getPromptTagContext("!hello", -1)).toBeNull();
  });

  it("returns context after space", () => {
    const result = getPromptTagContext("hello !pro", 10);
    expect(result).toEqual({ start: 6, query: "pro" });
  });
});

// --------------- removeModelTags ---------------

describe("removeModelTags", () => {
  it("removes a single @model tag", () => {
    const models = [makeModel("Alpha")];
    expect(removeModelTags("use @Alpha here", models)).toBe("use  here");
  });

  it("removes multiple model tags", () => {
    const models = [makeModel("Alpha", "m1"), makeModel("Beta", "m2")];
    expect(removeModelTags("@Alpha and @Beta", models)).toBe(" and ");
  });

  it("is case insensitive", () => {
    const models = [makeModel("Alpha")];
    expect(removeModelTags("use @alpha here", models)).toBe("use  here");
  });

  it("respects word boundary (followed by punctuation)", () => {
    const models = [makeModel("Alpha")];
    expect(removeModelTags("@Alpha, ok", models)).toBe(", ok");
  });

  it("does not remove when tag continues without boundary", () => {
    const models = [makeModel("Art")];
    expect(removeModelTags("@ArtStyle", models)).toBe("@ArtStyle");
  });

  it("skips models with empty names", () => {
    const models = [makeModel(""), makeModel("Alpha")];
    expect(removeModelTags("@Alpha here", models)).toBe(" here");
  });

  it("longer model name matched first avoids double removal", () => {
    const models = [makeModel("Art", "m1"), makeModel("Art Style", "m2")];
    const result = removeModelTags("@Art Style here", models);
    expect(result).toBe(" here");
  });
});

// --------------- findTagRanges ---------------

describe("findTagRanges", () => {
  it("returns empty when no @ in value", () => {
    expect(findTagRanges("no at", [makeModel("Alpha")])).toEqual([]);
  });

  it("finds a single range", () => {
    const models = [makeModel("Alpha")];
    const ranges = findTagRanges("use @Alpha here", models);
    expect(ranges).toEqual([{ start: 4, end: 10 }]);
  });

  it("finds multiple ranges sorted by position", () => {
    const models = [makeModel("Alpha", "m1"), makeModel("Beta", "m2")];
    const ranges = findTagRanges("@Beta and @Alpha", models);
    expect(ranges).toHaveLength(2);
    expect(ranges[0].start).toBeLessThan(ranges[1].start);
  });

  it("does not match when preceded by alphanumeric", () => {
    const models = [makeModel("Art")];
    const ranges = findTagRanges("smart@Art", models);
    expect(ranges).toEqual([]);
  });

  it("does not match when followed by alphanumeric", () => {
    const models = [makeModel("Art")];
    const ranges = findTagRanges("@ArtStyle", models);
    expect(ranges).toEqual([]);
  });

  it("handles overlapping names (longer wins)", () => {
    const models = [makeModel("Art", "m1"), makeModel("Art Style", "m2")];
    const ranges = findTagRanges("@Art Style here", models);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toEqual({ start: 0, end: 10 }); // "@Art Style"
  });

  it("matches case insensitively", () => {
    const models = [makeModel("Alpha")];
    const ranges = findTagRanges("use @alpha here", models);
    expect(ranges).toHaveLength(1);
  });

  it("skips models with empty names", () => {
    const models = [makeModel(""), makeModel("Alpha")];
    const ranges = findTagRanges("@Alpha here", models);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toEqual({ start: 0, end: 6 });
  });
});

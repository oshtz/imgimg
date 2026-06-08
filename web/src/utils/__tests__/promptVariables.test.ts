import { describe, it, expect } from "vitest";
import { extractVariables, replaceVariables } from "../promptVariables";

describe("extractVariables", () => {
  it("extracts a single variable", () => {
    expect(extractVariables("Hello [WORLD]")).toEqual(["WORLD"]);
  });

  it("extracts multiple variables", () => {
    expect(extractVariables("[A] and [B] and [C]")).toEqual(["A", "B", "C"]);
  });

  it("deduplicates variables preserving first-occurrence order", () => {
    expect(extractVariables("[FOO] then [BAR] then [FOO]")).toEqual(["FOO", "BAR"]);
  });

  it("returns empty array when no variables present", () => {
    expect(extractVariables("no variables here")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(extractVariables("")).toEqual([]);
  });

  it("does not extract nested brackets", () => {
    // [outer [inner]] — the regex [^\[\]]+ won't match "outer " because the inner [ terminates it
    // Only "inner" is captured as a valid variable
    expect(extractVariables("[outer [inner]]")).toEqual(["inner"]);
  });

  it("extracts variables with spaces in names", () => {
    expect(extractVariables("[MY VAR]")).toEqual(["MY VAR"]);
  });

  it("extracts variables adjacent to each other", () => {
    expect(extractVariables("[A][B]")).toEqual(["A", "B"]);
  });

  it("handles variables with special characters", () => {
    expect(extractVariables("[VAR-1] [VAR_2]")).toEqual(["VAR-1", "VAR_2"]);
  });
});

describe("replaceVariables", () => {
  it("replaces a single variable", () => {
    expect(replaceVariables("Hello [NAME]", { NAME: "World" })).toBe("Hello World");
  });

  it("replaces multiple different variables", () => {
    expect(replaceVariables("[A] and [B]", { A: "X", B: "Y" })).toBe("X and Y");
  });

  it("replaces all occurrences of the same variable", () => {
    expect(replaceVariables("[X] then [X]", { X: "done" })).toBe("done then done");
  });

  it("leaves unmatched variables as-is", () => {
    expect(replaceVariables("[A] and [B]", { A: "X" })).toBe("X and [B]");
  });

  it("returns original text when values is empty", () => {
    expect(replaceVariables("[KEEP]", {})).toBe("[KEEP]");
  });

  it("handles replacement with special characters", () => {
    expect(replaceVariables("[X]", { X: "$100 & more" })).toBe("$100 & more");
  });

  it("handles empty replacement value", () => {
    expect(replaceVariables("before [X] after", { X: "" })).toBe("before  after");
  });

  it("handles empty text", () => {
    expect(replaceVariables("", { X: "val" })).toBe("");
  });
});

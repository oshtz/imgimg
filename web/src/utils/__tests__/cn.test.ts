import { describe, it, expect } from "vitest";
import { cn } from "../cn";

describe("cn", () => {
  it("returns a single class string as-is", () => {
    expect(cn("foo")).toBe("foo");
  });

  it("joins multiple class strings", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("filters out falsy values", () => {
    expect(cn("foo", false, null, undefined, 0, "", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    const isActive = true;
    const isHidden = false;
    expect(cn("base", isActive && "active", isHidden && "hidden")).toBe("base active");
  });

  it("handles arrays of classes", () => {
    expect(cn(["foo", "bar"], "baz")).toBe("foo bar baz");
  });

  it("handles object syntax", () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe("foo baz");
  });

  it("returns empty string for no arguments", () => {
    expect(cn()).toBe("");
  });

  it("returns empty string for all-falsy arguments", () => {
    expect(cn(false, null, undefined)).toBe("");
  });
});

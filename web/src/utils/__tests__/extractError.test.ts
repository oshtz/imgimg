import { describe, it, expect } from "vitest";
import { extractError } from "../extractError";

describe("extractError", () => {
  const fallback = "Something went wrong";

  describe("Error objects", () => {
    it("returns the message from a standard Error", () => {
      expect(extractError(new Error("disk full"), fallback)).toBe("disk full");
    });

    it("returns the message from a TypeError", () => {
      expect(extractError(new TypeError("bad type"), fallback)).toBe("bad type");
    });

    it("returns empty string if Error has empty message", () => {
      expect(extractError(new Error(""), fallback)).toBe("");
    });
  });

  describe("Tauri-style error objects", () => {
    it("returns the error string from {error: string}", () => {
      expect(extractError({ error: "connection lost" }, fallback)).toBe("connection lost");
    });

    it("returns the error string from {error: string, kind: string}", () => {
      expect(extractError({ error: "timeout", kind: "network" }, fallback)).toBe("timeout");
    });

    it("returns fallback when error property is a number", () => {
      expect(extractError({ error: 123 }, fallback)).toBe(fallback);
    });

    it("returns fallback when error property is null", () => {
      expect(extractError({ error: null }, fallback)).toBe(fallback);
    });

    it("returns fallback when error property is undefined", () => {
      expect(extractError({ error: undefined }, fallback)).toBe(fallback);
    });
  });

  describe("plain strings", () => {
    it("returns the string directly", () => {
      expect(extractError("raw error text", fallback)).toBe("raw error text");
    });

    it("returns empty string for empty string input", () => {
      expect(extractError("", fallback)).toBe("");
    });
  });

  describe("fallback cases", () => {
    it("returns fallback for null", () => {
      expect(extractError(null, fallback)).toBe(fallback);
    });

    it("returns fallback for undefined", () => {
      expect(extractError(undefined, fallback)).toBe(fallback);
    });

    it("returns fallback for a number", () => {
      expect(extractError(42, fallback)).toBe(fallback);
    });

    it("returns fallback for an object without error key", () => {
      expect(extractError({ message: "nope" }, fallback)).toBe(fallback);
    });

    it("returns fallback for an empty object", () => {
      expect(extractError({}, fallback)).toBe(fallback);
    });

    it("returns fallback for boolean", () => {
      expect(extractError(true, fallback)).toBe(fallback);
    });
  });
});

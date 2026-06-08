// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  usePersistedState,
  usePersistedString,
  usePersistedBoolean,
} from "../usePersistedState";

beforeEach(() => {
  localStorage.clear();
});

describe("usePersistedState", () => {
  it("returns default value when localStorage is empty", () => {
    const { result } = renderHook(() => usePersistedState("key1", 42));
    expect(result.current[0]).toBe(42);
  });

  it("reads existing value from localStorage", () => {
    localStorage.setItem("key2", JSON.stringify({ a: 1 }));
    const { result } = renderHook(() => usePersistedState("key2", {}));
    expect(result.current[0]).toEqual({ a: 1 });
  });

  it("updates localStorage when state changes", () => {
    const { result } = renderHook(() => usePersistedState("key3", "init"));
    act(() => {
      result.current[1]("updated");
    });
    expect(result.current[0]).toBe("updated");
    expect(localStorage.getItem("key3")).toBe(JSON.stringify("updated"));
  });

  it("falls back to default on invalid JSON in localStorage", () => {
    localStorage.setItem("key4", "{{bad json");
    const { result } = renderHook(() => usePersistedState("key4", "fallback"));
    expect(result.current[0]).toBe("fallback");
  });

  it("supports custom serialize/deserialize", () => {
    const { result } = renderHook(() =>
      usePersistedState("key5", new Date("2025-01-01"), {
        serialize: (d) => d.toISOString(),
        deserialize: (s) => new Date(s),
      })
    );
    act(() => {
      result.current[1](new Date("2026-06-15"));
    });
    expect(localStorage.getItem("key5")).toBe("2026-06-15T00:00:00.000Z");
  });

  it("re-reads localStorage when key changes", () => {
    localStorage.setItem("a", JSON.stringify(10));
    localStorage.setItem("b", JSON.stringify(20));
    const { result, rerender } = renderHook(
      ({ key }) => usePersistedState(key, 0),
      { initialProps: { key: "a" } }
    );
    expect(result.current[0]).toBe(10);
    rerender({ key: "b" });
    expect(result.current[0]).toBe(20);
  });

  it("returns default when key changes to one with no stored value", () => {
    localStorage.setItem("exists", JSON.stringify(99));
    const { result, rerender } = renderHook(
      ({ key }) => usePersistedState(key, 0),
      { initialProps: { key: "exists" } }
    );
    expect(result.current[0]).toBe(99);
    rerender({ key: "missing" });
    expect(result.current[0]).toBe(0);
  });

  it("custom serialize/deserialize with complex objects", () => {
    const serialize = (v: { x: number; y: number }) => `${v.x},${v.y}`;
    const deserialize = (raw: string) => {
      const [x, y] = raw.split(",").map(Number);
      return { x, y };
    };
    localStorage.setItem("point", "10,20");
    const { result } = renderHook(() =>
      usePersistedState("point", { x: 0, y: 0 }, { serialize, deserialize })
    );
    expect(result.current[0]).toEqual({ x: 10, y: 20 });
    act(() => {
      result.current[1]({ x: 5, y: 15 });
    });
    expect(localStorage.getItem("point")).toBe("5,15");
  });

  it("localStorage.setItem error (storage full) does not throw", () => {
    const originalSetItem = localStorage.setItem;
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });

    // Should not throw when setting state
    const { result } = renderHook(() => usePersistedState("full-key", "init"));
    expect(() => {
      act(() => {
        result.current[1]("new value");
      });
    }).not.toThrow();
    expect(result.current[0]).toBe("new value");

    spy.mockRestore();
  });

  it("default value when localStorage has corrupted data", () => {
    localStorage.setItem("corrupt", "not-valid-json{{{");
    const { result } = renderHook(() => usePersistedState("corrupt", [1, 2, 3]));
    expect(result.current[0]).toEqual([1, 2, 3]);
  });

  it("multiple instances with different keys do not interfere", () => {
    const { result: result1 } = renderHook(() =>
      usePersistedState("multi-a", "alpha")
    );
    const { result: result2 } = renderHook(() =>
      usePersistedState("multi-b", "beta")
    );

    act(() => {
      result1.current[1]("changed-a");
    });

    expect(result1.current[0]).toBe("changed-a");
    expect(result2.current[0]).toBe("beta");
    expect(localStorage.getItem("multi-a")).toBe(JSON.stringify("changed-a"));
    expect(localStorage.getItem("multi-b")).toBe(JSON.stringify("beta"));
  });
});

describe("usePersistedString", () => {
  it("returns default string when localStorage is empty", () => {
    const { result } = renderHook(() => usePersistedString("str1", "hello"));
    expect(result.current[0]).toBe("hello");
  });

  it("reads raw string from localStorage (no JSON wrapping)", () => {
    localStorage.setItem("str2", "world");
    const { result } = renderHook(() => usePersistedString("str2", "default"));
    expect(result.current[0]).toBe("world");
  });

  it("stores raw string to localStorage", () => {
    const { result } = renderHook(() => usePersistedString("str3", ""));
    act(() => {
      result.current[1]("saved");
    });
    expect(localStorage.getItem("str3")).toBe("saved");
  });

  it("returns a string type", () => {
    const { result } = renderHook(() => usePersistedString("str4", "test"));
    expect(typeof result.current[0]).toBe("string");
  });

  it("returns raw string without JSON parsing", () => {
    // A JSON-looking string should be returned as-is, not parsed
    localStorage.setItem("str-json", '{"key":"value"}');
    const { result } = renderHook(() => usePersistedString("str-json", ""));
    expect(result.current[0]).toBe('{"key":"value"}');
    expect(typeof result.current[0]).toBe("string");
  });
});

describe("usePersistedBoolean", () => {
  it("returns default boolean when localStorage is empty", () => {
    const { result } = renderHook(() => usePersistedBoolean("bool1", false));
    expect(result.current[0]).toBe(false);
  });

  it("reads true from localStorage", () => {
    localStorage.setItem("bool2", "true");
    const { result } = renderHook(() => usePersistedBoolean("bool2", false));
    expect(result.current[0]).toBe(true);
  });

  it("reads false from localStorage", () => {
    localStorage.setItem("bool3", "false");
    const { result } = renderHook(() => usePersistedBoolean("bool3", true));
    expect(result.current[0]).toBe(false);
  });

  it("stores boolean as 'true'/'false' string", () => {
    const { result } = renderHook(() => usePersistedBoolean("bool4", false));
    act(() => {
      result.current[1](true);
    });
    expect(localStorage.getItem("bool4")).toBe("true");
  });

  it("returns a boolean type", () => {
    const { result } = renderHook(() => usePersistedBoolean("bool5", true));
    expect(typeof result.current[0]).toBe("boolean");
  });

  it("serializes false as 'false' string", () => {
    const { result } = renderHook(() => usePersistedBoolean("bool6", true));
    act(() => {
      result.current[1](false);
    });
    expect(localStorage.getItem("bool6")).toBe("false");
  });

  it("treats non-'true' strings as false", () => {
    localStorage.setItem("bool7", "anything");
    const { result } = renderHook(() => usePersistedBoolean("bool7", true));
    expect(result.current[0]).toBe(false);
  });
});

describe("usePersistedState key change edge cases", () => {
  it("falls back to default when key changes and new key has invalid JSON (catch branch)", () => {
    localStorage.setItem("good-key", JSON.stringify(42));
    localStorage.setItem("bad-key", "{{invalid-json");

    const { result, rerender } = renderHook(
      ({ key }) => usePersistedState(key, 99),
      { initialProps: { key: "good-key" } }
    );
    expect(result.current[0]).toBe(42);

    // Switch to key with bad JSON - should catch and fall back to default
    rerender({ key: "bad-key" });
    expect(result.current[0]).toBe(99);
  });
});

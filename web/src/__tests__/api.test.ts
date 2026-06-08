import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock localStorage
const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
});

import { getSessionId, buildAuthHeaders } from "../api";

describe("getSessionId", () => {
  beforeEach(() => {
    storage.clear();
  });

  it("returns a string", () => {
    const id = getSessionId();
    expect(typeof id).toBe("string");
  });

  it("returns same value on subsequent calls (cached in localStorage)", () => {
    const first = getSessionId();
    const second = getSessionId();
    expect(first).toBe(second);
  });

  it("uses localStorage key 'imgimg.sessionId.v1'", () => {
    getSessionId();
    expect(storage.has("imgimg.sessionId.v1")).toBe(true);
  });

  it("reads existing session id from localStorage", () => {
    storage.set("imgimg.sessionId.v1", "my-custom-id");
    const id = getSessionId();
    expect(id).toBe("my-custom-id");
  });

  it("generates a non-empty session id", () => {
    const id = getSessionId();
    expect(id).toBeTruthy();
    expect((id as string).length).toBeGreaterThan(0);
  });
});

describe("buildAuthHeaders", () => {
  it("returns an object", () => {
    const headers = buildAuthHeaders();
    expect(typeof headers).toBe("object");
  });

  it("currently returns empty object", () => {
    const headers = buildAuthHeaders();
    expect(headers).toEqual({});
  });

  it("returns a Record<string, string>", () => {
    const headers = buildAuthHeaders();
    expect(Object.keys(headers)).toHaveLength(0);
  });
});

describe("getSessionId edge cases", () => {
  beforeEach(() => {
    storage.clear();
  });

  it("returns null when localStorage throws", () => {
    // Override getItem to throw
    const origGetItem = localStorage.getItem;
    (localStorage as any).getItem = () => { throw new Error("SecurityError"); };

    const id = getSessionId();
    expect(id).toBeNull();

    (localStorage as any).getItem = origGetItem;
  });

  it("uses fallback ID generation when crypto.randomUUID is unavailable", () => {
    // Save original crypto
    const origCrypto = globalThis.crypto;
    // Replace crypto with one that has no randomUUID
    Object.defineProperty(globalThis, "crypto", {
      value: {},
      writable: true,
      configurable: true,
    });

    storage.clear();
    const id = getSessionId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");
    expect((id as string).startsWith("sess_")).toBe(true);

    // Restore
    Object.defineProperty(globalThis, "crypto", {
      value: origCrypto,
      writable: true,
      configurable: true,
    });
  });
});

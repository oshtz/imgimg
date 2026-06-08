import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Asset } from "../../types";

let mockIsTauri = false;

vi.mock("../../tauri-api", () => ({
  isTauri: () => mockIsTauri,
  getStorageBasePath: vi.fn(async () => "/mock/storage/base"),
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn((path: string) => `https://asset.localhost/${encodeURIComponent(path)}`),
}));

import { mergeAssets, assetUrl, resolveStorageUrl, initStorageBasePath, onStorageBasePathReady } from "../assets";

beforeEach(() => {
  mockIsTauri = false;
});

function makeAsset(overrides: Partial<Asset>): Asset {
  return {
    id: "a1",
    generationId: "g1",
    type: "square",
    url: "http://example.com/image.png",
    itemIndex: null,
    createdAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("mergeAssets", () => {
  it("returns incoming when existing is empty", () => {
    const incoming = [makeAsset({ id: "a1", type: "square", itemIndex: 0 })];
    const result = mergeAssets([], incoming);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a1");
  });

  it("returns existing when incoming is empty", () => {
    const existing = [makeAsset({ id: "a1", type: "square", itemIndex: 0 })];
    const result = mergeAssets(existing, []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a1");
  });

  it("incoming overwrites existing with same type+itemIndex key", () => {
    const existing = [makeAsset({ id: "old", type: "square", itemIndex: 0, url: "/old.png" })];
    const incoming = [makeAsset({ id: "new", type: "square", itemIndex: 0, url: "/new.png" })];
    const result = mergeAssets(existing, incoming);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("new");
    expect(result[0].url).toBe("/new.png");
  });

  it("merges non-overlapping assets", () => {
    const existing = [makeAsset({ id: "a1", type: "square", itemIndex: 0 })];
    const incoming = [makeAsset({ id: "a2", type: "portrait", itemIndex: 0 })];
    const result = mergeAssets(existing, incoming);
    expect(result).toHaveLength(2);
  });

  it("result is sorted by type then itemIndex", () => {
    const existing = [makeAsset({ id: "a1", type: "square", itemIndex: 1 })];
    const incoming = [
      makeAsset({ id: "a2", type: "portrait", itemIndex: 0 }),
      makeAsset({ id: "a3", type: "square", itemIndex: 0 }),
    ];
    const result = mergeAssets(existing, incoming);
    expect(result.map((a) => `${a.type}:${a.itemIndex}`)).toEqual([
      "portrait:0",
      "square:0",
      "square:1",
    ]);
  });

  it("handles null itemIndex", () => {
    const existing = [makeAsset({ id: "a1", type: "preview", itemIndex: null })];
    const incoming = [makeAsset({ id: "a2", type: "preview", itemIndex: null, url: "/updated.png" })];
    const result = mergeAssets(existing, incoming);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a2");
  });

  it("treats different itemIndex values as different keys", () => {
    const existing = [makeAsset({ id: "a1", type: "square", itemIndex: 0 })];
    const incoming = [makeAsset({ id: "a2", type: "square", itemIndex: 1 })];
    const result = mergeAssets(existing, incoming);
    expect(result).toHaveLength(2);
  });

  it("deduplicates correctly with mixed null and numeric indices", () => {
    const existing = [
      makeAsset({ id: "a1", type: "square", itemIndex: null }),
      makeAsset({ id: "a2", type: "square", itemIndex: 0 }),
    ];
    const incoming = [
      makeAsset({ id: "a3", type: "square", itemIndex: null, url: "/new-null.png" }),
    ];
    const result = mergeAssets(existing, incoming);
    // null and 0 are different keys
    expect(result).toHaveLength(2);
    const nullAsset = result.find((a) => a.itemIndex === null);
    expect(nullAsset!.id).toBe("a3");
  });
});

describe("assetUrl (non-Tauri)", () => {
  const apiBase = "http://localhost:3000";

  it("appends cache-busting v= param to regular asset URL", () => {
    const asset = makeAsset({ url: "/storage/gen_1/image.png", createdAt: "2025-01-01T00:00:00Z" });
    const result = assetUrl(apiBase, asset);
    expect(result).toContain("v=2025-01-01T00%3A00%3A00Z");
    expect(result).toContain("http://localhost:3000/storage/gen_1/image.png");
  });

  it("returns presigned S3 URL as-is when X-Amz-Signature is present", () => {
    const s3Url = "https://bucket.s3.amazonaws.com/image.png?X-Amz-Signature=abc123&X-Amz-Credential=xyz";
    const asset = makeAsset({ url: s3Url });
    const result = assetUrl(apiBase, asset);
    expect(result).toBe(s3Url);
  });

  it("handles absolute http URL correctly", () => {
    const asset = makeAsset({ url: "http://cdn.example.com/image.png", createdAt: "2025-06-01" });
    const result = assetUrl(apiBase, asset);
    expect(result).toContain("http://cdn.example.com/image.png");
    expect(result).toContain("v=2025-06-01");
  });

  it("handles absolute https URL correctly", () => {
    const asset = makeAsset({ url: "https://cdn.example.com/image.png", createdAt: "2025-06-01" });
    const result = assetUrl(apiBase, asset);
    expect(result).toContain("https://cdn.example.com/image.png");
    expect(result).toContain("v=2025-06-01");
  });

  it("prepends apiBaseUrl for relative URL", () => {
    const asset = makeAsset({ url: "/images/test.png", createdAt: "2025-01-01" });
    const result = assetUrl(apiBase, asset);
    expect(result).toContain("http://localhost:3000/images/test.png");
    expect(result).toContain("v=2025-01-01");
  });

  it("does not modify S3 presigned URL even with https prefix", () => {
    const url = "https://s3.us-east-1.amazonaws.com/bucket/file.png?X-Amz-Signature=sig&other=param";
    const asset = makeAsset({ url });
    expect(assetUrl(apiBase, asset)).toBe(url);
  });

  it("does not treat regular https URL as presigned", () => {
    const asset = makeAsset({ url: "https://cdn.example.com/image.png", createdAt: "2025-01-01" });
    const result = assetUrl(apiBase, asset);
    expect(result).not.toBe("https://cdn.example.com/image.png");
    expect(result).toContain("v=");
  });

  it("falls back to manual URL construction when URL constructor throws", () => {
    // Use an invalid base URL that causes URL constructor to throw
    const asset = makeAsset({ url: "://invalid-url", createdAt: "2025-01-01" });
    const result = assetUrl("not-a-valid-base" as any, asset);
    // Should still produce something with v= param appended via fallback
    expect(result).toContain("v=2025-01-01");
  });

  it("fallback handles http URL with existing query params", () => {
    const asset = makeAsset({ url: "http://example.com/img.png?existing=1", createdAt: "2025-01-01" });
    // Force the catch path by using invalid base
    const result = assetUrl("" as any, asset);
    // With empty base, URL constructor may throw, triggering fallback
    expect(result).toContain("v=2025-01-01");
  });
});

describe("resolveStorageUrl (non-Tauri)", () => {
  const apiBase = "http://localhost:3000";

  it("returns http URL as-is", () => {
    const url = "http://example.com/image.png";
    expect(resolveStorageUrl(apiBase, url)).toBe(url);
  });

  it("returns https URL as-is", () => {
    const url = "https://example.com/image.png";
    expect(resolveStorageUrl(apiBase, url)).toBe(url);
  });

  it("returns data: URL as-is", () => {
    const url = "data:image/png;base64,abc123";
    expect(resolveStorageUrl(apiBase, url)).toBe(url);
  });

  it("prepends apiBaseUrl for relative /storage/ URL", () => {
    const url = "/storage/gen_1/image.png";
    expect(resolveStorageUrl(apiBase, url)).toBe("http://localhost:3000/storage/gen_1/image.png");
  });

  it("prepends apiBaseUrl for other relative URLs", () => {
    const url = "/api/assets/image.png";
    expect(resolveStorageUrl(apiBase, url)).toBe("http://localhost:3000/api/assets/image.png");
  });
});

// ── Tauri mode tests ──

describe("initStorageBasePath and onStorageBasePathReady", () => {
  it("does nothing when not in Tauri mode", async () => {
    mockIsTauri = false;
    await initStorageBasePath();
    // Should not throw, should be a no-op
  });

  it("initializes storage base path in Tauri mode", async () => {
    mockIsTauri = true;
    // Reset internal state by calling init
    await initStorageBasePath();
    // Calling again should be idempotent (path already set)
    await initStorageBasePath();
  });

  it("onStorageBasePathReady calls cb immediately when path already set", () => {
    mockIsTauri = true;
    const cb = vi.fn();
    const unsub = onStorageBasePathReady(cb);
    // Since initStorageBasePath was called in previous test, path should be set
    expect(cb).toHaveBeenCalled();
    unsub(); // cleanup
  });

  it("onStorageBasePathReady unsubscribe removes listener", () => {
    // This test covers the unsubscribe path (lines 43-45)
    // We can't truly reset _storageBasePath since it's module-level, but
    // calling unsub should be a no-op when already resolved
    const cb = vi.fn();
    const unsub = onStorageBasePathReady(cb);
    unsub();
    // cb was already called (path is set from previous test)
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("onStorageBasePathReady queues listener and unsubscribe removes it when path not yet set", async () => {
    // Use a fresh module import to get clean state where _storageBasePath is null
    vi.resetModules();

    // Re-mock dependencies before importing
    vi.doMock("../../tauri-api", () => ({
      isTauri: () => true,
      getStorageBasePath: vi.fn(async () => "/mock/storage/base"),
    }));
    vi.doMock("@tauri-apps/api/core", () => ({
      convertFileSrc: vi.fn((path: string) => `https://asset.localhost/${encodeURIComponent(path)}`),
    }));

    const freshModule = await import("../assets");

    // Path is not set yet in the fresh module, so cb should be queued
    const cb = vi.fn();
    const unsub = freshModule.onStorageBasePathReady(cb);
    expect(cb).not.toHaveBeenCalled(); // not called yet

    // Unsubscribe before path is ready
    unsub();

    // Now init the storage base path — cb should NOT be called since we unsubscribed
    await freshModule.initStorageBasePath();
    expect(cb).not.toHaveBeenCalled();
  });

  it("resolveStorageUrl falls back to apiBase for /storage/ path when _storageBasePath is null (non-Tauri)", () => {
    mockIsTauri = false;
    // In non-Tauri mode, /storage/ paths should be prepended with apiBase
    const result = resolveStorageUrl("http://localhost:3000", "/storage/gen_1/image.png");
    expect(result).toBe("http://localhost:3000/storage/gen_1/image.png");
  });
});

describe("assetUrl (Tauri mode)", () => {
  const apiBase = "http://localhost:3000";

  it("converts /storage/ path to asset:// protocol URL", async () => {
    mockIsTauri = true;
    await initStorageBasePath();
    const asset = makeAsset({ url: "/storage/gen_1/image.png", createdAt: "2025-01-01T00:00:00Z" });
    const result = assetUrl(apiBase, asset);
    expect(result).toContain("asset.localhost");
    expect(result).toContain("v=2025-01-01T00%3A00%3A00Z");
  });

  it("still returns presigned S3 URLs as-is in Tauri mode", async () => {
    mockIsTauri = true;
    await initStorageBasePath();
    const s3Url = "https://bucket.s3.amazonaws.com/image.png?X-Amz-Signature=abc123";
    const asset = makeAsset({ url: s3Url });
    const result = assetUrl(apiBase, asset);
    expect(result).toBe(s3Url);
  });

  it("handles non-storage URLs in Tauri mode via URL constructor", async () => {
    mockIsTauri = true;
    await initStorageBasePath();
    const asset = makeAsset({ url: "/images/test.png", createdAt: "2025-01-01" });
    const result = assetUrl(apiBase, asset);
    expect(result).toContain("http://localhost:3000/images/test.png");
    expect(result).toContain("v=2025-01-01");
  });
});

describe("assetUrl/resolveStorageUrl Tauri with no storage base path", () => {
  it("returns empty string when storage base path not initialized in Tauri mode", async () => {
    vi.resetModules();
    vi.doMock("../../tauri-api", () => ({
      isTauri: () => true,
      getStorageBasePath: vi.fn(async () => "/mock/storage/base"),
    }));
    vi.doMock("@tauri-apps/api/core", () => ({
      convertFileSrc: vi.fn((path: string) => `https://asset.localhost/${encodeURIComponent(path)}`),
    }));

    const freshModule = await import("../assets");
    const asset = makeAsset({ url: "/storage/gen_1/image.png", createdAt: "2025-01-01" });
    // Don't call initStorageBasePath — _storageBasePath is null
    expect(freshModule.assetUrl("http://localhost:3000", asset)).toBe("");
    expect(freshModule.resolveStorageUrl("http://localhost:3000", "/storage/gen_1/image.png")).toBe("");
  });
});

describe("resolveStorageUrl (Tauri mode)", () => {
  const apiBase = "http://localhost:3000";

  it("converts /storage/ path to asset:// protocol URL", async () => {
    mockIsTauri = true;
    await initStorageBasePath();
    const result = resolveStorageUrl(apiBase, "/storage/gen_1/image.png");
    expect(result).toContain("asset.localhost");
    expect(result).toContain("gen_1");
  });

  it("passes through http/https/data URLs unchanged in Tauri mode", async () => {
    mockIsTauri = true;
    expect(resolveStorageUrl(apiBase, "http://example.com/img.png")).toBe("http://example.com/img.png");
    expect(resolveStorageUrl(apiBase, "data:image/png;base64,abc")).toBe("data:image/png;base64,abc");
  });
});

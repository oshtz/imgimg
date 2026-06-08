// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock localStorage
const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
});

// Mock buildAuthHeaders used by fetchImageViaProxy
vi.mock("../../../client", () => ({
  buildAuthHeaders: () => ({ Authorization: "Bearer test-token" }),
}));

import {
  layerStateStorageKey,
  readLayerStateFromStorage,
  findOpaqueBounds,
  downloadBlob,
  loadImage,
  canvasToBlob,
  fetchImageViaProxy,
} from "../layerUtils";

beforeEach(() => {
  storage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  // Re-stub localStorage since it's needed globally
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  });
});

// ── layerStateStorageKey ──

describe("layerStateStorageKey", () => {
  it("returns prefixed key with generation id", () => {
    expect(layerStateStorageKey("gen-123")).toBe("imgimg.layerState.v1:gen-123");
  });

  it("handles empty string id", () => {
    expect(layerStateStorageKey("")).toBe("imgimg.layerState.v1:");
  });

  it("handles special characters in id", () => {
    expect(layerStateStorageKey("gen/123:abc")).toBe("imgimg.layerState.v1:gen/123:abc");
  });
});

// ── readLayerStateFromStorage ──

describe("readLayerStateFromStorage", () => {
  it("returns empty object when nothing is stored", () => {
    expect(readLayerStateFromStorage("gen-1")).toEqual({});
  });

  it("returns empty object when stored value is null-ish", () => {
    storage.set("imgimg.layerState.v1:gen-1", "null");
    expect(readLayerStateFromStorage("gen-1")).toEqual({});
  });

  it("returns empty object for invalid JSON", () => {
    storage.set("imgimg.layerState.v1:gen-1", "not json{{{");
    expect(readLayerStateFromStorage("gen-1")).toEqual({});
  });

  it("returns empty object for non-object JSON (array)", () => {
    storage.set("imgimg.layerState.v1:gen-1", "[1,2,3]");
    // arrays pass typeof === "object" but the entries loop still works;
    // however numeric keys with non-object values get skipped
    const result = readLayerStateFromStorage("gen-1");
    expect(result).toEqual({});
  });

  it("parses valid layer state correctly", () => {
    const state = {
      "layer-a": { x: 10, y: 20, scale: 1.5, visible: true },
      "layer-b": { x: -5, y: 0, scale: 0.5, visible: false },
    };
    storage.set("imgimg.layerState.v1:gen-1", JSON.stringify(state));
    const result = readLayerStateFromStorage("gen-1");
    expect(result).toEqual(state);
  });

  it("defaults missing x/y to 0", () => {
    storage.set("imgimg.layerState.v1:gen-1", JSON.stringify({
      "layer-a": { scale: 1, visible: true },
    }));
    const result = readLayerStateFromStorage("gen-1");
    expect(result["layer-a"].x).toBe(0);
    expect(result["layer-a"].y).toBe(0);
  });

  it("defaults missing scale to 1", () => {
    storage.set("imgimg.layerState.v1:gen-1", JSON.stringify({
      "layer-a": { x: 0, y: 0, visible: true },
    }));
    const result = readLayerStateFromStorage("gen-1");
    expect(result["layer-a"].scale).toBe(1);
  });

  it("defaults zero or negative scale to 1", () => {
    storage.set("imgimg.layerState.v1:gen-1", JSON.stringify({
      "layer-a": { x: 0, y: 0, scale: 0, visible: true },
      "layer-b": { x: 0, y: 0, scale: -2, visible: true },
    }));
    const result = readLayerStateFromStorage("gen-1");
    expect(result["layer-a"].scale).toBe(1);
    expect(result["layer-b"].scale).toBe(1);
  });

  it("defaults missing visible to true", () => {
    storage.set("imgimg.layerState.v1:gen-1", JSON.stringify({
      "layer-a": { x: 0, y: 0, scale: 1 },
    }));
    const result = readLayerStateFromStorage("gen-1");
    expect(result["layer-a"].visible).toBe(true);
  });

  it("skips entries where value is not an object", () => {
    storage.set("imgimg.layerState.v1:gen-1", JSON.stringify({
      "layer-a": "not-an-object",
      "layer-b": 42,
      "layer-c": null,
      "layer-d": { x: 5, y: 5, scale: 1, visible: true },
    }));
    const result = readLayerStateFromStorage("gen-1");
    expect(Object.keys(result)).toEqual(["layer-d"]);
    expect(result["layer-d"].x).toBe(5);
  });

  it("handles NaN and Infinity values by defaulting to 0/1", () => {
    storage.set("imgimg.layerState.v1:gen-1", JSON.stringify({
      "layer-a": { x: "not-a-number", y: null, scale: "Infinity", visible: "yes" },
    }));
    const result = readLayerStateFromStorage("gen-1");
    expect(result["layer-a"].x).toBe(0);
    expect(result["layer-a"].y).toBe(0);
    expect(result["layer-a"].scale).toBe(1);
    expect(result["layer-a"].visible).toBe(true); // non-boolean defaults to true
  });
});

// ── findOpaqueBounds ──

describe("findOpaqueBounds", () => {
  it("returns full dimensions for all-transparent image", () => {
    const width = 4, height = 4;
    const data = new Uint8ClampedArray(width * height * 4); // all zeros
    const bounds = findOpaqueBounds(data, width, height);
    expect(bounds).toEqual({ left: 0, top: 0, width: 4, height: 4 });
  });

  it("returns full dimensions for fully opaque image", () => {
    const width = 4, height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255;     // R
      data[i + 1] = 255; // G
      data[i + 2] = 255; // B
      data[i + 3] = 255; // A
    }
    const bounds = findOpaqueBounds(data, width, height);
    expect(bounds).toEqual({ left: 0, top: 0, width: 4, height: 4 });
  });

  it("finds bounds of center 2x2 opaque region in 4x4 image", () => {
    const width = 4, height = 4;
    const data = new Uint8ClampedArray(width * height * 4); // all transparent
    // Set center pixels (1,1), (2,1), (1,2), (2,2) to opaque
    for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2]]) {
      const i = (y * width + x) * 4;
      data[i] = 255;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
    const bounds = findOpaqueBounds(data, width, height);
    expect(bounds).toEqual({ left: 1, top: 1, width: 2, height: 2 });
  });

  it("finds bounds of single opaque pixel", () => {
    const width = 8, height = 8;
    const data = new Uint8ClampedArray(width * height * 4);
    // Single pixel at (3, 5)
    const i = (5 * width + 3) * 4;
    data[i] = 128;
    data[i + 1] = 128;
    data[i + 2] = 128;
    data[i + 3] = 255;
    const bounds = findOpaqueBounds(data, width, height);
    expect(bounds).toEqual({ left: 3, top: 5, width: 1, height: 1 });
  });

  it("finds bounds of top-left corner pixel", () => {
    const width = 4, height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    data[0] = 255;
    data[1] = 0;
    data[2] = 0;
    data[3] = 255; // pixel (0,0)
    const bounds = findOpaqueBounds(data, width, height);
    expect(bounds).toEqual({ left: 0, top: 0, width: 1, height: 1 });
  });

  it("finds bounds of bottom-right corner pixel", () => {
    const width = 4, height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    const i = (3 * width + 3) * 4; // pixel (3,3)
    data[i] = 255;
    data[i + 1] = 0;
    data[i + 2] = 0;
    data[i + 3] = 255;
    const bounds = findOpaqueBounds(data, width, height);
    expect(bounds).toEqual({ left: 3, top: 3, width: 1, height: 1 });
  });

  it("finds bounds for a horizontal line of pixels", () => {
    const width = 8, height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    // Row 2, columns 1-6
    for (let x = 1; x <= 6; x++) {
      const i = (2 * width + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
    const bounds = findOpaqueBounds(data, width, height);
    expect(bounds).toEqual({ left: 1, top: 2, width: 6, height: 1 });
  });

  it("finds bounds for a vertical line of pixels", () => {
    const width = 4, height = 8;
    const data = new Uint8ClampedArray(width * height * 4);
    // Column 1, rows 2-5
    for (let y = 2; y <= 5; y++) {
      const i = (y * width + 1) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
    const bounds = findOpaqueBounds(data, width, height);
    expect(bounds).toEqual({ left: 1, top: 2, width: 1, height: 4 });
  });

  it("ignores pixels below alpha threshold", () => {
    const width = 4, height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    // One strongly opaque pixel at (1,1)
    const i1 = (1 * width + 1) * 4;
    data[i1] = 255;
    data[i1 + 3] = 255;
    // One very faint pixel at (3,3) -- alpha = 5, below threshold of max(12, 255*0.08=20)
    const i2 = (3 * width + 3) * 4;
    data[i2] = 255;
    data[i2 + 3] = 5;
    const bounds = findOpaqueBounds(data, width, height);
    // The faint pixel should be ignored since 5 < 20
    expect(bounds).toEqual({ left: 1, top: 1, width: 1, height: 1 });
  });

  it("handles 1x1 image with opaque pixel", () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255]);
    const bounds = findOpaqueBounds(data, 1, 1);
    expect(bounds).toEqual({ left: 0, top: 0, width: 1, height: 1 });
  });

  it("handles 1x1 image with transparent pixel", () => {
    const data = new Uint8ClampedArray([0, 0, 0, 0]);
    const bounds = findOpaqueBounds(data, 1, 1);
    expect(bounds).toEqual({ left: 0, top: 0, width: 1, height: 1 });
  });

  it("uses adaptive threshold based on max alpha", () => {
    const width = 4, height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    // Max alpha is 100, so threshold = max(12, floor(100 * 0.08)) = max(12, 8) = 12
    // Pixel at (0,0) with alpha 100
    data[3] = 100;
    // Pixel at (3,3) with alpha 11 (below threshold 12)
    const i = (3 * width + 3) * 4;
    data[i + 3] = 11;
    const bounds = findOpaqueBounds(data, width, height);
    // Only the first pixel should count
    expect(bounds).toEqual({ left: 0, top: 0, width: 1, height: 1 });
  });

  it("includes pixel at threshold boundary", () => {
    const width = 4, height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    // Max alpha = 255, threshold = max(12, floor(255*0.08)) = max(12, 20) = 20
    // Pixel at (0,0) with alpha 255
    data[3] = 255;
    // Pixel at (3,3) with alpha exactly 20 (at threshold)
    const i = (3 * width + 3) * 4;
    data[i + 3] = 20;
    const bounds = findOpaqueBounds(data, width, height);
    // Both pixels should be included since alpha >= threshold
    expect(bounds).toEqual({ left: 0, top: 0, width: 4, height: 4 });
  });
});

// ── downloadBlob ──

describe("downloadBlob", () => {
  it("creates an object URL, sets link attributes, clicks, and revokes after timeout", () => {
    const fakeUrl = "blob:http://localhost/fake-url";
    const createObjectURLMock = vi.fn(() => fakeUrl);
    const revokeObjectURLMock = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: createObjectURLMock,
      revokeObjectURL: revokeObjectURLMock,
    });

    const clickMock = vi.fn();
    const fakeLink = { href: "", download: "", click: clickMock };
    const createElementMock = vi.fn(() => fakeLink);
    vi.stubGlobal("document", { createElement: createElementMock });

    const blob = new Blob(["test data"], { type: "text/plain" });
    downloadBlob(blob, "test-file.txt");

    expect(createObjectURLMock).toHaveBeenCalledWith(blob);
    expect(createElementMock).toHaveBeenCalledWith("a");
    expect(fakeLink.href).toBe(fakeUrl);
    expect(fakeLink.download).toBe("test-file.txt");
    expect(clickMock).toHaveBeenCalledOnce();

    // revokeObjectURL is called after a timeout
    expect(revokeObjectURLMock).not.toHaveBeenCalled();
    vi.useFakeTimers();
    // Re-run to use fake timers
    downloadBlob(blob, "test-file2.txt");
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURLMock).toHaveBeenCalledWith(fakeUrl);
    vi.useRealTimers();
  });
});

// ── canvasToBlob ──

describe("canvasToBlob", () => {
  it("resolves with blob when toBlob succeeds", async () => {
    const testBlob = new Blob(["canvas-data"]);
    const mockCanvas = {
      toBlob: vi.fn((cb: (blob: Blob | null) => void, type: string) => {
        cb(testBlob);
      }),
    } as unknown as HTMLCanvasElement;

    const result = await canvasToBlob(mockCanvas, "image/png");
    expect(result).toBe(testBlob);
    expect(mockCanvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png");
  });

  it("rejects when toBlob returns null", async () => {
    const mockCanvas = {
      toBlob: vi.fn((cb: (blob: Blob | null) => void) => {
        cb(null);
      }),
    } as unknown as HTMLCanvasElement;

    await expect(canvasToBlob(mockCanvas, "image/png")).rejects.toThrow(
      "Failed to export canvas"
    );
  });
});

// ── loadImage ──

describe("loadImage", () => {
  it("resolves with image on successful load", async () => {
    // Mock Image constructor
    const originalImage = globalThis.Image;
    let capturedImg: any;
    vi.stubGlobal("Image", class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = "";
      src = "";
      decode = vi.fn(() => new Promise<void>((resolve) => {
        // decode resolves, triggering settle
        setTimeout(resolve, 0);
      }));
      constructor() {
        capturedImg = this;
      }
    });

    const promise = loadImage("http://example.com/image.png");

    // Trigger onload
    expect(capturedImg.crossOrigin).toBe("anonymous");
    expect(capturedImg.src).toBe("http://example.com/image.png");
    capturedImg.onload!();

    const img = await promise;
    expect(img).toBe(capturedImg);
  });

  it("rejects on error", async () => {
    let capturedImg: any;
    vi.stubGlobal("Image", class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = "";
      src = "";
      decode = vi.fn(() => new Promise<void>(() => {})); // never resolves
      constructor() {
        capturedImg = this;
      }
    });

    const promise = loadImage("http://example.com/bad.png");
    capturedImg.onerror!();

    await expect(promise).rejects.toThrow("Failed to load image: http://example.com/bad.png");
  });

  it("resolves via decode if onload not called", async () => {
    let capturedImg: any;
    let decodeResolve: () => void;
    vi.stubGlobal("Image", class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = "";
      src = "";
      decode = vi.fn(() => new Promise<void>((res) => {
        decodeResolve = res;
      }));
      constructor() {
        capturedImg = this;
      }
    });

    const promise = loadImage("http://example.com/img.png");
    // Resolve decode without calling onload
    decodeResolve!();

    const img = await promise;
    expect(img).toBe(capturedImg);
  });

  it("resolves without decode when img.decode is undefined", async () => {
    let capturedImg: any;
    vi.stubGlobal("Image", class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = "";
      src = "";
      decode: undefined = undefined; // No decode method
      constructor() {
        capturedImg = this;
      }
    });

    const promise = loadImage("http://example.com/no-decode.png");
    capturedImg.onload!();

    const img = await promise;
    expect(img).toBe(capturedImg);
  });
});

// ── fetchImageViaProxy ──

describe("fetchImageViaProxy", () => {
  it("calls fetch with correct URL and returns blob URL", async () => {
    const fakeBlob = new Blob(["image-data"]);
    const fakeUrl = "blob:http://localhost/proxy-blob";

    const fetchMock = vi.fn(async () => ({
      ok: true,
      blob: async () => fakeBlob,
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => fakeUrl),
      revokeObjectURL: vi.fn(),
    });

    const asset = { id: "asset-1", generationId: "gen-1" } as any;
    const result = await fetchImageViaProxy("http://api.test" as any, asset);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/generations/gen-1/assets/asset-1/raw",
      expect.objectContaining({
        headers: { Authorization: "Bearer test-token" },
        credentials: "include",
      })
    );
    expect(result).toBe(fakeUrl);
  });

  it("throws on non-ok response", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 404,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const asset = { id: "asset-2", generationId: "gen-2" } as any;
    await expect(
      fetchImageViaProxy("http://api.test" as any, asset)
    ).rejects.toThrow("Failed to fetch image via proxy: 404");
  });

  it("encodes special characters in URL", async () => {
    const fakeBlob = new Blob(["data"]);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      blob: async () => fakeBlob,
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:url"),
      revokeObjectURL: vi.fn(),
    });

    const asset = { id: "a/b c", generationId: "g/1 2" } as any;
    await fetchImageViaProxy("http://api.test" as any, asset);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/generations/g%2F1%202/assets/a%2Fb%20c/raw",
      expect.any(Object)
    );
  });
});

// ── Canvas/Image mock helpers ──

function makePixelData(width: number, height: number, opts: { allOpaque?: boolean; trimmed?: boolean } = {}) {
  const { allOpaque = true, trimmed = false } = opts;
  const pixelData = new Uint8ClampedArray(width * height * 4);
  if (allOpaque) {
    for (let i = 0; i < pixelData.length; i += 4) {
      pixelData[i] = 255; pixelData[i + 1] = 0; pixelData[i + 2] = 0; pixelData[i + 3] = 255;
    }
  } else if (trimmed) {
    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const idx = ((cy + dy) * width + (cx + dx)) * 4;
        if (idx >= 0 && idx < pixelData.length) {
          pixelData[idx] = 255; pixelData[idx + 1] = 0; pixelData[idx + 2] = 0; pixelData[idx + 3] = 255;
        }
      }
    }
  }
  return pixelData;
}

function setupCanvasMocks(pixelOpts: { allOpaque?: boolean; trimmed?: boolean } = { allOpaque: true }) {
  const revokeObjectURLMock = vi.fn();
  const createObjectURLMock = vi.fn(() => "blob:http://localhost/test-blob");

  // Override URL methods
  const origCreateObjectURL = URL.createObjectURL;
  const origRevokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = createObjectURLMock;
  URL.revokeObjectURL = revokeObjectURLMock;

  const createdCanvases: HTMLCanvasElement[] = [];
  const origCreateElement = document.createElement.bind(document);
  const createElementSpy = vi.spyOn(document, "createElement").mockImplementation((tag: string, options?: any) => {
    if (tag === "canvas") {
      const canvas = origCreateElement("canvas") as HTMLCanvasElement;
      createdCanvases.push(canvas);
      const pixelData = makePixelData(200, 100, pixelOpts);
      // Override getContext to return our mock
      (canvas as any).getContext = vi.fn(() => ({
        drawImage: vi.fn(),
        getImageData: vi.fn(() => ({ data: pixelData })),
        imageSmoothingEnabled: true,
        imageSmoothingQuality: "high",
      }));
      // Override toBlob
      (canvas as any).toBlob = vi.fn((cb: (b: Blob | null) => void) => {
        cb(new Blob(["test"], { type: "image/png" }));
      });
      return canvas;
    }
    if (tag === "a") {
      return { href: "", download: "", click: vi.fn() } as any;
    }
    return origCreateElement(tag, options);
  });

  // Mock Image constructor
  vi.stubGlobal("Image", class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    crossOrigin = "";
    src = "";
    naturalWidth = 200;
    naturalHeight = 100;
    decode = vi.fn(() => Promise.resolve());
    constructor() {
      setTimeout(() => { if (this.onload) this.onload(); }, 0);
    }
  });

  const cleanup = () => {
    createElementSpy.mockRestore();
    URL.createObjectURL = origCreateObjectURL;
    URL.revokeObjectURL = origRevokeObjectURL;
  };

  return { createdCanvases, revokeObjectURLMock, createObjectURLMock, cleanup };
}

// ── loadLayerRenderInfo ──

import {
  loadLayerRenderInfo,
  loadLayerImageInfo,
  buildLayeredComposition,
  exportComposition,
} from "../layerUtils";

describe("loadLayerRenderInfo", () => {
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
    vi.unstubAllGlobals();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    });
  });

  it("returns render info with full bounds for fully opaque image (no trim)", async () => {
    const mocks = setupCanvasMocks({ allOpaque: true });
    cleanup = mocks.cleanup;

    const info = await loadLayerRenderInfo("http://example.com/test.png");
    expect(info.originalWidth).toBe(200);
    expect(info.originalHeight).toBe(100);
    expect(info.bounds).toEqual({ left: 0, top: 0, width: 200, height: 100 });
    expect(info.source).toBe(info.image);
  });

  it("returns trimmed canvas when opaque region is smaller than full image", async () => {
    // Create a custom mock where getImageData returns data with only center pixels opaque
    const origCreateElement = document.createElement.bind(document);
    let canvasCount = 0;
    const createdCanvases: HTMLCanvasElement[] = [];
    const spy = vi.spyOn(document, "createElement").mockImplementation((tag: string, opts?: any) => {
      if (tag === "canvas") {
        const canvas = origCreateElement("canvas") as any;
        createdCanvases.push(canvas);
        canvasCount++;
        canvas.getContext = vi.fn(() => {
          // First canvas reads pixels, second canvas is for trimmed output
          const w = 200, h = 100;
          const pixelData = new Uint8ClampedArray(w * h * 4);
          // Only make center 5x5 opaque
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const px = 100 + dx, py = 50 + dy;
              const idx = (py * w + px) * 4;
              pixelData[idx] = 255; pixelData[idx + 1] = 0; pixelData[idx + 2] = 0; pixelData[idx + 3] = 255;
            }
          }
          return {
            drawImage: vi.fn(),
            getImageData: vi.fn(() => ({ data: pixelData })),
            imageSmoothingEnabled: true,
            imageSmoothingQuality: "high",
          };
        });
        canvas.toBlob = vi.fn((cb: (b: Blob | null) => void) => cb(new Blob(["test"])));
        return canvas;
      }
      return origCreateElement(tag, opts);
    });
    cleanup = () => spy.mockRestore();

    vi.stubGlobal("Image", class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = "";
      src = "";
      naturalWidth = 200;
      naturalHeight = 100;
      decode = vi.fn(() => Promise.resolve());
      constructor() { setTimeout(() => { if (this.onload) this.onload(); }, 0); }
    });

    const info = await loadLayerRenderInfo("http://example.com/trimmed.png");
    expect(info.originalWidth).toBe(200);
    expect(info.originalHeight).toBe(100);
    expect(info.bounds.width).toBe(5);
    expect(info.bounds.height).toBe(5);
    expect(info.bounds.left).toBe(98);
    expect(info.bounds.top).toBe(48);
    // source should be the trimmed canvas, not the original image
    expect(info.source).not.toBe(info.image);
    expect(info.source).toBeInstanceOf(HTMLCanvasElement);
    expect(createdCanvases.length).toBe(2);
  });

  it("handles zero-dimension image by throwing", async () => {
    vi.stubGlobal("Image", class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = "";
      src = "";
      naturalWidth = 0;
      naturalHeight = 0;
      decode = vi.fn(() => Promise.resolve());
      constructor() { setTimeout(() => { if (this.onload) this.onload(); }, 0); }
    });

    await expect(loadLayerRenderInfo("http://example.com/bad.png")).rejects.toThrow("Invalid image dimensions");
  });

  it("falls back when trimmed canvas getContext returns null", async () => {
    const origCreateElement = document.createElement.bind(document);
    let callCount = 0;
    const spy = vi.spyOn(document, "createElement").mockImplementation((tag: string, opts?: any) => {
      if (tag === "canvas") {
        callCount++;
        if (callCount === 2) {
          // Second canvas (trimmed) has null context
          return { width: 0, height: 0, getContext: () => null } as any;
        }
        const canvas = origCreateElement("canvas") as any;
        canvas.getContext = vi.fn(() => {
          const w = 200, h = 100;
          const pixelData = new Uint8ClampedArray(w * h * 4);
          // Only center 5x5 opaque to trigger trimming
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const px = 100 + dx, py = 50 + dy;
              const idx = (py * w + px) * 4;
              pixelData[idx] = 255; pixelData[idx + 1] = 0; pixelData[idx + 2] = 0; pixelData[idx + 3] = 255;
            }
          }
          return {
            drawImage: vi.fn(),
            getImageData: vi.fn(() => ({ data: pixelData })),
            imageSmoothingEnabled: true,
            imageSmoothingQuality: "high",
          };
        });
        return canvas;
      }
      return origCreateElement(tag, opts);
    });
    cleanup = () => spy.mockRestore();

    vi.stubGlobal("Image", class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = "";
      src = "";
      naturalWidth = 200;
      naturalHeight = 100;
      decode = vi.fn(() => Promise.resolve());
      constructor() { setTimeout(() => { if (this.onload) this.onload(); }, 0); }
    });

    const info = await loadLayerRenderInfo("http://example.com/trimmed-null-ctx.png");
    // Should fall back: source = image, bounds = full dimensions
    expect(info.source).toBe(info.image);
    expect(info.bounds).toEqual({ left: 0, top: 0, width: 200, height: 100 });
  });

  it("falls back when getContext returns null", async () => {
    const origCreateElement = document.createElement.bind(document);
    const spy = vi.spyOn(document, "createElement").mockImplementation((tag: string, opts?: any) => {
      if (tag === "canvas") {
        const c = origCreateElement("canvas") as any;
        c.getContext = vi.fn(() => null);
        return c;
      }
      return origCreateElement(tag, opts);
    });
    cleanup = () => spy.mockRestore();

    vi.stubGlobal("Image", class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = "";
      src = "";
      naturalWidth = 50;
      naturalHeight = 50;
      decode = vi.fn(() => Promise.resolve());
      constructor() { setTimeout(() => { if (this.onload) this.onload(); }, 0); }
    });

    const info = await loadLayerRenderInfo("http://example.com/nocontext.png");
    expect(info.source).toBe(info.image);
    expect(info.bounds).toEqual({ left: 0, top: 0, width: 50, height: 50 });
  });

  it("falls back when getImageData throws (e.g. tainted canvas)", async () => {
    const origCreateElement = document.createElement.bind(document);
    const spy = vi.spyOn(document, "createElement").mockImplementation((tag: string, opts?: any) => {
      if (tag === "canvas") {
        const c = origCreateElement("canvas") as any;
        c.getContext = vi.fn(() => ({
          drawImage: vi.fn(),
          getImageData: vi.fn(() => { throw new Error("tainted"); }),
        }));
        return c;
      }
      return origCreateElement(tag, opts);
    });
    cleanup = () => spy.mockRestore();

    vi.stubGlobal("Image", class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = "";
      src = "";
      naturalWidth = 50;
      naturalHeight = 50;
      decode = vi.fn(() => Promise.resolve());
      constructor() { setTimeout(() => { if (this.onload) this.onload(); }, 0); }
    });

    const info = await loadLayerRenderInfo("http://example.com/tainted.png");
    expect(info.source).toBe(info.image);
  });
});

// ── loadLayerImageInfo ──

describe("loadLayerImageInfo", () => {
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
    vi.unstubAllGlobals();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    });
  });

  function setupTrimmedCanvasMocks() {
    const origCreateElement = document.createElement.bind(document);
    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURLMock = vi.fn(() => "blob:http://localhost/test-blob");
    const revokeObjectURLMock = vi.fn();
    URL.createObjectURL = createObjectURLMock;
    URL.revokeObjectURL = revokeObjectURLMock;
    const spy = vi.spyOn(document, "createElement").mockImplementation((tag: string, opts?: any) => {
      if (tag === "canvas") {
        const canvas = origCreateElement("canvas") as any;
        canvas.getContext = vi.fn(() => {
          const w = 200, h = 100;
          const pixelData = new Uint8ClampedArray(w * h * 4);
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const px = 100 + dx, py = 50 + dy;
              const idx = (py * w + px) * 4;
              pixelData[idx] = 255; pixelData[idx + 1] = 0; pixelData[idx + 2] = 0; pixelData[idx + 3] = 255;
            }
          }
          return {
            drawImage: vi.fn(),
            getImageData: vi.fn(() => ({ data: pixelData })),
            imageSmoothingEnabled: true,
            imageSmoothingQuality: "high",
          };
        });
        canvas.toBlob = vi.fn((cb: (b: Blob | null) => void) => cb(new Blob(["test"])));
        return canvas;
      }
      return origCreateElement(tag, opts);
    });
    vi.stubGlobal("Image", class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = "";
      src = "";
      naturalWidth = 200;
      naturalHeight = 100;
      decode = vi.fn(() => Promise.resolve());
      constructor() { setTimeout(() => { if (this.onload) this.onload(); }, 0); }
    });
    return {
      createObjectURLMock,
      revokeObjectURLMock,
      cleanup: () => {
        spy.mockRestore();
        URL.createObjectURL = origCreateObjectURL;
        URL.revokeObjectURL = origRevokeObjectURL;
      },
    };
  }

  it("returns image info with object URL when trimmed", async () => {
    const mocks = setupTrimmedCanvasMocks();
    cleanup = mocks.cleanup;

    const info = await loadLayerImageInfo("http://example.com/img.png");
    expect(info.objectUrl).toBe("blob:http://localhost/test-blob");
    expect(info.src).toBe("blob:http://localhost/test-blob");
  });

  it("returns original src when not trimmed", async () => {
    const mocks = setupCanvasMocks({ allOpaque: true });
    cleanup = mocks.cleanup;

    const info = await loadLayerImageInfo("http://example.com/full.png");
    expect(info.src).toBe("http://example.com/full.png");
  });

  it("revokes old objectUrl when providing new one", async () => {
    const mocks = setupTrimmedCanvasMocks();
    cleanup = mocks.cleanup;

    await loadLayerImageInfo("http://example.com/img.png", "blob:old-url");
    expect(mocks.revokeObjectURLMock).toHaveBeenCalledWith("blob:old-url");
  });

  it("falls back to original image when canvasToBlob throws", async () => {
    // Set up mocks where the canvas is trimmed (source is HTMLCanvasElement) but toBlob fails
    const origCreateElement = document.createElement.bind(document);
    const spy = vi.spyOn(document, "createElement").mockImplementation((tag: string, opts?: any) => {
      if (tag === "canvas") {
        const canvas = origCreateElement("canvas") as any;
        canvas.getContext = vi.fn(() => {
          const w = 200, h = 100;
          const pixelData = new Uint8ClampedArray(w * h * 4);
          // Only center 5x5 opaque to trigger trimming
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const px = 100 + dx, py = 50 + dy;
              const idx = (py * w + px) * 4;
              pixelData[idx] = 255; pixelData[idx + 3] = 255;
            }
          }
          return {
            drawImage: vi.fn(),
            getImageData: vi.fn(() => ({ data: pixelData })),
            imageSmoothingEnabled: true,
            imageSmoothingQuality: "high",
          };
        });
        // toBlob returns null, causing canvasToBlob to reject
        canvas.toBlob = vi.fn((cb: (b: Blob | null) => void) => cb(null));
        return canvas;
      }
      return origCreateElement(tag, opts);
    });
    cleanup = () => spy.mockRestore();

    vi.stubGlobal("Image", class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = "";
      src = "";
      naturalWidth = 200;
      naturalHeight = 100;
      decode = vi.fn(() => Promise.resolve());
      constructor() { setTimeout(() => { if (this.onload) this.onload(); }, 0); }
    });

    const info = await loadLayerImageInfo("http://example.com/img.png");
    // Should fall back: source = image, bounds = full dimensions
    expect(info.source).toBe(info.image);
    expect(info.bounds).toEqual({ left: 0, top: 0, width: 200, height: 100 });
    expect(info.src).toBe("http://example.com/img.png");
  });
});

// ── buildLayeredComposition ──

describe("buildLayeredComposition", () => {
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
    vi.unstubAllGlobals();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    });
  });

  it("throws when no layers provided", async () => {
    await expect(
      buildLayeredComposition({
        layerAssets: [],
        layerState: {},
        assetUrl: vi.fn(),
        apiBaseUrl: "http://api" as any,
        containerRect: null,
      })
    ).rejects.toThrow("No layers available for export");
  });

  it("builds composition from cached layer images", async () => {
    const mocks = setupCanvasMocks({ allOpaque: true });
    cleanup = mocks.cleanup;

    const asset = { id: "layer-1", generationId: "gen-1", type: "image", itemIndex: 0, url: "/img.png", createdAt: "2025-01-01" } as any;
    const cachedInfo = {
      image: {} as HTMLImageElement,
      source: {} as CanvasImageSource,
      bounds: { left: 0, top: 0, width: 200, height: 100 },
      originalWidth: 200,
      originalHeight: 100,
      src: "blob:cached",
    };

    const result = await buildLayeredComposition({
      layerAssets: [asset],
      layerState: { "layer-1": { x: 0, y: 0, visible: true, scale: 1 } },
      assetUrl: vi.fn(() => "http://api/img.png"),
      apiBaseUrl: "http://api" as any,
      containerRect: null,
      layerImages: { "layer-1": cachedInfo as any },
    });

    expect(result.width).toBe(200);
    expect(result.height).toBe(100);
    expect(result.layers).toHaveLength(1);
  });

  it("skips invisible layers during drawing", async () => {
    const mocks = setupCanvasMocks({ allOpaque: true });
    cleanup = mocks.cleanup;

    const asset1 = { id: "l1", generationId: "g1", type: "image", itemIndex: 0, url: "/a.png", createdAt: "2025-01-01" } as any;
    const asset2 = { id: "l2", generationId: "g1", type: "image", itemIndex: 1, url: "/b.png", createdAt: "2025-01-01" } as any;
    const cachedInfo = (id: string) => ({
      image: {} as HTMLImageElement,
      source: {} as CanvasImageSource,
      bounds: { left: 0, top: 0, width: 200, height: 100 },
      originalWidth: 200,
      originalHeight: 100,
      src: `blob:${id}`,
    });

    const result = await buildLayeredComposition({
      layerAssets: [asset1, asset2],
      layerState: {
        "l1": { x: 0, y: 0, visible: true, scale: 1 },
        "l2": { x: 0, y: 0, visible: false, scale: 1 },
      },
      assetUrl: vi.fn(),
      apiBaseUrl: "http://api" as any,
      containerRect: null,
      layerImages: { "l1": cachedInfo("l1") as any, "l2": cachedInfo("l2") as any },
    });

    expect(result.layers).toHaveLength(2);
  });

  it("throws when dimensions are zero or invalid", async () => {
    const cachedInfo = {
      image: {} as HTMLImageElement,
      source: {} as CanvasImageSource,
      bounds: { left: 0, top: 0, width: 0, height: 0 },
      originalWidth: 0,
      originalHeight: 0,
      src: "blob:cached",
    };
    const asset = { id: "l1", generationId: "g1", type: "image", itemIndex: 0, url: "/img.png", createdAt: "2025-01-01" } as any;

    await expect(
      buildLayeredComposition({
        layerAssets: [asset],
        layerState: { "l1": { x: 0, y: 0, visible: true, scale: 1 } },
        assetUrl: vi.fn(),
        apiBaseUrl: "http://api" as any,
        containerRect: null,
        layerImages: { "l1": cachedInfo as any },
      })
    ).rejects.toThrow("Unable to determine export size");
  });

  it("falls back to loadImage when loadLayerRenderInfo fails (no cache)", async () => {
    const mocks = setupCanvasMocks({ allOpaque: true });
    cleanup = mocks.cleanup;

    // Mock fetch for fetchImageViaProxy
    const fakeBlob = new Blob(["image-data"]);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      blob: async () => fakeBlob,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const asset = { id: "l1", generationId: "g1", type: "image", itemIndex: 0, url: "/img.png", createdAt: "2025-01-01" } as any;

    // No cached layerImages — will go through fetchImageViaProxy + loadLayerRenderInfo
    // Since our mock Image has naturalWidth=200, naturalHeight=100, this should work
    const result = await buildLayeredComposition({
      layerAssets: [asset],
      layerState: { "l1": { x: 0, y: 0, visible: true, scale: 1 } },
      assetUrl: vi.fn(() => "http://api/img.png"),
      apiBaseUrl: "http://api" as any,
      containerRect: null,
    });

    expect(result.width).toBe(200);
    expect(result.height).toBe(100);
    expect(result.layers).toHaveLength(1);
  });

  it("falls back to loadImage when loadLayerRenderInfo throws (catch path)", async () => {
    // First Image (inside loadLayerRenderInfo) has zero dimensions → throws
    // Second Image (inside loadImage fallback) has valid dimensions → succeeds
    let imageCount = 0;
    vi.stubGlobal("Image", class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = "";
      src = "";
      naturalWidth: number;
      naturalHeight: number;
      decode: () => Promise<void>;
      constructor() {
        imageCount++;
        if (imageCount === 1) {
          // First image: zero dimensions → loadLayerRenderInfo throws
          this.naturalWidth = 0;
          this.naturalHeight = 0;
        } else {
          // Second image: valid dimensions → loadImage succeeds
          this.naturalWidth = 200;
          this.naturalHeight = 100;
        }
        this.decode = vi.fn(() => Promise.resolve());
        setTimeout(() => { if (this.onload) this.onload(); }, 0);
      }
    });

    const origCreateElement = document.createElement.bind(document);
    const spy = vi.spyOn(document, "createElement").mockImplementation((tag: string, opts?: any) => {
      if (tag === "canvas") {
        const canvas = origCreateElement("canvas") as any;
        canvas.getContext = vi.fn(() => ({
          drawImage: vi.fn(),
          getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(200 * 100 * 4) })),
          imageSmoothingEnabled: true,
          imageSmoothingQuality: "high",
        }));
        canvas.toBlob = vi.fn((cb: (b: Blob | null) => void) => cb(new Blob(["test"])));
        return canvas;
      }
      if (tag === "a") {
        return { href: "", download: "", click: vi.fn() } as any;
      }
      return origCreateElement(tag, opts);
    });
    cleanup = () => spy.mockRestore();

    // Mock fetch for fetchImageViaProxy
    const fakeBlob = new Blob(["image-data"]);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      blob: async () => fakeBlob,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:http://localhost/test-blob");
    URL.revokeObjectURL = vi.fn();

    const asset = { id: "l1", generationId: "g1", type: "image", itemIndex: 0, url: "/img.png", createdAt: "2025-01-01" } as any;

    const result = await buildLayeredComposition({
      layerAssets: [asset],
      layerState: { "l1": { x: 0, y: 0, visible: true, scale: 1 } },
      assetUrl: vi.fn(() => "http://api/img.png"),
      apiBaseUrl: "http://api" as any,
      containerRect: null,
    });

    // The catch path should have used loadImage which returns the second mock (200x100)
    expect(result.width).toBe(200);
    expect(result.height).toBe(100);
    expect(result.layers).toHaveLength(1);

    URL.createObjectURL = origCreateObjectURL;
    URL.revokeObjectURL = origRevokeObjectURL;
  });
});

// ── exportComposition (PNG path) ──

describe("exportComposition", () => {
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
    vi.unstubAllGlobals();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    });
  });

  it("exports PNG composition and triggers download", async () => {
    const mocks = setupCanvasMocks({ allOpaque: true });
    cleanup = mocks.cleanup;

    const asset = { id: "l1", generationId: "gen-1", type: "image", itemIndex: 0, url: "/img.png", createdAt: "2025-01-01" } as any;
    const cachedInfo = {
      image: {} as HTMLImageElement,
      source: {} as CanvasImageSource,
      bounds: { left: 0, top: 0, width: 200, height: 100 },
      originalWidth: 200,
      originalHeight: 100,
      src: "blob:cached",
    };

    await exportComposition(
      "png",
      [asset],
      { "l1": { x: 0, y: 0, visible: true, scale: 1 } },
      vi.fn(() => "http://api/img.png"),
      "http://api" as any,
      null,
      { "l1": cachedInfo as any },
      "gen-1"
    );

    // Verify download was triggered (createElement("a") was called)
    expect(mocks.createObjectURLMock).toHaveBeenCalled();
  });

  it("exports PSD composition with layers and triggers download", async () => {
    // Mock writePsd since it validates internal canvas dimensions
    const agPsd = await import("ag-psd");
    const writePsdSpy = vi.spyOn(agPsd, "writePsd").mockReturnValue(new ArrayBuffer(10));

    const mocks = setupCanvasMocks({ allOpaque: true });
    cleanup = () => {
      mocks.cleanup();
      writePsdSpy.mockRestore();
    };

    const asset1 = { id: "l1", generationId: "gen-1", type: "image", itemIndex: 0, url: "/img1.png", createdAt: "2025-01-01" } as any;
    const asset2 = { id: "l2", generationId: "gen-1", type: "image", itemIndex: 1, url: "/img2.png", createdAt: "2025-01-01" } as any;
    const cachedInfo = {
      image: {} as HTMLImageElement,
      source: {} as CanvasImageSource,
      bounds: { left: 0, top: 0, width: 200, height: 100 },
      originalWidth: 200,
      originalHeight: 100,
      src: "blob:cached",
    };

    await exportComposition(
      "psd",
      [asset1, asset2],
      {
        "l1": { x: 0, y: 0, visible: true, scale: 1 },
        "l2": { x: 10, y: 10, visible: false, scale: 1 },
      },
      vi.fn(() => "http://api/img.png"),
      "http://api" as any,
      null,
      {
        "l1": cachedInfo as any,
        "l2": cachedInfo as any,
      },
      "gen-1"
    );

    expect(writePsdSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 200,
        height: 100,
        children: expect.arrayContaining([
          expect.objectContaining({ name: "Layer 1" }),
          expect.objectContaining({ name: "Layer 2" }),
        ]),
      })
    );
    expect(mocks.createObjectURLMock).toHaveBeenCalled();
  });

  it("exports PSD with null itemIndex layer names", async () => {
    const agPsd = await import("ag-psd");
    const writePsdSpy = vi.spyOn(agPsd, "writePsd").mockReturnValue(new ArrayBuffer(10));

    const mocks = setupCanvasMocks({ allOpaque: true });
    cleanup = () => {
      mocks.cleanup();
      writePsdSpy.mockRestore();
    };

    const asset1 = { id: "l1", generationId: "gen-1", type: "image", itemIndex: null, url: "/img.png", createdAt: "2025-01-01" } as any;
    const asset2 = { id: "l2", generationId: "gen-1", type: "image", itemIndex: 2, url: "/img2.png", createdAt: "2025-01-01" } as any;
    const cachedInfo = {
      image: {} as HTMLImageElement,
      source: {} as CanvasImageSource,
      bounds: { left: 0, top: 0, width: 200, height: 100 },
      originalWidth: 200,
      originalHeight: 100,
      src: "blob:cached",
    };

    await exportComposition(
      "psd",
      [asset1, asset2],
      {
        "l1": { x: 0, y: 0, visible: true, scale: 1 },
        "l2": { x: 0, y: 0, visible: true, scale: 1 },
      },
      vi.fn(() => "http://api/img.png"),
      "http://api" as any,
      null,
      {
        "l1": cachedInfo as any,
        "l2": cachedInfo as any,
      },
      "gen-1"
    );

    // Verify writePsd was called with 'Layer' name (null itemIndex) and 'Layer 3' (itemIndex 2)
    expect(writePsdSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        children: expect.arrayContaining([
          expect.objectContaining({ name: "Layer" }),
          expect.objectContaining({ name: "Layer 3" }),
        ]),
      })
    );
    expect(mocks.createObjectURLMock).toHaveBeenCalled();
  });

  it("exports PSD with undefined itemIndex uses 'Layer' name", async () => {
    const agPsd = await import("ag-psd");
    const writePsdSpy = vi.spyOn(agPsd, "writePsd").mockReturnValue(new ArrayBuffer(10));

    const mocks = setupCanvasMocks({ allOpaque: true });
    cleanup = () => {
      mocks.cleanup();
      writePsdSpy.mockRestore();
    };

    const asset1 = { id: "l1", generationId: "gen-1", type: "image", itemIndex: undefined, url: "/img.png", createdAt: "2025-01-01" } as any;
    const cachedInfo = {
      image: {} as HTMLImageElement,
      source: {} as CanvasImageSource,
      bounds: { left: 0, top: 0, width: 200, height: 100 },
      originalWidth: 200,
      originalHeight: 100,
      src: "blob:cached",
    };

    await exportComposition(
      "psd",
      [asset1],
      {
        "l1": { x: 0, y: 0, visible: true, scale: 1 },
      },
      vi.fn(() => "http://api/img.png"),
      "http://api" as any,
      null,
      {
        "l1": cachedInfo as any,
      },
      "gen-1"
    );

    expect(writePsdSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        children: expect.arrayContaining([
          expect.objectContaining({ name: "Layer" }),
        ]),
      })
    );
  });

  it("builds composition with containerRect for offset scaling", async () => {
    const mocks = setupCanvasMocks({ allOpaque: true });
    cleanup = mocks.cleanup;

    const asset = { id: "l1", generationId: "gen-1", type: "image", itemIndex: 0, url: "/img.png", createdAt: "2025-01-01" } as any;
    const cachedInfo = {
      image: {} as HTMLImageElement,
      source: {} as CanvasImageSource,
      bounds: { left: 0, top: 0, width: 200, height: 100 },
      originalWidth: 200,
      originalHeight: 100,
      src: "blob:cached",
    };

    const containerRect = { width: 100, height: 50, x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 50, toJSON: () => {} } as DOMRect;

    const result = await buildLayeredComposition({
      layerAssets: [asset],
      layerState: { "l1": { x: 10, y: 5, visible: true, scale: 1 } },
      assetUrl: vi.fn(() => "http://api/img.png"),
      apiBaseUrl: "http://api" as any,
      containerRect,
      layerImages: { "l1": cachedInfo as any },
    });

    expect(result.width).toBe(200);
    expect(result.height).toBe(100);
    expect(result.layers).toHaveLength(1);
    // With containerRect fitScale = min(1, 100/200, 50/100) = 0.5, offsetScale = 2
    // So the layer position is offset by state.x * 2 = 20
    expect(result.layers[0].left).toBe(Math.round(200 / 2 + 10 * 2 + 0 - 200 / 2));
  });

  it("defaults state.scale to 1 when non-finite", async () => {
    const mocks = setupCanvasMocks({ allOpaque: true });
    cleanup = mocks.cleanup;

    const asset = { id: "l1", generationId: "gen-1", type: "image", itemIndex: 0, url: "/img.png", createdAt: "2025-01-01" } as any;
    const cachedInfo = {
      image: {} as HTMLImageElement,
      source: {} as CanvasImageSource,
      bounds: { left: 0, top: 0, width: 200, height: 100 },
      originalWidth: 200,
      originalHeight: 100,
      src: "blob:cached",
    };

    const result = await buildLayeredComposition({
      layerAssets: [asset],
      layerState: { "l1": { x: 0, y: 0, visible: true, scale: Infinity } },
      assetUrl: vi.fn(() => "http://api/img.png"),
      apiBaseUrl: "http://api" as any,
      containerRect: null,
      layerImages: { "l1": cachedInfo as any },
    });

    // scale defaults to 1, so width/height should be bounds width/height
    expect(result.layers[0].width).toBe(200);
    expect(result.layers[0].height).toBe(100);
  });

  it("defaults missing layer state to {x:0,y:0,visible:true,scale:1}", async () => {
    const mocks = setupCanvasMocks({ allOpaque: true });
    cleanup = mocks.cleanup;

    const asset = { id: "l1", generationId: "gen-1", type: "image", itemIndex: 0, url: "/img.png", createdAt: "2025-01-01" } as any;
    const cachedInfo = {
      image: {} as HTMLImageElement,
      source: {} as CanvasImageSource,
      bounds: { left: 0, top: 0, width: 200, height: 100 },
      originalWidth: 200,
      originalHeight: 100,
      src: "blob:cached",
    };

    // No state for "l1" in layerState — falls back via ?? operator
    const result = await buildLayeredComposition({
      layerAssets: [asset],
      layerState: {},
      assetUrl: vi.fn(() => "http://api/img.png"),
      apiBaseUrl: "http://api" as any,
      containerRect: null,
      layerImages: { "l1": cachedInfo as any },
    });

    expect(result.layers[0].state).toEqual({ x: 0, y: 0, visible: true, scale: 1 });
  });

  it("skips drawing layers with zero width/height", async () => {
    const mocks = setupCanvasMocks({ allOpaque: true });
    cleanup = mocks.cleanup;

    const asset = { id: "l1", generationId: "gen-1", type: "image", itemIndex: 0, url: "/img.png", createdAt: "2025-01-01" } as any;
    const cachedInfo = {
      image: {} as HTMLImageElement,
      source: {} as CanvasImageSource,
      bounds: { left: 0, top: 0, width: 200, height: 100 },
      originalWidth: 200,
      originalHeight: 100,
      src: "blob:cached",
    };

    // scale=0 results in width=0 and height=0
    const result = await buildLayeredComposition({
      layerAssets: [asset],
      layerState: { "l1": { x: 0, y: 0, visible: true, scale: 0 } },
      assetUrl: vi.fn(() => "http://api/img.png"),
      apiBaseUrl: "http://api" as any,
      containerRect: null,
      layerImages: { "l1": cachedInfo as any },
    });

    // Layer still exists in layers array but its width/height are 0
    // The drawing loop skips it (layer.width <= 0 || layer.height <= 0)
    expect(result.layers).toHaveLength(1);
    expect(result.layers[0].width).toBe(0);
    expect(result.layers[0].height).toBe(0);
  });
});

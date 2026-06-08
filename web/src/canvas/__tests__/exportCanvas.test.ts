// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { exportCanvasAsImage } from "../exportCanvas";

function makeMockTransformer(visible = true) {
  return {
    visible: vi.fn(() => visible),
    getClassName: () => "Transformer",
  };
}

function makeMockLayer(listening: boolean, transformers: any[] = []) {
  return {
    listening: vi.fn(() => listening),
    visible: vi.fn(),
    find: vi.fn((_selector: string) => transformers),
    toDataURL: vi.fn(() => "data:image/png;base64,testdata"),
  };
}

function makeMockStage(layers: any[]) {
  return {
    getLayers: vi.fn(() => layers),
    batchDraw: vi.fn(),
  } as any;
}

function makeNode(overrides: Record<string, any> = {}) {
  return {
    id: "n1",
    x: 10,
    y: 20,
    width: 100,
    height: 50,
    naturalWidth: 100,
    naturalHeight: 50,
    zIndex: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("exportCanvasAsImage", () => {
  it("returns early when targetNodes is empty", async () => {
    const stage = makeMockStage([]);
    await exportCanvasAsImage(stage, []);
    expect(stage.getLayers).not.toHaveBeenCalled();
  });

  it("hides non-listening layers during export", async () => {
    const nonListeningLayer = makeMockLayer(false);
    const listeningLayer = makeMockLayer(true);

    const stage = makeMockStage([nonListeningLayer, listeningLayer]);

    // Mock createElement for download link
    const mockLink = { download: "", href: "", click: vi.fn() };
    vi.spyOn(document, "createElement").mockReturnValue(mockLink as any);

    await exportCanvasAsImage(stage, [makeNode()]);

    // Non-listening layer should have been hidden
    expect(nonListeningLayer.visible).toHaveBeenCalledWith(false);
    // And restored
    expect(nonListeningLayer.visible).toHaveBeenCalledWith(true);
  });

  it("hides visible transformers and restores them", async () => {
    const transformer = makeMockTransformer(true);
    const listeningLayer = makeMockLayer(true, [transformer]);
    const stage = makeMockStage([listeningLayer]);

    const mockLink = { download: "", href: "", click: vi.fn() };
    vi.spyOn(document, "createElement").mockReturnValue(mockLink as any);

    await exportCanvasAsImage(stage, [makeNode()]);

    // Transformer should have been hidden then restored
    expect(transformer.visible).toHaveBeenCalledWith(false);
    expect(transformer.visible).toHaveBeenCalledWith(true);
  });

  it("does not hide already-hidden transformers", async () => {
    const hiddenTransformer = makeMockTransformer(false);
    const listeningLayer = makeMockLayer(true, [hiddenTransformer]);
    const stage = makeMockStage([listeningLayer]);

    const mockLink = { download: "", href: "", click: vi.fn() };
    vi.spyOn(document, "createElement").mockReturnValue(mockLink as any);

    await exportCanvasAsImage(stage, [makeNode()]);

    // visible() was called once (to check) but not called with false
    expect(hiddenTransformer.visible).not.toHaveBeenCalledWith(false);
  });

  it("calls toDataURL with correct bounding box", async () => {
    const listeningLayer = makeMockLayer(true);
    const stage = makeMockStage([listeningLayer]);

    const mockLink = { download: "", href: "", click: vi.fn() };
    vi.spyOn(document, "createElement").mockReturnValue(mockLink as any);

    const nodes = [
      makeNode({ x: 0, y: 0, width: 100, height: 50 }),
      makeNode({ x: 200, y: 100, width: 50, height: 50 }),
    ];

    await exportCanvasAsImage(stage, nodes, 2);

    expect(listeningLayer.toDataURL).toHaveBeenCalledWith({
      x: 0 - 20,   // minX - padding
      y: 0 - 20,   // minY - padding
      width: 250 + 40,  // (maxX - minX) + 2*padding
      height: 150 + 40, // (maxY - minY) + 2*padding
      pixelRatio: 2,
    });
  });

  it("creates download link with data URL", async () => {
    const listeningLayer = makeMockLayer(true);
    const stage = makeMockStage([listeningLayer]);

    const mockLink = { download: "", href: "", click: vi.fn() };
    vi.spyOn(document, "createElement").mockReturnValue(mockLink as any);

    await exportCanvasAsImage(stage, [makeNode()]);

    expect(document.createElement).toHaveBeenCalledWith("a");
    expect(mockLink.href).toBe("data:image/png;base64,testdata");
    expect(mockLink.download).toMatch(/^canvas-export-\d+\.png$/);
    expect(mockLink.click).toHaveBeenCalled();
  });

  it("calls batchDraw before and after export", async () => {
    const listeningLayer = makeMockLayer(true);
    const stage = makeMockStage([listeningLayer]);

    const mockLink = { download: "", href: "", click: vi.fn() };
    vi.spyOn(document, "createElement").mockReturnValue(mockLink as any);

    await exportCanvasAsImage(stage, [makeNode()]);

    expect(stage.batchDraw).toHaveBeenCalledTimes(2);
  });

  it("restores state even when toDataURL throws", async () => {
    const nonListeningLayer = makeMockLayer(false);
    const listeningLayer = makeMockLayer(true);
    listeningLayer.toDataURL.mockImplementation(() => {
      throw new Error("export failed");
    });
    const stage = makeMockStage([nonListeningLayer, listeningLayer]);

    await expect(exportCanvasAsImage(stage, [makeNode()])).rejects.toThrow("export failed");

    // Still restored
    expect(nonListeningLayer.visible).toHaveBeenCalledWith(true);
    expect(stage.batchDraw).toHaveBeenCalledTimes(2);
  });

  it("returns early when no listening layer found", async () => {
    const nonListeningLayer = makeMockLayer(false);
    const stage = makeMockStage([nonListeningLayer]);

    // Should not throw
    await exportCanvasAsImage(stage, [makeNode()]);

    // Non-listening layer hidden and restored
    expect(nonListeningLayer.visible).toHaveBeenCalledWith(false);
    expect(nonListeningLayer.visible).toHaveBeenCalledWith(true);
  });
});

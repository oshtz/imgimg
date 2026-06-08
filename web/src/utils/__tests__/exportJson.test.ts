import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSave = vi.fn();
const mockWriteTextFile = vi.fn();

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: (...args: unknown[]) => mockSave(...args),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  writeTextFile: (...args: unknown[]) => mockWriteTextFile(...args),
}));

const { downloadJson, buildEnhancerPresetsExport, buildSavedPromptsExport } =
  await import("../exportJson");

describe("downloadJson", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens save dialog and writes the file", async () => {
    mockSave.mockResolvedValue("/tmp/test-file.json");
    mockWriteTextFile.mockResolvedValue(undefined);

    const data = { hello: "world" };
    const result = await downloadJson(data, "test-file.json");

    expect(mockSave).toHaveBeenCalledWith({
      defaultPath: "test-file.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    expect(mockWriteTextFile).toHaveBeenCalledWith(
      "/tmp/test-file.json",
      JSON.stringify(data, null, 2)
    );
    expect(result).toBe(JSON.stringify(data, null, 2));
  });

  it("returns null when user cancels the dialog", async () => {
    mockSave.mockResolvedValue(null);

    const result = await downloadJson({ key: "value" }, "out.json");
    expect(result).toBeNull();
    expect(mockWriteTextFile).not.toHaveBeenCalled();
  });

  it("returns pretty-printed JSON", async () => {
    mockSave.mockResolvedValue("/tmp/out.json");
    mockWriteTextFile.mockResolvedValue(undefined);

    const data = { nested: { key: "value" } };
    const result = await downloadJson(data, "out.json");
    expect(result).toBe(JSON.stringify(data, null, 2));
    expect(result).toContain("\n");
  });
});

describe("buildEnhancerPresetsExport", () => {
  it("maps presets to export format with type and timestamp", () => {
    const presets = [
      { name: "Cinematic", systemPrompt: "You are a cinematic prompt writer." },
      { name: "Anime", systemPrompt: "You are an anime prompt writer." },
    ];
    const result = buildEnhancerPresetsExport(presets);

    expect(result.type).toBe("enhancer-presets");
    expect(result.exportedAt).toBeTruthy();
    expect(new Date(result.exportedAt).getTime()).not.toBeNaN();
    expect(result.presets).toEqual([
      { name: "Cinematic", systemPrompt: "You are a cinematic prompt writer." },
      { name: "Anime", systemPrompt: "You are an anime prompt writer." },
    ]);
  });

  it("only includes name and systemPrompt fields", () => {
    const presets = [
      {
        name: "Test",
        systemPrompt: "prompt text",
        id: "should-be-stripped",
        isDefault: true,
        sortOrder: 5,
        createdAt: "2025-01-01",
        updatedAt: "2025-01-02",
      } as any,
    ];
    const result = buildEnhancerPresetsExport(presets);
    const exported = result.presets[0];

    expect(Object.keys(exported)).toEqual(["name", "systemPrompt"]);
    expect(exported).toEqual({ name: "Test", systemPrompt: "prompt text" });
  });

  it("handles empty presets array", () => {
    const result = buildEnhancerPresetsExport([]);
    expect(result.type).toBe("enhancer-presets");
    expect(result.presets).toEqual([]);
  });
});

describe("buildSavedPromptsExport", () => {
  it("maps prompts to export format with type and timestamp", () => {
    const prompts = [
      { name: "Portrait", text: "A portrait of [SUBJECT] in [STYLE]" },
      { name: "Landscape", text: "A scenic landscape" },
    ];
    const result = buildSavedPromptsExport(prompts);

    expect(result.type).toBe("saved-prompts");
    expect(result.exportedAt).toBeTruthy();
    expect(new Date(result.exportedAt).getTime()).not.toBeNaN();
    expect(result.prompts).toEqual([
      { name: "Portrait", text: "A portrait of [SUBJECT] in [STYLE]" },
      { name: "Landscape", text: "A scenic landscape" },
    ]);
  });

  it("only includes name and text fields", () => {
    const prompts = [
      {
        name: "Test",
        text: "prompt text",
        id: "should-be-stripped",
        createdAt: "2025-01-01",
        updatedAt: "2025-01-02",
      } as any,
    ];
    const result = buildSavedPromptsExport(prompts);
    const exported = result.prompts[0];

    expect(Object.keys(exported)).toEqual(["name", "text"]);
    expect(exported).toEqual({ name: "Test", text: "prompt text" });
  });

  it("handles empty prompts array", () => {
    const result = buildSavedPromptsExport([]);
    expect(result.type).toBe("saved-prompts");
    expect(result.prompts).toEqual([]);
  });
});

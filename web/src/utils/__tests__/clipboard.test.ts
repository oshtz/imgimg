import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from "sonner";

// Provide minimal globals that clipboard.ts depends on
const mockWriteText = vi.fn();
const mockExecCommand = vi.fn().mockReturnValue(true);
const mockEl = {
  value: "",
  setAttribute: vi.fn(),
  style: {} as any,
  select: vi.fn(),
};

vi.stubGlobal("navigator", { clipboard: { writeText: mockWriteText } });
vi.stubGlobal("document", {
  createElement: vi.fn(() => ({ ...mockEl, value: "" })),
  execCommand: mockExecCommand,
  body: {
    appendChild: vi.fn(),
    removeChild: vi.fn(),
  },
});

// Import after globals are stubbed
const { copyToClipboard } = await import("../clipboard");

describe("copyToClipboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset navigator.clipboard to available state
    vi.stubGlobal("navigator", { clipboard: { writeText: mockWriteText } });
    mockWriteText.mockResolvedValue(undefined);
  });

  it("uses navigator.clipboard.writeText when available", async () => {
    const result = await copyToClipboard("hello");
    expect(result).toBe(true);
    expect(mockWriteText).toHaveBeenCalledWith("hello");
    expect(toast.success).toHaveBeenCalledWith("Copied to clipboard");
  });

  it("falls back to textarea + execCommand when clipboard API is unavailable", async () => {
    vi.stubGlobal("navigator", { clipboard: undefined });

    const createdEl = { value: "", setAttribute: vi.fn(), style: {} as any, select: vi.fn() };
    (document.createElement as ReturnType<typeof vi.fn>).mockReturnValue(createdEl);

    const result = await copyToClipboard("fallback text");
    expect(result).toBe(true);
    expect(createdEl.value).toBe("fallback text");
    expect(createdEl.select).toHaveBeenCalled();
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(toast.success).toHaveBeenCalledWith("Copied to clipboard");
  });

  it("returns false and shows error toast on failure", async () => {
    mockWriteText.mockRejectedValue(new Error("denied"));

    const result = await copyToClipboard("fail");
    expect(result).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Failed to copy");
  });
});

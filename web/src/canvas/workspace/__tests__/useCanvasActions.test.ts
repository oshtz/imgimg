// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCanvasActions } from "../useCanvasActions";

vi.mock("../../../client", () => ({
  createGeneration: vi.fn(),
  removeBackground: vi.fn(),
}));

import { createGeneration, removeBackground } from "../../../client";

const mockedCreateGeneration = vi.mocked(createGeneration);
const mockedRemoveBackground = vi.mocked(removeBackground);

function setup() {
  const onRegisterGeneration = vi.fn();
  const apiBaseUrl = "http://localhost:3000" as any;
  return { onRegisterGeneration, apiBaseUrl };
}

describe("useCanvasActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handleUpscale calls createGeneration with correct workflowId", async () => {
    const { apiBaseUrl, onRegisterGeneration } = setup();
    mockedCreateGeneration.mockResolvedValue({
      generationId: "gen-1",
      jobId: "job-1",
      queuePosition: 0,
    } as any);

    const { result } = renderHook(() =>
      useCanvasActions({ apiBaseUrl, onRegisterGeneration })
    );

    await act(async () => {
      await result.current.handleUpscale({ id: "n1", src: "data:image/png;base64,abc" });
    });

    expect(mockedCreateGeneration).toHaveBeenCalledWith(apiBaseUrl, {
      modelId: "",
      prompt: "",
      workflowId: "upscale-seedvr2",
      imageDataUrl: "data:image/png;base64,abc",
    });
    expect(onRegisterGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        generationId: "gen-1",
        workflowId: "upscale-seedvr2",
      })
    );
  });

  it("handleUpscale handles missing jobId with empty string fallback", async () => {
    const { apiBaseUrl, onRegisterGeneration } = setup();
    mockedCreateGeneration.mockResolvedValue({
      generationId: "gen-2",
      // jobId is undefined/missing
      queuePosition: 0,
    } as any);

    const { result } = renderHook(() =>
      useCanvasActions({ apiBaseUrl, onRegisterGeneration })
    );

    await act(async () => {
      await result.current.handleUpscale({ id: "n1", src: "data:image/png;base64,xyz" });
    });

    expect(onRegisterGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        generationId: "gen-2",
        jobId: "",
      })
    );
  });

  it("handleUpscale no-ops without src", async () => {
    const { apiBaseUrl, onRegisterGeneration } = setup();
    const { result } = renderHook(() =>
      useCanvasActions({ apiBaseUrl, onRegisterGeneration })
    );

    await act(async () => {
      await result.current.handleUpscale({ id: "n1" });
    });

    expect(mockedCreateGeneration).not.toHaveBeenCalled();
    expect(onRegisterGeneration).not.toHaveBeenCalled();
  });

  it("handleRemoveBackground calls removeBackground", async () => {
    const { apiBaseUrl, onRegisterGeneration } = setup();
    mockedRemoveBackground.mockResolvedValue(undefined as any);

    const { result } = renderHook(() =>
      useCanvasActions({ apiBaseUrl, onRegisterGeneration })
    );

    await act(async () => {
      await result.current.handleRemoveBackground({ id: "n1", generationId: "gen-1" });
    });

    expect(mockedRemoveBackground).toHaveBeenCalledWith(apiBaseUrl, "gen-1", { itemIndex: 0 });
  });

  it("handleRemoveBackground no-ops without generationId", async () => {
    const { apiBaseUrl, onRegisterGeneration } = setup();
    const { result } = renderHook(() =>
      useCanvasActions({ apiBaseUrl, onRegisterGeneration })
    );

    await act(async () => {
      await result.current.handleRemoveBackground({ id: "n1" });
    });

    expect(mockedRemoveBackground).not.toHaveBeenCalled();
  });

  it("handleUpscale logs error on failure", async () => {
    const { apiBaseUrl, onRegisterGeneration } = setup();
    const error = new Error("network error");
    mockedCreateGeneration.mockRejectedValue(error);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() =>
      useCanvasActions({ apiBaseUrl, onRegisterGeneration })
    );

    await act(async () => {
      await result.current.handleUpscale({ id: "n1", src: "data:image/png;base64,abc" });
    });

    expect(spy).toHaveBeenCalledWith("Upscale failed:", error);
    spy.mockRestore();
  });

  it("handleRemoveBackground logs error on failure", async () => {
    const { apiBaseUrl, onRegisterGeneration } = setup();
    const error = new Error("server error");
    mockedRemoveBackground.mockRejectedValue(error);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() =>
      useCanvasActions({ apiBaseUrl, onRegisterGeneration })
    );

    await act(async () => {
      await result.current.handleRemoveBackground({ id: "n1", generationId: "gen-1" });
    });

    expect(spy).toHaveBeenCalledWith("Remove background failed:", error);
    spy.mockRestore();
  });
});

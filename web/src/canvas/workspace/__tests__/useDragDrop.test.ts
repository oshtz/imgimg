// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDragDrop } from "../useDragDrop";

function setup() {
  const dispatch = vi.fn();
  const setDragOver = vi.fn();
  const containerRef = { current: document.createElement("div") };
  const viewport = { x: 0, y: 0, scale: 1 };

  const { result } = renderHook(() =>
    useDragDrop({ viewport, containerRef, dispatch, setDragOver })
  );

  return { result, dispatch, setDragOver, containerRef };
}

function makeDragEvent(type: string, overrides: Partial<React.DragEvent> = {}): React.DragEvent {
  return {
    preventDefault: vi.fn(),
    dataTransfer: { dropEffect: "", files: [] as any },
    clientX: 100,
    clientY: 100,
    currentTarget: document.createElement("div"),
    relatedTarget: null,
    ...overrides,
  } as unknown as React.DragEvent;
}

describe("useDragDrop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handleDragOver prevents default and sets dragOver to true", () => {
    const { result, setDragOver } = setup();
    const event = makeDragEvent("dragover");

    act(() => {
      result.current.handleDragOver(event);
    });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(setDragOver).toHaveBeenCalledWith(true);
    expect(event.dataTransfer.dropEffect).toBe("copy");
  });

  it("handleDragLeave clears dragOver when leaving the container", () => {
    const { result, setDragOver } = setup();
    const container = document.createElement("div");
    const event = makeDragEvent("dragleave", {
      currentTarget: container,
      relatedTarget: document.createElement("div"), // outside the container
    } as any);
    // Ensure relatedTarget is NOT contained by currentTarget
    vi.spyOn(container, "contains").mockReturnValue(false);

    act(() => {
      result.current.handleDragLeave(event);
    });

    expect(setDragOver).toHaveBeenCalledWith(false);
  });

  it("handleDragLeave does NOT clear dragOver when moving to a child element", () => {
    const { result, setDragOver } = setup();
    const container = document.createElement("div");
    const child = document.createElement("span");
    container.appendChild(child);
    const event = makeDragEvent("dragleave", {
      currentTarget: container,
      relatedTarget: child,
    } as any);

    act(() => {
      result.current.handleDragLeave(event);
    });

    expect(setDragOver).not.toHaveBeenCalled();
  });

  it("handleDrop calls setDragOver(false) and prevents default", () => {
    const { result, setDragOver } = setup();
    const event = makeDragEvent("drop", {
      dataTransfer: { dropEffect: "", files: [] as any } as any,
    });

    act(() => {
      result.current.handleDrop(event);
    });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(setDragOver).toHaveBeenCalledWith(false);
  });

  it("handleDrop does nothing for empty files", () => {
    const { result, dispatch } = setup();
    const event = makeDragEvent("drop", {
      dataTransfer: { dropEffect: "", files: { length: 0 } as any } as any,
    });

    act(() => {
      result.current.handleDrop(event);
    });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("handleDrop skips non-image files", () => {
    const { result, dispatch } = setup();

    // Mock Image class
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        naturalWidth = 200;
        naturalHeight = 100;
        private _src = "";
        get src() { return this._src; }
        set src(v: string) { this._src = v; }
      }
    );

    const file = new File([""], "test.txt", { type: "text/plain" });
    const event = makeDragEvent("drop", {
      dataTransfer: { dropEffect: "", files: [] as any } as any,
    });
    Object.defineProperty(event.dataTransfer, "files", { value: [file] });

    act(() => {
      result.current.handleDrop(event);
    });

    // Non-image file should not cause dispatch
    expect(dispatch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("handleDrop uses clientX/Y directly when containerRef.current is null", async () => {
    const dispatch = vi.fn();
    const setDragOver = vi.fn();
    const containerRef = { current: null };
    const viewport = { x: 0, y: 0, scale: 1 };

    const { result } = renderHook(() =>
      useDragDrop({ viewport, containerRef, dispatch, setDragOver })
    );

    let onloadCallback: (() => void) | null = null;
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        naturalWidth = 200;
        naturalHeight = 100;
        private _src = "";
        get src() { return this._src; }
        set src(v: string) { this._src = v; onloadCallback = this.onload; }
      }
    );

    const file = new File([""], "test.png", { type: "image/png" });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
    vi.spyOn(crypto, "randomUUID").mockReturnValue("uuid-null-container" as any);

    const event = makeDragEvent("drop", {
      clientX: 200,
      clientY: 300,
    } as any);
    Object.defineProperty(event.dataTransfer, "files", { value: [file] });

    act(() => {
      result.current.handleDrop(event);
    });

    expect(onloadCallback).not.toBeNull();
    act(() => {
      onloadCallback!();
    });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ADD_NODE",
        node: expect.objectContaining({
          id: "uuid-null-container",
        }),
      })
    );

    vi.unstubAllGlobals();
  });

  it("handleDrop dispatches ADD_NODE for image files after Image loads", async () => {
    const { result, dispatch } = setup();

    // Mock Image class
    let onloadCallback: (() => void) | null = null;
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        naturalWidth = 200;
        naturalHeight = 100;
        private _src = "";
        get src() {
          return this._src;
        }
        set src(v: string) {
          this._src = v;
          // Capture onload to call it later
          onloadCallback = this.onload;
        }
      }
    );

    const file = new File([""], "test.png", { type: "image/png" });
    const fakeUrl = "blob:http://localhost/fake-uuid";
    vi.spyOn(URL, "createObjectURL").mockReturnValue(fakeUrl);
    vi.spyOn(crypto, "randomUUID").mockReturnValue("test-uuid" as any);

    const event = makeDragEvent("drop", {
      dataTransfer: {
        dropEffect: "",
        files: { 0: file, length: 1, [Symbol.iterator]: Array.prototype[Symbol.iterator] } as any,
      } as any,
    });
    // Make Array.from work on our files mock
    Object.defineProperty(event.dataTransfer, "files", {
      value: [file],
    });

    act(() => {
      result.current.handleDrop(event);
    });

    // The Image.onload is set before src is assigned, so we need to trigger it
    // after the src setter runs
    expect(onloadCallback).not.toBeNull();
    act(() => {
      onloadCallback!();
    });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ADD_NODE",
        node: expect.objectContaining({
          id: "test-uuid",
          src: fakeUrl,
          naturalWidth: 200,
          naturalHeight: 100,
        }),
      })
    );

    vi.unstubAllGlobals();
  });
});

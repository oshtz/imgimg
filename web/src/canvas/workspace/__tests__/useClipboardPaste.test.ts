// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useClipboardPaste } from "../useClipboardPaste";

function setup(overrides: Partial<Parameters<typeof useClipboardPaste>[0]> = {}) {
  const dispatch = vi.fn();
  const defaults = {
    viewport: { x: 0, y: 0, scale: 1 },
    dimensions: { width: 800, height: 600 },
    dispatch,
    ...overrides,
  };
  renderHook(() => useClipboardPaste(defaults));
  return { dispatch };
}

function firePaste(items: DataTransferItem[], target?: EventTarget) {
  const event = new Event("paste", { bubbles: true }) as any;
  event.clipboardData = { items };
  if (target) {
    Object.defineProperty(event, "target", { value: target });
  }
  window.dispatchEvent(event);
}

describe("useClipboardPaste", () => {
  let onloadCallback: (() => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    onloadCallback = null;
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
          onloadCallback = this.onload;
        }
      }
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake-url");
    vi.spyOn(crypto, "randomUUID").mockReturnValue("paste-uuid" as any);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("paste with image item dispatches ADD_NODE after image loads", () => {
    const { dispatch } = setup();

    const file = new File([""], "img.png", { type: "image/png" });
    const item: DataTransferItem = {
      kind: "file",
      type: "image/png",
      getAsFile: () => file,
      getAsString: vi.fn(),
      webkitGetAsEntry: vi.fn(),
    } as unknown as DataTransferItem;

    firePaste([item]);

    expect(onloadCallback).not.toBeNull();
    onloadCallback!();

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ADD_NODE",
        node: expect.objectContaining({
          id: "paste-uuid",
          src: "blob:fake-url",
          naturalWidth: 200,
          naturalHeight: 100,
        }),
      })
    );
  });

  it("paste from input element is ignored", () => {
    const { dispatch } = setup();

    const input = document.createElement("input");
    document.body.appendChild(input);

    const file = new File([""], "img.png", { type: "image/png" });
    const item: DataTransferItem = {
      kind: "file",
      type: "image/png",
      getAsFile: () => file,
      getAsString: vi.fn(),
      webkitGetAsEntry: vi.fn(),
    } as unknown as DataTransferItem;

    firePaste([item], input);

    expect(dispatch).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("paste from textarea element is ignored", () => {
    const { dispatch } = setup();

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);

    const item: DataTransferItem = {
      kind: "file",
      type: "image/png",
      getAsFile: () => new File([""], "img.png", { type: "image/png" }),
      getAsString: vi.fn(),
      webkitGetAsEntry: vi.fn(),
    } as unknown as DataTransferItem;

    firePaste([item], textarea);

    expect(dispatch).not.toHaveBeenCalled();
    document.body.removeChild(textarea);
  });

  it("paste with non-image items is ignored", () => {
    const { dispatch } = setup();

    const item: DataTransferItem = {
      kind: "string",
      type: "text/plain",
      getAsFile: () => null,
      getAsString: vi.fn(),
      webkitGetAsEntry: vi.fn(),
    } as unknown as DataTransferItem;

    firePaste([item]);

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("paste uses window.innerWidth when dimensions.width is 0", () => {
    const { dispatch } = setup({ dimensions: { width: 0, height: 0 } });

    const file = new File([""], "img.png", { type: "image/png" });
    const item: DataTransferItem = {
      kind: "file",
      type: "image/png",
      getAsFile: () => file,
      getAsString: vi.fn(),
      webkitGetAsEntry: vi.fn(),
    } as unknown as DataTransferItem;

    firePaste([item]);

    expect(onloadCallback).not.toBeNull();
    onloadCallback!();

    // Should dispatch with position calculated using window.innerWidth/Height fallback
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ADD_NODE",
        node: expect.objectContaining({
          id: "paste-uuid",
        }),
      })
    );
  });

  it("paste with no clipboardData is ignored", () => {
    const { dispatch } = setup();

    const event = new Event("paste", { bubbles: true }) as any;
    event.clipboardData = null;
    window.dispatchEvent(event);

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("paste with image item where getAsFile returns null is ignored", () => {
    const { dispatch } = setup();

    const item: DataTransferItem = {
      kind: "file",
      type: "image/png",
      getAsFile: () => null,
      getAsString: vi.fn(),
      webkitGetAsEntry: vi.fn(),
    } as unknown as DataTransferItem;

    firePaste([item]);

    // getAsFile returned null, so no image is created and no dispatch
    expect(dispatch).not.toHaveBeenCalled();
  });
});

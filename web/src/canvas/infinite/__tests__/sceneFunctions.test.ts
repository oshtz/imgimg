// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useGridSceneFunc, useDropTargetSceneFunc, useSnapGuideSceneFunc } from "../sceneFunctions";

function makeMockCtx() {
  return {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    globalAlpha: 1,
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setLineDash: vi.fn(),
    roundRect: vi.fn(),
    lineTo: vi.fn(),
  };
}

function makeMockContext(ctx: ReturnType<typeof makeMockCtx>) {
  return { _context: ctx, fillStrokeShape: vi.fn() };
}

// ---------------------------------------------------------------------------
// useGridSceneFunc
// ---------------------------------------------------------------------------

describe("useGridSceneFunc", () => {
  it("returns a function", () => {
    const { result } = renderHook(() =>
      useGridSceneFunc(0, 0, 1, 800, 600, false)
    );
    expect(typeof result.current).toBe("function");
  });

  it("draws dots on the canvas context", () => {
    const { result } = renderHook(() =>
      useGridSceneFunc(0, 0, 1, 200, 200, false)
    );
    const ctx = makeMockCtx();
    const context = makeMockContext(ctx);
    const shape = {};

    result.current(context, shape);

    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalled();
    expect(context.fillStrokeShape).toHaveBeenCalledWith(shape);
  });

  it("uses light dot color when isDark is false", () => {
    const { result } = renderHook(() =>
      useGridSceneFunc(0, 0, 1, 200, 200, false)
    );
    const ctx = makeMockCtx();
    const context = makeMockContext(ctx);

    result.current(context, {});

    expect(ctx.fillStyle).toBe("#e4e4e7");
  });

  it("uses dark dot color when isDark is true", () => {
    const { result } = renderHook(() =>
      useGridSceneFunc(0, 0, 1, 200, 200, true)
    );
    const ctx = makeMockCtx();
    const context = makeMockContext(ctx);

    result.current(context, {});

    expect(ctx.fillStyle).toBe("#2d2d33");
  });

  it("calls moveTo for each dot position", () => {
    const { result } = renderHook(() =>
      useGridSceneFunc(0, 0, 1, 80, 80, false)
    );
    const ctx = makeMockCtx();
    const context = makeMockContext(ctx);

    result.current(context, {});

    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// useDropTargetSceneFunc
// ---------------------------------------------------------------------------

describe("useDropTargetSceneFunc", () => {
  it("returns a function", () => {
    const ref = { current: null };
    const { result } = renderHook(() => useDropTargetSceneFunc(ref));
    expect(typeof result.current).toBe("function");
  });

  it("only calls fillStrokeShape when no rect is set", () => {
    const ref = { current: null } as { current: { x: number; y: number; width: number; height: number } | null };
    const { result } = renderHook(() => useDropTargetSceneFunc(ref));
    const ctx = makeMockCtx();
    const context = makeMockContext(ctx);
    const shape = {};

    result.current(context, shape);

    expect(context.fillStrokeShape).toHaveBeenCalledWith(shape);
    expect(ctx.save).not.toHaveBeenCalled();
    expect(ctx.roundRect).not.toHaveBeenCalled();
  });

  it("draws rounded rect when rect is set", () => {
    const ref = { current: { x: 10, y: 20, width: 100, height: 50 } };
    const { result } = renderHook(() => useDropTargetSceneFunc(ref));
    const ctx = makeMockCtx();
    const context = makeMockContext(ctx);
    const shape = {};

    result.current(context, shape);

    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.roundRect).toHaveBeenCalledWith(10, 20, 100, 50, 8);
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
    expect(context.fillStrokeShape).toHaveBeenCalledWith(shape);
  });

  it("sets green fill and stroke colors", () => {
    const ref = { current: { x: 0, y: 0, width: 50, height: 50 } };
    const { result } = renderHook(() => useDropTargetSceneFunc(ref));
    const ctx = makeMockCtx();
    const context = makeMockContext(ctx);

    result.current(context, {});

    expect(ctx.fillStyle).toBe("#22c55e");
    expect(ctx.strokeStyle).toBe("#22c55e");
    expect(ctx.lineWidth).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// useSnapGuideSceneFunc
// ---------------------------------------------------------------------------

describe("useSnapGuideSceneFunc", () => {
  it("returns a function", () => {
    const ref = { current: [] };
    const { result } = renderHook(() =>
      useSnapGuideSceneFunc(ref, 0, 0, 1, 800, 600)
    );
    expect(typeof result.current).toBe("function");
  });

  it("only calls fillStrokeShape when no guides", () => {
    const ref = { current: [] as any[] };
    const { result } = renderHook(() =>
      useSnapGuideSceneFunc(ref, 0, 0, 1, 800, 600)
    );
    const ctx = makeMockCtx();
    const context = makeMockContext(ctx);
    const shape = {};

    result.current(context, shape);

    expect(context.fillStrokeShape).toHaveBeenCalledWith(shape);
    expect(ctx.save).not.toHaveBeenCalled();
  });

  it("draws vertical guide lines", () => {
    const ref = { current: [{ orientation: "v" as const, position: 100 }] };
    const { result } = renderHook(() =>
      useSnapGuideSceneFunc(ref, 0, 0, 1, 800, 600)
    );
    const ctx = makeMockCtx();
    const context = makeMockContext(ctx);

    result.current(context, {});

    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.setLineDash).toHaveBeenCalled();
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.moveTo).toHaveBeenCalledWith(100, expect.any(Number));
    expect(ctx.lineTo).toHaveBeenCalledWith(100, expect.any(Number));
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
    expect(context.fillStrokeShape).toHaveBeenCalled();
  });

  it("draws horizontal guide lines", () => {
    const ref = { current: [{ orientation: "h" as const, position: 200 }] };
    const { result } = renderHook(() =>
      useSnapGuideSceneFunc(ref, 0, 0, 1, 800, 600)
    );
    const ctx = makeMockCtx();
    const context = makeMockContext(ctx);

    result.current(context, {});

    expect(ctx.moveTo).toHaveBeenCalledWith(expect.any(Number), 200);
    expect(ctx.lineTo).toHaveBeenCalledWith(expect.any(Number), 200);
  });

  it("draws multiple guides", () => {
    const ref = {
      current: [
        { orientation: "v" as const, position: 50 },
        { orientation: "h" as const, position: 150 },
      ],
    };
    const { result } = renderHook(() =>
      useSnapGuideSceneFunc(ref, 0, 0, 1, 800, 600)
    );
    const ctx = makeMockCtx();
    const context = makeMockContext(ctx);

    result.current(context, {});

    // beginPath called once per guide
    expect(ctx.beginPath).toHaveBeenCalledTimes(2);
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
  });

  it("sets correct stroke style", () => {
    const ref = { current: [{ orientation: "v" as const, position: 50 }] };
    const { result } = renderHook(() =>
      useSnapGuideSceneFunc(ref, 0, 0, 2, 800, 600)
    );
    const ctx = makeMockCtx();
    const context = makeMockContext(ctx);

    result.current(context, {});

    expect(ctx.strokeStyle).toBe("#e040fb");
    expect(ctx.lineWidth).toBe(0.5); // 1 / scale(2)
    expect(ctx.setLineDash).toHaveBeenCalledWith([2, 2]); // 4/scale, 4/scale
  });
});

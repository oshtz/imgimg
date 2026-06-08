// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CanvasOutpaintPanel } from "../CanvasOutpaintPanel";
import type { CanvasNode, CanvasViewport } from "../types";

vi.mock("../../client", () => ({
  createOutpaintGeneration: vi.fn(),
}));

function makeNode(): CanvasNode {
  return {
    id: "node-1",
    type: "image",
    src: "data:image/png;base64,test",
    x: 100,
    y: 120,
    width: 320,
    height: 240,
    naturalWidth: 1024,
    naturalHeight: 768,
    zIndex: 1,
  };
}

describe("CanvasOutpaintPanel", () => {
  it("renders edge blend and creativity controls with defaults", () => {
    const viewport: CanvasViewport = { x: 0, y: 0, scale: 1 };

    render(
      React.createElement(CanvasOutpaintPanel, {
        node: makeNode(),
        viewport,
        apiBaseUrl: "tauri",
        modelId: "model-1",
        outpaintWorkflowId: "outpaint-workflow",
        onComplete: vi.fn(),
        onCancel: vi.fn(),
      }),
    );

    expect(screen.getByText("Blend")).toBeTruthy();
    expect(screen.getByText("64px")).toBeTruthy();
    expect(screen.getByText("Creativity")).toBeTruthy();
    expect(screen.getByText("80%")).toBeTruthy();
  });
});

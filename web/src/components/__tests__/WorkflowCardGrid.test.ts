// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowCardGrid } from "../WorkflowCardGrid";
import type { WorkflowSummary } from "../../api";

vi.mock("../../images/stackIllustration.svg", () => ({ default: "stack.svg" }));
vi.mock("../../images/stackIllustration2.svg", () => ({ default: "stack2.svg" }));
vi.mock("../../images/stackIllustration3.svg", () => ({ default: "stack3.svg" }));
vi.mock("../../images/stackIllustration4.svg", () => ({ default: "stack4.svg" }));

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    fillStyle: "",
    fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
});

function workflow(overrides: Partial<WorkflowSummary>): WorkflowSummary {
  return {
    id: "workflow",
    label: "Workflow",
    engine: "comfyui",
    outputMode: "single_image",
    ui: { aspectRatio: false, batchSize: false },
    supportsImageInput: false,
    supportsLora: false,
    parameters: [],
    ...overrides,
  };
}

describe("WorkflowCardGrid", () => {
  it("hides workflows for disabled providers from the home grid", () => {
    render(
      React.createElement(WorkflowCardGrid, {
        workflows: [
          workflow({ id: "fal-image", label: "FAL Image", engine: "fal" }),
          workflow({ id: "replicate-image", label: "Replicate Image", engine: "replicate" }),
        ],
        enabledProviders: { fal: false, replicate: true },
        onSelectWorkflow: vi.fn(),
      })
    );

    expect(screen.queryByText("FAL Image")).toBeNull();
    expect(screen.getByText("Replicate Image")).not.toBeNull();
  });

  it("hides workflows for unavailable providers from the home grid", () => {
    render(
      React.createElement(WorkflowCardGrid, {
        workflows: [
          workflow({ id: "fal-video", label: "FAL Video", engine: "fal", providerAvailable: false }),
          workflow({ id: "openrouter-image", label: "OpenRouter Image", engine: "openrouter", providerAvailable: true }),
        ],
        onSelectWorkflow: vi.fn(),
      })
    );

    expect(screen.queryByText("FAL Video")).toBeNull();
    expect(screen.getByText("OpenRouter Image")).not.toBeNull();
  });
});

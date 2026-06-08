// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PromptCenterpiece, type PromptCenterpieceState } from "../PromptCenterpiece";

vi.mock("../../tauri-api", () => ({
  listEnhancerPresets: vi.fn(async () => []),
  setActiveEnhancerPreset: vi.fn(async () => undefined),
}));

const promptState: PromptCenterpieceState = {
  aspectRatio: "1:1",
  batchSize: 1,
  enhancePrompt: false,
  removeItemBackgrounds: false,
  imageInputs: [],
  workflowParams: {},
};

describe("PromptCenterpiece", () => {
  it("uses a flexible prompt textarea in sidebar positions", () => {
    render(
      React.createElement(PromptCenterpiece, {
        apiBaseUrl: "http://127.0.0.1:3001",
        models: [],
        selectedModelId: "model",
        onSelectedModelIdChange: vi.fn(),
        prompt: "A long prompt",
        onPromptChange: vi.fn(),
        onGenerate: vi.fn(),
        workflowSelected: true,
        state: promptState,
        onStateChange: vi.fn(),
        workflowLabel: "Replicate Image",
        showAspectRatio: false,
        showBatchSize: false,
        supportsImageInput: false,
        requiresImageInput: false,
        supportsVideoInput: false,
        supportsAudioInput: false,
        loraEnabled: false,
        savedPrompts: [],
        promptPosition: "left",
      })
    );

    const textbox = screen.getByRole("textbox");
    expect(textbox.className).toContain("lg:h-full");
    expect(textbox.parentElement?.className).toContain("lg:self-stretch");
    expect(textbox.parentElement?.parentElement?.className).toContain("lg:items-stretch");
  });
});

// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderModelPicker } from "../ReplicateModelPicker";

vi.mock("../../client", () => ({
  searchProviderModels: vi.fn(async () => ({ models: [], nextCursor: null })),
}));

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ProviderModelPicker", () => {
  it("mounts the model chooser outside the prompt card so it is not clipped", () => {
    const promptCard = document.createElement("div");
    promptCard.setAttribute("data-testid", "prompt-card");
    document.body.appendChild(promptCard);

    render(
      React.createElement(ProviderModelPicker, {
        apiBaseUrl: "http://127.0.0.1:3001",
        provider: "replicate",
        selectedModelId: null,
        onSelect: vi.fn(),
        onClear: vi.fn(),
        assetType: "image",
      }),
      { container: promptCard }
    );

    fireEvent.click(screen.getByRole("button", { name: /choose model/i }));

    const dialog = screen.getByRole("dialog", { name: /choose replicate model/i });
    expect(promptCard.contains(dialog)).toBe(false);
  });
});

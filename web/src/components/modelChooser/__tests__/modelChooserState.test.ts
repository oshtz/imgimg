import { describe, expect, it } from "vitest";
import {
  filterPinnedModels,
  getProviderLabel,
  getProviderLogo,
  getProviderSearchCollection,
  isPinnedModel,
  summarizeModel,
} from "../modelChooserState";

const replicateModel = {
  provider: "replicate",
  modelId: "owner/flux-fast",
  displayName: "Flux Fast",
  description: "Fast image model",
  owner: "owner",
};

const falModel = {
  provider: "fal",
  modelId: "fal-ai/flux/dev",
  displayName: "Flux Dev",
  description: null,
};

describe("modelChooserState", () => {
  it("normalizes provider labels and logos", () => {
    expect(getProviderLabel("replicate")).toBe("Replicate");
    expect(getProviderLabel("fal")).toBe("FAL");
    expect(getProviderLabel("openrouter")).toBe("OpenRouter");
    expect(getProviderLabel("custom-provider")).toBe("custom-provider");

    expect(getProviderLogo("replicate")).toBe("/replicate.svg");
    expect(getProviderLogo("fal")).toBe("/fal.svg");
    expect(getProviderLogo("openrouter")).toBe("/openrouter.svg");
    expect(getProviderLogo("custom-provider")).toBeNull();
  });

  it("scopes empty Replicate searches by asset type", () => {
    expect(getProviderSearchCollection("replicate", "image", "")).toBe("text-to-image");
    expect(getProviderSearchCollection("replicate", "video", "")).toBe("text-to-video");
    expect(getProviderSearchCollection("replicate", "audio", "")).toBe("text-to-speech");
    expect(getProviderSearchCollection("replicate", undefined, "")).toBe("official");
  });

  it("does not scope typed searches or non-Replicate providers", () => {
    expect(getProviderSearchCollection("replicate", "image", "flux")).toBeUndefined();
    expect(getProviderSearchCollection("fal", "image", "")).toBeUndefined();
    expect(getProviderSearchCollection("openrouter", "image", "")).toBeUndefined();
  });

  it("detects pinned models by provider and id", () => {
    const pinnedModels = [replicateModel, falModel];

    expect(isPinnedModel(pinnedModels, "replicate", "owner/flux-fast")).toBe(true);
    expect(isPinnedModel(pinnedModels, "fal", "owner/flux-fast")).toBe(false);
    expect(isPinnedModel(pinnedModels, "replicate", "missing/model")).toBe(false);
  });

  it("filters pinned models for the active provider", () => {
    expect(filterPinnedModels([replicateModel, falModel], "replicate")).toEqual([replicateModel]);
    expect(filterPinnedModels([replicateModel, falModel], "fal")).toEqual([falModel]);
  });

  it("summarizes display text with stable fallbacks", () => {
    expect(summarizeModel(replicateModel)).toEqual({
      title: "Flux Fast",
      subtitle: "owner",
      providerLabel: "Replicate",
      logo: "/replicate.svg",
    });

    expect(summarizeModel({ ...falModel, displayName: "" })).toEqual({
      title: "fal-ai/flux/dev",
      subtitle: "fal-ai",
      providerLabel: "FAL",
      logo: "/fal.svg",
    });
  });
});

import { describe, expect, it } from "vitest";
import { discoveredToCompareModel } from "../compareModelPickerState";

describe("compareModelPickerState", () => {
  it("maps Replicate catalog models to the dynamic Replicate workflow", () => {
    expect(
      discoveredToCompareModel({
        provider: "replicate",
        modelId: "black-forest-labs/flux-schnell",
        displayName: "Flux Schnell",
        description: "Fast image generation",
      })
    ).toMatchObject({
      id: "replicate:black-forest-labs/flux-schnell",
      provider: "replicate",
      workflowId: "replicate-image",
      replicateModel: "black-forest-labs/flux-schnell",
    });
  });

  it("maps FAL catalog models to the dynamic FAL workflow", () => {
    expect(
      discoveredToCompareModel({
        provider: "fal",
        modelId: "fal-ai/flux/dev",
        displayName: "Flux Dev",
        description: null,
      })
    ).toMatchObject({
      id: "fal:fal-ai/flux/dev",
      provider: "fal",
      workflowId: "fal-image",
      falModel: "fal-ai/flux/dev",
    });
  });

  it("maps OpenRouter catalog models to the dynamic OpenRouter workflow", () => {
    expect(
      discoveredToCompareModel({
        provider: "openrouter",
        modelId: "google/gemini-2.5-flash-image",
        displayName: "Gemini Image",
        description: null,
      })
    ).toMatchObject({
      id: "openrouter:google/gemini-2.5-flash-image",
      provider: "openrouter",
      workflowId: "openrouter-image",
      openrouterModel: "google/gemini-2.5-flash-image",
    });
  });
});

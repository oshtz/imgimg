import { describe, expect, it } from "vitest";
import {
  DYNAMIC_MODEL_IDS_BY_WORKFLOW_STORAGE_KEY,
  PROMPT_DRAFT_STORAGE_KEY,
  PROMPT_UI_STORAGE_KEY,
  SELECTED_MODEL_IDS_BY_WORKFLOW_STORAGE_KEY,
  getWorkflowSelection,
  parseWorkflowSelectionMap,
  setWorkflowSelection,
} from "../workflowModelSelections";

describe("workflow model selections", () => {
  it("uses one active centerpiece draft across workflows", () => {
    expect(PROMPT_DRAFT_STORAGE_KEY).toBe("imgimg.promptDraft.v1");
    expect(PROMPT_UI_STORAGE_KEY).toBe("imgimg.promptUi.v1");
  });

  it("keeps provider and LoRA model selections scoped by workflow", () => {
    expect(SELECTED_MODEL_IDS_BY_WORKFLOW_STORAGE_KEY).toBe("imgimg.selectedModelIdsByWorkflow.v1");
    expect(DYNAMIC_MODEL_IDS_BY_WORKFLOW_STORAGE_KEY).toBe("imgimg.dynamicModelIdsByWorkflow.v1");

    const first = setWorkflowSelection({}, "replicate-image", "black-forest-labs/flux-kontext-pro");
    const second = setWorkflowSelection(first, "fal-image", "fal-ai/nano-banana/edit");

    expect(getWorkflowSelection(second, "replicate-image")).toBe("black-forest-labs/flux-kontext-pro");
    expect(getWorkflowSelection(second, "fal-image")).toBe("fal-ai/nano-banana/edit");
  });

  it("removes only the cleared workflow selection", () => {
    const selections = {
      "replicate-image": "google/nano-banana-pro",
      "fal-image": "fal-ai/nano-banana/edit",
    };

    const next = setWorkflowSelection(selections, "replicate-image", "");

    expect(getWorkflowSelection(next, "replicate-image")).toBe("");
    expect(getWorkflowSelection(next, "fal-image")).toBe("fal-ai/nano-banana/edit");
  });

  it("parses only string workflow selections from storage", () => {
    expect(parseWorkflowSelectionMap('{"replicate-image":"model-a","bad":7,"empty":""}')).toEqual({
      "replicate-image": "model-a",
    });
    expect(parseWorkflowSelectionMap("not json")).toEqual({});
  });
});

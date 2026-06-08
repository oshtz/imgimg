export type WorkflowSelectionMap = Record<string, string>;

export const PROMPT_DRAFT_STORAGE_KEY = "imgimg.promptDraft.v1";
export const PROMPT_UI_STORAGE_KEY = "imgimg.promptUi.v1";
export const SELECTED_MODEL_IDS_BY_WORKFLOW_STORAGE_KEY = "imgimg.selectedModelIdsByWorkflow.v1";
export const DYNAMIC_MODEL_IDS_BY_WORKFLOW_STORAGE_KEY = "imgimg.dynamicModelIdsByWorkflow.v1";

export function parseWorkflowSelectionMap(raw: string): WorkflowSelectionMap {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const result: WorkflowSelectionMap = {};
    for (const [workflowId, selection] of Object.entries(parsed)) {
      if (typeof selection === "string" && selection.length > 0) {
        result[workflowId] = selection;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function getWorkflowSelection(selections: WorkflowSelectionMap, workflowId: string): string {
  if (!workflowId) return "";
  return selections[workflowId] ?? "";
}

export function setWorkflowSelection(
  selections: WorkflowSelectionMap,
  workflowId: string,
  selection: string | null | undefined,
): WorkflowSelectionMap {
  if (!workflowId) return selections;

  const next = { ...selections };
  if (selection) {
    next[workflowId] = selection;
  } else {
    delete next[workflowId];
  }
  return next;
}

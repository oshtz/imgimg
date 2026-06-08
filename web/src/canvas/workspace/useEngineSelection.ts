import { useCallback, useMemo } from "react";
import type { ProviderStatus, WorkflowSummary } from "../../api";

type Params = {
  workflows: WorkflowSummary[];
  canvasWorkflowId: string;
  activeEngineFromState: string | null | undefined;
  providerStatus: ProviderStatus | null;
  dispatch: (action: any) => void;
};

export function useEngineSelection({
  workflows,
  canvasWorkflowId,
  activeEngineFromState,
  providerStatus,
  dispatch,
}: Params) {
  const defaultEngine: string = workflows.find((w) => w.id === canvasWorkflowId)?.engine ?? "comfyui";
  const activeEngine: string = activeEngineFromState ?? defaultEngine;

  const setActiveEngine = useCallback((engine: string) => {
    dispatch({ type: "SET_ENGINE", engine });
  }, [dispatch]);

  // Deduplicated list of engines present across all workflows, filtered by provider availability
  const availableEngines = useMemo(() => {
    const seen = new Set<string>();
    const all: string[] = [];
    for (const w of workflows) {
      const e = w.engine ?? "comfyui";
      if (!seen.has(e)) { seen.add(e); all.push(e); }
    }
    if (!providerStatus) return all;
    const engineProviderMap: Record<string, boolean> = {
      comfyui: providerStatus.comfyui.available,
      replicate: providerStatus.replicate.available,
      fal: providerStatus.fal.available,
      openrouter: providerStatus.openrouter.available,
      kie: providerStatus.kie.available,
    };
    return all.filter((e) => engineProviderMap[e] !== false);
  }, [workflows, providerStatus]);

  // Resolve current engine -> workflow ID
  const activeWorkflowId = useMemo(() => {
    const match = workflows.find((w) => (w.engine ?? "comfyui") === activeEngine && w.ui?.canvasMode)
      ?? workflows.find((w) => (w.engine ?? "comfyui") === activeEngine);
    return match?.id ?? canvasWorkflowId;
  }, [workflows, activeEngine, canvasWorkflowId]);

  // Filter out canvas workflows from sub-workflow list
  const subWorkflows = useMemo(
    () => workflows.filter((w) => !w.ui?.canvasMode),
    [workflows]
  );

  return { activeEngine, setActiveEngine, availableEngines, activeWorkflowId, subWorkflows };
}

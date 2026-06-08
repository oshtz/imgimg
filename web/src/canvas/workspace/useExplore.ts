import { useCallback } from "react";
import type { CanvasNode } from "../types";
import type { Generation } from "../../types";
import type { ApiBaseUrl, WorkflowSummary } from "../../api";
import type { ExploreOptions } from "../ExplorePopover";
import { findMasonryClusterPositions, dimensionsFromAspectRatio, pickExploreAspectRatios } from "../placement";
import { createGeneration, generatePromptVariants } from "../../client";
import { aspectRatioToSize, isAspectRatio } from "../../workflows";

type Params = {
  apiBaseUrl: ApiBaseUrl;
  workflows: WorkflowSummary[];
  nodes: CanvasNode[];
  history: Generation[];
  dispatch: (action: any) => void;
  onRegisterGeneration: (params: {
    generationId: string;
    jobId: string;
    workflowId: string;
    modelId: string;
    prompt: string;
    queuePosition?: number | null;
    imageInputUrl?: string | null;
    width?: number;
    height?: number;
  }) => void;
  exploreGenerationIds: React.MutableRefObject<Map<string, string>>;
  setExplorePopoverOpen: (v: boolean) => void;
};

type NodeForExplore = { id: string; x: number; y: number; width: number; height: number; generationId?: string; prompt?: string };

export function useExplore({
  apiBaseUrl,
  workflows,
  nodes,
  history,
  dispatch,
  onRegisterGeneration,
  exploreGenerationIds,
  setExplorePopoverOpen,
}: Params) {
  const fireExploreSeeds = useCallback(
    async (
      node: { id: string; x: number; y: number; width: number; height: number },
      sourceGen: Generation,
      count: number,
    ) => {
      const prompt = sourceGen.prompt;
      const workflowId = sourceGen.workflowUsed;
      const modelId = sourceGen.modelId;
      const sourceAr = sourceGen.workflowParams?.aspect_ratio as string | undefined;

      const filteredParams = sourceGen.workflowParams
        ? (Object.fromEntries(
            Object.entries(sourceGen.workflowParams).filter(([k]) => k !== "aspect_ratio")
          ) as Record<string, number | boolean | string>)
        : undefined;

      const wf = workflows.find((w) => w.id === workflowId);
      const workflowSupportsAr = wf?.ui?.aspectRatio ?? false;

      const aspectRatios = pickExploreAspectRatios(sourceAr, count, wf?.supportedAspectRatios, workflowSupportsAr);
      const itemDims = aspectRatios.map((ar) => dimensionsFromAspectRatio(ar));
      const positions = findMasonryClusterPositions(node, itemDims, nodes);

      const skeletonIds: string[] = positions.map((pos, i) => {
        const id = crypto.randomUUID();
        dispatch({
          type: "ADD_NODE",
          node: {
            id,
            x: pos.x,
            y: pos.y,
            width: itemDims[i].width,
            height: itemDims[i].height,
            naturalWidth: itemDims[i].width,
            naturalHeight: itemDims[i].height,
            zIndex: 0,
            loadingStatus: "queued",
            loadingLabel: `Exploring: ${prompt.slice(0, 40)}...`,
            sourceNodeId: node.id,
          },
        });
        return id;
      });

      for (let i = 0; i < count; i++) {
        const ar = aspectRatios[i];
        const skelId = skeletonIds[i];
        if (!skelId) continue;
        const size = ar && isAspectRatio(ar) ? aspectRatioToSize(ar) : null;

        try {
          const result = await createGeneration(apiBaseUrl, {
            modelId,
            prompt,
            workflowId,
            width: size?.width ?? sourceGen.width ?? undefined,
            height: size?.height ?? sourceGen.height ?? undefined,
            aspectRatio: ar,
            batchSize: 1,
            workflowParams: filteredParams && Object.keys(filteredParams).length > 0 ? filteredParams : undefined,
          });

          exploreGenerationIds.current.set(result.generationId, node.id);

          onRegisterGeneration({
            generationId: result.generationId,
            jobId: result.jobId,
            workflowId,
            modelId,
            prompt,
            queuePosition: result.queuePosition,
            width: size?.width ?? sourceGen.width ?? undefined,
            height: size?.height ?? sourceGen.height ?? undefined,
          });

          dispatch({
            type: "UPDATE_NODE",
            id: skelId,
            updates: { loadingStatus: "running", generationId: result.generationId },
          });
        } catch (err) {
          console.error(`Explore seed generation ${i} failed:`, err);
          dispatch({
            type: "UPDATE_NODE",
            id: skelId,
            updates: {
              loadingStatus: "failed",
              loadingLabel: `Failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          });
          setTimeout(() => {
            dispatch({ type: "REMOVE_NODE", id: skelId });
          }, 5000);
        }
      }
    },
    [apiBaseUrl, workflows, nodes, onRegisterGeneration, dispatch, exploreGenerationIds]
  );

  const fireExploreMutate = useCallback(
    async (
      node: { id: string; x: number; y: number; width: number; height: number },
      sourceGen: Generation,
      count: number,
      creativity: number,
    ) => {
      const prompt = sourceGen.prompt;
      const workflowId = sourceGen.workflowUsed;
      const modelId = sourceGen.modelId;
      const sourceAr = sourceGen.workflowParams?.aspect_ratio as string | undefined;

      const filteredParams = sourceGen.workflowParams
        ? (Object.fromEntries(
            Object.entries(sourceGen.workflowParams).filter(([k]) => k !== "aspect_ratio")
          ) as Record<string, number | boolean | string>)
        : undefined;

      const wf = workflows.find((w) => w.id === workflowId);
      const workflowSupportsAr = wf?.ui?.aspectRatio ?? false;

      const aspectRatios = pickExploreAspectRatios(sourceAr, count, wf?.supportedAspectRatios, workflowSupportsAr);
      const itemDims = aspectRatios.map((ar) => dimensionsFromAspectRatio(ar));
      const positions = findMasonryClusterPositions(node, itemDims, nodes);

      const skeletonIds: string[] = positions.map((pos, i) => {
        const id = crypto.randomUUID();
        dispatch({
          type: "ADD_NODE",
          node: {
            id,
            x: pos.x,
            y: pos.y,
            width: itemDims[i].width,
            height: itemDims[i].height,
            naturalWidth: itemDims[i].width,
            naturalHeight: itemDims[i].height,
            zIndex: 0,
            loadingStatus: "queued",
            loadingLabel: `Mutating prompt...`,
            sourceNodeId: node.id,
          },
        });
        return id;
      });

      try {
        const { variants } = await generatePromptVariants(apiBaseUrl, {
          prompt,
          count,
          creativity,
        });

        const orphanedIds = skeletonIds.slice(variants.length);
        if (orphanedIds.length > 0) {
          dispatch({ type: "REMOVE_NODES", ids: orphanedIds });
        }

        for (let i = 0; i < variants.length; i++) {
          const variantPrompt = variants[i];
          const skelId = skeletonIds[i];
          if (!skelId) continue;

          const ar = aspectRatios[i];
          const size = ar && isAspectRatio(ar) ? aspectRatioToSize(ar) : null;

          dispatch({
            type: "UPDATE_NODE",
            id: skelId,
            updates: { loadingLabel: `Exploring: ${variantPrompt.slice(0, 40)}...` },
          });

          try {
            const result = await createGeneration(apiBaseUrl, {
              modelId,
              prompt: variantPrompt,
              workflowId,
              width: size?.width ?? sourceGen.width ?? undefined,
              height: size?.height ?? sourceGen.height ?? undefined,
              aspectRatio: ar,
              batchSize: 1,
              workflowParams: filteredParams && Object.keys(filteredParams).length > 0 ? filteredParams : undefined,
            });

            exploreGenerationIds.current.set(result.generationId, node.id);

            onRegisterGeneration({
              generationId: result.generationId,
              jobId: result.jobId,
              workflowId,
              modelId,
              prompt: variantPrompt,
              queuePosition: result.queuePosition,
              width: size?.width ?? sourceGen.width ?? undefined,
              height: size?.height ?? sourceGen.height ?? undefined,
            });

            dispatch({
              type: "UPDATE_NODE",
              id: skelId,
              updates: { loadingStatus: "running", generationId: result.generationId },
            });
          } catch (err) {
            console.error(`Explore mutate generation ${i} failed:`, err);
            dispatch({
              type: "UPDATE_NODE",
              id: skelId,
              updates: {
                loadingStatus: "failed",
                loadingLabel: `Failed: ${err instanceof Error ? err.message : String(err)}`,
              },
            });
            setTimeout(() => {
              dispatch({ type: "REMOVE_NODE", id: skelId });
            }, 5000);
          }
        }
      } catch (err) {
        console.error("Prompt variant generation failed:", err);
        dispatch({ type: "REMOVE_NODES", ids: skeletonIds });
      }
    },
    [apiBaseUrl, workflows, nodes, onRegisterGeneration, dispatch, exploreGenerationIds]
  );

  const handleExplore = useCallback(
    async (node: NodeForExplore, options: ExploreOptions) => {
      if (!node.generationId) return;
      const sourceGen = history.find((g) => g.id === node.generationId);
      if (!sourceGen) return;

      setExplorePopoverOpen(false);

      if (options.mode === "mutate") {
        await fireExploreMutate(node, sourceGen, options.count, options.creativity);
      } else {
        await fireExploreSeeds(node, sourceGen, options.count);
      }
    },
    [history, fireExploreSeeds, fireExploreMutate, setExplorePopoverOpen]
  );

  const handleQuickExplore = useCallback(
    async (node: NodeForExplore) => {
      if (!node.generationId) return;
      const sourceGen = history.find((g) => g.id === node.generationId);
      if (!sourceGen) return;

      setExplorePopoverOpen(false);
      await fireExploreSeeds(node, sourceGen, 4);
    },
    [history, fireExploreSeeds, setExplorePopoverOpen]
  );

  return { handleExplore, handleQuickExplore };
}

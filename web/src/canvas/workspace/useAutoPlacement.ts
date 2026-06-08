import { useEffect, useMemo, useRef } from "react";
import type { CanvasNode } from "../types";
import type { Asset, Generation } from "../../types";
import { findFreePositionsForBatch } from "../placement";
import { NON_PLACEABLE_TYPES } from "./types";

type Viewport = { x: number; y: number; scale: number };

type Params = {
  loading: boolean;
  history: Generation[];
  nodes: CanvasNode[];
  viewport: Viewport;
  chatMessages: any[];
  assetUrl: (asset: Asset) => string;
  dispatch: (action: any) => void;
  currentUser: { id: string; email: string } | null;
  exploreGenerationIds: React.MutableRefObject<Map<string, string>>;
  pendingInpaintOps: React.MutableRefObject<Map<string, { nodeId: string; prevAssetCount: number }>>;
};

export function useAutoPlacement({
  loading,
  history,
  nodes,
  viewport,
  chatMessages,
  assetUrl,
  dispatch,
  currentUser,
  exploreGenerationIds,
  pendingInpaintOps,
}: Params) {
  // Build an index of generation IDs from completed chat tool calls.
  const canvasGenerationIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of chatMessages) {
      if (!m.toolCalls) continue;
      for (const tc of m.toolCalls) {
        if (tc.status === "completed" && tc.result?.generationId) {
          ids.add(tc.result.generationId);
        }
      }
    }
    return ids;
  }, [chatMessages]);
  const canvasGenerationIdsRef = useRef(canvasGenerationIds);
  canvasGenerationIdsRef.current = canvasGenerationIds;

  const placedGenerationIds = useRef<Set<string>>(new Set());

  // On initial load only: seed placedGenerationIds from chat tool call results
  const initialSeedDone = useRef(false);
  useEffect(() => {
    // Always seed from current nodes (skip loading skeletons)
    for (const n of nodes) {
      if (n.generationId && !n.loadingStatus) placedGenerationIds.current.add(n.generationId);
    }
    if (!initialSeedDone.current && !loading) {
      initialSeedDone.current = true;
      const nodeGenIds = new Set(nodes.map((n) => n.generationId).filter(Boolean));
      const succeededIds = new Set(history.filter((g) => g.status === "succeeded" && g.assets.length > 0).map((g) => g.id));
      for (const id of canvasGenerationIds) {
        if (!nodeGenIds.has(id) && succeededIds.has(id)) {
          placedGenerationIds.current.add(id);
        }
      }
    }
  }, [nodes, canvasGenerationIds, loading, history]);

  // Keep refs to avoid triggering auto-placement on viewport/nodes changes
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  // Auto-place completed generations
  useEffect(() => {
    if (loading) return;

    for (const gen of history) {
      if (gen.status !== "succeeded" || gen.assets.length === 0) continue;
      if (placedGenerationIds.current.has(gen.id)) continue;

      const isCanvasGeneration = canvasGenerationIdsRef.current.has(gen.id);
      const exploreSourceNodeId = exploreGenerationIds.current.get(gen.id);
      const isExploreGeneration = exploreSourceNodeId !== undefined;

      if (!isCanvasGeneration && !isExploreGeneration) continue;

      const placeableAssets = gen.assets.filter(
        (a) => a.isActive !== false && !NON_PLACEABLE_TYPES.has(a.type)
      );

      if (placeableAssets.length === 0) continue;

      placedGenerationIds.current.add(gen.id);
      if (isExploreGeneration) exploreGenerationIds.current.delete(gen.id);

      const genW = gen.width ?? 400;
      const genH = gen.height ?? 400;
      const scale = Math.min(400 / genW, 400 / genH, 1);
      const placementW = Math.round(genW * scale);
      const placementH = Math.round(genH * scale);

      const existingLoadingNode = nodesRef.current.find(
        (n) => n.generationId === gen.id && n.loadingStatus
      );

      if (existingLoadingNode) {
        const asset = placeableAssets[0];
        const url = assetUrl(asset);
        dispatch({
          type: "UPDATE_NODE",
          id: existingLoadingNode.id,
          // Folds into the skeleton's ADD_NODE so the generation is one undo step.
          transient: true,
          updates: {
            src: url,
            naturalWidth: genW,
            naturalHeight: genH,
            asset,
            loadingStatus: undefined,
            loadingLabel: undefined,
            prompt: gen.prompt || undefined,
            placedBy: currentUser ? { userId: currentUser.id, email: currentUser.email } : undefined,
          },
        });

        if (placeableAssets.length > 1) {
          for (let i = 1; i < placeableAssets.length; i++) {
            const extraAsset = placeableAssets[i];
            const extraUrl = assetUrl(extraAsset);
            dispatch({
              type: "ADD_NODE",
              // Extra images of the same generation fold into the skeleton anchor.
              transient: true,
              node: {
                id: crypto.randomUUID(),
                src: extraUrl,
                x: existingLoadingNode.x + (existingLoadingNode.width + 20) * i,
                y: existingLoadingNode.y,
                width: existingLoadingNode.width,
                height: existingLoadingNode.height,
                naturalWidth: genW,
                naturalHeight: genH,
                zIndex: 0,
                generationId: gen.id,
                asset: extraAsset,
                placedBy: currentUser ? { userId: currentUser.id, email: currentUser.email } : undefined,
                prompt: gen.prompt || undefined,
                sourceNodeId: exploreSourceNodeId || undefined,
              },
            });
          }
        }
      } else {
        const positions = findFreePositionsForBatch(
          nodesRef.current, viewportRef.current, placeableAssets.length, placementW, placementH
        );

        placeableAssets.forEach((asset, i) => {
          const url = assetUrl(asset);
          const pos = positions[i] ?? { x: 0, y: 0 };
          dispatch({
            type: "ADD_NODE",
            // First image is the undo anchor; the rest of the set fold into it.
            transient: i > 0,
            node: {
              id: crypto.randomUUID(),
              src: url,
              x: pos.x,
              y: pos.y,
              width: placementW,
              height: placementH,
              naturalWidth: genW,
              naturalHeight: genH,
              zIndex: 0,
              generationId: gen.id,
              asset,
              placedBy: currentUser ? { userId: currentUser.id, email: currentUser.email } : undefined,
              prompt: gen.prompt || undefined,
              sourceNodeId: exploreSourceNodeId || undefined,
            },
          });
        });
      }
    }
  }, [loading, history, assetUrl, canvasGenerationIds, dispatch, currentUser, exploreGenerationIds]);

  // Watch for inpaint/outpaint results
  useEffect(() => {
    if (pendingInpaintOps.current.size === 0) return;
    for (const [genId, { nodeId, prevAssetCount }] of pendingInpaintOps.current) {
      const gen = history.find((g) => g.id === genId);
      if (!gen) continue;
      if (gen.assets.length > prevAssetCount) {
        const newAsset = gen.assets[gen.assets.length - 1];
        if (newAsset) {
          const url = assetUrl(newAsset);
          // Single atomic action so an inpaint/outpaint is one consistent undo
          // step (image + asset together, not a half-reverted intermediate).
          dispatch({
            type: "REPLACE_NODE_IMAGE",
            id: nodeId,
            src: url,
            naturalWidth: gen.width ?? 1024,
            naturalHeight: gen.height ?? 1024,
            asset: newAsset,
          });
          pendingInpaintOps.current.delete(genId);
        }
      }
    }
  }, [history, assetUrl, dispatch, pendingInpaintOps]);

  return { canvasGenerationIds };
}

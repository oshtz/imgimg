import { useCallback } from "react";
import type { ApiBaseUrl } from "../../api";
import { createGeneration, removeBackground } from "../../client";

type Params = {
  apiBaseUrl: ApiBaseUrl;
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
};

export function useCanvasActions({ apiBaseUrl, onRegisterGeneration }: Params) {
  const handleUpscale = useCallback(
    async (node: { id: string; src?: string; generationId?: string }) => {
      if (!node.src) return;
      try {
        const result = await createGeneration(apiBaseUrl, {
          modelId: "",
          prompt: "",
          workflowId: "upscale-seedvr2",
          imageDataUrl: node.src,
        });
        onRegisterGeneration({
          generationId: result.generationId,
          jobId: result.jobId ?? "",
          workflowId: "upscale-seedvr2",
          modelId: "",
          prompt: "upscale",
          queuePosition: result.queuePosition,
          imageInputUrl: node.src,
        });
      } catch (err) {
        console.error("Upscale failed:", err);
      }
    },
    [apiBaseUrl, onRegisterGeneration]
  );

  const handleRemoveBackground = useCallback(
    async (node: { id: string; generationId?: string }) => {
      if (!node.generationId) return;
      try {
        await removeBackground(apiBaseUrl, node.generationId, { itemIndex: 0 });
      } catch (err) {
        console.error("Remove background failed:", err);
      }
    },
    [apiBaseUrl]
  );

  return { handleUpscale, handleRemoveBackground };
}

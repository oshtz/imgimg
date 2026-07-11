import { useCallback, useEffect, useState } from "react";
import { listCanvases, listCanvasesAsync, createCanvas, deleteCanvas as deleteCanvasMeta, renameCanvas, getCanvasStateAsync } from "../canvas/canvasStorage";
import { isTauri } from "../tauri-api";
import * as tauriApi from "../tauri-api";
import { toast } from "sonner";
import { getCanvasState, type ApiBaseUrl } from "../client";
import { resolveStorageUrl } from "../utils/assets";
import { usePersistedState } from "./usePersistedState";
import type { CanvasMeta } from "../canvas/canvasStorage";
import { putCanvasLocalState } from "../canvas/canvasStorage";

export function useCanvasManager(
  apiBaseUrl: ApiBaseUrl,
  storageReady: boolean,
  setActiveView: (view: "generate" | "gallery" | "canvas" | "compare" | "prompts") => void,
  setSidebarCollapsed: (fn: (prev: boolean) => boolean) => void,
) {
  const [canvases, setCanvases] = useState<CanvasMeta[]>(() => listCanvases());
  const [activeCanvasId, setActiveCanvasId] = usePersistedState<string | null>("imgimg.activeCanvasId", null, {
    serialize: (v) => v ?? "",
    deserialize: (v) => v || null,
  });

  // Load canvases from Tauri SQLite on mount (async)
  useEffect(() => {
    if (!isTauri()) return;
    listCanvasesAsync().then((list) => setCanvases(list));
  }, []);

  // One-time migration: pull existing server/localStorage canvas into Tauri SQLite
  useEffect(() => {
    const MIGRATION_KEY = "imgimg.canvasMigrated";
    if (localStorage.getItem(MIGRATION_KEY)) return;

    (async () => {
      try {
        if (isTauri()) {
          const localCanvases = (() => {
            try {
              const raw = localStorage.getItem("imgimg.canvases");
              return raw ? JSON.parse(raw) as CanvasMeta[] : [];
            } catch { return []; }
          })();
          for (const meta of localCanvases) {
            const rawState = localStorage.getItem(`imgimg.canvas.state.${meta.id}`);
            const state = rawState ? JSON.parse(rawState) : null;
            await tauriApi.createCanvas(meta.id, meta.name);
            if (state) {
              await tauriApi.saveCanvasState({
                gameId: meta.id,
                nodes: state.nodes ?? [],
                chatMessages: state.chatMessages ?? [],
                chatWorkflowId: state.chatWorkflowId,
                nextZIndex: state.nextZIndex ?? 1,
              });
            }
          }
          const defaultState = await tauriApi.getCanvasState("default");
          if (defaultState && ((defaultState as any).nodes?.length > 0 || (defaultState as any).chatMessages?.length > 0)) {
            const canvas = await createCanvas("Canvas (migrated)");
            await tauriApi.saveCanvasState({
              gameId: canvas.id,
              nodes: (defaultState as any).nodes ?? [],
              chatMessages: (defaultState as any).chatMessages ?? [],
              chatWorkflowId: (defaultState as any).chatWorkflowId,
              nextZIndex: (defaultState as any).nextZIndex ?? 1,
            });
          }
          const list = await listCanvasesAsync();
          setCanvases(list);
          if (list.length > 0 && !activeCanvasId) {
            setActiveCanvasId(list[0].id);
          }
        } else {
          const serverState = await getCanvasState(apiBaseUrl);
          const hasData = serverState.nodes.length > 0 || serverState.chatMessages.length > 0;
          if (hasData) {
            const canvas = await createCanvas("Canvas");
            await putCanvasLocalState(canvas.id, {
              nodes: serverState.nodes,
              chatMessages: serverState.chatMessages,
              chatWorkflowId: serverState.chatWorkflowId,
              nextZIndex: serverState.nextZIndex,
            });
            setCanvases(listCanvases());
            setActiveCanvasId(canvas.id);
            setActiveView("canvas");
          }
        }
        localStorage.setItem(MIGRATION_KEY, "1");
      } catch (error) {
        console.error("Canvas migration failed; it will retry next launch:", error);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshCanvasList = useCallback(async () => {
    if (isTauri()) {
      const list = await listCanvasesAsync();
      setCanvases(list);
      return list;
    }
    const list = listCanvases();
    setCanvases(list);
    return list;
  }, []);

  const handleCanvasCreate = useCallback(async () => {
    try {
      const canvas = await createCanvas(`Canvas ${canvases.length + 1}`);
      setCanvases((current) => [...current, canvas]);
      setActiveCanvasId(canvas.id);
      setActiveView("canvas");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create canvas");
    }
  }, [canvases.length, setActiveCanvasId, setActiveView]);

  const handleCanvasDelete = useCallback(async (id: string) => {
    try {
      await deleteCanvasMeta(id);
      const remaining = canvases.filter((canvas) => canvas.id !== id);
      setCanvases(remaining);
      if (activeCanvasId === id) {
        if (remaining.length > 0) {
          setActiveCanvasId(remaining[0].id);
        } else {
          setActiveCanvasId(null);
          setActiveView("generate");
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete canvas");
    }
  }, [activeCanvasId, canvases, setActiveCanvasId, setActiveView]);

  const handleCanvasRename = useCallback(async (id: string, name: string) => {
    try {
      await renameCanvas(id, name);
      setCanvases((current) => current.map((canvas) => (
        canvas.id === id ? { ...canvas, name } : canvas
      )));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rename canvas");
    }
  }, []);

  const handleCanvasSelect = useCallback((id: string) => {
    setActiveCanvasId(id);
    setActiveView("canvas");
    setSidebarCollapsed(() => true);
  }, [setActiveCanvasId, setActiveView, setSidebarCollapsed]);

  // Canvas previews (first image node src per canvas)
  const [canvasPreviews, setCanvasPreviews] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const previews: Record<string, string> = {};
      for (const canvas of canvases) {
        try {
          const state = await getCanvasStateAsync(canvas.id) as { nodes?: Array<{ type?: string; src?: string; asset?: { url?: string } }> } | null;
          if (cancelled) return;
          const firstImage = state?.nodes?.find(
            (n) => (!n.type || n.type === "image") && (n.src || n.asset?.url)
          );
          if (firstImage) {
            const storageUrl = firstImage.asset?.url;
            if (storageUrl?.startsWith("/storage/")) {
              const resolved = resolveStorageUrl(apiBaseUrl, storageUrl);
              if (resolved) {
                previews[canvas.id] = resolved;
                continue;
              }
            }
            if (firstImage.src) {
              previews[canvas.id] = firstImage.src;
            }
          }
        } catch {
          // skip
        }
      }
      if (!cancelled) setCanvasPreviews(previews);
    })();
    return () => { cancelled = true; };
  }, [canvases, apiBaseUrl, storageReady]);

  return {
    canvases,
    activeCanvasId,
    setActiveCanvasId,
    canvasPreviews,
    refreshCanvasList,
    handleCanvasCreate,
    handleCanvasDelete,
    handleCanvasRename,
    handleCanvasSelect,
  };
}

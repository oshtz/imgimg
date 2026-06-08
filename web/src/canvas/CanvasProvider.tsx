import { createContext, useContext, useReducer, useEffect, useRef, useState, useMemo, type ReactNode, type Dispatch } from "react";
import { undoableCanvasReducer, initialUndoableState, type CanvasAction } from "./canvasReducer";
import { getCanvasState, putCanvasState, type ApiBaseUrl } from "../client";
import { getCanvasLocalState, getCanvasStateAsync, putCanvasLocalState } from "./canvasStorage";
import { isTauri } from "../tauri-api";
import type { CanvasNode, CanvasState, ChatMessage } from "./types";
import { prefetchCanvasImages } from "./ImageNode";
import { validatePersistedCanvasState } from "./validateState";

const LEGACY_STORAGE_KEY = "imgimg.canvas.v1";
const SAVE_DEBOUNCE_MS = 500;

function viewportStorageKey(id: string) {
  return `imgimg.canvas.viewport.${id}`;
}

type CanvasContextValue = {
  state: CanvasState;
  dispatch: Dispatch<CanvasAction>;
  loading: boolean;
  /** True when loaded state has nodes but no persisted viewport — caller should FIT_TO_CONTENT */
  needsInitialFit: boolean;
  saveError: string | null;
  currentUser: { userId: string; email: string } | null;
  canUndo: boolean;
  canRedo: boolean;
  canvasId: string | undefined;
};

const CanvasContext = createContext<CanvasContextValue | null>(null);

type CanvasProviderProps = {
  children: ReactNode;
  apiBaseUrl: ApiBaseUrl;
  /** Local canvas ID for multi-canvas mode. When set, uses localStorage instead of server. */
  canvasId?: string;
  currentUser: { id: string; email: string } | null;
};

export function CanvasProvider({ children, apiBaseUrl, canvasId, currentUser }: CanvasProviderProps) {
  const [undoableState, dispatch] = useReducer(undoableCanvasReducer, initialUndoableState);
  const state = undoableState.present;
  const canUndo = undoableState.past.length > 0;
  const canRedo = undoableState.future.length > 0;
  const [loading, setLoading] = useState(true);
  const [needsInitialFit, setNeedsInitialFit] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedIdRef = useRef<string | null>(null);
  const lastLoadedRef = useRef<number>(0);
  const stateVersionRef = useRef<number>(0);

  const persistKey = canvasId;

  // Load state on mount / key change
  useEffect(() => {
    if (!persistKey) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        let loadedNodes: CanvasNode[] = [];

        if (canvasId) {
          // ── Multi-canvas: load from SQLite (Tauri) or localStorage ──
          const raw = await getCanvasStateAsync(canvasId);
          const local = validatePersistedCanvasState(raw);
          dispatch({
            type: "LOAD_STATE",
            nodes: local?.nodes ?? [],
            chatMessages: local?.chatMessages ?? [],
            chatWorkflowId: local?.chatWorkflowId ?? null,
            nextZIndex: local?.nextZIndex ?? 1,
            connectors: local?.connectors,
            pinnedModelIds: local?.pinnedModelIds,
            pinnedWorkflowIds: local?.pinnedWorkflowIds,
            selectedProviderModelId: local?.selectedProviderModelId,
            activeEngine: local?.activeEngine,
          });
          loadedNodes = local?.nodes ?? [];
        } else {
          // ── Legacy: load from server ──
          const serverState = await getCanvasState(apiBaseUrl);
          if (cancelled) return;

          const hasServerData = serverState.nodes.length > 0 || serverState.chatMessages.length > 0;
          let migratedNodes: CanvasNode[] | null = null;

          if (hasServerData) {
            dispatch({
              type: "LOAD_STATE",
              nodes: serverState.nodes as CanvasNode[],
              chatMessages: serverState.chatMessages as ChatMessage[],
              chatWorkflowId: serverState.chatWorkflowId,
              nextZIndex: serverState.nextZIndex,
              connectors: (serverState as any).connectors,
              pinnedModelIds: serverState.pinnedModelIds,
            });
            loadedNodes = serverState.nodes as CanvasNode[];
          } else {
            // Try one-time migration from localStorage
            let migratedFromLocal = false;
            try {
              const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
              if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed.nodes && parsed.nodes.length > 0) {
                  dispatch({
                    type: "LOAD_STATE",
                    nodes: parsed.nodes as CanvasNode[],
                    chatMessages: (parsed.chatMessages ?? []) as ChatMessage[],
                    chatWorkflowId: parsed.chatWorkflowId ?? null,
                    nextZIndex: parsed.nextZIndex ?? 1,
                  });
                  migratedNodes = parsed.nodes as CanvasNode[];
                  migratedFromLocal = true;
                  await putCanvasState(apiBaseUrl, {
                    nodes: parsed.nodes,
                    chatMessages: parsed.chatMessages ?? [],
                    chatWorkflowId: parsed.chatWorkflowId ?? null,
                    nextZIndex: parsed.nextZIndex ?? 1,
                  });
                }
                localStorage.removeItem(LEGACY_STORAGE_KEY);
              }
            } catch {
              // Ignore migration errors
            }

            loadedNodes = migratedNodes ?? [];
          }
        }

        if (cancelled) return;

        // Restore viewport from localStorage
        let hasPersistedViewport = false;
        try {
          const vpRaw = localStorage.getItem(viewportStorageKey(persistKey));
          if (vpRaw) {
            const vp = JSON.parse(vpRaw);
            if (typeof vp.x === "number" && typeof vp.y === "number" && typeof vp.scale === "number") {
              dispatch({ type: "SET_VIEWPORT", viewport: vp });
              hasPersistedViewport = true;
            }
          }
        } catch {
          // Ignore
        }

        if (loadedNodes.length > 0 && !hasPersistedViewport) {
          setNeedsInitialFit(true);
        }

        // Pre-warm image cache so ImageNodes mount with images already available
        if (loadedNodes.length > 0) {
          await prefetchCanvasImages(loadedNodes, apiBaseUrl);
        }

        loadedIdRef.current = persistKey;
        stateVersionRef.current += 1;
        lastLoadedRef.current = stateVersionRef.current;
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load canvas state:", err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBaseUrl, persistKey]);

  // Increment version only when persistable state changes
  useEffect(() => {
    stateVersionRef.current += 1;
  }, [state.nodes, state.chatMessages, state.chatWorkflowId, state.nextZIndex, state.connectors, state.pinnedModelIds, state.pinnedWorkflowIds, state.selectedProviderModelId, state.activeEngine]);

  // Save viewport to localStorage when it changes
  useEffect(() => {
    if (loading || !persistKey || loadedIdRef.current !== persistKey) return;
    try {
      localStorage.setItem(viewportStorageKey(persistKey), JSON.stringify(state.viewport));
    } catch {
      // Ignore
    }
  }, [state.viewport, loading, persistKey]);

  // Debounced save
  useEffect(() => {
    if (loading || !persistKey || loadedIdRef.current !== persistKey) return;

    const currentVersion = stateVersionRef.current;
    if (currentVersion <= lastLoadedRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const payload = {
        // Filter out loading skeleton nodes — they are transient and should not be persisted
        nodes: state.nodes.filter((n) => !n.loadingStatus),
        chatMessages: state.chatMessages,
        chatWorkflowId: state.chatWorkflowId,
        nextZIndex: state.nextZIndex,
        connectors: state.connectors,
        pinnedModelIds: state.pinnedModelIds,
        pinnedWorkflowIds: state.pinnedWorkflowIds,
        selectedProviderModelId: state.selectedProviderModelId,
        activeEngine: state.activeEngine,
      };

      if (canvasId) {
        // Multi-canvas: save to localStorage
        putCanvasLocalState(canvasId, payload);
        setSaveError(null);
      } else {
        // Legacy: save to server
        putCanvasState(apiBaseUrl, payload).then(() => {
          setSaveError(null);
        }).catch((err) => {
          console.error("Failed to save canvas state:", err);
          setSaveError(err instanceof Error ? err.message : "Save failed");
        });
      }
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state.nodes, state.chatMessages, state.chatWorkflowId, state.nextZIndex, state.connectors, state.pinnedModelIds, state.pinnedWorkflowIds, state.selectedProviderModelId, state.activeEngine, loading, apiBaseUrl, persistKey, canvasId]);

  const ctxUser = useMemo(
    () => currentUser ? { userId: currentUser.id, email: currentUser.email } : null,
    [currentUser?.id, currentUser?.email]
  );

  const contextValue = useMemo(
    () => ({ state, dispatch, loading, needsInitialFit, saveError, currentUser: ctxUser, canUndo, canRedo, canvasId }),
    [state, dispatch, loading, needsInitialFit, saveError, ctxUser, canUndo, canRedo, canvasId]
  );

  return (
    <CanvasContext.Provider value={contextValue}>
      {children}
    </CanvasContext.Provider>
  );
}

export function useCanvas() {
  const ctx = useContext(CanvasContext);
  if (!ctx) throw new Error("useCanvas must be used within CanvasProvider");
  return ctx;
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CanvasProvider, useCanvas } from "./CanvasProvider";
import { InfiniteCanvas } from "./InfiniteCanvas";
import { CanvasToolbar } from "./CanvasToolbar";
import { CanvasContextMenu } from "./CanvasContextMenu";
import { NodeActionBar } from "./NodeActionBar";
import { ChatPanel } from "./ChatPanel";
import { CanvasInpaintOverlay } from "./CanvasInpaintOverlay";
import { CanvasOutpaintPanel } from "./CanvasOutpaintPanel";
import { CanvasCropOverlay } from "./CanvasCropOverlay";
import { CanvasMinimap } from "./CanvasMinimap";
import { LayersPanel } from "./LayersPanel";
import { PresentationMode } from "./PresentationMode";
import { TemplatePicker } from "./TemplatePicker";
import { ExplorePopover } from "./ExplorePopover";

import type { CanvasWorkspaceProps } from "./workspace/types";
import { useKeyboardShortcuts } from "./workspace/useKeyboardShortcuts";
import { useClipboardPaste } from "./workspace/useClipboardPaste";
import { useDragDrop } from "./workspace/useDragDrop";
import { useAutoPlacement } from "./workspace/useAutoPlacement";
import { useExplore } from "./workspace/useExplore";
import { useCanvasActions } from "./workspace/useCanvasActions";
import { useEngineSelection } from "./workspace/useEngineSelection";
import { ConnectorActionBar } from "./workspace/ConnectorActionBar";
import { InlineTextEditor } from "./workspace/InlineTextEditor";

function CanvasWorkspaceInner({
  apiBaseUrl,
  canvasWorkflowId,
  selectedModelId,
  models,
  history,
  workflows,
  assetUrl,
  onRegisterGeneration,
  currentUser,
  providerStatus,
  pinnedReplicateModels,
  onPinReplicateModel,
  onUnpinReplicateModel,
  featureWorkflows,
}: CanvasWorkspaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const { state, dispatch, loading, needsInitialFit } = useCanvas();
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [chatOpen, setChatOpen] = useState(() => {
    const saved = localStorage.getItem("imgimg.canvas.chatOpen");
    return saved !== null ? saved === "true" : true;
  });
  useEffect(() => {
    localStorage.setItem("imgimg.canvas.chatOpen", String(chatOpen));
  }, [chatOpen]);
  const [layersOpen, setLayersOpen] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [canvasHintDismissed, setCanvasHintDismissedRaw] = useState(() => {
    try { return localStorage.getItem("imgimg.canvas.hintDismissed") === "true"; } catch { return false; }
  });
  const setCanvasHintDismissed = useCallback((v: boolean) => {
    setCanvasHintDismissedRaw(v);
    try { localStorage.setItem("imgimg.canvas.hintDismissed", String(v)); } catch {}
  }, []);
  // Internal clipboard for copy/paste
  const clipboardRef = useRef<import("./types").CanvasNode[]>([]);
  // Inline text editing for sticky notes and frame titles
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  // Konva stage ref (exposed from InfiniteCanvas for export)
  const [stageRef, setStageRef] = useState<import("konva").default.Stage | null>(null);
  // Imperative drag-follow for the action bar
  const actionBarWrapperRef = useRef<HTMLDivElement>(null);
  const viewportScaleRef = useRef(state.viewport.scale);
  viewportScaleRef.current = state.viewport.scale;
  // Draw tool settings (ephemeral, not undoable)
  const [drawColor, setDrawColor] = useState("#1e293b");
  const [drawWidth, setDrawWidth] = useState(3);
  // Selected connector (for connector action bar)
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);

  // ─── Engine selection ──────────────────────────────────────────────────────
  const { activeEngine, setActiveEngine, availableEngines, activeWorkflowId, subWorkflows } = useEngineSelection({
    workflows,
    canvasWorkflowId,
    activeEngineFromState: state.activeEngine,
    providerStatus,
    dispatch,
  });

  // Explore popover state — close when selection changes
  const [explorePopoverOpen, setExplorePopoverOpen] = useState(false);
  const prevSelectedRef = useRef(state.selectedNodeIds);
  useEffect(() => {
    if (prevSelectedRef.current !== state.selectedNodeIds) {
      prevSelectedRef.current = state.selectedNodeIds;
      setExplorePopoverOpen(false);
    }
  }, [state.selectedNodeIds]);

  // Measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-fit viewport to content on initial load when no persisted viewport exists
  const didInitialFitRef = useRef(false);
  useEffect(() => {
    if (
      !loading &&
      needsInitialFit &&
      !didInitialFitRef.current &&
      dimensions.width > 0 &&
      dimensions.height > 0 &&
      state.nodes.length > 0
    ) {
      didInitialFitRef.current = true;
      dispatch({
        type: "FIT_TO_CONTENT",
        containerWidth: dimensions.width,
        containerHeight: dimensions.height,
      });
    }
  }, [loading, needsInitialFit, dimensions, state.nodes.length, dispatch]);

  // Map of explore generation IDs -> source canvas node ID (for auto-placement + lineage)
  const exploreGenerationIds = useRef<Map<string, string>>(new Map());
  // Track pending inpaint/outpaint operations: maps generationId -> { nodeId, previousAssetCount }
  const pendingInpaintOps = useRef<Map<string, { nodeId: string; prevAssetCount: number }>>(new Map());

  // ─── Auto-placement ────────────────────────────────────────────────────────
  useAutoPlacement({
    loading,
    history,
    nodes: state.nodes,
    viewport: state.viewport,
    chatMessages: state.chatMessages,
    assetUrl,
    dispatch,
    currentUser,
    exploreGenerationIds,
    pendingInpaintOps,
  });

  // ─── Keyboard shortcuts ────────────────────────────────────────────────────
  useKeyboardShortcuts({
    selectedNodeIds: state.selectedNodeIds,
    nodes: state.nodes,
    dimensions,
    dispatch,
    selectedConnectorId,
    setSelectedConnectorId,
    setContextMenu,
    clipboardRef,
  });

  // ─── System clipboard paste ────────────────────────────────────────────────
  useClipboardPaste({
    viewport: state.viewport,
    dimensions,
    dispatch,
  });

  // ─── Drag and drop ─────────────────────────────────────────────────────────
  const { handleDragOver, handleDragLeave, handleDrop } = useDragDrop({
    viewport: state.viewport,
    containerRef,
    dispatch,
    setDragOver,
  });

  const handleContextMenu = useCallback(
    (e: { nodeId: string; x: number; y: number }) => setContextMenu(e),
    []
  );

  // Track whether a drag is in progress so we can show/hide the action bar
  const [isDragging, setIsDragging] = useState(false);
  const handleDragDelta = useCallback((dx: number, dy: number) => {
    if (dx === 0 && dy === 0) {
      setIsDragging(false);
    } else {
      setIsDragging(true);
    }
  }, []);

  // ─── Explore (variation) handler ──────────────────────────────────────────
  const { handleExplore, handleQuickExplore } = useExplore({
    apiBaseUrl,
    workflows,
    nodes: state.nodes,
    history,
    dispatch,
    onRegisterGeneration,
    exploreGenerationIds,
    setExplorePopoverOpen,
  });

  // ─── Upscale / Remove background ─────────────────────────────────────────
  const { handleUpscale, handleRemoveBackground } = useCanvasActions({
    apiBaseUrl,
    onRegisterGeneration,
  });

  // ─── Derived selection state ──────────────────────────────────────────────
  const selectedNodes = useMemo(
    () => state.nodes.filter((n) => state.selectedNodeIds.has(n.id)),
    [state.nodes, state.selectedNodeIds]
  );
  const singleSelectedNode = selectedNodes.length === 1 ? selectedNodes[0] : null;

  return (
    <div className="relative flex h-full min-h-0 flex-1">
      {/* Main canvas area */}
      <div
        className="relative flex min-w-0 flex-1 flex-col"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drop indicator */}
        {dragOver && (
          <div className="pointer-events-none absolute inset-0 z-50 border-4 border-dashed border-zinc-400 bg-zinc-100/10" />
        )}

        {/* Toolbar */}
        <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2">
          <CanvasToolbar history={history} assetUrl={assetUrl} apiBaseUrl={apiBaseUrl} containerWidth={dimensions.width} containerHeight={dimensions.height} stageRef={stageRef} layersOpen={layersOpen} onToggleLayers={() => setLayersOpen((p) => !p)} onPresent={() => setPresenting(true)} onTemplate={() => setTemplatePickerOpen(true)} drawColor={drawColor} drawWidth={drawWidth} onDrawColorChange={setDrawColor} onDrawWidthChange={setDrawWidth} engines={availableEngines} activeEngine={activeEngine} onEngineChange={setActiveEngine} />
        </div>

        {/* Canvas */}
        <div ref={containerRef} className="min-h-0 flex-1">
          {dimensions.width > 0 && dimensions.height > 0 && (
            <InfiniteCanvas
              width={dimensions.width}
              height={dimensions.height}
              apiBaseUrl={apiBaseUrl}
              locked={state.editMode !== "select" && state.editMode !== "connect" && state.editMode !== "draw"}
              onContextMenu={handleContextMenu}
              editingNodeId={editingNodeId}
              onDragDelta={handleDragDelta}
              onStageRef={setStageRef}
              drawColor={drawColor}
              drawWidth={drawWidth}
              selectedConnectorId={selectedConnectorId}
              onConnectorSelect={setSelectedConnectorId}
              onNodeDblClick={(nodeId) => {
                const n = state.nodes.find((nd) => nd.id === nodeId);
                if (!n) return;
                if (n.type === "text" || n.type === "frame") {
                  setEditingNodeId(nodeId);
                } else {
                  dispatch({ type: "SELECT_NODE", id: nodeId });
                  dispatch({ type: "SET_EDIT_MODE", mode: "crop" });
                }
              }}
            />
          )}

          {/* Initial load overlay */}
          {loading && (
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 rounded-xl bg-white/80 px-8 py-6 shadow-lg backdrop-blur-sm dark:bg-zinc-900/80">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-500 dark:border-zinc-600 dark:border-t-zinc-400" />
                <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Loading canvas...</span>
              </div>
            </div>
          )}

          {/* Empty canvas hint */}
          {!loading && state.nodes.length === 0 && !canvasHintDismissed && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
              <div className="pointer-events-auto flex max-w-xs flex-col gap-2 rounded-xl border border-zinc-200 bg-white/90 px-6 py-5 text-center shadow-lg backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/90">
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  Drag images from the gallery onto the canvas, or use the toolbar to add text and shapes.
                </p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  Tip: Right-click for more options.
                </p>
                <button
                  type="button"
                  onClick={() => setCanvasHintDismissed(true)}
                  className="mt-1 self-end rounded-md px-3 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Layers panel */}
        {layersOpen && (
          <LayersPanel onClose={() => setLayersOpen(false)} containerWidth={dimensions.width} containerHeight={dimensions.height} />
        )}

        {/* Minimap */}
        {dimensions.width > 0 && dimensions.height > 0 && (
          <CanvasMinimap containerWidth={dimensions.width} containerHeight={dimensions.height} />
        )}

        {/* Node action bar (floating above selected nodes) */}
        {selectedNodes.length > 0 && state.editMode === "select" && !isDragging && (
          <div ref={actionBarWrapperRef}>
            <NodeActionBar
              nodes={selectedNodes}
              viewport={state.viewport}
              onInpaint={featureWorkflows?.inpaintWorkflowId && singleSelectedNode && (!singleSelectedNode.type || singleSelectedNode.type === "image") && !singleSelectedNode.loadingStatus ? () => dispatch({ type: "SET_EDIT_MODE", mode: "inpaint" }) : undefined}
              onOutpaint={featureWorkflows?.outpaintWorkflowId && singleSelectedNode && (!singleSelectedNode.type || singleSelectedNode.type === "image") && !singleSelectedNode.loadingStatus ? () => dispatch({ type: "SET_EDIT_MODE", mode: "outpaint" }) : undefined}
              onCrop={singleSelectedNode && (!singleSelectedNode.type || singleSelectedNode.type === "image") && !singleSelectedNode.loadingStatus ? () => dispatch({ type: "SET_EDIT_MODE", mode: "crop" }) : undefined}
              onExplore={singleSelectedNode && (!singleSelectedNode.type || singleSelectedNode.type === "image") && singleSelectedNode.generationId && !singleSelectedNode.loadingStatus ? () => setExplorePopoverOpen((p) => !p) : undefined}
              exploreOpen={explorePopoverOpen}
              onUpscale={singleSelectedNode && (!singleSelectedNode.type || singleSelectedNode.type === "image") && singleSelectedNode.src && !singleSelectedNode.loadingStatus ? () => handleUpscale(singleSelectedNode) : undefined}
              onRemoveBackground={featureWorkflows?.rembgWorkflowId && singleSelectedNode && (!singleSelectedNode.type || singleSelectedNode.type === "image") && singleSelectedNode.generationId && !singleSelectedNode.loadingStatus ? () => handleRemoveBackground(singleSelectedNode) : undefined}
              onDelete={() => dispatch({ type: "REMOVE_NODES", ids: [...state.selectedNodeIds] })}
              containerWidth={dimensions.width}
              containerHeight={dimensions.height}
            />
          </div>
        )}

        {/* Explore popover (anchored below the action bar / above the selected node) */}
        {explorePopoverOpen && singleSelectedNode && singleSelectedNode.generationId && (() => {
          const bbMinY = singleSelectedNode.y;
          const bbMaxY = singleSelectedNode.y + singleSelectedNode.height;
          const bbCenterX = singleSelectedNode.x + singleSelectedNode.width / 2;
          const screenCenterX = bbCenterX * state.viewport.scale + state.viewport.x;
          const screenTopY = bbMinY * state.viewport.scale + state.viewport.y - 56;
          const screenBottomY = bbMaxY * state.viewport.scale + state.viewport.y + 12;
          const flipBelow = screenTopY < 320;
          return (
            <ExplorePopover
              anchorX={screenCenterX}
              anchorY={flipBelow ? screenBottomY : screenTopY}
              above={!flipBelow}
              onExplore={(options) => handleExplore(singleSelectedNode, options)}
              onQuickExplore={() => handleQuickExplore(singleSelectedNode)}
              onClose={() => setExplorePopoverOpen(false)}
            />
          );
        })()}

        {/* Connector action bar (floating at connector midpoint) */}
        {selectedConnectorId && (() => {
          const conn = state.connectors.find((c) => c.id === selectedConnectorId);
          if (!conn) return null;
          const fromNode = state.nodes.find((n) => n.id === conn.fromNodeId);
          const toNode = state.nodes.find((n) => n.id === conn.toNodeId);
          if (!fromNode || !toNode) return null;
          return (
            <ConnectorActionBar
              connector={conn}
              fromNode={fromNode}
              toNode={toNode}
              viewport={state.viewport}
              dispatch={dispatch}
              onDeselect={() => setSelectedConnectorId(null)}
            />
          );
        })()}

        {/* Inpaint overlay (single-select only) */}
        {singleSelectedNode && state.editMode === "inpaint" && (
          <CanvasInpaintOverlay
            node={singleSelectedNode}
            viewport={state.viewport}
            apiBaseUrl={apiBaseUrl}
            onComplete={(_src, _w, _h) => {
              if (singleSelectedNode.generationId) {
                const gen = history.find((g) => g.id === singleSelectedNode.generationId);
                pendingInpaintOps.current.set(singleSelectedNode.generationId, {
                  nodeId: singleSelectedNode.id,
                  prevAssetCount: gen?.assets.length ?? 0,
                });
              }
              dispatch({ type: "SET_EDIT_MODE", mode: "select" });
            }}
            onCancel={() => dispatch({ type: "SET_EDIT_MODE", mode: "select" })}
          />
        )}

        {/* Outpaint panel (single-select only) */}
        {singleSelectedNode && state.editMode === "outpaint" && (
          <CanvasOutpaintPanel
            node={singleSelectedNode}
            viewport={state.viewport}
            apiBaseUrl={apiBaseUrl}
            modelId={selectedModelId}
            outpaintWorkflowId={featureWorkflows?.outpaintWorkflowId ?? ""}
            onComplete={(result) => {
              const scale = Math.min(400 / result.naturalWidth, 400 / result.naturalHeight, 1);
              const skelW = Math.round(result.naturalWidth * scale);
              const skelH = Math.round(result.naturalHeight * scale);
              const skelX = singleSelectedNode.x + singleSelectedNode.width + 40;
              const skelY = singleSelectedNode.y;
              const skelId = crypto.randomUUID();

              dispatch({
                type: "ADD_NODE",
                node: {
                  id: skelId,
                  x: skelX,
                  y: skelY,
                  width: skelW,
                  height: skelH,
                  naturalWidth: result.naturalWidth,
                  naturalHeight: result.naturalHeight,
                  zIndex: 0,
                  generationId: result.generationId,
                  loadingStatus: "running",
                  loadingLabel: "Outpainting...",
                  sourceNodeId: singleSelectedNode.id,
                },
              });

              exploreGenerationIds.current.set(result.generationId, singleSelectedNode.id);

              onRegisterGeneration({
                generationId: result.generationId,
                jobId: result.jobId,
                workflowId: featureWorkflows?.outpaintWorkflowId ?? "outpaint-new",
                modelId: selectedModelId,
                prompt: "outpaint",
                queuePosition: result.queuePosition,
                width: result.naturalWidth,
                height: result.naturalHeight,
              });

              dispatch({ type: "SET_EDIT_MODE", mode: "select" });
            }}
            onCancel={() => dispatch({ type: "SET_EDIT_MODE", mode: "select" })}
          />
        )}

        {/* Crop overlay (single-select only) */}
        {singleSelectedNode && state.editMode === "crop" && (
          <CanvasCropOverlay
            node={singleSelectedNode}
            viewport={state.viewport}
            apiBaseUrl={apiBaseUrl}
            onApply={(crop) => {
              const cropAspect = crop.width / crop.height;
              const currentArea = singleSelectedNode.width * singleSelectedNode.height;
              const newHeight = Math.sqrt(currentArea / cropAspect);
              const newWidth = newHeight * cropAspect;
              dispatch({
                type: "UPDATE_NODE",
                id: singleSelectedNode.id,
                updates: { crop, width: Math.round(newWidth), height: Math.round(newHeight) },
              });
              dispatch({ type: "SET_EDIT_MODE", mode: "select" });
            }}
            onReset={() => {
              const fullAspect = singleSelectedNode.naturalWidth / singleSelectedNode.naturalHeight;
              const currentArea = singleSelectedNode.width * singleSelectedNode.height;
              const newHeight = Math.sqrt(currentArea / fullAspect);
              const newWidth = newHeight * fullAspect;
              dispatch({
                type: "UPDATE_NODE",
                id: singleSelectedNode.id,
                updates: { crop: undefined, width: Math.round(newWidth), height: Math.round(newHeight) },
              });
              dispatch({ type: "SET_EDIT_MODE", mode: "select" });
            }}
            onCancel={() => dispatch({ type: "SET_EDIT_MODE", mode: "select" })}
          />
        )}

        {/* Inline text editor for sticky notes and frame titles */}
        {editingNodeId && (() => {
          const editNode = state.nodes.find((n) => n.id === editingNodeId);
          if (!editNode) return null;
          return (
            <InlineTextEditor
              editingNodeId={editingNodeId}
              node={editNode}
              viewport={state.viewport}
              dispatch={dispatch}
              onClose={() => setEditingNodeId(null)}
            />
          );
        })()}

        {/* Context menu */}
        {contextMenu && (
          <CanvasContextMenu
            nodeIds={[...state.selectedNodeIds]}
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => setContextMenu(null)}
            stageRef={stageRef}
          />
        )}

        {/* Chat toggle */}
        <button
          onClick={() => setChatOpen((p) => !p)}
          className="absolute bottom-4 right-4 z-20 rounded-full bg-zinc-600 p-3 text-white shadow-lg transition-colors hover:bg-zinc-700"
          title={chatOpen ? "Close chat" : "Open chat"}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </div>

      {/* Presentation mode overlay */}
      {presenting && (
        <PresentationMode onExit={() => setPresenting(false)} containerWidth={dimensions.width} containerHeight={dimensions.height} />
      )}

      {/* Template picker modal */}
      {templatePickerOpen && (
        <TemplatePicker
          containerWidth={dimensions.width}
          containerHeight={dimensions.height}
          onClose={() => setTemplatePickerOpen(false)}
        />
      )}

      {/* Chat panel (floating overlay) */}
      {chatOpen && (
        <div className="pointer-events-none absolute inset-y-0 right-0 z-20 flex pb-3 pr-3 pt-14">
          <ChatPanel
            apiBaseUrl={apiBaseUrl}
            canvasWorkflowId={activeWorkflowId}
            selectedModelId={selectedModelId}
            models={models}
            workflows={subWorkflows}
            assetUrl={assetUrl}
            onRegisterGeneration={onRegisterGeneration}
            onLoadingNode={(action, data) => {
              if (action === "add") {
                dispatch({ type: "ADD_NODE", node: data as any });
              } else if (action === "update") {
                // Loading-status churn folds into the skeleton's ADD_NODE undo entry.
                dispatch({ type: "UPDATE_NODE", id: data.id, updates: data.updates, transient: true });
              }
            }}
            onClose={() => setChatOpen(false)}
            activeEngine={activeEngine}
            pinnedReplicateModels={pinnedReplicateModels}
            onPinReplicateModel={onPinReplicateModel}
            onUnpinReplicateModel={onUnpinReplicateModel}
          />
        </div>
      )}
    </div>
  );
}

export function CanvasWorkspace(props: CanvasWorkspaceProps) {
  return (
    <CanvasProvider apiBaseUrl={props.apiBaseUrl} canvasId={props.canvasId} currentUser={props.currentUser}>
      <CanvasWorkspaceInner {...props} />
    </CanvasProvider>
  );
}

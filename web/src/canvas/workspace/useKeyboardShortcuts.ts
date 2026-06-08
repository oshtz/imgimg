import { useEffect, useRef } from "react";
import type { CanvasNode } from "../types";

type Params = {
  selectedNodeIds: Set<string>;
  nodes: CanvasNode[];
  dimensions: { width: number; height: number };
  dispatch: (action: any) => void;
  selectedConnectorId: string | null;
  setSelectedConnectorId: (id: string | null) => void;
  setContextMenu: (menu: null) => void;
  clipboardRef: React.MutableRefObject<CanvasNode[]>;
};

export function useKeyboardShortcuts({
  selectedNodeIds,
  nodes,
  dimensions,
  dispatch,
  selectedConnectorId,
  setSelectedConnectorId,
  setContextMenu,
  clipboardRef,
}: Params) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        // Delete selected connector
        if (selectedConnectorId) {
          dispatch({ type: "REMOVE_CONNECTOR", id: selectedConnectorId });
          setSelectedConnectorId(null);
          return;
        }
        if (selectedNodeIds.size > 0) {
          // Only delete unlocked nodes
          const deletableIds = [...selectedNodeIds].filter((id) => {
            const n = nodes.find((nd) => nd.id === id);
            return n && !n.locked;
          });
          if (deletableIds.length > 0) {
            dispatch({ type: "REMOVE_NODES", ids: deletableIds });
          }
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "d") {
        e.preventDefault();
        if (selectedNodeIds.size > 0) {
          dispatch({ type: "DUPLICATE_NODES", ids: [...selectedNodeIds] });
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        e.preventDefault();
        dispatch({ type: "SELECT_NODES", ids: nodes.map((n) => n.id) });
      }
      // Copy selected nodes (Ctrl+C)
      if ((e.metaKey || e.ctrlKey) && e.key === "c" && selectedNodeIds.size > 0) {
        clipboardRef.current = nodes
          .filter((n) => selectedNodeIds.has(n.id))
          .map((n) => ({ ...n }));
      }
      // Cut selected nodes (Ctrl+X)
      if ((e.metaKey || e.ctrlKey) && e.key === "x" && selectedNodeIds.size > 0) {
        clipboardRef.current = nodes
          .filter((n) => selectedNodeIds.has(n.id))
          .map((n) => ({ ...n }));
        dispatch({ type: "REMOVE_NODES", ids: [...selectedNodeIds] });
      }
      // Paste nodes (Ctrl+V)
      if ((e.metaKey || e.ctrlKey) && e.key === "v" && clipboardRef.current.length > 0) {
        e.preventDefault();
        const newIds: string[] = [];
        for (const src of clipboardRef.current) {
          const newId = crypto.randomUUID();
          newIds.push(newId);
          dispatch({
            type: "ADD_NODE",
            node: { ...src, id: newId, x: src.x + 30, y: src.y + 30 },
          });
        }
        dispatch({ type: "SELECT_NODES", ids: newIds });
        // Shift clipboard offset for next paste
        clipboardRef.current = clipboardRef.current.map((n) => ({ ...n, x: n.x + 30, y: n.y + 30 }));
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: "UNDO" });
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        dispatch({ type: "REDO" });
      }
      if (e.key === "Escape") {
        dispatch({ type: "SELECT_NODE", id: null });
        dispatch({ type: "SET_EDIT_MODE", mode: "select" });
        setSelectedConnectorId(null);
        setContextMenu(null);
      }
      if ((e.key === "v" || e.key === "V") && !e.metaKey && !e.ctrlKey) {
        dispatch({ type: "SET_EDIT_MODE", mode: "select" });
      }
      // Zoom in/out with +/- keys
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        const cw = dimensions.width || window.innerWidth;
        const ch = dimensions.height || window.innerHeight;
        dispatch({ type: "ZOOM", delta: -1, centerX: cw / 2, centerY: ch / 2 });
      }
      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        const cw = dimensions.width || window.innerWidth;
        const ch = dimensions.height || window.innerHeight;
        dispatch({ type: "ZOOM", delta: 1, centerX: cw / 2, centerY: ch / 2 });
      }
      // Fit to content with Ctrl+0
      if ((e.metaKey || e.ctrlKey) && e.key === "0") {
        e.preventDefault();
        if (nodes.length > 0 && dimensions.width > 0 && dimensions.height > 0) {
          dispatch({ type: "FIT_TO_CONTENT", containerWidth: dimensions.width, containerHeight: dimensions.height });
        }
      }
      // Zoom to selection with Shift+1
      if (e.shiftKey && e.key === "!" && selectedNodeIds.size > 0 && dimensions.width > 0) {
        e.preventDefault();
        dispatch({
          type: "FIT_TO_SELECTION",
          ids: [...selectedNodeIds],
          containerWidth: dimensions.width,
          containerHeight: dimensions.height,
        });
      }
      // Arrow key nudging for selected nodes
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) && selectedNodeIds.size > 0) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0;
        const dy = e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0;
        dispatch({ type: "MOVE_NODES", ids: [...selectedNodeIds], dx, dy });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedNodeIds, nodes, dimensions, dispatch, selectedConnectorId, setSelectedConnectorId, setContextMenu, clipboardRef]);
}

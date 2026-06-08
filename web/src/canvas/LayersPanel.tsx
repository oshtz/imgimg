import { TbEye, TbEyeOff, TbLock, TbLockOpen, TbPhoto, TbNote, TbFrame, TbShape, TbX } from "react-icons/tb";
import { useCanvas } from "./CanvasProvider";
import type { CanvasNode } from "./types";

const NODE_TYPE_ICONS: Record<string, React.ComponentType<{ size: number }>> = {
  image: TbPhoto,
  text: TbNote,
  frame: TbFrame,
  shape: TbShape,
};

function nodeLabel(n: CanvasNode): string {
  if (n.type === "frame") return n.title || "Frame";
  if (n.type === "text") return n.text?.slice(0, 30) || "Sticky Note";
  if (n.type === "shape") return n.shapeKind ?? "Shape";
  if (n.prompt) return n.prompt.slice(0, 30) + "...";
  return "Image";
}

type Props = {
  onClose: () => void;
  containerWidth: number;
  containerHeight: number;
};

export function LayersPanel({ onClose, containerWidth, containerHeight }: Props) {
  const { state, dispatch } = useCanvas();

  // Sort by zIndex highest-first (top of stack first in list).
  // Frames always sort below non-frame nodes (they render behind content).
  const sorted = [...state.nodes].sort((a, b) => {
    const aIsFrame = a.type === "frame" ? 0 : 1;
    const bIsFrame = b.type === "frame" ? 0 : 1;
    if (aIsFrame !== bIsFrame) return bIsFrame - aIsFrame;
    return b.zIndex - a.zIndex;
  });

  // Group by parent frame
  const topLevel = sorted.filter((n) => !n.parentFrameId);
  const childrenOf = (frameId: string) => sorted.filter((n) => n.parentFrameId === frameId);

  const renderRow = (node: CanvasNode, indent = 0) => {
    const isSelected = state.selectedNodeIds.has(node.id);
    const Icon = NODE_TYPE_ICONS[node.type ?? "image"] ?? TbPhoto;

    return (
      <div
        key={node.id}
        className={[
          "flex items-center gap-1.5 rounded px-2 py-1 text-xs cursor-pointer",
          isSelected
            ? "bg-zinc-100 text-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-400"
            : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700/50",
        ].join(" ")}
        style={{ paddingLeft: 8 + indent * 16 }}
        onClick={() => {
          dispatch({ type: "SELECT_NODE", id: node.id });
          // Zoom to node
          if (containerWidth > 0 && containerHeight > 0) {
            dispatch({
              type: "FIT_TO_SELECTION",
              ids: [node.id],
              containerWidth,
              containerHeight,
            });
          }
        }}
      >
        <Icon size={14} />
        <span className="flex-1 truncate">{nodeLabel(node)}</span>

        {/* Visibility toggle */}
        <button
          className="p-0.5 opacity-60 hover:opacity-100"
          title={node.hidden ? "Show" : "Hide"}
          onClick={(e) => {
            e.stopPropagation();
            dispatch({ type: "SET_NODE_VISIBLE", id: node.id, visible: !!node.hidden });
          }}
        >
          {node.hidden ? <TbEyeOff size={13} /> : <TbEye size={13} />}
        </button>

        {/* Lock toggle */}
        <button
          className="p-0.5 opacity-60 hover:opacity-100"
          title={node.locked ? "Unlock" : "Lock"}
          onClick={(e) => {
            e.stopPropagation();
            dispatch({ type: "TOGGLE_LOCK", ids: [node.id] });
          }}
        >
          {node.locked ? <TbLock size={13} /> : <TbLockOpen size={13} />}
        </button>
      </div>
    );
  };

  return (
    <div className="absolute bottom-4 left-4 z-30 flex w-56 flex-col rounded-lg border border-zinc-200 bg-white/95 shadow-lg backdrop-blur dark:border-zinc-700 dark:bg-zinc-800/95">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Layers</span>
        <button onClick={onClose} className="p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
          <TbX size={14} />
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto p-1">
        {state.nodes.length === 0 && (
          <div className="px-3 py-4 text-center text-xs text-zinc-400">No layers</div>
        )}
        {topLevel.map((node) => (
          <div key={node.id}>
            {renderRow(node)}
            {node.type === "frame" &&
              childrenOf(node.id).map((child) => renderRow(child, 1))}
          </div>
        ))}
      </div>
    </div>
  );
}

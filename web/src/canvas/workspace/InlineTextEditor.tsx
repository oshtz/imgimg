import { STICKY_COLORS } from "../TextNode";
import type { CanvasNode } from "../types";

type Viewport = { x: number; y: number; scale: number };

type Props = {
  editingNodeId: string;
  node: CanvasNode;
  viewport: Viewport;
  dispatch: (action: any) => void;
  onClose: () => void;
};

export function InlineTextEditor({ editingNodeId, node, viewport, dispatch, onClose }: Props) {
  const isFrame = node.type === "frame";
  const stickyColor = node.stickyColor ?? "yellow";
  const textColor = isFrame ? "#e4e4e7" : STICKY_COLORS[stickyColor].text;
  const screenX = node.x * viewport.scale + viewport.x;
  const screenY = node.y * viewport.scale + viewport.y;
  const screenW = node.width * viewport.scale;
  const screenH = isFrame ? 32 * viewport.scale : node.height * viewport.scale;

  return (
    <>
      <div className="absolute inset-0 z-40" onClick={onClose} />
      <textarea
        autoFocus
        className="absolute z-50 resize-none rounded border-2 border-zinc-400 bg-transparent p-2 text-sm outline-none"
        style={{
          left: screenX,
          top: screenY,
          width: screenW,
          height: screenH,
          fontSize: `${(isFrame ? 13 : 14) * viewport.scale}px`,
          fontFamily: "'Azeret Mono'",
          fontWeight: isFrame ? "bold" : "normal",
          color: textColor,
          caretColor: textColor,
        }}
        defaultValue={isFrame ? (node.title || "Frame") : (node.text || "")}
        onBlur={(e) => {
          const val = e.target.value;
          if (isFrame) {
            dispatch({ type: "UPDATE_NODE", id: editingNodeId, updates: { title: val } });
          } else {
            dispatch({ type: "UPDATE_NODE", id: editingNodeId, updates: { text: val } });
          }
          onClose();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onClose();
          }
          // For frames (single-line), Enter confirms
          if (isFrame && e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
      />
    </>
  );
}

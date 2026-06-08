import { useState } from "react";
import { TbBrush, TbArrowsMaximize, TbCrop, TbTrash, TbClipboardText, TbSparkles, TbCheck, TbFocusCentered, TbArrowsDiagonal, TbPhotoX } from "react-icons/tb";
import type { CanvasNode, CanvasViewport } from "./types";
import { AlignDistributeBar } from "./AlignDistributeBar";
import { useCanvas } from "./CanvasProvider";

type Props = {
  nodes: CanvasNode[];
  viewport: CanvasViewport;
  /** Only available when a single node is selected */
  onInpaint?: () => void;
  /** Only available when a single node is selected */
  onOutpaint?: () => void;
  /** Non-destructive crop. Only available when a single node is selected. */
  onCrop?: () => void;
  /** Explore: toggle the explore popover. Only available for single node with a generationId. */
  onExplore?: () => void;
  /** Whether the explore popover is currently open */
  exploreOpen?: boolean;
  /** Upscale the selected image node */
  onUpscale?: () => void;
  /** Remove background from the selected image node */
  onRemoveBackground?: () => void;
  onDelete: () => void;
  containerWidth?: number;
  containerHeight?: number;
};

const btnClass = "flex items-center justify-center rounded p-1.5 text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700";
const btnActiveClass = "flex items-center justify-center rounded p-1.5 bg-zinc-200 text-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-400";
const sep = <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-700" />;

export function NodeActionBar({ nodes, viewport, onInpaint, onOutpaint, onCrop, onExplore, exploreOpen, onUpscale, onRemoveBackground, onDelete, containerWidth, containerHeight }: Props) {
  const { dispatch } = useCanvas();
  const [copied, setCopied] = useState(false);
  // Compute bounding box of all selected nodes in screen coordinates
  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxX = Math.max(...nodes.map((n) => n.x + n.width));
  const bbWidth = maxX - minX;

  const maxY = Math.max(...nodes.map((n) => n.y + n.height));
  const screenCenterX = minX * viewport.scale + viewport.x + (bbWidth * viewport.scale) / 2;
  const screenTopY = minY * viewport.scale + viewport.y - 12;
  const screenBottomY = maxY * viewport.scale + viewport.y + 12;
  // Flip below selection if too close to top of viewport
  const flipBelow = screenTopY < 60;
  const screenY = flipBelow ? screenBottomY : screenTopY;

  const isSingle = nodes.length === 1;
  const singleNode = isSingle ? nodes[0] : null;

  return (
    <div
      className={`pointer-events-auto absolute z-30 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-zinc-200 bg-white px-1 py-0.5 shadow-lg dark:border-zinc-700 dark:bg-zinc-800 ${flipBelow ? "" : "-translate-y-full"}`}
      style={{ left: screenCenterX, top: screenY }}
    >
      {onInpaint && (
        <button onClick={onInpaint} className={btnClass} title="Inpaint">
          <TbBrush size={15} />
        </button>
      )}

      {onOutpaint && (
        <>
          {onInpaint && sep}
          <button onClick={onOutpaint} className={btnClass} title="Outpaint">
            <TbArrowsMaximize size={15} />
          </button>
        </>
      )}

      {onCrop && (
        <>
          {sep}
          <button onClick={onCrop} className={btnClass} title="Crop">
            <TbCrop size={15} />
          </button>
        </>
      )}

      {onExplore && singleNode?.generationId && (
        <>
          {sep}
          <button onClick={onExplore} className={exploreOpen ? btnActiveClass : btnClass} title="Explore variations">
            <TbSparkles size={15} />
          </button>
        </>
      )}

      {onUpscale && (
        <>
          {sep}
          <button onClick={onUpscale} className={btnClass} title="Upscale">
            <TbArrowsDiagonal size={15} />
          </button>
        </>
      )}

      {onRemoveBackground && (
        <>
          {sep}
          <button onClick={onRemoveBackground} className={btnClass} title="Remove background">
            <TbPhotoX size={15} />
          </button>
        </>
      )}

      {singleNode?.prompt && (
        <>
          {sep}
          <button
            onClick={() => {
              navigator.clipboard.writeText(singleNode.prompt!).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
            className={btnClass}
            title={copied ? "Copied!" : "Copy prompt"}
          >
            {copied ? <TbCheck size={15} /> : <TbClipboardText size={15} />}
          </button>
        </>
      )}

      {containerWidth && containerHeight && (
        <>
          {sep}
          <button
            onClick={() => dispatch({
              type: "FIT_TO_SELECTION",
              ids: nodes.map((n) => n.id),
              containerWidth,
              containerHeight,
            })}
            className={btnClass}
            title="Zoom to selection (Shift+1)"
          >
            <TbFocusCentered size={15} />
          </button>
        </>
      )}

      {nodes.length >= 2 && (
        <>
          {sep}
          <AlignDistributeBar nodeIds={nodes.map((n) => n.id)} />
        </>
      )}

      {sep}

      <button
        onClick={onDelete}
        className="flex items-center justify-center rounded p-1.5 text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
        title={nodes.length > 1 ? `Delete ${nodes.length} items` : "Delete"}
      >
        <TbTrash size={15} />
      </button>
    </div>
  );
}

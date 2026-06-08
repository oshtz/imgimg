import { useState, useRef, useEffect } from "react";
import {
  TbLayoutAlignLeft,
  TbLayoutAlignCenter,
  TbLayoutAlignRight,
  TbLayoutAlignTop,
  TbLayoutAlignMiddle,
  TbLayoutAlignBottom,
  TbLayoutDistributeHorizontal,
  TbLayoutDistributeVertical,
  TbLayoutAlignLeft as TbAlignIcon,
  TbLayoutGrid,
  TbLayoutColumns,
  TbBinaryTree2,
  TbLetterS,
  TbLetterM,
  TbLetterL,
  TbArrowsMaximize,
} from "react-icons/tb";
import { useCanvas } from "./CanvasProvider";

type Props = {
  nodeIds: string[];
};

export function AlignDistributeBar({ nodeIds }: Props) {
  const { dispatch } = useCanvas();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  if (nodeIds.length < 2) return null;

  const btnClass =
    "rounded p-1.5 text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
        title="Align & Distribute"
      >
        <TbAlignIcon size={14} />
        Align
      </button>
      {open && (
        <div className="absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
          <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Align
          </div>
          <div className="grid grid-cols-3 gap-0.5">
            <button
              className={btnClass}
              title="Align Left"
              onClick={() => { dispatch({ type: "ALIGN_NODES", ids: nodeIds, edge: "left" }); setOpen(false); }}
            >
              <TbLayoutAlignLeft size={16} />
            </button>
            <button
              className={btnClass}
              title="Align Center"
              onClick={() => { dispatch({ type: "ALIGN_NODES", ids: nodeIds, edge: "center" }); setOpen(false); }}
            >
              <TbLayoutAlignCenter size={16} />
            </button>
            <button
              className={btnClass}
              title="Align Right"
              onClick={() => { dispatch({ type: "ALIGN_NODES", ids: nodeIds, edge: "right" }); setOpen(false); }}
            >
              <TbLayoutAlignRight size={16} />
            </button>
            <button
              className={btnClass}
              title="Align Top"
              onClick={() => { dispatch({ type: "ALIGN_NODES", ids: nodeIds, edge: "top" }); setOpen(false); }}
            >
              <TbLayoutAlignTop size={16} />
            </button>
            <button
              className={btnClass}
              title="Align Middle"
              onClick={() => { dispatch({ type: "ALIGN_NODES", ids: nodeIds, edge: "middle" }); setOpen(false); }}
            >
              <TbLayoutAlignMiddle size={16} />
            </button>
            <button
              className={btnClass}
              title="Align Bottom"
              onClick={() => { dispatch({ type: "ALIGN_NODES", ids: nodeIds, edge: "bottom" }); setOpen(false); }}
            >
              <TbLayoutAlignBottom size={16} />
            </button>
          </div>
          <div className="my-1.5 border-t border-zinc-200 dark:border-zinc-700" />
          <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Distribute
          </div>
          <div className="grid grid-cols-2 gap-0.5">
            <button
              className={btnClass}
              title="Distribute Horizontally"
              disabled={nodeIds.length < 3}
              onClick={() => { dispatch({ type: "DISTRIBUTE_NODES", ids: nodeIds, axis: "horizontal" }); setOpen(false); }}
            >
              <TbLayoutDistributeHorizontal size={16} />
            </button>
            <button
              className={btnClass}
              title="Distribute Vertically"
              disabled={nodeIds.length < 3}
              onClick={() => { dispatch({ type: "DISTRIBUTE_NODES", ids: nodeIds, axis: "vertical" }); setOpen(false); }}
            >
              <TbLayoutDistributeVertical size={16} />
            </button>
          </div>
          <div className="my-1.5 border-t border-zinc-200 dark:border-zinc-700" />
          <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Arrange
          </div>
          <div className="grid grid-cols-2 gap-0.5">
            <button
              className={btnClass}
              title="Arrange as Grid"
              onClick={() => { dispatch({ type: "AUTO_ARRANGE", ids: nodeIds, mode: "grid" }); setOpen(false); }}
            >
              <TbLayoutGrid size={16} />
            </button>
            <button
              className={btnClass}
              title="Arrange as Masonry"
              onClick={() => { dispatch({ type: "AUTO_ARRANGE", ids: nodeIds, mode: "masonry" }); setOpen(false); }}
            >
              <TbLayoutColumns size={16} />
            </button>
            <button
              className={btnClass}
              title="Arrange as Tree (by lineage)"
              onClick={() => { dispatch({ type: "AUTO_ARRANGE", ids: nodeIds, mode: "tree" }); setOpen(false); }}
            >
              <TbBinaryTree2 size={16} />
            </button>
          </div>
          <div className="my-1.5 border-t border-zinc-200 dark:border-zinc-700" />
          <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Resize
          </div>
          <div className="grid grid-cols-4 gap-0.5">
            <button
              className={btnClass}
              title="Small (200px)"
              onClick={() => { dispatch({ type: "NORMALIZE_SIZE", ids: nodeIds, target: "small" }); setOpen(false); }}
            >
              <TbLetterS size={16} />
            </button>
            <button
              className={btnClass}
              title="Medium (400px)"
              onClick={() => { dispatch({ type: "NORMALIZE_SIZE", ids: nodeIds, target: "medium" }); setOpen(false); }}
            >
              <TbLetterM size={16} />
            </button>
            <button
              className={btnClass}
              title="Large (600px)"
              onClick={() => { dispatch({ type: "NORMALIZE_SIZE", ids: nodeIds, target: "large" }); setOpen(false); }}
            >
              <TbLetterL size={16} />
            </button>
            <button
              className={btnClass}
              title="Original Size"
              onClick={() => { dispatch({ type: "NORMALIZE_SIZE", ids: nodeIds, target: "original" }); setOpen(false); }}
            >
              <TbArrowsMaximize size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

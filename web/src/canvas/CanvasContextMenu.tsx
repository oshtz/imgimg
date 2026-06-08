import { useEffect, useRef, useState } from "react";
import { TbCopy, TbDownload, TbArrowUp, TbArrowDown, TbTrash, TbClipboardText, TbLock, TbLockOpen, TbPhoto } from "react-icons/tb";
import type Konva from "konva";
import { useCanvas } from "./CanvasProvider";
import { exportCanvasAsImage } from "./exportCanvas";

type Props = {
  nodeIds: string[];
  x: number;
  y: number;
  onClose: () => void;
  stageRef?: Konva.Stage | null;
};

export function CanvasContextMenu({ nodeIds, x, y, onClose, stageRef }: Props) {
  const { state, dispatch } = useCanvas();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Clamp menu position to viewport bounds after first render
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width - 8;
    const maxTop = window.innerHeight - rect.height - 8;
    setPos({ left: Math.min(x, maxLeft), top: Math.min(y, maxTop) });
  }, [x, y]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [onClose]);

  const nodes = state.nodes.filter((n) => nodeIds.includes(n.id));
  if (nodes.length === 0) return null;

  const isSingle = nodes.length === 1;
  const node = isSingle ? nodes[0] : null;
  const countLabel = !isSingle ? ` (${nodes.length})` : "";

  const items: { label: string; icon: React.ReactNode; action: () => void; destructive?: boolean }[] = [
    {
      label: `Duplicate${countLabel}`,
      icon: <TbCopy size={16} />,
      action: () => {
        if (isSingle) {
          dispatch({ type: "DUPLICATE_NODE", id: nodeIds[0] });
        } else {
          dispatch({ type: "DUPLICATE_NODES", ids: nodeIds });
        }
        onClose();
      },
    },
    // Download — single image node only
    ...(node && (!node.type || node.type === "image")
      ? [{
          label: "Download",
          icon: <TbDownload size={16} />,
          action: () => {
            const a = document.createElement("a");
            a.href = node.src!;
            a.download = `canvas-image-${node.id.slice(0, 8)}.png`;
            a.click();
            onClose();
          },
        }]
      : []),
    {
      label: `Bring to Front${countLabel}`,
      icon: <TbArrowUp size={16} />,
      action: () => {
        if (isSingle) dispatch({ type: "BRING_TO_FRONT", id: nodeIds[0] });
        else dispatch({ type: "BRING_TO_FRONT_BATCH", ids: nodeIds });
        onClose();
      },
    },
    {
      label: `Send to Back${countLabel}`,
      icon: <TbArrowDown size={16} />,
      action: () => {
        if (isSingle) dispatch({ type: "SEND_TO_BACK", id: nodeIds[0] });
        else dispatch({ type: "SEND_TO_BACK_BATCH", ids: nodeIds });
        onClose();
      },
    },
    // Export as PNG
    ...(stageRef
      ? [{
          label: `Export as PNG${countLabel}`,
          icon: <TbPhoto size={16} />,
          action: () => {
            exportCanvasAsImage(stageRef, nodes);
            onClose();
          },
        }]
      : []),
    // Lock / Unlock
    {
      label: nodes.some((n) => !n.locked) ? `Lock${countLabel}` : `Unlock${countLabel}`,
      icon: nodes.some((n) => !n.locked) ? <TbLock size={16} /> : <TbLockOpen size={16} />,
      action: () => {
        dispatch({ type: "TOGGLE_LOCK", ids: nodeIds });
        onClose();
      },
    },
    // Copy Prompt — single node with prompt only
    ...(node?.prompt
      ? [{
          label: "Copy Prompt",
          icon: <TbClipboardText size={16} />,
          action: () => {
            navigator.clipboard.writeText(node.prompt!).catch(() => {});
            onClose();
          },
        }]
      : []),
    {
      label: `Delete${countLabel}`,
      icon: <TbTrash size={16} />,
      destructive: true,
      action: () => {
        dispatch({ type: "REMOVE_NODES", ids: nodeIds });
        onClose();
      },
    },
  ];

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[160px] rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
      style={{ left: pos.left, top: pos.top }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={item.action}
          className={[
            "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
            item.destructive
              ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700",
          ].join(" ")}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}

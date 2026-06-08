import { TbMinus, TbPlus, TbFocusCentered } from "react-icons/tb";
import { useCanvas } from "./CanvasProvider";

const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.25;

type Props = {
  containerWidth?: number;
  containerHeight?: number;
};

export function ZoomControls({ containerWidth, containerHeight }: Props) {
  const { state, dispatch } = useCanvas();
  const pct = Math.round(state.viewport.scale * 100);

  const zoomIn = () => {
    const newScale = Math.min(MAX_SCALE, state.viewport.scale + ZOOM_STEP);
    dispatch({ type: "SET_VIEWPORT", viewport: { ...state.viewport, scale: newScale } });
  };

  const zoomOut = () => {
    const newScale = Math.max(MIN_SCALE, state.viewport.scale - ZOOM_STEP);
    dispatch({ type: "SET_VIEWPORT", viewport: { ...state.viewport, scale: newScale } });
  };

  const resetZoom = () => dispatch({ type: "RESET_ZOOM" });

  const fitToContent = () => {
    if (state.nodes.length === 0 || !containerWidth || !containerHeight) return;
    dispatch({ type: "FIT_TO_CONTENT", containerWidth, containerHeight });
  };

  return (
    <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-1 py-0.5 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
      <button
        onClick={zoomOut}
        className="rounded p-1 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
        title="Zoom out"
      >
        <TbMinus size={16} />
      </button>
      <button
        onClick={resetZoom}
        className="min-w-[48px] rounded px-1.5 py-0.5 text-center text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
        title="Reset zoom"
      >
        {pct}%
      </button>
      <button
        onClick={zoomIn}
        className="rounded p-1 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
        title="Zoom in"
      >
        <TbPlus size={16} />
      </button>
      <button
        onClick={fitToContent}
        disabled={state.nodes.length === 0}
        className="rounded p-1 text-zinc-600 hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed dark:text-zinc-400 dark:hover:bg-zinc-700"
        title="Fit to content"
      >
        <TbFocusCentered size={16} />
      </button>
    </div>
  );
}

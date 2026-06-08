import { useCallback, useEffect, useMemo, useState } from "react";
import { TbX, TbArrowLeft, TbArrowRight } from "react-icons/tb";
import { useCanvas } from "./CanvasProvider";

type Props = {
  onExit: () => void;
  containerWidth: number;
  containerHeight: number;
};

export function PresentationMode({ onExit, containerWidth, containerHeight }: Props) {
  const { state, dispatch } = useCanvas();
  const [slideIndex, setSlideIndex] = useState(0);

  // Collect frames sorted left-to-right, top-to-bottom
  const frames = useMemo(() => {
    return state.nodes
      .filter((n) => n.type === "frame")
      .sort((a, b) => {
        const dy = a.y - b.y;
        if (Math.abs(dy) > 50) return dy;
        return a.x - b.x;
      });
  }, [state.nodes]);

  const slideCount = frames.length;
  const currentFrame = frames[slideIndex];

  // Navigate to current frame
  const goTo = useCallback(
    (index: number) => {
      const frame = frames[index];
      if (!frame) return;
      const w = containerWidth || window.innerWidth;
      const h = containerHeight || window.innerHeight;
      const pad = 40;
      const scaleX = (w - pad * 2) / frame.width;
      const scaleY = (h - pad * 2) / frame.height;
      const fitScale = Math.min(scaleX, scaleY, 2);
      const cx = (w - frame.width * fitScale) / 2 - frame.x * fitScale;
      const cy = (h - frame.height * fitScale) / 2 - frame.y * fitScale;
      dispatch({ type: "SET_VIEWPORT", viewport: { x: cx, y: cy, scale: fitScale } });
      setSlideIndex(index);
    },
    [frames, dispatch, containerWidth, containerHeight]
  );

  // Start on first frame
  useEffect(() => {
    if (frames.length > 0) goTo(0);
  }, [frames.length, goTo]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onExit();
      }
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        if (slideIndex < slideCount - 1) goTo(slideIndex + 1);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (slideIndex > 0) goTo(slideIndex - 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [slideIndex, slideCount, goTo, onExit]);

  if (slideCount === 0) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90">
        <div className="text-center text-white">
          <p className="text-lg font-medium">No frames found</p>
          <p className="mt-2 text-sm text-zinc-400">Add frames to your canvas to create presentation slides.</p>
          <button onClick={onExit} className="mt-4 rounded bg-white/10 px-4 py-2 text-sm hover:bg-white/20">
            Exit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[100]">
      {/* Bottom control bar */}
      <div className="pointer-events-auto absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-4 rounded-full bg-black/70 px-5 py-2.5 text-white backdrop-blur">
        <button onClick={() => slideIndex > 0 && goTo(slideIndex - 1)} disabled={slideIndex === 0} className="disabled:opacity-30">
          <TbArrowLeft size={18} />
        </button>
        <span className="min-w-[60px] text-center text-sm font-medium tabular-nums">
          {slideIndex + 1} / {slideCount}
        </span>
        <button onClick={() => slideIndex < slideCount - 1 && goTo(slideIndex + 1)} disabled={slideIndex >= slideCount - 1} className="disabled:opacity-30">
          <TbArrowRight size={18} />
        </button>
        <div className="h-4 w-px bg-white/30" />
        <button onClick={onExit} title="Exit presentation (Esc)">
          <TbX size={18} />
        </button>
      </div>

      {/* Frame title */}
      {currentFrame?.title && (
        <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-black/50 px-4 py-1.5 text-sm font-medium text-white backdrop-blur">
          {currentFrame.title}
        </div>
      )}
    </div>
  );
}

import { useCallback } from "react";
import {
  clampPromptSidebarWidth,
  PROMPT_SIDEBAR_MAX_WIDTH,
  PROMPT_SIDEBAR_MIN_WIDTH,
  type PromptPosition,
} from "../lib/promptPosition";
import { cn } from "../utils/cn";

type SidePromptPosition = Extract<PromptPosition, "left" | "right">;

export function PromptSidebarResizeHandle({
  position,
  width,
  onWidthChange,
}: {
  position: SidePromptPosition;
  width: number;
  onWidthChange: (nextWidth: number) => void;
}) {
  const resizeFromDelta = useCallback((deltaX: number) => {
    const direction = position === "left" ? 1 : -1;
    onWidthChange(clampPromptSidebarWidth(width + deltaX * direction));
  }, [onWidthChange, position, width]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    const direction = position === "left" ? 1 : -1;

    const onMouseMove = (ev: MouseEvent) => {
      onWidthChange(clampPromptSidebarWidth(startWidth + (ev.clientX - startX) * direction));
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [onWidthChange, position, width]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    resizeFromDelta(e.key === "ArrowRight" ? 24 : -24);
  }, [resizeFromDelta]);

  return (
    <div
      role="separator"
      aria-label="Resize prompt panel"
      aria-orientation="vertical"
      aria-valuemin={PROMPT_SIDEBAR_MIN_WIDTH}
      aria-valuemax={PROMPT_SIDEBAR_MAX_WIDTH}
      aria-valuenow={width}
      tabIndex={0}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
      className={cn(
        "absolute inset-y-0 z-30 hidden w-4 cursor-col-resize outline-none transition-colors lg:block",
        position === "left" ? "-right-2" : "-left-2",
        "hover:bg-blue-500/10 focus:bg-blue-500/10 active:bg-blue-500/20"
      )}
      title="Resize prompt panel"
    />
  );
}

import { useState, useCallback, useRef, type ReactNode, type MouseEvent } from "react";
import { copyToClipboard } from "../utils/clipboard";

interface CopyableTextProps {
  /** The full (untruncated) text to copy to clipboard */
  text: string;
  /** Optional extra CSS classes for the wrapper */
  className?: string;
  /** The rendered content (may be truncated) */
  children: ReactNode;
}

/**
 * Wraps prompt text to make it click-to-copy.
 * Shows a brief visual flash on copy and uses the shared clipboard utility
 * (which fires a sonner toast). Stops event propagation so parent card
 * click handlers are not triggered.
 */
export function CopyableText({ text, className, children }: CopyableTextProps) {
  const [flash, setFlash] = useState(false);
  const timerRef = useRef<number | null>(null);

  const handleClick = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!text) return;

      void copyToClipboard(text);

      // Brief green flash feedback
      setFlash(true);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setFlash(false), 350);
    },
    [text],
  );

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.stopPropagation();
          e.preventDefault();
          handleClick(e as unknown as MouseEvent);
        }
      }}
      title="Click to copy prompt"
      className={[
        "cursor-pointer select-none rounded transition-colors duration-200",
        flash
          ? "bg-zinc-200 dark:bg-zinc-900/40"
          : "hover:bg-zinc-100 dark:hover:bg-zinc-800/60",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}

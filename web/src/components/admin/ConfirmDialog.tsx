import { useEffect, useCallback, useId, useRef } from "react";
import { TbX, TbAlertTriangle } from "react-icons/tb";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  isDestructive = true,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      } else if (e.key === "Tab") {
        const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
        if (!buttons?.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onCancel]
  );

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    window.addEventListener("keydown", handleKeyDown);
    cancelRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        aria-label="Cancel"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-black"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            {isDestructive && (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/10">
                <TbAlertTriangle className="h-5 w-5 text-red-600 dark:text-red-500" />
              </div>
            )}
            <h2 id={titleId} className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
          </div>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className={[
              "inline-flex h-8 w-8 items-center justify-center rounded-lg",
              "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700",
              "dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200",
              "focus:outline-none focus:ring-2 focus:ring-zinc-400/40",
            ].join(" ")}
            aria-label="Close"
          >
            <TbX className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">{message}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={onCancel}
            className={[
              "rounded-lg px-4 py-2 text-sm font-medium",
              "border border-zinc-300 bg-white text-zinc-700",
              "dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
              "hover:border-zinc-400 hover:bg-zinc-50",
              "dark:hover:border-zinc-600 dark:hover:bg-zinc-800",
              "focus:outline-none focus:ring-2 focus:ring-zinc-400/40",
            ].join(" ")}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={[
              "rounded-lg px-4 py-2 text-sm font-medium",
              "focus:outline-none focus:ring-2",
              isDestructive
                ? "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500"
                : "bg-zinc-600 text-white hover:bg-zinc-700 focus:ring-zinc-500",
            ].join(" ")}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

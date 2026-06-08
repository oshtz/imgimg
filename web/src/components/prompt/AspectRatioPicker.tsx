import { useEffect, useMemo, useRef, useState } from "react";
import { TbChevronDown, TbChevronUp } from "react-icons/tb";
import { ASPECT_RATIOS, aspectRatioToNumber, type AspectRatio } from "../../workflows";
import { selectPill } from "./pillStyles";

export function AspectRatioPicker(props: {
  value: AspectRatio;
  onChange: (next: AspectRatio) => void;
  disabled?: boolean;
  /** If provided, only show these aspect ratios */
  supportedAspectRatios?: string[];
  /** Open dropdown upward instead of downward */
  dropUp?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const ordered = useMemo(() => {
    const filtered = props.supportedAspectRatios && props.supportedAspectRatios.length > 0
      ? ASPECT_RATIOS.filter((ar) => props.supportedAspectRatios!.includes(ar))
      : ASPECT_RATIOS;
    return [...filtered].sort((a, b) => aspectRatioToNumber(a) - aspectRatioToNumber(b));
  }, [props.supportedAspectRatios]);
  const idx = Math.max(0, ordered.indexOf(props.value));

  useEffect(() => {
    if (!open) return;

    function onMouseDown(e: MouseEvent) {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setOpen(false);
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const ratio = aspectRatioToNumber(props.value);
  const fit = ratio >= 1 ? { widthPct: 100, heightPct: (1 / ratio) * 100 } : { widthPct: ratio * 100, heightPct: 100 };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        className={selectPill(props.disabled)}
        onClick={() => setOpen((v) => !v)}
        disabled={props.disabled}
        aria-label="Aspect ratio"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="shrink-0 rounded border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black"
            style={{ width: `${Math.max(10, Math.round(14 * ratio))}px`, height: "14px" }}
          />
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Aspect
          </span>
          <span className="text-xs text-zinc-900 dark:text-zinc-100">{props.value}</span>
        </span>

        {open ? (
          <TbChevronUp className="h-4 w-4 shrink-0 text-zinc-600 dark:text-zinc-300" />
        ) : (
          <TbChevronDown className="h-4 w-4 shrink-0 text-zinc-600 dark:text-zinc-300" />
        )}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Aspect ratio"
          className={[
            `absolute left-0 z-50 w-[18rem] overflow-hidden rounded-xl border shadow-lg ${props.dropUp ? "bottom-[calc(100%_+_8px)]" : "top-[calc(100%_+_8px)]"}`,
            "border-zinc-200 bg-white",
            "dark:border-zinc-800 dark:bg-black"
          ].join(" ")}
        >
          <div className="p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Aspect ratio</div>
              <div className="text-xs text-zinc-600 dark:text-zinc-400">{props.value}</div>
            </div>

            <div className="mt-3 flex items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex h-40 w-40 items-center justify-center rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-black">
                <div
                  className="rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950"
                  style={{ width: `${fit.widthPct}%`, height: `${fit.heightPct}%` }}
                />
              </div>
            </div>

            <div className="mt-3 max-h-56 overflow-auto pr-1">
              <div className="grid grid-cols-3 gap-2">
                {ordered.map((ar) => {
                  const isSelected = ar === props.value;
                  const r = aspectRatioToNumber(ar);
                  const f = r >= 1 ? { widthPct: 100, heightPct: (1 / r) * 100 } : { widthPct: r * 100, heightPct: 100 };
                  return (
                    <button
                      key={ar}
                      type="button"
                      className={[
                        "rounded-lg border p-2 text-left",
                        "border-zinc-200 bg-white hover:bg-zinc-50",
                        "dark:border-zinc-800 dark:bg-black dark:hover:bg-zinc-950",
                        isSelected ? "ring-2 ring-zinc-400/40" : ""
                      ].join(" ")}
                      onClick={() => props.onChange(ar)}
                    >
                      <div className="flex h-12 w-full items-center justify-center">
                        <div
                          className="rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950"
                          style={{ width: `${f.widthPct}%`, height: `${f.heightPct}%` }}
                        />
                      </div>
                      <div className="mt-2 text-center text-xs font-medium text-zinc-900 dark:text-zinc-100">{ar}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-3">
              <input
                type="range"
                min={0}
                max={ordered.length - 1}
                step={1}
                value={idx}
                onChange={(e) => {
                  const next = ordered[Number(e.target.value)] ?? "1:1";
                  props.onChange(next);
                }}
                className="w-full accent-zinc-900 dark:accent-zinc-100"
              />
              <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                <span>Portrait</span>
                <span>Square</span>
                <span>Landscape</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

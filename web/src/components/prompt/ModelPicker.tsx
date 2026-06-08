import { useEffect, useMemo, useRef, useState } from "react";
import { TbCheck, TbChevronDown, TbChevronUp } from "react-icons/tb";
import type { Model } from "../../types";
import { resolveStorageUrl } from "../../utils/assets";
import { selectPill } from "./pillStyles";

export function ModelPicker(props: {
  apiBaseUrl: string;
  value: string;
  models: Model[];
  onChange: (id: string) => void;
  disabled?: boolean;
  /** Open dropdown upward instead of downward */
  dropUp?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const selected = useMemo(() => {
    return props.models.find((m) => m.id === props.value) ?? null;
  }, [props.models, props.value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return props.models;
    return props.models.filter((m) => {
      const haystack = [m.name, m.tags.join(" "), m.triggerWords.join(" ")].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [props.models, query]);

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

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => searchRef.current?.focus());
  }, [open]);

  const selectedPreviewUrl = selected ? resolveStorageUrl(props.apiBaseUrl, selected.previewImageUrl) : null;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        className={selectPill(props.disabled)}
        onClick={() => setOpen((v) => !v)}
        disabled={props.disabled}
        aria-label="LoRA model"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selectedPreviewUrl ? (
            <img
              src={selectedPreviewUrl}
              alt=""
              className="h-4 w-4 shrink-0 rounded border border-zinc-200 bg-white object-cover dark:border-zinc-800 dark:bg-black"
              draggable={false}
            />
          ) : (
            <span className="h-4 w-4 shrink-0 rounded border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black" />
          )}
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            LoRA
          </span>
          <span className="max-w-[10rem] truncate text-xs text-zinc-900 dark:text-zinc-100">
            {selected?.name ?? (props.models.length === 0 ? "Loading…" : "Select…")}
          </span>
        </span>

        {open ? (
          <TbChevronUp className="h-4 w-4 shrink-0 text-zinc-600 dark:text-zinc-300" />
        ) : (
          <TbChevronDown className="h-4 w-4 shrink-0 text-zinc-600 dark:text-zinc-300" />
        )}
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="LoRA model"
          className={[
            `absolute left-0 z-50 w-[22rem] overflow-hidden rounded-xl border shadow-lg ${props.dropUp ? "bottom-[calc(100%_+_8px)]" : "top-[calc(100%_+_8px)]"}`,
            "border-zinc-200 bg-white",
            "dark:border-zinc-800 dark:bg-black"
          ].join(" ")}
        >
          <div className="border-b border-zinc-200 p-2 dark:border-zinc-800">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search LoRAs…"
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/40 dark:border-zinc-800 dark:bg-black dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
          </div>

          <div className="max-h-80 overflow-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400">No matches.</div>
            ) : null}

            {filtered.map((m) => {
              const isSelected = m.id === props.value;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={[
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left",
                    "hover:bg-zinc-50 dark:hover:bg-zinc-950",
                    isSelected ? "bg-zinc-100 dark:bg-zinc-950" : ""
                  ].join(" ")}
                  onClick={() => {
                    props.onChange(m.id);
                    setOpen(false);
                    buttonRef.current?.focus();
                  }}
                >
                  <div className="min-w-0 flex-1 truncate text-sm text-zinc-900 dark:text-zinc-100">{m.name}</div>
                  {isSelected ? <TbCheck className="h-4 w-4 shrink-0 text-zinc-500" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

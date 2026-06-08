import { useEffect, useMemo, useRef, useState } from "react";
import { TbCheck, TbChevronDown, TbChevronUp, TbPhoto, TbX } from "react-icons/tb";
import type { UserPreset } from "../../api";
import { resolveStorageUrl } from "../../utils/assets";
import { selectPill } from "./pillStyles";

function PresetOption(props: {
  preset: UserPreset;
  isSelected: boolean;
  apiBaseUrl: string;
  onSelect: () => void;
}) {
  const pUrl = props.preset.preview_url
    ? resolveStorageUrl(props.apiBaseUrl, props.preset.preview_url)
    : null;
  return (
    <button
      type="button"
      role="option"
      aria-selected={props.isSelected}
      className={[
        "flex w-full items-center gap-3 px-3 py-2 text-left",
        "hover:bg-zinc-50 dark:hover:bg-zinc-950",
        props.isSelected ? "bg-zinc-100 dark:bg-zinc-950" : ""
      ].join(" ")}
      onClick={props.onSelect}
    >
      {pUrl ? (
        <img
          src={pUrl}
          alt=""
          className="h-9 w-9 shrink-0 rounded-lg border border-zinc-200 bg-white object-cover dark:border-zinc-800 dark:bg-black"
          draggable={false}
        />
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
          <TbPhoto className="h-4 w-4 text-zinc-400" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {props.preset.name}
          </div>
          {props.isSelected ? <TbCheck className="h-4 w-4 shrink-0 text-zinc-500" /> : null}
        </div>
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
          {props.preset.image_count} image{props.preset.image_count !== 1 ? "s" : ""}
        </div>
      </div>
    </button>
  );
}

export function PresetPicker(props: {
  apiBaseUrl: string;
  presets: UserPreset[];
  value: string | null;
  onChange: (presetId: string | null) => void;
  disabled?: boolean;
  /** Open dropdown upward instead of downward */
  dropUp?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const selected = useMemo(() => {
    return props.presets.find((p) => p.id === props.value) ?? null;
  }, [props.presets, props.value]);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false);
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

  const previewUrl = selected?.preview_url
    ? resolveStorageUrl(props.apiBaseUrl, selected.preview_url)
    : null;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        className={selectPill(props.disabled)}
        onClick={() => setOpen((v) => !v)}
        disabled={props.disabled}
        aria-label="Select preset"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt=""
              className="h-4 w-4 shrink-0 rounded border border-zinc-200 bg-white object-cover dark:border-zinc-800 dark:bg-black"
              draggable={false}
            />
          ) : (
            <TbPhoto className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
          )}
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Preset
          </span>
          <span className="max-w-[10rem] truncate text-xs text-zinc-900 dark:text-zinc-100">
            {selected?.name ?? (props.presets.length === 0 ? "No presets" : "Select...")}
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
          aria-label="Select preset"
          className={[
            `absolute left-0 z-50 w-[18rem] overflow-hidden rounded-xl border shadow-lg ${props.dropUp ? "bottom-[calc(100%_+_8px)]" : "top-[calc(100%_+_8px)]"}`,
            "border-zinc-200 bg-white",
            "dark:border-zinc-800 dark:bg-black"
          ].join(" ")}
        >
          <div className="max-h-64 overflow-auto py-1">
            {props.presets.length === 0 ? (
              <div className="px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400">No presets configured.</div>
            ) : null}
            {selected ? (
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="flex w-full items-center gap-3 border-b border-zinc-100 px-3 py-2 text-left hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-950"
                onClick={() => { props.onChange(null); setOpen(false); buttonRef.current?.focus(); }}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                  <TbX className="h-4 w-4 text-zinc-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    Clear selection
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Use no preset
                  </div>
                </div>
              </button>
            ) : null}
            {props.presets.map((preset) => (
              <PresetOption
                key={preset.id}
                preset={preset}
                isSelected={preset.id === props.value}
                apiBaseUrl={props.apiBaseUrl}
                onSelect={() => { props.onChange(preset.id); setOpen(false); buttonRef.current?.focus(); }}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

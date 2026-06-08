import { useEffect, useRef, useState } from "react";
import { TbChevronDown, TbChevronUp } from "react-icons/tb";
import type { WorkflowParameter } from "../../api";
import { pillBase, selectPill, togglePill } from "./pillStyles";

export function WorkflowParameterControls(props: {
  parameters: WorkflowParameter[];
  values: Record<string, number | boolean | string>;
  onChange: (name: string, value: number | boolean | string) => void;
  disabled?: boolean;
  /** Open dropdowns upward instead of downward */
  dropUp?: boolean;
}) {
  const [expandedDropdown, setExpandedDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!expandedDropdown) return;
    function onMouseDown(e: MouseEvent) {
      if (!dropdownRef.current) return;
      if (e.target instanceof Node && !dropdownRef.current.contains(e.target)) {
        setExpandedDropdown(null);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setExpandedDropdown(null);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [expandedDropdown]);

  return (
    <>
      {props.parameters.map((param) => {
        const currentValue = props.values[param.name] ?? param.default;

        if (param.type === "boolean") {
          return (
            <button
              key={param.name}
              type="button"
              className={togglePill(currentValue === true, props.disabled)}
              onClick={() => props.onChange(param.name, !currentValue)}
              disabled={props.disabled}
              aria-pressed={currentValue === true}
              title={param.description || param.label}
            >
              <span className="text-xs font-medium">{param.label}</span>
              <span className="text-xs text-zinc-600 dark:text-zinc-300">
                {currentValue ? "On" : "Off"}
              </span>
            </button>
          );
        }

        if (param.type === "select" && param.options) {
          const selectedOption = param.options.find((o) => o.value === currentValue);
          const isOpen = expandedDropdown === param.name;
          return (
            <div key={param.name} className="relative" ref={isOpen ? dropdownRef : undefined}>
              <button
                type="button"
                className={selectPill(props.disabled)}
                onClick={() => setExpandedDropdown(isOpen ? null : param.name)}
                disabled={props.disabled}
                title={param.description || param.label}
              >
                <span className="flex items-center gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    {param.label}
                  </span>
                  <span className="text-xs text-zinc-900 dark:text-zinc-100">
                    {selectedOption?.label || String(currentValue)}
                  </span>
                </span>
                {isOpen ? (
                  <TbChevronUp className="h-4 w-4 text-zinc-600 dark:text-zinc-300" />
                ) : (
                  <TbChevronDown className="h-4 w-4 text-zinc-600 dark:text-zinc-300" />
                )}
              </button>
              {isOpen && (
                <div className={`absolute left-0 z-50 min-w-[10rem] rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-800 dark:bg-black ${props.dropUp ? "bottom-[calc(100%_+_4px)]" : "top-[calc(100%_+_4px)]"}`}>
                  {param.options.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={[
                        "w-full px-3 py-1.5 text-left text-xs hover:bg-zinc-50 dark:hover:bg-zinc-900",
                        opt.value === currentValue ? "bg-zinc-100 dark:bg-zinc-900" : ""
                      ].join(" ")}
                      onClick={() => {
                        props.onChange(param.name, opt.value);
                        setExpandedDropdown(null);
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        }

        if (param.type === "number") {
          const numValue = typeof currentValue === "number" ? currentValue : Number(param.default) || 0;
          return (
            <div key={param.name} className={pillBase(props.disabled)} title={param.description || param.label}>
              <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {param.label}
              </span>
              <input
                type="number"
                min={param.min}
                max={param.max}
                step={param.step ?? 1}
                value={numValue}
                onChange={(e) => {
                  let val = Number(e.target.value);
                  if (param.min !== undefined && val < param.min) val = param.min;
                  if (param.max !== undefined && val > param.max) val = param.max;
                  props.onChange(param.name, val);
                }}
                disabled={props.disabled}
                className="w-12 bg-transparent text-center text-xs text-zinc-900 focus:outline-none dark:text-zinc-100"
              />
              {param.unit && (
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{param.unit}</span>
              )}
            </div>
          );
        }

        // Text type fallback
        return (
          <div key={param.name} className={pillBase(props.disabled)} title={param.description || param.label}>
            <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {param.label}
            </span>
            <input
              type="text"
              value={String(currentValue)}
              onChange={(e) => props.onChange(param.name, e.target.value)}
              disabled={props.disabled}
              className="w-20 bg-transparent text-xs text-zinc-900 focus:outline-none dark:text-zinc-100"
            />
          </div>
        );
      })}
    </>
  );
}

import { useEffect } from "react";
import { TbSettings, TbX } from "react-icons/tb";
export type { PromptPosition } from "../lib/promptPosition";

export type ThemePreference = "dark" | "light";
export type WidthPreference = "full" | "fixed";
export type CardSize = "small" | "medium" | "large";
export type CardThumbnailMode = "latest" | "gradient" | "random-gradient";

export function SettingsButton(props: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={[
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs",
        "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
        "dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900",
        "focus:outline-none focus:ring-2 focus:ring-zinc-400/40 focus:ring-offset-2",
        "focus:ring-offset-white dark:focus:ring-offset-black"
      ].join(" ")}
    >
      <TbSettings className="h-4 w-4 text-zinc-600 dark:text-zinc-300" />
      Settings
    </button>
  );
}

function SegmentedOption(props: {
  label: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={[
        "inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-medium",
        props.selected
          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
          : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900",
        props.disabled ? "cursor-not-allowed opacity-60" : ""
      ].join(" ")}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-pressed={props.selected}
    >
      {props.label}
    </button>
  );
}

export function SettingsPanel(props: {
  open: boolean;
  onClose: () => void;
  theme: ThemePreference;
  onThemeChange: (next: ThemePreference) => void;
  widthPreference: WidthPreference;
  onWidthPreferenceChange: (next: WidthPreference) => void;
}) {
  useEffect(() => {
    if (!props.open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      props.onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props.open, props.onClose]);

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        aria-label="Close settings"
        onClick={props.onClose}
      />

      <div className="absolute right-0 top-0 h-full w-full max-w-md border-l border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <TbSettings className="h-5 w-5 text-zinc-600 dark:text-zinc-300" />
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Settings</div>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className={[
              "inline-flex h-9 w-9 items-center justify-center rounded-lg border",
              "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
              "dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900",
              "focus:outline-none focus:ring-2 focus:ring-zinc-400/40 focus:ring-offset-2",
              "focus:ring-offset-white dark:focus:ring-offset-black"
            ].join(" ")}
            aria-label="Close"
          >
            <TbX className="h-4 w-4" />
          </button>
        </div>

        <div className="h-[calc(100%-68px)] space-y-6 overflow-y-auto px-5 py-5">
          {/* Theme Setting */}
          <div>
            <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Theme</div>
            <div className="mt-2 inline-flex gap-1 rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-black">
              <SegmentedOption
                label="Dark"
                selected={props.theme === "dark"}
                onClick={() => props.onThemeChange("dark")}
              />
              <SegmentedOption
                label="Light"
                selected={props.theme === "light"}
                onClick={() => props.onThemeChange("light")}
              />
            </div>
          </div>

          {/* Layout Width Setting */}
          <div>
            <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Layout Width</div>
            <div className="mt-2 inline-flex gap-1 rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-black">
              <SegmentedOption
                label="Fixed"
                selected={props.widthPreference === "fixed"}
                onClick={() => props.onWidthPreferenceChange("fixed")}
              />
              <SegmentedOption
                label="Full"
                selected={props.widthPreference === "full"}
                onClick={() => props.onWidthPreferenceChange("full")}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

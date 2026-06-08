export function pillBase(disabled?: boolean) {
  return [
    "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs",
    "border-zinc-200 bg-white text-zinc-800",
    "hover:border-zinc-300 hover:bg-zinc-50",
    "dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200",
    "dark:hover:border-zinc-700 dark:hover:bg-zinc-900",
    "focus:outline-none focus:ring-2 focus:ring-zinc-400/40 focus:ring-offset-2",
    "focus:ring-offset-white dark:focus:ring-offset-black",
    disabled ? "opacity-60" : ""
  ].join(" ");
}

export function selectPill(disabled?: boolean) {
  return [
    pillBase(disabled),
    "justify-between gap-2 pr-2"
  ].join(" ");
}

export function togglePill(active: boolean, disabled?: boolean) {
  return [
    pillBase(disabled),
    active ? "ring-2 ring-zinc-400/40 dark:ring-zinc-500/40" : ""
  ].join(" ");
}

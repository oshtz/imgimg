export type PromptPosition = "top" | "bottom" | "left" | "right";

export const PROMPT_SIDEBAR_MIN_WIDTH = 320;
export const DEFAULT_PROMPT_SIDEBAR_WIDTH = 384;
export const PROMPT_SIDEBAR_MAX_WIDTH = 640;

export function clampPromptSidebarWidth(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_PROMPT_SIDEBAR_WIDTH;
  return Math.round(Math.min(PROMPT_SIDEBAR_MAX_WIDTH, Math.max(PROMPT_SIDEBAR_MIN_WIDTH, n)));
}

export function parsePromptPosition(value: string): PromptPosition {
  return value === "top" || value === "left" || value === "right" ? value : "bottom";
}

export function isPromptSidebarPosition(value: PromptPosition): boolean {
  return value === "left" || value === "right";
}

export function getPromptFlowClassName(position: PromptPosition, hasWorkflow: boolean): string {
  if (!hasWorkflow) return "";

  const classes = ["gap-4"];
  if (position === "bottom") {
    classes.push("flex-col-reverse");
  }
  if (position === "left") {
    classes.push("lg:flex-row", "lg:items-stretch");
  }
  if (position === "right") {
    classes.push("flex-col-reverse", "lg:flex-row-reverse", "lg:items-stretch");
  }

  return classes.join(" ");
}

export function getPromptPaneClassName(options: {
  position: PromptPosition;
  hasWorkflow: boolean;
  hasDashboardItems: boolean;
}): string {
  const base = options.hasDashboardItems
    ? "min-h-0 flex-1 overflow-y-auto pr-2"
    : "shrink-0";

  if (!options.hasWorkflow || !isPromptSidebarPosition(options.position)) {
    return base;
  }

  return [
    base,
    "relative",
    "lg:flex",
    "lg:flex-col",
    "lg:min-h-0",
    "lg:w-[var(--prompt-sidebar-width)]",
    "lg:flex-none",
    "lg:self-stretch",
  ].join(" ");
}

export function getHistoryPaneClassName(position: PromptPosition): string {
  const base = "flex min-h-0 flex-1 flex-col";
  if (!isPromptSidebarPosition(position)) {
    return base;
  }

  return [base, "lg:min-w-0"].join(" ");
}

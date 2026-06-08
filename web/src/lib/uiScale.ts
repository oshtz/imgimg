export const UI_SCALE_STORAGE_KEY = "imgimg.uiScale.v1";
export const DEFAULT_UI_SCALE = 1;
export const MIN_UI_SCALE = 0.8;
export const MAX_UI_SCALE = 1.4;
export const UI_SCALE_STEP = 0.1;

type UiScaleShortcutEvent = {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
};

export function clampUiScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_UI_SCALE;
  return Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, roundUiScale(value)));
}

export function parseUiScale(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return DEFAULT_UI_SCALE;
  return clampUiScale(Number(trimmed));
}

export function applyUiScaleShortcut(current: number, event: UiScaleShortcutEvent): number | null {
  if (event.altKey || (!event.ctrlKey && !event.metaKey)) return null;

  if (isIncreaseShortcut(event)) {
    return clampUiScale(current + UI_SCALE_STEP);
  }

  if (isDecreaseShortcut(event)) {
    return clampUiScale(current - UI_SCALE_STEP);
  }

  if (isResetShortcut(event)) {
    return DEFAULT_UI_SCALE;
  }

  return null;
}

function isIncreaseShortcut(event: UiScaleShortcutEvent): boolean {
  return event.key === "+" || event.key === "=" || event.code === "Equal" || event.code === "NumpadAdd";
}

function isDecreaseShortcut(event: UiScaleShortcutEvent): boolean {
  return event.key === "-" || event.key === "_" || event.code === "Minus" || event.code === "NumpadSubtract";
}

function isResetShortcut(event: UiScaleShortcutEvent): boolean {
  return event.key === "0" || event.code === "Digit0" || event.code === "Numpad0";
}

function roundUiScale(value: number): number {
  return Number(value.toFixed(2));
}

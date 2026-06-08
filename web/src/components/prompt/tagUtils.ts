import type { Model } from "../../types";

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getTagContext(value: string, cursor: number) {
  if (cursor < 0) return null;
  const atIndex = value.lastIndexOf("@", cursor - 1);
  if (atIndex < 0) return null;
  const prevChar = atIndex > 0 ? value[atIndex - 1] : "";
  if (prevChar && /[A-Za-z0-9]/.test(prevChar)) return null;
  const segment = value.slice(atIndex + 1, cursor);
  if (/[\s,]/.test(segment)) return null;
  return { start: atIndex, query: segment };
}

export function getPromptTagContext(value: string, cursor: number) {
  if (cursor < 0) return null;
  const bangIndex = value.lastIndexOf("!", cursor - 1);
  if (bangIndex < 0) return null;
  const prevChar = bangIndex > 0 ? value[bangIndex - 1] : "";
  if (prevChar && /[A-Za-z0-9]/.test(prevChar)) return null;
  const segment = value.slice(bangIndex + 1, cursor);
  if (/[\s,]/.test(segment)) return null;
  return { start: bangIndex, query: segment };
}

export function removeModelTags(value: string, models: Model[]) {
  let next = value;
  const ordered = [...models].sort((a, b) => b.name.length - a.name.length);
  for (const model of ordered) {
    const name = model.name.trim();
    if (!name) continue;
    const regex = new RegExp(`@${escapeRegExp(name)}(?=$|[\\s,.;:!?])`, "gi");
    next = next.replace(regex, "");
  }
  return next;
}

export function findTagRanges(value: string, models: Model[]) {
  if (!value.includes("@")) return [];
  const lower = value.toLowerCase();
  const ordered = [...models].sort((a, b) => b.name.length - a.name.length);
  const ranges: { start: number; end: number }[] = [];
  for (const model of ordered) {
    const name = model.name.trim();
    if (!name) continue;
    const needle = `@${name.toLowerCase()}`;
    let idx = lower.indexOf(needle);
    while (idx !== -1) {
      const prevChar = idx > 0 ? lower[idx - 1] : "";
      if (prevChar && /[a-z0-9]/.test(prevChar)) {
        idx = lower.indexOf(needle, idx + 1);
        continue;
      }
      const end = idx + needle.length;
      const nextChar = lower[end] ?? "";
      if (nextChar && !/[\s,.;:!?]/.test(nextChar)) {
        idx = lower.indexOf(needle, idx + 1);
        continue;
      }
      const overlaps = ranges.some((range) => idx < range.end && end > range.start);
      if (!overlaps) ranges.push({ start: idx, end });
      idx = lower.indexOf(needle, idx + 1);
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  return ranges;
}

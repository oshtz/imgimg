import type { UserPreset } from "../api";

export type PresetTagCandidate = {
  id: string;
  name: string;
  nameLower: string;
  nameSlug: string;
};

/** Normalize a preset name to a slug for matching: lowercase, alphanumeric + dashes. */
export function slugifyPreset(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildPresetTagCandidates(presets: UserPreset[]): PresetTagCandidate[] {
  return presets
    .map((p) => ({
      id: p.id,
      name: p.name.trim(),
      nameLower: p.name.trim().toLowerCase(),
      nameSlug: slugifyPreset(p.name),
    }))
    .filter((c) => c.name.length > 0);
}

/** Find #preset-name matches in the prompt. Returns matched preset IDs with positions. */
export function findPresetTagMatches(
  prompt: string,
  candidates: PresetTagCandidate[]
): { id: string; name: string; index: number }[] {
  if (!prompt.includes("#")) return [];

  const matches: { id: string; name: string; index: number }[] = [];
  const promptLower = prompt.toLowerCase();

  // Try exact name matching first (longest first to avoid partial overlaps)
  const ordered = [...candidates].sort((a, b) => b.nameLower.length - a.nameLower.length);
  for (const candidate of ordered) {
    if (!candidate.nameLower) continue;
    // Try both the raw name and the slug
    const needles = [
      `#${candidate.nameLower}`,
      `#${candidate.nameSlug}`,
    ];
    for (const needle of needles) {
      let idx = promptLower.indexOf(needle);
      while (idx !== -1) {
        const end = idx + needle.length;
        const nextChar = promptLower[end] ?? "";
        if (nextChar === "" || /[\s,.;:!?]/.test(nextChar)) {
          const overlaps = matches.some(
            (m) => idx >= m.index && idx < m.index + m.name.length + 1
          );
          if (!overlaps) {
            matches.push({ id: candidate.id, name: candidate.name, index: idx });
          }
          break;
        }
        idx = promptLower.indexOf(needle, idx + 1);
      }
    }
  }

  if (matches.length > 0) {
    matches.sort((a, b) => a.index - b.index);
    return matches;
  }

  // Fallback: extract #tags and try slug matching
  const regex = /#([A-Za-z0-9._-]+)/g;
  let match: RegExpExecArray | null;
  const tags: { tag: string; index: number }[] = [];
  while ((match = regex.exec(prompt)) !== null) {
    tags.push({ tag: match[1], index: match.index });
  }

  const slugMatches: { id: string; name: string; index: number }[] = [];
  for (const { tag, index } of tags) {
    const normalizedTag = slugifyPreset(tag);
    if (!normalizedTag) continue;

    let exactMatch: PresetTagCandidate | null = null;
    let exactCount = 0;
    for (const candidate of candidates) {
      if (candidate.nameSlug === normalizedTag) {
        exactMatch = candidate;
        exactCount += 1;
      }
    }
    if (exactCount === 1 && exactMatch) {
      slugMatches.push({ id: exactMatch.id, name: exactMatch.name, index });
      continue;
    }
  }
  slugMatches.sort((a, b) => a.index - b.index);
  return slugMatches;
}

/** Get the context around a # character for autocomplete. */
export function getPresetTagContext(value: string, cursor: number) {
  if (cursor < 0) return null;
  const hashIndex = value.lastIndexOf("#", cursor - 1);
  if (hashIndex < 0) return null;
  const prevChar = hashIndex > 0 ? value[hashIndex - 1] : "";
  if (prevChar && /[A-Za-z0-9]/.test(prevChar)) return null;
  const segment = value.slice(hashIndex + 1, cursor);
  if (/[\s,]/.test(segment)) return null;
  return { start: hashIndex, query: segment };
}

/** Find visual ranges of matched #tags in the prompt for highlighting. */
export function findPresetTagRanges(
  value: string,
  candidates: PresetTagCandidate[]
): { start: number; end: number }[] {
  if (!value.includes("#")) return [];
  const lower = value.toLowerCase();
  const ordered = [...candidates].sort((a, b) => b.nameLower.length - a.nameLower.length);
  const ranges: { start: number; end: number }[] = [];

  for (const candidate of ordered) {
    const needles = [
      `#${candidate.nameLower}`,
      `#${candidate.nameSlug}`,
    ];
    for (const needle of needles) {
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
        const overlaps = ranges.some((r) => idx < r.end && end > r.start);
        if (!overlaps) ranges.push({ start: idx, end });
        idx = lower.indexOf(needle, idx + 1);
      }
    }
  }

  ranges.sort((a, b) => a.start - b.start);
  return ranges;
}

/** Remove all #preset-tags from a value. */
export function removePresetTags(value: string, candidates: PresetTagCandidate[]): string {
  let next = value;
  const ordered = [...candidates].sort((a, b) => b.nameLower.length - a.nameLower.length);
  for (const candidate of ordered) {
    const needles = [candidate.nameLower, candidate.nameSlug];
    for (const needle of needles) {
      const regex = new RegExp(
        `#${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[\\s,.;:!?])`,
        "gi"
      );
      next = next.replace(regex, "");
    }
  }
  return next.replace(/\s{2,}/g, " ").trim();
}

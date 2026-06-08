import type { Model } from "../types";

export type LoraTagCandidate = {
  id: string;
  name: string;
  nameLower: string;
  nameNormalized: string;
};

export function normalizeLoraTag(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function buildLoraTagCandidates(models: Model[]): LoraTagCandidate[] {
  return models
    .map((model) => {
      const name = model.name.trim();
      return {
        id: model.id,
        name,
        nameLower: name.toLowerCase(),
        nameNormalized: normalizeLoraTag(name)
      };
    })
    .filter((candidate) => candidate.name.length > 0);
}

export function findLoraTagMatches(prompt: string, candidates: LoraTagCandidate[]) {
  if (!prompt.includes("@")) return [];
  const matches: { id: string; name: string; index: number }[] = [];
  const promptLower = prompt.toLowerCase();
  const ordered = [...candidates].sort((a, b) => b.nameLower.length - a.nameLower.length);
  for (const candidate of ordered) {
    if (!candidate.nameLower) continue;
    const needle = `@${candidate.nameLower}`;
    let idx = promptLower.indexOf(needle);
    while (idx !== -1) {
      const end = idx + needle.length;
      const nextChar = promptLower[end] ?? "";
      if (nextChar === "" || /[\s,.;:!?]/.test(nextChar)) {
        const overlaps = matches.some((m) => idx >= m.index && idx < m.index + m.name.length + 1);
        if (!overlaps) {
          matches.push({ id: candidate.id, name: candidate.name, index: idx });
        }
        break;
      }
      idx = promptLower.indexOf(needle, idx + 1);
    }
  }
  if (matches.length > 0) {
    matches.sort((a, b) => a.index - b.index);
    return matches;
  }
  const tags: string[] = [];
  const regex = /@([A-Za-z0-9._-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(prompt)) !== null) {
    tags.push(match[1]);
  }
  if (tags.length === 0) return [];

  const slugMatches: { id: string; name: string; index: number }[] = [];
  for (const tag of tags) {
    const normalizedTag = normalizeLoraTag(tag);
    if (!normalizedTag) continue;
    const tagIndex = promptLower.indexOf(`@${tag.toLowerCase()}`);
    let exactMatch: LoraTagCandidate | null = null;
    let exactCount = 0;
    for (const candidate of candidates) {
      if (candidate.nameNormalized === normalizedTag) {
        exactMatch = candidate;
        exactCount += 1;
      }
    }
    if (exactCount === 1 && exactMatch) {
      slugMatches.push({ id: exactMatch.id, name: exactMatch.name, index: tagIndex });
      continue;
    }
    if (exactCount > 0) continue;
    let partialMatch: LoraTagCandidate | null = null;
    let partialCount = 0;
    for (const candidate of candidates) {
      if (candidate.nameNormalized.includes(normalizedTag)) {
        partialMatch = candidate;
        partialCount += 1;
      }
    }
    if (partialCount === 1 && partialMatch) {
      slugMatches.push({ id: partialMatch.id, name: partialMatch.name, index: tagIndex });
    }
  }
  slugMatches.sort((a, b) => a.index - b.index);
  return slugMatches;
}

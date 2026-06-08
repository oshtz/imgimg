/**
 * Extract unique [VARIABLE] names from prompt text, in first-occurrence order.
 * e.g., "A [FOO] and [BAR] and [FOO]" → ["FOO", "BAR"]
 */
export function extractVariables(text: string): string[] {
  const regex = /\[([^\[\]]+)\]/g;
  const seen = new Set<string>();
  const result: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }
  return result;
}

/**
 * Replace all [KEY] occurrences with corresponding values.
 * Uses literal string matching (replaceAll) — safe for special chars.
 */
export function replaceVariables(text: string, values: Record<string, string>): string {
  let result = text;
  for (const [key, value] of Object.entries(values)) {
    result = result.replaceAll(`[${key}]`, value);
  }
  return result;
}

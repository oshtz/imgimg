/**
 * Extract a human-readable error message from an unknown caught value.
 * Handles standard Error objects, Tauri command error payloads ({ error, kind }),
 * and plain strings.
 */
export function extractError(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "error" in e) {
    const msg = (e as Record<string, unknown>).error;
    if (typeof msg === "string") return msg;
  }
  if (typeof e === "string") return e;
  return fallback;
}

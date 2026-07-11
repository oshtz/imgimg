import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { getWorkspaceState, isTauri, saveWorkspaceState } from "../tauri-api";

type WorkspaceStateKey = "iterate_threads" | "audio_metadata";

function readLegacy<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : JSON.parse(stored) as T;
  } catch {
    return fallback;
  }
}

export function useDurableWorkspaceState<T>(
  key: WorkspaceStateKey,
  legacyKey: string,
  fallback: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => readLegacy(legacyKey, fallback));
  const [loaded, setLoaded] = useState(() => !isTauri());

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    void (async () => {
      try {
        const stored = await getWorkspaceState<T>(key);
        if (cancelled) return;
        if (stored !== null) {
          setValue(stored);
        } else {
          const legacy = readLegacy(legacyKey, fallback);
          setValue(legacy);
          await saveWorkspaceState(key, legacy);
          localStorage.removeItem(legacyKey);
        }
      } catch (error) {
        console.error(`Failed to load durable workspace state: ${key}`, error);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [key, legacyKey]);

  useEffect(() => {
    if (!loaded || !isTauri()) return;
    const timeout = window.setTimeout(() => {
      void saveWorkspaceState(key, value);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [key, loaded, value]);

  return [value, setValue];
}

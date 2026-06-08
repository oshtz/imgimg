import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from "react";

/**
 * A useState hook that persists its value to localStorage.
 *
 * - Reads from localStorage on mount (falling back to `defaultValue` on error).
 * - Writes to localStorage whenever the value changes.
 * - Supports custom serialize/deserialize for non-string types.
 */
export function usePersistedState<T>(
  key: string,
  defaultValue: T,
  options?: {
    serialize?: (value: T) => string;
    deserialize?: (raw: string) => T;
  }
): [T, Dispatch<SetStateAction<T>>] {
  const serialize = options?.serialize ?? JSON.stringify;
  const deserialize = options?.deserialize ?? JSON.parse;

  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;
      return deserialize(raw);
    } catch {
      return defaultValue;
    }
  });

  // Re-read from localStorage when the key changes (e.g. workflow switch)
  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    try {
      const raw = localStorage.getItem(key);
      setValue(raw === null ? defaultValue : deserialize(raw));
    } catch {
      setValue(defaultValue);
    }
  }

  useEffect(() => {
    try {
      localStorage.setItem(key, serialize(value));
    } catch {
      // Storage full or unavailable — silently ignore
    }
  }, [key, value, serialize]);

  return [value, setValue];
}

/**
 * Convenience wrapper for simple string-valued persisted state.
 */
export function usePersistedString(key: string, defaultValue: string) {
  return usePersistedState<string>(key, defaultValue, {
    serialize: (v) => v,
    deserialize: (v) => v,
  });
}

/**
 * Convenience wrapper for boolean-valued persisted state.
 */
export function usePersistedBoolean(key: string, defaultValue: boolean) {
  return usePersistedState<boolean>(key, defaultValue, {
    serialize: (v) => (v ? "true" : "false"),
    deserialize: (v) => v === "true",
  });
}

/**
 * Convenience wrapper for number-valued persisted state.
 */
export function usePersistedNumber(key: string, defaultValue: number) {
  return usePersistedState<number>(key, defaultValue, {
    serialize: (v) => String(v),
    deserialize: (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : defaultValue;
    },
  });
}

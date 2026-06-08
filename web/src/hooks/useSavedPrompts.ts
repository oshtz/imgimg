import { useCallback, useEffect, useRef, useState } from "react";
import * as tauri from "../tauri-api";
import type { SavedPrompt } from "../types";

const LOCAL_STORAGE_KEY = "imgimg.savedPrompts.v1";

/**
 * DB-backed saved prompts hook. On first load, migrates any existing
 * localStorage prompts into the database, then clears localStorage.
 */
export function useSavedPrompts(): [SavedPrompt[], (next: SavedPrompt[]) => void] {
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const prevRef = useRef<SavedPrompt[]>([]);

  // Load from DB on mount (and migrate localStorage if needed)
  useEffect(() => {
    let cancelled = false;

    async function init() {
      // 1. Load existing DB prompts
      let dbPrompts = await tauri.listSavedPrompts();

      // 2. Check localStorage for legacy data to migrate
      try {
        const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (raw) {
          const localPrompts: SavedPrompt[] = JSON.parse(raw);
          if (localPrompts.length > 0) {
            const existingIds = new Set(dbPrompts.map((p) => p.id));
            const toMigrate = localPrompts.filter((p) => !existingIds.has(p.id));
            // Upsert each into DB
            for (const p of toMigrate) {
              await tauri.upsertSavedPrompt({
                id: p.id,
                name: p.name,
                text: p.text,
              });
            }
            if (toMigrate.length > 0) {
              // Re-fetch to get the full list with DB timestamps
              dbPrompts = await tauri.listSavedPrompts();
            }
            // Clear localStorage after successful migration
            localStorage.removeItem(LOCAL_STORAGE_KEY);
          }
        }
      } catch {
        // localStorage unavailable or corrupt — ignore
      }

      if (!cancelled) {
        const mapped = dbPrompts.map(toSavedPrompt);
        setPrompts(mapped);
        prevRef.current = mapped;
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  // Sync changes to DB
  const handleChange = useCallback((next: SavedPrompt[]) => {
    const prev = prevRef.current;
    setPrompts(next);
    prevRef.current = next;

    // Diff: find upserts and deletes
    const nextIds = new Set(next.map((p) => p.id));
    const prevIds = new Set(prev.map((p) => p.id));

    // Deleted
    for (const p of prev) {
      if (!nextIds.has(p.id)) {
        tauri.deleteSavedPrompt(p.id);
      }
    }

    // Added or updated
    for (const p of next) {
      const old = prev.find((o) => o.id === p.id);
      if (!old || old.name !== p.name || old.text !== p.text) {
        tauri.upsertSavedPrompt({ id: p.id, name: p.name, text: p.text });
      }
    }
  }, []);

  return [prompts, handleChange];
}

function toSavedPrompt(r: tauri.SavedPromptRecord): SavedPrompt {
  return {
    id: r.id,
    name: r.name,
    text: r.text,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

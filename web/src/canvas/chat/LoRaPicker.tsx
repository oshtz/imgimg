import { useEffect, useRef, useState } from "react";
import { TbSearch, TbX, TbPin, TbPinnedOff } from "react-icons/tb";
import type { Model } from "../../types";

type LoRaPickerProps = {
  models: Model[];
  pinnedIds: string[];
  onChangePinned: (ids: string[]) => void;
  onClose: () => void;
};

export function LoRaPicker({ models, pinnedIds, onChangePinned, onClose }: LoRaPickerProps) {
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const pinnedSet = new Set(pinnedIds);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const filtered = search.trim()
    ? models.filter((m) => {
        const q = search.toLowerCase();
        return m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || m.tags.some((t) => t.toLowerCase().includes(q));
      })
    : models;

  // Sort: pinned first, then alphabetical
  const sorted = [...filtered].sort((a, b) => {
    const aPin = pinnedSet.has(a.id) ? 0 : 1;
    const bPin = pinnedSet.has(b.id) ? 0 : 1;
    if (aPin !== bPin) return aPin - bPin;
    return a.name.localeCompare(b.name);
  });

  const togglePin = (id: string) => {
    if (pinnedSet.has(id)) {
      onChangePinned(pinnedIds.filter((mid) => mid !== id));
    } else {
      onChangePinned([...pinnedIds, id]);
    }
  };

  return (
    <div className="flex max-h-[350px] flex-col border-b border-zinc-200 dark:border-zinc-700">
      <div className="flex items-center gap-2 px-3 py-2">
        <TbSearch size={14} className="shrink-0 text-zinc-400" />
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${models.length} LoRAs...`}
          className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 placeholder-zinc-400 outline-none dark:text-zinc-100 dark:placeholder-zinc-500"
        />
        <button
          onClick={onClose}
          className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <TbX size={14} />
        </button>
      </div>
      <div className="flex items-center justify-between px-3 pb-1">
        <span className="text-[11px] text-zinc-400">
          {pinnedIds.length} pinned {pinnedIds.length === 0 && "— agent sees all models"}
        </span>
        {pinnedIds.length > 0 && (
          <button
            onClick={() => onChangePinned([])}
            className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            Clear all
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sorted.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-zinc-400">No LoRAs match "{search}"</p>
        )}
        {sorted.map((model) => {
          const isPinned = pinnedSet.has(model.id);
          return (
            <button
              key={model.id}
              onClick={() => togglePin(model.id)}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800 ${isPinned ? "bg-accent-sky/10" : ""}`}
            >
              <span className={`shrink-0 ${isPinned ? "text-accent-sky" : "text-zinc-300 dark:text-zinc-600"}`}>
                {isPinned ? <TbPin size={14} /> : <TbPinnedOff size={14} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">{model.name}</div>
                {model.tags.length > 0 && (
                  <div className="truncate text-[10px] text-zinc-400">{model.tags.join(", ")}</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

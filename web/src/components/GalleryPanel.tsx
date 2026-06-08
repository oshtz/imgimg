import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { TbSearch, TbX, TbChevronDown, TbCheck } from "react-icons/tb";
import type { ApiBaseUrl, WorkflowSummary } from "../api";
import { getGallery } from "../client";
import type { Asset, Generation, Model } from "../types";
import type { AssetTypeRegistry } from "../assetTypeRegistry";
import { useGenerationEvents } from "../useGenerationEvents";

type GalleryPanelProps = {
  apiBaseUrl: ApiBaseUrl;
  workflows: WorkflowSummary[];
  assetTypeRegistry: AssetTypeRegistry;
  models: Model[];
  items: Generation[];
  onItemsChange: Dispatch<SetStateAction<Generation[]>>;
  selectedGenerationId: string | null;
  assetUrl: (apiBaseUrl: ApiBaseUrl, asset: Asset) => string;
  onOpenAsset: (g: Generation, asset: Asset) => void;
  authToken?: string | null;
  eventsEnabled?: boolean;
};

function mergeAssetVersions(existing: Asset[], incoming: Asset[]) {
  const next = existing.map((asset) => ({ ...asset, isActive: asset.isActive ?? true }));
  for (const asset of incoming) {
    for (const prior of next) {
      if (prior.type === asset.type && prior.itemIndex === asset.itemIndex) {
        prior.isActive = false;
      }
    }
    next.push({ ...asset, isActive: asset.isActive ?? true });
  }
  next.sort((a, b) => {
    const activeDelta = Number(Boolean(b.isActive)) - Number(Boolean(a.isActive));
    if (activeDelta !== 0) return activeDelta;
    return b.createdAt.localeCompare(a.createdAt);
  });
  return next;
}

function withActiveAssets(items: Generation[]) {
  return items.map((g) => ({
    ...g,
    assets: g.assets.filter((a) => a.isActive !== false)
  }));
}

type GalleryAssetItem = {
  generation: Generation;
  asset: Asset;
};

function displayItemIndex(itemIndex: number | null | undefined) {
  return itemIndex === null || itemIndex === undefined ? null : itemIndex + 1;
}

function isVideoAsset(asset: Asset) {
  if (asset.type === "video") return true;
  const url = asset.url.toLowerCase();
  return url.endsWith(".mp4") || url.endsWith(".webm") || url.endsWith(".mov");
}

function isAudioAsset(asset: Asset) {
  if (asset.type === "audio") return true;
  const url = asset.url.toLowerCase();
  return url.endsWith(".wav") || url.endsWith(".mp3") || url.endsWith(".ogg") || url.endsWith(".m4a");
}

function statusPill(status: Generation["status"]) {
  if (status === "succeeded") return "bg-accent-forest/10 text-accent-forest";
  if (status === "failed") return "bg-red-500/10 text-red-700 dark:text-red-300";
  if (status === "running") return "bg-accent-sky/10 text-accent-sky";
  return "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300";
}

type FilterDropdownProps = {
  value: string;
  onChange: (value: string) => void;
  options: { id: string; label: string }[];
  allLabel: string;
  placeholder: string;
};

function FilterDropdown({ value, onChange, options, allLabel, placeholder }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [alignRight, setAlignRight] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const MENU_WIDTH = 224; // w-56 = 14rem = 224px

  const toggle = useCallback(() => {
    setOpen((prev) => {
      if (!prev) {
        // Compute alignment synchronously before opening
        const el = ref.current;
        if (el) {
          const rect = el.getBoundingClientRect();
          setAlignRight(rect.left + MENU_WIDTH > window.innerWidth - 8);
        }
        setQuery("");
      }
      return !prev;
    });
  }, []);

  const close = useCallback(() => { setOpen(false); setQuery(""); }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, close]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const selectedLabel = value === "all" ? allLabel : (options.find((o) => o.id === value)?.label ?? value);
  const isActive = value !== "all";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        className={[
          "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm whitespace-nowrap",
          "bg-white dark:bg-black",
          "focus:border-zinc-500/50 focus:outline-none focus:ring-1 focus:ring-zinc-500/50",
          isActive
            ? "border-zinc-500 text-zinc-900 dark:border-zinc-500 dark:text-zinc-100"
            : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
        ].join(" ")}
      >
        <span className="truncate max-w-[160px]">{selectedLabel}</span>
        <TbChevronDown className={["h-3.5 w-3.5 shrink-0 ml-1 transition-transform", open ? "rotate-180" : ""].join(" ")} />
      </button>

      {open && (
        <div className={["absolute top-full z-50 mt-1 w-56 rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800", alignRight ? "right-0" : "left-0"].join(" ")}>
          {options.length > 5 && (
            <div className="border-b border-zinc-200 p-1.5 dark:border-zinc-700">
              <div className="relative">
                <TbSearch className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={placeholder}
                  className="w-full rounded-md border border-zinc-200 bg-zinc-50 py-1.5 pl-8 pr-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500"
                />
              </div>
            </div>
          )}
          <div className="max-h-60 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => { onChange("all"); close(); }}
              className={[
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
                value === "all"
                  ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100"
                  : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700/50"
              ].join(" ")}
            >
              {value === "all" && <TbCheck className="h-3.5 w-3.5 shrink-0" />}
              {value !== "all" && <span className="w-3.5 shrink-0" />}
              {allLabel}
            </button>
            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onChange(o.id); close(); }}
                className={[
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
                  value === o.id
                    ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100"
                    : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700/50"
                ].join(" ")}
              >
                {value === o.id && <TbCheck className="h-3.5 w-3.5 shrink-0" />}
                {value !== o.id && <span className="w-3.5 shrink-0" />}
                <span className="truncate">{o.label}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-zinc-400 dark:text-zinc-500">No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function buildGalleryAssets(items: Generation[], visibleTypes: Set<string>): GalleryAssetItem[] {
  const out: GalleryAssetItem[] = [];
  for (const g of items) {
    const active = g.assets.filter((a) => a.isActive !== false);
    const finals = active.filter((a) => visibleTypes.has(a.type));
    const assets = finals.length > 0 ? finals : active.filter((a) => a.type !== "placeholder");
    if (assets.length === 0) {
      out.push({
        generation: g,
        asset: {
          id: `${g.id}:placeholder`,
          generationId: g.id,
          type: "placeholder",
          url: "",
          itemIndex: null,
          createdAt: g.createdAt,
          isActive: true
        }
      });
      continue;
    }
    const ordered = [...assets].sort((a, b) => {
      if (a.type === b.type && a.itemIndex !== null && b.itemIndex !== null) {
        return a.itemIndex - b.itemIndex;
      }
      return b.createdAt.localeCompare(a.createdAt);
    });
    for (const asset of ordered) {
      out.push({ generation: g, asset });
    }
  }
  return out;
}

// Breakpoints matching Tailwind defaults: sm=640, lg=1024, xl=1280
function useColumnCount(ref: React.RefObject<HTMLElement | null>, breakpoints = [640, 1024, 1280], cols = [1, 2, 3, 4]) {
  const [count, setCount] = useState(cols[0]!);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry!.contentRect.width;
      let c = cols[0]!;
      for (let i = 0; i < breakpoints.length; i++) {
        if (w >= breakpoints[i]!) c = cols[i + 1] ?? c;
      }
      setCount(c);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, breakpoints, cols]);
  return count;
}

function distributeToColumns<T>(items: T[], numCols: number): T[][] {
  const columns: T[][] = Array.from({ length: numCols }, () => []);
  for (let i = 0; i < items.length; i++) {
    columns[i % numCols]!.push(items[i]!);
  }
  return columns;
}

function GalleryAssetCard(props: {
  item: GalleryAssetItem;
  isSelected: boolean;
  apiBaseUrl: ApiBaseUrl;
  assetUrl: (apiBaseUrl: ApiBaseUrl, asset: Asset) => string;
  onOpenAsset: (g: Generation, asset: Asset) => void;
  loading: boolean;
}) {
  const { generation: g, asset } = props.item;
  const displayIndex = displayItemIndex(asset.itemIndex);
  const baseLabel = asset.type === "placeholder" ? "pending" : asset.type;
  const assetLabel = displayIndex !== null ? `${baseLabel} #${displayIndex}` : baseLabel;

  return (
    <button
      type="button"
      className={[
        "group relative block w-full overflow-hidden rounded-lg transition-all",
        props.isSelected
          ? "ring-2 ring-zinc-400 dark:ring-zinc-500"
          : "ring-1 ring-zinc-200 hover:ring-zinc-300 dark:ring-zinc-800 dark:hover:ring-zinc-700"
      ].join(" ")}
      style={{ breakInside: "avoid" }}
      onClick={() => props.onOpenAsset(g, asset)}
      disabled={props.loading}
      aria-label={`Open ${assetLabel}`}
      title={g.prompt}
    >
      {asset.type === "placeholder" || asset.url.length === 0 ? (
        <div className="flex aspect-square w-full items-center justify-center bg-zinc-100 text-xs text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          {g.status === "queued" ? "Queued..." : g.status === "running" ? "Generating..." : "Pending"}
        </div>
      ) : isAudioAsset(asset) ? (
        <div className="flex aspect-square w-full flex-col items-center justify-center gap-3 bg-zinc-100 px-3 dark:bg-zinc-900">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-zinc-400 dark:text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 10v3a1 1 0 0 0 1 1h3l5 6V1L6 7H3a1 1 0 0 0-1 1z" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio
            controls
            className="h-8 w-full max-w-[200px]"
            src={props.assetUrl(props.apiBaseUrl, asset)}
            preload="metadata"
            onClick={(e) => e.stopPropagation()}
            onPlay={(e) => e.stopPropagation()}
          />
        </div>
      ) : isVideoAsset(asset) ? (
        <>
          <video
            className="w-full"
            src={props.assetUrl(props.apiBaseUrl, asset)}
            muted
            playsInline
            preload="metadata"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80">
              <div className="ml-0.5 h-0 w-0 border-y-[6px] border-l-[10px] border-y-transparent border-l-zinc-900" />
            </div>
          </div>
        </>
      ) : (
        <img
          className="w-full"
          src={props.assetUrl(props.apiBaseUrl, asset)}
          alt={assetLabel}
        />
      )}

      {/* Hover overlay with prompt */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/70 to-transparent px-2 pb-2 pt-6 opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
        <p className="line-clamp-2 text-[11px] leading-tight text-white/90">{g.prompt}</p>
      </div>

      {g.status !== "succeeded" && (
        <div className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 backdrop-blur-sm">
          <span className={["text-[10px]", statusPill(g.status)].join(" ")}>{g.status}</span>
        </div>
      )}
    </button>
  );
}

export function GalleryPanel(props: GalleryPanelProps) {
  const [workflowFilter, setWorkflowFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const pageStateRef = useRef<Record<string, { cursorStack: (string | null)[]; pageIndex: number }>>({});

  const filterKey = useMemo(
    () =>
      JSON.stringify({
        workflowFilter,
        modelFilter,
        searchQuery,
        pageSize
      }),
    [workflowFilter, modelFilter, searchQuery, pageSize]
  );

  useEffect(() => {
    const saved = pageStateRef.current[filterKey];
    if (saved) {
      setCursorStack([...saved.cursorStack]);
      setPageIndex(saved.pageIndex);
    }
    if (!saved) {
      setCursorStack([null]);
      setPageIndex(0);
    }
    setNextCursor(null);
    setError(null);
  }, [filterKey]);

  useEffect(() => {
    pageStateRef.current[filterKey] = { cursorStack: [...cursorStack], pageIndex };
  }, [filterKey, cursorStack, pageIndex]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    setWorkflowFilter("all");
    setModelFilter("all");
    setSearchInput("");
    setSearchQuery("");
  }, []);

  const currentCursor = cursorStack[pageIndex] ?? null;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const workflowId = workflowFilter === "all" ? undefined : workflowFilter;
    const modelId = modelFilter === "all" ? undefined : modelFilter;
    void (async () => {
      try {
        const data = await getGallery(props.apiBaseUrl, {
          workflowId,
          modelId,
          q: searchQuery || undefined,
          limit: pageSize,
          cursor: currentCursor
        });
        if (!active) return;
        props.onItemsChange(data.items);
        setNextCursor(data.nextCursor ?? null);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Failed to load gallery");
        props.onItemsChange([]);
        setNextCursor(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [
    props.apiBaseUrl,
    workflowFilter,
    modelFilter,
    searchQuery,
    pageSize,
    currentCursor,
    props.onItemsChange
  ]);

  useGenerationEvents({
    apiBaseUrl: props.apiBaseUrl,
    generationId: null,
    authToken: props.authToken ?? undefined,
    enabled: props.eventsEnabled,
    onEvent: (event) => {
      if (event.type === "generation") {
        props.onItemsChange((prev) => {
          const idx = prev.findIndex((g) => g.id === event.data.generationId);
          if (idx < 0) return prev;
          const g = prev[idx]!;
          const nextAssets = event.data.assets
            ? mergeAssetVersions(g.assets, event.data.assets)
            : g.assets;
          const next = [...prev];
          next[idx] = { ...g, status: event.data.status, error: event.data.error ?? null, assets: nextAssets };
          return next;
        });
        return;
      }
      if (event.type === "generation_deleted") {
        props.onItemsChange((prev) => prev.filter((g) => g.id !== event.data.generationId));
      }
    }
  });

  const masonryRef = useRef<HTMLDivElement>(null);
  const columnCount = useColumnCount(masonryRef);

  const displayItems = useMemo(() => withActiveAssets(props.items), [props.items]);
  const visibleTypes = useMemo(() => props.assetTypeRegistry.visibleIds(), [props.assetTypeRegistry]);
  const galleryAssets = useMemo(() => buildGalleryAssets(displayItems, visibleTypes), [displayItems, visibleTypes]);
  const workflowLabels = useMemo(() => {
    const entries = props.workflows.map((w) => [w.id, w.label] as const);
    return new Map(entries);
  }, [props.workflows]);

  const workflowOptions = useMemo(() => {
    return props.workflows.map((w) => ({ id: w.id, label: w.label }));
  }, [props.workflows]);

  const modelOptions = useMemo(() => {
    return [...props.models]
      .map((m) => ({ id: m.id, label: m.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [props.models]);

  const searchClasses = [
    "w-full rounded-lg border py-2 pl-10 pr-10",
    "border-zinc-300 bg-white text-sm text-zinc-900 placeholder:text-zinc-400",
    "dark:border-zinc-700 dark:bg-black dark:text-zinc-100 dark:placeholder:text-zinc-500",
    "focus:border-zinc-500/50 focus:outline-none focus:ring-1 focus:ring-zinc-500/50"
  ].join(" ");

  const hasActiveFilters = workflowFilter !== "all" || modelFilter !== "all" || searchQuery !== "";

  const resetAllFilters = () => {
    setWorkflowFilter("all");
    setModelFilter("all");
    setSearchInput("");
    setSearchQuery("");
  };

  const activeFilters: { key: string; label: string; onClear: () => void }[] = [];
  if (searchQuery) {
    activeFilters.push({
      key: "search",
      label: `Search: "${searchQuery}"`,
      onClear: () => { setSearchInput(""); setSearchQuery(""); }
    });
  }
  if (workflowFilter !== "all") {
    const label = workflowLabels.get(workflowFilter) ?? workflowFilter;
    activeFilters.push({
      key: "workflow",
      label: `Workflow: ${label}`,
      onClear: () => setWorkflowFilter("all")
    });
  }
  if (modelFilter !== "all") {
    const model = modelOptions.find((m) => m.id === modelFilter);
    activeFilters.push({
      key: "model",
      label: `Model: ${model?.label ?? modelFilter}`,
      onClear: () => setModelFilter("all")
    });
  }

  const pageLabel = `Page ${pageIndex + 1}`;
  const canGoPrev = pageIndex > 0;
  const canGoNext = Boolean(nextCursor);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Gallery</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Browse all generations</p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <TbSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
            <input
              type="text"
              placeholder="Search prompt..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className={searchClasses}
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => { setSearchInput(""); setSearchQuery(""); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                aria-label="Clear search"
              >
                <TbX className="h-4 w-4" />
              </button>
            )}
          </div>

          <FilterDropdown
            value={workflowFilter}
            onChange={setWorkflowFilter}
            options={workflowOptions}
            allLabel="Workflow: All"
            placeholder="Search workflows..."
          />

          <FilterDropdown
            value={modelFilter}
            onChange={setModelFilter}
            options={modelOptions}
            allLabel="Model: All"
            placeholder="Search models..."
          />

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-600 hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-zinc-700 dark:bg-black dark:text-zinc-400 dark:hover:border-red-800 dark:hover:bg-red-950/30 dark:hover:text-red-400"
            >
              Reset filters
            </button>
          )}
        </div>

        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Active filters:</span>
            {activeFilters.map((filter) => (
              <span
                key={filter.key}
                className="inline-flex items-center gap-1.5 rounded-full bg-accent-sky/15 px-2.5 py-1 text-xs text-accent-sky dark:bg-accent-sky/10 dark:text-accent-sky"
              >
                {filter.label}
                <button
                  type="button"
                  onClick={filter.onClear}
                  className="rounded-full p-0.5 hover:bg-zinc-300 dark:hover:bg-zinc-800/50"
                  aria-label={`Remove ${filter.label} filter`}
                >
                  <TbX className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          {loading ? "Loading..." : `Showing ${galleryAssets.length} result${galleryAssets.length === 1 ? "" : "s"}`}
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto pr-2">
        {loading && galleryAssets.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">Loading...</div>
        ) : galleryAssets.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
            <h3 className="text-base font-medium text-zinc-700 dark:text-zinc-300">Your gallery is empty</h3>
            <p className="max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
              Generated images, videos, and audio will appear here. Select a workflow from the sidebar, type a prompt, and hit Generate to get started.
            </p>
          </div>
        ) : (
          <div ref={masonryRef} className="flex gap-3">
            {distributeToColumns(galleryAssets, columnCount).map((col, colIdx) => (
              <div key={colIdx} className="flex flex-1 flex-col gap-3">
                {col.map((item) => (
                  <GalleryAssetCard
                    key={`${item.generation.id}:${item.asset.id}`}
                    item={item}
                    isSelected={item.generation.id === props.selectedGenerationId}
                    apiBaseUrl={props.apiBaseUrl}
                    assetUrl={props.assetUrl}
                    onOpenAsset={props.onOpenAsset}
                    loading={loading}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{pageLabel}</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-black dark:text-zinc-400"
          >
            <option value={25}>25 per page</option>
            <option value={50}>50 per page</option>
            <option value={100}>100 per page</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={[
              "rounded-lg border px-3 py-2 text-xs font-semibold text-zinc-600 transition",
              "border-zinc-200 bg-white hover:border-zinc-300 hover:text-zinc-900",
              "dark:border-zinc-800 dark:bg-black dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-white",
              !canGoPrev ? "cursor-not-allowed opacity-50" : ""
            ].join(" ")}
            onClick={() => setPageIndex((prev) => Math.max(0, prev - 1))}
            disabled={!canGoPrev}
          >
            Previous
          </button>
          <button
            type="button"
            className={[
              "rounded-lg border px-3 py-2 text-xs font-semibold text-zinc-600 transition",
              "border-zinc-200 bg-white hover:border-zinc-300 hover:text-zinc-900",
              "dark:border-zinc-800 dark:bg-black dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-white",
              !canGoNext ? "cursor-not-allowed opacity-50" : ""
            ].join(" ")}
            onClick={() => {
              if (!nextCursor) return;
              setCursorStack((prev) => {
                const trimmed = prev.slice(0, pageIndex + 1);
                trimmed.push(nextCursor);
                return trimmed;
              });
              setPageIndex((prev) => prev + 1);
            }}
            disabled={!canGoNext}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

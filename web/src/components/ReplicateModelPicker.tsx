import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  TbAlertCircle,
  TbCheck,
  TbChevronDown,
  TbLoader2,
  TbPin,
  TbPinFilled,
  TbSearch,
  TbX,
} from "react-icons/tb";
import {
  searchProviderModels,
  type ApiBaseUrl,
  type DiscoveredModel,
} from "../client";
import { cn } from "../utils/cn";
import {
  filterPinnedModels,
  getProviderLabel,
  getProviderLogo,
  getProviderSearchCollection,
  isPinnedModel,
  summarizeModel,
  type ModelChooserAssetType,
  type ModelChooserProvider,
} from "./modelChooser/modelChooserState";

interface ProviderModelPickerProps {
  apiBaseUrl: ApiBaseUrl;
  /** Provider to search: "replicate" | "fal" | "openrouter" */
  provider: ModelChooserProvider;
  selectedModelId: string | null;
  onSelect: (modelId: string, model: DiscoveredModel) => void;
  onClear: () => void;
  disabled?: boolean;
  /** Filter models by output asset type */
  assetType?: ModelChooserAssetType;
  /** Pinned/favorited models for quick access */
  pinnedModels?: DiscoveredModel[];
  /** Called when user pins a model */
  onPin?: (model: DiscoveredModel) => void;
  /** Called when user unpins a model */
  onUnpin?: (modelId: string) => void;
  /** Use a tighter trigger for compact toolbars/composer rows */
  compact?: boolean;
}

/** @deprecated Use ProviderModelPicker instead */
type ReplicateModelPickerProps = Omit<ProviderModelPickerProps, "provider">;

function ProviderMark({ provider, label, compact = false }: { provider: string; label: string; compact?: boolean }) {
  const logo = getProviderLogo(provider);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black",
        compact ? "h-6 w-6 rounded-md" : "h-7 w-7 rounded-lg",
      )}
    >
      {logo ? (
        <img src={logo} alt="" className={cn(compact ? "h-3.5 w-3.5" : "h-4 w-4", "dark:invert")} />
      ) : (
        <span className="text-[10px] font-semibold uppercase text-zinc-500">
          {label.slice(0, 2)}
        </span>
      )}
    </span>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="h-7 w-7 animate-skeleton-shimmer rounded-lg bg-gradient-to-r from-zinc-200 via-zinc-100 to-zinc-200 bg-[length:200%_100%] dark:from-zinc-800 dark:via-zinc-700 dark:to-zinc-800" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-3 w-2/3 animate-skeleton-shimmer rounded bg-gradient-to-r from-zinc-200 via-zinc-100 to-zinc-200 bg-[length:200%_100%] dark:from-zinc-800 dark:via-zinc-700 dark:to-zinc-800" />
        <div className="h-2.5 w-1/2 animate-skeleton-shimmer rounded bg-gradient-to-r from-zinc-200 via-zinc-100 to-zinc-200 bg-[length:200%_100%] dark:from-zinc-800 dark:via-zinc-700 dark:to-zinc-800" />
      </div>
    </div>
  );
}

function ModelRow({
  model,
  selected,
  pinned,
  disabled,
  onSelect,
  onTogglePin,
}: {
  model: DiscoveredModel;
  selected: boolean;
  pinned: boolean;
  disabled?: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
}) {
  const summary = summarizeModel(model);
  const tags = model.tags?.slice(0, 3) ?? [];

  return (
    <div
      className={cn(
        "group flex min-h-[68px] items-stretch rounded-lg border transition-colors",
        selected
          ? "border-accent-forest bg-accent-forest/5 ring-1 ring-accent-forest/30 dark:bg-accent-forest/10"
          : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/50"
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-l-lg px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
      >
        <ProviderMark provider={model.provider} label={summary.providerLabel} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium text-zinc-950 dark:text-zinc-50">
              {summary.title}
            </span>
            {selected ? (
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-forest text-white">
                <TbCheck className="h-3 w-3" />
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="truncate">{summary.subtitle}</span>
            <span className="shrink-0 text-zinc-300 dark:text-zinc-700">/</span>
            <span className="truncate">{model.modelId}</span>
          </span>
          {model.description ? (
            <span className="mt-1 line-clamp-2 text-xs leading-snug text-zinc-500 dark:text-zinc-400">
              {model.description}
            </span>
          ) : tags.length > 0 ? (
            <span className="mt-1 flex min-w-0 flex-wrap gap-1">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                >
                  {tag}
                </span>
              ))}
            </span>
          ) : null}
        </span>
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onTogglePin();
        }}
        disabled={disabled}
        title={pinned ? "Unpin model" : "Pin model"}
        aria-label={pinned ? "Unpin model" : "Pin model"}
        className={cn(
          "flex w-10 shrink-0 items-center justify-center rounded-r-lg border-l transition-colors disabled:cursor-not-allowed disabled:opacity-60",
          pinned
            ? "border-accent-forest/20 text-accent-forest"
            : "border-zinc-200 text-zinc-400 hover:text-zinc-700 dark:border-zinc-800 dark:text-zinc-600 dark:hover:text-zinc-200"
        )}
      >
        {pinned ? <TbPinFilled className="h-4 w-4" /> : <TbPin className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function ProviderModelPicker({
  apiBaseUrl,
  provider,
  selectedModelId,
  onSelect,
  onClear,
  disabled,
  assetType,
  pinnedModels = [],
  onPin,
  onUnpin,
  compact = false,
}: ProviderModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [models, setModels] = useState<DiscoveredModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<DiscoveredModel | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasFetchedRef = useRef(false);
  const prevQueryRef = useRef(query);

  const providerLabel = getProviderLabel(provider);
  const pinnedProviderModels = useMemo(
    () => filterPinnedModels(pinnedModels, provider),
    [pinnedModels, provider]
  );
  const knownSelectedModel = useMemo(
    () =>
      selectedModelId
        ? selectedModel ??
          pinnedProviderModels.find((model) => model.modelId === selectedModelId) ??
          models.find((model) => model.modelId === selectedModelId) ??
          null
        : null,
    [models, pinnedProviderModels, selectedModel, selectedModelId]
  );
  const selectedSummary = knownSelectedModel ? summarizeModel(knownSelectedModel) : null;

  const doSearch = useCallback(
    async (searchQuery: string, cursor?: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const result = await searchProviderModels(apiBaseUrl, provider, {
          q: searchQuery.trim() || undefined,
          collection: getProviderSearchCollection(provider, assetType, searchQuery),
          assetType,
          limit: 12,
          cursor: cursor ?? undefined,
        });
        setModels((current) => (cursor ? [...current, ...result.models] : result.models));
        setNextCursor(result.nextCursor);
        setHasFetched(true);
      } catch (searchError) {
        setError(searchError instanceof Error ? searchError.message : "Search failed");
      } finally {
        setLoading(false);
      }
    },
    [apiBaseUrl, assetType, provider]
  );

  useEffect(() => {
    if (selectedModelId) return;
    setSelectedModel(null);
  }, [selectedModelId]);

  useEffect(() => {
    setModels([]);
    setNextCursor(null);
    setHasFetched(false);
    hasFetchedRef.current = false;
    prevQueryRef.current = "";
    setQuery("");
  }, [assetType, provider]);

  useEffect(() => {
    if (!open) return;

    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);

    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      void doSearch("");
    }

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [doSearch, open]);

  useEffect(() => {
    if (prevQueryRef.current === query) return;
    prevQueryRef.current = query;
    if (!open) return;

    setModels([]);
    setNextCursor(null);

    const timer = window.setTimeout(() => {
      hasFetchedRef.current = true;
      void doSearch(query);
    }, query.trim() ? 300 : 0);

    return () => window.clearTimeout(timer);
  }, [doSearch, open, query]);

  const handleSelect = useCallback(
    (model: DiscoveredModel) => {
      setSelectedModel(model);
      onSelect(model.modelId, model);
      setOpen(false);
    },
    [onSelect]
  );

  const handleClear = useCallback(() => {
    setSelectedModel(null);
    onClear();
  }, [onClear]);

  const togglePin = useCallback(
    (model: DiscoveredModel) => {
      if (isPinnedModel(pinnedModels, model.provider, model.modelId)) {
        onUnpin?.(model.modelId);
      } else {
        onPin?.(model);
      }
    },
    [onPin, onUnpin, pinnedModels]
  );

  const selectedTitle = selectedSummary?.title ?? selectedModelId ?? "Choose model";
  const selectedSubtitle = selectedSummary?.subtitle ?? providerLabel;

  return (
    <div className="inline-flex w-full min-w-[220px] max-w-[360px] items-stretch">
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 border border-zinc-200 bg-white text-left transition-colors",
          compact ? "h-10 min-h-10 rounded-l-md px-2.5 py-1.5" : "min-h-[40px] rounded-l-lg px-2.5 py-2",
          "focus:outline-none focus:ring-2 focus:ring-zinc-400/40 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black",
          "hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/50"
        )}
      >
        <ProviderMark provider={provider} label={providerLabel} compact={compact} />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-xs font-semibold text-zinc-950 dark:text-zinc-50", compact ? "leading-4" : "")}>
            {selectedTitle}
          </span>
          <span className={cn("block truncate text-[11px] text-zinc-500 dark:text-zinc-400", compact ? "leading-3" : "")}>
            {selectedModelId ? selectedSubtitle : providerLabel}
          </span>
        </span>
        <TbChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
      </button>
      {selectedModelId ? (
        <button
          type="button"
          onClick={handleClear}
          disabled={disabled}
          title="Clear model selection"
          aria-label="Clear model selection"
          className={cn(
            "flex w-9 shrink-0 items-center justify-center border border-l-0 border-zinc-200 bg-white text-zinc-400 transition-colors hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:text-zinc-200",
            compact ? "h-10 rounded-r-md" : "rounded-r-lg",
          )}
        >
          <TbX className="h-4 w-4" />
        </button>
      ) : null}

      {open ? createPortal(
        <div className="fixed inset-0 z-[90]">
          <button
            type="button"
            aria-label="Close model chooser"
            className="absolute inset-0 bg-black/25"
            onClick={() => setOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`Choose ${providerLabel} model`}
            className="absolute inset-y-0 right-0 flex w-full max-w-[540px] flex-col border-l border-zinc-200 bg-zinc-50 shadow-2xl dark:border-zinc-800 dark:bg-black"
          >
            <header className="flex shrink-0 items-start gap-3 border-b border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <ProviderMark provider={provider} label={providerLabel} />
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                  Choose {providerLabel} model
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Search the catalog or pick one of your pinned models.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                title="Close"
                aria-label="Close"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
              >
                <TbX className="h-5 w-5" />
              </button>
            </header>

            <div className="shrink-0 border-b border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="relative">
                <TbSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder={`Search ${providerLabel} models...`}
                  disabled={disabled}
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-sm text-zinc-950 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-400/40 dark:border-zinc-800 dark:bg-black dark:text-zinc-50 dark:focus:border-zinc-600"
                />
              </div>

              {selectedModelId ? (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-black">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">
                      Selected: {selectedTitle}
                    </span>
                    <span className="block truncate text-[11px] text-zinc-500 dark:text-zinc-500">
                      {selectedModelId}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-100"
                  >
                    Clear
                  </button>
                </div>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {pinnedProviderModels.length > 0 ? (
                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Pinned
                    </h3>
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                      {pinnedProviderModels.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {pinnedProviderModels.map((model) => (
                      <ModelRow
                        key={`${model.provider}:${model.modelId}`}
                        model={model}
                        selected={model.modelId === selectedModelId}
                        pinned
                        disabled={disabled}
                        onSelect={() => handleSelect(model)}
                        onTogglePin={() => togglePin(model)}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    {query.trim() ? "Search Results" : "Recommended"}
                  </h3>
                  {loading ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400">
                      <TbLoader2 className="h-3 w-3 animate-spin" />
                      Searching
                    </span>
                  ) : hasFetched ? (
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                      {models.length}
                    </span>
                  ) : null}
                </div>

                {error ? (
                  <div className="flex items-start gap-2 rounded-lg border border-accent-coral/20 bg-accent-coral/10 p-3 text-sm text-accent-coral">
                    <TbAlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                ) : null}

                {loading && models.length === 0 ? (
                  <div className="space-y-2">
                    <LoadingRow />
                    <LoadingRow />
                    <LoadingRow />
                    <LoadingRow />
                  </div>
                ) : null}

                {!loading && hasFetched && models.length === 0 && !error ? (
                  <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                    No models found.
                  </div>
                ) : null}

                {models.length > 0 ? (
                  <div className="space-y-2">
                    {models.map((model) => (
                      <ModelRow
                        key={`${model.provider}:${model.modelId}`}
                        model={model}
                        selected={model.modelId === selectedModelId}
                        pinned={isPinnedModel(pinnedModels, model.provider, model.modelId)}
                        disabled={disabled}
                        onSelect={() => handleSelect(model)}
                        onTogglePin={() => togglePin(model)}
                      />
                    ))}
                  </div>
                ) : null}

                {nextCursor ? (
                  <button
                    type="button"
                    onClick={() => void doSearch(query, nextCursor)}
                    disabled={loading}
                    className="mx-auto flex h-9 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
                  >
                    {loading ? "Loading..." : "Load more"}
                  </button>
                ) : null}
              </section>
            </div>
          </section>
        </div>,
        document.body
      ) : null}
    </div>
  );
}

/** @deprecated Use ProviderModelPicker with provider="replicate" instead */
export function ReplicateModelPicker(props: ReplicateModelPickerProps) {
  return <ProviderModelPicker {...props} provider="replicate" />;
}

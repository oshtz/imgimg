import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  TbAlertCircle,
  TbCheck,
  TbCloudOff,
  TbLoader2,
  TbPin,
  TbPinFilled,
  TbPlus,
  TbSearch,
  TbTrash,
  TbX,
} from "react-icons/tb";
import type { ApiBaseUrl, CompareModel, ProviderStatus } from "../api";
import { searchProviderModels, type DiscoveredModel } from "../client";
import { cn } from "../utils/cn";
import { discoveredToCompareModel } from "./compareModelPickerState";
import {
  getProviderLabel,
  getProviderLogo,
  isPinnedModel,
  summarizeModel,
} from "./modelChooser/modelChooserState";

const ENGINE_LOGOS: Record<string, string> = {
  comfyui: "/comfyui.svg",
  openrouter: "/openrouter.svg",
  replicate: "/replicate.svg",
  fal: "/fal.svg",
  kie: "/kieai.svg",
};

const ENGINE_LABELS: Record<string, string> = {
  comfyui: "ComfyUI",
  openrouter: "OpenRouter",
  replicate: "Replicate",
  fal: "FAL",
  kie: "KIE",
};

const MAX_MODELS = 6;
const MIN_MODELS = 2;

interface CompareModelPickerProps {
  apiBaseUrl: ApiBaseUrl;
  models: CompareModel[];
  modelsLoading: boolean;
  providerStatus: ProviderStatus | null;
  selectedModels: CompareModel[];
  onSelectionChange: (models: CompareModel[]) => void;
  pinnedCatalogModels: DiscoveredModel[];
  onPinModel: (model: DiscoveredModel) => void;
  onUnpinModel: (modelId: string, provider: string) => void;
}

function providerLabel(provider: string) {
  return ENGINE_LABELS[provider] ?? getProviderLabel(provider);
}

function providerLogo(provider: string) {
  return getProviderLogo(provider) ?? ENGINE_LOGOS[provider] ?? null;
}

function ProviderMark({ provider }: { provider: string }) {
  const logo = providerLogo(provider);
  const label = providerLabel(provider);

  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black">
      {logo ? (
        <img src={logo} alt="" className="h-4 w-4 dark:invert" />
      ) : (
        <span className="text-[10px] font-semibold uppercase text-zinc-500">
          {label.slice(0, 2)}
        </span>
      )}
    </span>
  );
}

function CompareOptionRow({
  model,
  selected,
  atMax,
  unavailable,
  onToggle,
  action,
}: {
  model: CompareModel;
  selected: boolean;
  atMax: boolean;
  unavailable: boolean;
  onToggle: () => void;
  action?: ReactNode;
}) {
  const disabled = (atMax && !selected) || (unavailable && !selected);

  return (
    <div
      className={cn(
        "group flex min-h-[62px] items-stretch rounded-lg border transition-colors",
        selected
          ? "border-zinc-400 bg-white ring-1 ring-zinc-400/30 dark:border-zinc-500 dark:bg-zinc-950 dark:ring-zinc-500/30"
          : unavailable
            ? "border-zinc-200 bg-white opacity-60 dark:border-zinc-800 dark:bg-zinc-950"
            : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/50"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-l-lg px-3 py-2 text-left disabled:cursor-not-allowed"
      >
        <ProviderMark provider={model.provider} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium text-zinc-950 dark:text-zinc-50">
              {model.displayName}
            </span>
            {selected ? (
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950">
                <TbCheck className="h-3 w-3" />
              </span>
            ) : null}
            {unavailable ? (
              <TbCloudOff className="h-4 w-4 shrink-0 text-zinc-400" />
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-xs text-zinc-500 dark:text-zinc-400">
            {providerLabel(model.provider)}
            {model.workflowId ? ` / ${model.workflowId}` : ""}
          </span>
          {model.description ? (
            <span className="mt-1 line-clamp-2 text-xs leading-snug text-zinc-500 dark:text-zinc-400">
              {model.description}
            </span>
          ) : null}
        </span>
      </button>
      {action ? (
        <div className="flex w-10 shrink-0 items-center justify-center border-l border-zinc-200 dark:border-zinc-800">
          {action}
        </div>
      ) : null}
    </div>
  );
}

function CatalogResultRow({
  model,
  selected,
  pinned,
  atMax,
  onToggle,
  onTogglePin,
}: {
  model: DiscoveredModel;
  selected: boolean;
  pinned: boolean;
  atMax: boolean;
  onToggle: () => void;
  onTogglePin: () => void;
}) {
  const compareModel = discoveredToCompareModel(model);
  const summary = summarizeModel(model);
  const disabled = atMax && !selected;

  return (
    <div
      className={cn(
        "group flex min-h-[66px] items-stretch rounded-lg border transition-colors",
        selected
          ? "border-zinc-400 bg-white ring-1 ring-zinc-400/30 dark:border-zinc-500 dark:bg-zinc-950 dark:ring-zinc-500/30"
          : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/50"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-l-lg px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
      >
        <ProviderMark provider={model.provider} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium text-zinc-950 dark:text-zinc-50">
              {summary.title}
            </span>
            {selected ? (
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950">
                <TbCheck className="h-3 w-3" />
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-xs text-zinc-500 dark:text-zinc-400">
            {summary.providerLabel} / {model.modelId}
          </span>
          {model.description ? (
            <span className="mt-1 line-clamp-2 text-xs leading-snug text-zinc-500 dark:text-zinc-400">
              {model.description}
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
        title={pinned ? "Unpin model" : "Pin model"}
        aria-label={pinned ? "Unpin model" : "Pin model"}
        className={cn(
          "flex w-10 shrink-0 items-center justify-center rounded-r-lg border-l transition-colors",
          pinned
            ? "border-zinc-200 text-zinc-900 dark:border-zinc-800 dark:text-zinc-100"
            : "border-zinc-200 text-zinc-400 hover:text-zinc-700 dark:border-zinc-800 dark:text-zinc-600 dark:hover:text-zinc-200"
        )}
      >
        {pinned ? <TbPinFilled className="h-4 w-4" /> : <TbPin className="h-4 w-4" />}
      </button>
      <span className="sr-only">{compareModel.workflowId}</span>
    </div>
  );
}

export function CompareModelPicker({
  apiBaseUrl,
  models,
  modelsLoading,
  providerStatus,
  selectedModels,
  onSelectionChange,
  pinnedCatalogModels,
  onPinModel,
  onUnpinModel,
}: CompareModelPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DiscoveredModel[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedIds = useMemo(
    () => new Set(selectedModels.map((model) => model.id)),
    [selectedModels]
  );
  const atMax = selectedModels.length >= MAX_MODELS;

  const isProviderAvailable = useCallback(
    (provider: string) => {
      if (!providerStatus) return false;
      switch (provider) {
        case "comfyui": return providerStatus.comfyui.available;
        case "openrouter": return providerStatus.openrouter.available;
        case "replicate": return providerStatus.replicate.available;
        case "fal": return providerStatus.fal.available;
        case "kie": return providerStatus.kie.available;
        default: return false;
      }
    },
    [providerStatus]
  );

  const toggleModel = useCallback(
    (model: CompareModel) => {
      const isSelected = selectedModels.some((selected) => selected.id === model.id);
      if (isSelected) {
        onSelectionChange(selectedModels.filter((selected) => selected.id !== model.id));
      } else if (selectedModels.length < MAX_MODELS && model.workflowId) {
        onSelectionChange([...selectedModels, model]);
      }
    },
    [onSelectionChange, selectedModels]
  );

  const removeModel = useCallback(
    (modelId: string) => {
      onSelectionChange(selectedModels.filter((model) => model.id !== modelId));
    },
    [onSelectionChange, selectedModels]
  );

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setSearchResults([]);
        return;
      }
      setSearchLoading(true);
      setSearchError(null);
      try {
        const empty = Promise.resolve({ models: [] as DiscoveredModel[], nextCursor: null });
        const [repResult, falResult, orResult] = await Promise.allSettled([
          providerStatus?.replicate?.available
            ? searchProviderModels(apiBaseUrl, "replicate", { q, limit: 6 })
            : empty,
          providerStatus?.fal?.available
            ? searchProviderModels(apiBaseUrl, "fal", { q, limit: 6 })
            : empty,
          providerStatus?.openrouter?.available
            ? searchProviderModels(apiBaseUrl, "openrouter", { q, limit: 6 })
            : empty,
        ]);
        const results: DiscoveredModel[] = [];
        const errors: string[] = [];
        const fmtErr = (e: unknown) =>
          e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
        if (repResult.status === "fulfilled") results.push(...repResult.value.models);
        else if (providerStatus?.replicate?.available) errors.push(`Replicate: ${fmtErr(repResult.reason)}`);
        if (falResult.status === "fulfilled") results.push(...falResult.value.models);
        else if (providerStatus?.fal?.available) errors.push(`FAL: ${fmtErr(falResult.reason)}`);
        if (orResult.status === "fulfilled") results.push(...orResult.value.models);
        else if (providerStatus?.openrouter?.available) errors.push(`OpenRouter: ${fmtErr(orResult.reason)}`);
        setSearchResults(results);
        if (results.length === 0 && errors.length > 0) {
          setSearchError(errors.join("; "));
        }
      } catch (e) {
        setSearchError(e instanceof Error ? e.message : "Search failed");
      } finally {
        setSearchLoading(false);
      }
    },
    [apiBaseUrl, providerStatus]
  );

  useEffect(() => {
    if (!showSearch || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = window.setTimeout(() => doSearch(searchQuery), 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery, showSearch, doSearch]);

  useEffect(() => {
    if (!showSearch) return;
    const timer = window.setTimeout(() => searchInputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [showSearch]);

  const groupedModels = useMemo(
    () =>
      models.reduce<Record<string, CompareModel[]>>((acc, model) => {
        (acc[model.provider] ??= []).push(model);
        return acc;
      }, {}),
    [models]
  );

  const providerOrder = ["openrouter", "replicate", "fal", "kie", "comfyui"];
  const sortedProviders = Object.keys(groupedModels).sort(
    (a, b) => providerOrder.indexOf(a) - providerOrder.indexOf(b)
  );

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Model basket</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {selectedModels.length}/{MAX_MODELS} selected
              {selectedModels.length < MIN_MODELS ? `, choose ${MIN_MODELS - selectedModels.length} more` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowSearch((value) => !value)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-zinc-400/40 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black",
              showSearch
                ? "border-zinc-400 bg-white text-zinc-900 ring-1 ring-zinc-400/30 dark:border-zinc-500 dark:bg-zinc-950 dark:text-zinc-100"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
            )}
          >
            <TbSearch className="h-4 w-4" />
            Catalog
          </button>
        </div>

        {selectedModels.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {selectedModels.map((model) => (
              <div
                key={model.id}
                className="flex min-h-[54px] items-center gap-2 rounded-lg border border-zinc-300 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-950"
              >
                <ProviderMark provider={model.provider} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-950 dark:text-zinc-50">
                    {model.displayName}
                  </span>
                  <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {providerLabel(model.provider)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeModel(model.id)}
                  title="Remove model"
                  aria-label={`Remove ${model.displayName}`}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                >
                  <TbX className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            Choose at least two models or workflows to compare.
          </div>
        )}
      </section>

      {showSearch ? (
        <section className="space-y-3">
          <div className="relative">
            <TbSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              placeholder="Search Replicate, FAL, and OpenRouter models..."
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-sm text-zinc-950 outline-none placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-400/40 dark:border-zinc-800 dark:bg-black dark:text-zinc-50 dark:focus:border-zinc-600"
            />
          </div>

          {searchLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
              <TbLoader2 className="h-4 w-4 animate-spin" />
              Searching catalog...
            </div>
          ) : null}

          {searchError ? (
            <div className="flex items-start gap-2 rounded-lg border border-accent-coral/20 bg-accent-coral/10 p-3 text-sm text-accent-coral">
              <TbAlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {searchError}
            </div>
          ) : null}

          {searchResults.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {searchResults.map((model) => {
                const compareModel = discoveredToCompareModel(model);
                const selected = selectedIds.has(compareModel.id);
                const pinned = isPinnedModel(pinnedCatalogModels, model.provider, model.modelId);
                return (
                  <CatalogResultRow
                    key={compareModel.id}
                    model={model}
                    selected={selected}
                    pinned={pinned}
                    atMax={atMax}
                    onToggle={() => toggleModel(compareModel)}
                    onTogglePin={() => {
                      if (pinned) onUnpinModel(model.modelId, model.provider);
                      else onPinModel(model);
                    }}
                  />
                );
              })}
            </div>
          ) : null}

          {!searchLoading && searchQuery.trim() && searchResults.length === 0 && !searchError ? (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-4 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
              No catalog models found for "{searchQuery}".
            </div>
          ) : null}
        </section>
      ) : null}

      {pinnedCatalogModels.length > 0 ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Pinned catalog
            </h3>
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
              {pinnedCatalogModels.length}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {pinnedCatalogModels.map((model) => {
              const compareModel = discoveredToCompareModel(model);
              const selected = selectedIds.has(compareModel.id);
              return (
                <CatalogResultRow
                  key={compareModel.id}
                  model={model}
                  selected={selected}
                  pinned
                  atMax={atMax}
                  onToggle={() => toggleModel(compareModel)}
                  onTogglePin={() => onUnpinModel(model.modelId, model.provider)}
                />
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Workflows
        </h3>
        {modelsLoading ? (
          <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            <TbLoader2 className="h-4 w-4 animate-spin" />
            Loading workflows...
          </div>
        ) : models.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-4 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            No workflows available. Configure at least one provider in Settings.
          </div>
        ) : (
          <div className="space-y-4">
            {sortedProviders.map((provider) => (
              <div key={provider} className="space-y-2">
                <div className="flex items-center gap-2">
                  <ProviderMark provider={provider} />
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {providerLabel(provider)}
                  </span>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">
                    {groupedModels[provider].length}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  {groupedModels[provider].map((model) => {
                    const selected = selectedIds.has(model.id);
                    const unavailable = !isProviderAvailable(model.provider);
                    return (
                      <CompareOptionRow
                        key={model.id}
                        model={model}
                        selected={selected}
                        atMax={atMax}
                        unavailable={unavailable}
                        onToggle={() => toggleModel(model)}
                        action={
                          selected ? (
                            <button
                              type="button"
                              onClick={() => removeModel(model.id)}
                              title="Remove model"
                              aria-label={`Remove ${model.displayName}`}
                              className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                            >
                              <TbTrash className="h-4 w-4" />
                            </button>
                          ) : (
                            <TbPlus className="h-4 w-4 text-zinc-400" />
                          )
                        }
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

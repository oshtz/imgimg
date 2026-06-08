import { useState, useCallback } from "react";
import { TbSearch, TbPlus, TbLoader2 } from "react-icons/tb";
import {
  searchProviderModels,
  createWorkflowFromModel,
  type ApiBaseUrl,
  type DiscoveredModel,
  type ProviderStatus,
} from "../client";

type ProviderTab = "replicate" | "fal";

interface ModelBrowserProps {
  apiBaseUrl: ApiBaseUrl;
  providerStatus: ProviderStatus | null;
  onWorkflowCreated?: (workflowId: string) => void;
  onClose?: () => void;
}

function ModelCard(props: {
  model: DiscoveredModel;
  onAdd: () => void;
  adding: boolean;
}) {
  const { model, onAdd, adding } = props;
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      {model.thumbnailUrl ? (
        <img
          src={model.thumbnailUrl}
          alt=""
          className="aspect-[3/2] w-full object-cover"
        />
      ) : (
        <div className="flex aspect-[3/2] w-full items-center justify-center bg-zinc-100 dark:bg-zinc-800">
          <span className="text-xs text-zinc-400">{model.provider}</span>
        </div>
      )}
      <div className="flex flex-1 flex-col gap-1 p-2">
        <h4 className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {model.displayName}
        </h4>
        {model.description && (
          <p className="line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
            {model.description}
          </p>
        )}
        {model.owner && (
          <span className="text-[10px] text-zinc-400">{model.owner}</span>
        )}
        <div className="mt-auto pt-2">
          <button
            type="button"
            onClick={onAdd}
            disabled={adding}
            className="flex w-full items-center justify-center gap-1 rounded bg-accent-forest px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-forest/80 disabled:opacity-50"
          >
            {adding ? (
              <TbLoader2 className="h-3 w-3 animate-spin" />
            ) : (
              <TbPlus className="h-3 w-3" />
            )}
            Add to Workflows
          </button>
        </div>
      </div>
    </div>
  );
}

export function ModelBrowser({
  apiBaseUrl,
  providerStatus,
  onWorkflowCreated,
  onClose,
}: ModelBrowserProps) {
  const [activeTab, setActiveTab] = useState<ProviderTab>("replicate");
  const [query, setQuery] = useState("");
  const [models, setModels] = useState<DiscoveredModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [addingModel, setAddingModel] = useState<string | null>(null);

  const hasReplicate = providerStatus?.replicate?.hasApiKey ?? false;
  const hasFal = providerStatus?.fal?.hasApiKey ?? false;

  const search = useCallback(
    async (append = false) => {
      setLoading(true);
      setError(null);
      try {
        const result = await searchProviderModels(apiBaseUrl, activeTab, {
          q: query || undefined,
          limit: 24,
          cursor: append ? nextCursor ?? undefined : undefined,
        });
        setModels((prev) =>
          append ? [...prev, ...result.models] : result.models
        );
        setNextCursor(result.nextCursor);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed");
      } finally {
        setLoading(false);
      }
    },
    [apiBaseUrl, activeTab, query, nextCursor]
  );

  const handleAdd = useCallback(
    async (model: DiscoveredModel) => {
      setAddingModel(model.modelId);
      try {
        const result = await createWorkflowFromModel(
          apiBaseUrl,
          model.provider as "replicate" | "fal",
          model.modelId
        );
        onWorkflowCreated?.(result.workflowId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create workflow");
      } finally {
        setAddingModel(null);
      }
    },
    [apiBaseUrl, onWorkflowCreated]
  );

  const tabs: { id: ProviderTab; label: string; available: boolean }[] = [
    { id: "replicate", label: "Replicate", available: hasReplicate },
    { id: "fal", label: "fal.ai", available: hasFal },
  ];

  const availableTabs = tabs.filter((t) => t.available);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Browse Models
        </h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            Close
          </button>
        )}
      </div>

      {availableTabs.length === 0 && (
        <p className="text-sm text-zinc-500">
          No providers configured. Add a Replicate or fal.ai API key in Admin
          Settings.
        </p>
      )}

      {availableTabs.length > 0 && (
        <>
          {/* Provider tabs */}
          <div className="flex gap-2">
            {availableTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setModels([]);
                  setNextCursor(null);
                }}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "bg-accent-forest text-white"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <TbSearch className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${activeTab === "replicate" ? "Replicate" : "fal.ai"} models...`}
                className="w-full rounded-md border border-zinc-300 bg-white py-1.5 pl-8 pr-3 text-sm text-zinc-900 outline-none focus:border-accent-forest dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-accent-forest px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-forest/80 disabled:opacity-50"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </form>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          {/* Results grid */}
          {models.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {models.map((model) => (
                <ModelCard
                  key={model.modelId}
                  model={model}
                  onAdd={() => void handleAdd(model)}
                  adding={addingModel === model.modelId}
                />
              ))}
            </div>
          )}

          {/* Load more */}
          {nextCursor && (
            <button
              type="button"
              onClick={() => void search(true)}
              disabled={loading}
              className="mx-auto rounded-md bg-zinc-100 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {loading ? "Loading..." : "Load More"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

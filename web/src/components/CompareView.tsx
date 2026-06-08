import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import type { DiscoveredModel } from "../client";
import { usePersistedState } from "../hooks/usePersistedState";
import {
  TbSend,
  TbLoader2,
  TbChevronDown,
  TbChevronRight,
  TbRefresh,
  TbAlertCircle,
  TbPhoto,
  TbX,
} from "react-icons/tb";
import type { ApiBaseUrl, CompareModel, CompareGroup, ProviderStatus } from "../api";
import { getCompareModels, getCompareGroups, createGeneration } from "../client";
import type { Asset, Generation, SavedPrompt } from "../types";
import type { GenerationSseEvent } from "../useGenerationEvents";
import { useGenerationEvents } from "../useGenerationEvents";
import { CompareModelPicker } from "./CompareModelPicker";
import { CompareResultsGrid, type CompareEntry } from "./CompareResultsGrid";
import { PromptVariableForm } from "./PromptVariableForm";
import { extractVariables, replaceVariables } from "../utils/promptVariables";
import { cn } from "../utils/cn";

function getPromptTagContext(value: string, cursor: number) {
  if (cursor < 0) return null;
  const bangIndex = value.lastIndexOf("!", cursor - 1);
  if (bangIndex < 0) return null;
  const prevChar = bangIndex > 0 ? value[bangIndex - 1] : "";
  if (prevChar && /[A-Za-z0-9]/.test(prevChar)) return null;
  const segment = value.slice(bangIndex + 1, cursor);
  if (/[\s,]/.test(segment)) return null;
  return { start: bangIndex, query: segment };
}

type ImageInput = { dataUrl: string; name: string };

const DEFAULT_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"];

type CompareGroupState = {
  groupId: string;
  prompt: string;
  entries: CompareEntry[];
};

interface CompareViewProps {
  apiBaseUrl: ApiBaseUrl;
  providerStatus: ProviderStatus | null;
  history: Generation[];
  assetUrl: (asset: Asset) => string;
  savedPrompts?: SavedPrompt[];
}

export function CompareView({
  apiBaseUrl,
  providerStatus,
  history,
  assetUrl,
  savedPrompts,
}: CompareViewProps) {
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [selectedModels, setSelectedModels] = useState<CompareModel[]>([]);
  const [compareGroup, setCompareGroup] = useState<CompareGroupState | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [imageInput, setImageInput] = useState<ImageInput | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Available models from backend
  const [availableModels, setAvailableModels] = useState<CompareModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);

  // History of compare groups
  const [compareGroups, setCompareGroups] = useState<CompareGroup[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const promptInputRef = useRef<HTMLTextAreaElement>(null);

  // ── Saved prompt (!) autocomplete ──
  const [promptTagOpen, setPromptTagOpen] = useState(false);
  const [promptTagQuery, setPromptTagQuery] = useState("");
  const [promptTagStart, setPromptTagStart] = useState<number | null>(null);
  const [promptTagIndex, setPromptTagIndex] = useState(0);
  const [pendingPromptInsert, setPendingPromptInsert] = useState<SavedPrompt | null>(null);
  const [pendingVariables, setPendingVariables] = useState<string[]>([]);
  const [pendingCursorPos, setPendingCursorPos] = useState<number | null>(null);

  const promptTagMatches = useMemo(() => {
    if (!promptTagOpen || !savedPrompts?.length) return [];
    const q = promptTagQuery.trim().toLowerCase();
    const matches = q.length === 0
      ? savedPrompts
      : savedPrompts.filter((p) => p.name.toLowerCase().includes(q));
    return matches.slice(0, 8);
  }, [promptTagOpen, promptTagQuery, savedPrompts]);

  const updatePromptTagContext = useCallback((value: string, cursor: number | null) => {
    if (!savedPrompts?.length) {
      setPromptTagOpen(false);
      setPromptTagQuery("");
      setPromptTagStart(null);
      return;
    }
    const pos = cursor ?? value.length;
    const ctx = getPromptTagContext(value, pos);
    if (!ctx) {
      setPromptTagOpen(false);
      setPromptTagQuery("");
      setPromptTagStart(null);
      return;
    }
    setPromptTagOpen(true);
    setPromptTagQuery(ctx.query);
    setPromptTagStart(ctx.start);
    setPromptTagIndex(0);
  }, [savedPrompts]);

  const applyPromptTagSelection = useCallback((sp: SavedPrompt) => {
    const start = promptTagStart;
    if (start === null) return;
    const el = promptInputRef.current;
    const cursor = el?.selectionStart ?? prompt.length;

    const vars = extractVariables(sp.text);
    if (vars.length > 0) {
      setPendingPromptInsert(sp);
      setPendingVariables(vars);
      setPendingCursorPos(cursor);
      setPromptTagOpen(false);
      setPromptTagQuery("");
      return;
    }

    const before = prompt.slice(0, start);
    const after = prompt.slice(cursor);
    const insert = sp.text;
    const needsSpace = after.length > 0 && !/^[\s,.;:!?]/.test(after);
    setPrompt(`${before}${insert}${needsSpace ? " " : ""}${after}`);
    setPromptTagOpen(false);
    setPromptTagQuery("");
    setPromptTagStart(null);
    queueMicrotask(() => {
      const target = promptInputRef.current;
      if (!target) return;
      const nextCursor = before.length + insert.length + (needsSpace ? 1 : 0);
      target.focus();
      target.setSelectionRange(nextCursor, nextCursor);
    });
  }, [prompt, promptTagStart]);

  const handleVariableSubmit = useCallback((values: Record<string, string>) => {
    if (!pendingPromptInsert || promptTagStart === null || pendingCursorPos === null) return;
    const before = prompt.slice(0, promptTagStart);
    const after = prompt.slice(pendingCursorPos);
    const insert = replaceVariables(pendingPromptInsert.text, values);
    const needsSpace = after.length > 0 && !/^[\s,.;:!?]/.test(after);
    setPrompt(`${before}${insert}${needsSpace ? " " : ""}${after}`);
    setPendingPromptInsert(null);
    setPendingVariables([]);
    setPendingCursorPos(null);
    setPromptTagStart(null);
    queueMicrotask(() => {
      const target = promptInputRef.current;
      if (!target) return;
      const nextCursor = before.length + insert.length + (needsSpace ? 1 : 0);
      target.focus();
      target.setSelectionRange(nextCursor, nextCursor);
    });
  }, [pendingPromptInsert, promptTagStart, pendingCursorPos, prompt]);

  const handleVariableCancel = useCallback(() => {
    setPendingPromptInsert(null);
    setPendingVariables([]);
    setPendingCursorPos(null);
    setPromptTagStart(null);
    promptInputRef.current?.focus();
  }, []);

  // Pinned catalog models (persisted to localStorage)
  const [pinnedCatalogModels, setPinnedCatalogModels] = usePersistedState<DiscoveredModel[]>(
    "imgimg.pinnedCompareModels.v1", []
  );

  const handlePinModel = useCallback((model: DiscoveredModel) => {
    setPinnedCatalogModels((prev) =>
      prev.some((m) => m.modelId === model.modelId && m.provider === model.provider) ? prev : [...prev, model]
    );
  }, [setPinnedCatalogModels]);

  const handleUnpinModel = useCallback((modelId: string, provider: string) => {
    setPinnedCatalogModels((prev) =>
      prev.filter((m) => !(m.modelId === modelId && m.provider === provider))
    );
  }, [setPinnedCatalogModels]);

  // Fetch available models on mount
  useEffect(() => {
    let cancelled = false;
    setModelsLoading(true);
    getCompareModels(apiBaseUrl)
      .then((result) => {
        if (!cancelled) setAvailableModels(result.models);
      })
      .catch((e) => console.warn("Failed to load compare models:", e))
      .finally(() => { if (!cancelled) setModelsLoading(false); });
    return () => { cancelled = true; };
  }, [apiBaseUrl]);

  // Listen for generation events and update compare group entries.
  useGenerationEvents({
    apiBaseUrl,
    generationId: null,
    enabled: compareGroup !== null,
    onEvent: useCallback(
      (evt: GenerationSseEvent) => {
        setCompareGroup((prev) => {
          if (!prev) return prev;

          if (evt.type === "generation") {
            const genId = evt.data.generationId;
            const entryIdx = prev.entries.findIndex((e) => e.generationId === genId);
            if (entryIdx === -1) return prev;

            const entries = [...prev.entries];
            const entry = { ...entries[entryIdx] };

            if (evt.data.status) {
              entry.status = evt.data.status as CompareEntry["status"];
            }
            if (evt.data.assets) {
              entry.assets = evt.data.assets;
            }
            if (evt.data.error) {
              entry.error = evt.data.error;
            }
            entries[entryIdx] = entry;
            return { ...prev, entries };
          }

          if (evt.type === "job") {
            const genId = evt.data.generationId;
            if (!genId) return prev;
            const entryIdx = prev.entries.findIndex((e) => e.generationId === genId);
            if (entryIdx === -1) return prev;

            const entries = [...prev.entries];
            const entry = { ...entries[entryIdx] };
            if (evt.data.state === "running") entry.status = "running";
            else if (evt.data.state === "queued") entry.status = "queued";
            else if (evt.data.state === "failed") {
              entry.status = "failed";
              entry.error = evt.data.error ?? "Job failed";
            }
            entries[entryIdx] = entry;
            return { ...prev, entries };
          }

          return prev;
        });
      },
      []
    ),
  });

  // Compute intersection of supported aspect ratios
  const availableAspectRatios = (() => {
    if (selectedModels.length === 0) return DEFAULT_ASPECT_RATIOS;
    const modelsWithRestriction = selectedModels.filter((m) => m.supportedAspectRatios && m.supportedAspectRatios.length > 0);
    if (modelsWithRestriction.length === 0) return DEFAULT_ASPECT_RATIOS;

    let intersection = new Set(modelsWithRestriction[0].supportedAspectRatios!);
    for (let i = 1; i < modelsWithRestriction.length; i++) {
      const next = new Set(modelsWithRestriction[i].supportedAspectRatios!);
      intersection = new Set([...intersection].filter((ar) => next.has(ar)));
    }

    if (intersection.size === 0) return ["1:1"];
    return [...intersection];
  })();

  // Reset aspect ratio if current selection isn't available
  useEffect(() => {
    if (!availableAspectRatios.includes(aspectRatio)) {
      setAspectRatio(availableAspectRatios[0]);
    }
  }, [availableAspectRatios, aspectRatio]);

  // Auto-resize textarea when prompt changes (e.g. from saved prompt insertion)
  useEffect(() => {
    const el = promptInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [prompt]);

  const allModelsSupportsImageInput = selectedModels.length >= 2 && selectedModels.every((m) => m.supportsImageInput);

  // Clear image when support is lost
  useEffect(() => {
    if (!allModelsSupportsImageInput) setImageInput(null);
  }, [allModelsSupportsImageInput]);

  const handleImageFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setImageInput({ dataUrl: reader.result as string, name: file.name });
    };
    reader.readAsDataURL(file);
  }, []);

  const handleCompare = useCallback(async () => {
    if (selectedModels.length < 2 || !prompt.trim()) return;

    setIsComparing(true);
    const groupId = crypto.randomUUID();

    const entries: CompareEntry[] = selectedModels.map((model) => ({
      model,
      generationId: null,
      status: "pending",
      assets: [],
      error: null,
    }));

    setCompareGroup({ groupId, prompt: prompt.trim(), entries });

    // Fire generation requests sequentially to avoid SQLite lock contention,
    // then each generation runs asynchronously in the background.
    for (let i = 0; i < selectedModels.length; i++) {
      const model = selectedModels[i];
      try {
          const result = await createGeneration(apiBaseUrl, {
            modelId: model.id,
            prompt: prompt.trim(),
            workflowId: model.workflowId,
            aspectRatio,
            workflowParams: { compare_group_id: groupId },
            replicateModel: model.replicateModel,
            falModel: model.falModel,
            openrouterModel: model.openrouterModel,
            imageDataUrl: imageInput?.dataUrl,
          });

          setCompareGroup((prev) => {
            if (!prev || prev.groupId !== groupId) return prev;
            const updated = [...prev.entries];
            updated[i] = { ...updated[i], generationId: result.generationId, status: "queued" };
            return { ...prev, entries: updated };
          });
        } catch (e) {
          setCompareGroup((prev) => {
            if (!prev || prev.groupId !== groupId) return prev;
            const updated = [...prev.entries];
            updated[i] = {
              ...updated[i],
              status: "failed",
              error: e instanceof Error ? e.message : typeof e === "string" ? e : (e && typeof e === "object" && "error" in e) ? String((e as any).error) : "Request failed",
            };
            return { ...prev, entries: updated };
          });
        }
    }

    setIsComparing(false);
  }, [selectedModels, prompt, aspectRatio, apiBaseUrl, imageInput]);

  // Load compare history
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const result = await getCompareGroups(apiBaseUrl);
      setCompareGroups(result.groups);
    } catch (e) {
      console.warn("Failed to load compare history:", e);
    } finally {
      setHistoryLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    if (historyExpanded && compareGroups.length === 0) {
      loadHistory();
    }
  }, [historyExpanded, compareGroups.length, loadHistory]);

  const canCompare = selectedModels.length >= 2 && prompt.trim().length > 0 && !isComparing;

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pr-2">
      {/* Prompt + controls — single compact row */}
      <div className="relative flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800/80 dark:bg-zinc-950">
        <textarea
          ref={promptInputRef}
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = e.target.scrollHeight + "px";
            updatePromptTagContext(e.target.value, e.target.selectionStart);
          }}
          onKeyDown={(e) => {
            if (promptTagOpen) {
              if (e.key === "Escape") {
                setPromptTagOpen(false);
                return;
              }
              if (promptTagMatches.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setPromptTagIndex((prev) => (prev + 1) % promptTagMatches.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setPromptTagIndex((prev) => (prev - 1 + promptTagMatches.length) % promptTagMatches.length);
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  const selected = promptTagMatches[promptTagIndex];
                  if (selected) applyPromptTagSelection(selected);
                  return;
                }
              }
            }
            if (e.key === "Enter" && !e.shiftKey && canCompare) {
              e.preventDefault();
              handleCompare();
            }
          }}
          onSelect={(e) => {
            updatePromptTagContext(e.currentTarget.value, e.currentTarget.selectionStart);
          }}
          onClick={(e) => {
            updatePromptTagContext(e.currentTarget.value, e.currentTarget.selectionStart);
          }}
          onBlur={() => {
            setPromptTagOpen(false);
          }}
          placeholder="Prompt to compare..."
          rows={1}
          className="w-full resize-none overflow-hidden bg-transparent text-sm text-zinc-900 placeholder:text-zinc-500 focus:outline-none dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="shrink-0 rounded border border-zinc-200 px-1.5 py-0.5 text-[11px] text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
            onClick={() => {
              const idx = availableAspectRatios.indexOf(aspectRatio);
              setAspectRatio(availableAspectRatios[(idx + 1) % availableAspectRatios.length]);
            }}
          >
            {aspectRatio}
          </button>
          {allModelsSupportsImageInput && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageFile(file);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                className="shrink-0 rounded border border-zinc-200 p-1 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
                onClick={() => fileInputRef.current?.click()}
                title="Add image"
              >
                <TbPhoto className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {imageInput && (
            <div className="relative shrink-0">
              <img
                src={imageInput.dataUrl}
                alt={imageInput.name}
                className="h-8 w-8 rounded border border-zinc-200 object-cover dark:border-zinc-700"
              />
              <button
                type="button"
                className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                onClick={() => setImageInput(null)}
              >
                <TbX className="h-2.5 w-2.5" />
              </button>
            </div>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleCompare}
            disabled={!canCompare}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
          >
            {isComparing ? (
              <TbLoader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <TbSend className="h-3.5 w-3.5" />
            )}
            Compare
          </button>
        </div>

        {/* Saved prompt (!) autocomplete dropdown */}
        {promptTagOpen && (
          <div className="absolute left-0 top-full z-40 mt-1 w-[20rem] overflow-hidden rounded-xl border shadow-lg border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black">
            <div className="border-b border-zinc-200 px-3 py-2 text-[11px] uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              Insert saved prompt
            </div>
            <div className="max-h-48 overflow-auto py-1">
              {promptTagMatches.length === 0 ? (
                <div className="px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400">No matches.</div>
              ) : null}
              {promptTagMatches.map((sp, index) => (
                <button
                  key={sp.id}
                  type="button"
                  className={cn(
                    "flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm",
                    "hover:bg-zinc-50 dark:hover:bg-zinc-950",
                    index === promptTagIndex ? "bg-zinc-100 dark:bg-zinc-950" : ""
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyPromptTagSelection(sp);
                  }}
                >
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">!{sp.name}</span>
                  <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">{sp.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Prompt variable form */}
        {pendingPromptInsert && pendingVariables.length > 0 && (
          <PromptVariableForm
            variables={pendingVariables}
            onSubmit={handleVariableSubmit}
            onCancel={handleVariableCancel}
          />
        )}
      </div>

      {/* Model picker */}
      <CompareModelPicker
        apiBaseUrl={apiBaseUrl}
        models={availableModels}
        modelsLoading={modelsLoading}
        providerStatus={providerStatus}
        selectedModels={selectedModels}
        onSelectionChange={setSelectedModels}
        pinnedCatalogModels={pinnedCatalogModels}
        onPinModel={handlePinModel}
        onUnpinModel={handleUnpinModel}
      />

      {/* Active comparison results */}
      {compareGroup && (
        <CompareResultsGrid
          entries={compareGroup.entries}
          prompt={compareGroup.prompt}
          assetUrl={assetUrl}
        />
      )}

      {/* Compare history */}
      <div className="border-t border-zinc-200 pt-2 dark:border-zinc-800">
        <div className="flex w-full items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          <button
            type="button"
            onClick={() => setHistoryExpanded(!historyExpanded)}
            className="flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            {historyExpanded ? (
              <TbChevronDown className="h-3.5 w-3.5" />
            ) : (
              <TbChevronRight className="h-3.5 w-3.5" />
            )}
            History
          </button>
          {historyExpanded && (
            <button
              type="button"
              onClick={() => loadHistory()}
              className="ml-auto rounded p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              title="Refresh"
            >
              <TbRefresh className={cn("h-3 w-3", historyLoading && "animate-spin")} />
            </button>
          )}
        </div>

        {historyExpanded && (
          <div className="mt-2 space-y-1.5">
            {historyLoading && compareGroups.length === 0 ? (
              <div className="flex items-center justify-center py-4 text-zinc-400">
                <TbLoader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="ml-1.5 text-[11px]">Loading...</span>
              </div>
            ) : compareGroups.length === 0 ? (
              <p className="py-4 text-center text-[11px] text-zinc-400">
                No comparisons yet.
              </p>
            ) : (
              compareGroups.map((group) => (
                <div
                  key={group.groupId}
                  className="rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="line-clamp-1 text-[11px] font-medium text-zinc-800 dark:text-zinc-200">
                      {group.prompt}
                    </p>
                    <span className="shrink-0 text-[10px] text-zinc-400">
                      {new Date(group.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {/* Show images from history entries */}
                  {group.entries.some((e) => e.assets.length > 0) && (
                    <div className="grid grid-cols-4 gap-1">
                      {group.entries.map((entry) => {
                        const img = entry.assets.find(
                          (a) => a.type !== "video" && a.type !== "audio" && a.type !== "preview"
                        );
                        return img ? (
                          <img
                            key={entry.generationId}
                            src={assetUrl(img)}
                            alt=""
                            className="aspect-square rounded object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div
                            key={entry.generationId}
                            className={cn(
                              "flex aspect-square items-center justify-center rounded bg-zinc-100 dark:bg-zinc-800",
                              entry.status === "failed" ? "text-accent-coral" : "text-zinc-300 dark:text-zinc-600"
                            )}
                          >
                            {entry.status === "failed" ? (
                              <TbAlertCircle className="h-3 w-3" />
                            ) : (
                              <span className="text-[10px]">—</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

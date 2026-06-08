import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import {
  TbExternalLink,
  TbHistory,
  TbLayoutSidebarLeftCollapse,
  TbLayoutSidebarLeftExpand,
  TbLayoutSidebarRightCollapse,
  TbLayoutSidebarRightExpand,
  TbLink,
  TbLinkOff,
  TbLoader2,
  TbMessageCircle,
  TbPaperclip,
  TbPhoto,
  TbPlus,
  TbSend,
  TbSwitchHorizontal,
  TbTrash,
  TbX,
} from "react-icons/tb";
import { createGeneration, type ApiBaseUrl, type DiscoveredModel, type WorkflowSummary } from "../client";
import { ProviderModelPicker } from "../components/ReplicateModelPicker";
import type { Asset, Generation } from "../types";
import { usePersistedState, usePersistedString } from "../hooks/usePersistedState";
import { cn } from "../utils/cn";
import { extractError } from "../utils/extractError";
import type { RegisterGenerationInput } from "../audioDesk/AudioDesk";
import {
  addIterateTurn,
  createIterateThread,
  findLatestThreadImage,
  getIterateWorkflowOptions,
  pickFirstImageFile,
  pickImageAsset,
  resolveTurnGeneration,
  type IterateThread,
} from "./iterateState";

type ImageAttachment = {
  dataUrl: string;
  name: string;
};

type IterateWorkspaceProps = {
  apiBaseUrl: ApiBaseUrl;
  workflows: WorkflowSummary[];
  history: Generation[];
  enabledProviders: Record<string, boolean>;
  assetUrl: (asset: Asset) => string;
  onRegisterGeneration: (params: RegisterGenerationInput) => void;
  onOpenAsset: (generation: Generation, asset: Asset) => void;
};

const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"];
const controlClassName =
  "h-10 rounded-md border-0 bg-zinc-100 px-3 text-sm font-medium text-zinc-900 outline-none transition focus:ring-2 focus:ring-zinc-400/30 dark:bg-zinc-900 dark:text-zinc-100";
const secondaryButtonClassName =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-md border-0 bg-zinc-100 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800";
const threadIconButtonClassName =
  "flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 shadow-sm transition hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-800 dark:bg-black dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-100";

type ThreadSidebarSide = "left" | "right";

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

async function fetchUrlAsDataUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to load chained image");
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read chained image"));
    reader.readAsDataURL(blob);
  });
}

function statusTone(status: Generation["status"] | "pending") {
  switch (status) {
    case "succeeded":
      return "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950";
    case "failed":
      return "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100";
    case "running":
      return "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-950";
    case "queued":
    case "pending":
    default:
      return "text-zinc-700 bg-zinc-500/10 dark:text-zinc-300";
  }
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function ThreadList(props: {
  threads: IterateThread[];
  activeThreadId: string;
  collapsed: boolean;
  side: ThreadSidebarSide;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onToggleCollapsed: () => void;
  onToggleSide: () => void;
}) {
  const CollapseIcon = props.collapsed
    ? props.side === "left" ? TbLayoutSidebarLeftExpand : TbLayoutSidebarRightExpand
    : props.side === "left" ? TbLayoutSidebarLeftCollapse : TbLayoutSidebarRightCollapse;
  const oppositeSide = props.side === "left" ? "right" : "left";

  return (
    <aside
      className={cn(
        "flex min-h-0 w-full shrink-0 flex-col border-b border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-950/70 lg:border-b-0",
        props.collapsed ? "lg:w-14" : "pb-3 lg:w-72 lg:pb-0",
        props.side === "left" ? "lg:border-r" : "lg:border-l",
      )}
      aria-label="Threads"
    >
      <div
        className={cn(
          "flex items-center gap-2",
          props.collapsed
            ? "justify-between px-3 py-2 lg:flex-col lg:justify-start lg:px-2 lg:py-3"
            : "justify-between px-3 pb-3 pt-1 lg:px-4 lg:pt-3",
        )}
      >
        {props.collapsed ? (
          <button
            type="button"
            onClick={props.onToggleCollapsed}
            className={threadIconButtonClassName}
            title="Expand threads sidebar"
            aria-label="Expand threads sidebar"
            aria-expanded={false}
          >
            <CollapseIcon className="h-4 w-4" />
          </button>
        ) : (
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Threads</div>
            <div className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">{props.threads.length} saved locally</div>
          </div>
        )}
        <div className={cn("flex items-center gap-1.5", props.collapsed ? "lg:flex-col" : "")}>
          <button
            type="button"
            onClick={props.onToggleSide}
            className={threadIconButtonClassName}
            title={`Move threads sidebar to the ${oppositeSide}`}
            aria-label={`Move threads sidebar to the ${oppositeSide}`}
          >
            <TbSwitchHorizontal className="h-4 w-4" />
          </button>
          {!props.collapsed ? (
            <button
              type="button"
              onClick={props.onToggleCollapsed}
              className={threadIconButtonClassName}
              title="Collapse threads sidebar"
              aria-label="Collapse threads sidebar"
              aria-expanded={true}
            >
              <CollapseIcon className="h-4 w-4" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={props.onNew}
            className={threadIconButtonClassName}
            title="New thread"
            aria-label="New thread"
          >
            <TbPlus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!props.collapsed ? (
        <div className="flex gap-2 overflow-x-auto px-3 lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:px-4">
          {props.threads.length === 0 ? (
            <div className="w-full rounded-lg border border-dashed border-zinc-300 bg-white/70 px-3 py-8 text-center text-sm text-zinc-400 dark:border-zinc-800 dark:bg-black/30">
              No threads yet
            </div>
          ) : props.threads.map((thread) => {
            const active = thread.id === props.activeThreadId;
            const lastPrompt = thread.turns.at(-1)?.prompt ?? "Empty thread";
            const updatedAt = formatShortDate(thread.updatedAt);
            return (
              <div key={thread.id} className="group/thread relative min-w-[240px] lg:min-w-0">
                <button
                  type="button"
                  onClick={() => props.onSelect(thread.id)}
                  className={cn(
                    "flex w-full flex-col rounded-lg border px-3 py-3 text-left shadow-sm transition",
                    active
                      ? "border-zinc-400 bg-white text-zinc-950 ring-2 ring-zinc-400/10 dark:border-zinc-500 dark:bg-black dark:text-zinc-50"
                      : "border-transparent bg-white/60 text-zinc-600 hover:border-zinc-200 hover:bg-white dark:bg-black/30 dark:text-zinc-400 dark:hover:border-zinc-800 dark:hover:bg-black/70",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", active ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-300 dark:bg-zinc-700")} />
                    <span className="truncate text-sm font-semibold">{thread.title}</span>
                  </span>
                  <span className="mt-2 line-clamp-2 min-h-[2rem] text-xs leading-4 text-zinc-500 dark:text-zinc-400">{lastPrompt}</span>
                  <span className="mt-2 flex items-center justify-between gap-2 text-[11px] text-zinc-400 dark:text-zinc-500">
                    <span>{thread.turns.length} turn{thread.turns.length === 1 ? "" : "s"}</span>
                    {updatedAt ? <span>{updatedAt}</span> : null}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => props.onDelete(thread.id)}
                  className="absolute right-2 top-2 rounded p-1 text-zinc-300 opacity-0 transition hover:bg-zinc-100 hover:text-zinc-900 group-hover/thread:opacity-100 dark:text-zinc-600 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                  title="Delete thread"
                  aria-label="Delete thread"
                >
                  <TbTrash className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </aside>
  );
}

function TurnView(props: {
  thread: IterateThread;
  generation: Generation | null;
  turnIndex: number;
  workflowLabel: string;
  assetUrl: (asset: Asset) => string;
  onOpenAsset: (generation: Generation, asset: Asset) => void;
}) {
  const turn = props.thread.turns[props.turnIndex];
  const imageAsset = props.generation ? pickImageAsset(props.generation) : null;
  const status = props.generation?.status ?? (turn.generationId ? "queued" : "pending");
  const error = props.generation?.error;
  const createdAt = formatShortDate(turn.createdAt);

  return (
    <article className="relative grid gap-3 border-b border-zinc-200/80 py-4 pl-8 last:border-b-0 dark:border-zinc-800/80 lg:grid-cols-[minmax(220px,0.78fr)_minmax(300px,1fr)] lg:gap-4">
      <span className="absolute bottom-4 left-4 top-12 w-px bg-zinc-200 dark:bg-zinc-800" />
      <div className="absolute left-1 top-5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-zinc-200 bg-white text-[11px] font-semibold text-zinc-500 shadow-sm dark:border-zinc-800 dark:bg-black dark:text-zinc-400">
          {props.turnIndex + 1}
        </span>
      </div>

      <div className="min-w-0 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-black">
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", statusTone(status))}>{status}</span>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            {props.workflowLabel}
          </span>
          {createdAt ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              <TbHistory className="h-3 w-3" />
              {createdAt}
            </span>
          ) : null}
          {turn.sourceAssetId ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              <TbLink className="h-3 w-3" />
              chained
            </span>
          ) : null}
          {turn.attachedImageName ? (
            <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              <TbPaperclip className="h-3 w-3 shrink-0" />
              <span className="max-w-[180px] truncate">{turn.attachedImageName}</span>
            </span>
          ) : null}
        </div>
        <div className="whitespace-pre-wrap rounded-lg bg-zinc-50 px-3 py-2.5 text-sm leading-6 text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
          {turn.prompt}
        </div>
        {error ? (
          <div className="mt-3 rounded-lg border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            {error}
          </div>
        ) : null}
      </div>

      <div className="min-h-[210px] min-w-0">
        {imageAsset && props.generation ? (
          <div className="group/result relative flex min-h-[210px] overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <button
              type="button"
              onClick={() => props.onOpenAsset(props.generation!, imageAsset)}
              className="flex w-full items-center justify-center bg-[linear-gradient(135deg,rgba(244,244,245,0.92),rgba(228,228,231,0.32))] p-2 dark:bg-[linear-gradient(135deg,rgba(39,39,42,0.72),rgba(9,9,11,0.82))]"
            >
              <img
                src={props.assetUrl(imageAsset)}
                alt=""
                className="max-h-[420px] w-full rounded object-contain shadow-sm"
              />
            </button>
            <button
              type="button"
              onClick={() => props.onOpenAsset(props.generation!, imageAsset)}
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-black/70 text-white opacity-0 shadow-lg backdrop-blur transition group-hover/result:opacity-100 focus:opacity-100"
              title="Open details"
              aria-label="Open details"
            >
              <TbExternalLink className="h-4 w-4" />
            </button>
          </div>
        ) : status === "failed" ? (
          <div className="flex h-full min-h-[210px] items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            Generation failed
          </div>
        ) : (
          <div className="flex h-full min-h-[210px] items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50 text-sm text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950">
            <span className="inline-flex items-center rounded-full bg-white px-3 py-1.5 shadow-sm dark:bg-black">
              <TbLoader2 className="mr-2 h-4 w-4 animate-spin text-zinc-500" />
              {status === "running" ? "Generating" : "Queued"}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}

export function IterateWorkspace(props: IterateWorkspaceProps) {
  const [threads, setThreads] = usePersistedState<IterateThread[]>("imgimg.iterate.threads.v1", []);
  const [activeThreadId, setActiveThreadId] = usePersistedString("imgimg.iterate.activeThread.v1", "");
  const [selectedWorkflowId, setSelectedWorkflowId] = usePersistedString("imgimg.iterate.workflow.v1", "");
  const [aspectRatio, setAspectRatio] = usePersistedString("imgimg.iterate.aspectRatio.v1", "1:1");
  const [prompt, setPrompt] = usePersistedString("imgimg.iterate.prompt.v1", "");
  const [chainLatest, setChainLatest] = usePersistedState("imgimg.iterate.chainLatest.v1", true);
  const [threadSidebarCollapsed, setThreadSidebarCollapsed] = usePersistedState("imgimg.iterate.threadSidebarCollapsed.v1", false);
  const [threadSidebarSideSetting, setThreadSidebarSideSetting] = usePersistedString("imgimg.iterate.threadSidebarSide.v1", "left");
  const [dynamicModelsByWorkflow, setDynamicModelsByWorkflow] = usePersistedState<Record<string, string>>(
    "imgimg.iterate.dynamicModels.v1",
    {},
  );
  const [pinnedModelsByKey, setPinnedModelsByKey] = usePersistedState<Record<string, DiscoveredModel[]>>(
    "imgimg.iterate.pinnedModels.v1",
    {},
  );
  const [attachment, setAttachment] = useState<ImageAttachment | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const workflowOptions = useMemo(
    () => getIterateWorkflowOptions(props.workflows, props.enabledProviders),
    [props.enabledProviders, props.workflows],
  );

  useEffect(() => {
    if (selectedWorkflowId && workflowOptions.some((workflow) => workflow.id === selectedWorkflowId)) return;
    setSelectedWorkflowId(workflowOptions[0]?.id ?? "");
  }, [selectedWorkflowId, setSelectedWorkflowId, workflowOptions]);

  useEffect(() => {
    if (activeThreadId && threads.some((thread) => thread.id === activeThreadId)) return;
    setActiveThreadId(threads[0]?.id ?? "");
  }, [activeThreadId, setActiveThreadId, threads]);

  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? null;
  const selectedWorkflow = workflowOptions.find((workflow) => workflow.id === selectedWorkflowId) ?? workflowOptions[0] ?? null;
  const threadSidebarSide: ThreadSidebarSide = threadSidebarSideSetting === "right" ? "right" : "left";
  const workflowLabelById = useMemo(
    () => new Map(workflowOptions.map((workflow) => [workflow.id, workflow.label])),
    [workflowOptions],
  );
  const selectedDynamicModelId = selectedWorkflow ? dynamicModelsByWorkflow[selectedWorkflow.id] ?? null : null;
  const dynamicProvider = selectedWorkflow?.engine === "fal" || selectedWorkflow?.engine === "openrouter"
    ? selectedWorkflow.engine
    : "replicate";
  const pinnedKey = `${dynamicProvider}:image`;
  const pinnedModels = pinnedModelsByKey[pinnedKey] ?? [];
  const latestThreadImage = activeThread ? findLatestThreadImage(activeThread, props.history) : null;
  const canAttachLatest = Boolean(latestThreadImage && selectedWorkflow?.supportsImageInput);
  const chainLatestActive = chainLatest && canAttachLatest;
  const chainLatestDisabledReason = selectedWorkflow?.supportsImageInput
    ? "No latest image to chain"
    : "This workflow does not accept image input";
  const hasInputImage = Boolean(attachment || chainLatestActive);
  const needsImage = Boolean(selectedWorkflow?.requiresImageInput && !hasInputImage);
  const canGenerate = Boolean(selectedWorkflow && prompt.trim())
    && !submitting
    && !needsImage
    && (!selectedWorkflow?.dynamicModel || Boolean(selectedDynamicModelId));

  function upsertThread(thread: IterateThread) {
    setThreads((prev) => [thread, ...prev.filter((candidate) => candidate.id !== thread.id)]);
    setActiveThreadId(thread.id);
  }

  async function handleImageFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    const dataUrl = await fileToDataUrl(file);
    setAttachment({ dataUrl, name: file.name });
  }

  async function handlePasteImage(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (!selectedWorkflow?.supportsImageInput) return;

    const clipboardFiles = Array.from(event.clipboardData.files);
    const itemFiles = Array.from(event.clipboardData.items)
      .map((item) => item.kind === "file" ? item.getAsFile() : null)
      .filter((file): file is File => Boolean(file));
    const imageFile = pickFirstImageFile([...clipboardFiles, ...itemFiles]);
    if (!imageFile) return;

    event.preventDefault();
    setError(null);
    await handleImageFile(imageFile);
  }

  async function handleGenerate() {
    if (!selectedWorkflow || !prompt.trim() || submitting) return;
    if (selectedWorkflow.dynamicModel && !selectedDynamicModelId) {
      setError("Select an image model first.");
      return;
    }
    if (needsImage) {
      setError("Add an image or use a workflow that can start from text.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      let sourceAssetId: string | null = null;
      let imageDataUrl: string | undefined;

      if (attachment) {
        imageDataUrl = attachment.dataUrl;
      } else if (chainLatestActive && latestThreadImage) {
        sourceAssetId = latestThreadImage.asset.id;
        imageDataUrl = await fetchUrlAsDataUrl(props.assetUrl(latestThreadImage.asset));
      }

      const result = await createGeneration(props.apiBaseUrl, {
        modelId: "",
        prompt: prompt.trim(),
        workflowId: selectedWorkflow.id,
        imageDataUrl: selectedWorkflow.supportsImageInput ? imageDataUrl : undefined,
        aspectRatio: selectedWorkflow.ui.aspectRatio ? aspectRatio : undefined,
        batchSize: 1,
        replicateModel: selectedWorkflow.dynamicModel && selectedWorkflow.engine === "replicate" ? selectedDynamicModelId ?? undefined : undefined,
        falModel: selectedWorkflow.dynamicModel && selectedWorkflow.engine === "fal" ? selectedDynamicModelId ?? undefined : undefined,
        openrouterModel: selectedWorkflow.dynamicModel && selectedWorkflow.engine === "openrouter" ? selectedDynamicModelId ?? undefined : undefined,
      });

      const baseThread = activeThread ?? createIterateThread(prompt.trim());
      const nextThread = addIterateTurn(baseThread, {
        prompt: prompt.trim(),
        workflowId: selectedWorkflow.id,
        generationId: result.generationId,
        sourceAssetId,
        attachedImageName: attachment?.name ?? null,
        providerModelId: selectedDynamicModelId,
      });
      upsertThread(nextThread);
      props.onRegisterGeneration({
        generationId: result.generationId,
        jobId: result.jobId,
        workflowId: selectedWorkflow.id,
        modelId: "",
        prompt: prompt.trim(),
        queuePosition: result.queuePosition,
        imageInputUrl: imageDataUrl ?? null,
      });
      setPrompt("");
      setAttachment(null);
    } catch (err) {
      setError(extractError(err, "Iterate generation failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden pt-8 lg:pt-0">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-black">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Iterate</h1>
            {activeThread ? (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                {activeThread.turns.length} turn{activeThread.turns.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
          <div className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
            {activeThread ? activeThread.title : `${threads.length} local thread${threads.length === 1 ? "" : "s"}`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            const thread = createIterateThread("Untitled thread");
            upsertThread(thread);
          }}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-black dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
        >
          <TbPlus className="h-4 w-4" />
          New thread
        </button>
      </div>

      <div className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-black lg:flex-row",
        threadSidebarSide === "right" ? "lg:flex-row-reverse" : "",
      )}>
        <ThreadList
          threads={threads}
          activeThreadId={activeThreadId}
          collapsed={threadSidebarCollapsed}
          side={threadSidebarSide}
          onSelect={setActiveThreadId}
          onNew={() => {
            const thread = createIterateThread("Untitled thread");
            upsertThread(thread);
          }}
          onDelete={(id) => {
            setThreads((prev) => prev.filter((thread) => thread.id !== id));
            if (activeThreadId === id) setActiveThreadId("");
          }}
          onToggleCollapsed={() => setThreadSidebarCollapsed((value) => !value)}
          onToggleSide={() => setThreadSidebarSideSetting(threadSidebarSide === "left" ? "right" : "left")}
        />

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 lg:px-5 lg:py-4">
            {!activeThread || activeThread.turns.length === 0 ? (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-zinc-300 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-500">
                  <TbMessageCircle className="h-7 w-7" />
                </div>
                <div className="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">No turns yet</div>
                <div className="mt-1 max-w-sm text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                  Waiting for the first refinement.
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-6xl">
                {activeThread.turns.map((turn, index) => (
                  <TurnView
                    key={turn.id}
                    thread={activeThread}
                    generation={resolveTurnGeneration(turn, props.history)}
                    turnIndex={index}
                    workflowLabel={workflowLabelById.get(turn.workflowId) ?? turn.workflowId}
                    assetUrl={props.assetUrl}
                    onOpenAsset={props.onOpenAsset}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="bg-zinc-50/60 p-3 dark:bg-zinc-950/50">
            <div className="rounded-lg bg-white p-2 dark:bg-black">
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="iterate-workflow">Workflow</label>
                <select
                  id="iterate-workflow"
                  value={selectedWorkflow?.id ?? ""}
                  onChange={(event) => setSelectedWorkflowId(event.currentTarget.value)}
                  className={cn(controlClassName, "min-w-[172px]")}
                >
                  {workflowOptions.length === 0 ? <option value="">No image workflows</option> : null}
                  {workflowOptions.map((workflow) => (
                    <option key={workflow.id} value={workflow.id}>{workflow.label}</option>
                  ))}
                </select>
                {selectedWorkflow?.ui.aspectRatio ? (
                  <select
                    value={aspectRatio}
                    onChange={(event) => setAspectRatio(event.currentTarget.value)}
                    className={cn(controlClassName, "w-[72px]")}
                    aria-label="Aspect ratio"
                  >
                    {ASPECT_RATIOS.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
                  </select>
                ) : null}
                {selectedWorkflow?.dynamicModel ? (
                  <div className="min-w-[220px] [&>div]:!min-w-[220px] [&_button]:!border-0 [&_button]:!bg-zinc-100 [&_button]:!shadow-none dark:[&_button]:!bg-zinc-900">
                    <ProviderModelPicker
                      apiBaseUrl={props.apiBaseUrl}
                      provider={dynamicProvider}
                      selectedModelId={selectedDynamicModelId}
                      compact
                      onSelect={(modelId) => {
                        setDynamicModelsByWorkflow((prev) => ({ ...prev, [selectedWorkflow.id]: modelId }));
                      }}
                      onClear={() => {
                        setDynamicModelsByWorkflow((prev) => {
                          const next = { ...prev };
                          delete next[selectedWorkflow.id];
                          return next;
                        });
                      }}
                      assetType="image"
                      pinnedModels={pinnedModels}
                      onPin={(model) => {
                        setPinnedModelsByKey((prev) => ({
                          ...prev,
                          [pinnedKey]: [...(prev[pinnedKey] ?? []).filter((item) => item.modelId !== model.modelId), model],
                        }));
                      }}
                      onUnpin={(modelId) => {
                        setPinnedModelsByKey((prev) => ({
                          ...prev,
                          [pinnedKey]: (prev[pinnedKey] ?? []).filter((model) => model.modelId !== modelId),
                        }));
                      }}
                    />
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => setChainLatest((value) => !value)}
                  disabled={!canAttachLatest}
                  aria-pressed={chainLatestActive}
                  title={canAttachLatest ? "Use latest image as input" : chainLatestDisabledReason}
                  className={cn(
                    secondaryButtonClassName,
                    "min-w-[126px]",
                    chainLatestActive
                      ? "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-600"
                      : "",
                  )}
                >
                  {chainLatestActive ? <TbLink className="h-4 w-4" /> : <TbLinkOff className="h-4 w-4" />}
                  Chain latest
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void handleImageFile(file);
                    event.currentTarget.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!selectedWorkflow?.supportsImageInput}
                  className={cn(secondaryButtonClassName, "min-w-[92px]")}
                >
                  <TbPaperclip className="h-4 w-4" />
                  Image
                </button>
              </div>

              {attachment ? (
                <div className="mt-2 flex items-start gap-2 rounded-md bg-zinc-50 p-2 dark:bg-zinc-950">
                  <div className="relative shrink-0">
                    <img src={attachment.dataUrl} alt="Input image" className="h-16 w-16 rounded-md object-cover" />
                    <button
                      type="button"
                      onClick={() => setAttachment(null)}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-zinc-600 shadow-sm ring-1 ring-zinc-300 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700 dark:hover:bg-zinc-700"
                      aria-label="Remove image"
                    >
                      <TbX className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="min-w-0 pt-1">
                    <div className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-300">{attachment.name}</div>
                    <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-500">Image input for this turn</div>
                  </div>
                </div>
              ) : null}

              <div className="relative mt-2">
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.currentTarget.value)}
                  onPaste={(event) => {
                    void handlePasteImage(event);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault();
                      void handleGenerate();
                    }
                  }}
                  placeholder="Describe the next change..."
                  rows={3}
                  className="min-h-[112px] w-full resize-none bg-transparent px-3 py-2.5 pb-12 pr-12 text-sm leading-6 text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                />
                <button
                  type="button"
                  onClick={() => void handleGenerate()}
                  disabled={!canGenerate}
                  className="absolute bottom-2 right-2 inline-flex h-9 w-9 items-center justify-center rounded-md bg-zinc-900 text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
                  title="Send"
                  aria-label="Send"
                >
                  {submitting ? <TbLoader2 className="h-4 w-4 animate-spin" /> : <TbSend className="h-4 w-4" />}
                </button>
              </div>

              {attachment || chainLatestActive ? (
                <div className="mt-2 min-w-0 text-xs text-zinc-500 dark:text-zinc-500">
                  {attachment ? (
                    <span>Attached image will be used for this turn.</span>
                  ) : chainLatestActive ? (
                    <span>Chaining from {latestThreadImage?.generation.id}.</span>
                  ) : null}
                </div>
              ) : null}

              {error || needsImage ? (
                <div className="mt-2 rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                  {error ?? "This workflow needs an input image."}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

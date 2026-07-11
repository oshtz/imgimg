import { useEffect, useMemo, useRef, useState } from "react";
import {
  TbCircleDot,
  TbClock,
  TbDownload,
  TbExternalLink,
  TbHeadphones,
  TbLoader2,
  TbMicrophone2,
  TbMusic,
  TbPlaylist,
  TbPlayerPause,
  TbPlayerPlay,
  TbRepeat,
  TbSearch,
  TbSparkles,
  TbTag,
  TbVolume2,
  TbWaveSine,
  TbX,
} from "react-icons/tb";
import { createGeneration, type ApiBaseUrl, type DiscoveredModel, type WorkflowSummary } from "../client";
import type { Asset, Generation } from "../types";
import { ProviderModelPicker } from "../components/ReplicateModelPicker";
import { usePersistedState, usePersistedString } from "../hooks/usePersistedState";
import { useDurableWorkspaceState } from "../hooks/useDurableWorkspaceState";
import { cn } from "../utils/cn";
import { extractError } from "../utils/extractError";
import {
  buildAudioItems,
  downsampleWaveform,
  filterAudioItems,
  isAudioWorkflowVisible,
  listAudioTags,
  makeFallbackWaveform,
  toggleAudioTag,
  type AudioItem,
  type AudioMetaByGeneration,
} from "./audioDeskState";

export type RegisterGenerationInput = {
  generationId: string;
  jobId: string;
  workflowId: string;
  modelId: string;
  prompt: string;
  queuePosition?: number | null;
  imageInputUrl?: string | null;
  width?: number;
  height?: number;
};

type AudioDeskProps = {
  apiBaseUrl: ApiBaseUrl;
  workflows: WorkflowSummary[];
  history: Generation[];
  enabledProviders: Record<string, boolean>;
  loading?: boolean;
  assetUrl: (asset: Asset) => string;
  onRegisterGeneration: (params: RegisterGenerationInput) => void;
  onOpenAsset: (generation: Generation, asset: Asset) => void;
};

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function clampRange(nextStart: number, nextEnd: number) {
  const start = Math.max(0, Math.min(99, Math.round(nextStart)));
  const end = Math.max(start + 1, Math.min(100, Math.round(nextEnd)));
  return { start, end };
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function statusTone(status: string) {
  switch (status) {
    case "succeeded":
      return "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300";
    case "running":
    case "queued":
      return "border-zinc-400 bg-zinc-100 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";
    case "failed":
      return "border-zinc-500 bg-zinc-200 text-zinc-950 dark:border-zinc-500 dark:bg-zinc-800 dark:text-zinc-50";
    default:
      return "border-zinc-200 bg-zinc-100 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400";
  }
}

function StatusPill(props: { status: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase", statusTone(props.status))}>
      <TbCircleDot className="h-3 w-3" />
      {props.status}
    </span>
  );
}

const controlClassName =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-900";

function WaveformBars(props: {
  src: string;
  seed: string;
  duration: number;
  currentTime: number;
  rangeStart: number;
  rangeEnd: number;
  onRangeChange: (range: { start: number; end: number }) => void;
  onSeek: (percent: number) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [bars, setBars] = useState(() => makeFallbackWaveform(props.seed, 72));
  const [dragMode, setDragMode] = useState<"start" | "end" | "seek" | null>(null);

  useEffect(() => {
    if (!props.src) {
      setBars(makeFallbackWaveform(props.seed, 72));
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const AudioContextCtor = window.AudioContext ?? (window as any).webkitAudioContext;
        if (!AudioContextCtor) throw new Error("AudioContext unavailable");
        const response = await fetch(props.src);
        if (!response.ok) throw new Error("Audio fetch failed");
        const buffer = await response.arrayBuffer();
        const context = new AudioContextCtor();
        const decoded = await context.decodeAudioData(buffer.slice(0));
        const channel = decoded.getChannelData(0);
        const nextBars = downsampleWaveform(channel, 72);
        await context.close?.();
        if (!cancelled) setBars(nextBars);
      } catch {
        if (!cancelled) setBars(makeFallbackWaveform(props.seed, 72));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [props.seed, props.src]);

  const playheadPercent = props.duration > 0
    ? Math.max(0, Math.min(100, (props.currentTime / props.duration) * 100))
    : 0;

  function percentFromClientX(clientX: number) {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
  }

  function updateDrag(nextMode: "start" | "end" | "seek", clientX: number) {
    const percent = percentFromClientX(clientX);
    if (nextMode === "start") {
      props.onRangeChange(clampRange(percent, props.rangeEnd));
      return;
    }
    if (nextMode === "end") {
      props.onRangeChange(clampRange(props.rangeStart, percent));
      return;
    }
    props.onSeek(percent);
  }

  function beginDrag(nextMode: "start" | "end" | "seek", clientX: number, pointerId: number) {
    setDragMode(nextMode);
    rootRef.current?.setPointerCapture(pointerId);
    updateDrag(nextMode, clientX);
  }

  function nudgeRange(handle: "start" | "end", amount: number) {
    if (handle === "start") {
      props.onRangeChange(clampRange(props.rangeStart + amount, props.rangeEnd));
      return;
    }
    props.onRangeChange(clampRange(props.rangeStart, props.rangeEnd + amount));
  }

  return (
    <div
      ref={rootRef}
      className="relative h-32 touch-none overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 shadow-sm dark:border-zinc-800 dark:bg-black"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        beginDrag("seek", event.clientX, event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!dragMode) return;
        updateDrag(dragMode, event.clientX);
      }}
      onPointerUp={(event) => {
        if (dragMode && rootRef.current?.hasPointerCapture(event.pointerId)) {
          rootRef.current.releasePointerCapture(event.pointerId);
        }
        setDragMode(null);
      }}
      onPointerCancel={(event) => {
        if (dragMode && rootRef.current?.hasPointerCapture(event.pointerId)) {
          rootRef.current.releasePointerCapture(event.pointerId);
        }
        setDragMode(null);
      }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(24,24,27,0.04)_1px,transparent_1px),linear-gradient(0deg,rgba(24,24,27,0.04)_1px,transparent_1px)] bg-[length:36px_100%,100%_24px] dark:bg-[linear-gradient(90deg,rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.045)_1px,transparent_1px)]" />
      <div
        className="absolute bottom-8 top-0 rounded bg-zinc-900/5 ring-1 ring-zinc-900/15 dark:bg-zinc-100/10 dark:ring-zinc-100/20"
        style={{
          left: `${props.rangeStart}%`,
          width: `${props.rangeEnd - props.rangeStart}%`,
        }}
      />
      <div className="absolute inset-x-3 bottom-8 top-0 z-10 flex items-center gap-[3px]">
        {bars.map((value, index) => {
          const position = bars.length <= 1 ? 0 : (index / (bars.length - 1)) * 100;
          const selected = position >= props.rangeStart && position <= props.rangeEnd;
          return (
            <span
              key={index}
              className={cn(
                "min-h-2 flex-1 rounded-full transition-colors",
                selected
                  ? "bg-zinc-950 shadow-[0_0_12px_rgba(24,24,27,0.16)] dark:bg-zinc-100 dark:shadow-[0_0_12px_rgba(244,244,245,0.16)]"
                  : "bg-zinc-300/90 dark:bg-zinc-700",
              )}
              style={{ height: `${Math.max(8, value * 92)}px` }}
            />
          );
        })}
      </div>
      <div
        className="pointer-events-none absolute bottom-8 top-0 z-20 w-0.5 bg-zinc-950 shadow-[0_0_0_1px_rgba(255,255,255,0.55)] dark:bg-zinc-50 dark:shadow-[0_0_0_1px_rgba(0,0,0,0.55)]"
        style={{ left: `${playheadPercent}%` }}
      >
        <span className="absolute -left-[3px] top-0 h-2 w-2 rounded-full bg-zinc-950 dark:bg-zinc-50" />
        <span className="absolute -bottom-1 -left-[3px] h-2 w-2 rounded-full bg-zinc-950 dark:bg-zinc-50" />
      </div>
      {([
        ["start", props.rangeStart, formatTime(props.duration * (props.rangeStart / 100))],
        ["end", props.rangeEnd, formatTime(props.duration * (props.rangeEnd / 100))],
      ] as const).map(([handle, value, label]) => (
        <button
          type="button"
          key={handle}
          aria-label={`${handle === "start" ? "Range start" : "Range end"} ${label}`}
          className="absolute bottom-8 top-0 z-30 flex w-4 -translate-x-1/2 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-700 shadow-sm transition-colors hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-500"
          style={{ left: `${value}%` }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            beginDrag(handle, event.clientX, event.pointerId);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              nudgeRange(handle, -1);
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              nudgeRange(handle, 1);
            }
          }}
        >
          <span className="h-8 w-0.5 rounded-full bg-zinc-500 dark:bg-zinc-400" />
        </button>
      ))}
      <div className="pointer-events-none absolute inset-x-3 bottom-2 z-20 flex justify-between font-mono text-[10px] text-zinc-500 dark:text-zinc-500">
        <span>{formatTime(props.duration * (props.rangeStart / 100))}</span>
        <span>{formatTime(playheadPercent > 0 ? props.currentTime : 0)}</span>
        <span>{formatTime(props.duration * (props.rangeEnd / 100))}</span>
      </div>
    </div>
  );
}

function AudioPlayer(props: {
  item: AudioItem | null;
  src: string;
  onOpenAsset: (generation: Generation, asset: Asset) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopSegment, setLoopSegment] = useState(false);
  const [range, setRange] = useState({ start: 0, end: 100 });

  useEffect(() => {
    setDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
    setRange({ start: 0, end: 100 });
    setLoopSegment(false);
  }, [props.item?.asset.id]);

  const selectionStart = duration * (range.start / 100);
  const selectionEnd = duration * (range.end / 100);

  function syncPlaybackTime(audio: HTMLAudioElement, enforceRange: boolean) {
    if (enforceRange && loopSegment && duration > 0 && audio.currentTime >= selectionEnd) {
      audio.currentTime = selectionStart;
      setCurrentTime(selectionStart);
      void audio.play();
      return true;
    }

    if (enforceRange && !loopSegment && duration > 0 && audio.currentTime >= selectionEnd) {
      audio.pause();
      audio.currentTime = selectionEnd;
      setCurrentTime(selectionEnd);
      return false;
    }

    setCurrentTime(audio.currentTime);
    return true;
  }

  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const tick = () => {
      const audio = audioRef.current;
      if (!audio || audio.paused) {
        animationFrameRef.current = null;
        return;
      }
      if (syncPlaybackTime(audio, true)) {
        animationFrameRef.current = window.requestAnimationFrame(tick);
      }
    };

    animationFrameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [duration, isPlaying, loopSegment, selectionEnd, selectionStart]);

  function seekToPercent(percent: number) {
    const audio = audioRef.current;
    if (!audio || duration <= 0) return;
    const nextTime = duration * (percent / 100);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function playFromSelection() {
    const audio = audioRef.current;
    if (!audio) return;
    if (duration > 0 && (audio.currentTime < selectionStart || audio.currentTime >= selectionEnd)) {
      audio.currentTime = selectionStart;
    }
    void audio.play();
  }

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      playFromSelection();
      return;
    }
    audio.pause();
  }

  if (!props.item) {
    return (
      <div className="flex min-h-[380px] flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50/70 p-8 text-center text-zinc-400 dark:border-zinc-800 dark:bg-black/30">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
          <TbHeadphones className="h-7 w-7" />
        </div>
        <div className="mt-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">Select a take to audition</div>
        <p className="mt-2 max-w-sm text-xs leading-5 text-zinc-500 dark:text-zinc-500">
          Generated audio appears in the library with waveform preview, range looping, and local tags.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <WaveformBars
        src={props.src}
        seed={props.item.asset.id}
        duration={duration}
        currentTime={currentTime}
        rangeStart={range.start}
        rangeEnd={range.end}
        onRangeChange={setRange}
        onSeek={seekToPercent}
      />

      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
          <TbVolume2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
            Now playing
          </div>
          <div className="mt-1 line-clamp-2 text-base font-semibold leading-6 text-zinc-950 dark:text-zinc-50">
            {props.item.generation.prompt}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="inline-flex min-w-0 items-center gap-1">
              <TbMusic className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{props.item.workflow?.label ?? props.item.generation.workflowUsed}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <TbClock className="h-3.5 w-3.5" />
              {formatDate(props.item.generation.createdAt)}
            </span>
            <StatusPill status={props.item.generation.status} />
          </div>
        </div>
      </div>

      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        className="hidden"
        src={props.src}
        preload="metadata"
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration);
          setCurrentTime(event.currentTarget.currentTime);
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onTimeUpdate={(event) => {
          syncPlaybackTime(event.currentTarget, !event.currentTarget.paused);
        }}
      />

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50/80 p-2 dark:border-zinc-800 dark:bg-black/30">
        <button
          type="button"
          onClick={togglePlayback}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-950 text-white transition-colors hover:bg-black dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
          aria-label={isPlaying ? "Pause audio" : "Play selected range"}
        >
          {isPlaying ? <TbPlayerPause className="h-4 w-4" /> : <TbPlayerPlay className="h-4 w-4" />}
        </button>
        <div className="inline-flex h-9 min-w-[104px] items-center rounded-lg border border-zinc-200 bg-white px-3 font-mono text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
        <div className="hidden h-9 items-center rounded-lg border border-zinc-200 bg-white px-3 font-mono text-[10px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-500 sm:inline-flex">
          {formatTime(selectionStart)} - {formatTime(selectionEnd || duration)}
        </div>
        <button
          type="button"
          onClick={() => setLoopSegment((value) => !value)}
          className={cn(
            "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors",
            loopSegment
              ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
              : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-900",
          )}
        >
          <TbRepeat className="h-4 w-4" />
          Loop range
        </button>
        <a
          href={props.src}
          download
          className={controlClassName}
        >
          <TbDownload className="h-4 w-4" />
          Download
        </a>
        <button
          type="button"
          onClick={() => props.onOpenAsset(props.item!.generation, props.item!.asset)}
          className={controlClassName}
        >
          <TbExternalLink className="h-4 w-4" />
          Details
        </button>
      </div>
    </div>
  );
}

export function AudioDesk(props: AudioDeskProps) {
  const [selectedWorkflowId, setSelectedWorkflowId] = usePersistedString("imgimg.audioDesk.workflow.v1", "");
  const [prompt, setPrompt] = usePersistedString("imgimg.audioDesk.prompt.v1", "");
  const [query, setQuery] = usePersistedString("imgimg.audioDesk.query.v1", "");
  const [selectedTag, setSelectedTag] = usePersistedString("imgimg.audioDesk.tag.v1", "all");
  const [selectedGenerationId, setSelectedGenerationId] = usePersistedString("imgimg.audioDesk.selectedGeneration.v1", "");
  const [dynamicModelsByWorkflow, setDynamicModelsByWorkflow] = usePersistedState<Record<string, string>>(
    "imgimg.audioDesk.dynamicModels.v1",
    {},
  );
  const [pinnedModelsByKey, setPinnedModelsByKey] = usePersistedState<Record<string, DiscoveredModel[]>>(
    "imgimg.audioDesk.pinnedModels.v1",
    {},
  );
  const [audioMeta, setAudioMeta] = useDurableWorkspaceState<AudioMetaByGeneration>("audio_metadata", "imgimg.audioDesk.meta.v1", {});
  const [tagDraft, setTagDraft] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioWorkflows = useMemo(
    () => props.workflows.filter((workflow) => isAudioWorkflowVisible(workflow, props.enabledProviders)),
    [props.enabledProviders, props.workflows],
  );

  useEffect(() => {
    if (selectedWorkflowId && audioWorkflows.some((workflow) => workflow.id === selectedWorkflowId)) return;
    setSelectedWorkflowId(audioWorkflows[0]?.id ?? "");
  }, [audioWorkflows, selectedWorkflowId, setSelectedWorkflowId]);

  const selectedWorkflow = audioWorkflows.find((workflow) => workflow.id === selectedWorkflowId) ?? audioWorkflows[0] ?? null;
  const selectedDynamicModelId = selectedWorkflow ? dynamicModelsByWorkflow[selectedWorkflow.id] ?? null : null;
  const dynamicProvider = selectedWorkflow?.engine === "fal" || selectedWorkflow?.engine === "openrouter"
    ? selectedWorkflow.engine
    : "replicate";
  const pinnedKey = `${dynamicProvider}:audio`;
  const pinnedModels = pinnedModelsByKey[pinnedKey] ?? [];

  const audioItems = useMemo(
    () => buildAudioItems(props.history, props.workflows, audioMeta),
    [audioMeta, props.history, props.workflows],
  );
  const allTags = useMemo(() => listAudioTags(audioItems), [audioItems]);
  const filteredItems = useMemo(
    () => filterAudioItems(audioItems, {
      query,
      workflowId: selectedWorkflowId || "all",
      tag: selectedTag || "all",
    }),
    [audioItems, query, selectedTag, selectedWorkflowId],
  );
  const selectedItem = filteredItems.find((item) => item.generation.id === selectedGenerationId) ?? filteredItems[0] ?? null;
  const selectedSrc = selectedItem ? props.assetUrl(selectedItem.asset) : "";

  const updateMeta = (generationId: string, updater: (meta: AudioMetaByGeneration[string]) => AudioMetaByGeneration[string]) => {
    setAudioMeta((prev) => {
      const current = prev[generationId] ?? { tags: [] };
      return { ...prev, [generationId]: updater(current) };
    });
  };

  async function handleGenerate() {
    if (!selectedWorkflow || !prompt.trim() || generating) return;
    if (selectedWorkflow.dynamicModel && !selectedDynamicModelId) {
      setError("Select an audio model first.");
      return;
    }

    setGenerating(true);
    setError(null);
    try {
      const result = await createGeneration(props.apiBaseUrl, {
        modelId: "",
        prompt: prompt.trim(),
        workflowId: selectedWorkflow.id,
        replicateModel: selectedWorkflow.dynamicModel && selectedWorkflow.engine === "replicate" ? selectedDynamicModelId ?? undefined : undefined,
        falModel: selectedWorkflow.dynamicModel && selectedWorkflow.engine === "fal" ? selectedDynamicModelId ?? undefined : undefined,
        openrouterModel: selectedWorkflow.dynamicModel && selectedWorkflow.engine === "openrouter" ? selectedDynamicModelId ?? undefined : undefined,
      });
      props.onRegisterGeneration({
        generationId: result.generationId,
        jobId: result.jobId,
        workflowId: selectedWorkflow.id,
        modelId: "",
        prompt: prompt.trim(),
        queuePosition: result.queuePosition,
      });
      setSelectedGenerationId(result.generationId);
    } catch (err) {
      setError(extractError(err, "Audio generation failed"));
    } finally {
      setGenerating(false);
    }
  }

  const canGenerate = Boolean(selectedWorkflow && prompt.trim()) && !generating && (!selectedWorkflow?.dynamicModel || Boolean(selectedDynamicModelId));

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="rounded-xl border border-zinc-200 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(244,244,245,0.72))] px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-[linear-gradient(135deg,rgba(9,9,11,0.98),rgba(24,24,27,0.92))]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
              <TbWaveSine className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                Audio workspace
              </div>
              <h1 className="truncate text-xl font-semibold text-zinc-950 dark:text-zinc-50">Audio Desk</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white/80 px-2.5 dark:border-zinc-800 dark:bg-black/25">
              <TbPlaylist className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
              {filteredItems.length}/{audioItems.length} takes
            </span>
            <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white/80 px-2.5 dark:border-zinc-800 dark:bg-black/25">
              <TbTag className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
              {allTags.length} tags
            </span>
          </div>

          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
            <select
              value={selectedWorkflow?.id ?? ""}
              onChange={(event) => setSelectedWorkflowId(event.currentTarget.value)}
              className="h-9 max-w-[260px] rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-500"
            >
              {audioWorkflows.map((workflow) => (
                <option key={workflow.id} value={workflow.id}>{workflow.label}</option>
              ))}
            </select>
            {selectedWorkflow?.dynamicModel ? (
              <ProviderModelPicker
                apiBaseUrl={props.apiBaseUrl}
                provider={dynamicProvider}
                selectedModelId={selectedDynamicModelId}
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
                assetType="audio"
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
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(380px,0.92fr)_minmax(500px,1.08fr)]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <TbMicrophone2 className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                  Compose
                </span>
              </div>
              <span className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-600">
                Ctrl / Cmd Enter
              </span>
            </div>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void handleGenerate();
                }
              }}
              placeholder="Describe the track, loop, ambience, hit, voice, or texture..."
              rows={5}
              className="min-h-[132px] w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm leading-6 text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-500 dark:border-zinc-800 dark:bg-black dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-zinc-500"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={!canGenerate}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-medium text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
              >
                {generating ? <TbLoader2 className="h-4 w-4 animate-spin" /> : <TbSparkles className="h-4 w-4" />}
                Generate audio
              </button>
              {error ? (
                <div role="alert" className="rounded-lg border border-zinc-300 bg-zinc-100 px-3 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
                  {error}
                </div>
              ) : null}
            </div>
          </div>

          <div className="border-b border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-black/25">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[190px] flex-1">
                <TbSearch className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder="Search prompts, workflows, tags"
                  className="h-9 w-full rounded-lg border border-zinc-200 bg-white pl-8 pr-2 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-500 dark:border-zinc-800 dark:bg-black dark:text-zinc-100 dark:focus:border-zinc-500"
                />
              </div>
              <select
                value={selectedTag}
                onChange={(event) => setSelectedTag(event.currentTarget.value)}
                className="h-9 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-500 dark:border-zinc-800 dark:bg-black dark:text-zinc-100 dark:focus:border-zinc-500"
              >
                <option value="all">All tags</option>
                {allTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
              </select>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                <TbPlaylist className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
                Library
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-500">
                {filteredItems.length} visible
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {filteredItems.length === 0 ? (
                <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50/70 p-6 text-center dark:border-zinc-800 dark:bg-black/30">
                  <TbPlaylist className="h-8 w-8 text-zinc-400" />
                  <div className="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">No matching audio</div>
                  <p className="mt-1 max-w-xs text-xs leading-5 text-zinc-500 dark:text-zinc-500">
                    Clear search, switch tags, or generate a new take from the composer.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredItems.map((item) => {
                    const active = selectedItem?.generation.id === item.generation.id;
                    const visibleTags = item.tags.slice(0, 3);
                    const extraTags = item.tags.length - visibleTags.length;
                    return (
                      <button
                        type="button"
                        key={item.generation.id}
                        onClick={() => setSelectedGenerationId(item.generation.id)}
                        className={cn(
                          "group flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                          active
                            ? "border-zinc-900 bg-zinc-100 shadow-[inset_3px_0_0_rgba(24,24,27,0.88)] dark:border-zinc-100 dark:bg-zinc-900 dark:shadow-[inset_3px_0_0_rgba(244,244,245,0.86)]"
                            : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/60",
                        )}
                      >
                        <span className={cn(
                          "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
                          active
                            ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
                            : "border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-black dark:text-zinc-500",
                        )}>
                          <TbHeadphones className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 text-sm font-medium leading-5 text-zinc-900 dark:text-zinc-100">
                            {item.generation.prompt}
                          </span>
                          <span className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                            <span className="max-w-[180px] truncate">{item.workflow?.label ?? item.generation.workflowUsed}</span>
                            <StatusPill status={item.generation.status} />
                            {visibleTags.map((tag) => (
                              <span key={tag} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{tag}</span>
                            ))}
                            {extraTags > 0 ? (
                              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                +{extraTags}
                              </span>
                            ) : null}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-[10px] text-zinc-400 dark:text-zinc-500">
                          {formatDate(item.generation.createdAt)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <AudioPlayer item={selectedItem} src={selectedSrc} onOpenAsset={props.onOpenAsset} />

          {selectedItem ? (
            <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <form
                  className="flex min-w-[220px] flex-1 items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    updateMeta(selectedItem.generation.id, (meta) => ({ tags: toggleAudioTag(meta.tags, tagDraft) }));
                    setTagDraft("");
                  }}
                >
                  <TbTag className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
                  <input
                    value={tagDraft}
                    onChange={(event) => setTagDraft(event.currentTarget.value)}
                    placeholder="Add or remove tag"
                    className="h-9 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-500 dark:border-zinc-800 dark:bg-black dark:text-zinc-100 dark:focus:border-zinc-500"
                  />
                </form>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {selectedItem.tags.length === 0 ? (
                  <span className="rounded-full border border-dashed border-zinc-200 px-2.5 py-1 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
                    No tags yet
                  </span>
                ) : selectedItem.tags.map((tag) => (
                  <button
                    type="button"
                    key={tag}
                    onClick={() => updateMeta(selectedItem.generation.id, (meta) => ({ tags: toggleAudioTag(meta.tags, tag) }))}
                    className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-black dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
                  >
                    {tag}
                    <TbX className="h-3 w-3" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { TbArrowBack, TbChevronDown, TbCopy, TbLayersSubtract, TbMusic, TbPhoto, TbSettings, TbSparkles, TbX } from "react-icons/tb";
import { listEnhancerPresets, setActiveEnhancerPreset, type EnhancerPreset } from "../tauri-api";
import type { Model, SavedPrompt } from "../types";
import type { WorkflowParameter, UserPreset, ApiBaseUrl, DiscoveredModel } from "../api";
import type { AspectRatio } from "../workflows";
import type { PromptPosition } from "./preferences";
import { ProviderModelPicker } from "./ReplicateModelPicker";
import { copyToClipboard } from "../utils/clipboard";
import { clampBatchSize } from "../utils/clamp";
import { cn } from "../utils/cn";
import { extractVariables, replaceVariables } from "../utils/promptVariables";
import { PromptVariableForm } from "./PromptVariableForm";
import { isFirstGenCompleted } from "../lib/onboarding";
import { isPromptSidebarPosition } from "../lib/promptPosition";
import {
  buildPresetTagCandidates,
  findPresetTagMatches,
  getPresetTagContext,
  type PresetTagCandidate,
} from "../utils/presetTags";

// Extracted sub-components
import { pillBase, togglePill } from "./prompt/pillStyles";
import { getTagContext, getPromptTagContext, removeModelTags, findTagRanges } from "./prompt/tagUtils";
import { AspectRatioPicker } from "./prompt/AspectRatioPicker";
import { ModelPicker } from "./prompt/ModelPicker";
import { BatchSizePicker } from "./prompt/BatchSizePicker";
import { WorkflowParameterControls } from "./prompt/WorkflowParameterControls";
import { ModelReadmeToggle } from "./prompt/ModelReadmeToggle";
import { PresetPicker } from "./prompt/PresetPicker";

export type ImageInput = {
  dataUrl: string;
  file: File | null;
  name: string;
  /** "image" (default), "video", or "audio" — used to route to the correct API field */
  mediaType?: "image" | "video" | "audio";
};

export type PromptCenterpieceState = {
  aspectRatio: AspectRatio;
  batchSize: 1 | 2 | 3 | 4;
  enhancePrompt: boolean;
  removeItemBackgrounds: boolean;
  imageInputs: ImageInput[];
  /** Dynamic workflow parameters (e.g., duration for video models) */
  workflowParams: Record<string, number | boolean | string>;
};

export function PromptCenterpiece(props: {
  apiBaseUrl: string;
  models: Model[];
  selectedModelId: string;
  onSelectedModelIdChange: (id: string) => void;
  prompt: string;
  onPromptChange: (next: string) => void;
  onGenerate: () => void;
  disabled?: boolean;
  enhancing?: boolean;
  workflowSelected: boolean;
  queuePosition?: number | null;
  status?: string;
  state: PromptCenterpieceState;
  onStateChange: (next: PromptCenterpieceState) => void;
  workflowLabel: string;
  showAspectRatio: boolean;
  showBatchSize: boolean;
  showRemoveItemBackgrounds?: boolean;
  supportsImageInput?: boolean;
  requiresImageInput?: boolean;
  supportsVideoInput?: boolean;
  supportsAudioInput?: boolean;
  maxAudioInputs?: number;
  maxImageInputs?: number;
  lastFrameImage?: boolean;
  supportsLora?: boolean;
  loraEnabled?: boolean;
  onLoraEnabledChange?: (enabled: boolean) => void;
  enableLoraTagging?: boolean;
  savedPrompts?: SavedPrompt[];
  originalPrompt?: string | null;
  onRevertPrompt?: () => void;
  workflowParameters?: WorkflowParameter[];
  supportedAspectRatios?: string[];
  appendAspectRatioToPrompt?: boolean;
  promptRequired?: boolean;
  outputMode?: string;
  supportsPresets?: boolean;
  presets?: UserPreset[];
  selectedPresetId?: string | null;
  onPresetChange?: (presetId: string | null) => void;
  dynamicModel?: boolean;
  dynamicModelProvider?: "replicate" | "fal" | "openrouter";
  dynamicModelAssetType?: "image" | "video" | "audio";
  selectedDynamicModelId?: string | null;
  onDynamicModelSelect?: (modelId: string, model: DiscoveredModel) => void;
  onDynamicModelClear?: () => void;
  dynamicModelReadme?: string | null;
  dynamicModelLoading?: boolean;
  dynamicModelError?: string | null;
  onRetryDynamicModel?: () => void;
  pinnedDynamicModels?: DiscoveredModel[];
  onPinDynamicModel?: (model: DiscoveredModel) => void;
  onUnpinDynamicModel?: (modelId: string) => void;
  providerAvailable?: boolean;
  engine?: string;
  onOpenPromptSettings?: () => void;
  onOpenApiKeys?: () => void;
  promptPosition?: PromptPosition;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [tagOpen, setTagOpen] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const [tagStart, setTagStart] = useState<number | null>(null);
  const [tagIndex, setTagIndex] = useState(0);

  const [promptTagOpen, setPromptTagOpen] = useState(false);
  const [promptTagQuery, setPromptTagQuery] = useState("");
  const [promptTagStart, setPromptTagStart] = useState<number | null>(null);
  const [promptTagIndex, setPromptTagIndex] = useState(0);

  // Preset # tag autocomplete state
  const [presetTagOpen, setPresetTagOpen] = useState(false);
  const [presetTagQuery, setPresetTagQuery] = useState("");
  const [presetTagStart, setPresetTagStart] = useState<number | null>(null);
  const [presetTagIndex, setPresetTagIndex] = useState(0);

  const [pendingPromptInsert, setPendingPromptInsert] = useState<SavedPrompt | null>(null);
  const [pendingVariables, setPendingVariables] = useState<string[]>([]);
  const [pendingCursorPos, setPendingCursorPos] = useState<number | null>(null);

  // Enhancer presets state
  const [enhancerPresets, setEnhancerPresets] = useState<EnhancerPreset[]>([]);
  const [enhancerDropdownOpen, setEnhancerDropdownOpen] = useState(false);
  const enhancerDropdownRef = useRef<HTMLDivElement>(null);

  // Load enhancer presets on mount + listen for changes from admin panel
  const refreshEnhancerPresets = useCallback(() => {
    listEnhancerPresets().then(setEnhancerPresets).catch(() => {});
  }, []);

  useEffect(() => {
    refreshEnhancerPresets();
    const handler = () => refreshEnhancerPresets();
    window.addEventListener("enhancer-presets-changed", handler);
    return () => window.removeEventListener("enhancer-presets-changed", handler);
  }, [refreshEnhancerPresets]);

  const activeEnhancerPreset = useMemo(
    () => enhancerPresets.find((p) => p.isDefault) ?? null,
    [enhancerPresets]
  );

  // Close enhancer dropdown on outside click
  useEffect(() => {
    if (!enhancerDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (enhancerDropdownRef.current && !enhancerDropdownRef.current.contains(e.target as Node)) {
        setEnhancerDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [enhancerDropdownOpen]);

  // --- Prompt history (terminal-style up/down arrow) ---
  const HISTORY_KEY = "imgimg:promptHistory";
  const MAX_HISTORY = 100;
  const [initHistory] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const promptHistoryRef = useRef<string[]>(initHistory);
  const historyIndexRef = useRef(-1);
  const historyDraftRef = useRef("");

  const pushPromptHistory = useCallback((prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    const hist = promptHistoryRef.current;
    if (hist.length > 0 && hist[hist.length - 1] === trimmed) return;
    hist.push(trimmed);
    if (hist.length > MAX_HISTORY) hist.splice(0, hist.length - MAX_HISTORY);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(hist)); } catch {}
    historyIndexRef.current = -1;
  }, []);

  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastFrameFileInputRef = useRef<HTMLInputElement | null>(null);
  const audioFileInputRef = useRef<HTMLInputElement | null>(null);
  const isEnhancing = Boolean(props.enhancing);
  const isDisabled = props.disabled || isEnhancing;

  const maxImageInputs = Math.max(1, props.maxImageInputs ?? 1);

  const readMediaFile = useCallback((file: File) => {
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    const isAudio = file.type.startsWith("audio/");
    if (!isImage && !isVideo && !isAudio) return Promise.resolve(null);
    const mediaType: "image" | "video" | "audio" = isAudio ? "audio" : isVideo ? "video" : "image";
    return new Promise<ImageInput | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (dataUrl) {
          resolve({ dataUrl, file, name: file.name, mediaType });
        } else {
          resolve(null);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }, []);

  const acceptsVideo = Boolean(props.supportsVideoInput);
  const addImageFiles = useCallback((files: File[]) => {
    if (!props.supportsImageInput || isDisabled) return;
    const remainingSlots = maxImageInputs - props.state.imageInputs.length;
    if (remainingSlots <= 0) return;
    const mediaFiles = files.filter((file) =>
      file.type.startsWith("image/") || (acceptsVideo && file.type.startsWith("video/"))
    ).slice(0, remainingSlots);
    if (mediaFiles.length === 0) return;
    Promise.all(mediaFiles.map((file) => readMediaFile(file))).then((nextInputs) => {
      const validInputs = nextInputs.filter((input): input is ImageInput => Boolean(input));
      if (validInputs.length === 0) return;
      props.onStateChange({
        ...props.state,
        imageInputs: [...props.state.imageInputs, ...validInputs]
      });
    });
  }, [props.supportsImageInput, acceptsVideo, isDisabled, maxImageInputs, props.state, props.onStateChange, readMediaFile]);

  const handlePaste = useCallback((e: ClipboardEvent) => {
    if (!props.supportsImageInput) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of items) {
      if (!item.type.startsWith("image/")) continue;
      const file = item.getAsFile();
      if (file) files.push(file);
    }
    if (files.length > 0) {
      e.preventDefault();
      addImageFiles(files);
    }
  }, [props.supportsImageInput, addImageFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!props.supportsImageInput) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      addImageFiles(files);
    }
  }, [props.supportsImageInput, addImageFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const clearImageInputs = useCallback(() => {
    props.onStateChange({ ...props.state, imageInputs: [] });
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (lastFrameFileInputRef.current) lastFrameFileInputRef.current.value = "";
    if (audioFileInputRef.current) audioFileInputRef.current.value = "";
  }, [props.state, props.onStateChange]);

  const setLastFrameImage = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    readMediaFile(file).then((input) => {
      if (!input) return;
      const current = [...props.state.imageInputs];
      if (current.length === 0) return;
      current[1] = input;
      props.onStateChange({ ...props.state, imageInputs: current });
    });
  }, [props.state, props.onStateChange, readMediaFile]);

  const clearLastFrameImage = useCallback(() => {
    const current = [...props.state.imageInputs];
    if (current.length > 1) {
      current.splice(1, 1);
      props.onStateChange({ ...props.state, imageInputs: current });
    }
    if (lastFrameFileInputRef.current) lastFrameFileInputRef.current.value = "";
  }, [props.state, props.onStateChange]);

  const addAudioFile = useCallback((file: File) => {
    if (!file.type.startsWith("audio/")) return;
    readMediaFile(file).then((input) => {
      if (!input) return;
      const nonAudio = props.state.imageInputs.filter((i) => i.mediaType !== "audio");
      props.onStateChange({ ...props.state, imageInputs: [...nonAudio, input] });
    });
  }, [props.state, props.onStateChange, readMediaFile]);

  const clearAudioInput = useCallback(() => {
    const nonAudio = props.state.imageInputs.filter((i) => i.mediaType !== "audio");
    props.onStateChange({ ...props.state, imageInputs: nonAudio });
    if (audioFileInputRef.current) audioFileInputRef.current.value = "";
  }, [props.state, props.onStateChange]);

  const removeImageAt = useCallback((index: number) => {
    if (props.lastFrameImage && index === 0) {
      props.onStateChange({ ...props.state, imageInputs: [] });
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (lastFrameFileInputRef.current) lastFrameFileInputRef.current.value = "";
      return;
    }
    const nextInputs = props.state.imageInputs.filter((_, i) => i !== index);
    props.onStateChange({ ...props.state, imageInputs: nextInputs });
    if (nextInputs.length === 0 && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [props.state, props.onStateChange, props.lastFrameImage]);

  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  const tagRanges = useMemo(() => {
    if (!props.enableLoraTagging) return [];
    return findTagRanges(props.prompt, props.models);
  }, [props.enableLoraTagging, props.prompt, props.models]);

  const tagMatches = useMemo(() => {
    if (!props.enableLoraTagging || !tagOpen) return [];
    const q = tagQuery.trim().toLowerCase();
    const matches = q.length === 0
      ? props.models
      : props.models.filter((model) => model.name.toLowerCase().includes(q));
    return matches.slice(0, 8);
  }, [props.enableLoraTagging, tagOpen, tagQuery, props.models]);

  const updateTagContext = useCallback((value: string, cursor: number | null) => {
    if (!props.enableLoraTagging) {
      setTagOpen(false);
      setTagQuery("");
      setTagStart(null);
      return;
    }
    const pos = cursor ?? value.length;
    const liveRanges = findTagRanges(value, props.models);
    if (liveRanges.length > 0) {
      const insideExisting = liveRanges.some((range) => pos >= range.start && pos <= range.end);
      if (!insideExisting) {
        setTagOpen(false);
        setTagQuery("");
        setTagStart(null);
        return;
      }
    }
    const ctx = getTagContext(value, pos);
    if (!ctx) {
      setTagOpen(false);
      setTagQuery("");
      setTagStart(null);
      return;
    }
    setTagOpen(true);
    setTagQuery(ctx.query);
    setTagStart(ctx.start);
    setTagIndex(0);
  }, [props.enableLoraTagging, props.models]);

  const applyTagSelection = useCallback((modelName: string) => {
    if (!props.enableLoraTagging) return;
    const start = tagStart;
    if (start === null) return;
    const el = textAreaRef.current;
    const cursor = el?.selectionStart ?? props.prompt.length;
    const placeholder = "__LORA_TAG_PLACEHOLDER__";
    const before = props.prompt.slice(0, start);
    const after = props.prompt.slice(cursor);
    let next = `${before}${placeholder}${after}`;
    next = removeModelTags(next, props.models);
    const insert = `@${modelName}`;
    const needsSpace = after.length > 0 && !/^[\s,.;:!?]/.test(after);
    next = next.replace(placeholder, needsSpace ? `${insert} ` : insert);
    props.onPromptChange(next);
    setTagOpen(false);
    setTagQuery("");
    setTagStart(null);
    queueMicrotask(() => {
      const target = textAreaRef.current;
      if (!target) return;
      const insertIndex = next.indexOf(insert);
      const nextCursor = insertIndex >= 0 ? insertIndex + insert.length + (needsSpace ? 1 : 0) : next.length;
      target.focus();
      target.setSelectionRange(nextCursor, nextCursor);
      autoSize();
    });
  }, [props.enableLoraTagging, props.models, props.prompt, props.onPromptChange, tagStart]);

  useEffect(() => {
    if (props.enableLoraTagging) return;
    setTagOpen(false);
    setTagQuery("");
    setTagStart(null);
  }, [props.enableLoraTagging]);

  // ── Preset # tag system ──
  const presetCandidates = useMemo(
    () => (props.presets?.length ? buildPresetTagCandidates(props.presets) : []),
    [props.presets]
  );

  const presetTagMatches = useMemo(() => {
    if (!presetTagOpen || presetCandidates.length === 0) return [];
    const q = presetTagQuery.trim().toLowerCase();
    const matches = q.length === 0
      ? presetCandidates
      : presetCandidates.filter((c) => c.nameLower.includes(q) || c.nameSlug.includes(q));
    return matches.slice(0, 8);
  }, [presetTagOpen, presetTagQuery, presetCandidates]);

  useEffect(() => {
    if (presetCandidates.length === 0) return;
    const matches = findPresetTagMatches(props.prompt, presetCandidates);
    if (matches.length > 0) {
      const firstMatch = matches[0];
      if (firstMatch.id !== props.selectedPresetId) {
        props.onPresetChange?.(firstMatch.id);
      }
    }
  }, [props.prompt, presetCandidates]); // eslint-disable-line react-hooks/exhaustive-deps

  const updatePresetTagContext = useCallback((value: string, cursor: number | null) => {
    if (presetCandidates.length === 0) {
      setPresetTagOpen(false);
      return;
    }
    const pos = cursor ?? value.length;
    const ctx = getPresetTagContext(value, pos);
    if (!ctx) {
      setPresetTagOpen(false);
      setPresetTagQuery("");
      setPresetTagStart(null);
      return;
    }
    setPresetTagOpen(true);
    setPresetTagQuery(ctx.query);
    setPresetTagStart(ctx.start);
    setPresetTagIndex(0);
  }, [presetCandidates]);

  const applyPresetTagSelection = useCallback((candidate: PresetTagCandidate) => {
    const start = presetTagStart;
    if (start === null) return;
    const el = textAreaRef.current;
    const cursor = el?.selectionStart ?? props.prompt.length;
    const before = props.prompt.slice(0, start);
    const after = props.prompt.slice(cursor);
    const insert = `#${candidate.nameSlug}`;
    const needsSpace = after.length > 0 && !/^[\s,.;:!?]/.test(after);
    const next = `${before}${needsSpace ? `${insert} ` : insert}${after}`;
    props.onPromptChange(next);
    props.onPresetChange?.(candidate.id);
    setPresetTagOpen(false);
    setPresetTagQuery("");
    setPresetTagStart(null);
    queueMicrotask(() => {
      const target = textAreaRef.current;
      if (!target) return;
      const insertIndex = next.indexOf(insert);
      const nextCursor = insertIndex >= 0 ? insertIndex + insert.length + (needsSpace ? 1 : 0) : next.length;
      target.focus();
      target.setSelectionRange(nextCursor, nextCursor);
      autoSize();
    });
  }, [presetCandidates, props.prompt, props.onPromptChange, props.onPresetChange, presetTagStart]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Saved prompt (!) autocomplete ──

  const promptTagMatches = useMemo(() => {
    if (!promptTagOpen || !props.savedPrompts?.length) return [];
    const q = promptTagQuery.trim().toLowerCase();
    const matches = q.length === 0
      ? props.savedPrompts
      : props.savedPrompts.filter((p) => p.name.toLowerCase().includes(q));
    return matches.slice(0, 8);
  }, [promptTagOpen, promptTagQuery, props.savedPrompts]);

  const updatePromptTagContext = useCallback((value: string, cursor: number | null) => {
    if (!props.savedPrompts?.length || tagOpen) {
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
  }, [props.savedPrompts, tagOpen]);

  const applyPromptTagSelection = useCallback((prompt: SavedPrompt) => {
    const start = promptTagStart;
    if (start === null) return;
    const el = textAreaRef.current;
    const cursor = el?.selectionStart ?? props.prompt.length;

    const vars = extractVariables(prompt.text);
    if (vars.length > 0) {
      setPendingPromptInsert(prompt);
      setPendingVariables(vars);
      setPendingCursorPos(cursor);
      setPromptTagOpen(false);
      setPromptTagQuery("");
      return;
    }

    const before = props.prompt.slice(0, start);
    const after = props.prompt.slice(cursor);
    const insert = prompt.text;
    const needsSpace = after.length > 0 && !/^[\s,.;:!?]/.test(after);
    const next = `${before}${insert}${needsSpace ? " " : ""}${after}`;
    props.onPromptChange(next);
    setPromptTagOpen(false);
    setPromptTagQuery("");
    setPromptTagStart(null);
    queueMicrotask(() => {
      const target = textAreaRef.current;
      if (!target) return;
      const nextCursor = before.length + insert.length + (needsSpace ? 1 : 0);
      target.focus();
      target.setSelectionRange(nextCursor, nextCursor);
      autoSize();
    });
  }, [props.prompt, props.onPromptChange, promptTagStart]);

  const handleVariableSubmit = useCallback((values: Record<string, string>) => {
    if (!pendingPromptInsert || promptTagStart === null || pendingCursorPos === null) return;
    const before = props.prompt.slice(0, promptTagStart);
    const after = props.prompt.slice(pendingCursorPos);
    const insert = replaceVariables(pendingPromptInsert.text, values);
    const needsSpace = after.length > 0 && !/^[\s,.;:!?]/.test(after);
    const next = `${before}${insert}${needsSpace ? " " : ""}${after}`;
    props.onPromptChange(next);
    setPendingPromptInsert(null);
    setPendingVariables([]);
    setPendingCursorPos(null);
    setPromptTagStart(null);
    queueMicrotask(() => {
      const target = textAreaRef.current;
      if (!target) return;
      const nextCursor = before.length + insert.length + (needsSpace ? 1 : 0);
      target.focus();
      target.setSelectionRange(nextCursor, nextCursor);
      autoSize();
    });
  }, [pendingPromptInsert, promptTagStart, pendingCursorPos, props.prompt, props.onPromptChange]);

  const handleVariableCancel = useCallback(() => {
    setPendingPromptInsert(null);
    setPendingVariables([]);
    setPendingCursorPos(null);
    setPromptTagStart(null);
    textAreaRef.current?.focus();
  }, []);

  const tagOverlaySegments = useMemo(() => {
    if (!props.enableLoraTagging || tagRanges.length === 0) return null;
    const nodes: (JSX.Element | string)[] = [];
    let cursor = 0;
    tagRanges.forEach((range, index) => {
      if (range.start > cursor) {
        nodes.push(<span key={`tag-pre-${index}`}>{props.prompt.slice(cursor, range.start)}</span>);
      }
      nodes.push(
        <span
          key={`tag-${index}`}
          className={[
            "rounded-md bg-accent-sky/5 text-accent-sky shadow-[0_0_0_3px_rgba(120,179,214,0.08),inset_0_0_0_1px_rgba(120,179,214,0.2)]",
            "box-decoration-clone",
            "dark:bg-accent-sky/5 dark:text-accent-sky dark:shadow-[0_0_0_3px_rgba(120,179,214,0.08),inset_0_0_0_1px_rgba(120,179,214,0.15)]"
          ].join(" ")}
        >
          {props.prompt.slice(range.start, range.end)}
        </span>
      );
      cursor = range.end;
    });
    if (cursor < props.prompt.length) {
      nodes.push(<span key="tag-post">{props.prompt.slice(cursor)}</span>);
    }
    return nodes;
  }, [props.enableLoraTagging, tagRanges, props.prompt]);

  const useTagOverlay = props.enableLoraTagging && tagRanges.length > 0;

  const selectedModel = useMemo(() => {
    const m = props.models.find((x) => x.id === props.selectedModelId);
    return m ?? null;
  }, [props.models, props.selectedModelId]);

  const selectedModelLabel = selectedModel?.name ?? "Select model";
  const enhanceActive = props.state.enhancePrompt;
  const removeBackgroundsActive = props.state.removeItemBackgrounds;
  const canRevert = Boolean(props.originalPrompt && props.onRevertPrompt);
  const allInputs = props.state.imageInputs;
  const imageInputs = allInputs.filter((i) => i.mediaType !== "audio");
  const audioInputs = allInputs.filter((i) => i.mediaType === "audio");
  const hasAudioInput = audioInputs.length > 0;
  const isMultiImage = maxImageInputs > 1;
  const canAddMoreImages = imageInputs.length < maxImageInputs;
  const hasModelAspectRatio = props.workflowParameters?.some((p) => p.name === "aspect_ratio") ?? false;
  const isSidebarPrompt = props.promptPosition ? isPromptSidebarPosition(props.promptPosition) : false;

  useEffect(() => {
    if (imageInputs.length > maxImageInputs) {
      props.onStateChange({ ...props.state, imageInputs: imageInputs.slice(0, maxImageInputs) });
    }
  }, [imageInputs, maxImageInputs, props.state, props.onStateChange]);

  function autoSize() {
    const el = textAreaRef.current;
    if (!el) return;
    const sidebarDesktop = isSidebarPrompt && (typeof window.matchMedia !== "function" || window.matchMedia("(min-width: 1024px)").matches);
    if (sidebarDesktop) {
      el.style.height = "";
      return;
    }
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  const hasRequiredImage = !props.requiresImageInput || imageInputs.length > 0;
  const hasRequiredPreset = true;
  const loraActive = props.supportsLora === true && props.loraEnabled !== false;
  const canGenerate =
    (props.promptRequired === false || props.prompt.trim().length > 0) &&
    (!loraActive || props.selectedModelId.length > 0) &&
    props.workflowSelected &&
    !isDisabled &&
    hasRequiredImage &&
    hasRequiredPreset;
  useEffect(() => {
    queueMicrotask(autoSize);
  }, [props.prompt, isSidebarPrompt]);

  useEffect(() => {
    function onResize() {
      autoSize();
    }

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isSidebarPrompt]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  async function onCopy() {
    if (!props.prompt.trim()) return;
    try {
      await copyToClipboard(props.prompt);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    } finally {
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = window.setTimeout(() => setCopyState("idle"), 1400);
    }
  }

  function onClear() {
    props.onPromptChange("");
    queueMicrotask(() => {
      autoSize();
      textAreaRef.current?.focus();
    });
  }

  return (
    <section className={cn("relative z-30 w-full", isSidebarPrompt ? "lg:flex lg:h-full lg:min-h-0" : "")}>
      <div className={cn(
        "rounded-xl border border-zinc-200 bg-white p-4 shadow-[0_12px_50px_-30px_rgba(0,0,0,0.25)] backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-950 dark:shadow-[0_12px_50px_-30px_rgba(0,0,0,0.9)]",
        isSidebarPrompt ? "lg:flex lg:min-h-0 lg:flex-1 lg:flex-col" : ""
      )}>
        <div className={cn("min-w-0", isSidebarPrompt ? "lg:flex lg:min-h-0 lg:flex-1 lg:flex-col" : "")}>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{props.workflowLabel}</div>
            <div className="hidden text-xs text-zinc-500 sm:block">
              Enter to generate · Shift+Enter newline
            </div>
          </div>

          <div
            className={cn("relative px-3 py-2", isSidebarPrompt ? "lg:flex lg:min-h-0 lg:flex-1 lg:flex-col" : "")}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            {isEnhancing ? (
              <div
                className={[
                  "pointer-events-none absolute inset-0 rounded-xl",
                  "border border-zinc-400/40",
                  "bg-gradient-to-r from-zinc-500/10 via-zinc-400/10 to-zinc-500/10",
                  "animate-pulse"
                ].join(" ")}
              />
            ) : null}
            {isEnhancing ? (
              <div className="pointer-events-none absolute right-3 top-2 flex items-center gap-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                <TbSparkles className="h-3 w-3" />
                Enhancing…
              </div>
            ) : null}

            {/* Image preview */}
            {imageInputs.length > 0 && props.supportsImageInput ? (
              props.lastFrameImage ? (
                <div className="mb-2 flex items-start gap-3">
                  {imageInputs[0] ? (
                    <div className="flex flex-col items-center gap-1">
                      <div className="relative">
                        <img
                          src={imageInputs[0].dataUrl}
                          alt="First frame"
                          className="h-14 w-14 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700"
                        />
                        <button
                          type="button"
                          onClick={() => removeImageAt(0)}
                          disabled={isDisabled}
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                          aria-label="Remove first frame"
                        >
                          <TbX className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">First Frame</span>
                    </div>
                  ) : null}
                  {imageInputs[1] ? (
                    <div className="flex flex-col items-center gap-1">
                      <div className="relative">
                        <img
                          src={imageInputs[1].dataUrl}
                          alt="Last frame"
                          className="h-14 w-14 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700"
                        />
                        <button
                          type="button"
                          onClick={clearLastFrameImage}
                          disabled={isDisabled}
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                          aria-label="Remove last frame"
                        >
                          <TbX className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">Last Frame</span>
                    </div>
                  ) : null}
                </div>
              ) : isMultiImage ? (
                <div className="mb-2">
                  <div className="flex flex-wrap gap-2">
                    {imageInputs.map((input, index) => (
                      <div key={`${input.name}-${index}`} className="relative">
                        <img
                          src={input.dataUrl}
                          alt={`Input ${index + 1}`}
                          className="h-14 w-14 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700"
                        />
                        <button
                          type="button"
                          onClick={() => removeImageAt(index)}
                          disabled={isDisabled}
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                          aria-label="Remove image"
                        >
                          <TbX className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-500">
                    Images {imageInputs.length}/{maxImageInputs}
                  </div>
                </div>
              ) : (
                <div className="mb-2 flex items-start gap-2">
                  <div className="relative">
                    {imageInputs[0].mediaType === "video" ? (
                      <video
                        src={imageInputs[0].dataUrl}
                        className="h-16 w-16 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700"
                        muted
                        playsInline
                      />
                    ) : (
                      <img
                        src={imageInputs[0].dataUrl}
                        alt="Input image"
                        className="h-16 w-16 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700"
                      />
                    )}
                    <button
                      type="button"
                      onClick={clearImageInputs}
                      disabled={isDisabled}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                      aria-label="Remove media"
                    >
                      <TbX className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="min-w-0 flex-1 pt-1">
                    <div className="truncate text-xs text-zinc-600 dark:text-zinc-400">
                      {imageInputs[0].name}
                    </div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-500">
                      {imageInputs[0].mediaType === "video" ? "Video" : "Image"} input for generation
                    </div>
                  </div>
                </div>
              )
            ) : null}

            {/* Audio input preview */}
            {hasAudioInput && props.supportsAudioInput ? (
              <div className="mb-2 flex items-center gap-2">
                <div className="relative flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 dark:border-zinc-700 dark:bg-zinc-900">
                  <TbMusic className="h-4 w-4 shrink-0 text-zinc-600 dark:text-zinc-400" />
                  <span className="truncate text-xs text-zinc-600 dark:text-zinc-400">{audioInputs[0].name}</span>
                  <button
                    type="button"
                    onClick={clearAudioInput}
                    disabled={isDisabled}
                    className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    aria-label="Remove audio"
                  >
                    <TbX className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ) : null}

            <div className={cn("flex items-start gap-2", isSidebarPrompt ? "lg:min-h-0 lg:flex-1 lg:items-stretch" : "")}>
              <div className={cn("relative flex-1 min-w-0", isSidebarPrompt ? "lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:self-stretch" : "")}>
                {useTagOverlay ? (
                  <div
                    className={[
                      "pointer-events-none absolute inset-0 whitespace-pre-wrap break-words text-sm leading-normal",
                      "text-zinc-900 dark:text-zinc-100"
                    ].join(" ")}
                  >
                    {tagOverlaySegments}
                  </div>
                ) : null}
                <textarea
                  ref={textAreaRef}
                  rows={2}
                  value={props.prompt}
                  onChange={(e) => {
                    historyIndexRef.current = -1;
                    props.onPromptChange(e.target.value);
                    updateTagContext(e.target.value, e.target.selectionStart);
                    updatePromptTagContext(e.target.value, e.target.selectionStart);
                    updatePresetTagContext(e.target.value, e.target.selectionStart);
                    queueMicrotask(autoSize);
                  }}
                  onKeyDown={(e) => {
                    if (tagOpen) {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setTagOpen(false);
                        return;
                      }
                      if (tagMatches.length > 0) {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setTagIndex((prev) => (prev + 1) % tagMatches.length);
                          return;
                        }
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setTagIndex((prev) => (prev - 1 + tagMatches.length) % tagMatches.length);
                          return;
                        }
                        if (e.key === "Enter" || e.key === "Tab") {
                          e.preventDefault();
                          const selected = tagMatches[tagIndex];
                          if (selected) applyTagSelection(selected.name);
                          return;
                        }
                      }
                    }
                    if (promptTagOpen) {
                      if (e.key === "Escape") {
                        e.preventDefault();
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
                    if (presetTagOpen) {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setPresetTagOpen(false);
                        return;
                      }
                      if (presetTagMatches.length > 0) {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setPresetTagIndex((prev) => (prev + 1) % presetTagMatches.length);
                          return;
                        }
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setPresetTagIndex((prev) => (prev - 1 + presetTagMatches.length) % presetTagMatches.length);
                          return;
                        }
                        if (e.key === "Enter" || e.key === "Tab") {
                          e.preventDefault();
                          const selected = presetTagMatches[presetTagIndex];
                          if (selected) applyPresetTagSelection(selected);
                          return;
                        }
                      }
                    }
                    // --- Prompt history navigation (terminal-style) ---
                    if (e.key === "ArrowUp" && !tagOpen && !promptTagOpen) {
                      const val = e.currentTarget.value;
                      const cursor = e.currentTarget.selectionStart ?? 0;
                      const onFirstLine = !val.slice(0, cursor).includes("\n");
                      if (onFirstLine) {
                        const hist = promptHistoryRef.current;
                        if (hist.length === 0) { /* noop */ }
                        else {
                          e.preventDefault();
                          if (historyIndexRef.current === -1) {
                            historyDraftRef.current = props.prompt;
                            historyIndexRef.current = hist.length - 1;
                          } else if (historyIndexRef.current > 0) {
                            historyIndexRef.current -= 1;
                          }
                          props.onPromptChange(hist[historyIndexRef.current]);
                        }
                        return;
                      }
                    }
                    if (e.key === "ArrowDown" && !tagOpen && !promptTagOpen) {
                      const val = e.currentTarget.value;
                      const cursor = e.currentTarget.selectionStart ?? 0;
                      const onLastLine = !val.slice(cursor).includes("\n");
                      if (onLastLine && historyIndexRef.current !== -1) {
                        e.preventDefault();
                        const hist = promptHistoryRef.current;
                        if (historyIndexRef.current < hist.length - 1) {
                          historyIndexRef.current += 1;
                          props.onPromptChange(hist[historyIndexRef.current]);
                        } else {
                          historyIndexRef.current = -1;
                          props.onPromptChange(historyDraftRef.current);
                        }
                        return;
                      }
                    }
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      if (canGenerate) { pushPromptHistory(props.prompt); props.onGenerate(); }
                    } else if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (canGenerate) { pushPromptHistory(props.prompt); props.onGenerate(); }
                    }
                  }}
                  onKeyUp={(e) => {
                    if ((tagOpen || promptTagOpen || presetTagOpen) && ["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key)) {
                      return;
                    }
                    updateTagContext(e.currentTarget.value, e.currentTarget.selectionStart);
                    updatePromptTagContext(e.currentTarget.value, e.currentTarget.selectionStart);
                    updatePresetTagContext(e.currentTarget.value, e.currentTarget.selectionStart);
                  }}
                  onClick={(e) => {
                    updateTagContext(e.currentTarget.value, e.currentTarget.selectionStart);
                    updatePromptTagContext(e.currentTarget.value, e.currentTarget.selectionStart);
                    updatePresetTagContext(e.currentTarget.value, e.currentTarget.selectionStart);
                  }}
                  onBlur={() => {
                    setTagOpen(false);
                    setPromptTagOpen(false);
                  }}
                  placeholder={
                    props.promptRequired === false
                      ? "Optional \u2013 add a description (or leave empty)"
                      : !isFirstGenCompleted()
                        ? props.outputMode === "single_audio"
                          ? 'Try: "Hello, welcome to the future of audio generation"'
                          : props.dynamicModelAssetType === "video"
                            ? 'Try: "A cat slowly turning its head toward the camera, cinematic"'
                            : 'Try: "A cozy cabin in the mountains at sunset, warm golden light"'
                        : props.outputMode === "single_audio"
                          ? "Enter text to synthesize into speech"
                          : "Describe what you want to create..."
                  }
                  disabled={isDisabled}
                  className={[
                    "relative z-10 min-w-0 w-full resize-none bg-transparent text-sm placeholder:text-zinc-500",
                    "dark:placeholder:text-zinc-500",
                    useTagOverlay ? "text-transparent caret-zinc-900 dark:caret-zinc-100" : "text-zinc-900 dark:text-zinc-100",
                    isSidebarPrompt ? "lg:h-full lg:min-h-[12rem] lg:flex-1 lg:overflow-y-auto" : "",
                    "focus:outline-none",
                    isDisabled ? "cursor-not-allowed opacity-60" : ""
                  ].join(" ")}
                />
                {props.enableLoraTagging && tagOpen ? (
                  <div
                    className={[
                      `absolute left-0 z-40 w-[20rem] overflow-hidden rounded-xl border shadow-lg ${props.promptPosition === "bottom" ? "bottom-full mb-2" : "top-full mt-2"}`,
                      "border-zinc-200 bg-white",
                      "dark:border-zinc-800 dark:bg-black"
                    ].join(" ")}
                  >
                    <div className="border-b border-zinc-200 px-3 py-2 text-[11px] uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                      Tag a LoRA
                    </div>
                    <div className="max-h-48 overflow-auto py-1">
                      {tagMatches.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400">No matches.</div>
                      ) : null}
                      {tagMatches.map((model, index) => (
                        <button
                          key={model.id}
                          type="button"
                          className={[
                            "flex w-full items-center gap-3 px-3 py-2 text-left text-sm",
                            "hover:bg-zinc-50 dark:hover:bg-zinc-950",
                            index === tagIndex ? "bg-zinc-100 dark:bg-zinc-950" : ""
                          ].join(" ")}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            applyTagSelection(model.name);
                          }}
                        >
                          <span className="text-zinc-900 dark:text-zinc-100">@{model.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {!tagOpen && promptTagOpen ? (
                  <div
                    className={[
                      `absolute left-0 z-40 w-[20rem] overflow-hidden rounded-xl border shadow-lg ${props.promptPosition === "bottom" ? "bottom-full mb-2" : "top-full mt-2"}`,
                      "border-zinc-200 bg-white",
                      "dark:border-zinc-800 dark:bg-black"
                    ].join(" ")}
                  >
                    <div className="border-b border-zinc-200 px-3 py-2 text-[11px] uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                      Insert saved prompt
                    </div>
                    <div className="max-h-48 overflow-auto py-1">
                      {promptTagMatches.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400">No matches.</div>
                      ) : null}
                      {promptTagMatches.map((prompt, index) => (
                        <button
                          key={prompt.id}
                          type="button"
                          className={[
                            "flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm",
                            "hover:bg-zinc-50 dark:hover:bg-zinc-950",
                            index === promptTagIndex ? "bg-zinc-100 dark:bg-zinc-950" : ""
                          ].join(" ")}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            applyPromptTagSelection(prompt);
                          }}
                        >
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">!{prompt.name}</span>
                          <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">{prompt.text}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {!tagOpen && !promptTagOpen && presetTagOpen ? (
                  <div
                    className={[
                      `absolute left-0 z-40 w-[20rem] overflow-hidden rounded-xl border shadow-lg ${props.promptPosition === "bottom" ? "bottom-full mb-2" : "top-full mt-2"}`,
                      "border-zinc-200 bg-white",
                      "dark:border-zinc-800 dark:bg-black"
                    ].join(" ")}
                  >
                    <div className="border-b border-zinc-200 px-3 py-2 text-[11px] uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                      Use a preset
                    </div>
                    <div className="max-h-48 overflow-auto py-1">
                      {presetTagMatches.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400">No presets found.</div>
                      ) : null}
                      {presetTagMatches.map((candidate, index) => {
                        const preset = props.presets?.find((p) => p.id === candidate.id);
                        const imgCount = preset?.image_count ?? 0;
                        const remainingSlots = maxImageInputs - imageInputs.length;
                        const willUse = Math.min(imgCount, Math.max(0, remainingSlots));
                        const isClamped = imgCount > 0 && willUse < imgCount;
                        return (
                          <button
                            key={candidate.id}
                            type="button"
                            className={[
                              "flex w-full items-center gap-3 px-3 py-2 text-left text-sm",
                              "hover:bg-zinc-50 dark:hover:bg-zinc-950",
                              index === presetTagIndex ? "bg-zinc-100 dark:bg-zinc-950" : ""
                            ].join(" ")}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              applyPresetTagSelection(candidate);
                            }}
                          >
                            <span className="text-zinc-900 dark:text-zinc-100">#{candidate.nameSlug}</span>
                            <span className="flex-1 truncate text-xs text-zinc-500 dark:text-zinc-400">{candidate.name}</span>
                            {imgCount > 0 && (
                              <span className={`shrink-0 text-[10px] ${isClamped ? "text-amber-500" : "text-zinc-400 dark:text-zinc-500"}`}>
                                {isClamped ? `${willUse}/${imgCount} imgs` : `${imgCount} img${imgCount !== 1 ? "s" : ""}`}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {pendingPromptInsert && pendingVariables.length > 0 ? (
                  <PromptVariableForm
                    variables={pendingVariables}
                    onSubmit={handleVariableSubmit}
                    onCancel={handleVariableCancel}
                  />
                ) : null}
              </div>
            </div>

            {/* Aspect ratio suffix preview */}
            {props.appendAspectRatioToPrompt && props.state.aspectRatio !== "1:1" ? (
              <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                <span className="italic">+ " , Image Size: {props.state.aspectRatio} aspect ratio"</span>
              </div>
            ) : null}
          </div>

          {/* Options row */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {props.presets && props.presets.length > 0 && props.onPresetChange ? (
              <>
                <PresetPicker
                  apiBaseUrl={props.apiBaseUrl}
                  presets={props.presets}
                  value={props.selectedPresetId ?? null}
                  onChange={props.onPresetChange}
                  disabled={isDisabled}
                  dropUp={props.promptPosition === "bottom"}
                />
                {(() => {
                  const selectedPreset = props.presets.find((p) => p.id === props.selectedPresetId);
                  if (!selectedPreset || selectedPreset.image_count === 0) return null;
                  const userImageCount = imageInputs.length;
                  const remainingSlots = maxImageInputs - userImageCount;
                  const willUse = Math.min(selectedPreset.image_count, Math.max(0, remainingSlots));
                  if (willUse >= selectedPreset.image_count) return null;
                  if (willUse === 0 && !props.supportsImageInput) {
                    return (
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                        Preset images skipped (text-only model)
                      </span>
                    );
                  }
                  return (
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                      {willUse} of {selectedPreset.image_count} preset images will be used
                    </span>
                  );
                })()}
              </>
            ) : null}

            {props.showAspectRatio || hasModelAspectRatio ? (
              <AspectRatioPicker
                value={hasModelAspectRatio
                  ? (props.state.workflowParams?.aspect_ratio as string ?? "1:1") as typeof props.state.aspectRatio
                  : props.state.aspectRatio}
                onChange={(ar) => hasModelAspectRatio
                  ? props.onStateChange({ ...props.state, workflowParams: { ...props.state.workflowParams, aspect_ratio: ar } })
                  : props.onStateChange({ ...props.state, aspectRatio: ar })}
                disabled={isDisabled}
                supportedAspectRatios={hasModelAspectRatio
                  ? props.workflowParameters?.find((p) => p.name === "aspect_ratio")?.options?.map((o) => o.value)
                  : props.supportedAspectRatios}
                dropUp={props.promptPosition === "bottom"}
              />
            ) : null}

            {props.supportsLora === true ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className={[
                    "inline-flex items-center rounded-lg border px-1.5 py-1 text-[11px] font-medium uppercase tracking-wide",
                    props.loraEnabled !== false
                      ? "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                      : "border-zinc-200 bg-white text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-600",
                    "hover:border-zinc-300 dark:hover:border-zinc-700",
                    isDisabled ? "opacity-60" : "",
                  ].join(" ")}
                  onClick={() => props.onLoraEnabledChange?.(props.loraEnabled === false)}
                  disabled={isDisabled}
                  title={props.loraEnabled !== false ? "Disable LoRA" : "Enable LoRA"}
                >
                  {props.loraEnabled !== false ? "LoRA" : "No LoRA"}
                </button>
                {props.loraEnabled !== false ? (
                  <ModelPicker
                    apiBaseUrl={props.apiBaseUrl}
                    value={props.selectedModelId}
                    onChange={props.onSelectedModelIdChange}
                    disabled={isDisabled}
                    models={props.models}
                    dropUp={props.promptPosition === "bottom"}
                  />
                ) : null}
              </div>
            ) : null}

            {props.showBatchSize ? (
              <BatchSizePicker
                value={clampBatchSize(props.state.batchSize)}
                onChange={(n) => props.onStateChange({ ...props.state, batchSize: n })}
                disabled={isDisabled}
              />
            ) : null}

            {props.showRemoveItemBackgrounds ? (
              <button
                type="button"
                className={togglePill(removeBackgroundsActive, isDisabled)}
                onClick={() =>
                  props.onStateChange({ ...props.state, removeItemBackgrounds: !props.state.removeItemBackgrounds })
                }
                disabled={isDisabled}
                aria-pressed={removeBackgroundsActive}
                aria-label="Remove item backgrounds"
                title="After full set completes, remove backgrounds from all 6 items"
              >
                <TbLayersSubtract
                  className={[
                    "h-4 w-4",
                    removeBackgroundsActive ? "text-zinc-600 dark:text-zinc-400" : "text-zinc-600 dark:text-zinc-300"
                  ].join(" ")}
                />
                <span className="text-xs font-medium">Remove Item Backgrounds</span>
              </button>
            ) : null}

            {props.supportsImageInput && !props.supportsPresets ? (
              props.lastFrameImage ? (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const files = e.target.files ? Array.from(e.target.files) : [];
                      if (files.length > 0) {
                        addImageFiles(files.slice(0, 1));
                      }
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className={togglePill(imageInputs.length > 0, isDisabled)}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isDisabled || imageInputs.length > 0}
                    aria-label="Add first frame image"
                    title="Add start frame image for image-to-video generation (optional)"
                  >
                    <TbPhoto
                      className={[
                        "h-4 w-4",
                        imageInputs.length > 0 ? "text-zinc-600 dark:text-zinc-400" : "text-zinc-600 dark:text-zinc-300"
                      ].join(" ")}
                    />
                    <span className="text-xs font-medium">
                      {imageInputs[0] ? "First Frame" : "Add First Frame"}
                    </span>
                  </button>
                  <input
                    ref={lastFrameFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setLastFrameImage(file);
                      if (lastFrameFileInputRef.current) lastFrameFileInputRef.current.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className={togglePill(imageInputs.length > 1, isDisabled)}
                    onClick={() => lastFrameFileInputRef.current?.click()}
                    disabled={isDisabled || imageInputs.length < 1 || imageInputs.length > 1}
                    aria-label="Add last frame image"
                    title={imageInputs.length < 1 ? "Add a first frame image first" : "Add end frame image (optional, requires first frame)"}
                  >
                    <TbPhoto
                      className={[
                        "h-4 w-4",
                        imageInputs.length > 1 ? "text-zinc-600 dark:text-zinc-400" : "text-zinc-600 dark:text-zinc-300"
                      ].join(" ")}
                    />
                    <span className="text-xs font-medium">
                      {imageInputs[1] ? "Last Frame" : "Add Last Frame"}
                    </span>
                  </button>
                </>
              ) : (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={acceptsVideo ? "image/*,video/mp4,video/webm,video/quicktime" : "image/*"}
                    multiple={isMultiImage}
                    className="hidden"
                    onChange={(e) => {
                      const files = e.target.files ? Array.from(e.target.files) : [];
                      if (files.length > 0) {
                        addImageFiles(files);
                      }
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className={togglePill(imageInputs.length > 0, isDisabled)}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isDisabled || !canAddMoreImages}
                    aria-label={acceptsVideo ? "Add media" : isMultiImage ? "Add images" : "Add image"}
                    title={
                      acceptsVideo
                        ? "Add image or video for generation"
                        : isMultiImage
                          ? `Add up to ${maxImageInputs} images for image-to-image generation`
                          : "Add image for image-to-image or image-to-video generation"
                    }
                  >
                    <TbPhoto
                      className={[
                        "h-4 w-4",
                        imageInputs.length > 0 ? "text-zinc-600 dark:text-zinc-400" : "text-zinc-600 dark:text-zinc-300"
                      ].join(" ")}
                    />
                    <span className="text-xs font-medium">
                      {imageInputs.length > 0
                        ? (isMultiImage ? `Images ${imageInputs.length}/${maxImageInputs}`
                          : imageInputs[0]?.mediaType === "video" ? "Video Added" : "Image Added")
                        : (acceptsVideo ? "Add Media"
                          : isMultiImage ? "Add Images" : "Add Image")}
                    </span>
                  </button>
                </>
              )
            ) : null}

            {/* Audio upload button */}
            {props.supportsAudioInput ? (
              <>
                <input
                  ref={audioFileInputRef}
                  type="file"
                  accept="audio/wav,audio/mpeg,audio/flac,audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) addAudioFile(file);
                    if (audioFileInputRef.current) audioFileInputRef.current.value = "";
                  }}
                />
                <button
                  type="button"
                  className={togglePill(hasAudioInput, isDisabled)}
                  onClick={() => audioFileInputRef.current?.click()}
                  disabled={isDisabled || hasAudioInput}
                  aria-label={hasAudioInput ? "Audio added" : "Add audio"}
                  title="Add audio file for audio-conditioned generation"
                >
                  <TbMusic
                    className={[
                      "h-4 w-4",
                      hasAudioInput ? "text-zinc-600 dark:text-zinc-400" : "text-zinc-600 dark:text-zinc-300"
                    ].join(" ")}
                  />
                  <span className="text-xs font-medium">
                    {hasAudioInput ? "Audio Added" : "Add Audio"}
                  </span>
                </button>
              </>
            ) : null}

            {/* Dynamic model picker (Replicate / FAL / OpenRouter) */}
            {props.dynamicModel && props.dynamicModelProvider ? (
              <ProviderModelPicker
                key={`${props.dynamicModelProvider}-${props.dynamicModelAssetType ?? "default"}`}
                apiBaseUrl={props.apiBaseUrl}
                provider={props.dynamicModelProvider}
                selectedModelId={props.selectedDynamicModelId ?? null}
                onSelect={(modelId, model) => props.onDynamicModelSelect?.(modelId, model)}
                onClear={() => props.onDynamicModelClear?.()}
                disabled={props.disabled}
                assetType={props.dynamicModelAssetType}
                pinnedModels={props.pinnedDynamicModels ?? []}
                onPin={(model) => props.onPinDynamicModel?.(model)}
                onUnpin={(modelId) => props.onUnpinDynamicModel?.(modelId)}
              />
            ) : null}

            {canRevert ? (
              <button
                type="button"
                className={[
                  pillBase(isDisabled),
                  "ring-2 ring-zinc-400/40 dark:ring-zinc-500/40"
                ].join(" ")}
                onClick={props.onRevertPrompt}
                disabled={isDisabled}
                aria-label="Revert to original prompt"
                title="Revert to original prompt (before enhancement)"
              >
                <TbArrowBack className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Revert</span>
              </button>
            ) : null}

          {/* Dynamic workflow parameters (aspect_ratio handled by AspectRatioPicker above) */}
          {props.workflowParameters && props.workflowParameters.filter((p) => p.name !== "aspect_ratio").length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <WorkflowParameterControls
                parameters={props.workflowParameters.filter((p) => p.name !== "aspect_ratio")}
                values={props.state.workflowParams}
                onChange={(name, value) =>
                  props.onStateChange({
                    ...props.state,
                    workflowParams: { ...props.state.workflowParams, [name]: value }
                  })
                }
                disabled={isDisabled}
                dropUp={props.promptPosition === "bottom"}
              />
            </div>
          ) : null}

          {props.dynamicModelReadme ? (
            <div className="mt-2">
              <ModelReadmeToggle readme={props.dynamicModelReadme} />
            </div>
          ) : null}

            {/* Action buttons */}
            <div className="ml-auto flex flex-shrink-0 items-center gap-1">
              {props.promptRequired !== false ? (
                <div className="relative" ref={enhancerDropdownRef}>
                  <div className={[
                    "flex items-center",
                    enhanceActive ? "animate-enhance-glow rounded-lg" : "",
                    enhanceActive && enhancerPresets.length > 1 ? "ring-2 ring-zinc-400/40 dark:ring-zinc-500/40" : "",
                  ].join(" ")}>
                    <button
                      type="button"
                      className={[
                        enhancerPresets.length > 1 ? pillBase(isDisabled) : togglePill(enhanceActive, isDisabled),
                        enhancerPresets.length > 1 ? "rounded-r-none border-r-0" : "",
                      ].join(" ")}
                      onClick={() =>
                        props.onStateChange({ ...props.state, enhancePrompt: !props.state.enhancePrompt })
                      }
                      disabled={isDisabled}
                      aria-pressed={enhanceActive}
                      aria-label="Enhance prompt"
                      title={activeEnhancerPreset ? `Enhance: ${activeEnhancerPreset.name}` : "Enhance prompt"}
                    >
                      <TbSparkles
                        className={[
                          "h-4 w-4",
                          enhanceActive ? "text-zinc-600 dark:text-zinc-400" : "text-zinc-600 dark:text-zinc-300"
                        ].join(" ")}
                      />
                    </button>
                    {enhancerPresets.length > 1 && (
                      <button
                        type="button"
                        className={[
                          "inline-flex items-center self-stretch rounded-r-lg border px-1 text-xs",
                          "border-zinc-200 bg-white text-zinc-600",
                          "hover:border-zinc-300 hover:bg-zinc-50",
                          "dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400",
                          "dark:hover:border-zinc-700 dark:hover:bg-zinc-900",
                        ].join(" ")}
                        onClick={async () => {
                          if (!enhancerDropdownOpen) {
                            try {
                              const fresh = await listEnhancerPresets();
                              setEnhancerPresets(fresh);
                            } catch { /* ignore */ }
                          }
                          setEnhancerDropdownOpen((v) => !v);
                        }}
                        aria-label="Choose enhancer preset"
                        title="Choose enhancer preset"
                      >
                        <TbChevronDown className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  {enhancerDropdownOpen && (
                    <div className={[
                      "absolute bottom-full mb-1 right-0 z-50 min-w-[200px] max-w-[280px]",
                      "rounded-lg border shadow-lg",
                      "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900",
                    ].join(" ")}>
                      <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                        Enhancer Preset
                      </div>
                      <div className="max-h-[240px] overflow-y-auto">
                        {enhancerPresets.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            className={[
                              "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
                              "hover:bg-zinc-100 dark:hover:bg-zinc-800",
                              preset.isDefault
                                ? "text-zinc-900 dark:text-zinc-100 font-medium"
                                : "text-zinc-600 dark:text-zinc-400",
                            ].join(" ")}
                            onClick={async () => {
                              try {
                                await setActiveEnhancerPreset(preset.id);
                                const updated = await listEnhancerPresets();
                                setEnhancerPresets(updated);
                                if (!enhanceActive) {
                                  props.onStateChange({ ...props.state, enhancePrompt: true });
                                }
                              } catch { /* ignore */ }
                              setEnhancerDropdownOpen(false);
                            }}
                          >
                            <span className={[
                              "h-1.5 w-1.5 rounded-full flex-shrink-0",
                              preset.isDefault ? "bg-zinc-600 dark:bg-zinc-300" : "bg-transparent",
                            ].join(" ")} />
                            <span className="truncate">{preset.name}</span>
                          </button>
                        ))}
                      </div>
                      <div className="border-t border-zinc-200 dark:border-zinc-700">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                          onClick={() => {
                            setEnhancerDropdownOpen(false);
                            props.onOpenPromptSettings?.();
                          }}
                        >
                          <TbSettings className="h-3.5 w-3.5" />
                          Manage Presets
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
              <button
                type="button"
                className={pillBase(isDisabled)}
                onClick={() => void onCopy()}
                disabled={isDisabled || !props.prompt.trim()}
                aria-label="Copy prompt"
                title={copyState === "copied" ? "Copied" : copyState === "error" ? "Copy failed" : "Copy prompt"}
              >
                <TbCopy className="h-4 w-4 text-zinc-600 dark:text-zinc-300" />
              </button>
              <button
                type="button"
                className={pillBase(isDisabled)}
                onClick={onClear}
                disabled={isDisabled || !props.prompt.trim()}
                aria-label="Clear prompt"
                title="Clear prompt"
              >
                <TbX className="h-4 w-4 text-zinc-600 dark:text-zinc-300" />
              </button>

              <button
                type="button"
                className={[
                  "ml-1 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium",
                  "bg-zinc-900 text-white hover:bg-black",
                  "dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white",
                  "focus:outline-none focus:ring-2 focus:ring-zinc-400/40 focus:ring-offset-2",
                  "focus:ring-offset-white dark:focus:ring-offset-black",
                  "disabled:cursor-not-allowed disabled:opacity-60"
                ].join(" ")}
                onClick={() => { pushPromptHistory(props.prompt); props.onGenerate(); }}
                disabled={!canGenerate}
              >
              {isEnhancing
                ? "Enhancing…"
                : props.dynamicModelLoading
                  ? "Loading model…"
                : props.dynamicModelError
                  ? "Model unavailable"
                : !props.workflowSelected
                ? "Select workflow"
                : props.supportsPresets && !hasRequiredPreset
                  ? "Select a preset"
                : props.requiresImageInput && !hasRequiredImage
                  ? (isMultiImage ? "Add images to generate" : "Add image to generate")
                : props.status === "queued"
                ? `Queued${props.queuePosition !== undefined && props.queuePosition !== null ? ` (#${props.queuePosition})` : ""}`
                : props.status === "running"
                  ? "Generating…"
                  : "Generate"}
              </button>
            </div>
          </div>

          {props.dynamicModelError && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/40">
              <span className="text-xs text-red-800 dark:text-red-200">{props.dynamicModelError}</span>
              {props.onRetryDynamicModel && (
                <button type="button" onClick={props.onRetryDynamicModel} className="shrink-0 text-xs font-medium text-red-700 hover:underline dark:text-red-300">
                  Retry
                </button>
              )}
            </div>
          )}

          {/* Missing API key banner */}
          {props.providerAvailable === false && props.engine && (
            <div className="mt-3 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/40">
              <span className="text-xs text-amber-800 dark:text-amber-200">
                This workflow needs a {props.engine === "replicate" ? "Replicate" : props.engine === "fal" ? "FAL" : props.engine === "openrouter" ? "OpenRouter" : props.engine} API key.
              </span>
              {props.onOpenApiKeys && (
                <button
                  type="button"
                  onClick={props.onOpenApiKeys}
                  className="rounded px-2 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/50"
                >
                  Add API Key
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

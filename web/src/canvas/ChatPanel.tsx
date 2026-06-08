import { useCallback, useEffect, useRef, useState } from "react";
import { TbSend, TbX, TbLoader2, TbWand, TbMessagePlus, TbPlayerStop, TbCube, TbRoute, TbTextSize, TbListDetails, TbHistory, TbTrash } from "react-icons/tb";
import { useCanvas } from "./CanvasProvider";
import { streamCanvasChat, createGeneration } from "../client";
import * as tauri from "../tauri-api";
import type { ApiBaseUrl, DiscoveredModel, WorkflowSummary, CanvasChatMessage as ApiChatMessage, CanvasNodeSummary } from "../api";
import type { Asset, Model } from "../types";
import { ReplicateModelPicker } from "../components/ReplicateModelPicker";
import type { ChatMessage, ToolCallInfo } from "./types";
import { findFreePosition, findFreePositionsForBatch, dimensionsFromAspectRatio } from "./placement";
import { aspectRatioToSize, isAspectRatio } from "../workflows";
import type { CanvasNode } from "./types";
import { MessageBubble } from "./chat/MessageBubble";
import { LoRaPicker } from "./chat/LoRaPicker";
import { WorkflowPicker } from "./chat/WorkflowPicker";
import { ConfirmDialog } from "../components/admin/ConfirmDialog";
import { buildGenerateImageRequest, validateCanvasAgentToolArgs } from "./agentTools";
import { stoppedAssistantContent } from "./chat/status";

type Props = {
  apiBaseUrl: ApiBaseUrl;
  canvasWorkflowId: string;
  selectedModelId: string;
  models: Model[];
  workflows: WorkflowSummary[];
  assetUrl: (asset: Asset) => string;
  onRegisterGeneration: (params: {
    generationId: string;
    jobId: string;
    workflowId: string;
    modelId: string;
    prompt: string;
    queuePosition?: number | null;
    imageInputUrl?: string | null;
    width?: number;
    height?: number;
  }) => void;
  onLoadingNode: (action: "add" | "update", data: any) => void;
  onClose: () => void;
  activeEngine: string;
  pinnedReplicateModels: DiscoveredModel[];
  onPinReplicateModel: (model: DiscoveredModel) => void;
  onUnpinReplicateModel: (modelId: string) => void;
};

export function ChatPanel({
  apiBaseUrl,
  canvasWorkflowId,
  selectedModelId,
  models,
  workflows,
  assetUrl,
  onRegisterGeneration,
  onLoadingNode,
  onClose,
  activeEngine,
  pinnedReplicateModels,
  onPinReplicateModel,
  onUnpinReplicateModel,
}: Props) {
  const { state, dispatch, canvasId } = useCanvas();
  const [inputText, setInputText] = useState("");
  const [threadListOpen, setThreadListOpen] = useState(false);
  const [threads, setThreads] = useState<{ id: string; title: string; updatedAt: string }[]>([]);
  const threadSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loraPickerOpen, setLoraPickerOpen] = useState(false);
  const [workflowPickerOpen, setWorkflowPickerOpen] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [waitingForFirstToken, setWaitingForFirstToken] = useState(false);
  const [autoAccept, setAutoAccept] = useState(() => localStorage.getItem("imgimg.canvas.autoAccept") === "true");
  const autoAcceptRef = useRef(autoAccept);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const loopIterationRef = useRef(0);
  // Map generationId → frameId for auto-parenting generated images into frames
  const pendingFrameForGenRef = useRef<Map<string, string>>(new Map());
  const MAX_LOOP_ITERATIONS = 5;
  const [loopStep, setLoopStep] = useState(0);
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem("imgimg.canvas.chatPanelWidth");
    return saved ? Math.max(280, Math.min(700, Number(saved))) : 380;
  });
  const TEXT_SIZES = [11, 12, 13, 14, 15, 16] as const;
  const [textSize, setTextSize] = useState(() => {
    const saved = localStorage.getItem("imgimg.canvas.chatTextSize");
    return saved ? Math.max(11, Math.min(16, Number(saved))) : 13;
  });
  const [showToolDetails, setShowToolDetails] = useState(() => localStorage.getItem("imgimg.canvas.showToolDetails") !== "false");
  const resizingRef = useRef(false);
  const [confirmNewThread, setConfirmNewThread] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const maxStepsNotifiedRef = useRef(false);

  useEffect(() => {
    autoAcceptRef.current = autoAccept;
    localStorage.setItem("imgimg.canvas.autoAccept", String(autoAccept));
  }, [autoAccept]);

  // Track whether the user is pinned to the bottom of the message list, so we
  // don't yank them back down when they've scrolled up to read while streaming.
  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  // Auto-scroll to bottom on new messages, but only if already near the bottom.
  useEffect(() => {
    if (stickToBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [state.chatMessages]);

  // Auto-save current thread to DB (debounced)
  useEffect(() => {
    if (!canvasId || state.chatMessages.length === 0 || streaming) return;
    if (threadSaveTimerRef.current) clearTimeout(threadSaveTimerRef.current);
    threadSaveTimerRef.current = setTimeout(() => {
      const threadId = state.activeThreadId || crypto.randomUUID();
      // Derive title from first user message
      const firstUser = state.chatMessages.find((m) => m.role === "user");
      const title = firstUser?.content?.slice(0, 60) || "New Thread";
      if (!state.activeThreadId) {
        dispatch({ type: "SET_ACTIVE_THREAD", threadId });
      }
      tauri.saveChatThread({ id: threadId, canvasId, title, messages: state.chatMessages as any }).catch(() => {});
    }, 1500);
    return () => { if (threadSaveTimerRef.current) clearTimeout(threadSaveTimerRef.current); };
  }, [state.chatMessages, state.activeThreadId, canvasId, streaming, dispatch]);

  // Load thread list when panel opens
  const refreshThreadList = useCallback(() => {
    if (!canvasId) return;
    tauri.listChatThreads(canvasId).then(setThreads).catch(() => {});
  }, [canvasId]);

  useEffect(() => {
    if (threadListOpen) refreshThreadList();
  }, [threadListOpen, refreshThreadList]);

  // Auto-resize textarea
  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, []);

  // Build a summary of what's on the canvas for agent context
  const buildCanvasContext = useCallback((): CanvasNodeSummary[] => {
    // First entry is a synthetic "viewport" node so the agent knows the visible area
    const vp = state.viewport;
    const vpW = (typeof window !== "undefined" ? window.innerWidth : 1200) / vp.scale;
    const vpH = (typeof window !== "undefined" ? window.innerHeight : 800) / vp.scale;
    const viewportSummary: CanvasNodeSummary = {
      id: "__viewport__",
      type: "viewport",
      width: Math.round(vpW),
      height: Math.round(vpH),
      x: Math.round(-vp.x / vp.scale),
      y: Math.round(-vp.y / vp.scale),
    };

    return [viewportSummary, ...state.nodes.map((n) => ({
      id: n.id,
      type: n.type || "image",
      prompt: n.prompt,
      assetType: n.asset?.type,
      src: n.src || undefined,
      width: n.width,
      height: n.height,
      x: n.x,
      y: n.y,
      text: n.text,
      title: n.title,
      parentFrameId: n.parentFrameId,
      locked: n.locked || undefined,
    }))];
  }, [state.nodes, state.viewport]);

  // Build conversation history for the API (excluding tool call UI state).
  // Caps at MAX_API_MESSAGES to prevent unbounded context growth.
  const MAX_API_MESSAGES = 80;

  const buildApiMessages = useCallback((source: ChatMessage[] = state.chatMessages): ApiChatMessage[] => {
    const msgs: ApiChatMessage[] = [];
    for (const m of source) {
      if (m.role === "user") {
        msgs.push({ role: "user", content: m.content });
      } else if (m.role === "assistant") {
        // Include tool calls that have been acted on (approved, rejected, completed, failed)
        const toolCalls = m.toolCalls
          ?.filter((tc) => tc.status !== "pending")
          .map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          }));
        msgs.push({
          role: "assistant",
          content: m.content || null,
          ...(toolCalls && toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        });
        // Add tool results for all resolved tool calls (including rejections)
        if (m.toolCalls) {
          for (const tc of m.toolCalls) {
            if (tc.status === "completed" || tc.status === "failed") {
              msgs.push({
                role: "tool",
                content: tc.result
                  ? JSON.stringify(tc.result)
                  : tc.status === "failed" ? "Tool execution failed" : "Tool executed successfully",
                tool_call_id: tc.id,
              });
            } else if (tc.status === "rejected") {
              // Inform the agent that the user rejected this tool call
              msgs.push({
                role: "tool",
                content: JSON.stringify({ rejected: true, reason: "User declined this generation. Adjust your approach or ask what they would prefer instead." }),
                tool_call_id: tc.id,
              });
            }
          }
        }
      }
    }

    // Cap the number of messages sent to avoid hitting context limits.
    // Keep the most recent messages, ensuring we don't break tool_call / tool pairs.
    if (msgs.length > MAX_API_MESSAGES) {
      let startIdx = msgs.length - MAX_API_MESSAGES;
      // Ensure we don't start in the middle of a tool result sequence —
      // skip forward to the next user or assistant message without tool_call_id.
      while (startIdx < msgs.length && msgs[startIdx].role === "tool") {
        startIdx++;
      }
      return msgs.slice(startIdx);
    }

    return msgs;
  }, [state.chatMessages]);

  // Handle tool call approval — dispatches to the right handler based on tool name
  const handleApproveToolCall = useCallback(
    async (messageId: string, toolCall: ToolCallInfo, precomputedPos?: { x: number; y: number }) => {
      dispatch({
        type: "UPDATE_TOOL_CALL_STATUS",
        messageId,
        toolCallId: toolCall.id,
        status: "executing",
      });

      const args = toolCall.arguments;
      let loadingNodeIdToRemove: string | null = null;
      const validationContext = { workflows, nodes: state.nodes };

      try {
        switch (toolCall.name) {
          case "generate_image": {
            const request = buildGenerateImageRequest({
              args,
              workflows,
              selectedModelId,
              activeEngine,
              selectedProviderModelId: state.selectedProviderModelId,
            });
            if (!request.ok) throw new Error(request.error);

            const pendingId = crypto.randomUUID();
            loadingNodeIdToRemove = pendingId;
            const { workflowId, prompt, aspectRatio, modelId, providerOverrides } = request.value;

            const { width: skelW, height: skelH } = dimensionsFromAspectRatio(aspectRatio);
            const pos = precomputedPos ?? findFreePosition(state.nodes, state.viewport, skelW, skelH);

            onLoadingNode("add", {
              id: pendingId,
              x: pos.x,
              y: pos.y,
              width: skelW,
              height: skelH,
              naturalWidth: skelW,
              naturalHeight: skelH,
              zIndex: 0,
              loadingStatus: "queued",
              loadingLabel: prompt.slice(0, 60),
            } satisfies CanvasNode);

            const size = aspectRatio && isAspectRatio(aspectRatio) ? aspectRatioToSize(aspectRatio) : null;

            const result = await createGeneration(apiBaseUrl, {
              modelId,
              prompt,
              workflowId,
              width: size?.width,
              height: size?.height,
              aspectRatio,
              ...providerOverrides,
            });

            onRegisterGeneration({
              generationId: result.generationId,
              jobId: result.jobId,
              workflowId,
              modelId,
              prompt,
              queuePosition: result.queuePosition,
              width: size?.width,
              height: size?.height,
            });

            dispatch({
              type: "UPDATE_TOOL_CALL_STATUS",
              messageId,
              toolCallId: toolCall.id,
              status: "completed",
              result: { generationId: result.generationId },
            });

            // Check if a create_frame in the same message created a frame — auto-parent this generation's images to it
            const msg = state.chatMessages.find((m) => m.id === messageId);
            const frameTc = msg?.toolCalls?.find((tc) => tc.name === "create_frame" && tc.result?.nodeId);
            if (frameTc) {
              pendingFrameForGenRef.current.set(result.generationId, frameTc.result!.nodeId as string);
            }

            onLoadingNode("update", {
              id: pendingId,
              updates: { loadingStatus: "running", generationId: result.generationId },
            });
            loadingNodeIdToRemove = null;
            return; // early return to skip the generic completed dispatch below
          }

          case "delete_nodes": {
            const validation = validateCanvasAgentToolArgs(toolCall.name, args, validationContext);
            if (!validation.ok) throw new Error(validation.error);
            const existing = validation.value.node_ids as string[];
            dispatch({ type: "REMOVE_NODES", ids: existing });
            dispatch({
              type: "UPDATE_TOOL_CALL_STATUS",
              messageId,
              toolCallId: toolCall.id,
              status: "completed",
              result: { success: true, deletedCount: existing.length },
            });
            return;
          }

          case "move_nodes": {
            const validation = validateCanvasAgentToolArgs(toolCall.name, args, validationContext);
            if (!validation.ok) throw new Error(validation.error);
            const moves = validation.value.moves as Array<{ node_id: string; x: number; y: number }>;
            let movedCount = 0;
            for (const move of moves) {
              dispatch({ type: "UPDATE_NODE", id: move.node_id, updates: { x: move.x, y: move.y } });
              movedCount++;
            }
            dispatch({
              type: "UPDATE_TOOL_CALL_STATUS",
              messageId,
              toolCallId: toolCall.id,
              status: "completed",
              result: { success: true, movedCount },
            });
            return;
          }

          case "add_text_note": {
            const validation = validateCanvasAgentToolArgs(toolCall.name, args, validationContext);
            if (!validation.ok) throw new Error(validation.error);
            const validated = validation.value as { text: string; color: string; x?: number; y?: number };
            const text = validated.text;
            const noteW = 200;
            const noteH = 150;
            const pos = (validated.x != null && validated.y != null)
              ? { x: validated.x, y: validated.y }
              : findFreePosition(state.nodes, state.viewport, noteW, noteH);
            const noteId = crypto.randomUUID();
            dispatch({
              type: "ADD_NODE",
              node: {
                id: noteId,
                type: "text",
                src: "",
                x: pos.x,
                y: pos.y,
                width: noteW,
                height: noteH,
                naturalWidth: noteW,
                naturalHeight: noteH,
                zIndex: state.nextZIndex ?? 1,
                text,
                stickyColor: validated.color as any,
              },
            });
            dispatch({
              type: "UPDATE_TOOL_CALL_STATUS",
              messageId,
              toolCallId: toolCall.id,
              status: "completed",
              result: { success: true, nodeId: noteId },
            });
            return;
          }

          case "create_frame": {
            const validation = validateCanvasAgentToolArgs(toolCall.name, args, validationContext);
            if (!validation.ok) throw new Error(validation.error);
            const validated = validation.value as { title: string; node_ids?: string[]; x?: number; y?: number; width?: number; height?: number };
            const title = validated.title;
            const nodeIds = validated.node_ids || [];
            const FRAME_PADDING = 40;
            let fx: number, fy: number, fw: number, fh: number;

            if (nodeIds.length > 0) {
              const childNodes = state.nodes.filter((n) => nodeIds.includes(n.id));
              if (childNodes.length > 0) {
                const minX = Math.min(...childNodes.map((n) => n.x));
                const minY = Math.min(...childNodes.map((n) => n.y));
                const maxX = Math.max(...childNodes.map((n) => n.x + n.width));
                const maxY = Math.max(...childNodes.map((n) => n.y + n.height));
                fx = minX - FRAME_PADDING;
                fy = minY - FRAME_PADDING - 30; // extra space for title
                fw = maxX - minX + FRAME_PADDING * 2;
                fh = maxY - minY + FRAME_PADDING * 2 + 30;
              } else {
                fx = validated.x ?? 0;
                fy = validated.y ?? 0;
                fw = validated.width ?? 800;
                fh = validated.height ?? 600;
              }
            } else {
              const defaultPos = findFreePosition(state.nodes, state.viewport, validated.width ?? 800, validated.height ?? 600);
              fx = validated.x ?? defaultPos.x;
              fy = validated.y ?? defaultPos.y;
              fw = validated.width ?? 800;
              fh = validated.height ?? 600;
            }

            const frameId = crypto.randomUUID();
            dispatch({
              type: "ADD_NODE",
              node: {
                id: frameId,
                type: "frame",
                src: "",
                x: fx,
                y: fy,
                width: fw,
                height: fh,
                naturalWidth: fw,
                naturalHeight: fh,
                zIndex: 0, // frames go behind
                title,
              },
            });

            // Parent the specified nodes to this frame
            if (nodeIds.length > 0) {
              dispatch({ type: "SET_PARENT_FRAME", nodeIds, frameId });
            }

            dispatch({
              type: "UPDATE_TOOL_CALL_STATUS",
              messageId,
              toolCallId: toolCall.id,
              status: "completed",
              result: { success: true, nodeId: frameId },
            });

            // Link any sibling generate_image calls to this frame for auto-parenting
            const siblingMsg = state.chatMessages.find((m) => m.id === messageId);
            siblingMsg?.toolCalls?.forEach((tc) => {
              if (tc.name === "generate_image" && tc.result?.generationId) {
                pendingFrameForGenRef.current.set(tc.result.generationId as string, frameId);
              }
            });
            return;
          }

          case "arrange_nodes": {
            const validation = validateCanvasAgentToolArgs(toolCall.name, args, validationContext);
            if (!validation.ok) throw new Error(validation.error);
            const nodeIds = validation.value.node_ids as string[];
            const arrangement = validation.value.arrangement as string;

            if (arrangement === "auto_grid" || arrangement === "auto_tree" || arrangement === "auto_masonry") {
              const mode = arrangement === "auto_tree" ? "tree" : arrangement === "auto_masonry" ? "masonry" : "grid";
              dispatch({ type: "AUTO_ARRANGE", ids: nodeIds, mode: mode as "grid" | "tree" | "masonry" });
            } else if (arrangement.startsWith("distribute_")) {
              const axis = arrangement === "distribute_horizontal" ? "horizontal" : "vertical";
              dispatch({ type: "DISTRIBUTE_NODES", ids: nodeIds, axis });
            } else {
              // align_left -> left, align_center -> center, etc.
              const edge = arrangement.replace("align_", "") as "left" | "center" | "right" | "top" | "middle" | "bottom";
              dispatch({ type: "ALIGN_NODES", ids: nodeIds, edge });
            }

            dispatch({
              type: "UPDATE_TOOL_CALL_STATUS",
              messageId,
              toolCallId: toolCall.id,
              status: "completed",
              result: { success: true, arrangedCount: nodeIds.length },
            });
            return;
          }

          case "resize_nodes": {
            const validation = validateCanvasAgentToolArgs(toolCall.name, args, validationContext);
            if (!validation.ok) throw new Error(validation.error);
            const nodeIds = validation.value.node_ids as string[];
            const target = validation.value.target as "small" | "medium" | "large" | "original";
            dispatch({ type: "NORMALIZE_SIZE", ids: nodeIds, target });

            dispatch({
              type: "UPDATE_TOOL_CALL_STATUS",
              messageId,
              toolCallId: toolCall.id,
              status: "completed",
              result: { success: true, resizedCount: nodeIds.length },
            });
            return;
          }

          default: {
            dispatch({
              type: "UPDATE_TOOL_CALL_STATUS",
              messageId,
              toolCallId: toolCall.id,
              status: "failed",
              result: { error: `Unknown tool: ${toolCall.name}` },
            });
            return;
          }
        }
      } catch (err) {
        if (loadingNodeIdToRemove) {
          dispatch({ type: "REMOVE_NODE", id: loadingNodeIdToRemove });
        }
        const msg = err instanceof Error ? err.message : "Tool execution failed";
        console.warn("[canvas-agent] tool execution failed", {
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          error: msg,
        });
        dispatch({
          type: "UPDATE_TOOL_CALL_STATUS",
          messageId,
          toolCallId: toolCall.id,
          status: "failed",
          result: { error: msg },
        });
      }
    },
    [apiBaseUrl, selectedModelId, workflows, activeEngine, state.selectedProviderModelId, state.nodes, state.viewport, state.nextZIndex, dispatch, onRegisterGeneration, onLoadingNode]
  );

  // Handle tool call rejection
  const handleRejectToolCall = useCallback(
    (messageId: string, toolCallId: string) => {
      dispatch({
        type: "UPDATE_TOOL_CALL_STATUS",
        messageId,
        toolCallId,
        status: "rejected",
      });
    },
    [dispatch]
  );

  // Abort streaming
  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    void streamReaderRef.current?.cancel();
    abortRef.current = null;
  }, []);

  // Non-generation tools that can be auto-executed without user approval
  const NON_GENERATION_TOOLS = new Set(["delete_nodes", "move_nodes", "add_text_note", "create_frame", "arrange_nodes", "resize_nodes"]);

  // Core streaming function — reusable for initial send and agentic loop continuations
  const streamAgentTurn = useCallback(async (apiMessages: ApiChatMessage[], canvasContext: CanvasNodeSummary[]): Promise<{ hadToolCalls: boolean; assistantMsgId: string }> => {
    const assistantMsgId = crypto.randomUUID();
    dispatch({
      type: "ADD_CHAT_MESSAGE",
      message: { id: assistantMsgId, role: "assistant", content: "", createdAt: Date.now() },
    });

    const controller = new AbortController();
    abortRef.current = controller;
    let accumulatedText = "";
    const toolCalls: ToolCallInfo[] = [];

    try {
      const response = await streamCanvasChat(apiBaseUrl, {
        canvasWorkflowId,
        messages: apiMessages,
        canvasContext,
        pinnedModelIds: state.pinnedModelIds.length > 0 ? state.pinnedModelIds : undefined,
        pinnedWorkflowIds: state.pinnedWorkflowIds.length > 0 ? state.pinnedWorkflowIds : undefined,
        providerModelId: activeEngine !== "comfyui" && state.selectedProviderModelId ? state.selectedProviderModelId : undefined,
      });

      if (!response.ok) {
        const errText = await response.text();
        dispatch({
          type: "UPDATE_CHAT_MESSAGE",
          id: assistantMsgId,
          updates: { content: `Error: ${errText}` },
        });
        return { hadToolCalls: false, assistantMsgId };
      }

      const reader = response.body?.getReader();
      if (!reader) {
        dispatch({
          type: "UPDATE_CHAT_MESSAGE",
          id: assistantMsgId,
          updates: { content: "Error: No response stream" },
        });
        return { hadToolCalls: false, assistantMsgId };
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let receivedDone = false;
      let stopped = false;

      try {
        streamReaderRef.current = reader;
        while (true) {
          if (controller.signal.aborted) {
            stopped = true;
            void reader.cancel();
            break;
          }

          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            if (trimmed.startsWith("event:")) continue;
            if (!trimmed.startsWith("data:")) continue;

            try {
              const data = JSON.parse(trimmed.slice(5).trim());

              if (data.content) {
                accumulatedText += data.content;
                setWaitingForFirstToken(false);
                dispatch({
                  type: "UPDATE_CHAT_MESSAGE",
                  id: assistantMsgId,
                  updates: { content: accumulatedText },
                });
              }

              if (data.tool_call) {
                setWaitingForFirstToken(false);
                if (toolCalls.some((tc) => tc.id === data.tool_call.id)) continue;
                let args: Record<string, any> = {};
                try {
                  args = JSON.parse(data.tool_call.function.arguments);
                } catch { /* malformed args */ }

                const tcInfo: ToolCallInfo = {
                  id: data.tool_call.id,
                  name: data.tool_call.function.name,
                  arguments: args,
                  status: "pending",
                };
                toolCalls.push(tcInfo);
                dispatch({
                  type: "UPDATE_CHAT_MESSAGE",
                  id: assistantMsgId,
                  updates: { toolCalls: [...toolCalls] },
                });
              }

              if (data.finish_reason) {
                receivedDone = true;
              }

              if (data.message) {
                accumulatedText += `\n\nError: ${data.message}`;
                dispatch({
                  type: "UPDATE_CHAT_MESSAGE",
                  id: assistantMsgId,
                  updates: { content: accumulatedText },
                });
              }
            } catch {
              // skip unparseable
            }
          }
        }
      } finally {
        streamReaderRef.current = null;
        reader.releaseLock();
      }

      if (stopped || controller.signal.aborted) {
        dispatch({
          type: "UPDATE_CHAT_MESSAGE",
          id: assistantMsgId,
          updates: { content: stoppedAssistantContent(accumulatedText) },
        });
        return { hadToolCalls: false, assistantMsgId };
      }

      // Detect incomplete stream
      if (!receivedDone && !controller.signal.aborted && accumulatedText.length > 0) {
        accumulatedText += "\n\n_[Response may be incomplete — connection was interrupted]_";
        dispatch({
          type: "UPDATE_CHAT_MESSAGE",
          id: assistantMsgId,
          updates: { content: accumulatedText },
        });
      }

      // Auto-execute non-generation tools immediately (they're undoable)
      // For generate_image, respect auto-accept toggle
      if (toolCalls.length > 0) {
        const nonGenPending = toolCalls.filter((tc) => tc.status === "pending" && NON_GENERATION_TOOLS.has(tc.name));
        const genPending = toolCalls.filter((tc) => tc.status === "pending" && !NON_GENERATION_TOOLS.has(tc.name));

        // Auto-execute non-generation tools
        for (const tc of nonGenPending) {
          void handleApproveToolCall(assistantMsgId, tc);
        }

        // Auto-accept generation tools if toggle is on
        if (autoAcceptRef.current && genPending.length > 0) {
          const firstAR = genPending[0]?.arguments?.aspect_ratio as string | undefined;
          const { width: batchW, height: batchH } = dimensionsFromAspectRatio(firstAR);
          const positions = findFreePositionsForBatch(state.nodes, state.viewport, genPending.length, batchW, batchH);
          genPending.forEach((tc, i) => {
            void handleApproveToolCall(assistantMsgId, tc, positions[i]);
          });
        }
      }
    } catch (err) {
      if (controller.signal.aborted) {
        dispatch({
          type: "UPDATE_CHAT_MESSAGE",
          id: assistantMsgId,
          updates: { content: stoppedAssistantContent(accumulatedText) },
        });
      } else {
        const msg = err instanceof Error ? err.message : "Chat error";
        dispatch({
          type: "UPDATE_CHAT_MESSAGE",
          id: assistantMsgId,
          updates: { content: `Error: ${msg}` },
        });
      }
    }

    return { hadToolCalls: toolCalls.length > 0, assistantMsgId };
  }, [apiBaseUrl, canvasWorkflowId, dispatch, handleApproveToolCall, state.nodes, state.viewport, state.pinnedModelIds, state.pinnedWorkflowIds, activeEngine, state.selectedProviderModelId]);

  // Auto-parent generated image nodes to frames from the same agent turn
  useEffect(() => {
    const pending = pendingFrameForGenRef.current;
    if (pending.size === 0) return;
    for (const [generationId, frameId] of pending.entries()) {
      const imageNodes = state.nodes.filter(
        (n) => n.generationId === generationId && !n.parentFrameId
      );
      if (imageNodes.length > 0) {
        dispatch({
          type: "SET_PARENT_FRAME",
          nodeIds: imageNodes.map((n) => n.id),
          frameId,
        });
        pending.delete(generationId);
      }
    }
  }, [state.nodes, dispatch]);

  // Agentic loop: when the latest assistant message has all tool calls resolved,
  // automatically send results back for follow-up reasoning
  useEffect(() => {
    if (streaming) return;

    const msgs = state.chatMessages;
    if (msgs.length === 0) return;

    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg.role !== "assistant") return;
    if (!lastMsg.toolCalls || lastMsg.toolCalls.length === 0) return;

    // Check if all tool calls are resolved (completed, failed, or rejected)
    const allResolved = lastMsg.toolCalls.every(
      (tc) => tc.status === "completed" || tc.status === "failed" || tc.status === "rejected"
    );
    if (!allResolved) return;

    // Check if any are still pending (waiting for user approval on generate_image)
    const hasPending = lastMsg.toolCalls.some((tc) => tc.status === "pending");
    if (hasPending) return;

    // Don't loop if user manually rejected all tool calls
    const allRejected = lastMsg.toolCalls.every((tc) => tc.status === "rejected");
    if (allRejected) return;

    // Reached the automatic-step cap — notify once instead of stopping silently.
    if (loopIterationRef.current >= MAX_LOOP_ITERATIONS) {
      if (!maxStepsNotifiedRef.current) {
        maxStepsNotifiedRef.current = true;
        dispatch({
          type: "ADD_CHAT_MESSAGE",
          message: {
            id: crypto.randomUUID(),
            role: "system",
            content: `Paused after ${MAX_LOOP_ITERATIONS} automatic steps. Send a message to continue.`,
            createdAt: Date.now(),
          },
        });
      }
      return;
    }

    // Trigger follow-up turn
    loopIterationRef.current++;
    setLoopStep(loopIterationRef.current);
    setStreaming(true);
    setWaitingForFirstToken(true);

    const apiMessages = buildApiMessages();
    const canvasContext = buildCanvasContext();

    void streamAgentTurn(apiMessages, canvasContext).then(() => {
      abortRef.current = null;
      setStreaming(false);
      setWaitingForFirstToken(false);
    });
  }, [state.chatMessages, streaming, buildApiMessages, buildCanvasContext, streamAgentTurn, dispatch]);

  const sendText = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || streaming) return;

    setInputText("");
    setStreaming(true);
    setWaitingForFirstToken(true);
    loopIterationRef.current = 0;
    setLoopStep(0);
    maxStepsNotifiedRef.current = false;
    stickToBottomRef.current = true;

    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    // Add user message
    dispatch({
      type: "ADD_CHAT_MESSAGE",
      message: { id: crypto.randomUUID(), role: "user", content: text, createdAt: Date.now() },
    });

    const apiMessages = buildApiMessages();
    apiMessages.push({ role: "user", content: text });

    await streamAgentTurn(apiMessages, buildCanvasContext());

    abortRef.current = null;
    setStreaming(false);
    setWaitingForFirstToken(false);
  }, [streaming, dispatch, buildApiMessages, buildCanvasContext, streamAgentTurn]);

  const handleSend = useCallback(() => {
    void sendText(inputText);
  }, [sendText, inputText]);

  // Retry: drop the failed assistant message and re-run the agent from the
  // existing history. Works for first-turn and agentic-loop-turn errors alike.
  const handleRetry = useCallback((errorMsgId: string) => {
    if (streaming) return;
    const idx = state.chatMessages.findIndex((m) => m.id === errorMsgId);
    if (idx < 0) return;
    const remaining = state.chatMessages.filter((m) => m.id !== errorMsgId);
    // Need at least one user message to have something to retry.
    if (!remaining.some((m) => m.role === "user")) return;

    dispatch({ type: "REMOVE_CHAT_MESSAGE", id: errorMsgId });
    setStreaming(true);
    setWaitingForFirstToken(true);
    loopIterationRef.current = 0;
    setLoopStep(0);
    maxStepsNotifiedRef.current = false;
    stickToBottomRef.current = true;

    void streamAgentTurn(buildApiMessages(remaining), buildCanvasContext()).then(() => {
      abortRef.current = null;
      setStreaming(false);
      setWaitingForFirstToken(false);
    });
  }, [state.chatMessages, streaming, dispatch, buildApiMessages, buildCanvasContext, streamAgentTurn]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startWidth = panelWidth;

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = startX - ev.clientX; // dragging left = wider
      const newWidth = Math.max(280, Math.min(700, startWidth + delta));
      setPanelWidth(newWidth);
    };

    const onMouseUp = () => {
      resizingRef.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setPanelWidth((w) => {
        localStorage.setItem("imgimg.canvas.chatPanelWidth", String(w));
        return w;
      });
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [panelWidth]);

  return (
    <div
      className="pointer-events-auto relative flex h-full shrink-0 flex-col overflow-hidden rounded-xl border border-zinc-200/60 shadow-lg backdrop-blur-xl bg-white/70 dark:border-zinc-700/60 dark:bg-zinc-900/70"
      style={{ width: panelWidth }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize hover:bg-zinc-400/30 active:bg-zinc-400/50 transition-colors"
      />
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200/60 px-4 py-3 dark:border-zinc-700/60">
        <div className="flex items-center gap-2">
          <TbWand size={16} className="text-zinc-500" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Canvas Agent</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setWorkflowPickerOpen((p) => !p); setLoraPickerOpen(false); }}
            className={`rounded p-1 transition-colors ${state.pinnedWorkflowIds.length > 0 ? "text-accent-sky hover:bg-accent-sky/10" : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"}`}
            title={`Workflows (${state.pinnedWorkflowIds.length} pinned)`}
          >
            <TbRoute size={16} />
          </button>
          {activeEngine === "comfyui" && (
            <button
              onClick={() => { setLoraPickerOpen((p) => !p); setWorkflowPickerOpen(false); }}
              className={`rounded p-1 transition-colors ${state.pinnedModelIds.length > 0 ? "text-accent-sky hover:bg-accent-sky/10" : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"}`}
              title={`LoRA models (${state.pinnedModelIds.length} pinned)`}
            >
              <TbCube size={16} />
            </button>
          )}
          <button
            onClick={() => {
              const idx = TEXT_SIZES.indexOf(textSize as typeof TEXT_SIZES[number]);
              const next = TEXT_SIZES[(idx + 1) % TEXT_SIZES.length];
              setTextSize(next);
              localStorage.setItem("imgimg.canvas.chatTextSize", String(next));
            }}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            title={`Text size: ${textSize}px (click to cycle)`}
          >
            <TbTextSize size={16} />
          </button>
          <button
            onClick={() => {
              const next = !showToolDetails;
              setShowToolDetails(next);
              localStorage.setItem("imgimg.canvas.showToolDetails", String(next));
            }}
            className={`rounded p-1 transition-colors ${showToolDetails ? "text-accent-sky hover:bg-accent-sky/10" : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"}`}
            title={showToolDetails ? "Hide tool call details" : "Show tool call details"}
          >
            <TbListDetails size={16} />
          </button>
          <button
            onClick={() => { setThreadListOpen((p) => !p); setLoraPickerOpen(false); setWorkflowPickerOpen(false); }}
            className={`rounded p-1 transition-colors ${threadListOpen ? "text-accent-sky hover:bg-accent-sky/10" : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"}`}
            title="Thread history"
          >
            <TbHistory size={16} />
          </button>
          <button
            onClick={() => {
              if (state.chatMessages.length === 0) {
                dispatch({ type: "CLEAR_CHAT" });
                setThreadListOpen(false);
              } else {
                setConfirmNewThread(true);
              }
            }}
            disabled={streaming}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            title="New thread"
          >
            <TbMessagePlus size={16} />
          </button>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <TbX size={16} />
          </button>
        </div>
      </div>

      {/* Pinned LoRAs bar (comfyui only) */}
      {activeEngine === "comfyui" && state.pinnedModelIds.length > 0 && !loraPickerOpen && (
        <div className="flex flex-wrap items-center gap-1 border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
          <TbCube size={12} className="shrink-0 text-zinc-400" />
          {state.pinnedModelIds.map((id) => {
            const model = models.find((m) => m.id === id);
            return (
              <span key={id} className="inline-flex items-center gap-1 rounded-full bg-accent-sky/15 px-2 py-0.5 text-[11px] font-medium text-accent-sky dark:bg-accent-sky/20">
                {model?.name ?? id}
                <button
                  onClick={() => dispatch({ type: "SET_PINNED_MODELS", modelIds: state.pinnedModelIds.filter((mid) => mid !== id) })}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-accent-sky/20 dark:hover:bg-accent-sky/30"
                >
                  <TbX size={10} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* LoRA picker popover (comfyui only) */}
      {activeEngine === "comfyui" && loraPickerOpen && (
        <LoRaPicker
          models={models}
          pinnedIds={state.pinnedModelIds}
          onChangePinned={(ids) => dispatch({ type: "SET_PINNED_MODELS", modelIds: ids })}
          onClose={() => setLoraPickerOpen(false)}
        />
      )}

      {/* Pinned workflows bar */}
      {state.pinnedWorkflowIds.length > 0 && !workflowPickerOpen && (
        <div className="flex flex-wrap items-center gap-1 border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
          <TbRoute size={12} className="shrink-0 text-zinc-400" />
          {state.pinnedWorkflowIds.map((id) => {
            const wf = workflows.find((w) => w.id === id);
            return (
              <span key={id} className="inline-flex items-center gap-1 rounded-full bg-accent-sky/15 px-2 py-0.5 text-[11px] font-medium text-accent-sky dark:bg-accent-sky/20">
                {wf?.label ?? id}
                <button
                  onClick={() => dispatch({ type: "SET_PINNED_WORKFLOWS", workflowIds: state.pinnedWorkflowIds.filter((wid) => wid !== id) })}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-accent-sky/20 dark:hover:bg-accent-sky/30"
                >
                  <TbX size={10} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Workflow picker popover */}
      {workflowPickerOpen && (
        <WorkflowPicker
          workflows={workflows}
          pinnedIds={state.pinnedWorkflowIds}
          onChangePinned={(ids) => dispatch({ type: "SET_PINNED_WORKFLOWS", workflowIds: ids })}
          onClose={() => setWorkflowPickerOpen(false)}
        />
      )}

      {/* Thread history panel */}
      {threadListOpen && (
        <div className="flex max-h-[300px] flex-col border-b border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Thread History</span>
            <button
              onClick={() => setThreadListOpen(false)}
              className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            >
              <TbX size={14} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {threads.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-zinc-400">No saved threads yet</p>
            )}
            {threads.map((t) => (
              <button
                key={t.id}
                onClick={async () => {
                  const thread = await tauri.getChatThread(t.id);
                  if (thread) {
                    dispatch({ type: "LOAD_THREAD", threadId: thread.id, messages: thread.messages as any });
                    setThreadListOpen(false);
                  }
                }}
                className={`flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800 ${state.activeThreadId === t.id ? "bg-accent-sky/10" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">{t.title}</div>
                  <div className="text-[10px] text-zinc-400">{new Date(t.updatedAt).toLocaleDateString()}</div>
                </div>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    await tauri.deleteChatThread(t.id);
                    if (state.activeThreadId === t.id) {
                      dispatch({ type: "CLEAR_CHAT" });
                    }
                    refreshThreadList();
                  }}
                  className="shrink-0 rounded p-0.5 text-zinc-300 hover:text-red-500 dark:text-zinc-600 dark:hover:text-red-400"
                  title="Delete thread"
                >
                  <TbTrash size={12} />
                </button>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Provider model picker (non-comfyui engines) */}
      {activeEngine !== "comfyui" && (
        <div className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
          <ReplicateModelPicker
            apiBaseUrl={apiBaseUrl}
            selectedModelId={state.selectedProviderModelId}
            onSelect={(modelId) => dispatch({ type: "SET_PROVIDER_MODEL", modelId })}
            onClear={() => dispatch({ type: "SET_PROVIDER_MODEL", modelId: null })}
            assetType="image"
            pinnedModels={pinnedReplicateModels}
            onPin={onPinReplicateModel}
            onUnpin={onUnpinReplicateModel}
          />
        </div>
      )}

      {/* Messages */}
      <div ref={messagesContainerRef} onScroll={handleMessagesScroll} className="min-h-0 flex-1 overflow-y-auto px-4 py-4" style={{ fontSize: `${textSize}px` }}>
        {state.chatMessages.length === 0 && !streaming && (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-sm text-zinc-400 dark:text-zinc-500">
              Describe what you want to create.
              <br />
              The agent will pick the right workflow and generate images for your canvas.
            </p>
          </div>
        )}
        {state.chatMessages.map((msg, i) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            assetUrl={assetUrl}
            workflows={workflows}
            textSize={textSize}
            showToolDetails={showToolDetails}
            isStreaming={streaming && !waitingForFirstToken && i === state.chatMessages.length - 1 && msg.role === "assistant"}
            onApproveToolCall={(tc) => handleApproveToolCall(msg.id, tc)}
            onRejectToolCall={(tcId) => handleRejectToolCall(msg.id, tcId)}
            onRetry={() => handleRetry(msg.id)}
            onDismiss={() => dispatch({ type: "REMOVE_CHAT_MESSAGE", id: msg.id })}
          />
        ))}
        {/* Suggestion chips after agent finishes */}
        {!streaming && state.chatMessages.length > 0 && (() => {
          const lastMsg = state.chatMessages[state.chatMessages.length - 1];
          if (lastMsg.role !== "assistant") return null;
          const hadGen = lastMsg.toolCalls?.some((tc) => tc.name === "generate_image" && tc.status === "completed");
          const hadNote = lastMsg.toolCalls?.some((tc) => tc.name === "add_text_note" && tc.status === "completed");
          const suggestions: string[] = [];
          if (hadGen) {
            suggestions.push("Generate another variation");
            suggestions.push("Try a different style");
            suggestions.push("Generate 4 variations");
          } else if (hadNote) {
            suggestions.push("Illustrate this concept");
            suggestions.push("Expand on this idea");
          }
          if (state.nodes.length > 3) {
            suggestions.push("Organize the canvas");
          }
          if (suggestions.length === 0) return null;
          return (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => void sendText(s)}
                  className="rounded-full border border-zinc-200 px-3 py-1 text-[0.8em] text-zinc-600 transition-colors hover:border-accent-sky hover:text-accent-sky dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-accent-sky dark:hover:text-accent-sky"
                >
                  {s}
                </button>
              ))}
            </div>
          );
        })()}
        {waitingForFirstToken && (
          <div className="mb-3 flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl bg-zinc-100 px-3.5 py-2.5 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              <TbLoader2 className="animate-spin" size={14} />
              {loopStep > 0 ? `Agent working... (step ${loopStep + 1}/${MAX_LOOP_ITERATIONS + 1})` : "Thinking..."}
            </div>
            <button
              onClick={handleStop}
              className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
              title="Stop"
            >
              <TbPlayerStop size={14} />
            </button>
          </div>
        )}
        {streaming && !waitingForFirstToken && (
          <div className="mb-3 flex justify-start">
            <button
              onClick={handleStop}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-[0.85em] text-zinc-500 transition-colors hover:border-red-300 hover:text-red-500 dark:border-zinc-700 dark:hover:border-red-800 dark:hover:text-red-400"
            >
              <TbPlayerStop size={12} />
              Stop
            </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
        <label className="mb-2 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={autoAccept}
            onChange={(e) => setAutoAccept(e.target.checked)}
            className="h-3.5 w-3.5 rounded accent-zinc-600"
          />
          Auto-generate (skip confirmation)
        </label>
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              resizeTextarea();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Describe what to create..."
            disabled={streaming}
            rows={1}
            className="min-h-[36px] max-h-[120px] flex-1 resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500 disabled:opacity-50"
          />
          <button
            onClick={() => void handleSend()}
            disabled={!inputText.trim() || streaming}
            className="rounded-lg bg-zinc-600 p-2 text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <TbSend size={16} />
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmNewThread}
        title="Start a new thread?"
        message="This clears the current conversation from the panel. Saved threads stay in your history."
        confirmLabel="New Thread"
        cancelLabel="Cancel"
        isDestructive={false}
        onConfirm={() => {
          dispatch({ type: "CLEAR_CHAT" });
          setThreadListOpen(false);
          setConfirmNewThread(false);
        }}
        onCancel={() => setConfirmNewThread(false)}
      />
    </div>
  );
}

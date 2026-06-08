import { memo } from "react";
import { TbRefresh, TbTrash, TbCopy } from "react-icons/tb";
import Markdown from "react-markdown";
import type { Components } from "react-markdown";
import type { WorkflowSummary } from "../../api";
import type { Asset } from "../../types";
import type { ChatMessage, ToolCallInfo } from "../types";
import { copyToClipboard } from "../../utils/clipboard";
import { openExternalUrl } from "../../tauri-api";
import { ToolCallCard } from "./ToolCallCard";

export type MessageBubbleProps = {
  message: ChatMessage;
  assetUrl: (asset: Asset) => string;
  workflows: WorkflowSummary[];
  textSize: number;
  showToolDetails: boolean;
  isStreaming?: boolean;
  onApproveToolCall: (tc: ToolCallInfo) => void;
  onRejectToolCall: (tcId: string) => void;
  onRetry: () => void;
  onDismiss: () => void;
};

// Route links in agent output to the OS browser instead of navigating the
// app's own webview away from the canvas.
const markdownComponents: Components = {
  a({ href, children }) {
    return (
      <a
        href={href}
        onClick={(e) => {
          e.preventDefault();
          if (href) void openExternalUrl(href);
        }}
        className="cursor-pointer text-accent-sky underline underline-offset-2 hover:opacity-80"
      >
        {children}
      </a>
    );
  },
};

export const MessageBubble = memo(function MessageBubble({ message, workflows, showToolDetails, isStreaming, onApproveToolCall, onRejectToolCall, onRetry, onDismiss }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const isError = !isUser && !isSystem && message.content?.startsWith("Error:");

  // System notices render as a centered, muted line (e.g. agentic loop cap reached)
  if (isSystem) {
    if (!message.content) return null;
    return (
      <div className="my-2 flex justify-center px-4">
        <span className="text-center text-[0.85em] italic text-zinc-400 dark:text-zinc-500">{message.content}</span>
      </div>
    );
  }

  // Don't render empty assistant placeholders (they get cleaned up, but guard here too)
  if (!isUser && !message.content && !message.toolCalls?.length) return null;

  return (
    <div className={`group flex items-end gap-1 ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={[
          "max-w-[90%] rounded-xl px-3.5 py-2.5",
          isUser
            ? "bg-zinc-600 text-white"
            : isError
              ? "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300"
              : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100",
        ].join(" ")}
      >
        {/* Message text */}
        {message.content && (
          isUser || isError ? (
            <p className="whitespace-pre-wrap">{isError ? message.content.replace(/^Error:\s*/, "") : message.content}</p>
          ) : (
            <div className="prose prose-zinc max-w-none dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:my-1" style={{ fontSize: "inherit" }}>
              <Markdown components={markdownComponents}>{message.content}</Markdown>
            </div>
          )
        )}

        {/* Streaming caret — blinks while the agent is still producing this message */}
        {isStreaming && (
          <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-current align-text-bottom" aria-hidden />
        )}

        {/* Error action buttons */}
        {isError && (
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={onRetry}
              className="flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            >
              <TbRefresh size={12} />
              Retry
            </button>
            <button
              onClick={onDismiss}
              className="flex items-center gap-1 text-xs font-medium text-red-600/60 hover:text-red-700 dark:text-red-400/60 dark:hover:text-red-300"
            >
              <TbTrash size={12} />
              Dismiss
            </button>
          </div>
        )}

        {/* Tool calls with confirmation UI */}
        {message.toolCalls?.map((tc) => (
          <ToolCallCard
            key={tc.id}
            toolCall={tc}
            workflows={workflows}
            showDetails={showToolDetails}
            onApprove={() => onApproveToolCall(tc)}
            onReject={() => onRejectToolCall(tc.id)}
          />
        ))}
      </div>

      {/* Copy button — hover-reveal beside finished assistant messages */}
      {!isUser && !isError && message.content && (
        <button
          type="button"
          onClick={() => void copyToClipboard(message.content)}
          title="Copy message"
          aria-label="Copy message"
          className="mb-1 shrink-0 rounded p-1 text-zinc-400 opacity-0 transition-opacity hover:bg-zinc-100 hover:text-zinc-600 group-hover:opacity-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <TbCopy size={13} />
        </button>
      )}
    </div>
  );
});

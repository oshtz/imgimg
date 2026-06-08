import { memo } from "react";
import { TbWand, TbX, TbCheck, TbLoader2 } from "react-icons/tb";
import type { ToolCallInfo } from "../types";
import type { WorkflowSummary } from "../../api";

export type ToolCallCardProps = {
  toolCall: ToolCallInfo;
  workflows: WorkflowSummary[];
  showDetails: boolean;
  onApprove: () => void;
  onReject: () => void;
};

export const TOOL_LABELS: Record<string, string> = {
  generate_image: "Generate Image",
  delete_nodes: "Delete Nodes",
  move_nodes: "Move Nodes",
  add_text_note: "Add Text Note",
  create_frame: "Create Frame",
  arrange_nodes: "Arrange Nodes",
  resize_nodes: "Resize Nodes",
};

export function formatToolArgs(name: string, args: Record<string, any>, workflows: WorkflowSummary[]): React.ReactNode {
  switch (name) {
    case "generate_image": {
      const workflowLabel = workflows.find((w) => w.id === args.workflow_id)?.label ?? args.workflow_id;
      return (
        <div className="space-y-1">
          <div><span className="font-medium">Workflow:</span> {workflowLabel}</div>
          <div><span className="font-medium">Prompt:</span> {args.prompt}</div>
          {args.model_id && <div><span className="font-medium">Model:</span> {args.model_id}</div>}
          {args.aspect_ratio && <div><span className="font-medium">Aspect Ratio:</span> {args.aspect_ratio}</div>}
        </div>
      );
    }
    case "delete_nodes":
      return <div><span className="font-medium">Nodes:</span> {(args.node_ids as string[])?.join(", ")}</div>;
    case "move_nodes":
      return <div>{(args.moves as Array<{ node_id: string; x: number; y: number }>)?.map((m) => (
        <div key={m.node_id}><span className="font-medium">{m.node_id}:</span> ({m.x}, {m.y})</div>
      ))}</div>;
    case "add_text_note":
      return (
        <div className="space-y-1">
          <div><span className="font-medium">Text:</span> {args.text}</div>
          {args.color && <div><span className="font-medium">Color:</span> {args.color}</div>}
        </div>
      );
    case "create_frame":
      return (
        <div className="space-y-1">
          <div><span className="font-medium">Title:</span> {args.title}</div>
          {args.node_ids?.length > 0 && <div><span className="font-medium">Nodes:</span> {args.node_ids.join(", ")}</div>}
        </div>
      );
    case "arrange_nodes":
      return (
        <div className="space-y-1">
          <div><span className="font-medium">Arrangement:</span> {(args.arrangement as string)?.replace(/_/g, " ")}</div>
          <div><span className="font-medium">Nodes:</span> {(args.node_ids as string[])?.join(", ")}</div>
        </div>
      );
    case "resize_nodes":
      return (
        <div className="space-y-1">
          <div><span className="font-medium">Target:</span> {args.target}</div>
          <div><span className="font-medium">Nodes:</span> {(args.node_ids as string[])?.join(", ")}</div>
        </div>
      );
    default:
      return <div>{JSON.stringify(args, null, 2)}</div>;
  }
}

export const ToolCallCard = memo(function ToolCallCard({ toolCall, workflows, showDetails, onApprove, onReject }: ToolCallCardProps) {
  const isPending = toolCall.status === "pending";
  const isExecuting = toolCall.status === "executing";
  const isCompleted = toolCall.status === "completed";
  const isRejected = toolCall.status === "rejected";
  const isFailed = toolCall.status === "failed";
  const label = TOOL_LABELS[toolCall.name] || toolCall.name;

  // Compact mode: just show tool name + status badge inline
  if (!showDetails && !isPending) {
    return (
      <div className="mt-1.5 flex items-center gap-1.5 text-[0.8em] text-zinc-500 dark:text-zinc-400">
        <TbWand size={11} className="shrink-0" />
        <span className="font-medium">{label}</span>
        {isCompleted && <TbCheck size={11} className="text-emerald-500" />}
        {isRejected && <span className="text-red-400">rejected</span>}
        {isFailed && <span className="text-red-400">failed</span>}
        {isExecuting && <TbLoader2 className="animate-spin" size={11} />}
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-zinc-200 bg-white p-3 text-[0.9em] dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-2 flex items-center gap-2">
        <TbWand size={14} className="text-zinc-500" />
        <span className="font-semibold text-zinc-700 dark:text-zinc-300">{label}</span>
        {isCompleted && <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[0.8em] font-medium text-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-400">Done</span>}
        {isRejected && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[0.8em] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">Rejected</span>}
        {isFailed && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[0.8em] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">Failed</span>}
        {isExecuting && <TbLoader2 className="animate-spin text-zinc-500" size={14} />}
      </div>

      <div className="text-[0.9em] text-zinc-600 dark:text-zinc-400">
        {formatToolArgs(toolCall.name, toolCall.arguments, workflows)}
      </div>

      {isFailed && toolCall.result?.error && (
        <p className="mt-2 text-[0.9em] text-red-500">{toolCall.result.error}</p>
      )}

      {/* Confirmation buttons — only shown for generate_image pending calls */}
      {isPending && (
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={onApprove}
            className="flex items-center gap-1 rounded-lg bg-zinc-600 px-3 py-1.5 text-[0.85em] font-medium text-white transition-colors hover:bg-zinc-700"
          >
            <TbCheck size={14} />
            Approve
          </button>
          <button
            onClick={onReject}
            className="flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-[0.85em] font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <TbX size={14} />
            Reject
          </button>
        </div>
      )}
    </div>
  );
});

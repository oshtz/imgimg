import { useState, useEffect, useMemo } from "react";
import { TbRefresh, TbSearch, TbPhoto, TbTrash, TbLoader2 } from "react-icons/tb";
import type { ApiBaseUrl, AdminWorkflowSummary } from "../../api";
import * as tauri from "../../tauri-api";
import type { Generation, GenerationStatus, Asset } from "../../types";
import { resolveStorageUrl } from "../../utils/assets";
import { ConfirmDialog } from "./ConfirmDialog";
import { CopyableText } from "../CopyableText";

interface GenerationsSectionProps {
  apiBaseUrl: ApiBaseUrl;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getStatusColor(status: GenerationStatus): { bg: string; text: string; dot: string } {
  switch (status) {
    case "queued":
      return { bg: "bg-zinc-500/10", text: "text-zinc-500", dot: "bg-zinc-400" };
    case "running":
      return { bg: "bg-accent-sky/10", text: "text-accent-sky", dot: "bg-accent-sky" };
    case "succeeded":
      return { bg: "bg-accent-forest/10", text: "text-accent-forest", dot: "bg-accent-forest" };
    case "failed":
      return { bg: "bg-red-500/10", text: "text-red-400", dot: "bg-red-400" };
    default:
      return { bg: "bg-zinc-500/10", text: "text-zinc-500", dot: "bg-zinc-400" };
  }
}

function getStatusLabel(status: GenerationStatus): string {
  switch (status) {
    case "queued":
      return "Pending";
    case "running":
      return "Processing";
    case "succeeded":
      return "Done";
    case "failed":
      return "Error";
    default:
      return status;
  }
}

function getPreviewAsset(generation: Generation): Asset | null {
  // Try to get first visible asset, preferring non-system types
  const visible = generation.assets.find(
    (a) => a.type !== "rembg" && a.type !== "preview" && a.type !== "placeholder"
  );
  if (visible) return visible;

  const preview = generation.assets.find((a) => a.type === "preview");
  if (preview) return preview;

  return generation.assets[0] ?? null;
}

function buildAssetUrl(apiBaseUrl: ApiBaseUrl, asset: Asset): string {
  return resolveStorageUrl(apiBaseUrl, asset.url);
}

export function GenerationsSection({ apiBaseUrl }: GenerationsSectionProps) {
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [workflows, setWorkflows] = useState<AdminWorkflowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<GenerationStatus | "all">("all");
  const [workflowFilter, setWorkflowFilter] = useState<string>("all");

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [generationToDelete, setGenerationToDelete] = useState<Generation | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [gens, rawWorkflows] = await Promise.all([
        tauri.listGenerations(),
        tauri.listWorkflows(),
      ]);
      setGenerations(gens as Generation[]);
      const mapped: AdminWorkflowSummary[] = (rawWorkflows as any[]).map((w: any) => ({
        id: w.id,
        label: w.label ?? w.meta?.label ?? w.id,
        engine: w.engine ?? w.meta?.engine ?? "comfyui",
        regenOnly: false,
      } as AdminWorkflowSummary));
      setWorkflows(mapped);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load generations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [apiBaseUrl]);

  // Filtered generations
  const filteredGenerations = useMemo(() => {
    return generations.filter((g) => {
      // Status filter
      if (statusFilter !== "all" && g.status !== statusFilter) {
        return false;
      }

      // Workflow filter
      if (workflowFilter !== "all" && g.workflowUsed !== workflowFilter) {
        return false;
      }

      return true;
    });
  }, [generations, statusFilter, workflowFilter]);

  // Get unique workflows from generations for the filter dropdown
  const workflowOptions = useMemo(() => {
    const unique = new Set(generations.map((g) => g.workflowUsed));
    return Array.from(unique).sort();
  }, [generations]);

  const handleDeleteClick = (g: Generation) => {
    setGenerationToDelete(g);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!generationToDelete) return;
    setDeleting(true);
    try {
      await tauri.deleteGeneration(generationToDelete.id);
      setGenerations((prev) => prev.filter((g) => g.id !== generationToDelete.id));
      setDeleteDialogOpen(false);
      setGenerationToDelete(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete generation");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setGenerationToDelete(null);
  };

  // Get workflow label
  const getWorkflowLabel = (workflowId: string): string => {
    const wf = workflows.find((w) => w.id === workflowId);
    return wf?.label ?? workflowId;
  };

  // Count by status
  const statusCounts = useMemo(() => {
    const counts: Record<GenerationStatus, number> = {
      queued: 0,
      running: 0,
      cancel_requested: 0,
      cancelled: 0,
      interrupted: 0,
      succeeded: 0,
      failed: 0
    };
    for (const g of generations) {
      counts[g.status]++;
    }
    return counts;
  }, [generations]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">All Generations</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">View and manage all generations</p>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        {/* Status filter */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-zinc-600 dark:text-zinc-400">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as GenerationStatus | "all")}
            className={[
              "rounded-lg border px-3 py-2",
              "border-zinc-300 bg-white text-sm text-zinc-900",
              "dark:border-zinc-700 dark:bg-black dark:text-zinc-100",
              "focus:border-zinc-500/50 focus:outline-none focus:ring-1 focus:ring-zinc-500/50"
            ].join(" ")}
          >
            <option value="all">All</option>
            <option value="queued">Pending ({statusCounts.queued})</option>
            <option value="running">Processing ({statusCounts.running})</option>
            <option value="succeeded">Done ({statusCounts.succeeded})</option>
            <option value="failed">Error ({statusCounts.failed})</option>
          </select>
        </div>

        {/* Workflow filter */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-zinc-600 dark:text-zinc-400">Workflow:</label>
          <select
            value={workflowFilter}
            onChange={(e) => setWorkflowFilter(e.target.value)}
            className={[
              "rounded-lg border px-3 py-2",
              "border-zinc-300 bg-white text-sm text-zinc-900",
              "dark:border-zinc-700 dark:bg-black dark:text-zinc-100",
              "focus:border-zinc-500/50 focus:outline-none focus:ring-1 focus:ring-zinc-500/50"
            ].join(" ")}
          >
            <option value="all">All</option>
            {workflowOptions.map((wf) => (
              <option key={wf} value={wf}>
                {getWorkflowLabel(wf)}
              </option>
            ))}
          </select>
        </div>

        {/* Refresh button */}
        <button
          type="button"
          onClick={() => loadData()}
          disabled={loading}
          className={[
            "inline-flex items-center gap-2 rounded-lg px-4 py-2",
            "border border-zinc-300 bg-white text-sm font-medium text-zinc-700",
            "dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
            "hover:border-zinc-400 hover:bg-zinc-50",
            "dark:hover:border-zinc-600 dark:hover:bg-zinc-800",
            "focus:outline-none focus:ring-2 focus:ring-zinc-500/50",
            "disabled:cursor-not-allowed disabled:opacity-50"
          ].join(" ")}
        >
          <TbRefresh className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Summary */}
      <div className="text-sm text-zinc-500 dark:text-zinc-400">
        Showing {filteredGenerations.length} of {generations.length} generations
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && generations.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <TbLoader2 className="h-8 w-8 animate-spin text-zinc-500" />
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">Loading generations...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && generations.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-900">
            <TbPhoto className="h-8 w-8 text-zinc-400 dark:text-zinc-500" />
          </div>
          <h3 className="mt-4 text-lg font-medium text-zinc-700 dark:text-zinc-300">No Generations</h3>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            No generations have been created yet.
          </p>
        </div>
      )}

      {/* No match state */}
      {!loading && generations.length > 0 && filteredGenerations.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-900">
            <TbSearch className="h-8 w-8 text-zinc-400 dark:text-zinc-500" />
          </div>
          <h3 className="mt-4 text-lg font-medium text-zinc-700 dark:text-zinc-300">No Matching Generations</h3>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Try adjusting your filters to find what you're looking for.
          </p>
        </div>
      )}

      {/* Generations List */}
      {filteredGenerations.length > 0 && (
        <div className="max-h-[calc(100vh-450px)] space-y-3 overflow-y-auto pr-2">
          {filteredGenerations.map((g) => {
            const previewAsset = getPreviewAsset(g);
            const statusColors = getStatusColor(g.status);

            return (
              <div
                key={g.id}
                className="rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
              >
                <div className="flex gap-4">
                  {/* Thumbnail */}
                  <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
                    {previewAsset ? (
                      <img
                        src={buildAssetUrl(apiBaseUrl, previewAsset)}
                        alt="Generation preview"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <TbPhoto className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    {/* Top row: ID and Status */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">ID:</span>
                          <span className="truncate font-mono text-xs text-zinc-700 dark:text-zinc-300" title={g.id}>
                            {g.id}
                          </span>
                        </div>
                      </div>

                      {/* Status badge */}
                      <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${statusColors.bg}`}>
                        <span className={`h-2 w-2 rounded-full ${statusColors.dot} ${g.status === "running" ? "animate-pulse" : ""}`} />
                        <span className={`text-xs font-medium ${statusColors.text}`}>
                          {getStatusLabel(g.status)}
                        </span>
                      </div>
                    </div>

                    {/* Workflow */}
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">Workflow:</span>
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">{getWorkflowLabel(g.workflowUsed)}</span>
                    </div>

                    {/* Prompt */}
                    <div className="mt-2">
                      <CopyableText
                        text={g.prompt}
                        className="block line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400"
                      >
                        {g.prompt}
                      </CopyableText>
                    </div>

                    {/* Bottom row: Timestamp and Actions */}
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400" title={new Date(g.createdAt).toLocaleString()}>
                        Created: {formatRelativeTime(g.createdAt)}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleDeleteClick(g)}
                        disabled={deleting}
                        className={[
                          "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5",
                          "text-xs font-medium",
                          "border border-red-200 bg-red-50 text-red-700",
                          "dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400",
                          "hover:border-red-300 hover:bg-red-100",
                          "dark:hover:border-red-500/50 dark:hover:bg-red-500/20",
                          "focus:outline-none focus:ring-2 focus:ring-red-500/50",
                          "disabled:cursor-not-allowed disabled:opacity-50"
                        ].join(" ")}
                      >
                        <TbTrash className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>

                    {/* Error message if failed */}
                    {g.status === "failed" && g.error && (
                      <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
                        {g.error}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        title="Delete Generation"
        message={`Are you sure you want to delete generation "${generationToDelete?.id}"? This will permanently remove all associated assets and cannot be undone.`}
        confirmLabel={deleting ? "Deleting..." : "Delete"}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        isDestructive
      />
    </div>
  );
}

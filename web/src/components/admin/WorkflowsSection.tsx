import { useState, useEffect, useMemo, useCallback } from "react";
import Editor from "@monaco-editor/react";
import { toast } from "sonner";
import {
  TbFileCode,
  TbPlus,
  TbTrash,
  TbRefresh,
  TbCode,
  TbCheck,
  TbChevronDown,
  TbChevronUp,
  TbAlertCircle,
  TbLoader2,
  TbDownload,
  TbSearch,
} from "react-icons/tb";
import type { ApiBaseUrl, AdminWorkflowSummary } from "../../api";
import * as tauri from "../../tauri-api";
import { ConfirmDialog } from "./ConfirmDialog";

interface WorkflowsSectionProps {
  apiBaseUrl: ApiBaseUrl;
  /** Called after a workflow is saved or deleted so the parent can refresh its workflow list */
  onWorkflowsChanged?: () => void;
}

interface EditorState {
  id: string;
  label: string;
  outputMode: "single_image" | "full_set" | "layered_image" | "single_audio";
  showAspectRatio: boolean;
  showBatchSize: boolean;
  canvasMode: boolean;
  agentModel: string;
  agentSystemPrompt: string;
  templateJson: string;
  isNew: boolean;
  originalId: string | null;
}

const INITIAL_EDITOR_STATE: EditorState = {
  id: "",
  label: "",
  outputMode: "single_image",
  showAspectRatio: true,
  showBatchSize: false,
  canvasMode: false,
  agentModel: "",
  agentSystemPrompt: "",
  templateJson: "{\n  \n}",
  isNew: true,
  originalId: null,
};

export function WorkflowsSection({ apiBaseUrl, onWorkflowsChanged }: WorkflowsSectionProps) {
  // Workflow list state
  const [workflows, setWorkflows] = useState<AdminWorkflowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Selection and editing state
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [originalEditor, setOriginalEditor] = useState<EditorState | null>(null);

  // Action states
  const [loadingWorkflowId, setLoadingWorkflowId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Validation state
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Token reference collapsible
  const [tokensExpanded, setTokensExpanded] = useState(false);

  // Load workflows on mount
  useEffect(() => {
    loadWorkflows();
  }, [apiBaseUrl]);

  async function loadWorkflows() {
    setLoading(true);
    setLoadError(null);
    try {
      const rawWorkflows = await tauri.listWorkflows();
      const list: AdminWorkflowSummary[] = (rawWorkflows as any[]).map((w: any) => {
        const meta = w.meta ?? {};
        const templateStr = JSON.stringify(w.template ?? {});
        return {
          id: w.id,
          label: w.label ?? meta.label ?? w.id,
          outputMode: w.outputMode ?? meta.outputMode ?? "single_image",
          engine: w.engine ?? meta.engine ?? "comfyui",
          supportsLora: meta.supportsLora !== false,
          supportsImageInput: Boolean(meta.supportsImageInput || templateStr.includes("__IMAGE__")),
          regenOnly: templateStr.includes("__ITEM_INDEX__") && !templateStr.includes("__PROMPT__"),
          ui: meta.ui ?? {},
        } as AdminWorkflowSummary;
      });
      setWorkflows(list.sort((a, b) => a.label.localeCompare(b.label)));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load workflows");
      setWorkflows([]);
    } finally {
      setLoading(false);
    }
  }

  // Check if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!editor || !originalEditor) return false;
    return (
      editor.id !== originalEditor.id ||
      editor.label !== originalEditor.label ||
      editor.outputMode !== originalEditor.outputMode ||
      editor.showAspectRatio !== originalEditor.showAspectRatio ||
      editor.showBatchSize !== originalEditor.showBatchSize ||
      editor.canvasMode !== originalEditor.canvasMode ||
      editor.agentModel !== originalEditor.agentModel ||
      editor.agentSystemPrompt !== originalEditor.agentSystemPrompt ||
      editor.templateJson !== originalEditor.templateJson
    );
  }, [editor, originalEditor]);

  // Filtered workflow list (search)
  const filteredWorkflows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return workflows;
    return workflows.filter(
      (w) => w.label.toLowerCase().includes(q) || w.id.toLowerCase().includes(q)
    );
  }, [workflows, searchQuery]);

  // Validation
  const canSave = useMemo(() => {
    if (!editor) return false;
    if (!editor.id?.trim().match(/^[a-z0-9_-]+$/i)) return false;
    if (!editor.label?.trim()) return false;
    if (!editor.templateJson?.trim()) return false;
    if (jsonError) return false;
    return true;
  }, [editor, jsonError]);

  // Validate JSON on change
  useEffect(() => {
    if (!editor) {
      setJsonError(null);
      return;
    }
    try {
      const parsed = JSON.parse(editor.templateJson);
      if (!parsed || typeof parsed !== "object") {
        setJsonError("Template must be a JSON object");
      } else {
        setJsonError(null);
      }
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "Invalid JSON");
    }
  }, [editor?.templateJson]);

  // Handle workflow selection with unsaved changes warning
  const handleSelectWorkflow = useCallback(
    async (workflowId: string) => {
      if (hasUnsavedChanges) {
        const confirmed = window.confirm(
          "You have unsaved changes. Discard them and select another workflow?"
        );
        if (!confirmed) return;
      }

      setLoadingWorkflowId(workflowId);
      setJsonError(null);
      try {
        const raw = await tauri.getWorkflowTemplate(workflowId);
        if (!raw) throw new Error("Workflow not found");
        const meta = raw.meta ?? {};
        const ui = meta.ui ?? {};
        const workflowData = {
          id: raw.id ?? workflowId,
          label: raw.label ?? meta.label ?? raw.id ?? workflowId,
          outputMode: raw.outputMode ?? meta.outputMode ?? "single_image",
          ui: { aspectRatio: Boolean(ui.aspectRatio), batchSize: Boolean(ui.batchSize), canvasMode: Boolean(ui.canvasMode) },
        };
        const fullTemplate = { meta, prompt: raw.prompt ?? raw.template ?? {} };
        const templateJson = JSON.stringify(fullTemplate, null, 2);
        // Extract agent config from template meta
        let agentModel = "";
        let agentSystemPrompt = "";
        try {
          const parsed = JSON.parse(templateJson);
          agentModel = parsed?.meta?.agentModel ?? "";
          agentSystemPrompt = parsed?.meta?.agentSystemPrompt ?? "";
        } catch { /* ignore parse errors */ }
        const newEditor: EditorState = {
          id: workflowData.id,
          label: workflowData.label,
          outputMode: workflowData.outputMode,
          showAspectRatio: workflowData.ui?.aspectRatio ?? false,
          showBatchSize: workflowData.ui?.batchSize ?? false,
          canvasMode: Boolean(workflowData.ui?.canvasMode),
          agentModel,
          agentSystemPrompt,
          templateJson,
          isNew: false,
          originalId: workflowData.id,
        };
        setEditor(newEditor);
        setOriginalEditor(newEditor);
        setSelectedWorkflowId(workflowId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load workflow");
      } finally {
        setLoadingWorkflowId(null);
      }
    },
    [apiBaseUrl, hasUnsavedChanges]
  );

  // Handle new workflow
  const handleNewWorkflow = useCallback(() => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(
        "You have unsaved changes. Discard them and create a new workflow?"
      );
      if (!confirmed) return;
    }

    const newEditor = { ...INITIAL_EDITOR_STATE };
    setEditor(newEditor);
    setOriginalEditor(newEditor);
    setSelectedWorkflowId(null);
    setJsonError(null);
  }, [hasUnsavedChanges]);

  const handleExportAll = useCallback(async () => {
    setExporting(true);
    try {
      const rawWorkflows = await tauri.listWorkflows();
      const allTemplates: Record<string, any> = {};
      for (const w of rawWorkflows as any[]) {
        const full = await tauri.getWorkflowTemplate(w.id);
        allTemplates[w.id] = full;
      }
      const jsonStr = JSON.stringify(allTemplates, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "workflows_export.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Workflows exported");
    } catch (err: any) {
      toast.error(`Export failed: ${err.message ?? err}`);
    } finally {
      setExporting(false);
    }
  }, [apiBaseUrl]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm("Discard unsaved changes?");
      if (!confirmed) return;
    }
    setEditor(null);
    setOriginalEditor(null);
    setSelectedWorkflowId(null);
    setJsonError(null);
  }, [hasUnsavedChanges]);

  // Handle save
  async function handleSave() {
    if (!editor || !canSave) return;

    setSaving(true);
    try {
      const trimmedId = editor.id.trim();
      const trimmedLabel = editor.label.trim();
      const ui = { aspectRatio: editor.showAspectRatio, batchSize: editor.showBatchSize, canvasMode: editor.canvasMode || undefined };

      const parsed = JSON.parse(editor.templateJson);
      const meta = parsed?.meta && typeof parsed.meta === "object" ? parsed.meta : {};
      const prompt = parsed?.prompt && typeof parsed.prompt === "object" ? parsed.prompt : parsed;
      const mergedMeta = {
        ...meta,
        workflow_id: trimmedId,
        label: trimmedLabel,
        outputMode: editor.outputMode,
        ui,
        ...(editor.agentModel ? { agentModel: editor.agentModel } : {}),
        ...(editor.agentSystemPrompt ? { agentSystemPrompt: editor.agentSystemPrompt } : {}),
      };
      await tauri.upsertWorkflow({
        id: trimmedId,
        label: trimmedLabel,
        engine: meta.engine,
        outputMode: editor.outputMode,
        meta: mergedMeta,
        template: prompt,
      });

      toast.success("Workflow saved successfully");

      // Refresh the admin list and notify the parent
      await loadWorkflows();
      onWorkflowsChanged?.();

      // Update the editor state to reflect saved state
      const savedEditor = { ...editor, isNew: false, originalId: editor.id };
      setEditor(savedEditor);
      setOriginalEditor(savedEditor);
      setSelectedWorkflowId(editor.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save workflow");
    } finally {
      setSaving(false);
    }
  }

  // Handle delete
  async function handleDelete() {
    if (!deleteConfirm) return;

    setDeleting(true);
    try {
      await tauri.deleteWorkflow(deleteConfirm.id);

      toast.success("Workflow deleted successfully");

      // If we were editing this workflow, clear the editor
      if (selectedWorkflowId === deleteConfirm.id) {
        setEditor(null);
        setOriginalEditor(null);
        setSelectedWorkflowId(null);
      }

      // Refresh the admin list and notify the parent
      await loadWorkflows();
      onWorkflowsChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete workflow");
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  }

  // Format JSON
  function handleFormat() {
    if (!editor) return;
    try {
      const parsed = JSON.parse(editor.templateJson);
      const formatted = JSON.stringify(parsed, null, 2);
      setEditor({ ...editor, templateJson: formatted });
      toast.success("JSON formatted");
    } catch {
      toast.error("Cannot format: Invalid JSON");
    }
  }

  // Validate JSON (check for required tokens)
  function handleValidate() {
    if (!editor) return;

    try {
      const parsed = JSON.parse(editor.templateJson);
      if (!parsed || typeof parsed !== "object") {
        toast.error("Template must be a JSON object");
        return;
      }

      const str = editor.templateJson;
      const warnings: string[] = [];
      
      // Check for common tokens
      if (!str.includes("__PROMPT__")) {
        warnings.push("Missing __PROMPT__ token");
      }
      if (!str.includes("__SEED__")) {
        warnings.push("Missing __SEED__ token");
      }

      // Check for regen-only indicator
      const hasItemIndex = str.includes("__ITEM_INDEX__");

      if (warnings.length === 0) {
        if (hasItemIndex) {
          toast.success("Valid JSON! Note: This is a regen-only workflow (has __ITEM_INDEX__)");
        } else {
          toast.success("Valid JSON with required tokens");
        }
      } else {
        toast.warning(`Valid JSON but: ${warnings.join(", ")}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid JSON");
    }
  }

  // Update editor field
  function updateEditor<K extends keyof EditorState>(field: K, value: EditorState[K]) {
    if (!editor) return;
    setEditor({ ...editor, [field]: value });
  }

  return (
    <div className="flex h-full min-h-[500px] gap-6">
      {/* Left Panel - Workflow List */}
      <div className="flex w-72 shrink-0 flex-col rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black">
        {/* List Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Workflow Templates</h3>
          <button
            type="button"
            onClick={loadWorkflows}
            disabled={loading}
            className={[
              "inline-flex h-7 w-7 items-center justify-center rounded-lg",
              "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700",
              "dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200",
              "disabled:cursor-not-allowed disabled:opacity-50",
            ].join(" ")}
            title="Refresh list"
          >
            <TbRefresh className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <div className="relative">
            <TbSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search workflows..."
              className={[
                "w-full rounded-lg border py-1.5 pl-8 pr-3 text-xs",
                "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400",
                "dark:border-zinc-700 dark:bg-black dark:text-zinc-100 dark:placeholder:text-zinc-500",
                "focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500",
              ].join(" ")}
            />
          </div>
        </div>

        {/* Workflow List */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading && workflows.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <TbLoader2 className="h-5 w-5 animate-spin text-zinc-500" />
            </div>
          ) : loadError ? (
            <div className="px-2 py-4 text-center text-xs text-red-400">{loadError}</div>
          ) : workflows.length === 0 ? (
            <div className="px-2 py-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
              No workflows found.
              <br />
              <button
                type="button"
                onClick={handleNewWorkflow}
                className="mt-2 text-zinc-600 hover:text-zinc-500 dark:text-zinc-500 dark:hover:text-zinc-400"
              >
                Create one
              </button>
            </div>
          ) : filteredWorkflows.length === 0 ? (
            <div className="px-2 py-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
              No workflows match your search.
              <br />
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="mt-2 text-zinc-600 hover:text-zinc-500 dark:text-zinc-500 dark:hover:text-zinc-400"
              >
                Clear search
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredWorkflows.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => handleSelectWorkflow(w.id)}
                    disabled={loadingWorkflowId === w.id}
                    className={[
                      "group flex w-full items-center justify-between rounded-lg px-3 py-2 text-left",
                      "transition-colors",
                      selectedWorkflowId === w.id
                        ? "border border-zinc-500/30 bg-zinc-500/10 dark:bg-zinc-500/20"
                        : "border border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-900",
                      loadingWorkflowId === w.id ? "opacity-50" : "",
                    ].join(" ")}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <TbFileCode className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
                        <span className="truncate text-sm text-zinc-900 dark:text-zinc-100">{w.label}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 pl-6 text-[11px] text-zinc-500 dark:text-zinc-500">
                        <span className="font-mono">{w.id}</span>
                        {w.regenOnly && (
                          <span className="rounded bg-zinc-500/10 px-1.5 py-0.5 text-zinc-600 dark:bg-zinc-500/20 dark:text-zinc-400">
                            regen
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm({ id: w.id, label: w.label });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          setDeleteConfirm({ id: w.id, label: w.label });
                        }
                      }}
                      className={[
                        "shrink-0 cursor-pointer rounded p-1",
                        "text-zinc-400 hover:bg-red-500/10 hover:text-red-500",
                        "dark:text-zinc-500 dark:hover:text-red-400",
                        "opacity-0 transition-opacity group-hover:opacity-100",
                      ].join(" ")}
                      title="Delete workflow"
                    >
                      <TbTrash className="h-4 w-4" />
                    </span>
                  </button>
              ))}
            </div>
          )}
        </div>

        {/* New Workflow Button */}
        <div className="border-t border-zinc-200 p-2 dark:border-zinc-800">
          <button
            type="button"
            onClick={handleNewWorkflow}
            className={[
              "flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2",
              "bg-zinc-100 text-zinc-700 hover:bg-zinc-200",
              "dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800",
              "text-sm font-medium transition-colors",
            ].join(" ")}
          >
            <TbPlus className="h-4 w-4" />
            New Workflow
          </button>
          <button
            type="button"
            onClick={handleExportAll}
            disabled={exporting || workflows.length === 0}
            className={[
              "flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 mt-1",
              "border border-zinc-200 text-zinc-600 hover:bg-zinc-100",
              "dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800",
              "text-sm font-medium transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            ].join(" ")}
          >
            {exporting ? <TbLoader2 className="h-4 w-4 animate-spin" /> : <TbDownload className="h-4 w-4" />}
            Export All as ZIP
          </button>
        </div>
      </div>

      {/* Right Panel - Editor */}
      <div className="flex flex-1 flex-col rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black">
        {!editor ? (
          // Empty state
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-900">
                <TbFileCode className="h-8 w-8 text-zinc-400 dark:text-zinc-500" />
              </div>
              <h3 className="mt-4 text-lg font-medium text-zinc-700 dark:text-zinc-300">Select a Workflow</h3>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                Choose a workflow from the list to edit, or create a new one.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Editor Header */}
            <div className="shrink-0 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {editor.isNew ? "Create New Workflow" : `Edit: ${editor.label}`}
                </h3>
                {hasUnsavedChanges && (
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">• Unsaved changes</span>
                )}
              </div>
            </div>

            {/* Editor Form */}
            <div className="shrink-0 border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
              <div className="grid grid-cols-2 gap-4">
                {/* ID */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Workflow ID
                  </label>
                  <input
                    type="text"
                    value={editor.id}
                    onChange={(e) => updateEditor("id", e.target.value)}
                    placeholder="my-workflow"
                    disabled={!editor.isNew}
                    className={[
                      "w-full rounded-lg border px-3 py-2 text-sm",
                      "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400",
                      "dark:border-zinc-700 dark:bg-black dark:text-zinc-100 dark:placeholder:text-zinc-600",
                      "focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500",
                      !editor.isNew ? "cursor-not-allowed opacity-60" : "",
                    ].join(" ")}
                  />
                  <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    {editor.isNew ? "Lowercase letters, numbers, hyphens, underscores" : "ID cannot be changed after creation"}
                  </p>
                </div>

                {/* Label */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Display Label
                  </label>
                  <input
                    type="text"
                    value={editor.label}
                    onChange={(e) => updateEditor("label", e.target.value)}
                    placeholder="My Workflow"
                    className={[
                      "w-full rounded-lg border px-3 py-2 text-sm",
                      "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400",
                      "dark:border-zinc-700 dark:bg-black dark:text-zinc-100 dark:placeholder:text-zinc-600",
                      "focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500",
                    ].join(" ")}
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                {/* Output Mode */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Output Mode
                  </label>
                  <select
                    value={editor.outputMode}
                    onChange={(e) =>
                      updateEditor("outputMode", e.target.value as "single_image" | "full_set" | "layered_image" | "single_audio")
                    }
                    className={[
                      "w-full rounded-lg border px-3 py-2 text-sm",
                      "border-zinc-300 bg-white text-zinc-900",
                      "dark:border-zinc-700 dark:bg-black dark:text-zinc-100",
                      "focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500",
                    ].join(" ")}
                  >
                    <option value="single_image">Single Image</option>
                    <option value="layered_image">Layered Image</option>
                    <option value="full_set">Full Set</option>
                    <option value="single_audio">Single Audio</option>
                  </select>
                </div>

                {/* UI Toggles */}
                <div className="flex flex-col justify-end gap-2">
                  <label className="inline-flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      checked={editor.showAspectRatio}
                      onChange={(e) => updateEditor("showAspectRatio", e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-300 bg-white text-zinc-500 focus:ring-zinc-500 focus:ring-offset-0 dark:border-zinc-700 dark:bg-black"
                    />
                    Show Aspect Ratio (width/height)
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      checked={editor.showBatchSize}
                      onChange={(e) => updateEditor("showBatchSize", e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-300 bg-white text-zinc-500 focus:ring-zinc-500 focus:ring-offset-0 dark:border-zinc-700 dark:bg-black"
                    />
                    Show Batch Size
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      checked={editor.canvasMode}
                      onChange={(e) => updateEditor("canvasMode", e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-300 bg-white text-zinc-500 focus:ring-zinc-500 focus:ring-offset-0 dark:border-zinc-700 dark:bg-black"
                    />
                    Canvas Mode (infinite canvas + chat agent)
                  </label>
                </div>
              </div>
            </div>

            {/* Canvas Agent Config (shown when canvas mode is enabled) */}
            {editor.canvasMode && (
              <div className="rounded-lg border border-zinc-300 bg-zinc-100/50 p-3 dark:border-zinc-800 dark:bg-zinc-950/20">
                <h4 className="mb-1 text-xs font-semibold text-zinc-800 dark:text-zinc-400">Canvas Agent Configuration</h4>
                <p className="mb-2 text-[11px] text-zinc-400 dark:text-zinc-500">Leave blank to use global defaults from Canvas Agent settings.</p>
                <div className="mb-2">
                  <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Agent Model (OpenRouter)</label>
                  <input
                    type="text"
                    value={editor.agentModel}
                    onChange={(e) => updateEditor("agentModel", e.target.value)}
                    placeholder="e.g. anthropic/claude-sonnet-4"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 font-mono text-xs text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Agent System Prompt</label>
                  <textarea
                    value={editor.agentSystemPrompt}
                    onChange={(e) => updateEditor("agentSystemPrompt", e.target.value)}
                    placeholder="Instruct the agent how to behave, what workflows to prefer, how to construct prompts..."
                    rows={6}
                    className="w-full resize-y rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                  <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                    Available workflows and their descriptions will be automatically appended as tool definitions.
                  </p>
                </div>
              </div>
            )}

            {/* Monaco Editor */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <div className="h-full">
                <Editor
                  height="100%"
                  language="json"
                  theme="vs-dark"
                  value={editor.templateJson}
                  onChange={(value) => updateEditor("templateJson", value ?? "")}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    automaticLayout: true,
                    tabSize: 2,
                    formatOnPaste: true,
                    renderWhitespace: "selection",
                  }}
                />
              </div>
            </div>

            {/* JSON Error */}
            {jsonError && (
              <div className="shrink-0 border-t border-red-500/30 bg-red-500/10 px-4 py-2">
                <div className="flex items-center gap-2 text-xs text-red-400">
                  <TbAlertCircle className="h-4 w-4" />
                  {jsonError}
                </div>
              </div>
            )}

            {/* Token Reference */}
            <div className="shrink-0 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setTokensExpanded(!tokensExpanded)}
                className="flex w-full items-center justify-between px-4 py-2 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
              >
                <span>Available Tokens Reference</span>
                {tokensExpanded ? (
                  <TbChevronUp className="h-4 w-4" />
                ) : (
                  <TbChevronDown className="h-4 w-4" />
                )}
              </button>
              {tokensExpanded && (
                <div className="border-t border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex gap-2">
                      <code className="font-mono text-zinc-600 dark:text-zinc-400">__PROMPT__</code>
                      <span className="text-zinc-500 dark:text-zinc-400">User's prompt text</span>
                    </div>
                    <div className="flex gap-2">
                      <code className="font-mono text-zinc-600 dark:text-zinc-400">__SEED__</code>
                      <span className="text-zinc-500 dark:text-zinc-400">Random seed for reproducibility</span>
                    </div>
                    <div className="flex gap-2">
                      <code className="font-mono text-zinc-600 dark:text-zinc-400">__WIDTH__</code>
                      <span className="text-zinc-500 dark:text-zinc-400">Image width (if aspect ratio enabled)</span>
                    </div>
                    <div className="flex gap-2">
                      <code className="font-mono text-zinc-600 dark:text-zinc-400">__HEIGHT__</code>
                      <span className="text-zinc-500 dark:text-zinc-400">Image height (if aspect ratio enabled)</span>
                    </div>
                    <div className="flex gap-2">
                      <code className="font-mono text-zinc-600 dark:text-zinc-400">__BATCH_SIZE__</code>
                      <span className="text-zinc-500 dark:text-zinc-400">Number of images to generate</span>
                    </div>
                    <div className="flex gap-2">
                      <code className="font-mono text-zinc-600 dark:text-zinc-400">__ITEM_INDEX__</code>
                      <span className="text-zinc-500 dark:text-zinc-400">For regen workflows only</span>
                    </div>
                    <div className="flex gap-2">
                      <code className="font-mono text-zinc-600 dark:text-zinc-400">__LORA_NAME__</code>
                      <span className="text-zinc-500 dark:text-zinc-400">Selected LoRA model name</span>
                    </div>
                    <div className="flex gap-2">
                      <code className="font-mono text-zinc-600 dark:text-zinc-400">__IMAGE__</code>
                      <span className="text-zinc-500 dark:text-zinc-400">Input image (base64)</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Editor Actions */}
            <div className="shrink-0 flex items-center justify-between border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleFormat}
                  className={[
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
                    "border border-zinc-300 bg-white text-zinc-700",
                    "dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
                    "hover:border-zinc-400 hover:bg-zinc-50",
                    "dark:hover:border-zinc-600 dark:hover:bg-zinc-800",
                  ].join(" ")}
                >
                  <TbCode className="h-3.5 w-3.5" />
                  Format
                </button>
                <button
                  type="button"
                  onClick={handleValidate}
                  className={[
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
                    "border border-zinc-300 bg-white text-zinc-700",
                    "dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
                    "hover:border-zinc-400 hover:bg-zinc-50",
                    "dark:hover:border-zinc-600 dark:hover:bg-zinc-800",
                  ].join(" ")}
                >
                  <TbCheck className="h-3.5 w-3.5" />
                  Validate
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  className={[
                    "rounded-lg px-4 py-1.5 text-sm font-medium",
                    "border border-zinc-300 bg-white text-zinc-700",
                    "dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
                    "hover:border-zinc-400 hover:bg-zinc-50",
                    "dark:hover:border-zinc-600 dark:hover:bg-zinc-800",
                  ].join(" ")}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!canSave || saving}
                  className={[
                    "inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium",
                    "bg-zinc-600 text-white hover:bg-zinc-700",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                  ].join(" ")}
                >
                  {saving && <TbLoader2 className="h-4 w-4 animate-spin" />}
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        title="Delete Workflow"
        message={`Are you sure you want to delete "${deleteConfirm?.label}"? This action cannot be undone. Any generations using this workflow will still exist but cannot be regenerated.`}
        confirmLabel={deleting ? "Deleting..." : "Delete"}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
        isDestructive
      />
    </div>
  );
}

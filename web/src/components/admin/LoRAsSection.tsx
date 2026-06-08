import { useEffect, useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  TbPuzzle,
  TbRefresh,
  TbSearch,
  TbCheck,
  TbLoader2,
  TbAlertCircle,
  TbChevronDown,
  TbCircleCheck,
  TbCircleX,
  TbPlus,
  TbTrash,
} from "react-icons/tb";
import type { AdminLoraRow, AdminWorkflowSummary, ApiBaseUrl } from "../../api";
import * as tauri from "../../tauri-api";
import { ConfirmDialog } from "./ConfirmDialog";

const defaultPreviewUrl = "/previews/lora.svg";

function normalizeRow(row: AdminLoraRow): AdminLoraRow {
  return {
    ...row,
    displayName: row.displayName ?? row.name,
    previewUrl: row.previewUrl ?? "",
    previewImageUrl: row.previewImageUrl ?? defaultPreviewUrl,
    promptPrefix: row.promptPrefix ?? "",
    workflowOverride: row.workflowOverride ?? "",
    keywordReplacements: row.keywordReplacements ?? {},
  };
}

function keywordReplacementsEqual(
  a: Record<string, string>,
  b: Record<string, string>
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => a[k] === b[k]);
}

interface LoRAsSectionProps {
  apiBaseUrl: ApiBaseUrl;
}

export function LoRAsSection({ apiBaseUrl }: LoRAsSectionProps) {
  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [enabledFilter, setEnabledFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [loras, setLoras] = useState<AdminLoraRow[]>([]);
  const [originalLoras, setOriginalLoras] = useState<AdminLoraRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Workflows for override dropdown
  const [workflows, setWorkflows] = useState<AdminWorkflowSummary[]>([]);

  // Keyword replacement expansion state (track which LoRAs have their keyword section expanded)
  const [expandedKeywords, setExpandedKeywords] = useState<Set<string>>(new Set());

  // Dialogs
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Load workflows for the override dropdown
  const loadWorkflows = useCallback(async () => {
    try {
      const rawWorkflows = await tauri.listWorkflows();
      const mapped: AdminWorkflowSummary[] = (rawWorkflows as any[]).map((w: any) => ({
        id: w.id,
        label: w.label ?? w.meta?.label ?? w.id,
        engine: w.engine ?? w.meta?.engine ?? "comfyui",
        supportsLora: w.meta?.supportsLora !== false,
        regenOnly: false,
      } as AdminWorkflowSummary));
      const loraWorkflows = mapped.filter(
        (w) => w.supportsLora !== false && (w.engine === "comfyui" || !w.engine)
      );
      setWorkflows(loraWorkflows);
    } catch {
      setWorkflows([]);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    void loadWorkflows();
  }, [loadWorkflows]);

  // Load LoRAs
  const loadLoras = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [settings, availableNames] = await Promise.all([
        tauri.getLoraSettings() as any,
        tauri.listAvailableLoras().catch(() => [] as string[]),
      ]);
      const enabledList: string[] = settings?.enabled ?? [];
      const displayNames: Record<string, string> = settings?.displayNames ?? {};
      const previewUrls: Record<string, string> = settings?.previewUrls ?? {};
      const promptPrefixes: Record<string, string> = settings?.promptPrefixes ?? {};
      const workflowOverrides: Record<string, string> = settings?.workflowOverrides ?? {};
      const keywordReplacements: Record<string, Record<string, string>> = settings?.keywordReplacements ?? {};
      const allNames = new Set<string>([
        ...availableNames,
        ...enabledList,
        ...Object.keys(displayNames),
        ...Object.keys(previewUrls),
        ...Object.keys(promptPrefixes),
        ...Object.keys(workflowOverrides),
        ...Object.keys(keywordReplacements),
      ]);
      const availableSet = new Set(availableNames);
      const rows: AdminLoraRow[] = Array.from(allNames).map((name) => ({
        name,
        displayName: displayNames[name] ?? name,
        previewUrl: previewUrls[name] ?? "",
        previewImageUrl: defaultPreviewUrl,
        promptPrefix: promptPrefixes[name] ?? "",
        workflowOverride: workflowOverrides[name] ?? "",
        keywordReplacements: keywordReplacements[name] ?? {},
        available: availableSet.size === 0 || availableSet.has(name),
        enabled: enabledList.includes(name),
      }));
      const normalized = rows.map(normalizeRow);
      setLoras(normalized);
      setOriginalLoras(normalized);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load LoRAs");
      setLoras([]);
      setOriginalLoras([]);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl]);

  // Load on mount
  useEffect(() => {
    void loadLoras();
  }, [loadLoras]);

  // Filtered LoRAs based on enabled filter and search
  const filteredLoras = useMemo(() => {
    let result = loras;
    if (enabledFilter === "enabled") {
      result = result.filter((r) => r.enabled);
    } else if (enabledFilter === "disabled") {
      result = result.filter((r) => !r.enabled);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.displayName.toLowerCase().includes(q)
      );
    }
    return result;
  }, [loras, searchQuery, enabledFilter]);

  // Check if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (loras.length !== originalLoras.length) return true;
    return loras.some((row, idx) => {
      const orig = originalLoras[idx];
      if (!orig) return true;
      return (
        row.enabled !== orig.enabled ||
        row.displayName !== orig.displayName ||
        row.previewUrl !== orig.previewUrl ||
        row.promptPrefix !== orig.promptPrefix ||
        row.workflowOverride !== orig.workflowOverride ||
        !keywordReplacementsEqual(row.keywordReplacements, orig.keywordReplacements)
      );
    });
  }, [loras, originalLoras]);

  // Counts for stats
  const enabledCount = useMemo(() => loras.filter((r) => r.enabled).length, [loras]);
  const availableCount = useMemo(() => loras.filter((r) => r.available).length, [loras]);
  const unavailableCount = useMemo(() => loras.filter((r) => !r.available).length, [loras]);

  // Update a single LoRA field
  function updateLora(name: string, updates: Partial<AdminLoraRow>) {
    setLoras((prev) =>
      prev.map((r) => (r.name === name ? { ...r, ...updates } : r))
    );
  }

  // Bulk actions - apply to currently filtered/visible LoRAs
  function handleEnableAllVisible() {
    const visibleNames = new Set(filteredLoras.map((r) => r.name));
    setLoras((prev) =>
      prev.map((r) =>
        visibleNames.has(r.name) ? { ...r, enabled: true } : r
      )
    );
    toast.success(`Enabled ${filteredLoras.length} LoRA(s)`);
  }

  function handleDisableAllVisible() {
    const visibleNames = new Set(filteredLoras.map((r) => r.name));
    setLoras((prev) =>
      prev.map((r) =>
        visibleNames.has(r.name) ? { ...r, enabled: false } : r
      )
    );
    toast.success(`Disabled ${filteredLoras.length} LoRA(s)`);
  }

  async function handleResetCustomizations() {
    setShowResetConfirm(false);
    setSaving(true);
    try {
      await tauri.updateLoraSettings({
        enabled: [],
        displayNames: {},
        previewUrls: {},
        promptPrefixes: {},
        workflowOverrides: {},
        keywordReplacements: {},
      });
      setLoras([]);
      setOriginalLoras([]);
      toast.success("LoRA customizations reset to defaults");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reset customizations");
    } finally {
      setSaving(false);
    }
  }

  // Save changes
  async function handleSave() {
    setSaving(true);
    try {
      const enabled = loras.filter((r) => r.enabled).map((r) => r.name);
      const displayNames = Object.fromEntries(
        loras.map((r) => [r.name, r.displayName])
      );
      const previewUrls = Object.fromEntries(
        loras.map((r) => [r.name, r.previewUrl])
      );
      const promptPrefixes = Object.fromEntries(
        loras.map((r) => [r.name, r.promptPrefix])
      );
      const workflowOverrides = Object.fromEntries(
        loras
          .filter((r) => r.workflowOverride.trim().length > 0)
          .map((r) => [r.name, r.workflowOverride])
      );
      const keywordReplacements = Object.fromEntries(
        loras
          .filter((r) => Object.keys(r.keywordReplacements).length > 0)
          .map((r) => [r.name, r.keywordReplacements])
      );

      await tauri.updateLoraSettings({
        enabled,
        displayNames,
        previewUrls,
        promptPrefixes,
        workflowOverrides,
        keywordReplacements,
      });
      const normalized = loras.map(normalizeRow);
      setOriginalLoras(normalized);
      toast.success("LoRA settings saved successfully");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save LoRA settings");
    } finally {
      setSaving(false);
    }
  }

  // Handle refresh
  function handleRefresh() {
    void loadLoras();
    toast.success("LoRA list refreshed");
  }

  // Loading state
  if (loading && loras.length === 0) {
    return (
      <div className="flex h-full min-h-[400px] flex-col items-center justify-center text-center">
        <TbLoader2 className="mb-4 h-8 w-8 animate-spin text-zinc-400 dark:text-zinc-500" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Loading LoRAs...
        </p>
      </div>
    );
  }

  // Error state
  if (loadError && loras.length === 0) {
    const message = loadError;
    return (
      <div className="flex h-full min-h-[400px] flex-col items-center justify-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/10">
          <TbAlertCircle className="h-8 w-8 text-red-600 dark:text-red-500" />
        </div>
        <h3 className="text-lg font-medium text-zinc-700 dark:text-zinc-300">Failed to load LoRAs</h3>
        <p className="mt-2 max-w-md text-sm text-zinc-500 dark:text-zinc-400">{message}</p>
        <button
          type="button"
          onClick={() => void loadLoras()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-zinc-600 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          <TbRefresh className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Section Header */}
      <div className="shrink-0">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">LoRA Management</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Configure which LoRAs are available to users
        </p>
      </div>

      {/* Stats */}
      <div className="mt-4 flex shrink-0 items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
        <span>
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{loras.length}</span> total
        </span>
        <span>
          <span className="font-medium text-zinc-600 dark:text-zinc-400">{enabledCount}</span> enabled
        </span>
        <span>
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{availableCount}</span> available
        </span>
        {unavailableCount > 0 && (
          <span>
            <span className="font-medium text-zinc-600 dark:text-zinc-400">{unavailableCount}</span> missing
          </span>
        )}
      </div>

      {/* Toolbar */}
      <div className="mt-4 flex shrink-0 flex-wrap items-center gap-3">
        {/* Refresh Button */}
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading || saving}
          className={[
            "inline-flex h-9 w-9 items-center justify-center rounded-lg",
            "border border-zinc-300 bg-white text-zinc-700",
            "dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
            "hover:border-zinc-400 hover:bg-zinc-50",
            "dark:hover:border-zinc-600 dark:hover:bg-zinc-800",
            "disabled:cursor-not-allowed disabled:opacity-50",
          ].join(" ")}
          title="Refresh LoRA list from server"
        >
          <TbRefresh className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>

        {/* Enabled Filter */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500 dark:text-zinc-400">Show:</label>
          <div className="relative">
            <select
              value={enabledFilter}
              onChange={(e) => setEnabledFilter(e.target.value as "all" | "enabled" | "disabled")}
              disabled={saving}
              className={[
                "h-9 cursor-pointer appearance-none rounded-lg border pl-3 pr-8 text-sm",
                "border-zinc-300 bg-white text-zinc-900",
                "dark:border-zinc-700 dark:bg-black dark:text-zinc-100",
                "focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/50",
                "disabled:cursor-not-allowed disabled:opacity-50",
              ].join(" ")}
            >
              <option value="all">All</option>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </select>
            <TbChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 dark:text-zinc-400" />
          </div>
        </div>

        {/* Search */}
        <div className="relative min-w-[200px] max-w-md flex-1">
          <TbSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search LoRAs..."
            className={[
              "h-9 w-full rounded-lg border pl-9 pr-3 text-sm",
              "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400",
              "dark:border-zinc-700 dark:bg-black dark:text-zinc-100 dark:placeholder:text-zinc-500",
              "focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/50",
            ].join(" ")}
          />
        </div>
      </div>

      {/* Bulk Actions Bar */}
      <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">Bulk Actions:</span>
        <button
          type="button"
          onClick={handleEnableAllVisible}
          disabled={saving || filteredLoras.length === 0}
          className={[
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
            "border border-zinc-300 bg-white text-zinc-700",
            "dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
            "hover:border-zinc-400 hover:bg-zinc-50",
            "dark:hover:border-zinc-600 dark:hover:bg-zinc-800",
            "disabled:cursor-not-allowed disabled:opacity-50",
          ].join(" ")}
        >
          <TbCircleCheck className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
          Enable All {(searchQuery || enabledFilter !== "all") && `(${filteredLoras.length})`}
        </button>
        <button
          type="button"
          onClick={handleDisableAllVisible}
          disabled={saving || filteredLoras.length === 0}
          className={[
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
            "border border-zinc-300 bg-white text-zinc-700",
            "dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
            "hover:border-zinc-400 hover:bg-zinc-50",
            "dark:hover:border-zinc-600 dark:hover:bg-zinc-800",
            "disabled:cursor-not-allowed disabled:opacity-50",
          ].join(" ")}
        >
          <TbCircleX className="h-3.5 w-3.5 text-red-500 dark:text-red-400" />
          Disable All {(searchQuery || enabledFilter !== "all") && `(${filteredLoras.length})`}
        </button>
        <button
          type="button"
          onClick={() => setShowResetConfirm(true)}
          disabled={saving}
          className={[
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
            "border border-zinc-300 bg-white text-zinc-700",
            "dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
            "hover:border-zinc-400 hover:bg-zinc-50",
            "dark:hover:border-zinc-600 dark:hover:bg-zinc-800",
            "disabled:cursor-not-allowed disabled:opacity-50",
          ].join(" ")}
        >
          Reset Customizations
        </button>
      </div>

      {/* LoRA List */}
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black">
        {filteredLoras.length === 0 ? (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center p-8 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-900">
              <TbPuzzle className="h-6 w-6 text-zinc-400 dark:text-zinc-500" />
            </div>
            {searchQuery || enabledFilter !== "all" ? (
              <>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No LoRAs match{" "}
                  {searchQuery && enabledFilter !== "all"
                    ? `your search in ${enabledFilter} LoRAs`
                    : searchQuery
                      ? "your search"
                      : `the "${enabledFilter}" filter`}
                </p>
                <button
                  type="button"
                  onClick={() => { setSearchQuery(""); setEnabledFilter("all"); }}
                  className="mt-2 text-xs text-zinc-600 hover:text-zinc-500 dark:text-zinc-500 dark:hover:text-zinc-400"
                >
                  Clear filters
                </button>
              </>
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">No LoRAs found</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filteredLoras.map((row) => {
              return (
                <div
                  key={row.name}
                  className={[
                    "flex items-start gap-4 p-4",
                    !row.available ? "bg-zinc-100 opacity-70 dark:bg-zinc-500/5" : "",
                  ].join(" ")}
                >
                  {/* Enable Checkbox */}
                  <div className="shrink-0 pt-1">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={(e) =>
                        updateLora(row.name, { enabled: e.target.checked })
                      }
                      disabled={saving}
                      className="h-5 w-5 cursor-pointer rounded border-zinc-300 bg-white text-zinc-500 focus:ring-zinc-500 focus:ring-offset-0 disabled:cursor-not-allowed dark:border-zinc-700 dark:bg-black"
                      aria-label={`Enable ${row.name}`}
                    />
                  </div>

                  {/* Details */}
                  <div className="min-w-0 flex-1 space-y-3">
                    {/* Filename */}
                    <div>
                      <span className="break-all text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {row.name}
                      </span>
                      {/* Availability indicator */}
                      <span
                        className={[
                          "ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                          row.available
                            ? "bg-accent-forest/15 text-accent-forest dark:bg-accent-forest/10 dark:text-accent-forest"
                            : "bg-accent-blush text-accent-coral dark:bg-accent-coral/10 dark:text-accent-coral",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "h-1.5 w-1.5 rounded-full",
                            row.available ? "bg-accent-forest" : "bg-accent-coral",
                          ].join(" ")}
                        />
                        {row.available ? "Available" : "Missing in ComfyUI"}
                      </span>
                    </div>

                    {/* Editable Fields */}
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {/* Display Name */}
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                          Display Name
                        </label>
                        <input
                          type="text"
                          value={row.displayName}
                          onChange={(e) =>
                            updateLora(row.name, { displayName: e.target.value })
                          }
                          placeholder={row.name}
                          disabled={saving}
                          className={[
                            "w-full rounded-lg border px-2.5 py-1.5 text-sm",
                            "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400",
                            "dark:border-zinc-700 dark:bg-black dark:text-zinc-100 dark:placeholder:text-zinc-600",
                            "focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500",
                            "disabled:cursor-not-allowed disabled:opacity-50",
                          ].join(" ")}
                        />
                      </div>


                      {/* Prompt Prefix */}
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                          Prompt Prefix{" "}
                          <span className="font-normal text-zinc-400 dark:text-zinc-500">
                            (auto-prepended to user prompts)
                          </span>
                        </label>
                        <input
                          type="text"
                          value={row.promptPrefix}
                          onChange={(e) =>
                            updateLora(row.name, { promptPrefix: e.target.value })
                          }
                          placeholder="e.g., 'pop3d style' - leave blank for no prefix"
                          disabled={saving}
                          className={[
                            "w-full rounded-lg border px-2.5 py-1.5 text-sm",
                            "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400",
                            "dark:border-zinc-700 dark:bg-black dark:text-zinc-100 dark:placeholder:text-zinc-600",
                            "focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500",
                            "disabled:cursor-not-allowed disabled:opacity-50",
                          ].join(" ")}
                        />
                      </div>

                      {/* Workflow Override */}
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                          Workflow Override{" "}
                          <span className="font-normal text-zinc-400 dark:text-zinc-500">
                            (use a specific workflow for this LoRA)
                          </span>
                        </label>
                        <div className="relative">
                          <select
                            value={row.workflowOverride}
                            onChange={(e) =>
                              updateLora(row.name, { workflowOverride: e.target.value })
                            }
                            disabled={saving}
                            className={[
                              "w-full cursor-pointer appearance-none rounded-lg border px-2.5 py-1.5 pr-8 text-sm",
                              "border-zinc-300 bg-white text-zinc-900",
                              "dark:border-zinc-700 dark:bg-black dark:text-zinc-100",
                              "focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500",
                              "disabled:cursor-not-allowed disabled:opacity-50",
                            ].join(" ")}
                          >
                            <option value="">(Default - use selected workflow)</option>
                            {workflows.map((w) => (
                              <option key={w.id} value={w.id}>
                                {w.label} ({w.id})
                              </option>
                            ))}
                          </select>
                          <TbChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 dark:text-zinc-400" />
                        </div>
                      </div>
                    </div>

                    {/* Keyword Replacements */}
                    {(() => {
                      const entries = Object.entries(row.keywordReplacements);
                      const hasEntries = entries.length > 0;
                      const isExpanded = expandedKeywords.has(row.name) || hasEntries;

                      return (
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedKeywords((prev) => {
                                const next = new Set(prev);
                                if (next.has(row.name)) {
                                  // Only collapse if no entries
                                  if (!hasEntries) next.delete(row.name);
                                } else {
                                  next.add(row.name);
                                }
                                return next;
                              });
                            }}
                            className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                          >
                            <TbChevronDown
                              className={[
                                "h-3.5 w-3.5 transition-transform",
                                isExpanded ? "" : "-rotate-90",
                              ].join(" ")}
                            />
                            Keyword Replacements
                            {hasEntries && (
                              <span className="rounded-full bg-accent-sky/15 px-1.5 py-0.5 text-[11px] font-medium text-accent-sky dark:bg-accent-sky/10 dark:text-accent-sky">
                                {entries.length}
                              </span>
                            )}
                            <span className="font-normal text-zinc-400 dark:text-zinc-500">
                              (replace words in prompts with descriptions)
                            </span>
                          </button>

                          {isExpanded && (
                            <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700/50 dark:bg-zinc-900/50">
                              {entries.map(([keyword, description], idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={keyword}
                                    onChange={(e) => {
                                      const newReplacements = { ...row.keywordReplacements };
                                      const oldValue = newReplacements[keyword];
                                      delete newReplacements[keyword];
                                      if (e.target.value.trim()) {
                                        newReplacements[e.target.value] = oldValue;
                                      }
                                      updateLora(row.name, { keywordReplacements: newReplacements });
                                    }}
                                    placeholder="keyword"
                                    disabled={saving}
                                    className={[
                                      "w-32 shrink-0 rounded-lg border px-2 py-1 text-xs",
                                      "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400",
                                      "dark:border-zinc-700 dark:bg-black dark:text-zinc-100 dark:placeholder:text-zinc-600",
                                      "focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500",
                                      "disabled:cursor-not-allowed disabled:opacity-50",
                                    ].join(" ")}
                                  />
                                  <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                                    &rarr;
                                  </span>
                                  <input
                                    type="text"
                                    value={description}
                                    onChange={(e) => {
                                      const newReplacements = { ...row.keywordReplacements };
                                      newReplacements[keyword] = e.target.value;
                                      updateLora(row.name, { keywordReplacements: newReplacements });
                                    }}
                                    placeholder="replacement description"
                                    disabled={saving}
                                    className={[
                                      "min-w-0 flex-1 rounded-lg border px-2 py-1 text-xs",
                                      "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400",
                                      "dark:border-zinc-700 dark:bg-black dark:text-zinc-100 dark:placeholder:text-zinc-600",
                                      "focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500",
                                      "disabled:cursor-not-allowed disabled:opacity-50",
                                    ].join(" ")}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newReplacements = { ...row.keywordReplacements };
                                      delete newReplacements[keyword];
                                      updateLora(row.name, { keywordReplacements: newReplacements });
                                    }}
                                    disabled={saving}
                                    className="shrink-0 rounded p-1 text-zinc-400 hover:bg-red-100 hover:text-red-600 disabled:cursor-not-allowed dark:hover:bg-red-500/10 dark:hover:text-red-400"
                                    title="Remove replacement"
                                  >
                                    <TbTrash className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ))}

                              <button
                                type="button"
                                onClick={() => {
                                  // Find a unique placeholder key
                                  let newKey = "";
                                  let i = 1;
                                  while (row.keywordReplacements[newKey] !== undefined || newKey === "") {
                                    newKey = `keyword${i}`;
                                    i++;
                                  }
                                  updateLora(row.name, {
                                    keywordReplacements: {
                                      ...row.keywordReplacements,
                                      [newKey]: "",
                                    },
                                  });
                                }}
                                disabled={saving}
                                className={[
                                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium",
                                  "border border-dashed border-zinc-300 text-zinc-600",
                                  "dark:border-zinc-600 dark:text-zinc-400",
                                  "hover:border-zinc-400 hover:text-zinc-600",
                                  "dark:hover:border-zinc-500 dark:hover:text-zinc-400",
                                  "disabled:cursor-not-allowed disabled:opacity-50",
                                ].join(" ")}
                              >
                                <TbPlus className="h-3 w-3" />
                                Add Replacement
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer with Save Button */}
      <div className="mt-4 flex shrink-0 items-center justify-between">
        <div className="text-sm">
          {hasUnsavedChanges && (
            <span className="text-zinc-600 dark:text-zinc-400">
              • Unsaved changes
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !hasUnsavedChanges}
          className={[
            "inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium",
            "bg-zinc-600 text-white",
            "hover:bg-zinc-700",
            "disabled:cursor-not-allowed disabled:opacity-50",
          ].join(" ")}
        >
          {saving && <TbLoader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {/* Reset Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showResetConfirm}
        title="Reset LoRA Customizations"
        message="This will reset all display names and preview URLs to their defaults, and enable all available LoRAs. This action cannot be undone."
        confirmLabel="Reset All"
        onConfirm={() => void handleResetCustomizations()}
        onCancel={() => setShowResetConfirm(false)}
        isDestructive
      />
    </div>
  );
}

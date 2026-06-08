import { useEffect, useState } from "react";
import {
  TbCategory,
  TbPlus,
  TbPencil,
  TbTrash,
  TbLoader2,
  TbAlertCircle,
  TbLock,
  TbDownload,
  TbRefresh,
  TbPaint,
  TbEye,
} from "react-icons/tb";
import { toast } from "sonner";
import type { AdminAssetType, ApiBaseUrl } from "../../api";
import * as tauri from "../../tauri-api";
import { ConfirmDialog } from "./ConfirmDialog";

interface AssetTypesSectionProps {
  apiBaseUrl: ApiBaseUrl;
}

const ASPECT_RATIO_OPTIONS = ["1:1", "4:5", "2:3", "3:2", "4:3", "16:9", "21:9"];
const GRID_ROW_OPTIONS = [
  { value: "row1", label: "Row 1 (Large / Featured)" },
  { value: "row2", label: "Row 2 (Grid / Smaller)" },
];
const GRID_SIZE_OPTIONS = ["w-1/4", "w-1/3", "w-1/2", "w-full"];

function defaultFormState(): Omit<AdminAssetType, "createdAt" | "updatedAt"> {
  return {
    id: "",
    displayName: "",
    description: null,
    aspectRatio: "1:1",
    displaySortOrder: 50,
    gridRow: "row2",
    gridSizeClass: "w-1/4",
    defaultPromptTemplate: null,
    defaultWidth: 1024,
    defaultHeight: 1024,
    isDownloadable: true,
    isRegenable: true,
    isInpaintable: true,
    isVisible: true,
    isSystem: false,
  };
}

function FlagBadge({
  active,
  icon: Icon,
  label,
}: {
  active: boolean;
  icon: typeof TbDownload;
  label: string;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-medium",
        active
          ? "bg-accent-forest/15 text-accent-forest dark:bg-accent-forest/10 dark:text-accent-forest"
          : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500 line-through",
      ].join(" ")}
      title={label}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

export function AssetTypesSection({ apiBaseUrl }: AssetTypesSectionProps) {
  const [types, setTypes] = useState<AdminAssetType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [isCreating, setIsCreating] = useState(false);
  const [editingType, setEditingType] = useState<AdminAssetType | null>(null);
  const [form, setForm] = useState(defaultFormState());
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<AdminAssetType | null>(null);

  useEffect(() => {
    loadTypes();
  }, [apiBaseUrl]);

  async function loadTypes() {
    setLoading(true);
    setError(null);
    try {
      const data = await tauri.listAssetTypes();
      setTypes(data as AdminAssetType[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load asset types");
    } finally {
      setLoading(false);
    }
  }

  function handleStartCreate() {
    setIsCreating(true);
    setEditingType(null);
    setForm(defaultFormState());
  }

  function handleStartEdit(t: AdminAssetType) {
    setIsCreating(false);
    setEditingType(t);
    setForm({
      id: t.id,
      displayName: t.displayName,
      description: t.description,
      aspectRatio: t.aspectRatio,
      displaySortOrder: t.displaySortOrder,
      gridRow: t.gridRow,
      gridSizeClass: t.gridSizeClass,
      defaultPromptTemplate: t.defaultPromptTemplate,
      defaultWidth: t.defaultWidth,
      defaultHeight: t.defaultHeight,
      isDownloadable: t.isDownloadable,
      isRegenable: t.isRegenable,
      isInpaintable: t.isInpaintable,
      isVisible: t.isVisible,
      isSystem: t.isSystem,
    });
  }

  function handleCancelForm() {
    setIsCreating(false);
    setEditingType(null);
    setForm(defaultFormState());
  }

  function updateForm(partial: Partial<typeof form>) {
    setForm((prev) => ({ ...prev, ...partial }));
  }

  async function handleSave() {
    const trimmedId = form.id.trim().toLowerCase();
    const trimmedName = form.displayName.trim();

    if (!trimmedId || !trimmedName) {
      toast.error("ID and Display Name are required");
      return;
    }

    setSaving(true);
    try {
      if (editingType) {
        const { id: _id, isSystem: _sys, ...updateFields } = form;
        const updated = await tauri.updateAssetType(editingType.id, {
          ...editingType,
          ...updateFields,
          displayName: trimmedName,
        }) as AdminAssetType;
        setTypes((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        toast.success("Asset type updated");
      } else {
        const created = await tauri.createAssetType({
          ...form,
          id: trimmedId,
          displayName: trimmedName,
        }) as AdminAssetType;
        setTypes((prev) => [...prev, created].sort((a, b) => a.displaySortOrder - b.displaySortOrder));
        toast.success("Asset type created");
      }
      handleCancelForm();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to save asset type";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await tauri.deleteAssetType(deleteTarget.id);
      setTypes((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      toast.success("Asset type deleted");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to delete asset type";
      toast.error(message);
    } finally {
      setDeleteTarget(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
        <TbLoader2 className="h-8 w-8 text-zinc-400 dark:text-zinc-500 animate-spin mb-4" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading asset types...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/10 mb-4">
          <TbAlertCircle className="h-8 w-8 text-red-600 dark:text-red-500" />
        </div>
        <h3 className="text-lg font-medium text-zinc-800 dark:text-zinc-200">Failed to load asset types</h3>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 max-w-md">{error}</p>
        <button
          type="button"
          onClick={() => void loadTypes()}
          className="mt-4 px-4 py-2 text-sm font-medium rounded-lg bg-zinc-600 text-white hover:bg-zinc-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const isFormOpen = isCreating || editingType !== null;

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Asset Types</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Manage asset type definitions and their display/generation configuration
          </p>
        </div>
        <button
          type="button"
          onClick={handleStartCreate}
          disabled={isFormOpen}
          className={[
            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium",
            "bg-zinc-600 text-white hover:bg-zinc-700",
            "focus:outline-none focus:ring-2 focus:ring-zinc-500",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          ].join(" ")}
        >
          <TbPlus className="h-4 w-4" />
          Add Type
        </button>
      </div>

      {/* Create/Edit Form */}
      {isFormOpen && (
        <div className="rounded-xl border border-zinc-300 dark:border-zinc-500/30 bg-zinc-100 dark:bg-zinc-500/10 p-5">
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-4">
            {editingType ? `Edit Type: ${editingType.id}` : "Create New Asset Type"}
          </h3>
          <div className="space-y-5">
            {/* Row 1: ID + Display Name */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="type-id"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  Type ID
                </label>
                <input
                  id="type-id"
                  type="text"
                  value={form.id}
                  onChange={(e) => updateForm({ id: e.target.value })}
                  placeholder="e.g., symbol"
                  disabled={editingType !== null || saving}
                  className={[
                    "w-full rounded-lg border px-3 py-2 text-sm",
                    "border-zinc-300 bg-white text-zinc-900",
                    "dark:border-zinc-700 dark:bg-black dark:text-zinc-100",
                    "placeholder:text-zinc-400 dark:placeholder:text-zinc-500",
                    "focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/50",
                    "disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:opacity-50 dark:disabled:bg-zinc-900",
                  ].join(" ")}
                />
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Lowercase letters, numbers, dashes and underscores. Cannot be changed after creation.
                </p>
              </div>
              <div>
                <label
                  htmlFor="type-display-name"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  Display Name
                </label>
                <input
                  id="type-display-name"
                  type="text"
                  value={form.displayName}
                  onChange={(e) => updateForm({ displayName: e.target.value })}
                  placeholder="e.g., Symbol"
                  disabled={saving}
                  className={[
                    "w-full rounded-lg border px-3 py-2 text-sm",
                    "border-zinc-300 bg-white text-zinc-900",
                    "dark:border-zinc-700 dark:bg-black dark:text-zinc-100",
                    "placeholder:text-zinc-400 dark:placeholder:text-zinc-500",
                    "focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/50",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                  ].join(" ")}
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="type-description"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
              >
                Description <span className="text-zinc-400 font-normal">(optional)</span>
              </label>
              <input
                id="type-description"
                type="text"
                value={form.description ?? ""}
                onChange={(e) => updateForm({ description: e.target.value || null })}
                placeholder="Brief description of this asset type"
                disabled={saving}
                className={[
                  "w-full rounded-lg border px-3 py-2 text-sm",
                  "border-zinc-300 bg-white text-zinc-900",
                  "dark:border-zinc-700 dark:bg-black dark:text-zinc-100",
                  "placeholder:text-zinc-400 dark:placeholder:text-zinc-500",
                  "focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/50",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                ].join(" ")}
              />
            </div>

            {/* Row 2: Aspect Ratio + Dimensions + Sort Order */}
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label
                  htmlFor="type-aspect-ratio"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  Aspect Ratio
                </label>
                <select
                  id="type-aspect-ratio"
                  value={ASPECT_RATIO_OPTIONS.includes(form.aspectRatio) ? form.aspectRatio : "__custom__"}
                  onChange={(e) => {
                    if (e.target.value !== "__custom__") updateForm({ aspectRatio: e.target.value });
                  }}
                  disabled={saving}
                  className={[
                    "w-full rounded-lg border px-3 py-2 text-sm",
                    "border-zinc-300 bg-white text-zinc-900",
                    "dark:border-zinc-700 dark:bg-black dark:text-zinc-100",
                    "focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/50",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                  ].join(" ")}
                >
                  {ASPECT_RATIO_OPTIONS.map((ar) => (
                    <option key={ar} value={ar}>
                      {ar}
                    </option>
                  ))}
                  {!ASPECT_RATIO_OPTIONS.includes(form.aspectRatio) && (
                    <option value="__custom__">{form.aspectRatio} (custom)</option>
                  )}
                </select>
              </div>
              <div>
                <label
                  htmlFor="type-width"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  Default Width
                </label>
                <input
                  id="type-width"
                  type="number"
                  min={64}
                  max={8192}
                  value={form.defaultWidth}
                  onChange={(e) => updateForm({ defaultWidth: parseInt(e.target.value) || 1024 })}
                  disabled={saving}
                  className={[
                    "w-full rounded-lg border px-3 py-2 text-sm",
                    "border-zinc-300 bg-white text-zinc-900",
                    "dark:border-zinc-700 dark:bg-black dark:text-zinc-100",
                    "focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/50",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                  ].join(" ")}
                />
              </div>
              <div>
                <label
                  htmlFor="type-height"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  Default Height
                </label>
                <input
                  id="type-height"
                  type="number"
                  min={64}
                  max={8192}
                  value={form.defaultHeight}
                  onChange={(e) => updateForm({ defaultHeight: parseInt(e.target.value) || 1024 })}
                  disabled={saving}
                  className={[
                    "w-full rounded-lg border px-3 py-2 text-sm",
                    "border-zinc-300 bg-white text-zinc-900",
                    "dark:border-zinc-700 dark:bg-black dark:text-zinc-100",
                    "focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/50",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                  ].join(" ")}
                />
              </div>
              <div>
                <label
                  htmlFor="type-sort-order"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  Sort Order
                </label>
                <input
                  id="type-sort-order"
                  type="number"
                  min={0}
                  max={999}
                  value={form.displaySortOrder}
                  onChange={(e) => updateForm({ displaySortOrder: parseInt(e.target.value) || 0 })}
                  disabled={saving}
                  className={[
                    "w-full rounded-lg border px-3 py-2 text-sm",
                    "border-zinc-300 bg-white text-zinc-900",
                    "dark:border-zinc-700 dark:bg-black dark:text-zinc-100",
                    "focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/50",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                  ].join(" ")}
                />
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Lower = shown first</p>
              </div>
            </div>

            {/* Row 3: Grid Row + Grid Size */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="type-grid-row"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  Grid Row
                </label>
                <select
                  id="type-grid-row"
                  value={form.gridRow}
                  onChange={(e) => updateForm({ gridRow: e.target.value })}
                  disabled={saving}
                  className={[
                    "w-full rounded-lg border px-3 py-2 text-sm",
                    "border-zinc-300 bg-white text-zinc-900",
                    "dark:border-zinc-700 dark:bg-black dark:text-zinc-100",
                    "focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/50",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                  ].join(" ")}
                >
                  {GRID_ROW_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="type-grid-size"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  Grid Size Class
                </label>
                <select
                  id="type-grid-size"
                  value={form.gridSizeClass}
                  onChange={(e) => updateForm({ gridSizeClass: e.target.value })}
                  disabled={saving}
                  className={[
                    "w-full rounded-lg border px-3 py-2 text-sm",
                    "border-zinc-300 bg-white text-zinc-900",
                    "dark:border-zinc-700 dark:bg-black dark:text-zinc-100",
                    "focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/50",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                  ].join(" ")}
                >
                  {GRID_SIZE_OPTIONS.map((sz) => (
                    <option key={sz} value={sz}>
                      {sz}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Prompt Template */}
            <div>
              <label
                htmlFor="type-prompt-template"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
              >
                Default Prompt Template <span className="text-zinc-400 font-normal">(optional)</span>
              </label>
              <textarea
                id="type-prompt-template"
                value={form.defaultPromptTemplate ?? ""}
                onChange={(e) => updateForm({ defaultPromptTemplate: e.target.value || null })}
                placeholder="e.g., MXItems, 3d chunky style render of {theme}"
                rows={2}
                disabled={saving}
                className={[
                  "w-full rounded-lg border px-3 py-2 text-sm",
                  "border-zinc-300 bg-white text-zinc-900",
                  "dark:border-zinc-700 dark:bg-black dark:text-zinc-100",
                  "placeholder:text-zinc-400 dark:placeholder:text-zinc-500",
                  "focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/50",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  "resize-none",
                ].join(" ")}
              />
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Use <code className="px-1 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-xs">{"{theme}"}</code> as
                a placeholder for the generation theme/prompt.
              </p>
            </div>

            {/* Capability Flags */}
            <div>
              <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Capabilities
              </span>
              <div className="flex flex-wrap gap-4">
                {[
                  { key: "isVisible" as const, label: "Visible", icon: TbEye },
                  { key: "isDownloadable" as const, label: "Downloadable", icon: TbDownload },
                  { key: "isRegenable" as const, label: "Regenable", icon: TbRefresh },
                  { key: "isInpaintable" as const, label: "Inpaintable", icon: TbPaint },
                ].map(({ key, label, icon: Icon }) => (
                  <label
                    key={key}
                    className={[
                      "inline-flex items-center gap-2 cursor-pointer select-none",
                      "rounded-lg border px-3 py-2 text-sm transition-colors",
                      form[key]
                        ? "border-zinc-400 bg-zinc-100 text-zinc-800 dark:border-zinc-500/30 dark:bg-zinc-500/10 dark:text-zinc-400"
                        : "border-zinc-200 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400",
                      saving ? "opacity-50 cursor-not-allowed" : "",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={form[key]}
                      onChange={(e) => updateForm({ [key]: e.target.checked })}
                      disabled={saving}
                      className="sr-only"
                    />
                    <Icon className="h-4 w-4" />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || !form.id.trim() || !form.displayName.trim()}
                className={[
                  "rounded-lg px-4 py-2 text-sm font-medium",
                  "bg-zinc-600 text-white hover:bg-zinc-700",
                  "focus:outline-none focus:ring-2 focus:ring-zinc-500",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                ].join(" ")}
              >
                {saving ? "Saving..." : editingType ? "Update" : "Create"}
              </button>
              <button
                type="button"
                onClick={handleCancelForm}
                disabled={saving}
                className={[
                  "rounded-lg px-4 py-2 text-sm font-medium",
                  "border border-zinc-300 bg-white text-zinc-700",
                  "dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
                  "hover:bg-zinc-50 dark:hover:bg-zinc-800",
                  "focus:outline-none focus:ring-2 focus:ring-zinc-400",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                ].join(" ")}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Types List */}
      {types.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <TbCategory className="mx-auto mb-4 h-12 w-12 text-zinc-400 dark:text-zinc-500" />
          <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">No asset types</h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Add your first asset type to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {types.map((t) => (
            <div
              key={t.id}
              className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-start justify-between gap-4">
                {/* Left: icon + info */}
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-200 dark:bg-zinc-500/10">
                    <TbCategory className="h-5 w-5 text-zinc-600 dark:text-zinc-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {t.displayName}
                      </h3>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                        {t.id}
                      </span>
                      {t.isSystem && (
                        <span className="inline-flex items-center gap-0.5 rounded-lg bg-accent-sky/15 px-1.5 py-0.5 text-xs font-medium text-accent-sky dark:bg-accent-sky/10 dark:text-accent-sky" title="System type (cannot be deleted)">
                          <TbLock className="h-3 w-3" />
                          System
                        </span>
                      )}
                    </div>
                    {t.description && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{t.description}</p>
                    )}
                    {/* Config summary */}
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                      <span>
                        {t.aspectRatio} &middot; {t.defaultWidth}&times;{t.defaultHeight}
                      </span>
                      <span>
                        {t.gridRow === "row1" ? "Row 1" : "Row 2"} &middot; {t.gridSizeClass}
                      </span>
                      <span>Sort: {t.displaySortOrder}</span>
                    </div>
                    {/* Flags */}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <FlagBadge active={t.isVisible} icon={TbEye} label="Visible" />
                      <FlagBadge active={t.isDownloadable} icon={TbDownload} label="Download" />
                      <FlagBadge active={t.isRegenable} icon={TbRefresh} label="Regen" />
                      <FlagBadge active={t.isInpaintable} icon={TbPaint} label="Inpaint" />
                    </div>
                    {/* Prompt template preview */}
                    {t.defaultPromptTemplate && (
                      <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500 font-mono truncate max-w-lg" title={t.defaultPromptTemplate}>
                        {t.defaultPromptTemplate}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: actions */}
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleStartEdit(t)}
                    disabled={isFormOpen}
                    className={[
                      "inline-flex h-8 w-8 items-center justify-center rounded-lg",
                      "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700",
                      "dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200",
                      "focus:outline-none focus:ring-2 focus:ring-zinc-400",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                    ].join(" ")}
                    title="Edit type"
                  >
                    <TbPencil className="h-4 w-4" />
                  </button>
                  {!t.isSystem && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(t)}
                      disabled={isFormOpen}
                      className={[
                        "inline-flex h-8 w-8 items-center justify-center rounded-lg",
                        "text-zinc-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400",
                        "hover:bg-red-50 dark:hover:bg-red-500/10",
                        "focus:outline-none focus:ring-2 focus:ring-red-400",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                      ].join(" ")}
                      title="Delete type"
                    >
                      <TbTrash className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Delete Asset Type"
        message={`Are you sure you want to delete "${deleteTarget?.displayName}" (${deleteTarget?.id})? This cannot be undone. Deletion will fail if any existing assets use this type.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
        isDestructive={true}
      />
    </div>
  );
}

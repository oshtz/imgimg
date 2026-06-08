import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  TbPhoto,
  TbRefresh,
  TbLoader2,
  TbAlertCircle,
  TbChevronDown,
  TbPlus,
  TbTrash,
  TbX,
  TbCheck,
  TbCopy,
  TbSearch,
} from "react-icons/tb";
import type { AdminPreset, ApiBaseUrl } from "../../api";
import * as tauri from "../../tauri-api";
import { resolveStorageUrl } from "../../utils/assets";
import { ConfirmDialog } from "./ConfirmDialog";

function resolveMaybeRelativeUrl(apiBaseUrl: string, url: string): string {
  if (!url) return "";
  return resolveStorageUrl(apiBaseUrl, url);
}

interface PresetsSectionProps {
  apiBaseUrl: ApiBaseUrl;
}

type EditingPreset = {
  id?: string;
  name: string;
  images: string[]; // storage URLs or data URLs
  promptPrefix: string;
  promptSuffix: string;
  previewImage: string; // storage URL or data URL
};

function emptyPreset(): EditingPreset {
  return { name: "", images: [], promptPrefix: "", promptSuffix: "", previewImage: "" };
}

/* ── Toggle switch ────────────────────────────────────────────────── */
function ToggleSwitch({ checked, disabled, onChange, title }: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors",
        checked ? "bg-zinc-500" : "bg-zinc-300 dark:bg-zinc-600",
        "disabled:cursor-not-allowed disabled:opacity-50",
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-[3px]",
        ].join(" ")}
      />
    </button>
  );
}

export function PresetsSection({ apiBaseUrl }: PresetsSectionProps) {
  // State
  const [presets, setPresets] = useState<AdminPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // QOL state
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedGallery, setExpandedGallery] = useState<string | null>(null);

  // Editing state
  const [editingPreset, setEditingPreset] = useState<EditingPreset | null>(null);
  const [editingOriginalId, setEditingOriginalId] = useState<string | null>(null);

  // Dialogs
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<AdminPreset | null>(null);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadPresets = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const allByGame = await tauri.getAllPresets() as Record<string, any[]>;
      const list: AdminPreset[] = [];
      for (const presets of Object.values(allByGame)) {
        for (const p of presets) {
          list.push({
            id: p.id,
            name: p.name,
            enabled: p.enabled !== false,
            imageUrls: p.imageUrls ?? p.images ?? [],
            promptPrefix: p.promptPrefix ?? p.prompt_prefix ?? "",
            promptSuffix: p.promptSuffix ?? p.prompt_suffix ?? "",
            previewUrl: p.previewUrl ?? p.preview_url ?? "",
          });
        }
      }
      setPresets(list);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load presets");
      setPresets([]);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    void loadPresets();
  }, [loadPresets]);

  function handleRefresh() {
    void loadPresets();
    toast.success("Presets refreshed");
  }

  function handleNewPreset() {
    setEditingPreset(emptyPreset());
    setEditingOriginalId(null);
  }

  function handleEditPreset(p: AdminPreset) {
    setEditingPreset({
      id: p.id,
      name: p.name,
      images: [...p.imageUrls],
      promptPrefix: p.promptPrefix,
      promptSuffix: p.promptSuffix,
      previewImage: p.previewUrl,
    });
    setEditingOriginalId(p.id);
  }

  function handleDuplicatePreset(p: AdminPreset) {
    setDuplicateTarget(p);
  }

  function handleConfirmDuplicate() {
    const p = duplicateTarget;
    setDuplicateTarget(null);
    if (!p) return;

    setEditingPreset({
      name: `${p.name} (copy)`,
      images: [...p.imageUrls],
      promptPrefix: p.promptPrefix,
      promptSuffix: p.promptSuffix,
      previewImage: p.previewUrl,
    });
    setEditingOriginalId(null);
  }

  function handleCancelEdit() {
    setEditingPreset(null);
    setEditingOriginalId(null);
  }

  async function handleSavePreset() {
    if (!editingPreset) return;
    if (!editingPreset.name.trim()) {
      toast.error("Preset name is required");
      return;
    }
    setSaving(true);
    try {
      await tauri.upsertPreset({
        id: editingPreset.id ?? crypto.randomUUID(),
        name: editingPreset.name.trim(),
        enabled: true,
        imageUrls: editingPreset.images,
        promptPrefix: editingPreset.promptPrefix,
        promptSuffix: editingPreset.promptSuffix,
        previewUrl: editingPreset.previewImage || "",
      });
      toast.success(editingOriginalId ? "Preset updated" : "Preset created");
      setEditingPreset(null);
      setEditingOriginalId(null);
      await loadPresets();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save preset");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleEnabled(presetId: string, enabled: boolean) {
    // Optimistic update
    setPresets((prev) => prev.map((p) => p.id === presetId ? { ...p, enabled } : p));
    try {
      const preset = presets.find((p) => p.id === presetId);
      if (preset) {
        await tauri.upsertPreset({
          id: preset.id,
          name: preset.name,
          enabled,
          imageUrls: preset.imageUrls,
          promptPrefix: preset.promptPrefix,
          promptSuffix: preset.promptSuffix,
          previewUrl: preset.previewUrl,
        });
      }
      toast.success(enabled ? "Preset enabled" : "Preset disabled");
    } catch (e) {
      // Revert
      setPresets((prev) => prev.map((p) => p.id === presetId ? { ...p, enabled: !enabled } : p));
      toast.error(e instanceof Error ? e.message : "Failed to update preset");
    }
  }

  async function handleDeletePreset(presetId: string) {
    setDeleteConfirmId(null);
    setSaving(true);
    try {
      await tauri.deletePreset(presetId);
      toast.success("Preset deleted");
      if (editingOriginalId === presetId) {
        setEditingPreset(null);
        setEditingOriginalId(null);
      }
      await loadPresets();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete preset");
    } finally {
      setSaving(false);
    }
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!editingPreset || !e.target.files) return;
    const files = Array.from(e.target.files);
    const maxImages = 14;
    const remaining = maxImages - editingPreset.images.length;
    if (remaining <= 0) {
      toast.error("Maximum 14 images per preset");
      return;
    }
    const filesToAdd = files.slice(0, remaining);
    if (files.length > remaining) {
      toast.warning(`Only ${remaining} more image(s) allowed. ${files.length - remaining} skipped.`);
    }

    for (const file of filesToAdd) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setEditingPreset((prev) => {
          if (!prev) return prev;
          return { ...prev, images: [...prev.images, dataUrl] };
        });
      };
      reader.readAsDataURL(file);
    }
    // Reset file input
    e.target.value = "";
  }

  function handleRemoveImage(index: number) {
    setEditingPreset((prev) => {
      if (!prev) return prev;
      const images = [...prev.images];
      images.splice(index, 1);
      return { ...prev, images };
    });
  }

  // Filtered presets
  const filteredPresets = searchQuery.trim()
    ? presets.filter((p) => p.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : presets;

  const enabledCount = presets.filter((p) => p.enabled).length;
  const disabledCount = presets.length - enabledCount;

  // Loading state
  if (loading && presets.length === 0 && !editingPreset) {
    return (
      <div className="flex h-full min-h-[400px] flex-col items-center justify-center text-center">
        <TbLoader2 className="mb-4 h-8 w-8 animate-spin text-zinc-400 dark:text-zinc-500" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Loading presets...
        </p>
      </div>
    );
  }

  // Error state
  if (loadError && presets.length === 0) {
    const message = loadError;
    return (
      <div className="flex h-full min-h-[400px] flex-col items-center justify-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/10">
          <TbAlertCircle className="h-8 w-8 text-red-600 dark:text-red-500" />
        </div>
        <h3 className="text-lg font-medium text-zinc-700 dark:text-zinc-300">Failed to load presets</h3>
        <p className="mt-2 max-w-md text-sm text-zinc-500 dark:text-zinc-400">{message}</p>
        <button
          type="button"
          onClick={() => void loadPresets()}
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
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Preset Management</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Create and manage image presets for the Preset Studio workflow
        </p>
      </div>

      {/* Stats */}
      <div className="mt-4 flex shrink-0 items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
        <span>
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{presets.length}</span> preset{presets.length !== 1 ? "s" : ""}
        </span>
        {presets.length > 0 && (
          <>
            <span>
              <span className="font-medium text-zinc-600 dark:text-zinc-400">{enabledCount}</span> enabled
            </span>
            {disabledCount > 0 && (
              <span>
                <span className="font-medium text-zinc-400 dark:text-zinc-500">{disabledCount}</span> disabled
              </span>
            )}
          </>
        )}
      </div>

      {/* Toolbar */}
      <div className="mt-4 flex shrink-0 flex-wrap items-center gap-3">
        {/* Search */}
        {presets.length > 0 && (
          <div className="relative">
            <TbSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter presets..."
              className={[
                "h-9 rounded-lg border pl-8 pr-3 text-sm",
                "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400",
                "dark:border-zinc-700 dark:bg-black dark:text-zinc-100 dark:placeholder:text-zinc-600",
                "focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/50",
              ].join(" ")}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                <TbX className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

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
          title="Refresh presets"
        >
          <TbRefresh className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>

        {/* Add Preset Button */}
        <button
          type="button"
          onClick={handleNewPreset}
          disabled={saving || !!editingPreset}
          className={[
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium",
            "bg-zinc-600 text-white",
            "hover:bg-zinc-700",
            "disabled:cursor-not-allowed disabled:opacity-50",
          ].join(" ")}
        >
          <TbPlus className="h-4 w-4" />
          New Preset
        </button>
      </div>

      {/* Editing Form */}
      {editingPreset && (
        <div className="mt-4 shrink-0 rounded-xl border border-zinc-400 bg-zinc-100 p-5 dark:border-zinc-600/30 dark:bg-zinc-500/5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {editingOriginalId ? "Edit Preset" : "New Preset"}
            </h3>
            <button
              type="button"
              onClick={handleCancelEdit}
              className="rounded p-1 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              <TbX className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="mb-1 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                Preset Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={editingPreset.name}
                onChange={(e) => setEditingPreset((p) => p ? { ...p, name: e.target.value } : p)}
                placeholder="e.g., Slot Machine Symbols"
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

            {/* Preview Image */}
            <div>
              <label className="mb-1 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                Preview Image URL{" "}
                <span className="font-normal text-zinc-400 dark:text-zinc-500">(shown in user dropdown)</span>
              </label>
              <div className="flex items-center gap-3">
                {editingPreset.previewImage && (
                  <div className="relative h-16 w-16 shrink-0">
                    <img
                      src={resolveMaybeRelativeUrl(apiBaseUrl, editingPreset.previewImage)}
                      alt="Preview"
                      className="h-16 w-16 rounded-lg border border-zinc-200 bg-zinc-50 object-cover dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <button
                      type="button"
                      onClick={() => setEditingPreset((p) => p ? { ...p, previewImage: "" } : p)}
                      className="absolute -right-1.5 -top-1.5 rounded-full bg-red-500 p-0.5 text-white hover:bg-red-600"
                    >
                      <TbX className="h-3 w-3" />
                    </button>
                  </div>
                )}
                <input
                  type="text"
                  value={editingPreset.previewImage}
                  onChange={(e) => setEditingPreset((p) => p ? { ...p, previewImage: e.target.value } : p)}
                  placeholder="https://... or leave blank for no preview"
                  disabled={saving}
                  className={[
                    "min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 text-sm",
                    "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400",
                    "dark:border-zinc-700 dark:bg-black dark:text-zinc-100 dark:placeholder:text-zinc-600",
                    "focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                  ].join(" ")}
                />
              </div>
            </div>

            {/* Images Gallery */}
            <div>
              <label className="mb-1 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                Preset Images{" "}
                <span className="font-normal text-zinc-400 dark:text-zinc-500">
                  ({editingPreset.images.length}/14 - sent to model during generation)
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                {editingPreset.images.map((img, i) => (
                  <div key={i} className="group relative h-20 w-20 shrink-0">
                    <img
                      src={resolveMaybeRelativeUrl(apiBaseUrl, img)}
                      alt={`Preset image ${i + 1}`}
                      className="h-20 w-20 rounded-lg border border-zinc-200 bg-zinc-50 object-cover dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(i)}
                      className="absolute -right-1.5 -top-1.5 rounded-full bg-red-500 p-0.5 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
                    >
                      <TbX className="h-3 w-3" />
                    </button>
                    <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 py-0.5 text-[10px] text-white">
                      {i + 1}
                    </span>
                  </div>
                ))}
                {editingPreset.images.length < 14 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={saving}
                    className={[
                      "flex h-20 w-20 flex-col items-center justify-center rounded-lg",
                      "border-2 border-dashed border-zinc-300 text-zinc-400",
                      "dark:border-zinc-600 dark:text-zinc-500",
                      "hover:border-zinc-400 hover:text-zinc-500",
                      "dark:hover:border-zinc-500 dark:hover:text-zinc-400",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                    ].join(" ")}
                  >
                    <TbPlus className="h-5 w-5" />
                    <span className="text-[10px]">Add</span>
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
              />
            </div>

            {/* Prompt Prefix */}
            <div>
              <label className="mb-1 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                Prompt Prefix{" "}
                <span className="font-normal text-zinc-400 dark:text-zinc-500">(prepended to user prompt)</span>
              </label>
              <input
                type="text"
                value={editingPreset.promptPrefix}
                onChange={(e) => setEditingPreset((p) => p ? { ...p, promptPrefix: e.target.value } : p)}
                placeholder="e.g., 'Using the reference images as style guide, create'"
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

            {/* Prompt Suffix */}
            <div>
              <label className="mb-1 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                Prompt Suffix{" "}
                <span className="font-normal text-zinc-400 dark:text-zinc-500">(appended to user prompt)</span>
              </label>
              <input
                type="text"
                value={editingPreset.promptSuffix}
                onChange={(e) => setEditingPreset((p) => p ? { ...p, promptSuffix: e.target.value } : p)}
                placeholder="e.g., 'in the same art style as the reference images'"
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

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={saving}
                className={[
                  "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium",
                  "border border-zinc-300 bg-white text-zinc-700",
                  "dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
                  "hover:bg-zinc-50 dark:hover:bg-zinc-800",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                ].join(" ")}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSavePreset()}
                disabled={saving || !editingPreset.name.trim()}
                className={[
                  "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium",
                  "bg-zinc-600 text-white",
                  "hover:bg-zinc-700",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                ].join(" ")}
              >
                {saving ? (
                  <TbLoader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <TbCheck className="h-4 w-4" />
                )}
                {saving ? "Saving..." : editingOriginalId ? "Update Preset" : "Create Preset"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Presets List */}
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black">
        {presets.length === 0 ? (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center p-8 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-900">
              <TbPhoto className="h-6 w-6 text-zinc-400 dark:text-zinc-500" />
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No presets yet</p>
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
              Click "New Preset" to create one
            </p>
          </div>
        ) : filteredPresets.length === 0 ? (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center p-8 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-900">
              <TbSearch className="h-6 w-6 text-zinc-400 dark:text-zinc-500" />
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No presets match "{searchQuery}"</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filteredPresets.map((preset) => {
              const isEditing = editingOriginalId === preset.id;
              const isExpanded = expandedGallery === preset.id;
              const thumbnailLimit = 7;
              const hasMore = preset.imageUrls.length > thumbnailLimit;
              const displayImages = isExpanded ? preset.imageUrls : preset.imageUrls.slice(0, thumbnailLimit);
              return (
                <div
                  key={preset.id}
                  className={[
                    "flex items-start gap-4 p-4",
                    isEditing ? "bg-zinc-100/50 dark:bg-zinc-500/5" : "",
                    !preset.enabled ? "opacity-50" : "",
                  ].join(" ")}
                >
                  {/* Preview Image */}
                  <div className="shrink-0">
                    {preset.previewUrl ? (
                      <img
                        src={resolveMaybeRelativeUrl(apiBaseUrl, preset.previewUrl)}
                        alt=""
                        className="h-16 w-16 rounded-lg border border-zinc-200 bg-zinc-50 object-cover dark:border-zinc-700 dark:bg-zinc-900"
                        draggable={false}
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
                        <TbPhoto className="h-6 w-6 text-zinc-400 dark:text-zinc-500" />
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {preset.name}
                      </span>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        {preset.imageUrls.length} image{preset.imageUrls.length !== 1 ? "s" : ""}
                      </span>
                      {!preset.enabled && (
                        <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[11px] text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
                          disabled
                        </span>
                      )}
                    </div>
                    {preset.promptPrefix && (
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        <span className="font-medium">Prefix:</span> {preset.promptPrefix}
                      </p>
                    )}
                    {preset.promptSuffix && (
                      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                        <span className="font-medium">Suffix:</span> {preset.promptSuffix}
                      </p>
                    )}
                    {/* Image thumbnails */}
                    {preset.imageUrls.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {displayImages.map((url, i) => (
                          <img
                            key={i}
                            src={resolveMaybeRelativeUrl(apiBaseUrl, url)}
                            alt=""
                            className="h-8 w-8 rounded border border-zinc-200 object-cover dark:border-zinc-700"
                          />
                        ))}
                        {hasMore && (
                          <button
                            type="button"
                            onClick={() => setExpandedGallery(isExpanded ? null : preset.id)}
                            className="flex h-8 w-8 items-center justify-center rounded border border-zinc-200 bg-zinc-100 text-[10px] text-zinc-500 hover:border-zinc-400 hover:text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-400"
                          >
                            {isExpanded ? "Less" : `+${preset.imageUrls.length - thumbnailLimit}`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 items-center gap-2">
                    <ToggleSwitch
                      checked={preset.enabled}
                      disabled={saving}
                      onChange={(v) => void handleToggleEnabled(preset.id, v)}
                      title={preset.enabled ? "Disable preset" : "Enable preset"}
                    />
                    <button
                      type="button"
                      onClick={() => handleDuplicatePreset(preset)}
                      disabled={saving || !!editingPreset}
                      className={[
                        "inline-flex items-center rounded-lg p-1.5 text-zinc-400",
                        "hover:bg-zinc-100 hover:text-zinc-600",
                        "dark:hover:bg-zinc-800 dark:hover:text-zinc-300",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                      ].join(" ")}
                      title="Duplicate preset"
                    >
                      <TbCopy className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditPreset(preset)}
                      disabled={saving || (!!editingPreset && !isEditing)}
                      className={[
                        "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium",
                        "border border-zinc-300 text-zinc-700",
                        "dark:border-zinc-700 dark:text-zinc-300",
                        "hover:bg-zinc-50 dark:hover:bg-zinc-800",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                      ].join(" ")}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(preset.id)}
                      disabled={saving}
                      className={[
                        "inline-flex items-center rounded-lg p-1.5 text-zinc-400",
                        "hover:bg-red-100 hover:text-red-600",
                        "dark:hover:bg-red-500/10 dark:hover:text-red-400",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                      ].join(" ")}
                      title="Delete preset"
                    >
                      <TbTrash className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteConfirmId}
        title="Delete Preset"
        message="Are you sure you want to delete this preset? This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => deleteConfirmId && void handleDeletePreset(deleteConfirmId)}
        onCancel={() => setDeleteConfirmId(null)}
        isDestructive
      />

      {/* Duplicate Preset Confirmation */}
      <ConfirmDialog
        isOpen={!!duplicateTarget}
        title="Duplicate Preset"
        message={`Duplicate "${duplicateTarget?.name ?? ""}" as a new preset with "(copy)" suffix?`}
        confirmLabel="Duplicate"
        onConfirm={handleConfirmDuplicate}
        onCancel={() => setDuplicateTarget(null)}
      />
    </div>
  );
}

import { useEffect, useState } from "react";
import { TbLoader2, TbAlertCircle, TbPlus, TbTrash, TbStar, TbStarFilled, TbDownload } from "react-icons/tb";
import { toast } from "sonner";
import {
  getAdminSettings,
  putAdminSettings,
  type ApiBaseUrl,
} from "../../client";
import {
  listEnhancerPresets,
  upsertEnhancerPreset,
  deleteEnhancerPreset,
  setActiveEnhancerPreset,
  type EnhancerPreset,
} from "../../tauri-api";
import { downloadJson, buildEnhancerPresetsExport } from "../../utils/exportJson";

interface PromptEnhancerSectionProps {
  apiBaseUrl: ApiBaseUrl;
}

export function PromptEnhancerSection({ apiBaseUrl }: PromptEnhancerSectionProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Model settings (unchanged from original)
  const [model, setModel] = useState("");
  const [effectiveModel, setEffectiveModel] = useState("openai/gpt-4o-mini");
  const [savedModel, setSavedModel] = useState("");

  // Enhancer presets
  const [presets, setPresets] = useState<EnhancerPreset[]>([]);
  const [editingPresets, setEditingPresets] = useState<Record<string, { name: string; systemPrompt: string }>>({});
  const [newPresetName, setNewPresetName] = useState("");
  const [newPresetPrompt, setNewPresetPrompt] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      setError(null);
      try {
        const [data, presetList] = await Promise.all([
          getAdminSettings(apiBaseUrl),
          listEnhancerPresets(),
        ]);
        const m = data.promptEnhancerModel ?? "";
        setModel(m);
        setSavedModel(m);
        setEffectiveModel(data.promptEnhancerModelEffective);
        setPresets(presetList);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load settings");
      } finally {
        setLoading(false);
      }
    }
    void loadSettings();
  }, [apiBaseUrl]);

  /** Refresh presets and notify other components */
  async function refreshPresets() {
    const updated = await listEnhancerPresets();
    setPresets(updated);
    window.dispatchEvent(new Event("enhancer-presets-changed"));
    return updated;
  }

  const hasModelChanges = model !== savedModel;

  async function handleSaveModel() {
    setSaving(true);
    try {
      const data = await putAdminSettings(apiBaseUrl, {
        promptEnhancerModel: model.trim() || null,
      });
      const m = data.promptEnhancerModel ?? "";
      setModel(m);
      setSavedModel(m);
      setEffectiveModel(data.promptEnhancerModelEffective);
      toast.success("Model setting saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function startEditing(preset: EnhancerPreset) {
    setEditingPresets((prev) => ({
      ...prev,
      [preset.id]: { name: preset.name, systemPrompt: preset.systemPrompt },
    }));
  }

  function cancelEditing(id: string) {
    setEditingPresets((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function handleSavePreset(preset: EnhancerPreset) {
    const edits = editingPresets[preset.id];
    if (!edits) return;
    try {
      await upsertEnhancerPreset({
        id: preset.id,
        name: edits.name.trim() || preset.name,
        systemPrompt: edits.systemPrompt,
        sortOrder: preset.sortOrder,
      });
      await refreshPresets();
      cancelEditing(preset.id);
      toast.success(`Preset "${edits.name.trim() || preset.name}" saved`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save preset");
    }
  }

  async function handleDeletePreset(id: string, name: string) {
    if (!confirm(`Delete preset "${name}"?`)) return;
    try {
      await deleteEnhancerPreset(id);
      await refreshPresets();
      cancelEditing(id);
      toast.success(`Preset "${name}" deleted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete preset");
    }
  }

  async function handleSetActive(id: string) {
    try {
      await setActiveEnhancerPreset(id);
      await refreshPresets();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to set active preset");
    }
  }

  async function handleCreatePreset() {
    const name = newPresetName.trim();
    if (!name) {
      toast.error("Preset name is required");
      return;
    }
    try {
      await upsertEnhancerPreset({
        name,
        systemPrompt: newPresetPrompt.trim(),
        sortOrder: presets.length,
      });
      await refreshPresets();
      setNewPresetName("");
      setNewPresetPrompt("");
      setShowNewForm(false);
      toast.success(`Preset "${name}" created`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create preset");
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
        <TbLoader2 className="h-8 w-8 text-zinc-400 dark:text-zinc-500 animate-spin mb-4" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading settings...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/10 mb-4">
          <TbAlertCircle className="h-8 w-8 text-red-600 dark:text-red-500" />
        </div>
        <h3 className="text-lg font-medium text-zinc-800 dark:text-zinc-200">Failed to load settings</h3>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 max-w-md">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Prompt Enhancer</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Configure the AI model and manage system prompt presets for prompt enhancement.
        </p>
      </div>

      {/* Model setting */}
      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Model</h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            OpenRouter model ID for prompt enhancement
          </p>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={effectiveModel || "openai/gpt-4o-mini"}
            className={[
              "mt-2 w-full rounded-lg border px-3 py-2 text-sm font-mono",
              "border-zinc-300 bg-white text-zinc-900",
              "dark:border-zinc-700 dark:bg-black dark:text-zinc-100",
              "placeholder:text-zinc-400 dark:placeholder:text-zinc-500",
              "focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/50",
            ].join(" ")}
          />
          {!model && effectiveModel && (
            <p className="mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
              Currently using: <code className="rounded bg-zinc-200 px-1 py-0.5 dark:bg-zinc-800">{effectiveModel}</code> (from env/config default)
            </p>
          )}
        </div>
        {hasModelChanges && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleSaveModel()}
              disabled={saving}
              className={[
                "rounded-lg px-4 py-1.5 text-sm font-medium",
                "bg-zinc-600 text-white hover:bg-zinc-700",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              ].join(" ")}
            >
              {saving ? "Saving..." : "Save Model"}
            </button>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">Unsaved changes</span>
          </div>
        )}
      </div>

      {/* Enhancer presets */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">System Prompt Presets</h3>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Create multiple system prompts and switch between them from the generate view.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                const result = await downloadJson(
                  buildEnhancerPresetsExport(presets),
                  `enhancer-presets-${Date.now()}.json`
                );
                if (result) toast.success("Enhancer presets exported");
              }}
              disabled={presets.length === 0}
              className={[
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium",
                "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50",
                "dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              ].join(" ")}
            >
              <TbDownload className="h-3.5 w-3.5" />
              Export
            </button>
            <button
              type="button"
              onClick={() => setShowNewForm(true)}
              className={[
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium",
                "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50",
                "dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700",
              ].join(" ")}
            >
              <TbPlus className="h-3.5 w-3.5" />
              New Preset
            </button>
          </div>
        </div>

        {/* New preset form */}
        {showNewForm && (
          <div className="rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
            <div className="space-y-3">
              <input
                type="text"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="Preset name (e.g., Cinematic, Anime, Minimal)"
                className={[
                  "w-full rounded-lg border px-3 py-2 text-sm",
                  "border-zinc-300 bg-white text-zinc-900",
                  "dark:border-zinc-700 dark:bg-black dark:text-zinc-100",
                  "placeholder:text-zinc-400 dark:placeholder:text-zinc-500",
                  "focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/50",
                ].join(" ")}
                autoFocus
              />
              <textarea
                value={newPresetPrompt}
                onChange={(e) => setNewPresetPrompt(e.target.value)}
                placeholder="System prompt instructions..."
                rows={8}
                className={[
                  "w-full resize-y rounded-lg border px-3 py-2 text-sm font-mono",
                  "border-zinc-300 bg-white text-zinc-900",
                  "dark:border-zinc-700 dark:bg-black dark:text-zinc-100",
                  "placeholder:text-zinc-400 dark:placeholder:text-zinc-500",
                  "focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/50",
                ].join(" ")}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCreatePreset()}
                  disabled={!newPresetName.trim()}
                  className={[
                    "rounded-lg px-4 py-1.5 text-sm font-medium",
                    "bg-zinc-600 text-white hover:bg-zinc-700",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  ].join(" ")}
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewForm(false);
                    setNewPresetName("");
                    setNewPresetPrompt("");
                  }}
                  className="rounded-lg px-4 py-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Preset list */}
        <div className="space-y-3">
          {presets.map((preset) => {
            const isEditing = preset.id in editingPresets;
            const edits = editingPresets[preset.id];
            return (
              <div
                key={preset.id}
                className={[
                  "rounded-xl border p-4",
                  preset.isDefault
                    ? "border-zinc-400 bg-white dark:border-zinc-500 dark:bg-zinc-900"
                    : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900",
                ].join(" ")}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSetActive(preset.id)}
                      title={preset.isDefault ? "Active preset" : "Set as active"}
                      className="text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                    >
                      {preset.isDefault ? (
                        <TbStarFilled className="h-4 w-4 text-amber-500" />
                      ) : (
                        <TbStar className="h-4 w-4" />
                      )}
                    </button>
                    {isEditing ? (
                      <input
                        type="text"
                        value={edits!.name}
                        onChange={(e) =>
                          setEditingPresets((prev) => ({
                            ...prev,
                            [preset.id]: { ...prev[preset.id], name: e.target.value },
                          }))
                        }
                        className={[
                          "rounded border px-2 py-0.5 text-sm font-medium",
                          "border-zinc-300 bg-white text-zinc-900",
                          "dark:border-zinc-700 dark:bg-black dark:text-zinc-100",
                          "focus:border-zinc-500 focus:outline-none",
                        ].join(" ")}
                      />
                    ) : (
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {preset.name}
                      </span>
                    )}
                    {preset.isDefault && (
                      <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium uppercase text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleSavePreset(preset)}
                          className="rounded-lg px-3 py-1 text-xs font-medium bg-zinc-600 text-white hover:bg-zinc-700"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => cancelEditing(preset.id)}
                          className="rounded-lg px-3 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEditing(preset)}
                        className="rounded-lg px-3 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                      >
                        Edit
                      </button>
                    )}
                    {preset.id !== "default" && (
                      <button
                        type="button"
                        onClick={() => void handleDeletePreset(preset.id, preset.name)}
                        className="rounded p-1 text-zinc-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400"
                        title="Delete preset"
                      >
                        <TbTrash className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                {isEditing ? (
                  <textarea
                    value={edits!.systemPrompt}
                    onChange={(e) =>
                      setEditingPresets((prev) => ({
                        ...prev,
                        [preset.id]: { ...prev[preset.id], systemPrompt: e.target.value },
                      }))
                    }
                    rows={10}
                    className={[
                      "w-full resize-y rounded-lg border px-3 py-2 text-sm font-mono",
                      "border-zinc-300 bg-white text-zinc-900",
                      "dark:border-zinc-700 dark:bg-black dark:text-zinc-100",
                      "focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/50",
                    ].join(" ")}
                  />
                ) : (
                  <div className="max-h-[120px] overflow-y-auto rounded-lg bg-zinc-50 p-3 text-xs font-mono text-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-400">
                    {preset.systemPrompt.slice(0, 300)}
                    {preset.systemPrompt.length > 300 && "..."}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

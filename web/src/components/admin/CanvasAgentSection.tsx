import { useEffect, useState } from "react";
import { TbLoader2, TbAlertCircle, TbInfoCircle } from "react-icons/tb";
import { toast } from "sonner";
import {
  getAdminSettings,
  putAdminSettings,
  type AdminSettingsSummary,
  type ApiBaseUrl,
} from "../../client";

interface CanvasAgentSectionProps {
  apiBaseUrl: ApiBaseUrl;
}

export function CanvasAgentSection({ apiBaseUrl }: CanvasAgentSectionProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [model, setModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [temperature, setTemperature] = useState("0.7");

  // Effective defaults from server (shown as placeholders when fields are empty)
  const [effectiveModel, setEffectiveModel] = useState("anthropic/claude-sonnet-4");
  const [effectiveTemperature, setEffectiveTemperature] = useState("0.7");

  // Default system prompt from the server (used for pre-populating and reset)
  const [defaultSystemPrompt, setDefaultSystemPrompt] = useState("");

  // Track saved values to detect changes
  const [savedModel, setSavedModel] = useState("");
  const [savedSystemPrompt, setSavedSystemPrompt] = useState("");
  const [savedTemperature, setSavedTemperature] = useState("0.7");

  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      setError(null);
      try {
        const data = await getAdminSettings(apiBaseUrl);
        const m = data.canvasAgentModel ?? "";
        const sp = data.canvasAgentSystemPrompt ?? data.canvasAgentSystemPromptDefault;
        const t = data.canvasAgentTemperature !== null ? String(data.canvasAgentTemperature) : "0.7";
        setModel(m);
        setSystemPrompt(sp);
        setTemperature(t);
        setDefaultSystemPrompt(data.canvasAgentSystemPromptDefault);
        // Track the actual persisted value (empty = using default)
        setSavedModel(m);
        setSavedSystemPrompt(data.canvasAgentSystemPrompt ?? "");
        setSavedTemperature(t);
        setEffectiveModel(data.canvasAgentModelEffective);
        setEffectiveTemperature(String(data.canvasAgentTemperatureEffective));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load settings");
      } finally {
        setLoading(false);
      }
    }
    void loadSettings();
  }, [apiBaseUrl]);

  // If the prompt matches the default, treat it as "not customized" (empty saved value)
  const effectivePromptValue = systemPrompt.trim() === defaultSystemPrompt.trim() ? "" : systemPrompt.trim();
  const isPromptCustomized = effectivePromptValue !== "";
  const hasChanges = model !== savedModel || effectivePromptValue !== savedSystemPrompt || temperature !== savedTemperature;

  async function handleSave() {
    setSaving(true);
    try {
      const tempNum = parseFloat(temperature);
      // If prompt matches default, save as null (use default); otherwise save the custom prompt
      const promptToSave = isPromptCustomized ? systemPrompt.trim() : null;
      const data = await putAdminSettings(apiBaseUrl, {
        canvasAgentModel: model.trim() || null,
        canvasAgentSystemPrompt: promptToSave,
        canvasAgentTemperature: !isNaN(tempNum) ? tempNum : null,
      });
      const m = data.canvasAgentModel ?? "";
      const sp = data.canvasAgentSystemPrompt ?? data.canvasAgentSystemPromptDefault;
      const t = data.canvasAgentTemperature !== null ? String(data.canvasAgentTemperature) : "0.7";
      setModel(m);
      setSystemPrompt(sp);
      setTemperature(t);
      setDefaultSystemPrompt(data.canvasAgentSystemPromptDefault);
      setSavedModel(m);
      setSavedSystemPrompt(data.canvasAgentSystemPrompt ?? "");
      setSavedTemperature(t);
      setEffectiveModel(data.canvasAgentModelEffective);
      setEffectiveTemperature(String(data.canvasAgentTemperatureEffective));
      toast.success("Canvas agent settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
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
      {/* Section Header */}
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Canvas AI Agent</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Global defaults for the canvas chat agent. Per-workflow overrides take priority.
        </p>
      </div>

      {/* Agent Settings */}
      <div className="space-y-5 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Agent Model</h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            OpenRouter model ID for the canvas chat agent
          </p>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={effectiveModel || "anthropic/claude-sonnet-4"}
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

        <div className="border-t border-zinc-200 dark:border-zinc-800" />

        <div>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">System Prompt</h3>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Base instructions for the canvas agent
              </p>
            </div>
            {isPromptCustomized && (
              <button
                type="button"
                onClick={() => setSystemPrompt(defaultSystemPrompt)}
                className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 underline"
              >
                Reset to default
              </button>
            )}
          </div>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={14}
            className={[
              "mt-2 w-full resize-y rounded-lg border px-3 py-2 text-sm font-mono",
              "border-zinc-300 bg-white text-zinc-900",
              "dark:border-zinc-700 dark:bg-black dark:text-zinc-100",
              "placeholder:text-zinc-400 dark:placeholder:text-zinc-500",
              "focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/50",
            ].join(" ")}
          />
          <p className="mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
            Dynamic context (available workflows, models, and canvas state) is automatically appended at chat time.
          </p>
        </div>

        <div className="border-t border-zinc-200 dark:border-zinc-800" />

        <div>
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Temperature</h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Controls randomness of agent responses (0.0 = deterministic, 2.0 = very creative)
          </p>
          <div className="mt-2">
            <input
              type="number"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              min={0}
              max={2}
              step={0.1}
              className={[
                "w-32 rounded-lg border px-3 py-2 text-sm font-mono",
                "border-zinc-300 bg-white text-zinc-900",
                "dark:border-zinc-700 dark:bg-black dark:text-zinc-100",
                "focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/50",
              ].join(" ")}
            />
            <span className="ml-2 text-xs text-zinc-400 dark:text-zinc-500">Default: 0.7</span>
          </div>
        </div>
      </div>

      {/* Tools Info */}
      <div className="flex items-start gap-3 px-1">
        <TbInfoCircle className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" />
        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
          The agent automatically receives a <code className="rounded bg-zinc-200 px-1 py-0.5 dark:bg-zinc-800">generate_image</code> tool
          built from all enabled workflows. Each workflow becomes an option the agent can select when generating images.
          To control which workflows are available, use the Workflows settings tab.
        </p>
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!hasChanges || saving}
          className={[
            "rounded-lg px-5 py-2 text-sm font-medium",
            "bg-zinc-600 text-white",
            "hover:bg-zinc-700",
            "focus:outline-none focus:ring-2 focus:ring-zinc-500",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          ].join(" ")}
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {hasChanges && (
          <span className="text-xs text-zinc-400 dark:text-zinc-500">Unsaved changes</span>
        )}
      </div>
    </div>
  );
}

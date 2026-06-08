import { useEffect, useState } from "react";
import { TbAlertCircle, TbLoader2, TbRefresh } from "react-icons/tb";
import { toast } from "sonner";
import {
  getAdminSettings,
  getProviderStatus,
  putAdminSettings,
  type AdminSettingsSummary,
  type ApiBaseUrl,
} from "../../client";
import { ConfirmDialog } from "./ConfirmDialog";

interface ApiKeysSectionProps {
  apiBaseUrl: ApiBaseUrl;
  enabledProviders: Record<string, boolean>;
  onEnabledProvidersChange: (next: Record<string, boolean>) => void;
}

const PROVIDER_LOGOS: Record<string, string> = {
  comfyui: "/comfyui.svg",
  openrouter: "/openrouter.svg",
  replicate: "/replicate.svg",
  fal: "/fal.svg",
  kie: "/kieai.svg",
};

function ProviderToggle({ providerKey, enabled, onChange }: { providerKey: string; enabled: boolean; onChange: (enabled: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={[
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors",
        enabled
          ? "bg-accent-forest"
          : "bg-zinc-300 dark:bg-zinc-600",
      ].join(" ")}
      title={`${enabled ? "Disable" : "Enable"} ${providerKey} status in title bar`}
    >
      <span
        className={[
          "inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform",
          enabled ? "translate-x-[18px]" : "translate-x-[3px]",
        ].join(" ")}
      />
    </button>
  );
}

function ProviderLogo({ providerKey, className = "" }: { providerKey: string; className?: string }) {
  const src = PROVIDER_LOGOS[providerKey];
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      className={`h-5 w-5 shrink-0 dark:invert ${className}`}
    />
  );
}

interface ComfyStatus {
  connected: boolean;
  host?: string;
  healthyCount?: number;
  totalCount?: number;
}

function SourceBadge({ source }: { source: "settings" | "env" }) {
  if (source === "settings") {
    return (
      <span className="inline-flex items-center rounded bg-accent-sky/20 px-1.5 py-0.5 text-[11px] font-medium text-accent-sky dark:bg-accent-sky/10 dark:text-accent-sky">
        From settings
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
      From environment
    </span>
  );
}

export function ApiKeysSection({ apiBaseUrl, enabledProviders, onEnabledProvidersChange }: ApiKeysSectionProps) {
  const toggleProvider = (key: string) => (enabled: boolean) => {
    onEnabledProvidersChange({ ...enabledProviders, [key]: enabled });
  };
  // Admin settings state
  const [adminSettings, setAdminSettings] = useState<AdminSettingsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // OpenRouter state
  const [openrouterKeyInput, setOpenrouterKeyInput] = useState("");
  const [savingOpenrouter, setSavingOpenrouter] = useState(false);
  const [showClearOpenrouterConfirm, setShowClearOpenrouterConfirm] = useState(false);

  // Replicate state
  const [replicateKeyInput, setReplicateKeyInput] = useState("");
  const [savingReplicate, setSavingReplicate] = useState(false);
  const [showClearReplicateConfirm, setShowClearReplicateConfirm] = useState(false);

  // fal.ai state
  const [falKeyInput, setFalKeyInput] = useState("");
  const [savingFal, setSavingFal] = useState(false);
  const [showClearFalConfirm, setShowClearFalConfirm] = useState(false);

  // kie.ai state
  const [kieKeyInput, setKieKeyInput] = useState("");
  const [savingKie, setSavingKie] = useState(false);
  const [showClearKieConfirm, setShowClearKieConfirm] = useState(false);

  // ComfyUI status state
  const [comfyStatus, setComfyStatus] = useState<ComfyStatus | null>(null);
  const [comfyLoading, setComfyLoading] = useState(true);

  // ComfyUI URLs
  const [comfyUrlsInput, setComfyUrlsInput] = useState("");
  const [savingComfyUrls, setSavingComfyUrls] = useState(false);
  const [showResetComfyUrlsConfirm, setShowResetComfyUrlsConfirm] = useState(false);

  // Sync text inputs when settings are loaded/updated
  useEffect(() => {
    if (adminSettings) {
      setComfyUrlsInput(adminSettings.comfyBaseUrls.join(", "));
    }
  }, [adminSettings]);

  // Load admin settings on mount
  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      setError(null);
      try {
        const data = await getAdminSettings(apiBaseUrl);
        setAdminSettings(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load settings");
        setAdminSettings(null);
      } finally {
        setLoading(false);
      }
    }
    void loadSettings();
  }, [apiBaseUrl]);

  async function loadComfyStatus() {
    setComfyLoading(true);
    try {
      const status = await getProviderStatus(apiBaseUrl);
      setComfyStatus({
        connected: status.comfyui.available,
        host: status.comfyui.instances[0]?.url,
        healthyCount: status.comfyui.healthyCount,
        totalCount: status.comfyui.totalCount,
      });
    } catch {
      setComfyStatus({ connected: false });
    } finally {
      setComfyLoading(false);
    }
  }

  useEffect(() => {
    void loadComfyStatus();
  }, [apiBaseUrl]);

  // OpenRouter handlers
  async function handleSaveOpenrouterKey() {
    const trimmed = openrouterKeyInput.trim();
    if (!trimmed) return;

    setSavingOpenrouter(true);
    try {
      const next = await putAdminSettings(apiBaseUrl, { openrouterApiKey: trimmed });
      setAdminSettings(next);
      setOpenrouterKeyInput("");
      window.dispatchEvent(new Event("api-key-changed"));
      toast.success("OpenRouter API key saved");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to save API key";
      toast.error(message);
    } finally {
      setSavingOpenrouter(false);
    }
  }

  async function handleClearOpenrouterKey() {
    setSavingOpenrouter(true);
    setShowClearOpenrouterConfirm(false);
    try {
      const next = await putAdminSettings(apiBaseUrl, { openrouterApiKey: null });
      setAdminSettings(next);
      setOpenrouterKeyInput("");
      window.dispatchEvent(new Event("api-key-changed"));
      toast.success("OpenRouter API key cleared");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to clear API key";
      toast.error(message);
    } finally {
      setSavingOpenrouter(false);
    }
  }

  // Replicate handlers
  async function handleSaveReplicateKey() {
    const trimmed = replicateKeyInput.trim();
    if (!trimmed) return;

    setSavingReplicate(true);
    try {
      const next = await putAdminSettings(apiBaseUrl, { replicateApiKey: trimmed });
      setAdminSettings(next);
      setReplicateKeyInput("");
      window.dispatchEvent(new Event("api-key-changed"));
      toast.success("Replicate API key saved");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to save API key";
      toast.error(message);
    } finally {
      setSavingReplicate(false);
    }
  }

  async function handleClearReplicateKey() {
    setSavingReplicate(true);
    setShowClearReplicateConfirm(false);
    try {
      const next = await putAdminSettings(apiBaseUrl, { replicateApiKey: null });
      setAdminSettings(next);
      setReplicateKeyInput("");
      window.dispatchEvent(new Event("api-key-changed"));
      toast.success("Replicate API key cleared");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to clear API key";
      toast.error(message);
    } finally {
      setSavingReplicate(false);
    }
  }

  // fal.ai handlers
  async function handleSaveFalKey() {
    const trimmed = falKeyInput.trim();
    if (!trimmed) return;
    setSavingFal(true);
    try {
      const next = await putAdminSettings(apiBaseUrl, { falApiKey: trimmed });
      setAdminSettings(next);
      setFalKeyInput("");
      window.dispatchEvent(new Event("api-key-changed"));
      toast.success("fal.ai API key saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save API key");
    } finally {
      setSavingFal(false);
    }
  }

  async function handleClearFalKey() {
    setSavingFal(true);
    setShowClearFalConfirm(false);
    try {
      const next = await putAdminSettings(apiBaseUrl, { falApiKey: null });
      setAdminSettings(next);
      setFalKeyInput("");
      window.dispatchEvent(new Event("api-key-changed"));
      toast.success("fal.ai API key cleared");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clear API key");
    } finally {
      setSavingFal(false);
    }
  }

  // kie.ai handlers
  async function handleSaveKieKey() {
    const trimmed = kieKeyInput.trim();
    if (!trimmed) return;
    setSavingKie(true);
    try {
      const next = await putAdminSettings(apiBaseUrl, { kieApiKey: trimmed });
      setAdminSettings(next);
      setKieKeyInput("");
      window.dispatchEvent(new Event("api-key-changed"));
      toast.success("kie.ai API key saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save API key");
    } finally {
      setSavingKie(false);
    }
  }

  async function handleClearKieKey() {
    setSavingKie(true);
    setShowClearKieConfirm(false);
    try {
      const next = await putAdminSettings(apiBaseUrl, { kieApiKey: null });
      setAdminSettings(next);
      setKieKeyInput("");
      window.dispatchEvent(new Event("api-key-changed"));
      toast.success("kie.ai API key cleared");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clear API key");
    } finally {
      setSavingKie(false);
    }
  }

  // ComfyUI URLs handlers
  async function handleSaveComfyUrls() {
    const urls = comfyUrlsInput.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    if (urls.length === 0) {
      toast.error("At least one ComfyUI URL is required");
      return;
    }
    setSavingComfyUrls(true);
    try {
      const next = await putAdminSettings(apiBaseUrl, { comfyBaseUrls: urls });
      setAdminSettings(next);
      await loadComfyStatus();
      toast.success("ComfyUI URLs saved - pool recreated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save ComfyUI URLs");
    } finally {
      setSavingComfyUrls(false);
    }
  }

  async function handleResetComfyUrls() {
    setSavingComfyUrls(true);
    setShowResetComfyUrlsConfirm(false);
    try {
      const next = await putAdminSettings(apiBaseUrl, { comfyBaseUrls: null });
      setAdminSettings(next);
      await loadComfyStatus();
      toast.success("ComfyUI URLs reset to environment default");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reset ComfyUI URLs");
    } finally {
      setSavingComfyUrls(false);
    }
  }

  const canSaveOpenrouter = openrouterKeyInput.trim().length > 0 && !savingOpenrouter;
  const canClearOpenrouter = adminSettings?.openrouterApiKeyPresent && !savingOpenrouter;
  const canSaveReplicate = replicateKeyInput.trim().length > 0 && !savingReplicate;
  const canClearReplicate = adminSettings?.replicateApiKeyPresent && !savingReplicate;
  const canSaveFal = falKeyInput.trim().length > 0 && !savingFal;
  const canClearFal = adminSettings?.falApiKeyPresent && !savingFal;
  const canSaveKie = kieKeyInput.trim().length > 0 && !savingKie;
  const canClearKie = adminSettings?.kieApiKeyPresent && !savingKie;

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
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">API Keys & Configuration</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Manage API keys and runtime configuration for services
        </p>
      </div>

      {/* Provider Status Summary */}
      {adminSettings && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {([
            { key: "replicate", label: "Replicate", connected: adminSettings.replicateApiKeyPresent },
            { key: "fal", label: "FAL", connected: adminSettings.falApiKeyPresent },
            { key: "openrouter", label: "OpenRouter", connected: adminSettings.openrouterApiKeyPresent },
            { key: "kie", label: "kie.ai", connected: adminSettings.kieApiKeyPresent },
            { key: "comfyui", label: "ComfyUI", connected: comfyStatus?.connected ?? false },
          ] as const).map((p) => (
            <div
              key={p.key}
              className="flex items-center gap-2.5 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <ProviderLogo providerKey={p.key} className="h-4 w-4" />
              <div className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-zinc-700 dark:text-zinc-300">{p.label}</span>
              </div>
              <span
                className={[
                  "h-2 w-2 shrink-0 rounded-full",
                  p.connected ? "bg-accent-forest" : "bg-zinc-300 dark:bg-zinc-600",
                ].join(" ")}
                title={p.connected ? "Connected" : "Not configured"}
              />
            </div>
          ))}
        </div>
      )}

      {/* OpenRouter API Key Card */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <ProviderLogo providerKey="openrouter" className="mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">OpenRouter API Key</h3>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Used for prompt enhancement and Gemini image generation
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {/* Status badge */}
            <div
              className={[
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                adminSettings?.openrouterApiKeyPresent
                  ? "bg-accent-forest/15 text-accent-forest dark:bg-accent-forest/10 dark:text-accent-forest"
                  : "bg-accent-blush text-accent-coral dark:bg-accent-coral/10 dark:text-accent-coral",
              ].join(" ")}
            >
              <span
                className={[
                  "h-1.5 w-1.5 rounded-full",
                  adminSettings?.openrouterApiKeyPresent ? "bg-accent-forest" : "bg-accent-coral",
                ].join(" ")}
              />
              {adminSettings?.openrouterApiKeyPresent ? "Configured" : "Not Set"}
            </div>
            <ProviderToggle providerKey="openrouter" enabled={enabledProviders.openrouter !== false} onChange={toggleProvider("openrouter")} />
          </div>
        </div>

        {/* Current key hint */}
        {adminSettings?.openrouterApiKeyPresent && adminSettings.openrouterApiKeyHint && (
          <div className="mt-3">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Current: </span>
            <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300">
              {adminSettings.openrouterApiKeyHint}
            </span>
          </div>
        )}

        {/* Input and actions */}
        <div className="mt-4 flex items-center gap-3">
          <input
            type="password"
            value={openrouterKeyInput}
            onChange={(e) => setOpenrouterKeyInput(e.target.value)}
            placeholder="Paste new API key..."
            className={[
              "flex-1 rounded-lg border px-3 py-2 text-sm",
              "border-zinc-300 bg-white text-zinc-900",
              "dark:border-zinc-700 dark:bg-black dark:text-zinc-100",
              "placeholder:text-zinc-400 dark:placeholder:text-zinc-500",
              "focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/50",
              "disabled:cursor-not-allowed disabled:opacity-50",
            ].join(" ")}
            disabled={savingOpenrouter}
          />
          <button
            type="button"
            onClick={() => void handleSaveOpenrouterKey()}
            disabled={!canSaveOpenrouter}
            className={[
              "rounded-lg px-4 py-2 text-sm font-medium",
              "bg-zinc-600 text-white",
              "hover:bg-zinc-700",
              "focus:outline-none focus:ring-2 focus:ring-zinc-500",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            ].join(" ")}
          >
            {savingOpenrouter ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setShowClearOpenrouterConfirm(true)}
            disabled={!canClearOpenrouter}
            className={[
              "rounded-lg px-4 py-2 text-sm font-medium",
              "border border-zinc-300 bg-white text-zinc-700",
              "dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
              "hover:border-zinc-400 hover:bg-zinc-50",
              "dark:hover:border-zinc-600 dark:hover:bg-zinc-800",
              "focus:outline-none focus:ring-2 focus:ring-zinc-400/40",
              "disabled:cursor-not-allowed disabled:opacity-50",
            ].join(" ")}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Replicate API Key Card */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <ProviderLogo providerKey="replicate" className="mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Replicate API Key</h3>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Used for video generation (Seedance model)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {/* Status badge */}
            <div
              className={[
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                adminSettings?.replicateApiKeyPresent
                  ? "bg-accent-forest/15 text-accent-forest dark:bg-accent-forest/10 dark:text-accent-forest"
                  : "bg-accent-blush text-accent-coral dark:bg-accent-coral/10 dark:text-accent-coral",
              ].join(" ")}
            >
              <span
                className={[
                  "h-1.5 w-1.5 rounded-full",
                  adminSettings?.replicateApiKeyPresent ? "bg-accent-forest" : "bg-accent-coral",
                ].join(" ")}
              />
              {adminSettings?.replicateApiKeyPresent ? "Configured" : "Not Set"}
            </div>
            <ProviderToggle providerKey="replicate" enabled={enabledProviders.replicate !== false} onChange={toggleProvider("replicate")} />
          </div>
        </div>

        {/* Current key hint */}
        {adminSettings?.replicateApiKeyPresent && adminSettings.replicateApiKeyHint && (
          <div className="mt-3">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Current: </span>
            <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300">
              {adminSettings.replicateApiKeyHint}
            </span>
          </div>
        )}

        {/* Input and actions */}
        <div className="mt-4 flex items-center gap-3">
          <input
            type="password"
            value={replicateKeyInput}
            onChange={(e) => setReplicateKeyInput(e.target.value)}
            placeholder="Paste new API key..."
            className={[
              "flex-1 rounded-lg border px-3 py-2 text-sm",
              "border-zinc-300 bg-white text-zinc-900",
              "dark:border-zinc-700 dark:bg-black dark:text-zinc-100",
              "placeholder:text-zinc-400 dark:placeholder:text-zinc-500",
              "focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/50",
              "disabled:cursor-not-allowed disabled:opacity-50",
            ].join(" ")}
            disabled={savingReplicate}
          />
          <button
            type="button"
            onClick={() => void handleSaveReplicateKey()}
            disabled={!canSaveReplicate}
            className={[
              "rounded-lg px-4 py-2 text-sm font-medium",
              "bg-zinc-600 text-white",
              "hover:bg-zinc-700",
              "focus:outline-none focus:ring-2 focus:ring-zinc-500",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            ].join(" ")}
          >
            {savingReplicate ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setShowClearReplicateConfirm(true)}
            disabled={!canClearReplicate}
            className={[
              "rounded-lg px-4 py-2 text-sm font-medium",
              "border border-zinc-300 bg-white text-zinc-700",
              "dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
              "hover:border-zinc-400 hover:bg-zinc-50",
              "dark:hover:border-zinc-600 dark:hover:bg-zinc-800",
              "focus:outline-none focus:ring-2 focus:ring-zinc-400/40",
              "disabled:cursor-not-allowed disabled:opacity-50",
            ].join(" ")}
          >
            Clear
          </button>
        </div>
      </div>

      {/* fal.ai API Key Card */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <ProviderLogo providerKey="fal" className="mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">fal.ai API Key</h3>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Used for fal.ai image and video generation models
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className={["flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", adminSettings?.falApiKeyPresent ? "bg-accent-forest/15 text-accent-forest dark:bg-accent-forest/10 dark:text-accent-forest" : "bg-accent-blush text-accent-coral dark:bg-accent-coral/10 dark:text-accent-coral"].join(" ")}>
              <span className={["h-1.5 w-1.5 rounded-full", adminSettings?.falApiKeyPresent ? "bg-accent-forest" : "bg-accent-coral"].join(" ")} />
              {adminSettings?.falApiKeyPresent ? "Configured" : "Not Set"}
            </div>
            <ProviderToggle providerKey="fal" enabled={enabledProviders.fal !== false} onChange={toggleProvider("fal")} />
          </div>
        </div>
        {adminSettings?.falApiKeyPresent && adminSettings.falApiKeyHint && (
          <div className="mt-3">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Current: </span>
            <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{adminSettings.falApiKeyHint}</span>
          </div>
        )}
        <div className="mt-4 flex items-center gap-3">
          <input type="password" value={falKeyInput} onChange={(e) => setFalKeyInput(e.target.value)} placeholder="Paste new API key..." className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-black dark:text-zinc-100 dark:placeholder:text-zinc-500" disabled={savingFal} />
          <button type="button" onClick={() => void handleSaveFalKey()} disabled={!canSaveFal} className="rounded-lg bg-zinc-600 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:cursor-not-allowed disabled:opacity-50">{savingFal ? "Saving..." : "Save"}</button>
          <button type="button" onClick={() => setShowClearFalConfirm(true)} disabled={!canClearFal} className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-400/40 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800">Clear</button>
        </div>
      </div>

      {/* kie.ai API Key Card */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <ProviderLogo providerKey="kie" className="mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">kie.ai API Key</h3>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Used for kie.ai image generation (Flux Kontext)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className={["flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", adminSettings?.kieApiKeyPresent ? "bg-accent-forest/15 text-accent-forest dark:bg-accent-forest/10 dark:text-accent-forest" : "bg-accent-blush text-accent-coral dark:bg-accent-coral/10 dark:text-accent-coral"].join(" ")}>
              <span className={["h-1.5 w-1.5 rounded-full", adminSettings?.kieApiKeyPresent ? "bg-accent-forest" : "bg-accent-coral"].join(" ")} />
              {adminSettings?.kieApiKeyPresent ? "Configured" : "Not Set"}
            </div>
            <ProviderToggle providerKey="kie" enabled={enabledProviders.kie !== false} onChange={toggleProvider("kie")} />
          </div>
        </div>
        {adminSettings?.kieApiKeyPresent && adminSettings.kieApiKeyHint && (
          <div className="mt-3">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Current: </span>
            <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{adminSettings.kieApiKeyHint}</span>
          </div>
        )}
        <div className="mt-4 flex items-center gap-3">
          <input type="password" value={kieKeyInput} onChange={(e) => setKieKeyInput(e.target.value)} placeholder="Paste new API key..." className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-black dark:text-zinc-100 dark:placeholder:text-zinc-500" disabled={savingKie} />
          <button type="button" onClick={() => void handleSaveKieKey()} disabled={!canSaveKie} className="rounded-lg bg-zinc-600 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:cursor-not-allowed disabled:opacity-50">{savingKie ? "Saving..." : "Save"}</button>
          <button type="button" onClick={() => setShowClearKieConfirm(true)} disabled={!canClearKie} className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-400/40 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800">Clear</button>
        </div>
      </div>

      {/* ComfyUI Connection Card */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <ProviderLogo providerKey="comfyui" className="mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">ComfyUI Connection</h3>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Real-time status of GPU backend
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
          {/* Status badge */}
          {comfyLoading ? (
            <div className="flex items-center gap-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
              <TbLoader2 className="h-3 w-3 animate-spin" />
              Checking...
            </div>
          ) : (
            <div
              className={[
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                comfyStatus?.connected
                  ? "bg-accent-forest/15 text-accent-forest dark:bg-accent-forest/10 dark:text-accent-forest"
                  : "bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400",
              ].join(" ")}
            >
              <span
                className={[
                  "h-1.5 w-1.5 rounded-full",
                  comfyStatus?.connected ? "bg-accent-forest" : "bg-red-500 dark:bg-red-400",
                ].join(" ")}
              />
              {comfyStatus?.connected ? "Connected" : "Disconnected"}
            </div>
          )}
          <ProviderToggle providerKey="comfyui" enabled={enabledProviders.comfyui !== false} onChange={toggleProvider("comfyui")} />
          </div>
        </div>

        {/* Connection details */}
        {!comfyLoading && comfyStatus?.connected && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-zinc-500 dark:text-zinc-400">Mode:</span>
              <span className="text-zinc-700 dark:text-zinc-300">Live GPU Processing</span>
            </div>
          </div>
        )}
      </div>

      {/* ComfyUI URLs Card */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <ProviderLogo providerKey="comfyui" className="mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">ComfyUI Instance URLs</h3>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                GPU backend instance URLs (comma-separated). Changes recreate the connection pool.
              </p>
            </div>
          </div>
          {adminSettings && <SourceBadge source={adminSettings.comfyBaseUrlsSource} />}
        </div>

        <div className="mt-4">
          <textarea
            value={comfyUrlsInput}
            onChange={(e) => setComfyUrlsInput(e.target.value)}
            placeholder="http://gpu1:8188, http://gpu2:8188"
            rows={2}
            className={[
              "w-full rounded-lg border px-3 py-2 text-sm font-mono",
              "border-zinc-300 bg-white text-zinc-900",
              "dark:border-zinc-700 dark:bg-black dark:text-zinc-100",
              "placeholder:text-zinc-400 dark:placeholder:text-zinc-500",
              "focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/50",
              "disabled:cursor-not-allowed disabled:opacity-50",
            ].join(" ")}
            disabled={savingComfyUrls}
          />
        </div>

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSaveComfyUrls()}
            disabled={savingComfyUrls}
            className={[
              "rounded-lg px-4 py-2 text-sm font-medium",
              "bg-zinc-600 text-white",
              "hover:bg-zinc-700",
              "focus:outline-none focus:ring-2 focus:ring-zinc-500",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            ].join(" ")}
          >
            {savingComfyUrls ? "Saving..." : "Save"}
          </button>
          {adminSettings?.comfyBaseUrlsSource === "settings" && (
            <button
              type="button"
              onClick={() => setShowResetComfyUrlsConfirm(true)}
              disabled={savingComfyUrls}
              className={[
                "flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium",
                "border border-zinc-300 bg-white text-zinc-700",
                "dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
                "hover:border-zinc-400 hover:bg-zinc-50",
                "dark:hover:border-zinc-600 dark:hover:bg-zinc-800",
                "focus:outline-none focus:ring-2 focus:ring-zinc-400/40",
                "disabled:cursor-not-allowed disabled:opacity-50",
              ].join(" ")}
            >
              <TbRefresh className="h-4 w-4" />
              Reset to Default
            </button>
          )}
        </div>
      </div>

      {/* Clear OpenRouter Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showClearOpenrouterConfirm}
        title="Clear API Key"
        message="Are you sure you want to clear the OpenRouter API key? Prompt enhancement and Gemini workflows will stop working until a new key is configured."
        confirmLabel="Clear Key"
        cancelLabel="Cancel"
        onConfirm={() => void handleClearOpenrouterKey()}
        onCancel={() => setShowClearOpenrouterConfirm(false)}
        isDestructive={true}
      />

      {/* Clear Replicate Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showClearReplicateConfirm}
        title="Clear API Key"
        message="Are you sure you want to clear the Replicate API key? Video generation workflows will stop working until a new key is configured."
        confirmLabel="Clear Key"
        cancelLabel="Cancel"
        onConfirm={() => void handleClearReplicateKey()}
        onCancel={() => setShowClearReplicateConfirm(false)}
        isDestructive={true}
      />

      {/* Clear fal.ai Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showClearFalConfirm}
        title="Clear API Key"
        message="Are you sure you want to clear the fal.ai API key? fal.ai workflows will stop working until a new key is configured."
        confirmLabel="Clear Key"
        cancelLabel="Cancel"
        onConfirm={() => void handleClearFalKey()}
        onCancel={() => setShowClearFalConfirm(false)}
        isDestructive={true}
      />

      {/* Clear kie.ai Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showClearKieConfirm}
        title="Clear API Key"
        message="Are you sure you want to clear the kie.ai API key? kie.ai workflows will stop working until a new key is configured."
        confirmLabel="Clear Key"
        cancelLabel="Cancel"
        onConfirm={() => void handleClearKieKey()}
        onCancel={() => setShowClearKieConfirm(false)}
        isDestructive={true}
      />

      {/* Reset ComfyUI URLs Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showResetComfyUrlsConfirm}
        title="Reset ComfyUI URLs"
        message="Are you sure you want to reset ComfyUI URLs to the environment variable default? The connection pool will be recreated."
        confirmLabel="Reset to Default"
        cancelLabel="Cancel"
        onConfirm={() => void handleResetComfyUrls()}
        onCancel={() => setShowResetComfyUrlsConfirm(false)}
        isDestructive={false}
      />
    </div>
  );
}

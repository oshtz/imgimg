import { useState, useEffect, useCallback } from "react";
import { TbX, TbKey, TbFileCode, TbCategory, TbPuzzle, TbPhoto, TbClock, TbAdjustments, TbRobot, TbSparkles, TbRocket, TbTool, TbInfoCircle } from "react-icons/tb";
import { ApiKeysSection } from "./ApiKeysSection";
import { WorkflowsSection } from "./WorkflowsSection";
import { AssetTypesSection } from "./AssetTypesSection";
import { LoRAsSection } from "./LoRAsSection";
import { PresetsSection } from "./PresetsSection";
import { GenerationsSection } from "./GenerationsSection";
import { CanvasAgentSection } from "./CanvasAgentSection";
import { PromptEnhancerSection } from "./PromptEnhancerSection";
import { FeatureWorkflowsSection } from "./FeatureWorkflowsSection";
import type { ApiBaseUrl } from "../../api";
import { getAppInfo, checkPortableUpdate, installPortableUpdate, type AppInfo, type PortableUpdateStatus } from "../../tauri-api";
import type { ThemePreference, WidthPreference, CardSize, CardThumbnailMode, PromptPosition } from "../SettingsPanel";

export type SettingsTab =
  | "getting-started"
  | "about"
  | "api-keys"
  | "workflows"
  | "canvas-agent"
  | "prompt-enhancer"
  | "asset-types"
  | "loras"
  | "presets"
  | "feature-workflows"
  | "history"
  | "preferences";

interface SettingsNavItem {
  id: SettingsTab;
  label: string;
  icon: typeof TbKey;
}

const navItems: SettingsNavItem[] = [
  { id: "getting-started", label: "Getting Started", icon: TbRocket },
  { id: "preferences", label: "Preferences", icon: TbAdjustments },
  { id: "about", label: "About", icon: TbInfoCircle },
  { id: "api-keys", label: "API Keys", icon: TbKey },
  { id: "workflows", label: "Workflows", icon: TbFileCode },
  { id: "feature-workflows", label: "Feature Workflows", icon: TbTool },
  { id: "canvas-agent", label: "Canvas Agent", icon: TbRobot },
  { id: "prompt-enhancer", label: "Prompt Enhancer", icon: TbSparkles },
  { id: "asset-types", label: "Asset Types", icon: TbCategory },
  { id: "loras", label: "LoRAs", icon: TbPuzzle },
  { id: "presets", label: "Presets", icon: TbPhoto },
  { id: "history", label: "History", icon: TbClock },
];

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  apiBaseUrl: ApiBaseUrl;
  theme: ThemePreference;
  onThemeChange: (next: ThemePreference) => void;
  widthPreference: WidthPreference;
  onWidthPreferenceChange: (next: WidthPreference) => void;
  enabledProviders: Record<string, boolean>;
  onEnabledProvidersChange: (next: Record<string, boolean>) => void;
  cardSize: CardSize;
  onCardSizeChange: (next: CardSize) => void;
  cardThumbnailMode: CardThumbnailMode;
  onCardThumbnailModeChange: (next: CardThumbnailMode) => void;
  promptPosition: PromptPosition;
  onPromptPositionChange: (next: PromptPosition) => void;
  /** Called when workflows are modified (saved/deleted) in the admin panel */
  onWorkflowsChanged?: () => void;
  initialTab?: SettingsTab;
}

function SegmentedOption(props: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={[
        "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors",
        props.selected
          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
          : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200",
      ].join(" ")}
      onClick={props.onClick}
      aria-pressed={props.selected}
    >
      {props.label}
    </button>
  );
}

function GettingStartedSection(props: {
  apiBaseUrl: string;
  onNavigateToKeys: () => void;
}) {
  const [providerStatus, setProviderStatus] = useState<any>(null);

  useEffect(() => {
    import("../../tauri-api").then((tauri) =>
      tauri.getProviderStatus().then(setProviderStatus).catch(() => {})
    );
  }, []);

  const providers = [
    { id: "replicate", label: "Replicate", key: "replicate" },
    { id: "fal", label: "FAL", key: "fal" },
    { id: "openrouter", label: "OpenRouter", key: "openrouter" },
    { id: "comfyui", label: "ComfyUI", key: "comfyui" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Getting Started</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Connect providers and start generating. Workflows appear automatically for each configured provider.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Provider Status</h3>
        <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {providers.map((p) => {
            const status = providerStatus?.[p.key];
            const available = status?.available === true;
            const hasKey = status?.hasApiKey === true || available;
            return (
              <div key={p.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className={`h-2 w-2 rounded-full ${available ? "bg-green-500" : "bg-zinc-300 dark:bg-zinc-600"}`} />
                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{p.label}</span>
                </div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {available ? "Connected" : hasKey ? "Key set" : p.id === "comfyui" ? "Not running" : "No API key"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={props.onNavigateToKeys}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Manage API Keys
        </button>
        <button
          type="button"
          onClick={() => {
            import("../../lib/onboarding").then(({ loadBundledWorkflows }) => {
              void loadBundledWorkflows().then(() => {
                import("sonner").then(({ toast }) => toast.success("Default workflows loaded"));
              });
            });
          }}
          className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Load Default Workflows
        </button>
      </div>
    </div>
  );
}

function AboutSection() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [updateStatus, setUpdateStatus] = useState<PortableUpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAppInfo()
      .then((info) => {
        if (!cancelled) setAppInfo(info);
      })
      .catch(() => {
        if (!cancelled) setAppInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const checkForUpdates = async () => {
    setChecking(true);
    setError(null);
    try {
      setUpdateStatus(await checkPortableUpdate());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check for updates");
    } finally {
      setChecking(false);
    }
  };

  const installUpdate = async () => {
    if (!updateStatus?.downloadUrl) return;
    const confirmed = window.confirm(
      "imgimg will download the portable update, close, replace the current EXE, and reopen. Continue?"
    );
    if (!confirmed) return;

    setInstalling(true);
    setError(null);
    try {
      await installPortableUpdate(updateStatus.downloadUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to install update");
      setInstalling(false);
    }
  };

  const currentVersion = appInfo?.version ?? updateStatus?.currentVersion ?? "Loading…";
  const updateMessage = updateStatus
    ? updateStatus.updateAvailable
      ? `Version ${updateStatus.latestVersion} is available.`
      : "You are up to date."
    : "Check GitHub Releases for a newer portable build.";

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">About</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Version, release, and portable update information</p>
      </div>

      <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">App</div>
            <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Desktop application name</div>
          </div>
          <div className="text-sm text-zinc-700 dark:text-zinc-300">{appInfo?.name ?? "imgimg"}</div>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Version</div>
            <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Current running app version</div>
          </div>
          <div className="font-mono text-sm text-zinc-700 dark:text-zinc-300">{currentVersion}</div>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Distribution</div>
            <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Portable self-update replaces this EXE and restarts the app</div>
          </div>
          <div className="text-sm text-zinc-700 dark:text-zinc-300">Portable Windows</div>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Updates</h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{updateMessage}</p>
          {updateStatus?.assetName ? (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Portable asset: {updateStatus.assetName}</p>
          ) : null}
          {error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={checkForUpdates}
            disabled={checking || installing}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {checking ? "Checking…" : "Check for updates"}
          </button>

          {updateStatus?.updateAvailable && updateStatus.downloadUrl ? (
            <button
              type="button"
              onClick={installUpdate}
              disabled={installing}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              {installing ? "Installing…" : "Install and restart"}
            </button>
          ) : null}

          <a
            href="https://github.com/oshtz/imgimg/releases"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            GitHub Releases
          </a>
        </div>
      </div>
    </div>
  );
}

function PreferencesSection(props: {
  theme: ThemePreference;
  onThemeChange: (next: ThemePreference) => void;
  widthPreference: WidthPreference;
  onWidthPreferenceChange: (next: WidthPreference) => void;
  cardSize: CardSize;
  onCardSizeChange: (next: CardSize) => void;
  cardThumbnailMode: CardThumbnailMode;
  onCardThumbnailModeChange: (next: CardThumbnailMode) => void;
  promptPosition: PromptPosition;
  onPromptPositionChange: (next: PromptPosition) => void;
}) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Preferences</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Appearance and layout</p>
      </div>

      <div className="space-y-5">
        <div className="flex items-center justify-between py-2">
          <div>
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Theme</div>
            <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Choose light or dark appearance</div>
          </div>
          <div className="inline-flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
            <SegmentedOption label="Dark" selected={props.theme === "dark"} onClick={() => props.onThemeChange("dark")} />
            <SegmentedOption label="Light" selected={props.theme === "light"} onClick={() => props.onThemeChange("light")} />
          </div>
        </div>

        <div className="border-t border-zinc-200 dark:border-zinc-800" />

        <div className="flex items-center justify-between py-2">
          <div>
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Layout Width</div>
            <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Control the content area width</div>
          </div>
          <div className="inline-flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
            <SegmentedOption label="Fixed" selected={props.widthPreference === "fixed"} onClick={() => props.onWidthPreferenceChange("fixed")} />
            <SegmentedOption label="Full" selected={props.widthPreference === "full"} onClick={() => props.onWidthPreferenceChange("full")} />
          </div>
        </div>

        <div className="border-t border-zinc-200 dark:border-zinc-800" />

        <div className="flex items-center justify-between py-2">
          <div>
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Prompt Position</div>
            <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Anchor the prompt above, below, or beside history</div>
          </div>
          <div className="inline-flex flex-wrap justify-end gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
            <SegmentedOption label="Top" selected={props.promptPosition === "top"} onClick={() => props.onPromptPositionChange("top")} />
            <SegmentedOption label="Bottom" selected={props.promptPosition === "bottom"} onClick={() => props.onPromptPositionChange("bottom")} />
            <SegmentedOption label="Left" selected={props.promptPosition === "left"} onClick={() => props.onPromptPositionChange("left")} />
            <SegmentedOption label="Right" selected={props.promptPosition === "right"} onClick={() => props.onPromptPositionChange("right")} />
          </div>
        </div>

        <div className="border-t border-zinc-200 dark:border-zinc-800" />

        <div className="flex items-center justify-between py-2">
          <div>
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Card Size</div>
            <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Size of workflow and canvas cards</div>
          </div>
          <div className="inline-flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
            <SegmentedOption label="Small" selected={props.cardSize === "small"} onClick={() => props.onCardSizeChange("small")} />
            <SegmentedOption label="Medium" selected={props.cardSize === "medium"} onClick={() => props.onCardSizeChange("medium")} />
            <SegmentedOption label="Large" selected={props.cardSize === "large"} onClick={() => props.onCardSizeChange("large")} />
          </div>
        </div>

        <div className="border-t border-zinc-200 dark:border-zinc-800" />

        <div className="flex items-center justify-between py-2">
          <div>
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Card Thumbnails</div>
            <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">What to show on workflow card previews</div>
          </div>
          <div className="inline-flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
            <SegmentedOption label="Latest" selected={props.cardThumbnailMode === "latest"} onClick={() => props.onCardThumbnailModeChange("latest")} />
            <SegmentedOption label="Gradient" selected={props.cardThumbnailMode === "gradient"} onClick={() => props.onCardThumbnailModeChange("gradient")} />
            <SegmentedOption label="Random" selected={props.cardThumbnailMode === "random-gradient"} onClick={() => props.onCardThumbnailModeChange("random-gradient")} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminPanel({ isOpen, onClose, apiBaseUrl, theme, onThemeChange, widthPreference, onWidthPreferenceChange, enabledProviders, onEnabledProvidersChange, cardSize, onCardSizeChange, cardThumbnailMode, onCardThumbnailModeChange, promptPosition, onPromptPositionChange, onWorkflowsChanged, initialTab }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab ?? "preferences");

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleKeyDown]);

  useEffect(() => {
    if (isOpen) setActiveTab(initialTab ?? "preferences");
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const renderActiveSection = () => {
    switch (activeTab) {
      case "getting-started":
        return <GettingStartedSection apiBaseUrl={apiBaseUrl} onNavigateToKeys={() => setActiveTab("api-keys")} />;
      case "preferences":
        return <PreferencesSection theme={theme} onThemeChange={onThemeChange} widthPreference={widthPreference} onWidthPreferenceChange={onWidthPreferenceChange} cardSize={cardSize} onCardSizeChange={onCardSizeChange} cardThumbnailMode={cardThumbnailMode} onCardThumbnailModeChange={onCardThumbnailModeChange} promptPosition={promptPosition} onPromptPositionChange={onPromptPositionChange} />;
      case "about":
        return <AboutSection />;
      case "api-keys":
        return <ApiKeysSection apiBaseUrl={apiBaseUrl} enabledProviders={enabledProviders} onEnabledProvidersChange={onEnabledProvidersChange} />;
      case "workflows":
        return <WorkflowsSection apiBaseUrl={apiBaseUrl} onWorkflowsChanged={onWorkflowsChanged} />;
      case "feature-workflows":
        return <FeatureWorkflowsSection apiBaseUrl={apiBaseUrl} />;
      case "canvas-agent":
        return <CanvasAgentSection apiBaseUrl={apiBaseUrl} />;
      case "prompt-enhancer":
        return <PromptEnhancerSection apiBaseUrl={apiBaseUrl} />;
      case "asset-types":
        return <AssetTypesSection apiBaseUrl={apiBaseUrl} />;
      case "loras":
        return <LoRAsSection apiBaseUrl={apiBaseUrl} />;
      case "presets":
        return <PresetsSection apiBaseUrl={apiBaseUrl} />;
      case "history":
        return <GenerationsSection apiBaseUrl={apiBaseUrl} />;
      default:
        return <PreferencesSection theme={theme} onThemeChange={onThemeChange} widthPreference={widthPreference} onWidthPreferenceChange={onWidthPreferenceChange} cardSize={cardSize} onCardSizeChange={onCardSizeChange} cardThumbnailMode={cardThumbnailMode} onCardThumbnailModeChange={onCardThumbnailModeChange} promptPosition={promptPosition} onPromptPositionChange={onPromptPositionChange} />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        aria-label="Close settings"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="relative z-10 flex h-[85vh] w-[90vw] max-w-5xl overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        {/* Sidebar navigation */}
        <nav className="flex w-52 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-black">
          <div className="px-5 py-5">
            <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Settings</h1>
          </div>

          <div className="flex-1 space-y-0.5 overflow-y-auto px-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={[
                    "flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-white font-medium text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100"
                      : "text-zinc-600 hover:bg-white/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900/50 dark:hover:text-zinc-200",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Content area */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header - minimal, just close button */}
          <div className="flex shrink-0 items-center justify-end px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className={[
                "inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700",
                "dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200",
              ].join(" ")}
              aria-label="Close"
            >
              <TbX className="h-4 w-4" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-8 pb-8">
            {renderActiveSection()}
          </div>
        </div>
      </div>
    </div>
  );
}

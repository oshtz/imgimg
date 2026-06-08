import { useState, useCallback } from "react";
import { TbCheck, TbX, TbExternalLink } from "react-icons/tb";
import * as tauri from "../../tauri-api";
import { loadBundledWorkflows, setOnboardingCompleted } from "../../lib/onboarding";

interface ProviderConfig {
  id: string;
  label: string;
  description: string;
  keyPlaceholder: string;
  signupUrl: string;
  signupLabel: string;
  setKey: (value: string | null) => Promise<unknown>;
  recommended?: boolean;
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: "replicate",
    label: "Replicate",
    description: "Images, video, and audio from thousands of models. Pay per generation.",
    keyPlaceholder: "r8_...",
    signupUrl: "https://replicate.com/account/api-tokens",
    signupLabel: "replicate.com",
    setKey: tauri.setReplicateApiKey,
    recommended: true,
  },
  {
    id: "fal",
    label: "FAL",
    description: "Fast image, video, and audio generation.",
    keyPlaceholder: "fal_...",
    signupUrl: "https://fal.ai/dashboard/keys",
    signupLabel: "fal.ai",
    setKey: tauri.setFalApiKey,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "LLM-based image generation (Gemini, GPT, etc.)",
    keyPlaceholder: "sk-or-...",
    signupUrl: "https://openrouter.ai/keys",
    signupLabel: "openrouter.ai",
    setKey: tauri.setOpenrouterApiKey,
  },
];

type Step = "welcome" | "providers" | "done";

interface ProviderState {
  key: string;
  status: "idle" | "validating" | "valid" | "invalid";
  expanded: boolean;
}

export function WelcomeWizard(props: {
  onComplete: () => void;
}) {
  const [step, setStep] = useState<Step>("welcome");
  const [providerStates, setProviderStates] = useState<Record<string, ProviderState>>(() => {
    const initial: Record<string, ProviderState> = {};
    for (const p of PROVIDERS) {
      initial[p.id] = { key: "", status: "idle", expanded: p.recommended ?? false };
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);

  const configuredProviders = PROVIDERS.filter(
    (p) => providerStates[p.id]?.status === "valid"
  );

  const handleSkip = useCallback(async () => {
    setSaving(true);
    try {
      await loadBundledWorkflows();
      setOnboardingCompleted();
      props.onComplete();
    } finally {
      setSaving(false);
    }
  }, [props]);

  const handleKeyChange = useCallback((providerId: string, value: string) => {
    setProviderStates((prev) => ({
      ...prev,
      [providerId]: { ...prev[providerId], key: value, status: value ? "idle" : "idle" },
    }));
  }, []);

  const handleValidateKey = useCallback(async (provider: ProviderConfig) => {
    const state = providerStates[provider.id];
    if (!state?.key) return;

    setProviderStates((prev) => ({
      ...prev,
      [provider.id]: { ...prev[provider.id], status: "validating" },
    }));

    try {
      await provider.setKey(state.key);
      // Check health after setting key
      const status = await tauri.getProviderStatus();
      const providerStatus = (status as any)?.[provider.id];
      const isValid = providerStatus?.available === true || providerStatus?.hasApiKey === true;

      setProviderStates((prev) => ({
        ...prev,
        [provider.id]: { ...prev[provider.id], status: isValid ? "valid" : "invalid" },
      }));
    } catch {
      setProviderStates((prev) => ({
        ...prev,
        [provider.id]: { ...prev[provider.id], status: "invalid" },
      }));
    }
  }, [providerStates]);

  const toggleExpanded = useCallback((providerId: string) => {
    setProviderStates((prev) => ({
      ...prev,
      [providerId]: { ...prev[providerId], expanded: !prev[providerId].expanded },
    }));
  }, []);

  const handleContinue = useCallback(async () => {
    setSaving(true);
    try {
      await loadBundledWorkflows();
      setOnboardingCompleted();
      setStep("done");
    } finally {
      setSaving(false);
    }
  }, []);

  const handleFinish = useCallback(() => {
    props.onComplete();
  }, [props]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        {step === "welcome" && (
          <WelcomeStep
            onGetStarted={() => setStep("providers")}
            onSkip={handleSkip}
            saving={saving}
          />
        )}
        {step === "providers" && (
          <ProvidersStep
            providers={PROVIDERS}
            providerStates={providerStates}
            onKeyChange={handleKeyChange}
            onValidate={handleValidateKey}
            onToggleExpanded={toggleExpanded}
            onContinue={handleContinue}
            saving={saving}
          />
        )}
        {step === "done" && (
          <DoneStep
            configuredProviders={configuredProviders}
            allProviders={PROVIDERS}
            onFinish={handleFinish}
          />
        )}
      </div>
    </div>
  );
}

function WelcomeStep(props: {
  onGetStarted: () => void;
  onSkip: () => void;
  saving: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        Welcome to imgimg
      </h1>
      <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
        Generate images, videos, and audio using AI models from multiple providers.
        Let's connect a provider so you can start creating.
      </p>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={props.onGetStarted}
          className="rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Get Started
        </button>
        <button
          type="button"
          onClick={props.onSkip}
          disabled={props.saving}
          className="rounded-lg px-6 py-2 text-sm text-zinc-500 transition-colors hover:text-zinc-700 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-300"
        >
          Skip Setup
        </button>
      </div>
    </div>
  );
}

function ProvidersStep(props: {
  providers: ProviderConfig[];
  providerStates: Record<string, ProviderState>;
  onKeyChange: (providerId: string, value: string) => void;
  onValidate: (provider: ProviderConfig) => void;
  onToggleExpanded: (providerId: string) => void;
  onContinue: () => void;
  saving: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Connect your providers
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Add an API key for at least one provider. Workflows for each provider will appear automatically.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {props.providers.map((provider) => {
          const state = props.providerStates[provider.id];
          return (
            <ProviderCard
              key={provider.id}
              provider={provider}
              state={state}
              onKeyChange={(value) => props.onKeyChange(provider.id, value)}
              onValidate={() => props.onValidate(provider)}
              onToggleExpanded={() => props.onToggleExpanded(provider.id)}
            />
          );
        })}
      </div>

      <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
        Run models locally? You can connect a ComfyUI server later in Settings.
      </div>

      <button
        type="button"
        onClick={props.onContinue}
        disabled={props.saving}
        className="rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {props.saving ? "Setting up..." : "Continue"}
      </button>
    </div>
  );
}

function ProviderCard(props: {
  provider: ProviderConfig;
  state: ProviderState;
  onKeyChange: (value: string) => void;
  onValidate: () => void;
  onToggleExpanded: () => void;
}) {
  const { provider, state } = props;

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
      <button
        type="button"
        onClick={props.onToggleExpanded}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {provider.label}
            </span>
            {provider.recommended && (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                recommended
              </span>
            )}
            {state.status === "valid" && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-green-600 dark:text-green-400">
                <TbCheck className="h-3 w-3" /> Ready
              </span>
            )}
            {state.status === "invalid" && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-red-500">
                <TbX className="h-3 w-3" /> Invalid
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {provider.description}
          </p>
        </div>
        <span className="text-zinc-400">
          {state.expanded ? "\u25BE" : "\u25B8"}
        </span>
      </button>

      {state.expanded && (
        <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <div className="flex gap-2">
            <input
              type="password"
              value={state.key}
              onChange={(e) => props.onKeyChange(e.target.value)}
              placeholder={`API Token: ${provider.keyPlaceholder}`}
              onKeyDown={(e) => {
                if (e.key === "Enter" && state.key) props.onValidate();
              }}
              className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-800 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-400/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            />
            <button
              type="button"
              onClick={props.onValidate}
              disabled={!state.key || state.status === "validating"}
              className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              {state.status === "validating" ? "Checking..." : "Verify"}
            </button>
          </div>
          <a
            href={provider.signupUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-[11px] text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            Get a key at {provider.signupLabel} <TbExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  );
}

function DoneStep(props: {
  configuredProviders: ProviderConfig[];
  allProviders: ProviderConfig[];
  onFinish: () => void;
}) {
  const configuredIds = new Set(props.configuredProviders.map((p) => p.id));

  // Map provider to workflow names
  const PROVIDER_WORKFLOWS: Record<string, string[]> = {
    replicate: ["Replicate Image", "Replicate Video", "Replicate Audio"],
    fal: ["FAL Image", "FAL Video", "FAL Audio"],
    openrouter: ["OpenRouter Image"],
  };

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        You're ready to create
      </h2>

      <div className="w-full text-left">
        <p className="mb-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Your workflows:
        </p>
        <div className="flex flex-col gap-1">
          {props.allProviders.map((provider) => {
            const isConfigured = configuredIds.has(provider.id);
            const workflows = PROVIDER_WORKFLOWS[provider.id] ?? [];
            return workflows.map((wfName) => (
              <div
                key={wfName}
                className="flex items-center gap-2 rounded px-2 py-1 text-sm"
              >
                {isConfigured ? (
                  <TbCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
                ) : (
                  <span className="h-4 w-4" />
                )}
                <span
                  className={
                    isConfigured
                      ? "text-zinc-800 dark:text-zinc-200"
                      : "text-zinc-400 dark:text-zinc-600"
                  }
                >
                  {wfName}
                </span>
                {!isConfigured && (
                  <span className="ml-auto text-[10px] text-zinc-400 dark:text-zinc-600">
                    add API key in Settings
                  </span>
                )}
              </div>
            ));
          })}
        </div>
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Pick a workflow from the sidebar, choose a model, type a prompt, and hit Generate.
      </p>

      <button
        type="button"
        onClick={props.onFinish}
        className="rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Start Creating
      </button>
    </div>
  );
}

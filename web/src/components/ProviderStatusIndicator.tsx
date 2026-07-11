import type { ProviderConnectionState, ProviderStatus } from "../api";

interface ProviderStatusIndicatorProps {
  status: ProviderStatus | null;
  loading?: boolean;
  compact?: boolean;
  className?: string;
  enabledProviders?: Record<string, boolean>;
}

interface StatusDotProps {
  state: ProviderConnectionState;
  label: string;
  details?: string;
  compact?: boolean;
}

function normalizedState(
  status: { available: boolean; hasApiKey: boolean; state?: ProviderConnectionState },
): ProviderConnectionState {
  return status.state ?? (!status.hasApiKey ? "unconfigured" : status.available ? "verified" : "configured_unverified");
}

function stateLabel(state: ProviderConnectionState) {
  switch (state) {
    case "verified": return "Connected";
    case "configured_unverified": return "Configured, not verified";
    case "unconfigured": return "No API key";
    case "invalid": return "Invalid credentials";
    case "unreachable": return "Could not verify";
  }
}

function StatusDot({ state, label, details, compact }: StatusDotProps) {
  const healthy = state === "verified";
  const warning = state === "configured_unverified" || state === "unreachable";
  const dotColor = healthy ? "bg-accent-forest" : warning ? "bg-amber-500" : state === "unconfigured" ? "bg-zinc-500" : "bg-accent-coral";
  const dotGlow = healthy
    ? "shadow-[0_0_4px_rgba(79,121,105,0.4),0_0_8px_rgba(79,121,105,0.15)]"
    : warning ? "shadow-[0_0_4px_rgba(245,158,11,0.4)]" : "";
  const textColor = healthy ? "text-accent-forest" : warning ? "text-amber-600 dark:text-amber-400" : state === "unconfigured" ? "text-zinc-500" : "text-accent-coral";
  const tooltip = `${label}: ${details ?? stateLabel(state)}`;

  return (
    <div className="group relative flex items-center gap-1.5" title={tooltip} aria-label={tooltip}>
      <div aria-hidden="true" className={`h-1.5 w-1.5 rounded-full transition-all duration-500 ${dotColor} ${dotGlow}`} />
      {!compact && (
        <span className={`text-xs ${textColor}`}>
          {label}
        </span>
      )}
    </div>
  );
}

/**
 * Displays the status of generation providers (ComfyUI, OpenRouter, Replicate).
 * Shows green/red dots for each provider with tooltips for details.
 * 
 * Place this in the header bar for visibility.
 */
export function ProviderStatusIndicator({ status, loading, compact, className = "", enabledProviders }: ProviderStatusIndicatorProps) {
  const isEnabled = (key: string) => !enabledProviders || enabledProviders[key] !== false;

  const hasStatus = status !== null;

  // Build details strings (safe — only read when status is present)
  const comfyDetails = status?.comfyui.available
    ? `${status.comfyui.healthyCount}/${status.comfyui.totalCount} instances healthy`
    : "Unavailable";

  const openrouterState = status ? normalizedState(status.openrouter) : "unconfigured";
  const replicateState = status ? normalizedState(status.replicate) : "unconfigured";
  const falState = status ? normalizedState(status.fal) : "unconfigured";
  const kieState = status ? normalizedState(status.kie) : "unconfigured";

  // Check if any provider is unavailable (excluding missing API keys)
  const hasIssues = status && (
    (!status.comfyui.available) ||
    ([openrouterState, replicateState, falState, kieState] as ProviderConnectionState[])
      .some((state) => state === "invalid" || state === "unreachable")
  );

  const dots = status ? [
    isEnabled("comfyui") && (
      <StatusDot key="comfyui" state={status.comfyui.available ? "verified" : "unreachable"} label="ComfyUI" details={comfyDetails} compact={compact} />
    ),
    isEnabled("openrouter") && (
      <StatusDot key="openrouter" state={openrouterState} label="OpenRouter" compact={compact} />
    ),
    isEnabled("replicate") && (
      <StatusDot key="replicate" state={replicateState} label="Replicate" compact={compact} />
    ),
    isEnabled("fal") && status.fal && (
      <StatusDot key="fal" state={falState} label="fal.ai" compact={compact} />
    ),
    isEnabled("kie") && status.kie && (
      <StatusDot key="kie" state={kieState} label="kie.ai" compact={compact} />
    ),
  ].filter(Boolean) : [];

  if (!loading && !hasStatus) return null;

  return (
    <div className={`relative ${className}`}>
      {/* Skeleton layer — fades out once status arrives */}
      <div
        className={`flex items-center gap-4 transition-opacity duration-500 ${hasStatus ? "opacity-0 pointer-events-none absolute inset-0" : "opacity-100"}`}
      >
        <div className="h-1.5 w-1.5 rounded-full bg-zinc-500 animate-pulse" />
        <div className="h-1.5 w-1.5 rounded-full bg-zinc-500 animate-pulse" />
        <div className="h-1.5 w-1.5 rounded-full bg-zinc-500 animate-pulse" />
        <div className="h-1.5 w-1.5 rounded-full bg-zinc-500 animate-pulse" />
        <div className="h-1.5 w-1.5 rounded-full bg-zinc-500 animate-pulse" />
      </div>
      {/* Real status layer — fades in once status arrives */}
      <div
        className={`flex items-center gap-4 transition-opacity duration-500 ${hasStatus ? "opacity-100" : "opacity-0 pointer-events-none absolute inset-0"}`}
      >
        {hasIssues && !compact && (
          <span className="text-xs text-zinc-500 mr-1">Providers:</span>
        )}
        {dots}
      </div>
    </div>
  );
}

/**
 * Compact banner version that only shows when there are issues.
 * Use this for a less intrusive indicator.
 */
export function ProviderStatusBanner({ status, loading, className = "" }: Omit<ProviderStatusIndicatorProps, "compact">) {
  if (loading || !status) {
    return null;
  }

  const unavailableProviders: string[] = [];
  
  if (!status.comfyui.available) {
    unavailableProviders.push("ComfyUI");
  }
  if (["invalid", "unreachable"].includes(normalizedState(status.openrouter))) {
    unavailableProviders.push("OpenRouter");
  }
  if (["invalid", "unreachable"].includes(normalizedState(status.replicate))) {
    unavailableProviders.push("Replicate");
  }
  if (status.fal && ["invalid", "unreachable"].includes(normalizedState(status.fal))) {
    unavailableProviders.push("fal.ai");
  }
  if (status.kie && ["invalid", "unreachable"].includes(normalizedState(status.kie))) {
    unavailableProviders.push("kie.ai");
  }

  // Don't show banner if all providers are working
  if (unavailableProviders.length === 0) {
    return null;
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-500/10 border border-zinc-500/20 ${className}`}>
      <div className="h-2 w-2 rounded-full bg-zinc-500" />
      <span className="text-xs text-zinc-400">
        {unavailableProviders.length === 1 
          ? `${unavailableProviders[0]} is unavailable`
          : `${unavailableProviders.join(", ")} are unavailable`
        }
      </span>
    </div>
  );
}

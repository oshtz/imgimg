import type { ProviderStatus } from "../api";

interface ProviderStatusIndicatorProps {
  status: ProviderStatus | null;
  loading?: boolean;
  compact?: boolean;
  className?: string;
  enabledProviders?: Record<string, boolean>;
}

interface StatusDotProps {
  available: boolean;
  label: string;
  details?: string;
  compact?: boolean;
  /** Use a muted/dark red to indicate "configured but offline" rather than outright unavailable */
  offlineVariant?: boolean;
}

function StatusDot({ available, label, details, compact, offlineVariant }: StatusDotProps) {
  const dotColor = available
    ? "bg-accent-forest"
    : offlineVariant
      ? "bg-accent-ember"
      : "bg-accent-coral";
  const dotGlow = available
    ? "shadow-[0_0_4px_rgba(79,121,105,0.4),0_0_8px_rgba(79,121,105,0.15)]"
    : offlineVariant
      ? "shadow-[0_0_4px_rgba(163,69,69,0.4),0_0_8px_rgba(163,69,69,0.15)]"
      : "shadow-[0_0_4px_rgba(216,105,105,0.4),0_0_8px_rgba(216,105,105,0.15)]";
  const textColor = available
    ? "text-accent-forest"
    : offlineVariant
      ? "text-accent-ember"
      : "text-accent-coral";

  const tooltip = details ? `${label}: ${details}` : `${label}: ${available ? "Available" : "Unavailable"}`;

  return (
    <div className="group relative flex items-center gap-1.5" title={tooltip}>
      <div className={`h-1.5 w-1.5 rounded-full transition-all duration-500 ${dotColor} ${dotGlow}`} />
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

  const openrouterDetails = !status?.openrouter.hasApiKey
    ? "API Key Not Set"
    : status.openrouter.available
      ? "Connected"
      : "Unavailable";

  const replicateDetails = !status?.replicate.hasApiKey
    ? "API Key Not Set"
    : status.replicate.available
      ? "Connected"
      : "Unavailable";

  const falDetails = !status?.fal?.hasApiKey
    ? "API Key Not Set"
    : status.fal?.available
      ? "Connected"
      : "Unavailable";

  const kieDetails = !status?.kie?.hasApiKey
    ? "API Key Not Set"
    : status.kie?.available
      ? "Connected"
      : "Unavailable";

  // Check if any provider is unavailable (excluding missing API keys)
  const hasIssues = status && (
    (!status.comfyui.available) ||
    (!status.openrouter.available && status.openrouter.hasApiKey) ||
    (!status.replicate.available && status.replicate.hasApiKey) ||
    (status.fal && !status.fal.available && status.fal.hasApiKey) ||
    (status.kie && !status.kie.available && status.kie.hasApiKey)
  );

  const dots = status ? [
    isEnabled("comfyui") && (
      <StatusDot key="comfyui" available={status.comfyui.available} label="ComfyUI" details={comfyDetails} compact={compact} offlineVariant={!status.comfyui.available} />
    ),
    isEnabled("openrouter") && (
      <StatusDot key="openrouter" available={status.openrouter.available} label="OpenRouter" details={openrouterDetails} compact={compact} />
    ),
    isEnabled("replicate") && (
      <StatusDot key="replicate" available={status.replicate.available} label="Replicate" details={replicateDetails} compact={compact} />
    ),
    isEnabled("fal") && status.fal && (
      <StatusDot key="fal" available={status.fal.available} label="fal.ai" details={falDetails} compact={compact} />
    ),
    isEnabled("kie") && status.kie && (
      <StatusDot key="kie" available={status.kie.available} label="kie.ai" details={kieDetails} compact={compact} />
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
  if (!status.openrouter.available && status.openrouter.hasApiKey) {
    unavailableProviders.push("OpenRouter");
  }
  if (!status.replicate.available && status.replicate.hasApiKey) {
    unavailableProviders.push("Replicate");
  }
  if (status.fal && !status.fal.available && status.fal.hasApiKey) {
    unavailableProviders.push("fal.ai");
  }
  if (status.kie && !status.kie.available && status.kie.hasApiKey) {
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

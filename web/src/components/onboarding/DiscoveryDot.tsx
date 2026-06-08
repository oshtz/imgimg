import { getFeatureExplored } from "../../lib/onboarding";

export function DiscoveryDot(props: { feature: string }) {
  if (getFeatureExplored(props.feature)) return null;

  return (
    <span className="relative ml-1 flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500" />
    </span>
  );
}

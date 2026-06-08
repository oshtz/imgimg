import { useState, useEffect } from "react";
import { getOnboardingHintSeen, setOnboardingHintSeen } from "../../lib/onboarding";

export function OnboardingTooltip(props: {
  hintId: string;
  text: string;
  children: React.ReactNode;
  position?: "top" | "bottom";
}) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(() => getOnboardingHintSeen(props.hintId));

  useEffect(() => {
    if (dismissed) return;
    // Auto-dismiss after 5 seconds
    if (visible) {
      const timer = setTimeout(() => {
        setDismissed(true);
        setOnboardingHintSeen(props.hintId);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [visible, dismissed, props.hintId]);

  const handleInteraction = () => {
    if (!dismissed) {
      setVisible(true);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    setOnboardingHintSeen(props.hintId);
  };

  if (dismissed) {
    return <>{props.children}</>;
  }

  const posClass = props.position === "top"
    ? "bottom-full mb-2"
    : "top-full mt-2";

  return (
    <div className="relative" onMouseEnter={handleInteraction} onClick={handleInteraction}>
      {props.children}
      {visible && (
        <div
          className={`absolute left-1/2 z-50 -translate-x-1/2 ${posClass} whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300`}
          onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
        >
          {props.text}
        </div>
      )}
    </div>
  );
}

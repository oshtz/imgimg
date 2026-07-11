const STORAGE_KEYS = {
  completed: "imgimg.onboarding.completed",
  firstGenCompleted: "imgimg.onboarding.firstGenCompleted",
} as const;

export function isOnboardingCompleted(): boolean {
  return localStorage.getItem(STORAGE_KEYS.completed) === "true";
}

export function setOnboardingCompleted(): void {
  localStorage.setItem(STORAGE_KEYS.completed, "true");
}

export function isFirstGenCompleted(): boolean {
  return localStorage.getItem(STORAGE_KEYS.firstGenCompleted) === "true";
}

export function setFirstGenCompleted(): void {
  localStorage.setItem(STORAGE_KEYS.firstGenCompleted, "true");
}

export function getOnboardingHintSeen(hintId: string): boolean {
  return localStorage.getItem(`imgimg.onboarding.hints.${hintId}`) === "true";
}

export function setOnboardingHintSeen(hintId: string): void {
  localStorage.setItem(`imgimg.onboarding.hints.${hintId}`, "true");
}

export function getFeatureExplored(feature: string): boolean {
  return localStorage.getItem(`imgimg.onboarding.explored.${feature}`) === "true";
}

export function setFeatureExplored(feature: string): void {
  localStorage.setItem(`imgimg.onboarding.explored.${feature}`, "true");
}

import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
});

import {
  getFeatureExplored,
  getOnboardingHintSeen,
  isFirstGenCompleted,
  isOnboardingCompleted,
  setFeatureExplored,
  setFirstGenCompleted,
  setOnboardingCompleted,
  setOnboardingHintSeen,
} from "../onboarding";

beforeEach(() => storage.clear());

describe("onboarding markers", () => {
  it("tracks onboarding and first generation independently", () => {
    expect(isOnboardingCompleted()).toBe(false);
    expect(isFirstGenCompleted()).toBe(false);

    setOnboardingCompleted();
    expect(isOnboardingCompleted()).toBe(true);
    expect(isFirstGenCompleted()).toBe(false);

    setFirstGenCompleted();
    expect(isFirstGenCompleted()).toBe(true);
  });

  it("tracks hints and explored features independently", () => {
    setOnboardingHintSeen("welcome");
    setFeatureExplored("canvas");

    expect(getOnboardingHintSeen("welcome")).toBe(true);
    expect(getOnboardingHintSeen("other")).toBe(false);
    expect(getFeatureExplored("canvas")).toBe(true);
    expect(getFeatureExplored("gallery")).toBe(false);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
});

const mockUpsertWorkflow = vi.fn(async (_wf?: any) => {});
vi.mock("../../tauri-api", () => ({
  upsertWorkflow: (wf: any) => mockUpsertWorkflow(wf),
}));

import {
  isOnboardingCompleted,
  setOnboardingCompleted,
  areBundledWorkflowsLoaded,
  isFirstGenCompleted,
  setFirstGenCompleted,
  getOnboardingHintSeen,
  setOnboardingHintSeen,
  getFeatureExplored,
  setFeatureExplored,
  loadBundledWorkflows,
} from "../onboarding";

beforeEach(() => {
  storage.clear();
});

describe("isOnboardingCompleted / setOnboardingCompleted", () => {
  it("returns false when not set", () => {
    expect(isOnboardingCompleted()).toBe(false);
  });

  it("returns true after setting", () => {
    setOnboardingCompleted();
    expect(isOnboardingCompleted()).toBe(true);
  });
});

describe("areBundledWorkflowsLoaded", () => {
  it("returns false when not set", () => {
    expect(areBundledWorkflowsLoaded()).toBe(false);
  });

  it("returns true when localStorage value is 'true'", () => {
    localStorage.setItem("imgimg.onboarding.workflowsLoaded", "true");
    expect(areBundledWorkflowsLoaded()).toBe(true);
  });
});

describe("isFirstGenCompleted / setFirstGenCompleted", () => {
  it("returns false when not set", () => {
    expect(isFirstGenCompleted()).toBe(false);
  });

  it("returns true after setting", () => {
    setFirstGenCompleted();
    expect(isFirstGenCompleted()).toBe(true);
  });
});

describe("getOnboardingHintSeen / setOnboardingHintSeen", () => {
  it("returns false for unseen hint", () => {
    expect(getOnboardingHintSeen("welcome")).toBe(false);
  });

  it("returns true after marking seen", () => {
    setOnboardingHintSeen("welcome");
    expect(getOnboardingHintSeen("welcome")).toBe(true);
  });

  it("tracks different hints independently", () => {
    setOnboardingHintSeen("hint-a");
    expect(getOnboardingHintSeen("hint-a")).toBe(true);
    expect(getOnboardingHintSeen("hint-b")).toBe(false);
  });
});

describe("getFeatureExplored / setFeatureExplored", () => {
  it("returns false for unexplored feature", () => {
    expect(getFeatureExplored("canvas")).toBe(false);
  });

  it("returns true after marking explored", () => {
    setFeatureExplored("canvas");
    expect(getFeatureExplored("canvas")).toBe(true);
  });

  it("tracks different features independently", () => {
    setFeatureExplored("canvas");
    expect(getFeatureExplored("canvas")).toBe(true);
    expect(getFeatureExplored("gallery")).toBe(false);
  });
});

describe("loadBundledWorkflows", () => {
  beforeEach(() => {
    mockUpsertWorkflow.mockClear();
  });

  it("calls upsertWorkflow for each bundled workflow on first run", async () => {
    await loadBundledWorkflows();
    // There are 7 bundled workflows
    expect(mockUpsertWorkflow).toHaveBeenCalledTimes(7);
    // Verify some known workflow ids
    const calledIds = mockUpsertWorkflow.mock.calls.map((c: any[]) => c[0].id);
    expect(calledIds).toContain("replicate-image");
    expect(calledIds).toContain("fal-image");
    expect(calledIds).toContain("openrouter-image");
  });

  it("sets workflowsLoaded flag after completion", async () => {
    // Clear the flag first (it was set by previous test)
    storage.delete("imgimg.onboarding.workflowsLoaded");
    mockUpsertWorkflow.mockClear();

    await loadBundledWorkflows();
    expect(areBundledWorkflowsLoaded()).toBe(true);
  });

  it("no-ops on second call (already loaded)", async () => {
    // Ensure flag is set from previous test
    storage.set("imgimg.onboarding.workflowsLoaded", "true");
    mockUpsertWorkflow.mockClear();

    await loadBundledWorkflows();
    expect(mockUpsertWorkflow).not.toHaveBeenCalled();
  });

  it("handles upsertWorkflow errors gracefully (logs warning, continues)", async () => {
    storage.delete("imgimg.onboarding.workflowsLoaded");
    mockUpsertWorkflow.mockClear();

    // Make first call fail, rest succeed
    mockUpsertWorkflow.mockRejectedValueOnce(new Error("DB error"));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await loadBundledWorkflows();
    // Should still call all 7 workflows
    expect(mockUpsertWorkflow).toHaveBeenCalledTimes(7);
    // Should log a warning for the failed one
    expect(warnSpy).toHaveBeenCalled();
    // Should still set the flag
    expect(areBundledWorkflowsLoaded()).toBe(true);
    warnSpy.mockRestore();
  });
});

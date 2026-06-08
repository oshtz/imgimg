import * as tauri from "../tauri-api";

// Bundled workflow definitions — these are loaded on first launch
const BUNDLED_WORKFLOWS = [
  {
    id: "replicate-image",
    label: "Replicate Image",
    engine: "replicate",
    outputMode: "single_image",
    meta: {
      ui: { batchSize: false, aspectRatio: true },
      label: "Replicate Image",
      engine: "replicate",
      outputMode: "single_image",
      description: "Generate images using any Replicate model",
      workflow_id: "replicate-image",
      dynamicModel: true,
      defaultAssetType: "image",
      supportsImageInput: true,
    },
    template: {
      type: "replicate",
      template: { seed: "__SEED__", prompt: "__PROMPT__", aspect_ratio: "__ASPECT_RATIO__" },
    },
  },
  {
    id: "replicate-video",
    label: "Replicate Video",
    engine: "replicate",
    outputMode: "single_image",
    meta: {
      ui: { batchSize: false, aspectRatio: true },
      label: "Replicate Video",
      engine: "replicate",
      outputMode: "single_image",
      description: "Generate videos using any Replicate model",
      workflow_id: "replicate-video",
      dynamicModel: true,
      defaultAssetType: "video",
      supportsImageInput: true,
      supportsVideoInput: true,
    },
    template: {
      type: "replicate",
      template: { seed: "__SEED__", prompt: "__PROMPT__", aspect_ratio: "__ASPECT_RATIO__" },
    },
  },
  {
    id: "replicate-audio",
    label: "Replicate Audio",
    engine: "replicate",
    outputMode: "single_audio",
    meta: {
      ui: { batchSize: false, aspectRatio: false },
      label: "Replicate Audio",
      engine: "replicate",
      outputMode: "single_audio",
      description: "Generate audio using any Replicate model",
      workflow_id: "replicate-audio",
      dynamicModel: true,
      defaultAssetType: "audio",
      supportsImageInput: false,
    },
    template: {
      type: "replicate",
      template: { seed: "__SEED__", prompt: "__PROMPT__" },
    },
  },
  {
    id: "fal-image",
    label: "FAL Image",
    engine: "fal",
    outputMode: "single_image",
    meta: {
      ui: { batchSize: true, aspectRatio: true },
      label: "FAL Image",
      engine: "fal",
      dynamicModel: true,
      outputMode: "single_image",
      description: "Generate images using any FAL model",
      workflow_id: "fal-image",
      defaultAssetType: "image",
      supportsImageInput: true,
    },
    template: {
      type: "fal",
      template: { prompt: "__PROMPT__", seed: "__SEED__", image_size: "__ASPECT_RATIO__" },
    },
  },
  {
    id: "fal-video",
    label: "FAL Video",
    engine: "fal",
    outputMode: "single_image",
    meta: {
      ui: { batchSize: false, aspectRatio: true },
      label: "FAL Video",
      engine: "fal",
      dynamicModel: true,
      outputMode: "single_image",
      description: "Generate videos using any FAL model",
      workflow_id: "fal-video",
      defaultAssetType: "video",
      supportsImageInput: true,
      supportsVideoInput: true,
    },
    template: {
      type: "fal",
      template: { prompt: "__PROMPT__", seed: "__SEED__" },
    },
  },
  {
    id: "fal-audio",
    label: "FAL Audio",
    engine: "fal",
    outputMode: "single_audio",
    meta: {
      ui: { batchSize: false, aspectRatio: false },
      label: "FAL Audio",
      engine: "fal",
      dynamicModel: true,
      outputMode: "single_audio",
      description: "Generate audio using any FAL model",
      workflow_id: "fal-audio",
      defaultAssetType: "audio",
      supportsImageInput: false,
    },
    template: {
      type: "fal",
      template: { prompt: "__PROMPT__" },
    },
  },
  {
    id: "openrouter-image",
    label: "OpenRouter Image",
    engine: "openrouter",
    outputMode: "single_image",
    meta: {
      ui: { batchSize: false, aspectRatio: true },
      label: "OpenRouter Image",
      engine: "openrouter",
      dynamicModel: true,
      outputMode: "single_image",
      description: "Generate images using any OpenRouter model with image output",
      workflow_id: "openrouter-image",
      defaultAssetType: "image",
      supportsImageInput: true,
      maxImageInputs: 14,
      supportedAspectRatios: ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9"],
    },
    template: {
      type: "openrouter",
      template: {
        messages: [{ role: "user", content: "__PROMPT__" }],
        modalities: ["image", "text"],
        image_config: { aspect_ratio: "__ASPECT_RATIO__" },
        model: "__MODEL__",
      },
    },
  },
];

const STORAGE_KEYS = {
  completed: "imgimg.onboarding.completed",
  workflowsLoaded: "imgimg.onboarding.workflowsLoaded",
  firstGenCompleted: "imgimg.onboarding.firstGenCompleted",
} as const;

export function isOnboardingCompleted(): boolean {
  return localStorage.getItem(STORAGE_KEYS.completed) === "true";
}

export function setOnboardingCompleted(): void {
  localStorage.setItem(STORAGE_KEYS.completed, "true");
}

export function areBundledWorkflowsLoaded(): boolean {
  return localStorage.getItem(STORAGE_KEYS.workflowsLoaded) === "true";
}

export function isFirstGenCompleted(): boolean {
  return localStorage.getItem(STORAGE_KEYS.firstGenCompleted) === "true";
}

export function setFirstGenCompleted(): void {
  localStorage.setItem(STORAGE_KEYS.firstGenCompleted, "true");
}

export async function loadBundledWorkflows(): Promise<void> {
  if (areBundledWorkflowsLoaded()) return;

  for (const wf of BUNDLED_WORKFLOWS) {
    try {
      await tauri.upsertWorkflow({
        id: wf.id,
        label: wf.label,
        engine: wf.engine,
        outputMode: wf.outputMode,
        meta: wf.meta,
        template: wf.template,
      });
    } catch (e) {
      console.warn(`[onboarding] Failed to load workflow ${wf.id}:`, e);
    }
  }

  localStorage.setItem(STORAGE_KEYS.workflowsLoaded, "true");
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

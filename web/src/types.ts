export type ModelTag = "Album" | "Items" | "Characters" | "Logo" | "General" | (string & {});

export type Model = {
  id: string;
  name: string;
  tags: ModelTag[];
  triggerWords: string[];
  workflowTemplate: "master" | "single_item";
  previewImageUrl: string;
};

export type GenerationStatus = "queued" | "running" | "cancel_requested" | "cancelled" | "interrupted" | "succeeded" | "failed";

export type AssetType = "square" | "portrait" | "poster" | "landscape" | "horizontal" | "panoramic" | "video" | "audio" | "placeholder" | "preview" | "rembg" | (string & {});

export type Asset = {
  id: string;
  generationId: string;
  type: AssetType;
  url: string;
  itemIndex: number | null;
  createdAt: string;
  /** Per-asset prompt used for generation (e.g. LLM-generated prompt for full-set fanout items) */
  prompt?: string | null;
  isActive?: boolean; // True for current version, false for historical versions
};

/** Workflow-specific parameters stored with generation for regeneration support */
export type WorkflowParams = Record<string, number | boolean | string | string[]>;

export type Generation = {
  id: string;
  jobId: string | null;
  userId?: string; // Present in admin responses
  modelId: string;
  prompt: string;
  seed: number;
  workflowUsed: string;
  status: GenerationStatus;
  createdAt: string;
  updatedAt: string;
  error: string | null;
  assets: Asset[];
  queuePosition?: number | null;
  batchSize?: number | null;
  width?: number | null;
  height?: number | null;
  /** URL of input image used for this generation (relative to API base URL) */
  imageInputUrl?: string | null;
  /** Workflow-specific parameters (e.g., aspect_ratio, outpaint values) */
  workflowParams?: WorkflowParams | null;
};

export type SavedPrompt = {
  id: string;
  name: string;
  text: string;
  createdAt: string;
  updatedAt: string;
};

export type CurrentUser = {
  id: string;
  email: string;
  role: "user" | "admin";
  /** All user IDs that identify this user (current DB id + legacy hash alias) */
  aliases?: string[];
};

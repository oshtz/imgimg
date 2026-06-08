import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";

/**
 * Triggers a native "Save As" dialog and writes a JSON file.
 * Returns the serialized JSON string (useful for testing), or null if cancelled.
 */
export async function downloadJson(data: unknown, filename: string): Promise<string | null> {
  const json = JSON.stringify(data, null, 2);
  const path = await save({
    defaultPath: filename,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path) return null;
  await writeTextFile(path, json);
  return json;
}

export function buildEnhancerPresetsExport(
  presets: { name: string; systemPrompt: string }[]
) {
  return {
    type: "enhancer-presets" as const,
    exportedAt: new Date().toISOString(),
    presets: presets.map((p) => ({ name: p.name, systemPrompt: p.systemPrompt })),
  };
}

export function buildSavedPromptsExport(
  prompts: { name: string; text: string }[]
) {
  return {
    type: "saved-prompts" as const,
    exportedAt: new Date().toISOString(),
    prompts: prompts.map((p) => ({ name: p.name, text: p.text })),
  };
}

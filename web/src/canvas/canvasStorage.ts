/**
 * Multi-canvas management.
 *
 * When running inside Tauri, metadata and state are persisted to SQLite
 * via invoke(). Outside Tauri, falls back to localStorage.
 */

import { isTauri } from "../tauri-api";
import * as tauriApi from "../tauri-api";

const INDEX_KEY = "imgimg.canvases";
const STATE_PREFIX = "imgimg.canvas.state.";

export type CanvasMeta = {
  id: string;
  name: string;
  createdAt: string; // ISO timestamp
};

// ─── Index helpers ──────────────────────────────────────────────────

/** List canvases (sync for localStorage, async-compatible for Tauri). */
export function listCanvases(): CanvasMeta[] {
  // Sync version for initial render — Tauri uses listCanvasesAsync
  if (isTauri()) {
    // Return cached value synchronously; async callers should use listCanvasesAsync
    return _cachedCanvases;
  }
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CanvasMeta[];
  } catch {
    return [];
  }
}

let _cachedCanvases: CanvasMeta[] = [];

/** Async list that fetches from Tauri SQLite. */
export async function listCanvasesAsync(): Promise<CanvasMeta[]> {
  if (isTauri()) {
    const result = await tauriApi.listCanvases();
    _cachedCanvases = result;
    return result;
  }
  return listCanvases();
}

function saveIndex(canvases: CanvasMeta[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(canvases));
}

export async function createCanvas(name: string): Promise<CanvasMeta> {
  const id = `canvas_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const meta: CanvasMeta = { id, name, createdAt: new Date().toISOString() };

  if (isTauri()) {
    // Fire and forget — async create in SQLite
    // Replace optimistic entry with server-confirmed one when ready
    const saved = await tauriApi.createCanvas(id, name);
    _cachedCanvases = [..._cachedCanvases, saved];
    return saved;
  }

  const list = listCanvases();
  list.push(meta);
  saveIndex(list);
  return meta;
}

export async function renameCanvas(id: string, name: string): Promise<void> {
  if (isTauri()) {
    await tauriApi.renameCanvas(id, name);
    _cachedCanvases = _cachedCanvases.map((c) =>
      c.id === id ? { ...c, name } : c
    );
    return;
  }
  const list = listCanvases();
  const item = list.find((c) => c.id === id);
  if (item) {
    item.name = name;
    saveIndex(list);
  }
}

export async function deleteCanvas(id: string): Promise<void> {
  if (isTauri()) {
    await tauriApi.deleteCanvas(id);
    _cachedCanvases = _cachedCanvases.filter((c) => c.id !== id);
    return;
  }
  const list = listCanvases().filter((c) => c.id !== id);
  saveIndex(list);
  // Remove persisted canvas state
  try {
    localStorage.removeItem(STATE_PREFIX + id);
    localStorage.removeItem(`imgimg.canvas.viewport.${id}`);
  } catch {
    // ignore
  }
}

// ─── Per-canvas state helpers ───────────────────────────────────────

export function getCanvasLocalState(id: string): unknown | null {
  // In Tauri mode, this shouldn't be called — use getCanvasStateAsync instead
  try {
    const raw = localStorage.getItem(STATE_PREFIX + id);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function getCanvasStateAsync(id: string): Promise<unknown | null> {
  if (isTauri()) {
    return tauriApi.getCanvasState(id);
  }
  return getCanvasLocalState(id);
}

export async function putCanvasLocalState(id: string, state: unknown): Promise<void> {
  if (isTauri()) {
    // Persist to SQLite via Tauri
    const s = state as any;
    await tauriApi.saveCanvasState({
      gameId: id,
      nodes: s.nodes ?? [],
      chatMessages: s.chatMessages ?? [],
      chatWorkflowId: s.chatWorkflowId,
      nextZIndex: s.nextZIndex ?? 1,
      pinnedModelIds: s.pinnedModelIds ?? [],
      pinnedWorkflowIds: s.pinnedWorkflowIds ?? [],
      selectedProviderModelId: s.selectedProviderModelId ?? null,
      activeEngine: s.activeEngine ?? null,
    });
    return;
  }
  try {
    localStorage.setItem(STATE_PREFIX + id, JSON.stringify(state));
  } catch {
    // storage full
  }
}

import { convertFileSrc } from "@tauri-apps/api/core";
import { isTauri } from "../tauri-api";
import type { ApiBaseUrl } from "../api";
import type { Asset } from "../types";

/**
 * Cached storage base path for Tauri mode.
 * Initialized lazily on first call to assetUrl() in Tauri mode.
 */
let _storageBasePath: string | null = null;
let _storageBasePathPromise: Promise<string> | null = null;

/** Listeners notified when storage base path becomes available */
let _onReadyListeners: Array<() => void> = [];

/**
 * Initialize the storage base path for Tauri asset URL resolution.
 * Must be called once at app startup when running in Tauri.
 */
export async function initStorageBasePath() {
  if (!isTauri()) return;
  if (_storageBasePath) return;
  if (!_storageBasePathPromise) {
    _storageBasePathPromise = import("../tauri-api").then((t) =>
      t.getStorageBasePath()
    );
  }
  _storageBasePath = await _storageBasePathPromise;
  // Notify any waiting listeners
  for (const cb of _onReadyListeners) cb();
  _onReadyListeners = [];
}

/**
 * Subscribe to storage base path readiness. Calls `cb` once when the path
 * becomes available (or immediately if already set). Returns an unsubscribe fn.
 */
export function onStorageBasePathReady(cb: () => void): () => void {
  if (_storageBasePath) {
    cb();
    return () => {};
  }
  _onReadyListeners.push(cb);
  return () => {
    _onReadyListeners = _onReadyListeners.filter((l) => l !== cb);
  };
}

/**
 * Build a full, cache-busted URL for an asset.
 * In Tauri mode, converts /storage/ paths to asset:// protocol URLs.
 * Handles presigned S3 URLs (which must not be modified) and relative API URLs.
 */
export function assetUrl(apiBaseUrl: ApiBaseUrl, asset: Asset) {
  // Presigned S3 URLs already contain a signature computed over their exact
  // query-string.  Appending an extra `v=` cache-busting param would
  // invalidate that signature and cause the request to be rejected.
  if (asset.url.startsWith("https://") && asset.url.includes("X-Amz-Signature")) {
    return asset.url;
  }

  // Tauri mode: convert /storage/ relative paths to asset:// protocol URLs
  if (isTauri() && asset.url.startsWith("/storage/")) {
    // Storage base path not yet initialized — return empty to avoid broken http requests
    if (!_storageBasePath) return "";
    const relativePath = asset.url.slice("/storage/".length);
    // Construct absolute file path — use forward slashes, convertFileSrc handles it
    const filePath = `${_storageBasePath}/${relativePath}`;
    const assetSrc = convertFileSrc(filePath);
    // Add cache-busting
    const sep = assetSrc.includes("?") ? "&" : "?";
    return `${assetSrc}${sep}v=${encodeURIComponent(asset.createdAt)}`;
  }

  try {
    const u = new URL(asset.url, apiBaseUrl);
    u.searchParams.set("v", asset.createdAt);
    return u.toString();
  } catch {
    const base = asset.url.startsWith("http://") || asset.url.startsWith("https://") ? asset.url : `${apiBaseUrl}${asset.url}`;
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}v=${encodeURIComponent(asset.createdAt)}`;
  }
}

/**
 * Resolve a storage-relative URL (e.g. `/storage/gen_xxx_image.png`) to a
 * fetchable URL. In Tauri mode this uses `convertFileSrc()`; in web mode
 * it prepends the API base URL.
 */
export function resolveStorageUrl(apiBaseUrl: ApiBaseUrl, url: string): string {
  if (isTauri() && url.startsWith("/storage/")) {
    // Storage base path not yet initialized — return empty to avoid broken http requests
    if (!_storageBasePath) return "";
    const relativePath = url.slice("/storage/".length);
    return convertFileSrc(`${_storageBasePath}/${relativePath}`);
  }
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
    return url;
  }
  return `${apiBaseUrl}${url}`;
}

/**
 * Merge two asset arrays, de-duplicating by type + itemIndex.
 * Incoming assets overwrite existing ones with the same key.
 */
export function mergeAssets(existing: Asset[], incoming: Asset[]) {
  const byKey = new Map<string, Asset>();
  for (const a of existing) byKey.set(`${a.type}:${a.itemIndex ?? "null"}`, a);
  for (const a of incoming) byKey.set(`${a.type}:${a.itemIndex ?? "null"}`, a);
  return [...byKey.values()].sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return (a.itemIndex ?? -1) - (b.itemIndex ?? -1);
  });
}

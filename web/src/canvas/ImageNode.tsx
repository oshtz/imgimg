import { memo, useRef, useEffect, useState, useCallback } from "react";
import { Group, Image, Rect, Text, Line } from "react-konva";
import { KonvaLockIcon } from "./KonvaLockIcon";
import type Konva from "konva";
import { buildAuthHeaders, type ApiBaseUrl } from "../client";
import { isTauri } from "../tauri-api";
import { resolveStorageUrl } from "../utils/assets";
import type { CanvasNode, CanvasEditMode } from "./types";
import { KonvaShimmerRect } from "./KonvaShimmerRect";

/** Build the API proxy URL for an asset, bypassing S3 CORS. */
export function assetProxyUrl(apiBaseUrl: ApiBaseUrl, node: CanvasNode): string | null {
  // In Tauri mode, use the storage resolver for /storage/ URLs
  if (isTauri() && node.asset?.url?.startsWith("/storage/")) {
    const resolved = resolveStorageUrl(apiBaseUrl, node.asset.url);
    if (resolved) return resolved;
  }
  const asset = node.asset;
  const genId = node.generationId ?? asset?.generationId;
  if (!asset?.id || !genId) return null;
  return `${apiBaseUrl}/generations/${encodeURIComponent(genId)}/assets/${encodeURIComponent(asset.id)}/raw`;
}

// ─── Shared Image Cache ────────────────────────────────────────────────────
// Prevents re-fetching images when nodes leave and re-enter the viewport
// (viewport culling unmounts/remounts ImageNode components).
// LRU eviction keeps memory bounded.

const IMAGE_CACHE_MAX = 200;

type CacheEntry = {
  objectUrl: string;
  image: HTMLImageElement;
  lastAccess: number;
};

const imageCache = new Map<string, CacheEntry>();

function imageCacheGet(key: string): CacheEntry | undefined {
  const entry = imageCache.get(key);
  if (entry) entry.lastAccess = Date.now();
  return entry;
}

function imageCacheSet(key: string, objectUrl: string, image: HTMLImageElement): void {
  imageCache.set(key, { objectUrl, image, lastAccess: Date.now() });
  // Evict oldest entries when over limit
  if (imageCache.size > IMAGE_CACHE_MAX) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [k, v] of imageCache) {
      if (v.lastAccess < oldestTime) {
        oldestTime = v.lastAccess;
        oldestKey = k;
      }
    }
    if (oldestKey) {
      const evicted = imageCache.get(oldestKey);
      if (evicted) URL.revokeObjectURL(evicted.objectUrl);
      imageCache.delete(oldestKey);
    }
  }
}

/** Cache key for a canvas node's image source */
export function imageCacheKey(node: CanvasNode): string {
  // Prefer asset ID for stable identity; fall back to src URL
  if (node.asset?.id) return `asset:${node.asset.id}`;
  return `src:${node.src ?? node.id}`;
}

// ─── Batch Prefetch ───────────────────────────────────────────────────────
// Pre-warm the image cache for a set of nodes with controlled concurrency,
// so images are already available when ImageNode components mount.

const PREFETCH_CONCURRENCY = 8;

export async function prefetchCanvasImages(
  nodes: CanvasNode[],
  apiBaseUrl: ApiBaseUrl,
): Promise<void> {
  const imageNodes = nodes.filter(n => (n.type === "image" || !n.type) && n.src);
  // Skip nodes already in cache
  const uncached = imageNodes.filter(n => !imageCacheGet(imageCacheKey(n)));
  if (uncached.length === 0) return;

  let idx = 0;
  async function next(): Promise<void> {
    while (idx < uncached.length) {
      const node = uncached[idx++];
      const cacheKey = imageCacheKey(node);
      // Double-check (another worker may have cached it)
      if (imageCacheGet(cacheKey)) continue;
      try {
        const proxyUrl = assetProxyUrl(apiBaseUrl, node);
        const fetchUrl = proxyUrl ?? node.src!;
        const headers = proxyUrl ? { ...buildAuthHeaders() } : {};
        const res = await fetch(fetchUrl, {
          headers,
          ...(proxyUrl ? { credentials: "include" as const } : {}),
        });
        if (!res.ok) continue;
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        await new Promise<void>((resolve) => {
          const img = new window.Image();
          img.onload = () => { imageCacheSet(cacheKey, objectUrl, img); resolve(); };
          img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(); };
          img.src = objectUrl;
        });
      } catch {
        // Skip failed images
      }
    }
  }

  // Launch workers up to concurrency limit
  const workers = Array.from({ length: Math.min(PREFETCH_CONCURRENCY, uncached.length) }, () => next());
  await Promise.all(workers);
}

type LoadState = "loading" | "loaded" | "error";

type Props = {
  node: CanvasNode;
  isSelected: boolean;
  editMode: CanvasEditMode;
  panActive?: boolean;
  apiBaseUrl: ApiBaseUrl;
  onSelect: (nodeId: string, additive: boolean) => void;
  onDragStart: (nodeId: string) => void;
  onDragMove: (nodeId: string, dx: number, dy: number) => void;
  onDragEnd: (nodeId: string, dx: number, dy: number) => void;
  onContextMenu: (nodeId: string, e: Konva.KonvaEventObject<MouseEvent>) => void;
  /** Callback to register/unregister this node's Konva Group ref for the shared Transformer */
  onGroupRef?: (id: string, ref: Konva.Group | null) => void;
  /** Double-click to enter crop mode */
  onDblClick?: (nodeId: string) => void;
};

/** Duration (seconds) for the fade-in tween when an image finishes loading. */
const FADE_IN_DURATION = 0.3;

export const ImageNode = memo(function ImageNode({
  node, isSelected, editMode, panActive, apiBaseUrl,
  onSelect, onDragStart, onDragMove, onDragEnd,
  onContextMenu, onGroupRef, onDblClick,
}: Props) {
  const groupRef = useRef<Konva.Group>(null);
  const imageRef = useRef<Konva.Image>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  /** True when image was already cached at mount — skip fade-in animation */
  const wasCachedAtMount = useRef(false);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const isDark = document.documentElement.classList.contains("dark");

  // Register group ref with parent for shared Transformer
  useEffect(() => {
    onGroupRef?.(node.id, groupRef.current);
    return () => onGroupRef?.(node.id, null);
  }, [node.id, onGroupRef]);

  // Load image via shared cache or API proxy (avoids S3 CORS), falling back to direct fetch.
  // The cache prevents re-fetching when viewport culling unmounts/remounts this component.
  // When node.src is undefined (loading skeleton), stay in "loading" state until src arrives.
  useEffect(() => {
    // No src yet — this is a loading skeleton node; stay in loading state
    if (!node.src) {
      setLoadState(node.loadingStatus === "failed" ? "error" : "loading");
      setImage(null);
      return;
    }

    let active = true;
    setLoadState("loading");
    setImage(null);

    // Check shared cache first
    const cacheKey = imageCacheKey(node);
    const cached = imageCacheGet(cacheKey);
    if (cached) {
      wasCachedAtMount.current = true;
      setImage(cached.image);
      setLoadState("loaded");
      return;
    }

    (async () => {
      try {
        // Prefer the API proxy when asset metadata is available
        const proxyUrl = assetProxyUrl(apiBaseUrl, node);
        const fetchUrl = proxyUrl ?? node.src;
        const headers = proxyUrl ? { ...buildAuthHeaders() } : {};
        const res = await fetch(fetchUrl!, {
          headers,
          ...(proxyUrl ? { credentials: "include" as const } : {}),
        });
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const blob = await res.blob();
        if (!active) return;
        const objectUrl = URL.createObjectURL(blob);
        const img = new window.Image();
        img.onload = () => {
          if (active) {
            imageCacheSet(cacheKey, objectUrl, img);
            setImage(img);
            setLoadState("loaded");
          } else {
            // Component unmounted before load finished — still cache it
            imageCacheSet(cacheKey, objectUrl, img);
          }
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          if (active) setLoadState("error");
        };
        img.src = objectUrl;
      } catch {
        // Fallback: load directly via <img> tag
        if (!active) return;
        // In Tauri mode, resolve broken http://localhost:3001/storage/... URLs
        let fallbackSrc = node.src!;
        if (isTauri() && node.asset?.url?.startsWith("/storage/")) {
          const resolved = resolveStorageUrl(apiBaseUrl, node.asset.url);
          if (resolved) fallbackSrc = resolved;
        }
        const img = new window.Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          if (active) {
            setImage(img);
            setLoadState("loaded");
          }
        };
        img.onerror = () => {
          if (active) setLoadState("error");
        };
        img.src = fallbackSrc;
      }
    })();

    return () => {
      active = false;
      // Do NOT revoke object URLs here — they are owned by the shared cache
    };
  }, [node.src, node.loadingStatus, apiBaseUrl, node.asset, node.generationId]);

  // Fade-in tween when the image first becomes available (skip if prefetched/cached)
  useEffect(() => {
    const imgNode = imageRef.current;
    if (!imgNode || !image) return;
    if (wasCachedAtMount.current) {
      // Image was already in cache — show instantly
      imgNode.opacity(1);
      return;
    }
    // Start transparent and tween to full opacity
    imgNode.opacity(0);
    imgNode.to({ opacity: 1, duration: FADE_IN_DURATION, easing: (t: number, b: number, c: number, d: number) => {
      // Ease-out quad
      const t2 = t / d;
      return -c * t2 * (t2 - 2) + b;
    }});
  }, [image]);

  const handleClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.evt.button !== 0 || panActive) return;
      onSelect(node.id, e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey);
    },
    [node.id, onSelect, panActive]
  );

  const handleContextMenu = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      onContextMenu(node.id, e);
    },
    [node.id, onContextMenu]
  );

  const handleDragStart = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      dragStartPos.current = { x: e.evt.clientX, y: e.evt.clientY };
      onDragStart(node.id);
    },
    [node.id, onDragStart]
  );

  const handleDragMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      if (!dragStartPos.current) return;
      // Compute delta from raw mouse coords / stage scale — bypasses
      // Konva's setAbsolutePosition matrix inversion entirely.
      const scale = e.target.getStage()!.scaleX();
      const dx = (e.evt.clientX - dragStartPos.current.x) / scale;
      const dy = (e.evt.clientY - dragStartPos.current.y) / scale;
      // Reset Konva's native drag position so processDragFrame owns ALL positioning
      e.target.position({ x: node.x, y: node.y });
      onDragMove(node.id, dx, dy);
    },
    [node.id, node.x, node.y, onDragMove]
  );

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      if (!dragStartPos.current) { onDragEnd(node.id, 0, 0); return; }
      const scale = e.target.getStage()!.scaleX();
      const dx = (e.evt.clientX - dragStartPos.current.x) / scale;
      const dy = (e.evt.clientY - dragStartPos.current.y) / scale;
      dragStartPos.current = null;
      onDragEnd(node.id, dx, dy);
    },
    [node.id, onDragEnd]
  );

  const draggable = editMode === "select" && !node.locked && !panActive;

  // Error state: X icon dimensions relative to node size
  const errIconSize = Math.min(node.width, node.height) * 0.15;
  const errCx = node.width / 2;
  const errCy = node.height / 2 - 8;

  return (
    <Group
      ref={groupRef}
      x={node.x}
      y={node.y}
      width={node.width}
      height={node.height}
      draggable={draggable}
      onClick={handleClick}
      onTap={handleClick}
      onDblClick={() => onDblClick?.(node.id)}
      onDblTap={() => onDblClick?.(node.id)}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onContextMenu={handleContextMenu}
    >
      {/* ── Loaded image (fades in) ─────────────────────────────── */}
      {image && (
        <Image
          ref={imageRef}
          image={image}
          width={node.width}
          height={node.height}
          crop={node.crop}
        />
      )}

      {/* ── Loading placeholder: shimmer ────────────────────────── */}
      {loadState === "loading" && !image && (
        <KonvaShimmerRect
          width={node.width}
          height={node.height}
          baseColor={isDark ? "#27272a" : "#d4d4d8"}
          highlightColor={isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.4)"}
          opacity={0.75}
        />
      )}

      {/* ── Error state ─────────────────────────────────────────── */}
      {loadState === "error" && !image && (
        <>
          <Rect
            width={node.width}
            height={node.height}
            fill="#fafafa"
            cornerRadius={4}
            listening={false}
          />
          {/* X icon */}
          <Line
            points={[
              errCx - errIconSize / 2, errCy - errIconSize / 2,
              errCx + errIconSize / 2, errCy + errIconSize / 2,
            ]}
            stroke="#ef4444"
            strokeWidth={2.5}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[
              errCx + errIconSize / 2, errCy - errIconSize / 2,
              errCx - errIconSize / 2, errCy + errIconSize / 2,
            ]}
            stroke="#ef4444"
            strokeWidth={2.5}
            lineCap="round"
            listening={false}
          />
          <Text
            text={node.loadingLabel || "Failed to load"}
            x={0}
            y={errCy + errIconSize / 2 + 6}
            width={node.width}
            align="center"
            fontSize={Math.min(12, node.width * 0.04)}
            fill="#a1a1aa"
            listening={false}
          />
        </>
      )}

      {/* Selection border */}
      {isSelected && (
        <Rect
          width={node.width}
          height={node.height}
          stroke="#3b82f6"
          strokeWidth={2}
          listening={false}
        />
      )}
      {/* Lock icon */}
      {node.locked && <KonvaLockIcon x={4} y={4} size={14} />}
    </Group>
  );
});

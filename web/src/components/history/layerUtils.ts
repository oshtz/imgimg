import { writePsd } from "ag-psd";
import { buildAuthHeaders, type ApiBaseUrl } from "../../client";
import type { Asset } from "../../types";

export type LayerUiState = {
  x: number;
  y: number;
  visible: boolean;
  scale: number;
};

export type LayerViewState = {
  x: number;
  y: number;
  scale: number;
};

export type ResizeHandle = "nw" | "ne" | "sw" | "se";

export type ResizeState = {
  layerId: string;
  startX: number;
  startY: number;
  startScale: number;
  startWidth: number;
  startHeight: number;
  handle: ResizeHandle;
};

export type LayerExportFormat = "png" | "psd";

const LAYER_STATE_STORAGE_PREFIX = "imgimg.layerState.v1";

export type LayerTrimBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type LayerRenderInfo = {
  image: HTMLImageElement;
  source: CanvasImageSource;
  bounds: LayerTrimBounds;
  originalWidth: number;
  originalHeight: number;
};

export type LayerImageInfo = LayerRenderInfo & {
  src: string;
  objectUrl?: string;
};

export type LayerExportSpec = {
  asset: Asset;
  source: CanvasImageSource;
  state: LayerUiState;
  left: number;
  top: number;
  width: number;
  height: number;
};

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    img.crossOrigin = "anonymous";
    img.onload = () => settle(() => resolve(img));
    img.onerror = () => settle(() => reject(new Error(`Failed to load image: ${src}`)));
    img.src = src;
    if (img.decode) {
      img.decode().then(() => settle(() => resolve(img))).catch(() => {});
    }
  });
}

export async function fetchImageViaProxy(apiBaseUrl: ApiBaseUrl, asset: Asset): Promise<string> {
  const proxyUrl = `${apiBaseUrl}/generations/${encodeURIComponent(asset.generationId)}/assets/${encodeURIComponent(asset.id)}/raw`;
  const res = await fetch(proxyUrl, { headers: buildAuthHeaders(), credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch image via proxy: ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to export canvas"));
        return;
      }
      resolve(blob);
    }, type);
  });
}

export function layerStateStorageKey(generationId: string) {
  return `${LAYER_STATE_STORAGE_PREFIX}:${generationId}`;
}

export function readLayerStateFromStorage(generationId: string): Record<string, LayerUiState> {
  try {
    const raw = localStorage.getItem(layerStateStorageKey(generationId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const next: Record<string, LayerUiState> = {};
    for (const [layerId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const entry = value as Partial<LayerUiState>;
      const x = typeof entry.x === "number" && Number.isFinite(entry.x) ? entry.x : 0;
      const y = typeof entry.y === "number" && Number.isFinite(entry.y) ? entry.y : 0;
      const scale = typeof entry.scale === "number" && Number.isFinite(entry.scale) && entry.scale > 0 ? entry.scale : 1;
      const visible = typeof entry.visible === "boolean" ? entry.visible : true;
      next[layerId] = { x, y, scale, visible };
    }
    return next;
  } catch {
    return {};
  }
}

export function findOpaqueBounds(data: Uint8ClampedArray, width: number, height: number): LayerTrimBounds {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let maxAlpha = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > maxAlpha) maxAlpha = alpha;
    }
  }

  const alphaThreshold = Math.max(12, Math.floor(maxAlpha * 0.08));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha >= alphaThreshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { left: 0, top: 0, width, height };
  }

  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export async function loadLayerRenderInfo(src: string): Promise<LayerRenderInfo> {
  const image = await loadImage(src);
  const originalWidth = image.naturalWidth;
  const originalHeight = image.naturalHeight;
  if (originalWidth <= 0 || originalHeight <= 0) {
    throw new Error("Invalid image dimensions");
  }

  const canvas = document.createElement("canvas");
  canvas.width = originalWidth;
  canvas.height = originalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return {
      image,
      source: image,
      bounds: { left: 0, top: 0, width: originalWidth, height: originalHeight },
      originalWidth,
      originalHeight
    };
  }

  ctx.drawImage(image, 0, 0);

  let bounds: LayerTrimBounds = { left: 0, top: 0, width: originalWidth, height: originalHeight };
  try {
    const data = ctx.getImageData(0, 0, originalWidth, originalHeight).data;
    bounds = findOpaqueBounds(data, originalWidth, originalHeight);
  } catch {
    return { image, source: image, bounds, originalWidth, originalHeight };
  }

  const isTrimmed =
    bounds.left !== 0 ||
    bounds.top !== 0 ||
    bounds.width !== originalWidth ||
    bounds.height !== originalHeight;
  if (!isTrimmed) {
    return { image, source: image, bounds, originalWidth, originalHeight };
  }

  const trimmedCanvas = document.createElement("canvas");
  trimmedCanvas.width = Math.max(1, Math.round(bounds.width));
  trimmedCanvas.height = Math.max(1, Math.round(bounds.height));
  const trimmedCtx = trimmedCanvas.getContext("2d");
  if (!trimmedCtx) {
    return {
      image,
      source: image,
      bounds: { left: 0, top: 0, width: originalWidth, height: originalHeight },
      originalWidth,
      originalHeight
    };
  }

  trimmedCtx.drawImage(
    canvas,
    bounds.left,
    bounds.top,
    bounds.width,
    bounds.height,
    0,
    0,
    bounds.width,
    bounds.height
  );

  return { image, source: trimmedCanvas, bounds, originalWidth, originalHeight };
}

export async function loadLayerImageInfo(src: string, srcObjectUrl?: string): Promise<LayerImageInfo> {
  const info = await loadLayerRenderInfo(src);
  if (info.source instanceof HTMLCanvasElement) {
    try {
      const blob = await canvasToBlob(info.source, "image/png");
      const newObjectUrl = URL.createObjectURL(blob);
      if (srcObjectUrl) URL.revokeObjectURL(srcObjectUrl);
      return { ...info, src: newObjectUrl, objectUrl: newObjectUrl };
    } catch {
      return {
        ...info,
        source: info.image,
        bounds: { left: 0, top: 0, width: info.originalWidth, height: info.originalHeight },
        src,
        objectUrl: srcObjectUrl
      };
    }
  }

  return { ...info, src, objectUrl: srcObjectUrl };
}

export async function buildLayeredComposition(params: {
  layerAssets: Asset[];
  layerState: Record<string, LayerUiState>;
  assetUrl: (apiBaseUrl: ApiBaseUrl, asset: Asset) => string;
  apiBaseUrl: ApiBaseUrl;
  containerRect: DOMRect | null;
  layerImages?: Record<string, LayerImageInfo>;
}) {
  const { layerAssets, layerState, apiBaseUrl, containerRect, layerImages } = params;
  if (layerAssets.length === 0) throw new Error("No layers available for export");
  const renderInfos = await Promise.all(
    layerAssets.map(async (layer) => {
      const cached = layerImages?.[layer.id];
      if (cached) return cached;
      const blobUrl = await fetchImageViaProxy(apiBaseUrl, layer);
      try {
        return await loadLayerRenderInfo(blobUrl);
      } catch {
        const image = await loadImage(blobUrl);
        return {
          image,
          source: image,
          bounds: { left: 0, top: 0, width: image.naturalWidth, height: image.naturalHeight },
          originalWidth: image.naturalWidth,
          originalHeight: image.naturalHeight
        };
      }
    })
  );
  const baseWidth = Math.max(...renderInfos.map((info) => info.originalWidth));
  const baseHeight = Math.max(...renderInfos.map((info) => info.originalHeight));
  if (!Number.isFinite(baseWidth) || !Number.isFinite(baseHeight) || baseWidth <= 0 || baseHeight <= 0) {
    throw new Error("Unable to determine export size");
  }

  const fitScale =
    containerRect && containerRect.width > 0 && containerRect.height > 0
      ? Math.min(1, containerRect.width / baseWidth, containerRect.height / baseHeight)
      : 1;
  const offsetScale = fitScale > 0 ? 1 / fitScale : 1;

  const layers: LayerExportSpec[] = layerAssets.map((layer, idx) => {
    const info = renderInfos[idx];
    const bounds = info.bounds;
    const state = layerState[layer.id] ?? { x: 0, y: 0, visible: true, scale: 1 };
    const scale = Number.isFinite(state.scale) ? state.scale : 1;
    const width = bounds.width * scale;
    const height = bounds.height * scale;
    const trimOffsetX = bounds.left + bounds.width / 2 - info.originalWidth / 2;
    const trimOffsetY = bounds.top + bounds.height / 2 - info.originalHeight / 2;
    const left = Math.round(baseWidth / 2 + state.x * offsetScale + trimOffsetX - width / 2);
    const top = Math.round(baseHeight / 2 + state.y * offsetScale + trimOffsetY - height / 2);
    return { asset: layer, source: info.source, state, left, top, width, height };
  });

  const canvas = document.createElement("canvas");
  canvas.width = baseWidth;
  canvas.height = baseHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to initialize canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  for (const layer of layers) {
    if (!layer.state.visible) continue;
    if (layer.width <= 0 || layer.height <= 0) continue;
    ctx.drawImage(layer.source, layer.left, layer.top, layer.width, layer.height);
  }

  return { canvas, layers, width: baseWidth, height: baseHeight };
}

export async function exportComposition(
  format: LayerExportFormat,
  layerAssets: Asset[],
  layerState: Record<string, LayerUiState>,
  assetUrl: (apiBaseUrl: ApiBaseUrl, asset: Asset) => string,
  apiBaseUrl: ApiBaseUrl,
  containerRect: DOMRect | null,
  layerImages: Record<string, LayerImageInfo>,
  generationId: string,
) {
  const composition = await buildLayeredComposition({
    layerAssets,
    layerState,
    assetUrl,
    apiBaseUrl,
    containerRect,
    layerImages
  });
  const fileBase = `layered_${generationId}`;
  if (format === "png") {
    const blob = await canvasToBlob(composition.canvas, "image/png");
    downloadBlob(blob, `${fileBase}.png`);
    return;
  }

  const psdLayers = composition.layers.map((layer) => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(layer.width));
    canvas.height = Math.max(1, Math.round(layer.height));
    const ctx = canvas.getContext("2d");
    if (ctx && canvas.width > 0 && canvas.height > 0) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(layer.source, 0, 0, canvas.width, canvas.height);
    }
    const name =
      layer.asset.itemIndex !== null && layer.asset.itemIndex !== undefined
        ? `Layer ${layer.asset.itemIndex + 1}`
        : "Layer";
    return {
      name,
      left: Math.round(layer.left),
      top: Math.round(layer.top),
      canvas,
      hidden: !layer.state.visible
    };
  });
  const buffer = writePsd({
    width: composition.width,
    height: composition.height,
    canvas: composition.canvas,
    children: psdLayers
  });
  const blob = new Blob([buffer], { type: "application/vnd.adobe.photoshop" });
  downloadBlob(blob, `${fileBase}.psd`);
}

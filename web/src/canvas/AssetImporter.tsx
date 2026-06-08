import { useState, useEffect, useRef, useCallback } from "react";
import { TbPhoto, TbX, TbLoader2, TbLayoutGrid, TbGrid4X4 } from "react-icons/tb";
import type { Generation, Asset } from "../types";
import type { ApiBaseUrl } from "../api";
import { getGallery } from "../client";
import { useCanvas } from "./CanvasProvider";

type Props = {
  assetUrl: (asset: Asset) => string;
  apiBaseUrl: ApiBaseUrl;
  containerWidth?: number;
  containerHeight?: number;
};

type AssetItem = { asset: Asset; generation: Generation; url: string };

const DEFAULT_PLACE_SIZE = 300;
const PAGE_LIMIT = 30;
const MIN_COLS = 2;
const MAX_COLS = 6;
const DEFAULT_COLS = 3;

function flattenAssets(generations: Generation[], assetUrl: (a: Asset) => string): AssetItem[] {
  const out: AssetItem[] = [];
  for (const gen of generations) {
    if (gen.status !== "succeeded") continue;
    for (const asset of gen.assets) {
      if (asset.type === "video" || asset.type === "preview") continue;
      out.push({ asset, generation: gen, url: assetUrl(asset) });
    }
  }
  return out;
}

export function AssetImporter({ assetUrl, apiBaseUrl, containerWidth, containerHeight }: Props) {
  const [open, setOpen] = useState(false);
  const { state, dispatch, currentUser } = useCanvas();

  const [items, setItems] = useState<AssetItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cols, setCols] = useState(DEFAULT_COLS);
  const gridRef = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(async (cursor?: string | null) => {
    setLoading(true);
    try {
      const data = await getGallery(apiBaseUrl, { limit: PAGE_LIMIT, cursor });
      const newAssets = flattenAssets(data.items, assetUrl);
      setItems((prev) => cursor ? [...prev, ...newAssets] : newAssets);
      setNextCursor(data.nextCursor);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, assetUrl]);

  // Fetch first page when dropdown opens; reset when it closes
  useEffect(() => {
    if (open) {
      setItems([]);
      setNextCursor(null);
      fetchPage();
    }
  }, [open, fetchPage]);

  // Infinite scroll
  const handleScroll = useCallback(() => {
    const el = gridRef.current;
    if (!el || loading || !nextCursor) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
      fetchPage(nextCursor);
    }
  }, [loading, nextCursor, fetchPage]);

  const placeAsset = (item: AssetItem) => {
    const img = new window.Image();
    img.onload = () => {
      const aspect = img.naturalWidth / img.naturalHeight;
      const w = DEFAULT_PLACE_SIZE;
      const h = w / aspect;
      // Place at center of current viewport instead of hardcoded position
      const vp = state.viewport;
      const cw = containerWidth || window.innerWidth;
      const ch = containerHeight || window.innerHeight;
      const centerWorldX = (-vp.x + (cw / 2)) / vp.scale - w / 2;
      const centerWorldY = (-vp.y + (ch / 2)) / vp.scale - h / 2;
      dispatch({
        type: "ADD_NODE",
        node: {
          id: crypto.randomUUID(),
          src: item.url,
          x: centerWorldX,
          y: centerWorldY,
          width: w,
          height: h,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          zIndex: 0, // will be set by reducer
          generationId: item.generation.id,
          asset: item.asset,
          placedBy: currentUser ? { userId: currentUser.userId, email: currentUser.email } : undefined,
          prompt: item.generation.prompt || undefined,
        },
      });
    };
    img.src = item.url;
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 whitespace-nowrap rounded border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        title="Import from generations"
      >
        <TbPhoto size={16} />
        Add Image
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[360px] rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Recent Generations
            </span>
            <div className="flex items-center gap-1.5">
              <TbLayoutGrid size={12} className="text-zinc-400" />
              <input
                type="range"
                min={MIN_COLS}
                max={MAX_COLS}
                value={cols}
                onChange={(e) => setCols(Number(e.target.value))}
                className="h-1 w-16 cursor-pointer accent-zinc-500"
                title={`${cols} columns`}
              />
              <TbGrid4X4 size={12} className="text-zinc-400" />
              <button onClick={() => setOpen(false)} className="ml-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
                <TbX size={16} />
              </button>
            </div>
          </div>

          {items.length === 0 && !loading ? (
            <p className="py-4 text-center text-sm text-zinc-500">
              No images in history yet. Generate some first!
            </p>
          ) : (
            <div
              ref={gridRef}
              onScroll={handleScroll}
              className="grid max-h-[300px] gap-2 overflow-y-auto"
              style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
              {items.map((item) => (
                <button
                  key={item.asset.id}
                  onClick={() => placeAsset(item)}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-zinc-200 hover:border-zinc-400 dark:border-zinc-600"
                >
                  <img
                    src={item.url}
                    alt=""
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    loading="lazy"
                  />
                </button>
              ))}
              {loading && (
                <div className="flex justify-center py-3" style={{ gridColumn: `span ${cols}` }}>
                  <TbLoader2 size={20} className="animate-spin text-zinc-400" />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

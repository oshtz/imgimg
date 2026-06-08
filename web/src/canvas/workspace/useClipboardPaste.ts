import { useEffect } from "react";

type Viewport = { x: number; y: number; scale: number };

type Params = {
  viewport: Viewport;
  dimensions: { width: number; height: number };
  dispatch: (action: any) => void;
};

export function useClipboardPaste({ viewport, dimensions, dispatch }: Params) {
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;
          const url = URL.createObjectURL(file);
          const img = new window.Image();
          img.onload = () => {
            const vp = viewport;
            const scale = Math.min(400 / img.naturalWidth, 400 / img.naturalHeight, 1);
            const w = Math.round(img.naturalWidth * scale);
            const h = Math.round(img.naturalHeight * scale);
            const cx = (-vp.x + (dimensions.width || window.innerWidth) / 2) / vp.scale - w / 2;
            const cy = (-vp.y + (dimensions.height || window.innerHeight) / 2) / vp.scale - h / 2;
            dispatch({
              type: "ADD_NODE",
              node: {
                id: crypto.randomUUID(),
                src: url,
                x: cx, y: cy, width: w, height: h,
                naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
                zIndex: 0,
              },
            });
          };
          img.src = url;
          break; // only paste the first image
        }
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [viewport, dimensions, dispatch]);
}

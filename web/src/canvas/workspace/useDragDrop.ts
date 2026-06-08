import { useCallback } from "react";

type Viewport = { x: number; y: number; scale: number };

type Params = {
  viewport: Viewport;
  containerRef: React.RefObject<HTMLDivElement | null>;
  dispatch: (action: any) => void;
  setDragOver: (v: boolean) => void;
};

export function useDragDrop({ viewport, containerRef, dispatch, setDragOver }: Params) {
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  }, [setDragOver]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if leaving the container (not entering a child)
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOver(false);
  }, [setDragOver]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (!files.length) return;

    const vp = viewport;
    const containerRect = containerRef.current?.getBoundingClientRect();
    const dropScreenX = containerRect ? e.clientX - containerRect.left : e.clientX;
    const dropScreenY = containerRect ? e.clientY - containerRect.top : e.clientY;

    Array.from(files).forEach((file, index) => {
      if (!file.type.startsWith("image/")) return;
      const url = URL.createObjectURL(file);
      const img = new window.Image();
      img.onload = () => {
        const scale = Math.min(400 / img.naturalWidth, 400 / img.naturalHeight, 1);
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        // Convert drop position to world coordinates
        const worldX = (dropScreenX - vp.x) / vp.scale - w / 2 + index * 30;
        const worldY = (dropScreenY - vp.y) / vp.scale - h / 2 + index * 30;
        dispatch({
          type: "ADD_NODE",
          node: {
            id: crypto.randomUUID(),
            src: url,
            x: worldX, y: worldY, width: w, height: h,
            naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
            zIndex: 0,
          },
        });
      };
      img.src = url;
    });
  }, [viewport, containerRef, dispatch, setDragOver]);

  return { handleDragOver, handleDragLeave, handleDrop };
}

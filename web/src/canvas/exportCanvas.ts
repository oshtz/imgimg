import type Konva from "konva";
import type { CanvasNode } from "./types";

/**
 * Export a set of canvas nodes as a PNG image.
 * Temporarily hides non-essential layers (grid, transformer, guides), captures the
 * bounding box of the target nodes, then restores everything.
 */
export async function exportCanvasAsImage(
  stage: Konva.Stage,
  targetNodes: CanvasNode[],
  pixelRatio = 2,
): Promise<void> {
  if (targetNodes.length === 0) return;

  // Compute world bounding box of target nodes
  const minX = Math.min(...targetNodes.map((n) => n.x));
  const minY = Math.min(...targetNodes.map((n) => n.y));
  const maxX = Math.max(...targetNodes.map((n) => n.x + n.width));
  const maxY = Math.max(...targetNodes.map((n) => n.y + n.height));
  const padding = 20;

  const x = minX - padding;
  const y = minY - padding;
  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;

  // Hide layers we don't want in the export (grid dots, guides, marquee, transformer)
  const layers = stage.getLayers();
  const hiddenLayers: Konva.Layer[] = [];
  // The nodes layer is typically the one with the Transformer; we'll hide the transformer node
  const transformers: Konva.Node[] = [];

  for (const layer of layers) {
    // Grid dots layer and snap guides layer are non-listening
    if (!layer.listening()) {
      layer.visible(false);
      hiddenLayers.push(layer);
    } else {
      // Hide transformers within listening layers
      const trNodes = layer.find("Transformer");
      for (const tr of trNodes) {
        if (tr.visible()) {
          tr.visible(false);
          transformers.push(tr);
        }
      }
    }
  }

  stage.batchDraw();

  try {
    // Use the nodes layer (listening layer) for export
    const nodesLayer = layers.find((l) => l.listening());
    if (!nodesLayer) return;

    const dataUrl = nodesLayer.toDataURL({
      x,
      y,
      width,
      height,
      pixelRatio,
    });

    // Trigger download
    const link = document.createElement("a");
    link.download = `canvas-export-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  } finally {
    // Restore hidden layers and transformers
    for (const layer of hiddenLayers) {
      layer.visible(true);
    }
    for (const tr of transformers) {
      tr.visible(true);
    }
    stage.batchDraw();
  }
}

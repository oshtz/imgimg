/**
 * Canvas templates — predefined layouts of nodes that can be inserted at once.
 */

type TemplateNodeDef = {
  type: "frame" | "text" | "shape";
  /** Offset relative to template origin (top-left) */
  dx: number;
  dy: number;
  width: number;
  height: number;
  title?: string;
  text?: string;
  stickyColor?: "yellow" | "green" | "blue" | "pink" | "orange" | "purple";
  shapeKind?: "rect" | "circle" | "diamond" | "triangle";
  fillColor?: string;
  strokeColor?: string;
};

export type CanvasTemplate = {
  id: string;
  name: string;
  description: string;
  /** Total bounding width (for preview scaling) */
  previewWidth: number;
  /** Total bounding height (for preview scaling) */
  previewHeight: number;
  nodes: TemplateNodeDef[];
};

export const CANVAS_TEMPLATES: CanvasTemplate[] = [
  {
    id: "mood-board",
    name: "Mood Board",
    description: "A large frame with color-coded sticky notes for collecting inspiration.",
    previewWidth: 700,
    previewHeight: 500,
    nodes: [
      { type: "frame", dx: 0, dy: 0, width: 700, height: 500, title: "Mood Board" },
      { type: "text", dx: 20, dy: 50, width: 150, height: 150, text: "Colors", stickyColor: "yellow" },
      { type: "text", dx: 185, dy: 50, width: 150, height: 150, text: "Typography", stickyColor: "blue" },
      { type: "text", dx: 350, dy: 50, width: 150, height: 150, text: "Textures", stickyColor: "green" },
      { type: "text", dx: 515, dy: 50, width: 150, height: 150, text: "References", stickyColor: "pink" },
      { type: "text", dx: 20, dy: 220, width: 150, height: 150, text: "Shapes", stickyColor: "orange" },
      { type: "text", dx: 185, dy: 220, width: 150, height: 150, text: "Patterns", stickyColor: "purple" },
      { type: "text", dx: 350, dy: 220, width: 315, height: 150, text: "Notes & Ideas", stickyColor: "yellow" },
    ],
  },
  {
    id: "ab-comparison",
    name: "A/B Comparison",
    description: "Two side-by-side frames for comparing design options.",
    previewWidth: 700,
    previewHeight: 420,
    nodes: [
      { type: "frame", dx: 0, dy: 0, width: 340, height: 420, title: "Option A" },
      { type: "text", dx: 20, dy: 50, width: 300, height: 80, text: "Paste or generate image here", stickyColor: "blue" },
      { type: "text", dx: 20, dy: 150, width: 300, height: 100, text: "Pros / Cons", stickyColor: "green" },
      { type: "frame", dx: 360, dy: 0, width: 340, height: 420, title: "Option B" },
      { type: "text", dx: 380, dy: 50, width: 300, height: 80, text: "Paste or generate image here", stickyColor: "pink" },
      { type: "text", dx: 380, dy: 150, width: 300, height: 100, text: "Pros / Cons", stickyColor: "orange" },
    ],
  },
  {
    id: "storyboard",
    name: "Storyboard",
    description: "A sequence of frames for planning visual narratives or animations.",
    previewWidth: 1100,
    previewHeight: 340,
    nodes: [
      { type: "frame", dx: 0, dy: 0, width: 250, height: 340, title: "Scene 1" },
      { type: "text", dx: 15, dy: 220, width: 220, height: 100, text: "Description...", stickyColor: "yellow" },
      { type: "frame", dx: 270, dy: 0, width: 250, height: 340, title: "Scene 2" },
      { type: "text", dx: 285, dy: 220, width: 220, height: 100, text: "Description...", stickyColor: "yellow" },
      { type: "frame", dx: 540, dy: 0, width: 250, height: 340, title: "Scene 3" },
      { type: "text", dx: 555, dy: 220, width: 220, height: 100, text: "Description...", stickyColor: "yellow" },
      { type: "frame", dx: 810, dy: 0, width: 250, height: 340, title: "Scene 4" },
      { type: "text", dx: 825, dy: 220, width: 220, height: 100, text: "Description...", stickyColor: "yellow" },
    ],
  },
  {
    id: "mind-map",
    name: "Mind Map",
    description: "A central topic with branching ideas using shapes and sticky notes.",
    previewWidth: 700,
    previewHeight: 500,
    nodes: [
      { type: "shape", dx: 280, dy: 190, width: 140, height: 120, shapeKind: "circle", fillColor: "#a1a1aa", strokeColor: "#71717a" },
      { type: "text", dx: 300, dy: 210, width: 100, height: 80, text: "Central\nIdea", stickyColor: "yellow" },
      { type: "text", dx: 20, dy: 20, width: 160, height: 100, text: "Branch 1", stickyColor: "blue" },
      { type: "text", dx: 520, dy: 20, width: 160, height: 100, text: "Branch 2", stickyColor: "green" },
      { type: "text", dx: 20, dy: 380, width: 160, height: 100, text: "Branch 3", stickyColor: "pink" },
      { type: "text", dx: 520, dy: 380, width: 160, height: 100, text: "Branch 4", stickyColor: "orange" },
    ],
  },
];

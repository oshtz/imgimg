import { describe, it, expect } from "vitest";
import { CANVAS_TEMPLATES } from "../templates";

describe("CANVAS_TEMPLATES", () => {
  it("has 4 templates", () => {
    expect(CANVAS_TEMPLATES).toHaveLength(4);
  });

  it("each template has required fields", () => {
    for (const t of CANVAS_TEMPLATES) {
      expect(t).toHaveProperty("id");
      expect(t).toHaveProperty("name");
      expect(t).toHaveProperty("description");
      expect(t).toHaveProperty("previewWidth");
      expect(t).toHaveProperty("previewHeight");
      expect(t).toHaveProperty("nodes");
      expect(Array.isArray(t.nodes)).toBe(true);
    }
  });

  it("each template has a unique id", () => {
    const ids = CANVAS_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all node types are valid", () => {
    const validTypes = new Set(["frame", "text", "shape"]);
    for (const t of CANVAS_TEMPLATES) {
      for (const node of t.nodes) {
        expect(validTypes.has(node.type)).toBe(true);
      }
    }
  });

  it("mood-board has 8 nodes", () => {
    const mb = CANVAS_TEMPLATES.find((t) => t.id === "mood-board");
    expect(mb).toBeDefined();
    expect(mb!.nodes).toHaveLength(8);
  });

  it("storyboard has 8 nodes", () => {
    const sb = CANVAS_TEMPLATES.find((t) => t.id === "storyboard");
    expect(sb).toBeDefined();
    expect(sb!.nodes).toHaveLength(8);
  });

  it("previewWidth and previewHeight are positive", () => {
    for (const t of CANVAS_TEMPLATES) {
      expect(t.previewWidth).toBeGreaterThan(0);
      expect(t.previewHeight).toBeGreaterThan(0);
    }
  });
});

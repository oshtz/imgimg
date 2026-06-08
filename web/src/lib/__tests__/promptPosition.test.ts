import { describe, expect, it } from "vitest";
import {
  clampPromptSidebarWidth,
  getHistoryPaneClassName,
  getPromptFlowClassName,
  getPromptPaneClassName,
  isPromptSidebarPosition,
  parsePromptPosition,
} from "../promptPosition";

describe("promptPosition", () => {
  it("accepts all four prompt positions", () => {
    expect(parsePromptPosition("top")).toBe("top");
    expect(parsePromptPosition("bottom")).toBe("bottom");
    expect(parsePromptPosition("left")).toBe("left");
    expect(parsePromptPosition("right")).toBe("right");
  });

  it("falls back to bottom for unknown stored values", () => {
    expect(parsePromptPosition("")).toBe("bottom");
    expect(parsePromptPosition("sidebar")).toBe("bottom");
  });

  it("detects sidebar prompt positions", () => {
    expect(isPromptSidebarPosition("left")).toBe(true);
    expect(isPromptSidebarPosition("right")).toBe(true);
    expect(isPromptSidebarPosition("top")).toBe(false);
    expect(isPromptSidebarPosition("bottom")).toBe(false);
  });

  it("uses row layout and stretched panes for sidebar positions", () => {
    expect(getPromptFlowClassName("left", true)).toContain("lg:flex-row");
    expect(getPromptFlowClassName("right", true)).toContain("lg:flex-row-reverse");

    const paneClass = getPromptPaneClassName({
      position: "left",
      hasWorkflow: true,
      hasDashboardItems: false,
    });
    expect(paneClass).toContain("lg:self-stretch");
    expect(paneClass).toContain("lg:flex-col");
    expect(paneClass).toContain("lg:w-[var(--prompt-sidebar-width)]");
    expect(paneClass).toContain("relative");

    const historyClass = getHistoryPaneClassName("right");
    expect(historyClass).toContain("lg:min-w-0");
    expect(historyClass).not.toContain("max-w");
  });

  it("keeps vertical positions full width", () => {
    expect(getPromptFlowClassName("bottom", true)).toContain("flex-col-reverse");
    expect(getPromptPaneClassName({
      position: "top",
      hasWorkflow: true,
      hasDashboardItems: false,
    })).toBe("shrink-0");
    expect(getHistoryPaneClassName("bottom")).toBe("flex min-h-0 flex-1 flex-col");
  });

  it("clamps persisted sidebar widths to usable bounds", () => {
    expect(clampPromptSidebarWidth(280)).toBe(320);
    expect(clampPromptSidebarWidth("512")).toBe(512);
    expect(clampPromptSidebarWidth(900)).toBe(640);
    expect(clampPromptSidebarWidth("nope")).toBe(384);
  });
});

// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PromptSidebarResizeHandle } from "../PromptSidebarResizeHandle";

afterEach(() => {
  cleanup();
});

describe("PromptSidebarResizeHandle", () => {
  it("increases a left-anchored prompt width when dragged right", () => {
    const onWidthChange = vi.fn();
    render(React.createElement(PromptSidebarResizeHandle, {
      position: "left",
      width: 384,
      onWidthChange,
    }));

    fireEvent.mouseDown(screen.getByRole("separator", { name: /resize prompt panel/i }), { clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 160 });
    fireEvent.mouseUp(document);

    expect(onWidthChange).toHaveBeenLastCalledWith(444);
  });

  it("increases a right-anchored prompt width when dragged left", () => {
    const onWidthChange = vi.fn();
    render(React.createElement(PromptSidebarResizeHandle, {
      position: "right",
      width: 384,
      onWidthChange,
    }));

    fireEvent.mouseDown(screen.getByRole("separator", { name: /resize prompt panel/i }), { clientX: 200 });
    fireEvent.mouseMove(document, { clientX: 120 });
    fireEvent.mouseUp(document);

    expect(onWidthChange).toHaveBeenLastCalledWith(464);
  });
});

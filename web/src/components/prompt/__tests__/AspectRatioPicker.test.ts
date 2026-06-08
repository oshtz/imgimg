// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AspectRatioPicker } from "../AspectRatioPicker";

describe("AspectRatioPicker", () => {
  it("uses a valid upward calc class when opened in drop-up mode", () => {
    render(
      React.createElement(AspectRatioPicker, {
        value: "2:3",
        onChange: vi.fn(),
        dropUp: true,
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Aspect ratio" }));

    expect(screen.getByRole("dialog", { name: "Aspect ratio" }).className).toContain("bottom-[calc(100%_+_8px)]");
  });
});

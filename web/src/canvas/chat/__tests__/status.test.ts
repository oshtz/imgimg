import { describe, expect, it } from "vitest";
import { stoppedAssistantContent } from "../status";

describe("stoppedAssistantContent", () => {
  it("marks an empty aborted response as stopped", () => {
    expect(stoppedAssistantContent("")).toBe("Stopped.");
  });

  it("preserves partial content and appends a stopped marker", () => {
    expect(stoppedAssistantContent("Partial answer")).toBe("Partial answer\n\nStopped.");
  });
});

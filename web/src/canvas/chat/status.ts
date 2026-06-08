export function stoppedAssistantContent(content: string) {
  const trimmed = content.trim();
  return trimmed ? `${trimmed}\n\nStopped.` : "Stopped.";
}

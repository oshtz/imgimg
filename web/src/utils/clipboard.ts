import { toast } from "sonner";

/**
 * Copy text to the clipboard with user feedback via sonner toast.
 * Includes a textarea fallback for environments without navigator.clipboard.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
      return true;
    }
    // Fallback: hidden textarea + execCommand
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "true");
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    toast.success("Copied to clipboard");
    return true;
  } catch {
    toast.error("Failed to copy");
    return false;
  }
}

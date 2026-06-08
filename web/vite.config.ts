import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Sonner v2.0.7 injects CSS at module-load time via __insertCSS().
 * The CSS string starts with '[data-sonner-toaster]' — the leading '['
 * causes Firefox to log a harmless but noisy warning:
 *   "Expected declaration but found '['. Skipped to next declaration. callback:1:1"
 *
 * This plugin prepends a CSS comment so the first token is no longer '['.
 */
function fixSonnerCssWarning(): Plugin {
  return {
    name: "fix-sonner-css-warning",
    transform(code, id) {
      if (id.includes("sonner")) {
        return code.replace(
          '__insertCSS("[',
          '__insertCSS("/* sonner */\\n[',
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [fixSonnerCssWarning(), react()],
  server: {
    port: 3000
  }
});


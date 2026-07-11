import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/__tests__/**",
        "src/**/*.d.ts",
        "src/**/*.tsx",
        "src/vite-env.d.ts",
        "src/**/index.ts",
        "src/**/types.ts",
        "src/api.ts",
        "src/components/preferences.ts",
      ],
      reporter: ["text", "json-summary"],
      thresholds: {
        statements: 79,
        branches: 70,
        functions: 74,
        lines: 81,
      },
    }
  }
});

import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["@stereo/core"] })],
    build: { rollupOptions: { input: "src/main/index.ts", external: ["@anthropic-ai/claude-agent-sdk"] } },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ["@stereo/core"] })],
    build: { rollupOptions: { input: "src/preload/index.ts" } },
  },
  renderer: {
    plugins: [react()],
    root: "src/renderer",
    server: { port: 5175 },
    build: { rollupOptions: { input: "src/renderer/index.html" } },
  },
});

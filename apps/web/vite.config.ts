import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  base: "./",
  plugins: [react()],
  publicDir: "../../branding/stereo/assets",
  resolve: {
    alias: {
      react: fileURLToPath(new URL("./node_modules/react", import.meta.url)),
      "react-dom": fileURLToPath(new URL("./node_modules/react-dom", import.meta.url)),
    },
  },
  server: { port: 4173 },
  preview: { port: 4173 },
  build: { outDir: "dist" },
});

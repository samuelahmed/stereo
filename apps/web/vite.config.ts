import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "stereo-installers",
      apply: "build",
      closeBundle() {
        for (const name of ["install", "install.ps1"]) {
          copyFileSync(
            fileURLToPath(new URL(`./public/${name}`, import.meta.url)),
            fileURLToPath(new URL(`./dist/${name}`, import.meta.url)),
          );
        }
      },
    },
  ],
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

import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  build: {
    target: "es2022",
    minify: "esbuild",
    cssMinify: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          monaco: ["@monaco-editor/react"],
          markdown: [
            "streamdown",
            "@streamdown/code",
            "@streamdown/mermaid",
            "@streamdown/math",
            "@streamdown/cjk",
          ],
        },
      },
    },
  },
})

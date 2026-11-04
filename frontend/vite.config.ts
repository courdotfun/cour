import { defineConfig } from "vite";

// The approved design lives in index.html as one large file with inline
// classic <script> blocks (visual / interaction layer: mascot, themes,
// animations, popups). Vite ships those as-is. The real app logic is bundled
// from src/main.ts, which is referenced by a <script type="module"> tag.
export default defineConfig({
  root: ".",
  build: {
    target: "es2020",
    // The design file is a single ~1.1MB HTML. Raise the inline limit warning
    // threshold so the (expected) large chunk does not fail CI noise checks.
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks: {
          viem: ["viem"],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});

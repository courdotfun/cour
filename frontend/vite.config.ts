import { defineConfig, type Plugin } from "vite";
import { minify } from "html-minifier-terser";
import { createHash } from "node:crypto";

// Extract inline base64 data: URIs (SVG/PNG/WAV, ~440KB) from the built
// index.html into separate, content-hashed, cacheable assets so the main HTML
// document the browser must parse before first paint shrinks by ~40%. The exact
// data-URI substring is replaced by its asset path, so CSS url()/HTML src/JS
// string syntax all stay valid — no visual change.
function externalizeDataUris(): Plugin {
  const EXT: Record<string, string> = {
    "image/svg+xml": "svg",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "audio/wav": "wav",
    "audio/mpeg": "mp3",
  };
  return {
    name: "cour-externalize-data-uris",
    apply: "build",
    enforce: "post",
    generateBundle(_opts, bundle) {
      const html = bundle["index.html"];
      if (!html || html.type !== "asset" || typeof html.source !== "string") return;
      let src = html.source;
      const seen = new Map<string, string>();
      const re = /data:(image\/svg\+xml|image\/png|image\/jpeg|image\/webp|audio\/wav|audio\/mpeg);base64,([A-Za-z0-9+/=]+)/g;
      let extracted = 0;
      let savedBytes = 0;
      src = src.replace(re, (full, mime: string, payload: string) => {
        const ext = EXT[mime] || "bin";
        const key = mime + ":" + payload;
        let path = seen.get(key);
        if (!path) {
          const buf = Buffer.from(payload, "base64");
          const hash = createHash("sha256").update(buf).digest("hex").slice(0, 10);
          const fileName = `assets/inl-${hash}.${ext}`;
          this.emitFile({ type: "asset", fileName, source: buf });
          path = "/" + fileName;
          seen.set(key, path);
        }
        extracted++;
        savedBytes += full.length;
        return path;
      });
      html.source = src;
      this.warn(`externalized ${extracted} data-URIs (${seen.size} unique, ~${Math.round(savedBytes / 1024)}KB out of HTML)`);
    },
  };
}

// Build-time minification of the approved design's INLINE <script>/<style>.
// Vite ships index.html's inline blocks verbatim; this plugin minifies the
// ~540KB inline JS + ~320KB inline CSS without changing behaviour or visuals
// (top-level/global names are preserved so inline on* handlers keep working).
function minifyIndexHtml(): Plugin {
  return {
    name: "cour-minify-index-html",
    apply: "build",
    enforce: "post",
    async transformIndexHtml(html) {
      return minify(html, {
        collapseWhitespace: true,
        conservativeCollapse: true, // keep a single space so inline layout is unchanged
        removeComments: true,
        minifyCSS: true,
        minifyJS: {
          compress: { defaults: true },
          // Do NOT mangle/rename top-level names: inline on* handlers and
          // window.* seams reference globals by name.
          mangle: { toplevel: false },
          format: { comments: false },
        },
        // Never touch attribute values that may hold data: URIs / JSON.
        decodeEntities: false,
        keepClosingSlash: true,
      });
    },
  };
}

// The approved design lives in index.html as one large file with inline classic
// <script> blocks (visual/interaction layer). The real app logic is bundled from
// src/main.ts (a <script type="module">).
export default defineConfig({
  root: ".",
  plugins: [minifyIndexHtml(), externalizeDataUris()],
  build: {
    target: "es2020",
    cssMinify: true,
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

// Reproducible extraction of the v8 design's CSS + assets from design/cour-v8.html.
// - Concatenates all <style> blocks (in document order) into app/styles/v8.css,
//   preserving the exact cascade (the port relies on identical CSS).
// - Externalises data: URIs found inside the CSS to app/public/assets/<hash>.<ext>
//   and rewrites url(data:...) → url(/assets/<hash>.<ext>) (smaller CSS, better
//   caching/Lighthouse). HTML/JS-embedded data: URIs are handled per component.
// Run: node scripts/extract-v8.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const repo = join(root, "..");
const srcHtml = join(repo, "design", "cour-v8.html");
// Served verbatim via <link> from /public (bypasses Next's CSS minifier, which
// chokes on the design's inline utf8-SVG url()s — keeps the CSS byte-faithful).
const outCss = join(root, "public", "v8.css");
const assetsDir = join(root, "public", "assets");

const html = readFileSync(srcHtml, "utf8");

// 1. concatenate <style> blocks verbatim
const styleBlocks = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
let css = styleBlocks.join("\n\n/* ---- next v8 <style> block ---- */\n\n");

// 2. externalise data: URIs inside the CSS
const EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/wav": "wav",
};
if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true });
const manifest = [];
css = css.replace(
  /url\(\s*(['"]?)data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+?)\1\s*\)/gi,
  (_full, _q, mime, b64) => {
    const ext = EXT[mime.toLowerCase()] ?? "bin";
    const buf = Buffer.from(b64.replace(/\s+/g, ""), "base64");
    const hash = createHash("sha256").update(buf).digest("hex").slice(0, 16);
    const name = `${hash}.${ext}`;
    const file = join(assetsDir, name);
    if (!existsSync(file)) writeFileSync(file, buf);
    manifest.push({ name, mime, bytes: buf.length });
    return `url(/assets/${name})`;
  },
);

mkdirSync(dirname(outCss), { recursive: true });
writeFileSync(outCss, css);
writeFileSync(
  join(assetsDir, "manifest.json"),
  JSON.stringify({ generatedFrom: "design/cour-v8.html", count: manifest.length, assets: manifest }, null, 2),
);

console.error(
  `v8.css: ${css.length} bytes from ${styleBlocks.length} <style> blocks; ` +
    `externalised ${manifest.length} CSS asset(s) → public/assets/`,
);

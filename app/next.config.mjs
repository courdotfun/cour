/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // v8 ships large base64 assets we extract to /public; allow modern formats.
  images: {
    formats: ["image/avif", "image/webp"],
  },
  // The chain/data libs are plain TS; nothing to transpile from node_modules.
  async redirects() {
    // Legacy hash routes (#/token/..) are handled client-side (lib/hash-redirect),
    // but provide path-level redirects for any old non-hash aliases here if needed.
    return [];
  },
};

export default nextConfig;

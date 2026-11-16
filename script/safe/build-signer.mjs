// Inline the vendored ethers UMD bundle into signer.src.html -> signer.html,
// producing ONE self-contained static file (no network, no backend).
// Run:  node script/safe/build-signer.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "signer.src.html"), "utf8");
const ethers = readFileSync(join(here, "vendor", "ethers-6.13.4.umd.min.js"), "utf8");

const marker = "//__ETHERS_BUNDLE__";
if (!src.includes(marker)) { console.error("marker not found in signer.src.html"); process.exit(1); }
// Guard: the bundle must not contain </script> (it doesn't, but fail loudly if ever).
if (ethers.includes("</script")) { console.error("ethers bundle contains </script> — cannot inline safely"); process.exit(1); }

const out = src.replace(marker, ethers);
writeFileSync(join(here, "signer.html"), out);
console.error(`wrote signer.html (${out.length} bytes, ethers ${ethers.length} bytes inlined)`);

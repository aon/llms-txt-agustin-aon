import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

// the deck reuses the diagrams that live in docs/images
export default {
  server: { fs: { allow: [repoRoot] } },
};

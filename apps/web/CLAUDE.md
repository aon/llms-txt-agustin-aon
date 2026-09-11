# apps/web

Next.js UI for the llms.txt generator. A user submits a website URL, the app
enqueues a crawl, shows its progress, and renders the generated `llms.txt` with
copy, download and a stable raw URL. A site page shows the current file, crawl
history with what changed, and a toggle for scheduled re-crawls.

The web app never crawls. It creates DynamoDB rows, sends the SQS message, polls
the Crawl row for status, and reads files from S3. Shared types come from
`packages/core`.

## Stack

- Next.js app router, TypeScript, Tailwind 4.
- shadcn/ui for components.
- The `impeccable` skill for frontend design work.
- Biome for lint and format, Vitest for unit tests.

## Scripts

`dev`, `build`, `typecheck`, `test`. Run `pnpm check` from the repo root before
committing.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

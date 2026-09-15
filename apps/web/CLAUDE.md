# apps/web

Next.js UI for the llms.txt generator. A user submits a website URL, the app
enqueues a crawl, shows its progress, and renders the generated `llms.txt` with
copy, download and a stable raw URL. A site page shows the current file, crawl
history with what changed, and a toggle for weekly re-crawls.

The web app never crawls. Server actions create the Site and Crawl rows and
send the SQS message; server components poll the Crawl and Page rows and read
files from S3; a route handler serves the raw file. Everything AWS comes from
`@llms-txt/core` and `@llms-txt/core/aws`, built once in `src/lib/backend.ts`.

## Layout

- `src/app`: routes. `/` submits, `/sites/[host]` is the site page,
  `/sites/[host]/crawls/[crawlId]` is the live crawl page,
  `/sites/[host]/llms.txt` is the raw file. `actions.ts` holds the server actions.
- `src/lib`: `backend.ts` (clients), `site-data.ts` (page loaders), pure
  helpers with tests next to them.
- `src/components/ledger`: the "Ledger" design. `shell.tsx` is the top of every
  page; client components are the ones that poll, toggle, copy or animate.

## Stack

- Next.js app router, TypeScript, Tailwind 4, shadcn/ui, Biome, Vitest.
- The `impeccable` skill for frontend design work.

## Running

`pnpm env:local` writes `.env.local` from the deployed stack's CloudFormation
outputs (`STACK_NAME` overrides, default `LlmsTxt`). Then `pnpm dev`, which
builds `@llms-txt/core` first. AWS credentials come from the usual chain.

Scripts: `dev`, `build`, `typecheck`, `test`, `env:local`. Run `pnpm check`
from the repo root before committing.

## Deploying

The CDK stack in `infra/` hosts this app on Amplify (SSR compute) from the
`main` branch of the GitHub repo, so a push deploys. One-time setup before the
first `cdk deploy`: install the Amplify GitHub App for the stack's region
(`https://github.com/apps/aws-amplify-us-east-2/installations/new`) on the
repo, create a classic PAT with the `admin:repo_hook` scope, and store it as
the `llms-txt/github-token` secret in Secrets Manager. The stack's `WebUrl`
output is the Amplify URL. The site also answers on `llms-txt.agustinaon.com`
once two records exist in Cloudflare, both DNS-only: the certificate
validation CNAME in the `WebCertificateRecord` output and the subdomain CNAME
in `WebDomainCname`. The build runs from the repo root with pnpm's hoisted
linker, and the table, bucket and queue names reach the server through
`.env.production`, written during the build.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

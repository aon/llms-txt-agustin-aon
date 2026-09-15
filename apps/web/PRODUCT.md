# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Site owners and developers who want an `llms.txt` for a site they control. They
arrive with a URL, want a correct file quickly, and want it to stay correct
without coming back to regenerate it by hand. Typical people: a developer adding
AI discoverability to docs or a product site, a marketer or founder checking
what an AI tool would see. No accounts: anyone with the link can submit a URL
and open any site page.

A secondary audience is Profound's technical staff evaluating this take-home.
They judge functionality, code quality, product thinking and documentation, and
will ask the author to explain architecture and trade-offs. Design for the site
owner; let the evaluators see craft through that.

## Product Purpose

Turn any website URL into a spec-conformant `llms.txt` (per llmstxt.org) and
keep that file current as the site changes. Success is a file that accurately
reflects the site's structure and content, works across a large variety of
sites, and is fetchable by tools at a stable URL that keeps updating without
user effort.

## Positioning

It stays current. A one-shot generator hands over a file that rots. This one
monitors the site on a schedule, re-crawls when due, shows what changed since
the last crawl, and republishes the file at the same stable URL. The visible
"what changed" history and the live crawl view are the product, not extras.

## Operating Context

- The web app never crawls. It normalizes the URL to an origin, creates Site
  and Crawl rows in DynamoDB, enqueues an SQS message, polls the Crawl row for
  status, and reads generated files from S3.
- Crawls run in Lambda workers fed by SQS. A worker may re-enqueue itself for
  long sites; a dead-letter handler marks the crawl `failed`. A crawl can take
  from seconds to several minutes.
- Progress is shown by polling every few seconds. No SSE or WebSockets.
- Monitoring is an EventBridge Scheduler sweep that re-enqueues due sites.
  Users toggle the schedule per site.
- The raw file is served at a stable URL so tools can fetch it directly.
- Crawl history and diffs exist because S3 bucket versioning and per-crawl
  snapshots keep every prior version.
- The user's flow: submit URL, watch the crawl, get the file, later revisit the
  site page to see history, changes and the monitor toggle.

## Capabilities and Constraints

Confirmed:

- Surfaces: home (submit URL), crawl page (live progress, then result with
  copy and download), site page (current file, crawl history with diff
  summaries, monitor toggle), raw file endpoint.
- Crawl states: `queued`, `running`, `done`, `failed`, with reason `user` or
  `scheduled`, a phase string, invocation count and page counts (queued,
  fetched, failed, changed).
- Page states: `queued`, `fetched`, `skipped`, `failed`; pages carry title,
  description, canonical URL, section and rank.
- Failure states must be explicit, including thin JavaScript-rendered sites
  that yield little extractable content.
- Public and login-free. No per-user data, no auth, no rate-limit UI decided.
- Stack: Next.js app router, TypeScript, Tailwind 4, shadcn/ui (base-nova
  style, Base UI primitives), lucide icons, Geist and Geist Mono fonts already
  loaded. Biome for lint and format, Vitest for tests.
- Shared types and the AWS adapters come from `packages/core`.
- Local development runs against the deployed stack: `pnpm env:local` writes
  the table, bucket and queue names into `.env.local`.
- Monitoring is one fixed interval, weekly, toggled per site.

Undecided:

- Hosting construct in CDK: Amplify Hosting versus OpenNext behind CloudFront.
- Site config exposure in the UI (page cap, max depth, schedule interval).
- Whether the app ever needs a listing of all known sites.

Terminology: "site" is an origin (host). "crawl" is one run against a site.
"monitor" is the scheduled re-crawl. "llms.txt" is always written lowercase
with the extension.

## Brand Commitments

Working name only: "llms.txt generator". No logo, no established voice. The
existing scaffold copy is placeholder and not binding. The challenge brief in
`CHALLENGE.md` must not be published or quoted in the UI.

## Evidence on Hand

- `CHALLENGE.md` at the repo root: the assignment and evaluation criteria.
  Private; do not surface in the product.
- Architecture proposal with diagram, pipeline stages and data model:
  https://claude.ai/code/artifact/628e0f6b-002a-48c7-8c38-0c956f8bd890
- The llms.txt spec at https://llmstxt.org and public examples at
  https://llmstxt.site (examples may not conform).
- No customers, testimonials, benchmarks, or real generated files yet. The
  crawler and generator are being built in a parallel session; sample output
  should come from them, not be invented.

## Product Principles

1. Freshness is the feature. Every surface should make it obvious when the file
   was last generated, whether monitoring is on, and what changed.
2. Show the work. The crawl is slow and opaque by nature; live phase, page
   counts and per-page outcomes turn waiting into trust.
3. Honest failure. A thin, blocked or JavaScript-only site gets a clear
   explanation and a next step, never a silently empty file.
4. The file is the deliverable. Copy, download and the stable raw URL are
   first-class on every page that has a file.
5. Ship narrow and finished. One flow done well beats a broad but shallow one;
   evaluators will ask the author to explain every part.

## Accessibility & Inclusion

No product-specific requirement established. Standard web baseline applies:
keyboard-operable forms and toggles, live-region announcements for crawl
progress, and readable code output in both color schemes.

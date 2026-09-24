---
section: Code
---

# Monorepo layout

<pre class="tree">llms-txt-agustin-aon
├── apps
│   ├── web          Next.js app
│   └── worker       Lambda handlers: crawl-job, monitor, dead-letter
├── packages
│   ├── core         entities, key builders, store interfaces, memory + AWS
│   ├── crawler      robots, sitemap, frontier, fetch, extract, classify, snapshot
│   └── llms-txt     select, enrich (OpenRouter), render, parse
└── infra            CDK stack and its test</pre>

- `core` defines `Store`, `JobQueue` and `FileStore`, each with a memory and an AWS class
- The apps pick the implementation, dev and tests run with no cloud
- `infra` imports keys, timings and env names from the packages: a rename fails to compile
cual r
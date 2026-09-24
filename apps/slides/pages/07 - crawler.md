---
section: Crawler
class: tight
clicks: 1
---

# Architecture

<Diagram name="main-architecture" :focus="$clicks >= 1 ? 'crawler' : undefined" alt="Next.js app enqueues to the crawl queue; the crawl worker reads DynamoDB and S3 and calls OpenRouter; a monitor scheduler and worker re-enqueue due sites; a dead-letter worker marks failures" />

---
section: Crawler
class: tight
clicks: 3
---

# Crawl end to end

<Diagram name="one-crawl" :crop="['crawl-start', 'crawl-middle', 'crawl-finish'][$clicks - 1]" alt="A crawl from the submitted URL through lease, fetch budget, classification, snapshot, generation and publication" />

---
section: Crawler
---

# Crawler

We implement sensible settings to not overload our servers and third-party ones too.


<div class="mt-6">

</div>

**Politeness**

- A guest on someone else's server: user agent, robots.txt, crawl-delay
- 1 request per second per host, 4 in flight
- 429 or 503 pauses the whole host, four pauses end the crawl


<div class="grid grid-cols-2 gap-12 mt-4">
<div>

**Limits**

- 2 MB and 10 s per page
- Depth 6, up to 300 pages

</div>
<div>

**Time budget**

- 10 min budget per invocation
- Continues in follow-up runs

</div>
</div>

---
section: Crawler
class: tight
---

# Crawler pipeline

<Diagram name="crawler-pipeline" alt="Robots and sitemap seeding, the frontier, fetch and extract per page, then classification, ranking and the snapshot" />

---
section: Crawler
---

# Frontier

The queue of pages still to fetch.

<div class="grid grid-cols-2 gap-12 mt-10">
<div>

**Why a plain FIFO**

- Importance is decided at the end, with the whole link graph
- Shallow pages come first

</div>
<div>

**Backed by page rows**

- Every URL is written as a `queued` row before it enters the queue
- The next Lambda rebuilds the queue from those rows

</div>
</div>

## Guards

- Seeds:  homepage and sitemap
- One locale, the one the homepage lands on

---
section: Crawler
---

# Normalization

One URL, one page row.

<div class="my-10 font-mono text-[20px] text-center">

`www.example.com/blog/hello/?utm_source=x&b=2&a=1#top`

`→ /blog/hello?a=1&b=2`

</div>

- Drop the fragment and tracking params: `utm_*`, `gclid`, `ref`…
- Sort the query, trim the trailing slash
- Skip files: pdf, images, css, js, feeds

---
section: Crawler
---

# Extraction + storage

Per page, up to 4 in flight.

<div class="grid grid-cols-3 gap-10 my-10">
<div>

**Fetch**

- HTML only, 2 MB, 10 s
- 5xx and network errors retried twice
- Offsite redirects skipped

</div>
<div>

**Extract**

- Cheerio, no JavaScript
- Title, description, lang, main text
- Links

</div>
<div>

**Store**

- Raw HTML, gzipped, to S3
- Page row to `fetched`

</div>
</div>

---
section: Crawler
---

# Classification

- **Section**: first path segment, `/docs/install` goes to Docs
  - Homepage and nav pages go to Overview, always listed first
- **Eligible**: fetched, indexable, allowed by robots, one language
- **Rank** orders pages inside a section, lower is better


<div class="mx-auto w-108 mt-10">

| Signal              | Rank |
| ------------------- | ---- |
| Each level of depth | +10  |
| Each inbound link   | −1   |
| Linked from the nav | −5   |
| In the sitemap      | −2   |

</div>

---
section: Crawler
---

# Generator

- Link selection is deterministic
- Sections in rank weight order, Overview first
- Link budget shared by section weight
- An LLM via OpenRouter writes the summary

<div class="mt-8 w-[46%] mx-auto">

| Cap               | Limit |
| ----------------- | ----- |
| Sections          | 8     |
| Links per section | 15    |
| Main links        | 60    |
| Optional links    | 100   |

</div>

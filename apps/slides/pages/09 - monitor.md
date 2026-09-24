---
section: Monitor
class: tight
clicks: 1
---

# Architecture

<Diagram name="main-architecture" :focus="$clicks >= 1 ? 'monitor' : undefined" alt="Next.js app enqueues to the crawl queue; the crawl worker reads DynamoDB and S3 and calls OpenRouter; a monitor scheduler and worker re-enqueue due sites; a dead-letter worker marks failures" />

---
section: Monitor
focus: monitor
---

# Monitor scheduler + worker

- A site changes, the file has to follow without anyone resubmitting it
- A weekly re-crawl is usually enough for most sites
- EventBridge runs the sweep every 24 h
- Jobs are pushed to the Crawl jobs queue

<div class="mt-8">

**Constraints**

- 100 sites per sweep

</div>

---
section: Architecture
class: tight
clicks: 1
---

# Architecture

<Diagram name="main-architecture" :focus="$clicks >= 1 ? 'crawl' : undefined" alt="Next.js app enqueues to the crawl queue; the crawl worker reads DynamoDB and S3 and calls OpenRouter; a monitor scheduler and worker re-enqueue due sites; a dead-letter worker marks failures" />

---
section: Architecture
focus: crawl
---

# Crawl jobs + worker

Hold the crawl jobs in SQS and run them using Lambda workers.

<div class="grid grid-cols-2 gap-12 my-10">
<div>

**Why SQS**

- Need for background processing 
- Retries and dead-letter included

</div>
<div>

**Why Lambda**

- Burst support, scales to zero
- No need to think about servers

</div>
</div>

## Constraints

- 15-minute cap, we need to track progress & requeuing
- SQS can redeliver, so every step has to be safe to run twice

---
section: Storage
class: tight
clicks: 1
---

# Architecture

<Diagram name="main-architecture" :focus="$clicks >= 1 ? 'storage' : undefined" alt="Next.js app enqueues to the crawl queue; the crawl worker reads DynamoDB and S3 and calls OpenRouter; a monitor scheduler and worker re-enqueue due sites; a dead-letter worker marks failures" />

---
section: Storage
focus: storage
---

# Storage

We use DynamoDB and S3 for tracking crawling and serving the `llms.txt` file.

<div class="grid grid-cols-2 gap-12 my-10">
<div>

**Why DynamoDB**

- Same reason as Lambda: no instance to think of
- Five access patterns, all known upfront: a key design covers them
- Postgres could have been used too

</div>
<div>

**Why S3**

- Needed to store HTMLs as they might not fit in the DB
- Easy bucket for storing HTMLs, snapshots and txts
- `llms.txt` could be served straight from S3

</div>
</div>

## Constraints

- Rows cap at 400 KB
- Every new query is a new index, or a scan


---
section: Dead letter
class: tight
clicks: 1
---

# Architecture

<Diagram name="main-architecture" :focus="$clicks >= 1 ? 'dead-letter' : undefined" alt="Next.js app enqueues to the crawl queue; the crawl worker reads DynamoDB and S3 and calls OpenRouter; a monitor scheduler and worker re-enqueue due sites; a dead-letter worker marks failures" />

---
section: Dead letter
focus: dead-letter
---

# Dead-letter Queue + Handler

- Catches what a retry might fix: a bug, a DynamoDB or S3 error, a Lambda timeout
- A job that fails 3 times moves to the dead-letter queue


<div class="mt-8">

**Constraints**

- 3 attempts with a 20 minute visibility timeout: a bad job holds the site for an hour
- Dead letters live 14 days

</div>

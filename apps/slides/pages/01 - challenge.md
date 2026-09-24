---
section: Challenge
---

# Challenge

- Develop a tool that automatically generates an `llms.txt` file.
- Implement a mechanism to keep the `llms.txt` file updated as the website evolves.

<div class="blocks grid grid-cols-3 gap-x-14 mt-auto">

<div>

## Suggested effort

4 to 8 hours

</div>

<div>

## Time spent

3 days

</div>

<div>

## Deliverables

A live app, the repo, a README, screenshots.

</div>

</div>

---
section: Challenge
---

# llms.txt

A Markdown file at the root of a site, written for language models instead of browsers: **what is this site**, and **where should I look**.

<pre class="specimen mx-auto my-auto"># <b>Acme</b>

> <b>Acme builds small tools that do one job and stay out of the way.</b>

Acme is two people shipping a CLI and a hosted API.

## Docs

- [<b>Getting Started</b>](https://acme.dev/docs/getting-started): Install Acme and read the file it writes.
- [<b>CLI Reference</b>](https://acme.dev/docs/cli): Every command, with its flags and defaults.

## Optional

- [Privacy Policy](https://acme.dev/privacy)</pre>

---
section: Challenge
class: tight
---

# High-level architecture

<Diagram name="problem" class="w-[80%] m-auto" alt="A URL is submitted, crawled, turned into an llms.txt file, and a monitor re-crawls the site when something changed" />

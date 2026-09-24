---
section: Changes
---

# What I would change

<div class="grid grid-cols-[320px_1fr] gap-x-12 mt-10">
<div class="ledger-rule py-4 text-[24px] font-500 tracking-tight">No JavaScript rendering</div>
<div class="ledger-rule py-4 grid grid-cols-[52px_1fr] gap-y-1 text-[18px]">
  <span class="ledger-label pt-[7px]">Why</span><span>Static HTML is enough for most docs and blogs</span>
  <span class="ledger-label pt-[7px]">Next</span><span>Render only when every page is thin</span>
</div>
<div class="ledger-rule py-4 text-[24px] font-500 tracking-tight">No auth, no rate limit</div>
<div class="ledger-rule py-4 grid grid-cols-[52px_1fr] gap-y-1 text-[18px]">
  <span class="ledger-label pt-[7px]">Why</span><span>For a demo the 1 hour cooldown per site is enough</span>
  <span class="ledger-label pt-[7px]">Next</span><span>A quota per caller</span>
</div>
<div class="ledger-rule py-4 text-[24px] font-500 tracking-tight">Redelivery runs twice</div>
<div class="ledger-rule py-4 grid grid-cols-[52px_1fr] gap-y-1 text-[18px]">
  <span class="ledger-label pt-[7px]">Why</span><span>The lease belongs to the crawl, so the second copy takes it too</span>
  <span class="ledger-label pt-[7px]">Next</span><span>Tie the lease to one delivery</span>
</div>
</div>

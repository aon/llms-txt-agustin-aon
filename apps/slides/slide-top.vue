<script setup lang="ts">
import { useSlideContext } from "@slidev/client";

const { $slidev, $frontmatter, $page } = useSlideContext();
</script>

<template>
  <header
    class="absolute inset-x-0 top-0 z-10 h-12 border-line border-b px-14"
    aria-hidden="true"
  >
    <div class="ledger-label flex h-full items-center justify-between gap-6">
      <nav class="flex min-w-0 items-center gap-2">
        <span class="shrink-0 text-ink">llms.txt</span>
        <template v-if="$frontmatter.section">
          <span class="text-ghost">/</span>
          <span class="truncate">{{ $frontmatter.section }}</span>
        </template>
      </nav>
      <span v-if="$page > 1" class="shrink-0 text-ghost">
        {{ String($page).padStart(2, "0") }}<span class="text-line"> / </span
        >{{ String($slidev.nav.total).padStart(2, "0") }}
      </span>
    </div>
  </header>
  <div v-if="$frontmatter.focus" class="thumb" aria-hidden="true">
    <Diagram name="main-architecture" :focus="$frontmatter.focus" alt="" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

const REST_MS = 3200;
const ERASE_MS = 60;
const KEY_MS = 110;

const props = defineProps<{ words: string[] }>();

const text = ref(props.words[0] ?? "");
const slot = Math.max(...props.words.map((w) => w.length));
let timer: ReturnType<typeof setTimeout> | undefined;
let index = 0;

onMounted(() => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const at = (ms: number, next: () => void) => {
    timer = setTimeout(next, ms);
  };
  const rest = () =>
    at(REST_MS, () => {
      index = (index + 1) % props.words.length;
      erase();
    });
  const erase = () =>
    at(ERASE_MS, () => {
      if (text.value.length === 0) return type();
      text.value = text.value.slice(0, -1);
      erase();
    });
  const type = () =>
    at(KEY_MS + Math.random() * 60, () => {
      const target = props.words[index] ?? "";
      if (text.value.length >= target.length) return rest();
      text.value = target.slice(0, text.value.length + 1);
      type();
    });
  rest();
});

onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <span
    class="inline-block whitespace-nowrap text-left align-baseline font-mono font-medium"
    :style="{ width: `${slot}ch` }"
  >
    <span class="inline-block rounded-[0.08em] bg-line px-[0.12em]">{{
      text
    }}</span>
  </span>
</template>

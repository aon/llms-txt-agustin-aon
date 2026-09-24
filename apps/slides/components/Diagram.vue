<script setup lang="ts">
import { computed } from "vue";
import {
  type DiagramName,
  diagrams,
  type RegionName,
  regions,
} from "./diagrams";

const props = defineProps<{
  name: DiagramName;
  alt: string;
  focus?: RegionName | undefined;
  crop?: RegionName | undefined;
}>();

const diagram = computed(() => diagrams[props.name]);
const pad = 40;
const region = computed(() => {
  const found = props.focus ? regions[props.focus] : undefined;
  if (found?.diagram !== props.name) return undefined;
  return {
    x: found.x - pad,
    y: found.y - pad,
    w: found.w + 2 * pad,
    h: found.h + 2 * pad,
  };
});
const viewBox = computed(() => {
  const found = props.crop ? regions[props.crop] : undefined;
  return found?.diagram === props.name
    ? `${found.x} ${found.y} ${found.w} ${found.h}`
    : `0 0 ${diagram.value.width} ${diagram.value.height}`;
});
const maskId = `diagram-${Math.random().toString(36).slice(2, 8)}`;
</script>

<template>
  <figure class="diagram">
    <svg
      :viewBox="viewBox"
      :overflow="crop ? 'hidden' : 'visible'"
      role="img"
      :aria-label="alt"
    >
      <defs>
        <mask :id="maskId">
          <rect width="100%" height="100%" fill="white" />
          <rect
            v-if="region"
            class="hole"
            :x="region.x"
            :y="region.y"
            :width="region.w"
            :height="region.h"
            fill="black"
          />
        </mask>
      </defs>
      <image :href="diagram.src" :width="diagram.width" :height="diagram.height" />
      <rect
        class="veil"
        :class="{ on: region }"
        width="100%"
        height="100%"
        :mask="`url(#${maskId})`"
      />
      <rect
        v-if="region"
        class="frame"
        :x="region.x"
        :y="region.y"
        :width="region.w"
        :height="region.h"
      />
    </svg>
  </figure>
</template>

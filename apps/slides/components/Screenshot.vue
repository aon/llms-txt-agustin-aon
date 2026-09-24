<script setup lang="ts">
import sitePage from "../../../docs/images/landing-2.png";

defineProps<{ alt: string }>();
</script>

<template>
  <figure class="plate">
    <img :src="sitePage" :alt="alt" />
  </figure>
</template>

<template>
  <div class="slidev-layout cover relative h-full w-full overflow-hidden">
    <CrawlBackdrop />
    <div
      class="relative flex h-full flex-col items-center justify-center px-14 pb-[50px] text-center"
    >
      <slot />
    </div>
  </div>
</template>

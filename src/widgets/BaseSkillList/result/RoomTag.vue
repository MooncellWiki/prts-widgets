<script setup lang="ts">
import { glyphStyle, roomVars } from "../room";

import type { Room } from "../data";

/** 一枚设施名（线稿取设施色）：干员视图的每级技能带一枚（技能视图看组头） */
defineProps<{ room: Room }>();
</script>

<template>
  <span class="rs-roomtag rs-gl" data-rc :style="roomVars(room)"
    ><i class="rs-glyph" :style="glyphStyle(room.glyph)" aria-hidden="true" />{{
      room.name
    }}</span
  >
</template>

<style scoped lang="scss">
// 线稿与字的对齐见 index.vue 的 .rs-gl
.rs-roomtag {
  --rs-gl: 13px;
  --rs-gl-gap: 4px;

  font-size: var(--ak-fs-xs);
  color: var(--ak-fg-muted);

  .rs-glyph {
    color: var(--rs-room);
  }
}
</style>

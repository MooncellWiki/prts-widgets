<script setup lang="ts">
import { ROOM_GLYPHS } from "../assets";
import { roomVars } from "../room";

import type { Room } from "../data";

/** 一枚设施名（线稿取设施色）：不按设施分组时每行自己带一枚，干员视图的每级技能也带 */
defineProps<{ room: Room }>();
</script>

<template>
  <span class="rs-roomtag" data-rc :style="roomVars(room)">
    <i
      v-if="room.glyph"
      class="rs-glyph"
      :style="{ maskImage: `url(&quot;${ROOM_GLYPHS[room.glyph]}&quot;)` }"
      aria-hidden="true"
    />{{ room.name }}
  </span>
</template>

<style scoped lang="scss">
.rs-roomtag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--ak-fs-xs);
  color: var(--ak-fg-muted);

  .rs-glyph {
    width: 13px;
    height: 13px;
    color: var(--rs-room);
  }
}
</style>

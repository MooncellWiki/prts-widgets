<script setup lang="ts">
import { computed } from "vue";

import { ROOM_GLYPHS } from "../assets";
import { roomVars } from "../room";
import { useBaseSkillList } from "../store";

import SkillRow from "./SkillRow.vue";

import type { Buff, Room } from "../data";

/**
 * 结果 · 技能。按游戏顺序排时按设施分组：组头 = 设施线稿 + 名字 + 英文代号 + 本组条数（n / 设施总数），
 * 左缘设施色条，滚动时贴在页眉下面（随时知道看到哪个设施）；别的排序不分组，每行自己带一枚设施名。
 * 现网是 10 个设施各一张默认折叠的表，这里全部摊开、设施改成筛选。
 */
const store = useBaseSkillList();
const { pageBuffs, grouped } = store;

const groups = computed(() => {
  const out: { room: Room; items: Buff[] }[] = [];
  for (const buff of pageBuffs.value) {
    const last = out[out.length - 1];
    if (last?.room === buff.room) last.items.push(buff);
    else out.push({ room: buff.room, items: [buff] });
  }
  return out;
});
/** 本组条数：筛选后这个设施一共几条（不是这一页里几条） */
const counts = computed(() => {
  const out = new Map<Room, number>();
  for (const b of store.buffList.value)
    out.set(b.room, (out.get(b.room) ?? 0) + 1);
  return out;
});
</script>

<template>
  <div class="rs-list">
    <template v-if="grouped">
      <section
        v-for="g in groups"
        :key="g.room.id"
        class="rs-section"
        :aria-label="g.room.name"
      >
        <div class="rs-section__head" data-rc :style="roomVars(g.room)">
          <i
            v-if="g.room.glyph"
            class="rs-glyph"
            :style="{
              maskImage: `url(&quot;${ROOM_GLYPHS[g.room.glyph]}&quot;)`,
            }"
            aria-hidden="true"
          />
          <h2 class="rs-section__title">{{ g.room.name }}</h2>
          <span class="ak-en">{{ g.room.id }}</span>
          <span class="rs-section__count">
            {{ counts.get(g.room) }} / {{ g.room.count }}
          </span>
        </div>
        <SkillRow v-for="b in g.items" :key="b.index" :buff="b" grouped />
      </section>
    </template>
    <div v-else class="rs-section">
      <SkillRow
        v-for="b in pageBuffs"
        :key="b.index"
        :buff="b"
        :grouped="false"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.rs-list {
  display: grid;
  gap: var(--ak-space-3);
}

.rs-section {
  background: var(--ak-bg-surface);
  border: 1px solid var(--ak-border);

  &__head {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
    padding: 0 var(--ak-space-3) 0 calc(var(--ak-space-3) - var(--ak-bar-w));
    border-left: var(--ak-bar-w) solid var(--rs-room);
    border-bottom: 1px solid var(--ak-border);
    background: var(--ak-bg-surface-2);

    // 页眉吸顶只有 Arknights 皮肤有：组头贴在页眉下面
    .skin-arknights & {
      top: var(--ak-header-h);
    }

    .rs-glyph {
      width: 18px;
      height: 18px;
      color: var(--rs-room);
    }

    .ak-en {
      font-size: var(--ak-fs-overline);
      letter-spacing: var(--ak-tracking-overline);
      color: var(--ak-fg-subtle);
    }
  }

  &__title {
    margin: 0;
    padding: 0;
    border: 0;
    font-family: inherit;
    font-size: var(--ak-fs-body);
    font-weight: 700;
    line-height: 1.3;
  }

  &__count {
    margin-left: auto;
    font: 600 var(--ak-fs-xs) / 1 var(--ak-font-label);
    color: var(--ak-fg-muted);
    font-variant-numeric: tabular-nums;
  }
}
</style>

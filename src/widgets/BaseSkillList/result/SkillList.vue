<script setup lang="ts">
import { computed, useId } from "vue";

import { glyphStyle, roomVars } from "../room";
import { useBaseSkillList } from "../store";

import SkillRow from "./SkillRow.vue";

import type { Buff, Room } from "../data";

/**
 * 结果 · 技能。不分页，始终按设施分组（排序只在组内排，见 sort.ts），同现网每个设施一张默认折叠的表：
 * 组头 = 设施线稿 + 名字 + 英文代号 + 本组条数（n / 设施总数）+ 开合记号（+ / −，同设计系统折叠面板），点了开合，
 * 左缘设施色条，展开后滚动时贴在页眉下面（随时知道看到哪个设施）；行里就不再带设施名。
 * 折起来的组不渲染行。开合的规矩见 store.ts。设施页里只有一个设施，不出组头、不折叠。
 */
const store = useBaseSkillList();
const { buffList, grouped } = store;
const uid = useId();

const groups = computed(() => {
  const out: { room: Room; items: Buff[] }[] = [];
  for (const buff of buffList.value) {
    const last = out[out.length - 1];
    if (last?.room === buff.room) last.items.push(buff);
    else out.push({ room: buff.room, items: [buff] });
  }
  return out;
});
/** 本组条数：筛选后这个设施一共几条 */
const counts = computed(() => {
  const out = new Map<Room, number>();
  for (const b of buffList.value) out.set(b.room, (out.get(b.room) ?? 0) + 1);
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
        <h2 class="rs-section__head" data-rc :style="roomVars(g.room)">
          <button
            type="button"
            class="rs-section__toggle"
            :aria-expanded="store.isOpen(g.room)"
            :aria-controls="
              store.isOpen(g.room) ? `${uid}-${g.room.id}` : undefined
            "
            @click="store.toggleRoom(g.room)"
          >
            <span class="rs-section__title rs-gl"
              ><i
                class="rs-glyph"
                :style="glyphStyle(g.room.glyph)"
                aria-hidden="true"
              />{{ g.room.name }}</span
            >
            <span class="ak-en">{{ g.room.id }}</span>
            <span class="rs-section__count"
              >{{ counts.get(g.room) }} / {{ g.room.count
              }}<i class="rs-section__mark" aria-hidden="true"
            /></span>
          </button>
        </h2>
        <div
          v-if="store.isOpen(g.room)"
          :id="`${uid}-${g.room.id}`"
          class="rs-section__body"
        >
          <SkillRow v-for="b in g.items" :key="b.index" :buff="b" />
        </div>
      </section>
    </template>
    <div v-else class="rs-section">
      <SkillRow v-for="b in buffList" :key="b.index" :buff="b" />
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

  // 去掉宿主正文的 h2 样式；吸顶、色条与底色在这一层，按钮铺满它
  &__head {
    position: sticky;
    top: 0;
    z-index: 2;
    margin: 0;
    padding: 0;
    border: 0;
    border-left: var(--ak-bar-w) solid var(--rs-room);
    background: var(--ak-bg-surface-2);
    font: inherit;

    // 页眉吸顶只有 Arknights 皮肤有：组头贴在页眉下面
    .skin-arknights & {
      top: var(--ak-header-h);
    }
  }

  // 别的皮肤上设计系统会给 button 画框与圆角，这里全部重写
  &__toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    box-sizing: border-box;
    width: 100%;
    min-height: 40px;
    margin: 0;
    padding: 0 var(--ak-space-3) 0 calc(var(--ak-space-3) - var(--ak-bar-w));
    border: 0;
    border-radius: 0;
    background: none;
    font: inherit;
    line-height: inherit;
    color: var(--ak-fg);
    text-align: left;
    cursor: pointer;

    &:hover {
      background: var(--ak-bg-hover);
    }

    &:focus-visible {
      outline: 2px solid var(--ak-focus);
      outline-offset: -2px;
    }

    .rs-glyph {
      color: var(--rs-room);
    }

    .ak-en {
      font-size: var(--ak-fs-overline);
      letter-spacing: var(--ak-tracking-overline);
      color: var(--ak-fg-subtle);
    }
  }

  // 线稿与名字的对齐见 index.vue 的 .rs-gl。线稿的墨迹约占边长的 78%，20px 时墨迹高 ≈ 15.5px，
  // 同 16px 粗体汉字的墨迹（字号的 0.95）一样高，上下沿都和字齐；18px 时上下各短 1px，看着像浮在字中间
  &__title {
    --rs-gl: 20px;
    --rs-gl-gap: 8px;

    font-size: var(--ak-fs-body);
    font-weight: 700;
    line-height: 1.3;
  }

  &__count {
    margin-left: auto;
    white-space: nowrap;
    font: 600 var(--ak-fs-xs) / 1 var(--ak-font-label);
    color: var(--ak-fg-muted);
    font-variant-numeric: tabular-nums;
  }

  // + / −（同设计系统折叠面板 .ak-details > summary::before 的记号与颜色）用两道杠画：
  // 写成字的话 Bender 里没有「−」（U+2212），换别的字体画出来比「+」低 1.5px，一开一合记号就跳。
  // 跟在条数后面同一行，边长 = 数字的大写字高（1cap，Bender 是 0.71em）、底边落在基线上：上下沿都和数字齐
  &__mark {
    position: relative;
    display: inline-block;
    width: 0.71em;
    width: 1cap;
    height: 0.71em;
    height: 1cap;
    margin: 0 3px 0 10px;
    vertical-align: baseline;
    color: var(--ak-accent);

    &::before,
    &::after {
      content: "";
      position: absolute;
      inset: 0;
      margin: auto;
      background: currentColor;
    }

    &::before {
      height: 2px;
    }

    &::after {
      width: 2px;
    }

    [aria-expanded="true"] &::after {
      display: none;
    }
  }

  &__body {
    border-top: 1px solid var(--ak-border);
  }
}
</style>

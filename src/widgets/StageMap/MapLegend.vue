<script setup lang="ts">
import { computed } from "vue";

import {
  markOf,
  terrainOf,
  TERRAIN_NAMES,
  tileInfo,
  type Terrain,
  type TileMark,
} from "./tiles";

import type { Board } from "./level";

/**
 * 图例：只列这张图上有的。底色五种按高低排；起点 / 终点等有专门画法的各一项；
 * 其余功能地块（角标）按游戏的地块名一项一个，悬停看说明。
 */
const props = defineProps<{ board: Board }>();

const TERRAIN_ORDER: Exclude<Terrain, "none">[] = [
  "high",
  "ground",
  "floor",
  "fence",
  "void",
];
const MARK_ORDER: Exclude<TileMark, "special">[] = [
  "start",
  "flystart",
  "end",
  "telin",
  "telout",
  "hole",
];
const MARK_NAMES: Record<Exclude<TileMark, "special">, string> = {
  start: "侵入点",
  flystart: "空袭侵入点",
  end: "保护目标",
  telin: "通道入口",
  telout: "通道出口",
  hole: "地穴",
};

const items = computed(() => {
  const terrains = new Set<Terrain>();
  const marks = new Set<TileMark>();
  const specials = new Map<string, { name: string; description: string }>();
  const { board } = props;
  for (let row = 0; row < board.height; row++)
    for (let col = 0; col < board.width; col++) {
      const tile = board.tile(row, col);
      if (!tile) continue;
      terrains.add(terrainOf(tile));
      const mark = markOf(tile);
      if (!mark) continue;
      marks.add(mark);
      if (mark === "special") {
        const info = tileInfo(tile);
        // 同名的（几种朝向的转角冰面、地面 / 高台两种草毯）并成一项
        if (info.name && !specials.has(info.name))
          specials.set(info.name, info);
      }
    }
  return [
    ...TERRAIN_ORDER.filter((t) => terrains.has(t)).map((t) => ({
      kind: `terrain-${t}`,
      name: TERRAIN_NAMES[t],
      tip: "",
    })),
    ...MARK_ORDER.filter((m) => marks.has(m)).map((m) => ({
      kind: `mark-${m}`,
      name: MARK_NAMES[m],
      tip: "",
    })),
    ...[...specials.values()].map((s) => ({
      kind: "mark-special",
      name: s.name,
      tip: s.description,
    })),
  ];
});
</script>

<template>
  <ul class="sm-legend" aria-label="图例">
    <li
      v-for="item in items"
      :key="item.kind + item.name"
      :data-tip="item.tip || undefined"
      :tabindex="item.tip ? 0 : undefined"
    >
      <i :class="['sm-swatch', `sm-swatch--${item.kind}`]" aria-hidden="true" />
      {{ item.name }}
    </li>
  </ul>
</template>

<style scoped lang="scss">
.sm-legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ak-space-1) var(--ak-space-4);
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--ak-fs-xs);
  color: var(--ak-fg-secondary);

  li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
  }

  li[data-tip] {
    cursor: help;
    border-bottom: 1px dashed currentColor;
  }

  li:focus-visible {
    outline: 2px solid var(--ak-focus);
    outline-offset: 2px;
  }
}

// 色块：同地图上的画法缩小
.sm-swatch {
  position: relative;
  flex: none;
  width: 14px;
  height: 14px;
  box-sizing: border-box;
  background: var(--sm-floor);
}

.sm-swatch--terrain-high {
  background: var(--sm-high);
  box-shadow: inset 0 -3px 0
    color-mix(in srgb, var(--sm-high-front) 55%, var(--sm-high));
}

.sm-swatch--terrain-ground {
  background: var(--sm-ground);
}

.sm-swatch--terrain-fence {
  background: var(--sm-ground);
  border: 2px solid var(--sm-high-front);
}

.sm-swatch--terrain-void {
  background: var(--sm-void);
  outline: 1px solid var(--ak-border);
  outline-offset: -1px;
}

.sm-swatch--mark-start,
.sm-swatch--mark-flystart {
  border: 2px solid var(--sm-start);
}

.sm-swatch--mark-flystart {
  border-style: dashed;
}

.sm-swatch--mark-end {
  border: 2px solid var(--sm-end);
}

.sm-swatch--mark-telin,
.sm-swatch--mark-telout {
  border: 3px solid var(--sm-floor);
  outline: 2px solid var(--sm-start);
  outline-offset: -5px;
}

.sm-swatch--mark-telout {
  outline-color: var(--sm-end);
}

.sm-swatch--mark-hole {
  border: 3px solid var(--sm-floor);
  background: var(--sm-pit);
}

.sm-swatch--mark-special::after {
  content: "";
  position: absolute;
  top: 0;
  right: 0;
  border-style: solid;
  border-width: 0 7px 7px 0;
  border-color: transparent var(--ak-yellow-500) transparent transparent;
}
</style>

<script setup lang="ts">
import { computed, provide, useTemplateRef } from "vue";

import {
  AkButton,
  AkButtonGroup,
  AkEmpty,
  AkRadioButton,
  AkRadioGroup,
  AkScope,
  AkSwitch,
} from "@mooncellwiki/prts-design-vue";
import { useElementSize } from "@vueuse/core";

import { TORAPPU_ENDPOINT } from "@/utils/consts";
import { useHostTheme } from "@/utils/useHostTheme";
import { useHoverTip } from "@/utils/useHoverTip";

import MapBoard from "./MapBoard.vue";
import MapLegend from "./MapLegend.vue";
import SpawnTable from "./SpawnTable.vue";
import { createStageMap, stageMapKey, TRAIL_SECONDS } from "./store";

import type { EnemyDatabase } from "./enemies";
import type { Difficulty, LevelData } from "./level";

/**
 * 关卡地图（PRTS Design 视觉，参考 map.ark-nights.com）：
 * 难度 · 路线显示 → 地图（地形 + 敌人路线 + 预设装置）→ 图例 → 逐组翻看 → 出兵表。
 * 地形、路线、出兵时间都按游戏 2.7.81 的原生逻辑算（寻路见 pathfinding.ts，出兵见 timeline.ts）。
 * .ak-* 是设计系统组件（样式来自皮肤 / skins.arknights.components），.sm-* 是这页自己的排布。
 * 根节点标 ak-not-prose，不吃皮肤的正文排版。
 */
const props = defineProps<{
  /** 取不到（新活动的关卡文件不在 gamedata 里）时是 null：退回关卡页原先的地图截图 */
  level: LevelData | null;
  enemyDb?: Promise<EnemyDatabase>;
  stageId?: string;
}>();

const store = props.level
  ? createStageMap(props.level, {
      stageId: props.stageId,
      enemyDb: props.enemyDb,
    })
  : null;
if (store) provide(stageMapKey, store);

const theme = useHostTheme();

/* 排布看根节点自己的宽度，不看视口：≥ WIDE 地图与出兵表左右并排，< 640 是手机排布 */
const WIDE = 900;
const root = useTemplateRef<HTMLElement>("root");
const { width } = useElementSize(
  root,
  { width: Number.POSITIVE_INFINITY, height: 0 },
  { box: "border-box" },
);

/** 同关卡页的叫法：普通 / 突袭；有险地的关卡（模块:StageDiff 的 six）是常规 / 险地 */
const difficultyName = (d: Difficulty) =>
  ({
    NORMAL: store?.difficulties.includes("SIX_STAR") ? "常规" : "普通",
    FOUR_STAR: "突袭",
    EASY: "简单",
    SIX_STAR: "险地",
  })[d];

const enemyCount = computed(() => {
  const { min, max } = store!.timeline.value.enemyCount;
  return min === max ? `${min}` : `${min}–${max}`;
});

const preview = computed(() =>
  props.stageId
    ? `${TORAPPU_ENDPOINT}/assets/map_preview/${encodeURIComponent(props.stageId.replace(/#.*$/, ""))}.png`
    : "",
);

const seconds = (t: number) => `${Math.round(t * 10) / 10} 秒`;

/** 逐组翻看那一条聚焦时，方向键前后翻 */
function onKey(e: KeyboardEvent) {
  if (!store || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === "ArrowLeft" || e.key === "ArrowUp") store.step(-1);
  else if (e.key === "ArrowRight" || e.key === "ArrowDown") store.step(1);
  else return;
  e.preventDefault();
}

const { tip, handlers: tipHandlers } = useHoverTip(
  useTemplateRef<HTMLElement>("bubble"),
  "[data-tip]",
);
</script>

<template>
  <AkScope class="sm ak-not-prose" :theme="theme">
    <div
      ref="root"
      :class="[
        'sm-root',
        { 'sm--narrow': width < 640, 'sm--wide': width >= WIDE },
      ]"
      v-on="tipHandlers"
    >
      <template v-if="store">
        <div class="sm-bar">
          <AkRadioGroup
            v-if="store.difficulties.length > 1"
            v-model="store.state.difficulty"
            size="sm"
            label="难度"
          >
            <AkRadioButton v-for="d in store.difficulties" :key="d" :value="d">
              {{ difficultyName(d) }}
            </AkRadioButton>
          </AkRadioGroup>
          <AkRadioGroup v-model="store.state.view" size="sm" label="视角">
            <AkRadioButton value="persp">立体</AkRadioButton>
            <AkRadioButton value="flat">俯视</AkRadioButton>
          </AkRadioGroup>
          <AkSwitch
            v-model="store.state.showAll"
            size="sm"
            :data-ak-tip="`关闭时只画选中那组，和它出发前 ${TRAIL_SECONDS} 秒内出发的`"
          >
            显示全部路线
          </AkSwitch>
          <span class="sm-summary">
            敌人 <b>{{ enemyCount }}</b> · 最后一只出现于
            <b>{{ seconds(store.timeline.value.duration) }}</b>
          </span>
        </div>

        <div class="sm-main">
          <div class="sm-map">
            <!-- 立体时是作战画面：两套主题里都按暗色画（同游戏「作战为黑」） -->
            <AkScope
              class="sm-board-wrap"
              :theme="store.state.view === 'persp' ? 'dark' : theme"
            >
              <MapBoard
                :board="store.board"
                :routes="store.boardRoutes.value"
                :tokens="store.tokens.value"
                :mode="store.state.view"
              />
              <MapLegend :board="store.board" />
            </AkScope>
          </div>

          <!-- 宽排布时出兵表在右栏，高度跟着地图走（表格自己滚） -->
          <div class="sm-side">
            <div class="sm-side__inner">
              <div
                class="sm-step"
                tabindex="0"
                aria-label="出兵顺序：方向键前后翻"
                @keydown="onKey"
              >
                <AkButtonGroup size="sm">
                  <AkButton
                    class="ak-btn--icon"
                    icon="chevron-left"
                    label="上一组"
                    :disabled="store.state.selected <= 0"
                    @click="store.step(-1)"
                  />
                  <AkButton
                    class="ak-btn--icon"
                    icon="chevron-right"
                    label="下一组"
                    :disabled="
                      store.state.selected >= store.groups.value.length - 1
                    "
                    @click="store.step(1)"
                  />
                </AkButtonGroup>
                <span
                  v-if="store.current.value"
                  class="sm-step__now"
                  aria-live="polite"
                >
                  <b class="sm-step__index">
                    {{ store.state.selected + 1 }} /
                    {{ store.groups.value.length }}
                  </b>
                  {{
                    store.current.value.branch
                      ? `触发后 ${seconds(store.current.value.time)}`
                      : seconds(store.current.value.time)
                  }}
                  ·
                  {{
                    store.enemyOf(store.current.value.key).name ||
                    store.current.value.key
                  }}
                  ×{{ store.current.value.count }}
                </span>
                <span v-else class="sm-step__now">这一关没有出兵</span>
              </div>

              <SpawnTable v-if="store.groups.value.length > 0" />
              <p v-if="store.enemiesFailed.value" class="sm-note">
                敌人数据读取失败，表里只有敌人编号。
              </p>
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <img
          v-if="preview"
          class="sm-preview"
          :src="preview"
          alt="地图"
          loading="lazy"
        />
        <AkEmpty v-else title="没有这一关的地图数据" />
      </template>
    </div>

    <div
      v-if="tip"
      ref="bubble"
      class="ak-tooltip sm-tip"
      role="tooltip"
      :style="{ left: `${tip.left}px`, top: `${tip.top}px` }"
    >
      {{ tip.text }}
    </div>
  </AkScope>
</template>

<style scoped lang="scss">
// 地图与图例共用的颜色。底色越高越接近前景色（亮色下越深、暗色下越浅），两套主题里「高台比地面显眼」是一回事：
// 按前景色在面板底色上的浓度取三档，不认 color-mix 的浏览器退到最接近的令牌
.sm,
.sm-board-wrap {
  --sm-void: var(--ak-bg-inset);
  --sm-floor: var(--ak-border-strong);
  --sm-ground: var(--ak-fg-subtle);
  --sm-high: var(--ak-fg-muted);
  --sm-high-front: var(--ak-fg-secondary);
  --sm-high-side: var(--ak-fg-secondary);
  // 地穴：两套主题里都是黑的
  --sm-pit: var(--ak-gray-950);
  --sm-start: var(--ak-red-500);
  --sm-end: var(--ak-blue-500);
  --sm-route: var(--ak-accent);
  --sm-route-dim: var(--ak-fg-secondary);

  @supports (color: color-mix(in srgb, red, blue)) {
    --sm-floor: color-mix(in srgb, var(--ak-fg) 16%, var(--ak-bg-surface));
    --sm-ground: color-mix(in srgb, var(--ak-fg) 38%, var(--ak-bg-surface));
    --sm-high: color-mix(in srgb, var(--ak-fg) 66%, var(--ak-bg-surface));
    // 高台朝镜头的正面、侧面：两套主题里都比台面暗（背光）
    --sm-high-front: color-mix(in srgb, var(--sm-high) 55%, #000);
    --sm-high-side: color-mix(in srgb, var(--sm-high) 72%, #000);
  }
}

// 别的皮肤上根节点带 data-theme（见 useHostTheme），设计系统会连画布底色一起铺；这里嵌在宿主正文里，不要那块底
.sm.ak-scope[data-theme] {
  background-color: transparent;
}

.sm-root {
  display: flex;
  flex-direction: column;
  gap: var(--ak-space-3);
  max-width: 1200px;
}

.sm-main,
.sm-map,
.sm-side__inner {
  display: flex;
  flex-direction: column;
  gap: var(--ak-space-3);
  min-width: 0;
}

// 并排：右栏绝对定位撑满，行高只由左边的地图决定，出兵表在里面滚
.sm--wide {
  .sm-main {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(320px, 400px);
    align-items: stretch;
  }

  .sm-side {
    position: relative;
    min-height: 360px;
  }

  .sm-side__inner {
    position: absolute;
    inset: 0;
  }

  .sm-side__inner > :deep(.sm-spawns) {
    flex: 1 1 0;
    max-height: none;
    min-height: 0;
  }
}

.sm-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ak-space-2) var(--ak-space-4);
}

.sm-summary {
  margin-left: auto;
  font-size: var(--ak-fs-xs);
  color: var(--ak-fg-muted);
  font-variant-numeric: tabular-nums;

  b {
    color: var(--ak-fg);
  }

  .sm--narrow & {
    margin-left: 0;
  }
}

// 面板自己是个作用域（立体时强制暗色），颜色变量在这里按面板的主题重新算一遍
.sm-board-wrap.ak-scope {
  display: flex;
  flex-direction: column;
  gap: var(--ak-space-3);
  padding: var(--ak-space-3);
  background: var(--ak-bg-surface);
  border: 1px solid var(--ak-border);

  .sm--narrow & {
    padding: var(--ak-space-2);
  }
}

.sm-step {
  display: flex;
  align-items: center;
  gap: var(--ak-space-3);
  min-width: 0;

  &:focus-visible {
    outline: 2px solid var(--ak-focus);
    outline-offset: 2px;
  }
}

.sm-step__now {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--ak-fs-sm);
  font-variant-numeric: tabular-nums;
}

.sm-step__index {
  margin-right: var(--ak-space-2);
}

.sm-note {
  margin: 0;
  font-size: var(--ak-fs-xs);
  color: var(--ak-fg-muted);
}

.sm-preview {
  display: block;
  max-width: 100%;
  height: auto;
}

// 地块 / 停留点提示：按视口定位
.sm-tip.ak-tooltip {
  position: fixed;
  max-width: min(320px, calc(100vw - 16px));
  white-space: pre-line;
  line-height: 1.55;
  pointer-events: none;
}
</style>

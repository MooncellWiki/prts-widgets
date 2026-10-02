<script setup lang="ts">
import { computed, nextTick, ref, useId, useTemplateRef, watch } from "vue";

import { useEventListener } from "@vueuse/core";

import { GLOSS, groupAnims, type AnimSummary } from "../engine/anims";

/**
 * 动作列表：一行一个动作，点了就播（游戏的时装预览也是一排直达按钮 btn_play_enter / special / interact，不是下拉）。
 * 超过 8 个时分组；每行右边是帧数（30 帧 / 秒）与 OnAttack 判定次数——现网 ⓘ 气泡里的「模型动画数据」表就是这一列
 */
const props = defineProps<{
  anims: AnimSummary[];
  active?: string;
}>();
const emit = defineEmits<{ select: [name: string] }>();

const uid = useId();
const groups = computed(() =>
  groupAnims(props.anims).map((g) => ({
    ...g,
    items: g.items.map((a) => ({
      ...a,
      hitText: a.hits.length ? `攻击判定：第 ${a.hits.join("、")} 帧` : "",
      descId: `${uid}-${a.name.replace(/\s/g, "_")}`,
    })),
  })),
);

/* 当前行留在列表视野里（连播换段、换模型后沿用同名动作时）：只滚列表，不动页面 */
const box = useTemplateRef<HTMLElement>("box");
watch(
  () => props.active,
  async () => {
    await nextTick();
    const el = box.value;
    const on = el?.querySelector<HTMLElement>(".sv__anim.is-active");
    if (!el || !on) return;
    el.scrollTop = Math.min(
      on.offsetTop - 28,
      Math.max(on.offsetTop + on.offsetHeight - el.clientHeight, el.scrollTop),
    );
  },
);

/*
 * 判定帧提示：悬停 ◆ 次数（或键盘聚焦到这一行）时出 .ak-tooltip。
 * 列表是滚动容器，CSS 版 [data-ak-tip] 会被裁掉，所以同干员一览的术语提示：按视口定位（position: fixed），
 * 贴在 ◆ 上方，放不下就放下方，左右不出视口。悬停出的一滚就收；键盘聚焦出的跟着行走
 * （Tab 到列表外沿的一行时列表会自己滚过去，那一下不能把刚弹出的提示收掉）
 */
const bubble = useTemplateRef<HTMLElement>("bubble");
const tip = ref<{ text: string; left: number; top: number } | null>(null);
let anchor: HTMLElement | null = null;
let viaFocus = false;
function hideTip() {
  tip.value = null;
  anchor = null;
}
async function showTip(el: HTMLElement, focus = false) {
  anchor = el;
  viaFocus = focus;
  tip.value = { text: el.dataset.tip ?? "", left: -9999, top: -9999 };
  await nextTick();
  if (!tip.value || !bubble.value || !el.isConnected) return;
  const r = el.getBoundingClientRect();
  const w = bubble.value.offsetWidth;
  const h = bubble.value.offsetHeight;
  tip.value = {
    text: tip.value.text,
    left: Math.round(
      Math.min(
        Math.max(8, r.left + r.width / 2 - w / 2),
        document.documentElement.clientWidth - w - 8,
      ),
    ),
    top: Math.round(r.top - h - 6 < 8 ? r.bottom + 6 : r.top - h - 6),
  };
}
const hitOf = (e: Event) =>
  e.target instanceof Element
    ? e.target.closest<HTMLElement>("em[data-tip]")
    : null;
function onOver(e: MouseEvent) {
  const el = hitOf(e);
  if (el) showTip(el);
}
function onOut(e: MouseEvent) {
  if (hitOf(e)) hideTip();
}
/* 只认键盘聚焦（:focus-visible）：鼠标点一行不弹 */
function onFocusIn(e: FocusEvent) {
  const row = e.target as HTMLElement;
  const el = row.querySelector<HTMLElement>("em[data-tip]");
  let keyboard = true;
  try {
    keyboard = row.matches(":focus-visible");
  } catch {}
  if (el && keyboard) showTip(el, true);
}
function onScroll() {
  if (anchor && viaFocus) showTip(anchor, true);
  else hideTip();
}
useEventListener(window, "scroll", onScroll, { passive: true });
useEventListener(document, "keydown", (e: KeyboardEvent) => {
  if (e.key === "Escape") hideTip();
});
</script>

<template>
  <div class="sv__list">
    <div class="sv__list-head">
      <b>动作</b><span class="ak-overline">{{ anims.length || "" }}</span>
    </div>
    <div
      ref="box"
      class="sv__anims"
      role="group"
      aria-label="动作"
      @mouseover="onOver"
      @mouseout="onOut"
      @focusin="onFocusIn"
      @focusout="hideTip"
      @scroll.passive="onScroll"
    >
      <template v-for="group in groups" :key="group.title">
        <div v-if="group.title" class="sv__group ak-overline">
          {{ group.title }}
        </div>
        <button
          v-for="a in group.items"
          :key="a.name"
          type="button"
          :class="['sv__anim', { 'is-active': a.name === active }]"
          :aria-pressed="a.name === active"
          :aria-describedby="a.hitText ? a.descId : undefined"
          @click="emit('select', a.name)"
        >
          <span>{{ a.name }}</span>
          <small v-if="GLOSS[a.name]">{{ GLOSS[a.name] }}</small>
          <i
            ><em v-if="a.hitText" :data-tip="a.hitText">{{ a.hits.length }}</em
            >{{ a.frames }} F</i
          >
          <span v-if="a.hitText" :id="a.descId" hidden>{{ a.hitText }}</span>
        </button>
      </template>
    </div>
    <div
      v-if="tip"
      ref="bubble"
      class="ak-tooltip sv__tip"
      role="tooltip"
      :style="{ left: `${tip.left}px`, top: `${tip.top}px` }"
    >
      {{ tip.text }}
    </div>
  </div>
</template>

<style scoped lang="scss">
.sv__list {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid var(--ak-border);
}

.sv__list-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px 8px 14px;
  border-bottom: 1px solid var(--ak-border-subtle);

  b {
    font: 700 var(--ak-fs-sm) / 1 var(--ak-font-body);
  }
}

.sv__anims {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 0;
  scrollbar-width: thin;
}

.sv__group {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 4px 14px;

  &::after {
    content: "";
    flex: 1;
    border-top: 1px solid var(--ak-border-subtle);
  }
}

.sv__anim {
  all: unset;
  box-sizing: border-box;
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  padding: 6px 12px 6px 11px;
  border-left: 3px solid transparent;
  cursor: pointer;
  font: 700 13px/1.3 var(--ak-font-label);
  color: var(--ak-fg-secondary);

  &:hover {
    background: var(--ak-bg-hover);
    color: var(--ak-fg);
  }

  &:focus-visible {
    outline: 2px solid var(--ak-focus);
    outline-offset: -2px;
  }

  &.is-active {
    border-left-color: var(--ak-accent);
    background: var(--ak-mark-bg);
    color: var(--ak-accent);
  }

  > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    flex: none;
    font: 500 var(--ak-fs-xs) / 1 var(--ak-font-body);
    color: var(--ak-fg-subtle);
  }

  i {
    flex: none;
    margin-left: auto;
    font: 500 11px/1 var(--ak-font-mono);
    font-style: normal;
    color: var(--ak-fg-muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  // 判定次数：悬停出判定帧提示（.sv__tip），虚线下划线同设计系统的术语提示 .ak-term
  em {
    font-style: normal;
    margin-right: 8px;
    color: var(--ak-fg);
    border-bottom: 1px dashed currentColor;
    cursor: help;

    // 黄菱形与时间轴上的判定帧同一个记号
    &::before {
      content: "";
      display: inline-block;
      width: 7px;
      height: 7px;
      margin-right: 5px;
      background: var(--ak-accent-2);
      transform: rotate(45deg);
      box-shadow: 0 0 0 1px var(--ak-bg-surface);
    }
  }
}

// 判定帧提示：列表是滚动容器，CSS 版 [data-ak-tip] 会被裁掉，改按视口定位（同干员一览的 .ol-tip）
.sv__tip.ak-tooltip {
  position: fixed;
  max-width: min(340px, calc(100vw - 16px));
  white-space: pre-line;
  line-height: 1.55;
  pointer-events: none;
}

@media (max-width: 767px) {
  .sv__list {
    order: 1;
    border-left: 0;
    border-top: 1px solid var(--ak-border);
  }

  .sv__anims {
    max-height: 232px;
  }

  .sv.is-max .sv__anims {
    max-height: 26vh;
  }
}
</style>

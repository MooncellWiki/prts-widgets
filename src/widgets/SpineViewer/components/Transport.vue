<script setup lang="ts">
import { computed, ref, useTemplateRef } from "vue";

import {
  AkButton,
  AkButtonGroup,
  AkSelect,
  AkSwitch,
} from "@mooncellwiki/prts-design-vue";

import { EVENT_LABEL, FPS, type AnimSummary } from "../engine/anims";

import SvIcon from "./SvIcon.vue";

/**
 * 时间轴 + 播放条。时间轴可拖、吸附到整帧，标出骨骼数据里的事件帧（OnAttack 黄色菱形，其余细竖线）；
 * 播放 / 暂停、逐帧、循环、连播、速度，对应游戏 UI 小人的三种播法 PlayAnimOption.LOOP / PLAY_ONCE / STOP
 */
const props = defineProps<{
  anim: AnimSummary | null;
  t: number;
  playing: boolean;
  canWebm: boolean;
}>();
const emit = defineEmits<{
  seek: [time: number];
  step: [delta: number];
  toggle: [];
  export: [kind: "png" | "webm"];
}>();
const loop = defineModel<boolean>("loop", { required: true });
const chain = defineModel<boolean>("chain", { required: true });
const speed = defineModel<number>("speed", { required: true });

const SPEEDS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2].map((v) => ({
  label: `×${v}`,
  value: v,
}));

const frame = computed(() => Math.round(props.t * FPS));
const progress = computed(() =>
  props.anim?.duration
    ? `${((props.t / props.anim.duration) * 100).toFixed(2)}%`
    : "0%",
);
const marks = computed(() => {
  const a = props.anim;
  if (!a?.duration) return [];
  return a.events.map((e) => ({
    hit: e.name === "OnAttack",
    left: `${((e.time / a.duration) * 100).toFixed(2)}%`,
    title: `${e.name}${EVENT_LABEL[e.name] ? `（${EVENT_LABEL[e.name]}）` : ""} · 第 ${Math.round(e.time * FPS)} 帧`,
  }));
});

/* 指针由时间轴自己接（原生滑杆的滑块有半个身位的内缩，点不准帧）；隐藏的 <input type=range> 只管键盘与读屏 */
const timeline = useTemplateRef<HTMLElement>("timeline");
const seekInput = useTemplateRef<HTMLInputElement>("seekInput");
function scrub(e: PointerEvent) {
  const el = timeline.value;
  const a = props.anim;
  if (!el || !a) return;
  const r = el.getBoundingClientRect();
  const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  emit("seek", Math.round(p * a.duration * FPS) / FPS);
}
function onPointerDown(e: PointerEvent) {
  if (!props.anim?.duration) return;
  timeline.value?.setPointerCapture(e.pointerId);
  scrub(e);
  seekInput.value?.focus({ preventScroll: true });
}
function onPointerMove(e: PointerEvent) {
  if (timeline.value?.hasPointerCapture(e.pointerId)) scrub(e);
}
/* 键盘聚焦到隐藏的滑杆时给整条时间轴描边（只认 :focus-visible，拖动时程序聚焦不描） */
const focused = ref(false);
function onSeekFocus(e: FocusEvent) {
  try {
    focused.value = (e.target as HTMLElement).matches(":focus-visible");
  } catch {
    focused.value = true;
  }
}
function onSeekInput(e: Event) {
  emit("seek", Number((e.target as HTMLInputElement).value) / FPS);
}
</script>

<template>
  <div class="sv__transport" :style="{ '--sv-p': progress }">
    <div class="sv__timerow">
      <div
        ref="timeline"
        :class="[
          'sv__timeline',
          { 'is-disabled': !anim?.duration, 'is-focused': focused },
        ]"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
      >
        <div class="sv__track"><div class="sv__fill" /></div>
        <div class="sv__marks">
          <i
            v-for="(m, i) in marks"
            :key="i"
            :class="m.hit ? 'sv__mark--hit' : 'sv__mark'"
            :style="{ left: m.left }"
            :title="m.title"
          />
        </div>
        <div class="sv__playhead" />
        <input
          ref="seekInput"
          class="sv__seek"
          type="range"
          min="0"
          :max="anim?.frames || 1"
          step="1"
          :value="frame"
          aria-label="帧"
          @input="onSeekInput"
          @focus="onSeekFocus"
          @blur="focused = false"
        />
      </div>
      <div class="sv__frame">
        <template v-if="anim">
          <b>{{ frame }}</b> / {{ anim.frames }} F · {{ t.toFixed(2) }} /
          {{ anim.duration.toFixed(2) }} s
        </template>
      </div>
    </div>
    <div class="sv__ctrl">
      <AkButtonGroup>
        <AkButton
          variant="contrast"
          class="ak-btn--icon"
          :label="playing ? '暂停' : '播放'"
          @click="emit('toggle')"
        >
          <SvIcon :name="playing ? 'pause' : 'play'" />
        </AkButton>
        <AkButton
          class="ak-btn--icon"
          label="上一帧"
          data-ak-tip="上一帧 (←)"
          @click="emit('step', -1)"
        >
          <SvIcon name="prev" />
        </AkButton>
        <AkButton
          class="ak-btn--icon"
          label="下一帧"
          data-ak-tip="下一帧 (→)"
          @click="emit('step', 1)"
        >
          <SvIcon name="next" />
        </AkButton>
      </AkButtonGroup>
      <AkSwitch v-model="loop" size="sm">循环</AkSwitch>
      <span data-ak-tip="一招的几段接着播：Begin → Loop → End">
        <AkSwitch v-model="chain" size="sm">连播</AkSwitch>
      </span>
      <label class="sv__speed">
        速度
        <AkSelect
          :model-value="speed"
          size="sm"
          :options="SPEEDS"
          @update:model-value="speed = Number($event)"
        />
      </label>
      <div class="sv__export">
        <span class="ak-overline">导出</span>
        <AkButtonGroup size="sm">
          <AkButton
            data-ak-tip="当前帧，透明底或所选背景"
            @click="emit('export', 'png')"
          >
            <SvIcon name="download" />PNG
          </AkButton>
          <AkButton
            v-if="canWebm"
            data-ak-tip="当前动作播一遍，按所选速度"
            @click="emit('export', 'webm')"
          >
            <SvIcon name="download" />WebM
          </AkButton>
        </AkButtonGroup>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.sv__transport {
  border-top: 1px solid var(--ak-border);
  background: var(--ak-bg-surface-2);

  .ak-btn > svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }
}

.sv__timerow {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 14px 0;
}

.sv__timeline {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 28px;
  cursor: pointer;
  touch-action: none;

  &.is-disabled {
    opacity: 0.4;
    pointer-events: none;
  }

  &.is-focused {
    outline: 2px solid var(--ak-focus);
    outline-offset: 2px;
  }
}

.sv__track {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 6px;
  margin-top: -3px;
  background: var(--ak-bg-surface-3);
}

.sv__fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: var(--sv-p, 0%);
  background: var(--ak-accent);
}

.sv__playhead {
  position: absolute;
  left: var(--sv-p, 0%);
  top: 3px;
  bottom: 3px;
  width: 2px;
  margin-left: -1px;
  background: var(--ak-fg);
}

// 事件帧：OnAttack 是黄菱形（与动作列表里判定次数前的记号同一个），其余细竖线
.sv__mark {
  position: absolute;
  top: 50%;
  width: 2px;
  height: 12px;
  margin: -6px 0 0 -1px;
  background: var(--ak-fg-muted);
}

.sv__mark--hit {
  position: absolute;
  top: 50%;
  width: 9px;
  height: 9px;
  margin: -4.5px 0 0 -4.5px;
  background: var(--ak-accent-2);
  transform: rotate(45deg);
  box-shadow: 0 0 0 1.5px var(--ak-bg-surface-2);
}

// 只管键盘与读屏；指针由时间轴自己接
.sv__seek {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  pointer-events: none;
}

.sv__frame {
  flex: none;
  min-width: 132px;
  text-align: right;
  font: 500 var(--ak-fs-xs) / 1 var(--ak-font-label);
  color: var(--ak-fg-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;

  b {
    font-size: var(--ak-fs-body);
    color: var(--ak-fg);
  }
}

.sv__ctrl {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  padding: 8px 14px 10px;

  > .ak-btn-group {
    flex: none;
  }

  .ak-select {
    width: auto;
  }
}

.sv__speed {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: var(--ak-fs-xs);
  color: var(--ak-fg-muted);
  white-space: nowrap;
}

.sv__export {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 767px) {
  .sv__export > .ak-overline {
    display: none;
  }

  .sv__timerow {
    flex-wrap: wrap;
    gap: 2px 14px;
  }

  .sv__timeline {
    flex-basis: 100%;
  }

  .sv__frame {
    min-width: 0;
    margin-left: auto;
  }
}
</style>

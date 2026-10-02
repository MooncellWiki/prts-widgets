<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { hexToHsv, hsvToHex, normalizeHex, type Hsv } from "../engine/color";

/**
 * 背景的自定义取色面板：饱和度 / 明度平面 + 色相条 + 十六进制 + 预设。
 * 自己画而不用 <input type="color">——那个弹的是浏览器 / 系统的取色面板，各家长得不一样。
 * 外框是设计系统的 .ak-popover（顶边主色条）；开合、点外面关、Esc 由 SpineViewer 管
 */
const color = defineModel<string>({ required: true });

/** 预设：两个主色 + 次强调黄、两档灰、白，再加绿幕 / 品红（导出 WebM 后好抠像） */
const PRESETS = [
  ["#18d1ff", "官网青"],
  ["#0098dc", "游戏内蓝"],
  ["#ffd800", "强调黄"],
  ["#313131", "按钮灰"],
  ["#8d8d8d", "中灰"],
  ["#ffffff", "白"],
  ["#00ff00", "绿幕"],
  ["#ff00ff", "品红"],
] as const;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/* 内部按 HSV 存：灰色 / 黑色没有色相，拖到角上时色相条不跳 */
const hsv = ref<Hsv>(hexToHsv(color.value));
watch(color, (hex) => {
  if (hex !== hsvToHex(hsv.value)) hsv.value = hexToHsv(hex, hsv.value.h);
});
function set(next: Partial<Hsv>) {
  hsv.value = { ...hsv.value, ...next };
  color.value = hsvToHex(hsv.value);
}

/* 平面与色相条：按下捕获指针（拖出框也跟手），pointerdown / pointermove 同一个处理；方向键（Shift 大步） */
function track(e: PointerEvent): [number, number] | null {
  const el = e.currentTarget as HTMLElement;
  if (e.type === "pointerdown") {
    el.setPointerCapture(e.pointerId);
    el.focus({ preventScroll: true });
  } else if (!el.hasPointerCapture(e.pointerId)) return null;
  const r = el.getBoundingClientRect();
  return [
    clamp01((e.clientX - r.left) / r.width),
    clamp01((e.clientY - r.top) / r.height),
  ];
}
function onPlanePointer(e: PointerEvent) {
  const p = track(e);
  if (p) set({ s: p[0], v: 1 - p[1] });
}
function onHuePointer(e: PointerEvent) {
  const p = track(e);
  if (p) set({ h: p[0] * 360 });
}

const STEP: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
};
function onPlaneKey(e: KeyboardEvent) {
  const d = STEP[e.key];
  if (!d) return;
  e.preventDefault();
  const k = e.shiftKey ? 0.1 : 0.01;
  set({
    s: clamp01(hsv.value.s + d[0] * k),
    v: clamp01(hsv.value.v + d[1] * k),
  });
}
function onHueKey(e: KeyboardEvent) {
  const d = STEP[e.key];
  if (!d) return;
  e.preventDefault();
  const h = hsv.value.h + (d[0] || d[1]) * (e.shiftKey ? 10 : 1);
  set({ h: Math.min(360, Math.max(0, h)) });
}

/* 十六进制：打满 6 位就生效；失焦 / 回车时也认 3 位简写，并把框里的字规整成当前颜色 */
const hexText = ref(color.value);
watch(color, (hex) => {
  if (normalizeHex(hexText.value) !== hex) hexText.value = hex;
});
function onHexInput(e: Event) {
  hexText.value = (e.target as HTMLInputElement).value;
  if (/^#?[\da-f]{6}$/i.test(hexText.value.trim()))
    color.value = normalizeHex(hexText.value)!;
}
function onHexCommit() {
  const hex = normalizeHex(hexText.value);
  if (hex) color.value = hex;
  hexText.value = color.value;
}

const planeStyle = computed(() => ({ "--_h": hsv.value.h.toFixed(1) }));
const planeText = computed(
  () =>
    `饱和度 ${Math.round(hsv.value.s * 100)}%，明度 ${Math.round(hsv.value.v * 100)}%`,
);
</script>

<template>
  <div
    class="ak-popover ak-popover--top-end sv__picker"
    role="dialog"
    aria-label="自定义背景色"
  >
    <div
      class="sv__picker-plane"
      role="slider"
      tabindex="0"
      aria-label="饱和度与明度（← → 饱和度，↑ ↓ 明度）"
      :aria-valuetext="planeText"
      :style="planeStyle"
      @pointerdown="onPlanePointer"
      @pointermove="onPlanePointer"
      @keydown="onPlaneKey"
    >
      <i
        class="sv__picker-thumb"
        :style="{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }"
      />
    </div>
    <div
      class="sv__picker-hue"
      role="slider"
      tabindex="0"
      aria-label="色相"
      aria-valuemin="0"
      aria-valuemax="360"
      :aria-valuenow="Math.round(hsv.h)"
      @pointerdown="onHuePointer"
      @pointermove="onHuePointer"
      @keydown="onHueKey"
    >
      <i
        class="sv__picker-thumb"
        :style="{ left: `${(hsv.h / 360) * 100}%` }"
      />
    </div>
    <div class="sv__picker-row">
      <span class="sv__picker-preview" :style="{ '--_c': color }" />
      <input
        class="ak-input ak-input--sm sv__picker-hex"
        :value="hexText"
        maxlength="7"
        spellcheck="false"
        autocomplete="off"
        aria-label="十六进制颜色"
        @input="onHexInput"
        @change="onHexCommit"
        @keydown.enter="onHexCommit"
      />
    </div>
    <div class="sv__picker-presets" role="group" aria-label="预设颜色">
      <button
        v-for="[c, name] in PRESETS"
        :key="c"
        type="button"
        class="sv__picker-preset"
        :style="{ '--_c': c }"
        :aria-pressed="color === c"
        :title="`${name} ${c.toUpperCase()}`"
        :aria-label="`${name} ${c.toUpperCase()}`"
        @click="color = c"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
// 自定义背景的取色面板：外框是 .ak-popover（--top-end：贴着色块那一排的右缘往上出），里面自己画——
// 不用 <input type="color">，那个弹的是浏览器 / 系统的取色面板，各家长得不一样
.sv__picker.ak-popover {
  display: grid;
  gap: 10px;
  width: 232px;
  min-width: 0;
  box-sizing: border-box;
  padding: 10px;
  cursor: default;
}

.sv__picker-plane,
.sv__picker-hue {
  position: relative;
  touch-action: none;

  &:focus-visible {
    outline: 2px solid var(--ak-focus);
    outline-offset: 2px;
  }
}

// 饱和度（横）× 明度（纵）：底色是当前色相，上面叠白→透明、透明→黑两层
.sv__picker-plane {
  height: 128px;
  cursor: crosshair;
  background:
    linear-gradient(to top, #000, transparent),
    linear-gradient(to right, #fff, transparent), hsl(var(--_h, 0), 100%, 50%);
}

.sv__picker-hue {
  height: 12px;
  cursor: pointer;
  background: linear-gradient(
    to right,
    #f00,
    #ff0 16.67%,
    #0f0 33.33%,
    #0ff 50%,
    #00f 66.67%,
    #f0f 83.33%,
    #f00
  );
}

// 直角的指示框：白边 + 内外各一圈半透明黑，深浅底上都看得见
.sv__picker-thumb {
  position: absolute;
  width: 12px;
  height: 12px;
  margin: -6px 0 0 -6px;
  box-sizing: border-box;
  border: 2px solid #fff;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.55),
    inset 0 0 0 1px rgba(0, 0, 0, 0.55);
  pointer-events: none;

  .sv__picker-hue > & {
    top: 50%;
    width: 6px;
    height: 18px;
    margin: -9px 0 0 -3px;
  }
}

.sv__picker-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sv__picker-preview {
  flex: none;
  width: 30px;
  height: 30px;
  box-sizing: border-box;
  background: var(--_c);
  border: 1px solid var(--ak-border-strong);
}

.sv__picker-hex.ak-input {
  flex: 1;
  min-width: 0;
  font-family: var(--ak-font-mono);
}

.sv__picker-presets {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 4px;
}

.sv__picker-preset {
  all: unset;
  box-sizing: border-box;
  height: 20px;
  cursor: pointer;
  background: var(--_c);
  border: 1px solid var(--ak-border-strong);

  &[aria-pressed="true"] {
    outline: 2px solid var(--ak-accent);
    outline-offset: 1px;
  }

  &:focus-visible {
    outline: 2px solid var(--ak-focus);
    outline-offset: 1px;
  }
}
</style>

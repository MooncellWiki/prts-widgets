<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useId,
  useTemplateRef,
  watch,
} from "vue";

import {
  AkButton,
  AkButtonGroup,
  AkChip,
  AkSelect,
  AkSpinner,
} from "@mooncellwiki/prts-design-vue";
import {
  useEventListener,
  useIntersectionObserver,
  useResizeObserver,
} from "@vueuse/core";

import AnimList from "./components/AnimList.vue";
import ColorPicker from "./components/ColorPicker.vue";
import SvIcon from "./components/SvIcon.vue";
import Transport from "./components/Transport.vue";
import {
  FPS,
  defaultAnim,
  nextInChain,
  sortModels,
  sortSkins,
} from "./engine/anims";
import {
  Stage,
  type AnimInfo,
  type Loaded,
  type Rgba,
  type View,
} from "./engine/stage";

import type { SpineMeta } from "./types";

/**
 * 干员模型（PRTS Design 视觉，对应设计稿 /patterns/operator#干员模型）：
 * 选择条（时装 · 模型）→ 舞台 + 动作列表 → 时间轴 + 播放条。
 * .ak-* 是设计系统组件（样式来自皮肤 / skins.arknights.components），.sv-* 是查看器自己的排布（各组件的 scoped 样式）。
 */
const props = defineProps<{ conf: SpineMeta }>();

const BG = [
  { key: "dark", color: "#0f0f10", label: "深色" },
  { key: "light", color: "#f2f2f2", label: "浅色" },
  { key: "none", color: "", label: "透明" },
] as const;
type BgKey = (typeof BG)[number]["key"] | "custom";

/** 模型多于这个数就收进下拉选择（设计系统 Select 的用法：≤ 5 个、立即生效的视图切换用按钮组） */
const MODEL_MENU = 5;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/* ── 选择：时装 × 模型 ── */
const skins = sortSkins(Object.keys(props.conf.skin));
const modelsOf = (s: string) => sortModels(Object.keys(props.conf.skin[s]));
const skin = ref(skins[0]);
const model = ref(modelsOf(skins[0])[0]);
const models = computed(() => modelsOf(skin.value));
/* 干员只有 正面 / 背面 / 基建 几个，一组按钮一眼看全；敌人一套骨骼可以装几十个 skin（自走车 31 个），排成一行会撑出正文列 */
const modelOptions = computed(() =>
  models.value.length > MODEL_MENU
    ? models.value.map((m) => ({ label: m, value: m }))
    : null,
);

/* ── 播放状态 ── */
const cur = shallowRef<Loaded | null>(null);
const anim = shallowRef<AnimInfo | null>(null);
const t = ref(0);
const playing = ref(true);
const loop = ref(true);
const chain = ref(false);
const speed = ref(1);
const flip = ref(false);
const bg = ref<BgKey>("dark");
const color = ref("#18d1ff");
const max = ref(false);
/** 正在导出的 WebM 文件名 */
const recording = ref<string | null>(null);
/** 舞台上的遮罩：载入中 / 载入失败 */
const veil = ref<{ error: boolean; text: string } | null>(null);
const hud = ref({ file: "", info: "" });
/** 播放头扫过判定帧的次数：当 key 用，换一次重放闪烁动画 */
const hitN = ref(0);
/** 舞台视图的快照（地面线 / 缩放读数用）；平移缩放直接改 stage.view，画完再同步过来 */
const shown = ref<View & { pct: number }>({ x: 0, y: 0, z: 1, pct: 0 });

const canvas = useTemplateRef<HTMLCanvasElement>("canvas");
const stageEl = useTemplateRef<HTMLElement>("stageEl");
let stage: Stage | null = null;
let home: View = { x: 0, y: 0, z: 1 };

const canWebm =
  typeof MediaRecorder !== "undefined" &&
  typeof HTMLCanvasElement.prototype.captureStream === "function" &&
  MediaRecorder.isTypeSupported("video/webm");

/* ── 画一帧 + 同步界面 ── */
function paint() {
  const c = cur.value;
  if (!stage || !c) return;
  c.skeleton.scaleX = flip.value ? -1 : 1;
  stage.pose(anim.value?.anim ?? null, t.value);
  stage.draw();
  const v = stage.view;
  const pct = Math.round((v.z / home.z) * 100);
  const s = shown.value;
  if (s.x !== v.x || s.y !== v.y || s.z !== v.z || s.pct !== pct)
    shown.value = { ...v, pct };
}

function flash(a: AnimInfo, from: number, to: number) {
  if (
    a.events.some((e) => e.name === "OnAttack" && e.time > from && e.time <= to)
  )
    hitN.value++;
}

/* 只在播放中且看得见时跑 rAF；暂停后的改动（拖动 / 缩放 / 逐帧）各自 paint 一次 */
let raf = 0;
let last = 0;
let visible = true;
let onRecordEnd: (() => void) | null = null;
function schedule() {
  if (
    raf ||
    !cur.value ||
    !anim.value?.duration ||
    !playing.value ||
    veil.value ||
    (!visible && !recording.value) ||
    document.hidden
  )
    return;
  last = performance.now();
  raf = requestAnimationFrame((now) => {
    last = Math.min(last, now);
    tick(now);
  });
}
function tick(now: number) {
  raf = 0;
  const c = cur.value;
  const a = anim.value;
  if (!c || !a) return;
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (playing.value && a.duration) {
    const from = t.value;
    const to = from + dt * speed.value;
    if (to >= a.duration) {
      flash(a, from, a.duration);
      const nxt =
        chain.value && !recording.value
          ? nextInChain(c.anims, a, loop.value)
          : null;
      if (nxt) {
        setAnim(nxt.name, true);
        t.value = Math.min(to - a.duration, nxt.duration);
        flash(nxt, -1, t.value);
      } else if (recording.value) {
        t.value = a.duration;
        setPlaying(false);
        onRecordEnd?.();
      } else if (loop.value) {
        t.value = to % a.duration;
        flash(a, -1, t.value);
      } else {
        t.value = a.duration;
        setPlaying(false);
      }
    } else {
      t.value = to;
      flash(a, from, to);
    }
  }
  paint();
  schedule();
}
function stop() {
  cancelAnimationFrame(raf);
  raf = 0;
}

function setPlaying(on: boolean) {
  playing.value = on;
  if (!on) return;
  if (anim.value && t.value >= anim.value.duration) t.value = 0;
  schedule();
}
function seekTo(time: number) {
  if (!anim.value) return;
  setPlaying(false);
  t.value = clamp(time, 0, anim.value.duration);
  paint();
}
function step(d: number) {
  if (!anim.value) return;
  seekTo(clamp(Math.round(t.value * FPS) + d, 0, anim.value.frames) / FPS);
}

/* ── 动作：换段（连播）时保留时间，点选时从头播 ── */
function setAnim(name: string | undefined, keepTime = false) {
  const c = cur.value;
  if (!c) return;
  anim.value =
    c.anims.find((a) => a.name === name) ?? defaultAnim(c.anims) ?? null;
  if (!keepTime) {
    t.value = 0;
    setPlaying(true);
  }
  paint();
}

/* ── 取景：原点（脚底）落在舞台横向正中、纵向 80% 处，同一把尺（560 单位 = 舞台高）下各时装 / 模型大小可比；待机姿态装不下才缩 ── */
function fit() {
  const el = stageEl.value;
  if (!stage || !el) return;
  const r = el.getBoundingClientRect();
  stage.resize(r.width, r.height, Math.min(2, window.devicePixelRatio || 1));
}
function frame() {
  const c = cur.value;
  if (!stage || !c) return;
  const b = stage.bounds(defaultAnim(c.anims)?.anim ?? null);
  const { w, h } = stage;
  const pad = 16;
  const x = w / 2;
  const y = h * (model.value === "基建" ? 0.78 : 0.8);
  const z = Math.min(
    h / 560,
    (x - pad) / Math.max(1, -b.x0, b.x1),
    (y - pad) / Math.max(1, b.y1),
    (h - y - pad) / Math.max(1, -b.y0),
  );
  home = { x, y, z };
  Object.assign(stage.view, home);
}

/* ── 载入一个「时装 × 模型」：沿用同名动作（没有就回到待机），速度 / 循环 / 朝向 / 背景不变 ── */
let loadSeq = 0;
async function load() {
  if (!stage) return;
  const seq = ++loadSeq;
  const item = props.conf.skin[skin.value][model.value];
  veil.value = {
    error: false,
    text: `正在载入 ${skin.value} · ${model.value}`,
  };
  stop();
  let loaded: Loaded;
  try {
    loaded = await stage.load(
      `${skin.value}/${model.value}`,
      props.conf.prefix + item.file,
      item.skin,
    );
  } catch (err) {
    if (seq !== loadSeq) return;
    cur.value = stage.cur = null;
    anim.value = null;
    veil.value = {
      error: true,
      text: `模型载入失败：${err instanceof Error ? err.message : String(err)}`,
    };
    return;
  }
  if (seq !== loadSeq) return;
  cur.value = stage.cur = loaded;
  hud.value = {
    file: `${item.file.split("/").pop()}.skel`,
    info: `Spine ${loaded.data.version} · ${loaded.data.bones.length} bones`,
  };
  veil.value = null;
  fit();
  frame();
  setAnim(anim.value?.name);
}
function pickSkin(s: string) {
  if (s === skin.value) return;
  skin.value = s;
  if (!props.conf.skin[s][model.value]) model.value = modelsOf(s)[0];
  load();
}
function pickModel(m: string) {
  if (m === model.value) return;
  model.value = m;
  load();
}

/* ── 背景：底色由 CSS 铺（canvas 透明叠在上面），HUD 字色按底色明度给黑 / 白；导出时才把底色画进画布 ── */
const bgColor = computed(() =>
  bg.value === "custom"
    ? color.value
    : (BG.find((b) => b.key === bg.value)?.color ?? ""),
);
const stageStyle = computed(() => {
  const c = bgColor.value;
  const style: Record<string, string> = {
    "--sv-bg": c || "transparent",
    "--sv-z": shown.value.z.toFixed(3),
  };
  if (c) {
    const n = Number.parseInt(c.slice(1), 16);
    const lum =
      (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    style["--sv-ink"] = lum > 0.55 ? "0, 0, 0" : "255, 255, 255";
    style["--sv-shadow"] = lum > 0.3 ? "0, 0, 0" : "255, 255, 255";
  }
  return style;
});
function exportClear(): Rgba {
  const c = bgColor.value;
  if (!c) return [0, 0, 0, 0];
  const n = Number.parseInt(c.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
}
/* 自定义：点那一格先换回上次的自定义色，再开合取色面板；点面板外面 / Esc 关 */
const picking = ref(false);
const bgBox = useTemplateRef<HTMLElement>("bgBox");
const customBtn = useTemplateRef<HTMLButtonElement>("customBtn");
const pickerId = useId();
function onCustom() {
  bg.value = "custom";
  picking.value = !picking.value;
}
function onPick(hex: string) {
  color.value = hex;
  bg.value = "custom";
}
useEventListener(
  document,
  "pointerdown",
  (e: PointerEvent) => {
    if (picking.value && !bgBox.value?.contains(e.target as Node))
      picking.value = false;
  },
  { capture: true },
);

/* ── 导出：PNG = 当前帧；WebM = 当前动作从头播一遍（MediaRecorder 录画布）。背景选了颜色就带上，透明就是透明底 ── */
const fileName = (ext: string) =>
  [props.conf.name, skin.value, model.value, anim.value?.name].join("-") + ext;
function save(blob: Blob | null, name: string) {
  if (!blob) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportPng() {
  const el = canvas.value;
  if (!stage || !el) return;
  const name = fileName(`-f${Math.round(t.value * FPS)}.png`);
  stage.clear = exportClear();
  paint();
  // toBlob 在调用时就取下画布内容，紧接着把清屏色换回透明再画一遍不影响结果
  el.toBlob((b) => save(b, name));
  stage.clear = [0, 0, 0, 0];
  paint();
}
function exportWebm() {
  const el = canvas.value;
  if (!stage || !el || recording.value || !anim.value?.duration) return;
  const chunks: Blob[] = [];
  const mr = new MediaRecorder(el.captureStream(60), {
    mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm",
    videoBitsPerSecond: 8e6,
  });
  const name = fileName(`-x${speed.value}.webm`);
  mr.ondataavailable = (e) => chunks.push(e.data);
  mr.onstop = () => {
    save(new Blob(chunks, { type: "video/webm" }), name);
    recording.value = null;
    onRecordEnd = null;
    if (stage) stage.clear = [0, 0, 0, 0];
    t.value = 0;
    setPlaying(true);
  };
  recording.value = name;
  stage.clear = exportClear();
  // 多留几帧，别把最后一帧截掉
  onRecordEnd = () => setTimeout(() => mr.stop(), 120);
  t.value = 0;
  paint();
  mr.start();
  setPlaying(true);
}

/* ── 视图：翻转 / 复位 / 缩放 / 放大 ── */
function setFlip(on: boolean) {
  flip.value = on;
  paint();
}
function resetView() {
  if (!stage) return;
  Object.assign(stage.view, home);
  paint();
}
function zoomAt(cx: number, cy: number, k: number) {
  if (!stage) return;
  const v = stage.view;
  const z = clamp(v.z * k, home.z * 0.2, home.z * 8);
  v.x = cx - ((cx - v.x) * z) / v.z;
  v.y = cy - ((cy - v.y) * z) / v.z;
  v.z = z;
  paint();
}
/* 放大：整块铺满视口（不用 Fullscreen API——iOS 的 Safari 不给普通元素全屏），页面不滚；Esc 退出 */
watch(max, (on) => {
  document.documentElement.style.overflow = on ? "hidden" : "";
});
useEventListener(document, "keydown", (e: KeyboardEvent) => {
  if (e.key !== "Escape") return;
  // 先关取色面板（焦点在面板里就还给「自定义」那格），再退出放大
  if (picking.value) {
    if (bgBox.value?.contains(document.activeElement)) customBtn.value?.focus();
    picking.value = false;
  } else if (max.value) max.value = false;
});
const hint = computed(() =>
  max.value
    ? "拖拽移动 · 滚轮缩放 · 双击复位 · Esc 退出"
    : "拖拽移动 · Ctrl + 滚轮缩放 · 双击复位",
);

/* ── 舞台：单指 / 鼠标拖拽平移，双指捏合缩放，Ctrl / ⌘ + 滚轮（触控板捏合也是它）缩放；放大模式下滚轮直接缩放 ── */
const pts = new Map<number, [number, number]>();
let pinch = 0;
const dragging = ref(false);
function local(e: PointerEvent | WheelEvent): [number, number] {
  const r = canvas.value!.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}
function onPointerDown(e: PointerEvent) {
  if (!cur.value) return;
  canvas.value?.setPointerCapture(e.pointerId);
  pts.set(e.pointerId, local(e));
  dragging.value = true;
  pinch = 0;
}
function onPointerMove(e: PointerEvent) {
  const p = pts.get(e.pointerId);
  if (!p || !stage) return;
  const q = local(e);
  pts.set(e.pointerId, q);
  if (pts.size === 1) {
    stage.view.x += q[0] - p[0];
    stage.view.y += q[1] - p[1];
    paint();
    return;
  }
  const [a, b] = [...pts.values()];
  const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
  if (pinch) zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch);
  pinch = d;
}
function onPointerUp(e: PointerEvent) {
  pts.delete(e.pointerId);
  pinch = 0;
  if (!pts.size) dragging.value = false;
}
/* 没按 Ctrl 就滚轮：不劫持页面滚动，左下角的提示亮一下 */
const nudging = ref(false);
let nudgeTimer = 0;
useEventListener(
  canvas,
  "wheel",
  (e: WheelEvent) => {
    if (!cur.value) return;
    if (!(e.ctrlKey || e.metaKey || max.value)) {
      nudging.value = true;
      clearTimeout(nudgeTimer);
      nudgeTimer = window.setTimeout(() => (nudging.value = false), 900);
      return;
    }
    e.preventDefault();
    const [x, y] = local(e);
    zoomAt(x, y, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0025)));
  },
  { passive: false },
);
/* 键盘（舞台获得焦点后）：空格 播放 / 暂停，← → 逐帧，F 翻转，0 复位 */
function onKeydown(e: KeyboardEvent) {
  if (
    !cur.value ||
    e.target !== stageEl.value ||
    e.ctrlKey ||
    e.metaKey ||
    e.altKey
  )
    return;
  const k = e.key;
  if (k === " ") setPlaying(!playing.value);
  else if (k === "ArrowLeft") step(-1);
  else if (k === "ArrowRight") step(1);
  else if (k === "f" || k === "F") setFlip(!flip.value);
  else if (k === "0") resetView();
  else return;
  e.preventDefault();
}

/* ── 尺寸：画布跟着舞台走（换算成比例保住当前的平移缩放）；只在看得见时重绘 ── */
useResizeObserver(stageEl, () => {
  if (!stage || !cur.value) return;
  const v = stage.view;
  const was = stage.w
    ? { fx: v.x / stage.w, fy: v.y / stage.h, k: v.z / home.z }
    : null;
  fit();
  frame();
  if (was)
    Object.assign(stage.view, {
      x: was.fx * stage.w,
      y: was.fy * stage.h,
      z: was.k * home.z,
    });
  paint();
});
useIntersectionObserver(stageEl, ([entry]) => {
  visible = entry?.isIntersecting ?? true;
  schedule();
});
useEventListener(document, "visibilitychange", schedule);

onMounted(() => {
  if (!canvas.value) return;
  stage = new Stage(canvas.value);
  load();
});
onBeforeUnmount(() => {
  stop();
  clearTimeout(nudgeTimer);
  if (max.value) document.documentElement.style.overflow = "";
});
</script>

<template>
  <div :class="['sv', 'is-ready', { 'is-max': max }]">
    <div class="sv__bar">
      <div class="sv__field">
        <span class="ak-overline">时装</span>
        <div class="sv__chips" role="group" aria-label="时装">
          <AkChip
            v-for="s in skins"
            :key="s"
            :model-value="s === skin"
            @update:model-value="pickSkin(s)"
          >
            {{ s }}
          </AkChip>
        </div>
      </div>
      <div class="sv__field">
        <span class="ak-overline">模型</span>
        <AkSelect
          v-if="modelOptions"
          :model-value="model"
          size="sm"
          label="模型"
          :options="modelOptions"
          @update:model-value="pickModel(String($event))"
        />
        <AkButtonGroup v-else size="sm" label="模型">
          <AkButton
            v-for="m in models"
            :key="m"
            :class="{ 'is-active': m === model }"
            :aria-pressed="m === model"
            @click="pickModel(m)"
          >
            {{ m }}
          </AkButton>
        </AkButtonGroup>
      </div>
    </div>

    <div class="sv__main">
      <div
        ref="stageEl"
        class="sv__stage ak-bg-grid"
        tabindex="0"
        :data-bg="bg"
        :style="stageStyle"
        :aria-label="`${conf.name} 的 Spine 模型：空格 播放 / 暂停，← → 逐帧，F 翻转朝向，0 复位视图`"
        @keydown="onKeydown"
      >
        <canvas
          ref="canvas"
          :class="['sv__canvas', { 'is-dragging': dragging }]"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @dblclick="resetView"
        />
        <!-- 地面：脚底原点处一条线 + 一枚落脚点（游戏里战斗 / 基建小人脚下都有一枚 Shadow）。DOM 画的，不进导出 -->
        <div
          class="sv__ground"
          :style="{ transform: `translate(${shown.x}px, ${shown.y}px)` }"
        />
        <div class="sv__hud">
          <b>{{ hud.file }}</b>
          <span>{{ hud.info }}</span>
          <span :key="hitN" :class="['sv__hit', { 'is-on': hitN }]"
            >OnAttack</span
          >
        </div>
        <div class="sv__tools">
          <button
            type="button"
            class="sv__tool"
            :aria-pressed="flip"
            data-ak-tip="翻转朝向 (F)"
            aria-label="翻转朝向"
            @click="setFlip(!flip)"
          >
            <SvIcon name="flip" />
          </button>
          <button
            type="button"
            class="sv__tool"
            data-ak-tip="复位视图 (0)"
            aria-label="复位视图"
            @click="resetView"
          >
            <SvIcon name="reset" />
          </button>
          <button
            type="button"
            class="sv__tool"
            :aria-pressed="max"
            :data-ak-tip="max ? '退出放大 (Esc)' : '放大查看'"
            aria-label="放大查看"
            @click="max = !max"
          >
            <SvIcon :name="max ? 'min' : 'max'" />
          </button>
          <div class="sv__zoom">{{ shown.pct ? `${shown.pct}%` : "" }}</div>
        </div>
        <div ref="bgBox" class="sv__bg" role="group" aria-label="背景">
          <button
            v-for="b in BG"
            :key="b.key"
            type="button"
            class="sv__swatch"
            :data-bg="b.key"
            :style="{ '--_c': b.color }"
            :aria-pressed="bg === b.key"
            :title="`背景：${b.label}`"
            :aria-label="`背景：${b.label}`"
            @click="bg = b.key"
          />
          <button
            ref="customBtn"
            type="button"
            class="sv__swatch"
            data-bg="custom"
            :aria-pressed="bg === 'custom'"
            aria-haspopup="dialog"
            :aria-expanded="picking"
            :aria-controls="pickerId"
            title="背景：自定义"
            aria-label="背景：自定义"
            @click="onCustom"
          />
          <ColorPicker
            v-show="picking"
            :id="pickerId"
            :model-value="color"
            @update:model-value="onPick"
          />
        </div>
        <span :class="['sv__hint', { 'is-nudge': nudging }]">{{ hint }}</span>
        <div v-if="veil" class="sv__veil">
          <template v-if="veil.error">
            <span>{{ veil.text }}</span>
            <AkButton size="sm" @click="load">重试</AkButton>
          </template>
          <AkSpinner v-else :description="veil.text" />
        </div>
      </div>
      <AnimList
        :anims="cur?.anims ?? []"
        :active="anim?.name"
        @select="setAnim"
      />
    </div>

    <Transport
      v-model:loop="loop"
      v-model:chain="chain"
      v-model:speed="speed"
      :anim="anim"
      :t="t"
      :playing="playing"
      :can-webm="canWebm"
      @seek="seekTo"
      @step="step"
      @toggle="setPlaying(!playing)"
      @export="(kind) => (kind === 'png' ? exportPng() : exportWebm())"
    />
    <div v-if="recording" class="sv__rec">正在导出 {{ recording }}</div>
  </div>
</template>

<style scoped lang="scss">
@use "./frame";

.sv {
  @include frame.box;

  // 放大：整块铺满视口（不用 Fullscreen API——iOS 的 Safari 不给普通元素全屏），舞台吃掉剩余高度；Esc 退出
  &.is-max {
    position: fixed;
    inset: 0;
    z-index: calc(var(--ak-z-modal) + 1);
    margin: 0 !important;
    display: flex;
    flex-direction: column;
    border: 0;

    > .sv__main {
      flex: 1;
      height: auto;
      min-height: 0;
    }

    .sv__canvas {
      touch-action: none;
    }
  }
}

// 选择条：时装芯片 + 模型按钮组
.sv__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 20px;
  padding: 10px 14px;
  background: var(--ak-bg-surface-2);
  border-bottom: 1px solid var(--ak-border);
}

.sv__field {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;

  &:last-child {
    margin-left: auto;
  }

  // 模型多时的下拉选择：宽度随最长的名字，不撑满
  > .ak-select {
    width: auto;
    min-width: 0;
  }
}

.sv__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.sv__main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 272px;
  height: var(--sv-h);
}

.sv__stage {
  @include frame.stage;

  // 透明：棋盘格（两套主题同一副深色格，HUD 仍是白字），导出的 PNG / WebM 是透明底
  &[data-bg="none"] {
    background: repeating-conic-gradient(#27282b 0 25%, #1b1c1e 0 50%) 0 0 /
      20px 20px;
    --ak-grid-color: transparent;

    .sv__ground {
      display: none;
    }
  }

  &:focus-visible {
    box-shadow: inset 0 0 0 2px var(--ak-focus);
  }
}

// 手机上竖向滑动留给页面滚动；放大模式里才整块接管
.sv__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  cursor: grab;
  touch-action: pan-y;

  &.is-dragging {
    cursor: grabbing;
  }
}

// 地面：脚底原点处一条线 + 一枚椭圆影子。深底上是一枚淡亮的落脚点，浅底上是影子（--sv-shadow 随底色给）
.sv__ground {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  pointer-events: none;

  &::before {
    content: "";
    position: absolute;
    left: -100vw;
    right: -100vw;
    top: 0;
    border-top: 1px solid rgba(var(--sv-ink), 0.16);
  }

  &::after {
    content: "";
    position: absolute;
    left: calc(var(--sv-z, 1) * -70px);
    top: calc(var(--sv-z, 1) * -12px);
    width: calc(var(--sv-z, 1) * 140px);
    height: calc(var(--sv-z, 1) * 24px);
    border-radius: 50%;
    background: radial-gradient(
      closest-side,
      rgba(var(--sv-shadow, 255, 255, 255), 0.13) 60%,
      rgba(var(--sv-shadow, 255, 255, 255), 0)
    );
  }
}

.sv__hud {
  position: absolute;
  left: 12px;
  top: 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  pointer-events: none;
  font: 600 max(10px, var(--ak-fs-cjk-min)) / 1 var(--ak-font-label);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(var(--sv-ink), 0.5);

  b {
    font: 700 11px/1 var(--ak-font-mono);
    letter-spacing: 0;
    text-transform: none;
    color: rgba(var(--sv-ink), 0.78);
  }
}

// 播放头扫过判定帧时闪一下
.sv__hit {
  align-self: flex-start;
  padding: 3px 6px;
  background: var(--ak-accent-2);
  color: var(--ak-accent-2-fg);
  opacity: 0;

  &.is-on {
    animation: sv-hit 0.45s var(--ak-ease-out);
  }
}

@keyframes sv-hit {
  from {
    opacity: 1;
  }

  to {
    opacity: 0;
  }
}

.sv__tools {
  position: absolute;
  right: 10px;
  top: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sv__tool {
  all: unset;
  // all: unset 会把 [data-ak-tip] 的 position: relative 一起抹掉，提示就挂到整列工具上了，这里补回来
  position: relative;
  box-sizing: border-box;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  cursor: pointer;
  color: rgba(var(--sv-ink), 0.75);
  background: rgba(var(--sv-ink), 0.08);
  border: 1px solid rgba(var(--sv-ink), 0.14);

  &:hover {
    color: rgb(var(--sv-ink));
    background: rgba(var(--sv-ink), 0.16);
  }

  &[aria-pressed="true"] {
    background: var(--ak-accent);
    border-color: var(--ak-accent);
    color: var(--ak-accent-fg);
  }

  &:focus-visible {
    outline: 2px solid var(--ak-focus);
    outline-offset: 2px;
  }

  // 提示朝左出：按钮贴着舞台右缘
  &[data-ak-tip]::after {
    left: auto;
    right: calc(100% + 6px);
    bottom: auto;
    top: 50%;
    transform: translate(4px, -50%);
  }

  &[data-ak-tip]:hover::after,
  &[data-ak-tip]:focus-visible::after {
    transform: translate(0, -50%);
  }

  > svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }
}

.sv__zoom {
  text-align: center;
  font: 700 10px/1 var(--ak-font-label);
  color: rgba(var(--sv-ink), 0.5);
  padding-top: 2px;
  font-variant-numeric: tabular-nums;
}

// 背景：深 / 浅 / 透明 / 自定义（自定义那格开合取色面板 ColorPicker）
.sv__bg {
  position: absolute;
  right: 10px;
  bottom: 10px;
  display: flex;
  align-items: center;
  gap: 5px;
}

.sv__swatch {
  all: unset;
  box-sizing: border-box;
  width: 20px;
  height: 20px;
  cursor: pointer;
  background: var(--_c);
  border: 1px solid rgba(var(--sv-ink), 0.35);
  position: relative;
  overflow: hidden;

  &[data-bg="none"] {
    background: repeating-conic-gradient(#bbb 0 25%, #fff 0 50%) 0 0 / 10px 10px;
  }

  &[data-bg="custom"] {
    background: conic-gradient(#f33, #fc0, #3c3, #0cf, #63f, #f33);
  }

  &[aria-pressed="true"] {
    outline: 2px solid var(--ak-accent);
    outline-offset: 1px;
  }

  &:focus-visible {
    outline: 2px solid var(--ak-focus);
    outline-offset: 1px;
  }
}

.sv__hint {
  @include frame.hint;
  transition: color var(--ak-dur-fast);

  // 没按 Ctrl 就滚轮：提示亮一下，页面照常滚动
  &.is-nudge {
    color: var(--ak-accent-2);
  }
}

.sv__veil {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 12px;
  text-align: center;
  background: var(--sv-bg, #0f0f10);
  color: rgba(255, 255, 255, 0.7);
  font-size: var(--ak-fs-sm);
}

.sv__rec {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: var(--ak-fs-sm);
}

// 手机上顺序改成 选择条 → 舞台 → 时间轴 / 播放条 → 动作列表：播放条贴着舞台（动作列表的 order 在 AnimList 里）
@media (max-width: 767px) {
  .sv {
    --sv-h: auto;
    display: flex;
    flex-direction: column;
  }

  .sv__field:last-child {
    margin-left: 0;
  }

  .sv__main {
    display: contents;
  }

  .sv__stage {
    height: min(86vw, 360px);
  }

  .sv__hint {
    display: none;
  }

  .sv.is-max .sv__stage {
    flex: 1;
    height: auto;
    min-height: 0;
  }
}
</style>

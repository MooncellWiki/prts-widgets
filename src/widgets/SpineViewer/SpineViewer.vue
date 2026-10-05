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
  useMutationObserver,
  usePreferredDark,
  useResizeObserver,
} from "@vueuse/core";

import AnimList from "./components/AnimList.vue";
import ColorPicker from "./components/ColorPicker.vue";
import SvIcon from "./components/SvIcon.vue";
import Transport from "./components/Transport.vue";
import {
  FPS,
  chainMembers,
  defaultAnim,
  nextInChain,
  sortModels,
  sortSkins,
} from "./engine/anims";
import {
  GIF_SCALE,
  canvasReader,
  encodeGif,
  planGif,
  type GifKind,
} from "./engine/gif";
import {
  EXPORT,
  RULER,
  Stage,
  type AnimInfo,
  type Box,
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
/** 舞台网格线（CSS 铺的，不进导出）；默认关 */
const grid = ref(false);
/*
 * 背景没手动选过就跟页面：Arknights 皮肤上白天浅色、夜间深色——看令牌解析出来的 color-scheme，
 * 夜间模式的几种开法（clientpref 类、data-theme、跟随系统）都认，切了不用刷新；别的皮肤（旧版）固定浅色
 */
const ARKNIGHTS = document.body.classList.contains("skin-arknights");
const night = ref(false);
function syncNight() {
  night.value =
    ARKNIGHTS &&
    getComputedStyle(document.documentElement).colorScheme === "dark";
}
syncNight();
if (ARKNIGHTS) {
  useMutationObserver(document.documentElement, syncNight, {
    attributeFilter: ["class", "data-theme"],
  });
  watch(usePreferredDark(), syncNight);
}
const picked = ref<BgKey | null>(null);
const bg = computed<BgKey>({
  get: () => picked.value ?? (night.value ? "dark" : "light"),
  set: (key) => (picked.value = key),
});
const color = ref("#18d1ff");
const max = ref(false);
/** 正在导出的 WebM / GIF 文件名 */
const recording = ref<string | null>(null);
/** 导出遮罩上文件名后面的一句：GIF 的进度 / 出错 */
const recNote = ref("");
/** 舞台上的遮罩：载入中 / 载入失败 */
const veil = ref<{ error: boolean; text: string } | null>(null);
const hud = ref({ file: "", info: "" });
/** 播放头扫过判定帧的次数：当 key 用，换一次重放闪烁动画 */
const hitN = ref(0);
/** 舞台视图的快照（地面线 / 缩放读数用）；平移缩放直接改 stage.view，画完再同步过来 */
const shown = ref<View & { pct: number }>({ x: 0, y: 0, z: 1, pct: 0 });
/** 取景框（导出的范围）；cut = 舞台不是正方形（放大 / 手机横屏），要把框画出来 */
const crop = ref<Box & { cut: boolean }>({ x: 0, y: 0, s: 0, cut: false });

const canvas = useTemplateRef<HTMLCanvasElement>("canvas");
const stageEl = useTemplateRef<HTMLElement>("stageEl");
const root = useTemplateRef<HTMLElement>("root");
let stage: Stage | null = null;
let home: View = { x: 0, y: 0, z: 1 };
/** 拖过 / 缩放过：换动作时不再替人取景，双击复位才回到 home */
let custom = false;

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
  // 100% = 取景框 1000 单位的那把尺；动作太大自动缩小时这里会小于 100%
  const { s: side } = stage.box;
  const pct = side ? Math.round(((v.z * RULER) / side) * 100) : 0;
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
function running() {
  return !!(
    cur.value &&
    anim.value?.duration &&
    playing.value &&
    !veil.value &&
    (visible || recording.value) &&
    !document.hidden
  );
}
/* 起播 / 恢复：停着的那段时间不算，从现在起计时 */
function schedule() {
  if (raf || !running()) return;
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
  // 接着播不能走 schedule()：它会把 last 挪到画完之后，这一帧的耗时就不算进动画时间，机器越慢播得越慢
  if (running()) raf = requestAnimationFrame(tick);
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

/* ── 动作：换段（连播）时保留时间和取景，点选时从头播、重新取景 ── */
function setAnim(name: string | undefined, keepTime = false) {
  const c = cur.value;
  if (!c) return;
  anim.value =
    c.anims.find((a) => a.name === name) ?? defaultAnim(c.anims) ?? null;
  if (!keepTime) {
    rehome();
    t.value = 0;
    setPlaying(true);
  }
  paint();
}

/* ── 取景框：舞台正中的正方形（舞台本身就是正方形，放大 / 手机横屏时才比舞台小），导出的就是它 ── */
function fit() {
  const el = stageEl.value;
  if (!stage || !el) return;
  const r = el.getBoundingClientRect();
  stage.resize(r.width, r.height, Math.min(2, window.devicePixelRatio || 1));
  crop.value = { ...stage.box, cut: Math.abs(r.width - r.height) > 1 };
}
/*
 * 取景：框边长 = 1000 骨骼单位（同旧版），原点（脚底）在框里横向正中、纵向 80% 处，各时装 / 模型大小可比。
 * 当前动作（连同一招的另几段，连播时不跳）全程在这把尺下出框就先平移，平移也装不下才缩小
 */
const PAD = 0.03;
function aim(): View {
  const c = cur.value!;
  const { x: X, y: Y, s } = stage!.box;
  const p = s * PAD;
  const list = anim.value ? chainMembers(c.anims, anim.value) : [];
  const b = (list.length ? list : [null])
    .map((a) => stage!.bounds(a?.anim ?? null))
    .reduce((u, b) => ({
      x0: Math.min(u.x0, b.x0),
      y0: Math.min(u.y0, b.y0),
      x1: Math.max(u.x1, b.x1),
      y1: Math.max(u.y1, b.y1),
    }));
  const [x0, x1] = flip.value ? [-b.x1, -b.x0] : [b.x0, b.x1];
  const z = Math.min(
    s / RULER,
    (s - 2 * p) / (x1 - x0),
    (s - 2 * p) / Math.max(1, b.y1 - b.y0),
  );
  return {
    x: clamp(X + s / 2, X + p - x0 * z, X + s - p - x1 * z),
    y: clamp(
      Y + s * (model.value === "基建" ? 0.78 : 0.8),
      Y + p + b.y1 * z,
      Y + s - p + b.y0 * z,
    ),
    z,
  };
}
/* 换动作 / 翻转后重算 home；拖过、缩放过就只记下，不动当前视图 */
function rehome() {
  if (!stage || !cur.value) return;
  home = aim();
  if (!custom) Object.assign(stage.view, home);
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
  custom = false;
  fit();
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
  stage.setOut(EXPORT);
  paint();
  // toBlob 在调用时就取下画布内容，紧接着换回整块舞台、透明清屏再画一遍不影响结果
  el.toBlob((b) => save(b, name));
  stage.setOut(0);
  stage.clear = [0, 0, 0, 0];
  paint();
}
function exportWebm() {
  const el = canvas.value;
  if (!stage || !el || recording.value || !anim.value?.duration) return;
  const chunks: Blob[] = [];
  // 录制期间画布只画取景框、EXPORT 见方（模板里把画布挪到框上，免得被拉伸）
  stage.setOut(EXPORT);
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
    if (stage) {
      stage.clear = [0, 0, 0, 0];
      stage.setOut(0);
    }
    t.value = 0;
    paint();
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
/*
 * GIF：当前动作逐帧画进取景框、读回来编码（engine/gif.ts），按所选速度；「循环」开着就一直循环，关了播一遍停在最后一帧。
 * 不走 rAF，导完回到导出前的那一帧和播放状态。透明底只有全透明 / 不透明两档，照样导，播放条下面有提示
 */
async function exportGif(kind: GifKind) {
  const el = canvas.value;
  const a = anim.value;
  if (!stage || !el || recording.value || !a?.duration) return;
  const size = EXPORT * GIF_SCALE[kind];
  const name = fileName(`-x${speed.value}${kind === "gif2x" ? "@2x" : ""}.gif`);
  const was = { t: t.value, playing: playing.value };
  stop();
  setPlaying(false);
  recording.value = name;
  recNote.value = "";
  stage.clear = exportClear();
  stage.setOut(size);
  const read = canvasReader(el, size);
  try {
    const gif = await encodeGif({
      size,
      plan: planGif(a.frames, speed.value, loop.value),
      loop: loop.value,
      transparent: !bgColor.value,
      grab: (f) => {
        t.value = f / FPS;
        paint();
        return read();
      },
      onProgress: (done, total) => (recNote.value = `${done} / ${total} 帧`),
    });
    save(gif, name);
  } catch (err) {
    recNote.value = `导出失败：${err instanceof Error ? err.message : String(err)}`;
    await new Promise((r) => setTimeout(r, 2500));
  }
  recording.value = null;
  recNote.value = "";
  stage.clear = [0, 0, 0, 0];
  stage.setOut(0);
  t.value = was.t;
  paint();
  if (was.playing) setPlaying(true);
}
function onExport(kind: "png" | "webm" | GifKind) {
  if (kind === "png") exportPng();
  else if (kind === "webm") exportWebm();
  else exportGif(kind);
}

/* ── 视图：翻转 / 复位 / 缩放 / 放大 ── */
function setFlip(on: boolean) {
  flip.value = on;
  rehome();
  paint();
}
function resetView() {
  if (!stage) return;
  custom = false;
  Object.assign(stage.view, home);
  paint();
}
function zoomAt(cx: number, cy: number, k: number) {
  if (!stage) return;
  custom = true;
  const v = stage.view;
  const u = stage.box.s / RULER;
  const z = clamp(v.z * k, u * 0.2, u * 8);
  v.x = cx - ((cx - v.x) * z) / v.z;
  v.y = cy - ((cy - v.y) * z) / v.z;
  v.z = z;
  paint();
}
/*
 * 放大：整块铺满视口（不用 Fullscreen API——iOS 的 Safari 不给普通元素全屏），页面不滚；Esc 退出。
 * 支持 Popover API 的浏览器再把它提进顶层（top layer）：Vector 的 #bodyContent 是 z-index: 0 的层叠上下文，
 * 里面的 fixed 元素 z-index 再大也盖不过侧栏和「TOP」按钮；顶层不受祖先层叠上下文管，继承仍跟着 DOM 走（令牌、主题不丢）。
 * 进不了顶层的旧浏览器：放大期间把会盖上来的侧栏（#mw-panel，MenuSidebar 在里面）和「TOP」按钮（.backToTop）藏起来，退出再放回
 */
const COVERS = "#mw-panel, .backToTop";
let covered: [HTMLElement, string, string][] = [];
function hideCovers(on: boolean) {
  for (const [e, v, p] of covered) e.style.setProperty("visibility", v, p);
  covered = [];
  if (!on) return;
  // 用 visibility 而不是 display：TOP 按钮的小工具滚动时会自己改 display，放回时不跟它抢
  for (const e of document.querySelectorAll<HTMLElement>(COVERS)) {
    covered.push([
      e,
      e.style.getPropertyValue("visibility"),
      e.style.getPropertyPriority("visibility"),
    ]);
    e.style.setProperty("visibility", "hidden", "important");
  }
}
watch(
  max,
  (on) => {
    document.documentElement.style.overflow = on ? "hidden" : "";
    const el = root.value;
    if (!el) return;
    if (!("showPopover" in el)) {
      hideCovers(on);
      return;
    }
    if (on) {
      el.popover = "manual";
      el.showPopover();
    } else {
      // 去掉属性浏览器就把它撤出顶层，回到正文里
      el.removeAttribute("popover");
    }
  },
  { flush: "post" },
);
useEventListener(document, "keydown", (e: KeyboardEvent) => {
  if (e.key !== "Escape") return;
  // 先关取色面板（焦点在面板里就还给「自定义」那格），再退出放大
  if (picking.value) {
    if (bgBox.value?.contains(document.activeElement)) customBtn.value?.focus();
    picking.value = false;
  } else if (max.value) max.value = false;
});
const cropStyle = computed(() => ({
  left: `${crop.value.x}px`,
  top: `${crop.value.y}px`,
  width: `${crop.value.s}px`,
  height: `${crop.value.s}px`,
}));
const hint = computed(() =>
  max.value
    ? `拖拽移动 / 滚轮缩放 / 双击复位 / Esc 退出${crop.value.cut ? " · 框内为导出画面预览" : ""}`
    : "拖拽移动 / Ctrl + 滚轮缩放 / 双击复位",
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
    custom = true;
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
/* 没按 Ctrl 就滚轮：不劫持页面滚动 */
useEventListener(
  canvas,
  "wheel",
  (e: WheelEvent) => {
    if (!cur.value || !(e.ctrlKey || e.metaKey || max.value)) return;
    e.preventDefault();
    const [x, y] = local(e);
    zoomAt(x, y, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0025)));
  },
  { passive: false },
);
/* 键盘（舞台获得焦点后）：空格 播放 / 暂停，← → 逐帧，F 翻转，G 网格线，0 复位。导出中不接（遮罩只挡得住指针），免得改到正在出的画面 */
function onKeydown(e: KeyboardEvent) {
  if (
    !cur.value ||
    recording.value ||
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
  else if (k === "g" || k === "G") grid.value = !grid.value;
  else if (k === "0") resetView();
  else return;
  e.preventDefault();
}

/* ── 尺寸：画布跟着舞台走；平移缩放按取景框换算成比例保住（框里的构图不变，进出放大也是）；只在看得见时重绘 ── */
useResizeObserver(stageEl, () => {
  if (!stage || !cur.value) return;
  const v = stage.view;
  const b = stage.box;
  const was = b.s
    ? { fx: (v.x - b.x) / b.s, fy: (v.y - b.y) / b.s, k: v.z / b.s }
    : null;
  fit();
  home = aim();
  const n = stage.box;
  Object.assign(
    stage.view,
    was
      ? { x: n.x + was.fx * n.s, y: n.y + was.fy * n.s, z: was.k * n.s }
      : home,
  );
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
  if (max.value) document.documentElement.style.overflow = "";
  hideCovers(false);
});
</script>

<template>
  <div ref="root" :class="['sv', 'is-ready', { 'is-max': max }]">
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
        :class="['sv__stage', { 'ak-bg-grid': grid }]"
        tabindex="0"
        :data-bg="bg"
        :style="stageStyle"
        :aria-label="`${conf.name} 的 Spine 模型：空格 播放 / 暂停，← → 逐帧，F 翻转朝向，G 网格线，0 复位视图`"
        @keydown="onKeydown"
      >
        <canvas
          ref="canvas"
          :class="['sv__canvas', { 'is-dragging': dragging }]"
          :style="recording ? cropStyle : undefined"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @dblclick="resetView"
        />
        <!-- 地面：一枚落脚点（游戏里战斗 / 基建小人脚下都有一枚 Shadow），开着网格线时脚底原点处再加一条线。DOM 画的，不进导出 -->
        <div
          :class="['sv__ground', { 'has-line': grid }]"
          :style="{ transform: `translate(${shown.x}px, ${shown.y}px)` }"
        />
        <!-- 取景框：舞台不是正方形时把导出范围框出来、框外压暗。同样不进导出 -->
        <div v-if="crop.cut" class="sv__crop" :style="cropStyle" />
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
            :aria-pressed="grid"
            data-ak-tip="网格线 (G)"
            aria-label="网格线"
            @click="grid = !grid"
          >
            <SvIcon name="grid" />
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
        <span class="sv__hint">{{ hint }}</span>
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
      :transparent="!bgColor"
      @seek="seekTo"
      @step="step"
      @toggle="setPlaying(!playing)"
      @export="onExport"
    />
    <div v-if="recording" class="sv__rec">
      正在导出 {{ recording }}{{ recNote && ` · ${recNote}` }}
    </div>
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
    // 顶层里是 [popover]：盖掉浏览器给它的 fit-content 尺寸、内边距、滚动和 CanvasText 字色
    width: auto;
    height: auto;
    padding: 0;
    overflow: visible;
    color: inherit;

    > .sv__main {
      flex: 1;
      min-height: 0;
      grid-template-columns: minmax(0, 1fr) 272px;
    }

    .sv__stage {
      aspect-ratio: auto;
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

// 舞台是正方形（导出也是这个画幅），边长随正文列宽、最大 560；动作列表吃掉剩下的宽度，高度跟舞台齐
.sv__main {
  display: grid;
  grid-template-columns: minmax(0, 560px) minmax(272px, 1fr);

  // 列表不参与撑高：行高只由舞台定，列表拉伸到同高、自己滚动
  > .sv__list {
    contain: size;
  }
}

.sv__stage {
  @include frame.stage;
  aspect-ratio: 1;

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

// 取景框：舞台不是正方形时才有（放大 / 手机横屏），框外压暗
.sv__crop {
  position: absolute;
  pointer-events: none;
  box-shadow:
    0 0 0 1px rgba(var(--sv-ink), 0.28),
    0 0 0 100vmax rgba(0, 0, 0, 0.28);
}

// 地面：脚底原点处一条线 + 一枚椭圆影子。深底上是一枚淡亮的落脚点，浅底上是影子（--sv-shadow 随底色给）
.sv__ground {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  pointer-events: none;

  // 地面线跟网格线一起开关
  &.has-line::before {
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
    display: flex;
    flex-direction: column;
  }

  .sv__field:last-child {
    margin-left: 0;
  }

  .sv__main {
    display: contents;

    > .sv__list {
      contain: none;
    }
  }

  // 正方形，横屏时高度封顶（这时取景框比舞台窄，会框出来）
  .sv__stage {
    max-height: 75vh;
  }

  .sv__hint {
    display: none;
  }

  .sv.is-max .sv__stage {
    flex: 1;
    min-height: 0;
    max-height: none;
  }
}
</style>

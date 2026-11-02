<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
} from "vue";

import {
  FileDownloadOutlined as ExportIcon,
  FullscreenExitOutlined as FullscreenExitIcon,
  FullscreenOutlined as FullscreenIcon,
  FeedbackOutlined as FeedbackIcon,
  SubjectFilled as LogAllIcon,
  PlayArrowFilled as PlayArrowIcon,
  SkipNextFilled as SkipNextIcon,
} from "@vicons/material";
import {
  NButton,
  NButtonGroup,
  NCard,
  NConfigProvider,
  NIcon,
  NAlert,
  NSelect,
  NSpace,
  NSpin,
  NText,
} from "naive-ui";

import { useTheme } from "@/utils/theme";

import AssetListModal from "./components/AssetListModal.vue";
import LogAllPanel from "./components/LogAllPanel.vue";
import { loadContextByScript, type Context } from "./context";
import { createStoryPlayer } from "./engine/createStoryPlayer";
import { preloadDialogFont } from "./engine/font";
import {
  analyzeStoryFlow,
  buildLogAll,
  buildLogDocument,
  planChoicesForLine,
  type LogDocument,
  type StoryFlowResult,
} from "./engine/log";
import { parseStory } from "./engine/parser";
import {
  collectContextAssetManifest,
  preloadContextAssets,
  type StoryCharacterFaceAsset,
} from "./engine/preload";

import type {
  AutoPlayMode,
  LineSeekUpdate,
  PlayerState,
  RuntimeChoiceSelection,
  StoryPlayer,
} from "./engine/types";

const props = defineProps<{
  /** 剧情 txt 全文，由页面内嵌的 #datas_txt 提供 */
  script: string;
  /** 创建后跳过 lobby 直接加载资源并开始播放（独立调试页用，宿主页不传） */
  autoStart?: boolean;
}>();

const { theme, themeOverrides } = useTheme();

const hostRef = ref<HTMLElement | null>(null);
const fullscreenRootRef = ref<HTMLElement | null>(null);
const isFullscreen = ref(false);
const fullscreenEnabled = document.fullscreenEnabled;
const isPreloading = ref(false);
const preloadError = ref<string | null>(null);
const preloadProgress = ref(0);
const preloadReady = ref(false);
const canSkipNode = ref(false);
const state = ref<PlayerState>("idle");
const autoPlayMode = ref<AutoPlayMode>("default");
// theater 期间原生隐藏 HUD，模式与速度归剧情接管
const theaterMode = ref(false);
const buttonSpeedLevel = ref(0);
const quickSpeedLevel = ref(0);
const preloadPercent = computed(() => Math.round(preloadProgress.value * 100));
const viewMode = ref<"lobby" | "text" | "player">("lobby");
// 旧版播放器接管后整个组件 UI 都要让位，没有返回入口
const legacyPlayerActive = ref(false);

const showLogAll = ref(false);
// 文档包含 ConditionStore 类实例且只整体替换，用 shallowRef 避免深层解包
const logAllDocument = shallowRef<LogDocument>(buildLogAll([]));
const logAllActiveLineIndex = ref<number | null>(null);
const logAllSelections = ref<RuntimeChoiceSelection[]>([]);
// 行点击跳转（Log All 快进）：文档不含 emissions，planChoicesForLine 需要
// 完整符号分析产物，openLogAll 时与文档同源存一份；同样含 ConditionStore
// 实例且只整体替换，shallowRef 约定同上
const logAllFlow = shallowRef<StoryFlowResult | null>(null);

/** Log All 行跳转状态条（浮在播放器上）；null = 不显示 */
interface LogSeekNotice {
  phase: "arming" | "seeking" | "reached" | "missed" | "aborted" | "error";
  message: string;
  target: number;
  /** 符号分析退化过：方案可能不准，需要提示 */
  degraded: boolean;
}

const logSeekNotice = shallowRef<LogSeekNotice | null>(null);
const logSeekActive = computed(
  () =>
    logSeekNotice.value?.phase === "arming" ||
    logSeekNotice.value?.phase === "seeking",
);
const logSeekTitle = computed(() => {
  const notice = logSeekNotice.value;
  if (!notice) return "";
  return notice.phase === "seeking"
    ? `快速播放中：当前 L${logAllActiveLineIndex.value ?? "?"} → 目标 L${notice.target}`
    : notice.message;
});
// onLogAllSeekLine 重建播放器期间挂起的跳转（重建完成即武装）
let pendingLineSeek: { choices: Map<number, number>; target: number } | null =
  null;
// 引擎侧进行中跳转的取消句柄；null = 未武装/已终态
let cancelLineSeek: (() => void) | null = null;
let noticeDismissTimer: ReturnType<typeof setTimeout> | null = null;
const showAssetList = ref(false);
const assetUrls = ref<string[]>([]);
const characterFaceAssets = ref<StoryCharacterFaceAsset[]>([]);

let player: StoryPlayer | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let context: Context | null = null;
const scriptText = ref<string | null>(props.script || null);
const hasScript = computed(() => Boolean(scriptText.value));

const controlsDisabled = computed(
  () =>
    !preloadReady.value ||
    state.value === "finished" ||
    state.value === "error",
);

// 推进只在这两个状态下有效：runtime.advance() 在 running / waiting_timer /
// waiting_video / waiting_decision 下不推进，只按 native OnClickPress 把自动
// 播放模式重置为手动。播放器没有暂停语义（native 的 AVG 全靠点击驱动），
// 所以这个按钮只表达"推进"。
const canAdvance = computed(
  () =>
    preloadReady.value &&
    (state.value === "idle" || state.value === "waiting_input"),
);

// Native OnSkipBtnClicked（2.7.61 反编译 0x183e16ee0）在 quick_play 模式下忽略
// 跳过点击；runtime.skipNode() 已按此兜底，这里同步禁用按钮，避免出现可点但
// 无响应的控件。canSkipNode 本身已按 native 按钮可见性门控（2.7.81
// _UpdateSkipStatus 0x183F934E0：isRunning && story.isSkippable &&
// CheckIfSkippableInCurMode），nofirstskip 首通段内为 false。
const canSkipStory = computed(
  () => canSkipNode.value && autoPlayMode.value !== "quick_play",
);

const currentSpeedLevel = computed(() =>
  autoPlayMode.value === "quick_play"
    ? quickSpeedLevel.value
    : buttonSpeedLevel.value,
);

const speedOptions = computed(() => {
  const count = autoPlayMode.value === "quick_play" ? 4 : 3;
  return Array.from({ length: count }, (_, index) => ({
    label: `${index + 1} 档`,
    value: index,
  }));
});

const playModeOptions: ReadonlyArray<{ label: string; value: AutoPlayMode }> = [
  { label: "手动", value: "default" },
  { label: "自动", value: "button_auto" },
  { label: "快速", value: "quick_play" },
];

function syncState(): void {
  state.value = player?.getState() ?? "idle";
  canSkipNode.value = player?.canSkipNode() ?? false;
  theaterMode.value = player?.isTheaterMode() ?? false;
  const autoPlay = player?.getAutoPlayState();
  if (autoPlay) {
    autoPlayMode.value = autoPlay.mode;
    buttonSpeedLevel.value = autoPlay.buttonSpeedLevel;
    quickSpeedLevel.value = autoPlay.quickSpeedLevel;
  }
  const position = player?.getLogPosition();
  // syncState 每 80ms 跑一次；直接赋新数组会让 Log All 整表重渲染，
  // 内容没变就保留原引用
  const selections = position?.selections ?? [];
  if (!sameSelections(selections, logAllSelections.value))
    logAllSelections.value = selections;
}

function sameSelections(
  left: readonly RuntimeChoiceSelection[],
  right: readonly RuntimeChoiceSelection[],
): boolean {
  return (
    left.length === right.length &&
    left.every((selection, index) => {
      const other = right[index]!;
      return (
        selection.decisionId === other.decisionId &&
        selection.optionIndex === other.optionIndex
      );
    })
  );
}

function openLogAll(): void {
  if (!scriptText.value) return;
  if (viewMode.value === "lobby") viewMode.value = "text";
  // 打开弹窗时关掉自动播放，方便玩家在弹窗里对照当前显示的句子
  if (autoPlayMode.value !== "default") {
    player?.setAutoPlayMode("default");
    syncState();
  }
  const flow = analyzeStoryFlow(
    parseStory(scriptText.value).lines,
    context?.audioVariables,
  );
  logAllFlow.value = flow;
  logAllDocument.value = buildLogDocument(flow);
  showLogAll.value = true;
}

/**
 * Log All 行点击 → 快进到该行（与调试页同一套编排）：planChoicesForLine
 * 求选择方案 → 从头重建播放器（方案以脚本起点为前提；已就绪的资源在
 * PIXI 缓存里，二次预载很快）→ 引擎侧 seekToLine 以 quick 最高档推进，
 * 到达/播完/人工干预由引擎推终态。
 */
async function onLogAllSeekLine(target: number): Promise<void> {
  const flow = logAllFlow.value;
  if (!flow || !scriptText.value) return;
  if (isPreloading.value) {
    logSeekNotice.value = {
      degraded: false,
      message: "资源正在加载，稍后再试",
      phase: "error",
      target,
    };
    return;
  }

  const plan = planChoicesForLine(flow, target);
  if (!plan.ok) {
    logSeekNotice.value = {
      degraded: false,
      message: `第 ${target} 行不在可显示文本里，无法跳转`,
      phase: "error",
      target,
    };
    return;
  }

  try {
    teardownLineSeek();
    pendingLineSeek = { choices: plan.plan.choices, target };
    logSeekNotice.value = {
      degraded: plan.plan.degraded,
      message: "正在重建播放器…",
      phase: "arming",
      target,
    };
    viewMode.value = "player";
    showLogAll.value = false;
    // text 视图过来的路径播放器宿主还没挂出来，先等一帧
    await nextTick();
    player?.destroy();
    player = null;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    // initAndPreload 自己不抛错（失败落到 preloadError），try/catch 罩的是
    // 武装/起播阶段的意外异常
    const rebuilt = await initAndPreload();
    const pending = pendingLineSeek;
    pendingLineSeek = null;
    if (!pending) return;
    if (!rebuilt || !preloadReady.value) {
      logSeekNotice.value = {
        degraded: logSeekNotice.value?.degraded ?? false,
        message: `播放器未能就绪（${preloadError.value ?? "资源加载失败"}），跳转已取消`,
        phase: "error",
        target,
      };
      return;
    }
    cancelLineSeek = rebuilt.seekToLine(
      pending.target,
      pending.choices,
      onLineSeekUpdate,
    );
    // quick 模式自己不会从 idle 起播，补一脚 start；waiting_input 时
    // enterQuickSeekMode 已在引擎里直接推进
    if (rebuilt.getState() === "idle") await rebuilt.start();
    syncState();
  } catch (error) {
    pendingLineSeek = null;
    logSeekNotice.value = {
      degraded: false,
      message: `跳转失败：${error instanceof Error ? error.message : String(error)}`,
      phase: "error",
      target,
    };
  }
}

/** 引擎跳转推送 → 状态条；reached 稍候自动隐去，其余终态手动关 */
function onLineSeekUpdate(update: LineSeekUpdate): void {
  const notice = logSeekNotice.value;
  // 已被手动取消/重置，丢弃迟到通知
  if (!notice || !logSeekActive.value) return;
  if (update.phase === "seeking") {
    if (notice.phase !== "seeking")
      logSeekNotice.value = {
        ...notice,
        message: "快速播放中，自动选择分支…",
        phase: "seeking",
      };
    return;
  }
  cancelLineSeek = null;
  logSeekNotice.value = {
    ...notice,
    message: lineSeekFinishMessage(update),
    phase: update.phase,
  };
  if (update.phase === "reached") scheduleNoticeDismiss(4000);
}

function lineSeekFinishMessage(update: LineSeekUpdate): string {
  switch (update.phase) {
    case "reached": {
      return `已到达第 ${update.target} 行`;
    }
    case "missed": {
      return update.reason === "error"
        ? `播放出错，未经过第 ${update.target} 行`
        : `播放已结束，未经过第 ${update.target} 行`;
    }
    case "aborted": {
      return "已手动切换播放模式，中止跳转";
    }
    default: {
      return "";
    }
  }
}

/** 状态条上的「取消跳转」：先静默摘掉引擎侧编排再切回手动，seekToLine
 *  把播放器推到了 quick 最高档，只摘策略的话剧情会继续狂奔 */
function cancelLogAllSeek(): void {
  const armed = cancelLineSeek !== null;
  const notice = logSeekNotice.value;
  teardownLineSeek();
  if (armed) player?.setAutoPlayMode("default");
  syncState();
  logSeekNotice.value = {
    degraded: notice?.degraded ?? false,
    message: "已手动取消",
    phase: "aborted",
    target: notice?.target ?? -1,
  };
}

/** 摘掉进行中/挂起的跳转与自动隐藏计时器（不动状态条本身） */
function teardownLineSeek(): void {
  cancelLineSeek?.();
  cancelLineSeek = null;
  pendingLineSeek = null;
  if (noticeDismissTimer) {
    clearTimeout(noticeDismissTimer);
    noticeDismissTimer = null;
  }
}

function scheduleNoticeDismiss(ms: number): void {
  if (noticeDismissTimer) clearTimeout(noticeDismissTimer);
  noticeDismissTimer = setTimeout(() => {
    noticeDismissTimer = null;
    logSeekNotice.value = null;
  }, ms);
}

function logSeekAlertType(): "error" | "warning" | "success" | "info" {
  switch (logSeekNotice.value?.phase) {
    case "reached": {
      return "success";
    }
    case "missed":
    case "error": {
      return "error";
    }
    case "aborted": {
      return "warning";
    }
    default: {
      return "info";
    }
  }
}

function closeLogAll(): void {
  showLogAll.value = false;
  if (viewMode.value === "text") viewMode.value = "lobby";
}

function openAssetList(): void {
  if (!context) return;
  const manifest = collectContextAssetManifest(context);
  assetUrls.value = manifest.urls;
  characterFaceAssets.value = manifest.faceAssets;
  showAssetList.value = true;
}

function syncFullscreenState(): void {
  // 画布尺寸与分辨率由渲染器的 ResizeObserver 跟随宿主同步
  isFullscreen.value = document.fullscreenElement === fullscreenRootRef.value;
}

async function toggleFullscreen(): Promise<void> {
  try {
    await (document.fullscreenElement
      ? document.exitFullscreen()
      : fullscreenRootRef.value?.requestFullscreen());
  } catch (error) {
    console.error("[story-player] fullscreen failed:", error);
  }
}

function setAutoPlayMode(mode: AutoPlayMode): void {
  player?.setAutoPlayMode(mode);
  syncState();
}

function setAutoPlaySpeedLevel(level: number): void {
  if (!Number.isFinite(level)) return;
  player?.setAutoPlaySpeedLevel(level);
  syncState();
}

async function openFeedback(): Promise<void> {
  const currentAutoPlay = player?.getAutoPlayState();

  try {
    await window.Sentry?.showFeedback?.({
      widget: "story_player",
      story_id: context?.storyMetadata?.id ?? "",
      player_state: player?.getState() ?? state.value,
      auto_play_mode: currentAutoPlay?.mode ?? autoPlayMode.value,
      button_speed_level:
        currentAutoPlay?.buttonSpeedLevel ?? buttonSpeedLevel.value,
      quick_speed_level:
        currentAutoPlay?.quickSpeedLevel ?? quickSpeedLevel.value,
      current_speed_level: currentSpeedLevel.value,
      view_mode: viewMode.value,
      displayed_line_index: player?.getDisplayedLineIndex() ?? -1,
      decision_select_value: player?.getDecisionSelectValue() ?? 0,
      can_skip_node: player?.canSkipNode() ?? canSkipNode.value,
      preload_ready: preloadReady.value,
      is_preloading: isPreloading.value,
      preload_percent: preloadPercent.value,
      fullscreen: isFullscreen.value,
      has_script: hasScript.value,
    });
  } catch (error) {
    console.error("[story-player] opening feedback failed:", error);
  }
}

/** 预载资源并创建/挂载播放器；返回创建好的播放器（失败/参数缺失为 null，
 *  详情看 preloadError）。跳转路径用它拿重建产物——player 是模块级可变量，
 *  TS 的控制流分析不认 initAndPreload 内部的重新赋值 */
async function initAndPreload(): Promise<StoryPlayer | null> {
  if (!hostRef.value) {
    preloadError.value = "播放器容器未初始化";
    return null;
  }

  const script = scriptText.value;
  if (!script) {
    preloadError.value = "未提供剧情文本（#datas_txt）";
    return null;
  }

  isPreloading.value = true;
  preloadReady.value = false;
  preloadError.value = null;
  preloadProgress.value = 0;

  const host = hostRef.value;
  try {
    const storyContext = await loadContextByScript(script);
    context = storyContext;

    // 剧情资源与字体（含对话字体）一起开始下载，进度条统计两者。
    await Promise.all([
      preloadContextAssets(storyContext, (progress) => {
        preloadProgress.value = progress;
      }),
      (async () => {
        // 对话 UI 字体必须在 mount 前加载完（与上面是同一个 Promise），否则
        // PIXI 的 CanvasTextMetrics 会用回退字体测量，导致 BestFit 字号和长文本
        // Y 偏移算错。
        await preloadDialogFont();
        if (player) return;
        player = createStoryPlayer(storyContext);
        await player.mount(host);
        // 当前行号走推送（Web 适配），Log All 高亮即时更新；其余状态仍靠下方轮询。
        // 订阅即补发当前值，重开一局时高亮不会停在上一局最后一行
        player.onDisplayedLineChange(
          (lineIndex) => (logAllActiveLineIndex.value = lineIndex),
        );
        syncState();
        if (!timer) timer = setInterval(syncState, 80);
      })(),
    ]);
    preloadProgress.value = 1;
    preloadReady.value = true;
    hostRef.value?.focus();
    return player;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[story-player] preload failed:", detail, error);
    preloadError.value = detail || "资源加载失败";
    return null;
  } finally {
    isPreloading.value = false;
  }
}

function onLoadLegacyPlayer(): void {
  const legacyRoot = document.querySelector<HTMLElement>("#old-player");
  if (!legacyRoot || !window.data?.init || !window.system?.disabled?.init) {
    preloadError.value =
      "旧版播放器不可用（页面缺少 #sys_fullscreen 或全局脚本）";
    return;
  }

  legacyPlayerActive.value = true;
  teardownLineSeek();
  legacyRoot.style.removeProperty("display");
}

async function onStartPlay(): Promise<void> {
  if (!scriptText.value) return;
  viewMode.value = "player";
  await nextTick();
  await initAndPreload();
}

// autoStart 只是替使用者连按"完整加载"和"开始"，不引入新的启动路径
async function onAutoStart(): Promise<void> {
  await onStartPlay();
  if (preloadReady.value && state.value === "idle") await onAdvance();
}

async function onAdvance(): Promise<void> {
  if (!player || !preloadReady.value) return;

  await (state.value === "idle" ? player.start() : player.advance());

  syncState();
}

async function onSkipNode(event?: Event): Promise<void> {
  event?.stopPropagation();
  if (!player || !preloadReady.value) return;

  await player.skipNode();
  syncState();
  if (state.value === "finished") {
    teardownLineSeek();
    player.destroy();
    player = null;
    context = null;
    preloadReady.value = false;
    preloadProgress.value = 0;
    viewMode.value = "lobby";
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== "Enter" && event.key !== " ") return;

  event.preventDefault();
  if (!preloadReady.value) return;

  onAdvance().catch((error) => {
    console.error("[story-player] advance failed:", error);
  });
}

onMounted(() => {
  document.addEventListener("fullscreenchange", syncFullscreenState);
  if (!scriptText.value) {
    preloadError.value = "未提供剧情文本（#datas_txt）";
    return;
  }
  if (props.autoStart) {
    onAutoStart().catch((error) => {
      console.error("[story-player] auto start failed:", error);
    });
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("fullscreenchange", syncFullscreenState);
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  teardownLineSeek();
  player?.destroy();
  player = null;
});

// 独立调试入口需要直接驱动 runtime（decision 自动选择、行号定位、快速
// 播放编排），暴露只读访问器；宿主页不使用。
defineExpose({
  getContext: () => context,
  getPlayer: () => player,
});
</script>

<template>
  <NConfigProvider
    preflight-style-disabled
    :theme="theme"
    :theme-overrides="themeOverrides"
  >
    <main
      v-show="!legacyPlayerActive"
      ref="fullscreenRootRef"
      class="story-player box-border max-w-full min-h-full w-full flex flex-col items-center"
      :class="isFullscreen ? 'h-screen gap-0 p-0' : 'gap-3.5 p-6'"
    >
      <section
        class="relative w-full overflow-hidden"
        :class="
          isFullscreen
            ? 'fullscreen-stage-container min-h-0 max-w-none flex flex-1 items-center justify-center bg-black'
            : 'aspect-video max-w-7xl'
        "
      >
        <NCard
          v-if="viewMode === 'lobby'"
          class="h-full"
          title="剧情加载方式"
          content-style="height: calc(100% - 59px)"
        >
          <div v-if="preloadError">
            <NAlert type="error" title="加载失败">{{ preloadError }}</NAlert>
          </div>

          <div v-else class="h-full flex flex-col items-center justify-center">
            <NText tag="p" depth="3" class="mt-0 text-sm">
              完整加载会预载剧情所需的图片、音频等资源；只加载文本不会下载这些资源。
            </NText>
            <NSpace>
              <NButton
                type="primary"
                :disabled="!hasScript"
                @click="onStartPlay"
              >
                完整加载
              </NButton>
              <NButton :disabled="!hasScript" @click="openLogAll">
                <template #icon>
                  <NIcon><LogAllIcon /></NIcon>
                </template>
                只加载文本
              </NButton>
              <NButton :disabled="!hasScript" @click="onLoadLegacyPlayer">
                加载旧版播放器
              </NButton>
            </NSpace>
          </div>
        </NCard>

        <LogAllPanel
          v-else-if="viewMode === 'text'"
          :show="showLogAll"
          embedded
          seekable
          :document="logAllDocument"
          :active-line-index="logAllActiveLineIndex"
          :selections="logAllSelections"
          @seek="onLogAllSeekLine"
          @update:show="closeLogAll"
        />

        <template v-else>
          <div
            class="bg-black"
            :class="
              isFullscreen ? 'fullscreen-stage-frame' : 'absolute inset-0'
            "
          >
            <div
              ref="hostRef"
              class="h-full w-full cursor-pointer outline-none"
              tabindex="0"
              @click="onAdvance"
              @keydown="onKeydown"
            />

            <div
              v-if="isPreloading"
              class="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-[2px]"
            >
              <NSpin :description="`正在预加载资源 ${preloadPercent}%`" />
            </div>

            <div
              v-else-if="!preloadReady && preloadError"
              class="absolute inset-0 flex flex-col items-center justify-center bg-black/70 p-6 backdrop-blur-[2px]"
            >
              <NAlert type="error" title="资源加载失败">{{
                preloadError
              }}</NAlert>
            </div>

            <div
              v-else-if="!preloadReady"
              class="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-[2px]"
            >
              <NSpin description="准备中..." />
            </div>
            <LogAllPanel
              v-model:show="showLogAll"
              embedded
              seekable
              class="absolute inset-0 z-10"
              :document="logAllDocument"
              :active-line-index="logAllActiveLineIndex"
              :selections="logAllSelections"
              @seek="onLogAllSeekLine"
            />
            <!-- Log All 行跳转状态条：只浮在画面上方，不挡画面中心的推进点击 -->
            <div
              v-if="logSeekNotice"
              class="absolute left-1/2 top-3 z-20 max-w-[88%] w-auto -translate-x-1/2"
            >
              <NAlert
                :type="logSeekAlertType()"
                :title="logSeekTitle"
                :closable="!logSeekActive"
                @close="logSeekNotice = null"
              >
                <div class="flex flex-wrap items-center gap-3">
                  <NText
                    v-if="logSeekNotice.degraded"
                    tag="span"
                    depth="3"
                    class="text-xs"
                  >
                    剧本分支过多，方案可能不准
                  </NText>
                  <NButton
                    v-if="logSeekActive"
                    size="tiny"
                    @click="cancelLogAllSeek"
                  >
                    取消跳转
                  </NButton>
                  <NText
                    v-if="logSeekNotice.phase === 'reached'"
                    tag="span"
                    depth="3"
                    class="text-xs"
                  >
                    已切回手动模式
                  </NText>
                </div>
              </NAlert>
            </div>
          </div>
        </template>
      </section>

      <template v-if="viewMode === 'player'">
        <NCard
          class="w-full"
          :class="isFullscreen ? 'max-w-none rounded-none' : 'max-w-7xl'"
          size="small"
          aria-label="播放控制"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <NSpace align="center" :wrap="true">
              <NText depth="3" class="text-xs font-bold tracking-[0.12em]">
                播放模式
              </NText>
              <NButtonGroup size="small">
                <NButton
                  v-for="option in playModeOptions"
                  :key="option.value"
                  :type="autoPlayMode === option.value ? 'primary' : 'default'"
                  :disabled="controlsDisabled || theaterMode"
                  @click="setAutoPlayMode(option.value)"
                >
                  {{ option.label }}
                </NButton>
              </NButtonGroup>
            </NSpace>

            <NSpace align="center" :wrap="true">
              <NButton
                size="small"
                :disabled="!fullscreenEnabled"
                @click="toggleFullscreen"
              >
                <template #icon>
                  <NIcon>
                    <FullscreenExitIcon v-if="isFullscreen" />
                    <FullscreenIcon v-else />
                  </NIcon>
                </template>
                {{ isFullscreen ? "退出全屏" : "全屏" }}
              </NButton>

              <NButton size="small" :disabled="!hasScript" @click="openLogAll">
                <template #icon>
                  <NIcon><LogAllIcon /></NIcon>
                </template>
                文本
              </NButton>

              <NButton
                size="small"
                :disabled="!preloadReady"
                @click="openAssetList"
              >
                <template #icon>
                  <NIcon><ExportIcon /></NIcon>
                </template>
                导出
              </NButton>

              <NButton size="small" @click="openFeedback">
                <template #icon>
                  <NIcon><FeedbackIcon /></NIcon>
                </template>
                反馈
              </NButton>

              <NButton
                size="small"
                :disabled="!canAdvance"
                quaternary
                @click="onAdvance"
              >
                <template #icon>
                  <NIcon><PlayArrowIcon /></NIcon>
                </template>
                {{ state === "idle" ? "开始" : "继续" }}
              </NButton>

              <NButton
                size="small"
                type="primary"
                :disabled="!(preloadReady && canSkipStory)"
                @click="onSkipNode"
              >
                <template #icon>
                  <NIcon><SkipNextIcon /></NIcon>
                </template>
                跳过剧情
              </NButton>
            </NSpace>

            <NSpace align="center" :wrap="true">
              <NText depth="3" class="text-xs font-bold tracking-[0.12em]">
                播放速度
              </NText>
              <NSelect
                size="small"
                style="width: 96px"
                :value="currentSpeedLevel"
                :options="speedOptions"
                :disabled="
                  controlsDisabled || theaterMode || autoPlayMode === 'default'
                "
                @update:value="setAutoPlaySpeedLevel"
              />
            </NSpace>
          </div>
        </NCard>
      </template>

      <AssetListModal
        v-model:show="showAssetList"
        :urls="assetUrls"
        :face-assets="characterFaceAssets"
        :to="fullscreenRootRef || undefined"
      />
    </main>
  </NConfigProvider>
</template>

<style scoped>
.fullscreen-stage-container {
  container-type: size;
}

.fullscreen-stage-frame {
  position: relative;
  width: min(100cqw, calc(100cqh * 16 / 9));
  height: min(100cqh, calc(100cqw * 9 / 16));
}
</style>

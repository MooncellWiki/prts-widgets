<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from "vue";

import {
  AkButton,
  AkMessage,
  AkPanel,
  AkProgress,
  AkRadioButton,
  AkRadioGroup,
  AkSelect,
  AkSpinner,
  type SelectValue,
} from "@mooncellwiki/prts-design-vue";

import AssetListModal from "./components/AssetListModal.vue";
import LogAllPanel from "./components/LogAllPanel.vue";
import { loadContextByScript, type Context } from "./context";
import { createStoryPlayer } from "./engine/createStoryPlayer";
import { preloadDialogFont } from "./engine/font";
import {
  analyzeStoryFlow,
  buildLogDocument,
  planChoicesForLine,
} from "./engine/log";
import { parseStory } from "./engine/parser";
import {
  collectContextAssetManifest,
  preloadContextAssets,
  type StoryCharacterFaceAsset,
} from "./engine/preload";
import { useStageFullscreen } from "./fullscreen";

import type {
  AutoPlayMode,
  LineSeekUpdate,
  PlayerState,
  RuntimeChoiceSelection,
  StoryPlayer,
} from "./engine/types";

const props = defineProps<{
  /** 剧情 txt 全文，由入口壳提供 */
  script: string;
  /** Wiki 入口提供局部主题，独立页继承页面配色。 */
  hostTheme?: "light" | "dark";
  /** 创建后跳过 lobby 直接加载资源并开始播放（独立页用，Wiki 入口不传） */
  autoStart?: boolean;
  /** 调试采集时以剧情逻辑分辨率渲染。 */
  lockCanvasResolution?: boolean;
}>();

const hostRef = ref<HTMLElement | null>(null);
const fullscreenRootRef = ref<HTMLElement | null>(null);
const controlsRef = ref<HTMLElement | null>(null);
const logTrigger = ref<InstanceType<typeof AkButton> | null>(null);
const {
  isFullscreen,
  isPseudo: isPseudoFullscreen,
  toggle: toggleFullscreen,
  exitNative: exitNativeFullscreen,
} = useStageFullscreen(fullscreenRootRef);
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
// 全文显示和跳转规划共用分析结果，保留其中的 ConditionStore 实例。
const logAllFlow = shallowRef(analyzeStoryFlow([]));
const logAllDocument = computed(() => buildLogDocument(logAllFlow.value));
const logAllActiveLineIndex = ref<number | null>(null);
const logAllSelections = ref<RuntimeChoiceSelection[]>([]);
const logSeekError = ref<string | null>(null);

interface LogSeekNotice {
  phase: "preparing" | LineSeekUpdate["phase"] | "error";
  target: number;
  degraded: boolean;
  message: string;
}

const logSeekNotice = shallowRef<LogSeekNotice | null>(null);
const logSeekActive = computed(
  () =>
    logSeekNotice.value?.phase === "preparing" ||
    logSeekNotice.value?.phase === "seeking",
);
const logSeekTitle = computed(() => {
  const notice = logSeekNotice.value;
  return notice?.phase === "seeking"
    ? `快速播放中 · L${logAllActiveLineIndex.value ?? "?"} → L${notice.target}`
    : notice?.message;
});
const logSeekVariants = {
  preparing: "info",
  seeking: "info",
  reached: "success",
  missed: "danger",
  aborted: "warning",
  error: "danger",
} as const;
let activeLogSeek: { cancel?: () => void } | null = null;
let logSeekDismissTimer: ReturnType<typeof setTimeout> | null = null;

const showAssetList = ref(false);
const assetUrls = ref<string[]>([]);
const characterFaceAssets = ref<StoryCharacterFaceAsset[]>([]);

let player: StoryPlayer | null = null;
let closingPlayer: StoryPlayer | null = null;
let isMountingPlayer = false;
let unmounted = false;
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

// 推进按钮只在可开始或等待点击时可用。决策面板接管舞台输入。
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
  // 阅读时暂停自动推进，方便对照当前显示的句子。
  if (activeLogSeek) cancelLogSeek();
  if (autoPlayMode.value !== "default") {
    player?.setAutoPlayMode("default");
    syncState();
  }
  logSeekError.value = null;
  logAllFlow.value = analyzeStoryFlow(
    parseStory(scriptText.value).lines,
    context?.audioVariables,
  );
  if (isFullscreen.value) hideHud();
  showLogAll.value = true;
}

async function closeLogAll(): Promise<void> {
  showLogAll.value = false;
  if (viewMode.value === "text") viewMode.value = "lobby";
  if (isFullscreen.value) showHud();
  await nextTick();
  (logTrigger.value?.$el as HTMLElement | undefined)?.focus();
}

async function seekFromLog(target: number, audience: number): Promise<void> {
  if (isPreloading.value || logSeekActive.value) return;

  const result = planChoicesForLine(logAllFlow.value, target, audience);
  if (!result.ok) {
    logSeekError.value = `无法快进到第 ${target} 行`;
    return;
  }

  clearLogSeek();
  const request: { cancel?: () => void } = {};
  activeLogSeek = request;
  const { choices, degraded } = result.plan;
  logSeekNotice.value = {
    phase: "preparing",
    target,
    degraded,
    message: "正在准备跳转…",
  };
  showLogAll.value = false;
  preloadReady.value = false;

  try {
    // 分支方案从脚本起点计算，快进前要重建播放器。
    stopStateSync();
    player?.destroy();
    const rebuilt = await onStartPlay();
    if (activeLogSeek !== request) return;
    if (!rebuilt) throw new Error(preloadError.value ?? "播放器未能就绪");

    request.cancel = rebuilt.seekToLine(target, choices, (update) => {
      if (activeLogSeek === request) updateLogSeek(update);
    });
    syncState();
    await rebuilt.start();
    if (player === rebuilt) syncState();
  } catch (error) {
    if (activeLogSeek !== request) return;
    clearLogSeek();
    player?.setAutoPlayMode("default");
    syncState();
    logSeekNotice.value = {
      phase: "error",
      target,
      degraded,
      message: `跳转失败：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function updateLogSeek(update: LineSeekUpdate): void {
  const notice = logSeekNotice.value;
  if (!notice) return;

  const { phase, reason, target } = update;
  const messages = {
    seeking: "快速播放中",
    reached: `已到达第 ${target} 行`,
    missed:
      reason === "error"
        ? `播放出错，未到达第 ${target} 行`
        : `播放结束，未到达第 ${target} 行`,
    aborted: "已切换播放模式，跳转中止",
  };
  logSeekNotice.value = { ...notice, phase, message: messages[phase] };
  if (phase === "seeking") return;

  activeLogSeek = null;
  if (phase === "reached") logSeekDismissTimer = setTimeout(clearLogSeek, 4000);
}

function clearLogSeek(): void {
  const request = activeLogSeek;
  activeLogSeek = null;
  request?.cancel?.();
  if (logSeekDismissTimer) clearTimeout(logSeekDismissTimer);
  logSeekDismissTimer = null;
  logSeekNotice.value = null;
}

function cancelLogSeek(): void {
  const notice = logSeekNotice.value;
  const armed = Boolean(activeLogSeek?.cancel);
  clearLogSeek();
  if (armed) {
    // 解除选项编排后退出快进，避免剧情继续自动推进。
    player?.setAutoPlayMode("default");
    syncState();
  }
  if (notice)
    logSeekNotice.value = {
      ...notice,
      phase: "aborted",
      message: "已取消跳转",
    };
}

function openAssetList(): void {
  if (!context) return;
  const manifest = collectContextAssetManifest(context);
  assetUrls.value = manifest.urls;
  characterFaceAssets.value = manifest.faceAssets;
  showAssetList.value = true;
}

// 全屏时控制栏不占布局，改为叠在舞台顶部的 HUD：进入全屏先亮出来让人
// 知道在哪，闲置一会儿自动收起，只留右上角的呼出按钮。点画面照常推进
// 剧情并收起 HUD；没有"点画面呼出"——那会和推进抢同一个点击。
// 画布尺寸与分辨率由渲染器的 ResizeObserver 跟随宿主同步。
const HUD_AUTO_HIDE_MS = 4000;
const hudVisible = ref(false);
let hudTimer: ReturnType<typeof setTimeout> | null = null;
// 鼠标悬停、键盘操作或速度选择期间保持 HUD 可见。
let hudHovered = false;

function clearHudTimer(): void {
  if (hudTimer) clearTimeout(hudTimer);
  hudTimer = null;
}

function scheduleHudHide(): void {
  clearHudTimer();
  if (!isFullscreen.value || hudHovered || showAssetList.value) return;
  hudTimer = setTimeout(() => {
    if (controlsRef.value?.querySelector("select:focus, :focus-visible"))
      return;
    hideHud();
  }, HUD_AUTO_HIDE_MS);
}

function showHud(): void {
  hudVisible.value = true;
  scheduleHudHide();
}

function hideHud(): void {
  clearHudTimer();
  hudVisible.value = false;
  hudHovered = false;
}

function onHudHover(hovered: boolean): void {
  hudHovered = hovered;
  if (hovered) clearHudTimer();
  else scheduleHudHide();
}

async function revealHud(): Promise<void> {
  showHud();
  await nextTick();
  controlsRef.value?.querySelector<HTMLElement>("button:enabled")?.focus();
}

watch(isFullscreen, (fullscreen) => (fullscreen ? showHud() : hideHud()));
watch(showAssetList, scheduleHudHide);
watch(
  () => props.lockCanvasResolution,
  (locked) => player?.setCanvasResolutionLocked(Boolean(locked)),
);

function onStageClick(): void {
  if (isFullscreen.value) hideHud();
  onAdvance().catch((error) => {
    console.error("[story-player] advance failed:", error);
  });
}

function setAutoPlayMode(mode: string | number | undefined): void {
  if (mode !== "default" && mode !== "button_auto" && mode !== "quick_play")
    return;
  player?.setAutoPlayMode(mode);
  syncState();
}

function setAutoPlaySpeedLevel(level: SelectValue | null | undefined): void {
  if (typeof level !== "number" || !Number.isFinite(level)) return;
  player?.setAutoPlaySpeedLevel(level);
  syncState();
}

async function openFeedback(): Promise<void> {
  const currentAutoPlay = player?.getAutoPlayState();
  const fullscreen = isFullscreen.value;
  // Sentry 的反馈表单挂在 body 上，原生全屏时会被全屏元素盖住，先退出。
  // 网页全屏是普通的 fixed 层，表单的 z-index 比它高，不用退。
  await exitNativeFullscreen();

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
      fullscreen,
      has_script: hasScript.value,
    });
  } catch (error) {
    console.error("[story-player] opening feedback failed:", error);
  }
}

async function initAndPreload(): Promise<StoryPlayer | null> {
  if (unmounted || isPreloading.value) return null;

  const host = hostRef.value;
  if (!host) {
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

  try {
    const storyContext = context ?? (await loadContextByScript(script));
    if (unmounted) return null;
    context = storyContext;

    // 剧情资源与字体（含对话字体）一起开始下载，进度条统计两者。
    const results = await Promise.allSettled([
      preloadContextAssets(storyContext, (progress) => {
        preloadProgress.value = progress;
      }),
      (async () => {
        // 对话 UI 字体必须在 mount 前加载完（与上面是同一个 Promise），否则
        // PIXI 的 CanvasTextMetrics 会用回退字体测量，导致 BestFit 字号和长文本
        // Y 偏移算错。
        await preloadDialogFont();
        if (unmounted) return;
        if (!player) {
          player = createStoryPlayer(storyContext);
          player.setCanvasResolutionLocked(Boolean(props.lockCanvasResolution));
          player.onDisplayedLineChange(
            (lineIndex) => (logAllActiveLineIndex.value = lineIndex),
          );
        }
        const loadingPlayer = player;
        isMountingPlayer = true;
        try {
          await loadingPlayer.mount(host);
        } finally {
          isMountingPlayer = false;
          // Pixi 初始化完成后才可销毁，避免卸载时漏掉异步创建的画布。
          if (unmounted) loadingPlayer.destroy();
        }
      })(),
    ]);
    if (unmounted) return null;
    const failure = results.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;
    if (!player) return null;

    syncState();
    timer = setInterval(syncState, 80);
    preloadProgress.value = 1;
    preloadReady.value = true;
    host.focus();
    return player;
  } catch (error) {
    destroyPlayer();
    context = null;
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

  destroyClosingPlayer();
  clearLogSeek();
  legacyPlayerActive.value = true;
  legacyRoot.style.removeProperty("display");
}

async function onStartPlay(): Promise<StoryPlayer | null> {
  if (!scriptText.value) return null;
  destroyClosingPlayer();
  viewMode.value = "player";
  await nextTick();
  return initAndPreload();
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

function stopStateSync(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

function destroyPlayer(): void {
  stopStateSync();
  if (!isMountingPlayer) player?.destroy();
  player = null;
}

function destroyClosingPlayer(): void {
  closingPlayer?.destroy();
  closingPlayer = null;
}

async function onSkipNode(event?: Event): Promise<void> {
  event?.stopPropagation();
  const skippedPlayer = player;
  if (!skippedPlayer || !preloadReady.value) return;

  await skippedPlayer.skipNode();
  if (player !== skippedPlayer || !preloadReady.value) return;
  syncState();
  if (state.value === "finished") {
    clearLogSeek();
    closingPlayer = skippedPlayer;
    player = null;
    context = null;
    preloadReady.value = false;
    preloadProgress.value = 0;
    showLogAll.value = false;
    if (isFullscreen.value) void toggleFullscreen();
    viewMode.value = "lobby";
    stopStateSync();
    // 返回大厅后，音效继续走 OnReset 或 stopsound 已提交的淡停。
    try {
      await skippedPlayer.closeAfterStory();
    } finally {
      if (closingPlayer === skippedPlayer) closingPlayer = null;
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
  unmounted = true;
  clearHudTimer();
  clearLogSeek();
  destroyPlayer();
  destroyClosingPlayer();
});

// 独立调试入口需要直接驱动 runtime（decision 自动选择、行号定位、快速
// 播放编排），暴露只读访问器；宿主页不使用。
defineExpose({
  getContext: () => context,
  getPlayer: () => player,
});
</script>

<template>
  <div
    v-show="!legacyPlayerActive"
    ref="fullscreenRootRef"
    class="story-player ak-scope ak-not-prose"
    :class="{
      'story-player--fullscreen': isFullscreen,
      'story-player--pseudo-fullscreen': isPseudoFullscreen,
    }"
    :data-theme="isFullscreen ? 'dark' : hostTheme"
  >
    <AkPanel
      v-if="viewMode === 'lobby'"
      class="story-lobby"
      title="剧情播放器"
      title-tag="h2"
    >
      <AkMessage v-if="preloadError" variant="danger" title="加载失败">
        {{ preloadError }}
      </AkMessage>
      <div class="story-lobby-options">
        <div class="story-lobby-option">
          <AkButton
            variant="primary"
            icon="play"
            :disabled="!hasScript"
            @click="onStartPlay"
          >
            完整加载
          </AkButton>
          <p>预载图片和音频，在舞台播放剧情。</p>
        </div>
        <div class="story-lobby-option">
          <AkButton
            ref="logTrigger"
            icon="list"
            :disabled="!hasScript"
            @click="openLogAll"
          >
            只加载文本
          </AkButton>
          <p>阅读全部对话与分支，无需下载图片和音频。</p>
        </div>
      </div>
      <AkButton
        class="story-legacy"
        variant="ghost"
        size="sm"
        :disabled="!hasScript"
        @click="onLoadLegacyPlayer"
      >
        加载旧版播放器
      </AkButton>
    </AkPanel>

    <!-- 只加载文本时不传当前行与选择历史 -->
    <LogAllPanel
      v-else-if="viewMode === 'text'"
      class="story-transcript"
      :document="logAllDocument"
      :seek-error="logSeekError"
      seekable
      @close="closeLogAll"
      @seek="seekFromLog"
    />

    <template v-else>
      <div
        class="story-stage"
        :class="{
          'story-stage--fullscreen': isFullscreen,
          'story-stage--reading': showLogAll,
        }"
      >
        <div class="story-stage-frame" :inert="showLogAll">
          <div
            ref="hostRef"
            class="story-stage-host"
            role="region"
            aria-label="剧情舞台，按空格或回车推进剧情"
            tabindex="0"
            @click="onStageClick"
            @keydown="onKeydown"
          />

          <div
            v-if="!preloadReady"
            class="story-stage-status ak-scope"
            data-theme="dark"
          >
            <AkProgress
              v-if="isPreloading"
              class="story-stage-progress"
              label="正在预加载资源"
              :percentage="preloadPercent"
              size="sm"
              stripes
            />
            <AkMessage
              v-else-if="preloadError"
              variant="danger"
              title="资源加载失败"
            >
              {{ preloadError }}
            </AkMessage>
            <AkSpinner v-else description="准备中…" />
          </div>
        </div>

        <LogAllPanel
          v-if="showLogAll"
          class="story-transcript-overlay"
          :document="logAllDocument"
          :active-line-index="logAllActiveLineIndex"
          :selections="logAllSelections"
          :seekable="!isPreloading"
          :seek-error="logSeekError"
          @close="closeLogAll"
          @seek="seekFromLog"
        />

        <AkMessage
          v-if="logSeekNotice && !showLogAll"
          class="story-seek-notice"
          :title="logSeekTitle"
          :variant="logSeekVariants[logSeekNotice.phase]"
          :closable="!logSeekActive"
          @close="clearLogSeek"
        >
          <div
            v-if="logSeekNotice.degraded || logSeekActive"
            class="story-seek-details"
          >
            <span v-if="logSeekNotice.degraded"
              >分支组合过多，跳转可能无法到达目标行。</span
            >
            <AkButton v-if="logSeekActive" size="xs" @click="cancelLogSeek">
              取消跳转
            </AkButton>
          </div>
        </AkMessage>
      </div>

      <Transition name="story-hud">
        <section
          v-show="!isFullscreen || (hudVisible && !showLogAll)"
          ref="controlsRef"
          class="story-controls"
          :class="{ 'story-hud': isFullscreen }"
          aria-label="播放控制"
          @pointerenter="onHudHover(true)"
          @pointerleave="onHudHover(false)"
          @focusout="scheduleHudHide"
        >
          <div class="story-controls-group">
            <!-- 全屏时点画面就能推进，只在尚未开始时保留入口 -->
            <AkButton
              v-if="!isFullscreen || state === 'idle'"
              variant="contrast"
              size="sm"
              icon="play"
              :disabled="!canAdvance"
              @click="onAdvance"
            >
              {{ state === "idle" ? "开始" : "继续" }}
            </AkButton>
            <AkRadioGroup
              label="播放模式"
              size="sm"
              :model-value="autoPlayMode"
              :disabled="controlsDisabled || theaterMode"
              @update:model-value="setAutoPlayMode"
            >
              <AkRadioButton
                v-for="option in playModeOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </AkRadioButton>
            </AkRadioGroup>
            <div class="story-speed-control">
              <span aria-hidden="true">速度</span>
              <AkSelect
                class="story-speed"
                size="sm"
                label="播放速度"
                :model-value="currentSpeedLevel"
                :options="speedOptions"
                :disabled="
                  controlsDisabled || theaterMode || autoPlayMode === 'default'
                "
                @update:model-value="setAutoPlaySpeedLevel"
              />
            </div>
          </div>

          <div class="story-controls-group">
            <AkButton
              ref="logTrigger"
              size="sm"
              variant="ghost"
              icon="list"
              :disabled="!hasScript"
              :aria-expanded="showLogAll"
              @click="openLogAll"
            >
              文本
            </AkButton>
            <AkButton
              size="sm"
              variant="ghost"
              icon="download"
              :disabled="!preloadReady"
              @click="openAssetList"
            >
              导出
            </AkButton>
            <AkButton
              size="sm"
              variant="ghost"
              icon="monitor"
              @click="toggleFullscreen"
            >
              {{ isFullscreen ? "退出全屏" : "全屏" }}
            </AkButton>
            <AkButton
              size="sm"
              variant="ghost"
              icon="talk"
              @click="openFeedback"
            >
              反馈
            </AkButton>
            <AkButton
              size="sm"
              :disabled="!(preloadReady && canSkipStory)"
              @click="onSkipNode"
            >
              跳过剧情
            </AkButton>
          </div>
        </section>
      </Transition>

      <AkButton
        v-if="isFullscreen && !hudVisible && !showLogAll"
        class="story-hud-toggle"
        icon="menu"
        label="显示播放控制"
        @click="revealHud"
      />

      <AssetListModal
        v-model:show="showAssetList"
        :urls="assetUrls"
        :face-assets="characterFaceAssets"
      />
    </template>
  </div>
</template>

<style scoped>
.story-player {
  --story-player-width: 72rem;
  --story-preview-background: repeating-conic-gradient(
      var(--ak-bg-surface-2) 0% 25%,
      var(--ak-bg-surface-3) 0% 50%
    )
    0 0 / 16px 16px;
  box-sizing: border-box;
  width: 100%;
  max-width: var(--story-player-width);
  margin-inline: auto;
}

.story-lobby {
  margin: 0;
}

.story-lobby :deep(.ak-panel__title) {
  font-family: var(--ak-font-body);
}

.story-lobby-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr));
  gap: var(--ak-space-3);
}

.story-lobby-option {
  padding: var(--ak-space-4);
  border: 1px solid var(--ak-border);
  background: var(--ak-bg-surface-2);
}

.story-lobby-option p {
  margin: var(--ak-space-2) 0 0;
  color: var(--ak-fg-muted);
  font-size: var(--ak-fs-sm);
}

.story-lobby :deep(.ak-message) {
  margin-bottom: var(--ak-space-3);
}

.story-legacy {
  margin-top: var(--ak-space-3);
}

.story-transcript {
  height: min(68vh, 42rem);
}

.story-stage {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: #000;
  container-type: size;
}

/* 竖屏的 16:9 舞台高度不足以阅读全文，打开全文时给滚动区留出空间。 */
.story-stage--reading {
  min-height: min(68vh, 30rem);
}

.story-stage-frame {
  position: relative;
  width: 100%;
  height: 100%;
}

/* 全屏或阅读时，按舞台容器尺寸等比居中画布。 */
@supports (width: 1cqw) {
  .story-stage-frame {
    width: min(100cqw, calc(100cqh * 16 / 9));
    height: min(100cqh, calc(100cqw * 9 / 16));
  }
}

.story-stage-host {
  width: 100%;
  height: 100%;
  cursor: pointer;
}

.story-stage-host:focus-visible {
  outline: 2px solid var(--ak-focus);
  outline-offset: -2px;
}

.story-stage-status.ak-scope {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: var(--ak-space-4);
  background: var(--ak-bg-overlay);
  overflow-wrap: anywhere;
}

.story-stage-progress {
  width: min(100%, 24rem);
}

.story-transcript-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
}

.story-seek-notice {
  position: absolute;
  top: var(--ak-space-3);
  left: 50%;
  z-index: 11;
  box-sizing: border-box;
  width: max-content;
  max-width: calc(100% - 2 * var(--ak-space-3));
  margin: 0;
  transform: translateX(-50%);
  overflow-wrap: anywhere;
}

.story-seek-details {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ak-space-2);
}

.story-controls,
.story-controls-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}

.story-controls {
  justify-content: space-between;
  gap: var(--ak-space-2) var(--ak-space-4);
  padding: var(--ak-space-2) var(--ak-space-3);
  border: 1px solid var(--ak-border);
  border-top: 2px solid var(--ak-accent);
  background: var(--ak-bg-surface-2);
}

.story-controls-group {
  gap: var(--ak-space-1);
}

.story-controls-group:first-child {
  gap: var(--ak-space-2);
}

.story-speed-control {
  display: flex;
  align-items: center;
  gap: var(--ak-space-1);
  color: var(--ak-fg-muted);
  font-size: var(--ak-fs-xs);
}

.story-speed {
  width: auto;
  min-width: 4.5rem;
}

@media (max-width: 38rem) {
  .story-controls-group .ak-btn--ghost {
    padding-inline: var(--ak-space-2);
  }
}

.story-player--fullscreen {
  position: relative;
  max-width: none;
  height: 100vh;
  overflow: hidden;
  background: #000;
}

/* Fullscreen API 不可用时覆盖 Wiki 页面层。 */
.story-player--pseudo-fullscreen {
  position: fixed;
  inset: 0;
  z-index: var(--ak-z-overlay);
  height: auto;
}

.story-stage--fullscreen {
  position: absolute;
  inset: 0;
  aspect-ratio: auto;
}

.story-stage--fullscreen .story-seek-notice {
  top: auto;
  bottom: max(var(--ak-space-3), env(safe-area-inset-bottom, 0px));
}

.story-hud {
  position: absolute;
  inset: 0 0 auto;
  z-index: 20;
  padding-top: calc(var(--ak-space-2) + env(safe-area-inset-top, 0px));
  padding-right: max(var(--ak-space-3), env(safe-area-inset-right, 0px));
  padding-left: max(var(--ak-space-3), env(safe-area-inset-left, 0px));
  border-width: 0 0 1px;
  background: var(--ak-bg-canvas);
  background: color-mix(in srgb, var(--ak-bg-canvas) 90%, transparent);
  backdrop-filter: blur(6px);
}

.story-hud-toggle {
  position: absolute;
  top: max(var(--ak-space-3), env(safe-area-inset-top, 0px));
  right: max(var(--ak-space-3), env(safe-area-inset-right, 0px));
  z-index: 20;
}

@media (prefers-reduced-motion: no-preference) {
  .story-hud-enter-active,
  .story-hud-leave-active {
    transition:
      opacity var(--ak-dur-normal),
      transform var(--ak-dur-normal);
  }

  .story-hud.story-hud-enter-from,
  .story-hud.story-hud-leave-to {
    opacity: 0;
    transform: translateY(-100%);
  }
}
</style>

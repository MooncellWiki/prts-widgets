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
  FileDownloadOutlined as ExportIcon,
  FullscreenExitOutlined as FullscreenExitIcon,
  FullscreenOutlined as FullscreenIcon,
  FeedbackOutlined as FeedbackIcon,
  SubjectFilled as LogAllIcon,
  MenuFilled as MenuIcon,
  PlayArrowFilled as PlayArrowIcon,
  SkipNextFilled as SkipNextIcon,
} from "@vicons/material";
import {
  darkTheme,
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
  type GlobalThemeOverrides,
} from "naive-ui";

import { useTheme } from "@/utils/theme";

import AssetListModal from "./components/AssetListModal.vue";
import LogAllPanel from "./components/LogAllPanel.vue";
import { loadContextByScript, type Context } from "./context";
import { createStoryPlayer } from "./engine/createStoryPlayer";
import { preloadDialogFont } from "./engine/font";
import { buildLogAll, type LogDocument } from "./engine/log";
import { parseStory } from "./engine/parser";
import {
  collectContextAssetManifest,
  preloadContextAssets,
  type StoryCharacterFaceAsset,
} from "./engine/preload";
import { useStageFullscreen } from "./fullscreen";

import type {
  AutoPlayMode,
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
// 文档包含 ConditionStore 类实例且只整体替换，用 shallowRef 避免深层解包
const logAllDocument = shallowRef<LogDocument>(buildLogAll([]));
const logAllActiveLineIndex = ref<number | null>(null);
const logAllSelections = ref<RuntimeChoiceSelection[]>([]);
const showAssetList = ref(false);
const assetUrls = ref<string[]>([]);
const characterFaceAssets = ref<StoryCharacterFaceAsset[]>([]);

let player: StoryPlayer | null = null;
let closingPlayer: StoryPlayer | null = null;
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

// 舞台区域尺寸：宽屏统一 16:9。窄屏（竖屏手机）下 16:9 只有两百来像素高，
// lobby 改按内容自然高度，阅读 LOG ALL 时撑高（story-stage--reading）。
// 播放器的画布 frame 在 story-stage 里按容器查询保持 16:9 居中，区域变成
// 什么形状都不会拉伸画布。
const stageSectionClass = computed(() => {
  if (viewMode.value === "lobby") return "max-w-7xl sm:aspect-video";
  if (viewMode.value === "text") return "max-w-7xl story-stage--reading";
  if (isFullscreen.value) return "story-stage story-stage--fullscreen";
  return [
    "story-stage max-w-7xl",
    showLogAll.value ? "story-stage--reading" : "aspect-video",
  ];
});

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
  logAllDocument.value = buildLogAll(
    parseStory(scriptText.value).lines,
    context?.audioVariables,
  );
  showLogAll.value = true;
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

// 全屏时控制栏不占布局，改为叠在舞台顶部的 HUD：进入全屏先亮出来让人
// 知道在哪，闲置一会儿自动收起，只留右上角的呼出按钮。点画面照常推进
// 剧情并收起 HUD；没有"点画面呼出"——那会和推进抢同一个点击。
// 画布尺寸与分辨率由渲染器的 ResizeObserver 跟随宿主同步。
const HUD_AUTO_HIDE_MS = 4000;
const hudVisible = ref(false);
let hudTimer: ReturnType<typeof setTimeout> | null = null;
// 指针停在 HUD 上（鼠标悬停、触摸按下期间）不计时，离开后重新倒计时；
// 速度下拉菜单 teleport 在 HUD 外面，展开期间同样不能把 HUD 收掉
let hudHovered = false;
let hudMenuOpen = false;

// HUD 叠在黑底舞台上，固定用暗色主题，卡片半透明露出底下的画面
const hudThemeOverrides: GlobalThemeOverrides = {
  Card: { color: "rgba(0, 0, 0, 0.55)" },
};

function clearHudTimer(): void {
  if (hudTimer) clearTimeout(hudTimer);
  hudTimer = null;
}

function scheduleHudHide(): void {
  clearHudTimer();
  if (!isFullscreen.value || hudHovered || hudMenuOpen) return;
  hudTimer = setTimeout(() => (hudVisible.value = false), HUD_AUTO_HIDE_MS);
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

function onHudMenuShow(show: boolean): void {
  hudMenuOpen = show;
  if (show) clearHudTimer();
  else scheduleHudHide();
}

watch(isFullscreen, (fullscreen) => (fullscreen ? showHud() : hideHud()));

function onStageClick(): void {
  if (isFullscreen.value) hideHud();
  onAdvance().catch((error) => {
    console.error("[story-player] advance failed:", error);
  });
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

async function initAndPreload(): Promise<void> {
  if (!hostRef.value) {
    preloadError.value = "播放器容器未初始化";
    return;
  }

  const script = scriptText.value;
  if (!script) {
    preloadError.value = "未提供剧情文本（#datas_txt）";
    return;
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
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[story-player] preload failed:", detail, error);
    preloadError.value = detail || "资源加载失败";
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
  legacyPlayerActive.value = true;
  legacyRoot.style.removeProperty("display");
}

async function onStartPlay(): Promise<void> {
  if (!scriptText.value) return;
  destroyClosingPlayer();
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

function destroyClosingPlayer(): void {
  closingPlayer?.destroy();
  closingPlayer = null;
}

async function onSkipNode(event?: Event): Promise<void> {
  event?.stopPropagation();
  const skippedPlayer = player;
  if (!skippedPlayer || !preloadReady.value) return;

  await skippedPlayer.skipNode();
  if (player !== skippedPlayer) return;
  syncState();
  if (state.value === "finished") {
    closingPlayer = skippedPlayer;
    player = null;
    context = null;
    preloadReady.value = false;
    preloadProgress.value = 0;
    viewMode.value = "lobby";
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
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
  clearHudTimer();
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  player?.destroy();
  player = null;
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
  <NConfigProvider
    preflight-style-disabled
    :theme="theme"
    :theme-overrides="themeOverrides"
  >
    <!-- 根节点标 ak-not-prose，不吃 Arknights 皮肤的正文排版（列表的菱形项目符号 li::before、ul/p 的外边距等） -->
    <main
      v-show="!legacyPlayerActive"
      ref="fullscreenRootRef"
      class="story-player ak-not-prose box-border w-full flex flex-col items-center"
      :class="
        isFullscreen
          ? [
              'story-player--fullscreen',
              { 'story-player--pseudo-fullscreen': isPseudoFullscreen },
            ]
          : 'max-w-full min-h-full gap-3.5 py-3 sm:p-6'
      "
    >
      <section
        class="relative w-full overflow-hidden"
        :class="stageSectionClass"
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

        <!-- 只加载文本时没有播放进度，不传当前行与选择历史 -->
        <LogAllPanel
          v-else-if="viewMode === 'text'"
          :show="showLogAll"
          embedded
          :document="logAllDocument"
          @update:show="closeLogAll"
        />

        <template v-else>
          <div class="story-stage-frame bg-black">
            <div
              ref="hostRef"
              class="h-full w-full cursor-pointer outline-none"
              tabindex="0"
              @click="onStageClick"
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
          </div>

          <!-- 盖住整个舞台区域而不只是 16:9 画布：全屏时铺满屏幕，窄屏时
               跟着区域撑高，阅读宽度不受画布比例限制 -->
          <LogAllPanel
            v-model:show="showLogAll"
            embedded
            class="absolute inset-0 z-10"
            :document="logAllDocument"
            :active-line-index="logAllActiveLineIndex"
            :selections="logAllSelections"
          />
        </template>
      </section>

      <!-- 全屏时套暗色主题：控制栏变成叠在黑底舞台上的 HUD -->
      <NConfigProvider
        v-if="viewMode === 'player'"
        abstract
        :theme="isFullscreen ? darkTheme : undefined"
        :theme-overrides="isFullscreen ? hudThemeOverrides : undefined"
      >
        <Transition name="story-hud">
          <NCard
            v-show="!isFullscreen || (hudVisible && !showLogAll)"
            class="w-full"
            :class="isFullscreen ? 'story-hud' : 'max-w-7xl'"
            size="small"
            :bordered="!isFullscreen"
            aria-label="播放控制"
            @pointerenter="onHudHover(true)"
            @pointerleave="onHudHover(false)"
          >
            <div class="flex flex-wrap items-center justify-between gap-3">
              <NSpace align="center" :wrap="true">
                <NText
                  v-if="!isFullscreen"
                  depth="3"
                  class="text-xs font-bold tracking-[0.12em]"
                >
                  播放模式
                </NText>
                <NButtonGroup size="small">
                  <NButton
                    v-for="option in playModeOptions"
                    :key="option.value"
                    :type="
                      autoPlayMode === option.value ? 'primary' : 'default'
                    "
                    :disabled="controlsDisabled || theaterMode"
                    @click="setAutoPlayMode(option.value)"
                  >
                    {{ option.label }}
                  </NButton>
                </NButtonGroup>
              </NSpace>

              <NSpace align="center" :wrap="true">
                <NButton size="small" @click="toggleFullscreen">
                  <template #icon>
                    <NIcon>
                      <FullscreenExitIcon v-if="isFullscreen" />
                      <FullscreenIcon v-else />
                    </NIcon>
                  </template>
                  {{ isFullscreen ? "退出全屏" : "全屏" }}
                </NButton>

                <NButton
                  size="small"
                  :disabled="!hasScript"
                  @click="openLogAll"
                >
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

                <!-- 全屏时点画面就能推进，只在尚未开始时保留入口 -->
                <NButton
                  v-if="!isFullscreen || state === 'idle'"
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
                <NText
                  v-if="!isFullscreen"
                  depth="3"
                  class="text-xs font-bold tracking-[0.12em]"
                >
                  播放速度
                </NText>
                <NSelect
                  size="small"
                  style="width: 96px"
                  aria-label="播放速度"
                  :value="currentSpeedLevel"
                  :options="speedOptions"
                  :disabled="
                    controlsDisabled ||
                    theaterMode ||
                    autoPlayMode === 'default'
                  "
                  @update:value="setAutoPlaySpeedLevel"
                  @update:show="onHudMenuShow"
                />
              </NSpace>
            </div>
          </NCard>
        </Transition>

        <NButton
          v-if="isFullscreen && !hudVisible && !showLogAll"
          class="story-hud-toggle"
          circle
          secondary
          aria-label="显示播放控制"
          @click="showHud"
        >
          <template #icon>
            <NIcon><MenuIcon /></NIcon>
          </template>
        </NButton>
      </NConfigProvider>

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
/* 窄屏（竖屏手机）下 16:9 只有两百来像素高，LOG ALL 放不下：阅读文本时
   区域改用视口高度，宽屏仍保持 16:9 */
.story-stage--reading {
  height: min(70vh, 40rem);
}

@media (min-width: 640px) {
  .story-stage--reading {
    height: auto;
    aspect-ratio: 16 / 9;
  }
}

/* 舞台区域可能不是 16:9（全屏、窄屏阅读 LOG ALL），画布 frame 按容器查询
   等比居中，避免画布被拉伸；不支持容器查询的老浏览器退回铺满 */
.story-stage {
  container-type: size;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #000;
}

.story-stage-frame {
  position: relative;
  width: 100%;
  height: 100%;
}

@supports (width: 1cqw) {
  .story-stage-frame {
    width: min(100cqw, calc(100cqh * 16 / 9));
    height: min(100cqh, calc(100cqw * 9 / 16));
  }
}

.story-player--fullscreen {
  position: relative;
  height: 100vh;
  padding: 0;
  overflow: hidden;
  background-color: #000;
}

/* Fullscreen API 不可用（iPhone Safari）时的网页全屏。z-index 高于
   Minerva/Vector 的页面层（最高约 450），低于 naive-ui 浮层（2000 起）和
   Sentry 反馈表单，下拉菜单与弹窗照常显示在上面 */
.story-player--pseudo-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 1000;
  width: auto;
  height: auto;
}

.story-stage--fullscreen {
  position: absolute;
  inset: 0;
}

.story-hud {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  z-index: 20;
  padding-top: env(safe-area-inset-top, 0px);
  border-radius: 0;
  backdrop-filter: blur(6px);
}

.story-hud-toggle {
  position: absolute;
  top: max(12px, env(safe-area-inset-top, 0px));
  right: max(12px, env(safe-area-inset-right, 0px));
  z-index: 20;
  opacity: 0.6;
}

.story-hud-toggle:hover,
.story-hud-toggle:focus-visible {
  opacity: 1;
}

.story-hud-enter-active,
.story-hud-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.story-hud.story-hud-enter-from,
.story-hud.story-hud-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}
</style>

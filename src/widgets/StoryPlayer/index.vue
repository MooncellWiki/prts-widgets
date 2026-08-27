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
import { buildLogAll, type LogDocument } from "./engine/log";
import { parseStory } from "./engine/parser";
import {
  collectContextAssetManifest,
  preloadContextAssets,
  type StoryCharacterFaceAsset,
} from "./engine/preload";

import type {
  AutoPlayMode,
  PlayerState,
  RuntimeChoiceSelection,
  StoryPlayer,
} from "./engine/types";

const props = defineProps<{
  /** 剧情 txt 全文，由页面内嵌的 #datas_txt 提供 */
  script: string;
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

// 推进只在这两个状态下有效：runtime.advance() 对 running / waiting_timer /
// waiting_video / waiting_decision 都是直接返回。播放器没有暂停语义（native 的
// AVG 全靠点击驱动），所以这个按钮只表达"推进"。
const canAdvance = computed(
  () =>
    preloadReady.value &&
    (state.value === "idle" || state.value === "waiting_input"),
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

  try {
    context = await loadContextByScript(script);

    // 对话 UI 字体必须先加载完，否则 PIXI 的 CanvasTextMetrics 会用回退字体
    // 测量，导致 BestFit 字号和长文本 Y 偏移算错。
    await preloadDialogFont();

    if (!player && context) {
      player = createStoryPlayer(context);
      await player.mount(hostRef.value);
      // 当前行号走推送（Web 适配），Log All 高亮即时更新；其余状态仍靠下方轮询。
      // 订阅即补发当前值，重开一局时高亮不会停在上一局最后一行
      player.onDisplayedLineChange(
        (lineIndex) => (logAllActiveLineIndex.value = lineIndex),
      );
      syncState();
      if (!timer) timer = setInterval(syncState, 80);
    }

    if (!context) throw new Error("故事资源未初始化");

    await preloadContextAssets(context, (progress) => {
      preloadProgress.value = progress;
    });
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

  legacyPlayerActive.value = true;
  legacyRoot.style.removeProperty("display");
}

async function onStartPlay(): Promise<void> {
  if (!scriptText.value) return;
  viewMode.value = "player";
  await nextTick();
  await initAndPreload();
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
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("fullscreenchange", syncFullscreenState);
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  player?.destroy();
  player = null;
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
          :document="logAllDocument"
          :active-line-index="logAllActiveLineIndex"
          :selections="logAllSelections"
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
              class="absolute inset-0 z-10"
              :document="logAllDocument"
              :active-line-index="logAllActiveLineIndex"
              :selections="logAllSelections"
            />
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
                  :disabled="controlsDisabled"
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
                :disabled="!(preloadReady && canSkipNode)"
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
                :disabled="controlsDisabled || autoPlayMode === 'default'"
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

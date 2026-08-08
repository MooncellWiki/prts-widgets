<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";

import {
  FullscreenExitOutlined as FullscreenExitIcon,
  FullscreenOutlined as FullscreenIcon,
  FeedbackOutlined as FeedbackIcon,
  SubjectFilled as LogAllIcon,
  PauseFilled as PauseIcon,
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

import LogAllPanel from "./components/LogAllPanel.vue";
import {
  fetchStoryScriptByPath,
  loadContextByPath,
  type Context,
} from "./context";
import { createStoryPlayer } from "./engine/createStoryPlayer";
import { preloadDialogFont } from "./engine/font";
import { buildLogAll, type LogAllEntry } from "./engine/logAll";
import { parseStory } from "./engine/parser";
import { preloadContextAssets } from "./engine/preload";

import type { AutoPlayMode, PlayerState, StoryPlayer } from "./engine/types";

const props = defineProps<{
  /** 故事 txt 路径，例如 `activities/ACTIVITY/story.txt` */
  path: string;
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
const scriptLoading = ref(false);

const showLogAll = ref(false);
const logAllEntries = ref<LogAllEntry[]>([]);
const logAllActiveLineIndex = ref<number | null>(null);
const logAllDecisionValue = ref(0);

let player: StoryPlayer | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let context: Context | null = null;
const scriptText = ref<string | null>(null);
const hasScript = computed(() => Boolean(scriptText.value));

const controlsDisabled = computed(
  () =>
    !preloadReady.value ||
    state.value === "finished" ||
    state.value === "error",
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
  logAllActiveLineIndex.value = player?.getDisplayedLineIndex() ?? null;
  logAllDecisionValue.value = player?.getDecisionSelectValue() ?? 0;
}

function openLogAll(): void {
  if (!scriptText.value) return;
  if (viewMode.value === "lobby") viewMode.value = "text";
  // 打开弹窗时关掉自动播放，方便玩家在弹窗里对照当前显示的句子
  if (autoPlayMode.value !== "default") {
    player?.setAutoPlayMode("default");
    syncState();
  }
  logAllEntries.value = buildLogAll(
    parseStory(scriptText.value).lines,
    context?.audioVariables,
  );
  showLogAll.value = true;
}

function closeLogAll(): void {
  showLogAll.value = false;
  if (viewMode.value === "text") viewMode.value = "lobby";
}

function syncFullscreenState(): void {
  isFullscreen.value = document.fullscreenElement === fullscreenRootRef.value;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const canvas = hostRef.value?.querySelector("canvas");
      if (canvas) canvas.style.width = "100%";
      window.dispatchEvent(new Event("resize"));
    });
  });
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
      story_path: props.path,
      player_state: player?.getState() ?? state.value,
      auto_play_mode: currentAutoPlay?.mode ?? autoPlayMode.value,
      button_speed_level:
        currentAutoPlay?.buttonSpeedLevel ?? buttonSpeedLevel.value,
      quick_speed_level:
        currentAutoPlay?.quickSpeedLevel ?? quickSpeedLevel.value,
      current_speed_level: currentSpeedLevel.value,
      view_mode: viewMode.value,
      displayed_line_index: player?.getDisplayedLineIndex() ?? -1,
      decision_select_value:
        player?.getDecisionSelectValue() ?? logAllDecisionValue.value,
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

  isPreloading.value = true;
  preloadReady.value = false;
  preloadError.value = null;
  preloadProgress.value = 0;

  try {
    context = await loadContextByPath(`story/${props.path}`);
    scriptText.value = context.scriptText ?? null;

    // 对话 UI 字体必须先加载完，否则 PIXI 的 CanvasTextMetrics 会用回退字体
    // 测量，导致 BestFit 字号和长文本 Y 偏移算错。
    await preloadDialogFont();

    if (!player && context) {
      player = createStoryPlayer(context);
      await player.mount(hostRef.value);
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

async function loadScript(): Promise<void> {
  scriptLoading.value = true;
  preloadError.value = null;
  scriptText.value = null;

  try {
    scriptText.value = await fetchStoryScriptByPath(`story/${props.path}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    preloadError.value = detail || "加载剧情文本失败";
  } finally {
    scriptLoading.value = false;
  }
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

onMounted(async () => {
  document.addEventListener("fullscreenchange", syncFullscreenState);
  if (!props.path) {
    preloadError.value = "未提供故事路径（storyTxt）";
    return;
  }
  // lobby 阶段只拉取剧情脚本文本；由用户决定是否继续加载完整资源。
  await loadScript();
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
          <div
            v-if="scriptLoading"
            class="h-full flex items-center justify-center"
          >
            <NSpin description="正在加载剧情文本..." />
          </div>

          <div v-else-if="preloadError">
            <NAlert type="error" title="加载失败">{{ preloadError }}</NAlert>
            <NButton class="mt-3" size="small" @click="loadScript"
              >重试</NButton
            >
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
            </NSpace>
          </div>
        </NCard>

        <LogAllPanel
          v-else-if="viewMode === 'text'"
          :show="showLogAll"
          embedded
          :entries="logAllEntries"
          :active-line-index="logAllActiveLineIndex"
          :decision-select-value="logAllDecisionValue"
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
              :entries="logAllEntries"
              :active-line-index="logAllActiveLineIndex"
              :decision-select-value="logAllDecisionValue"
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
                LOG
              </NButton>

              <NButton size="small" @click="openFeedback">
                <template #icon>
                  <NIcon><FeedbackIcon /></NIcon>
                </template>
                Feedback
              </NButton>

              <NButton
                size="small"
                :disabled="!preloadReady"
                quaternary
                @click="onAdvance"
              >
                <template #icon>
                  <NIcon>
                    <PauseIcon v-if="state === 'running'" />
                    <PlayArrowIcon v-else />
                  </NIcon>
                </template>
                {{ state === "running" ? "暂停" : "继续" }}
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
                跳过片段
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

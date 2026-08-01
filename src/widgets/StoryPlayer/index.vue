<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";

import {
  SubjectFilled as LogAllIcon,
  PauseFilled as PauseIcon,
  PlayArrowFilled as PlayArrowIcon,
  SkipNextFilled as SkipNextIcon,
} from "@vicons/material";
import {
  NButton,
  NButtonGroup,
  NConfigProvider,
  NIcon,
  NSelect,
  NSpace,
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

const { theme, themeOverrides, isDark } = useTheme();

const hostRef = ref<HTMLElement | null>(null);
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

const showLogAll = ref(false);
const logAllEntries = ref<LogAllEntry[]>([]);
const logAllActiveLineIndex = ref<number | null>(null);
const logAllDecisionValue = ref(0);

let player: StoryPlayer | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let context: Context | null = null;
let scriptText: string | null = null;
const hasScript = computed(() => Boolean(scriptText));

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
  if (!scriptText) return;
  // 打开弹窗时关掉自动播放，方便玩家在弹窗里对照当前显示的句子
  if (autoPlayMode.value !== "default") {
    player?.setAutoPlayMode("default");
    syncState();
  }
  logAllEntries.value = buildLogAll(parseStory(scriptText).lines);
  showLogAll.value = true;
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
    scriptText = context.scriptText ?? null;

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
  if (!props.path) {
    preloadError.value = "未提供故事路径（storyTxt）";
    return;
  }
  // lobby 阶段先拉取剧情脚本文本，让 LOG ALL 无需图片/音频资源即可使用。
  try {
    scriptText = await fetchStoryScriptByPath(`story/${props.path}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    preloadError.value = detail || "加载剧情文本失败";
    return;
  }
  await nextTick();
  await initAndPreload();
});

onBeforeUnmount(() => {
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
      :class="[
        'story-player box-border flex min-h-full flex-col items-center gap-3.5 p-6',
        isDark && 'prts-widget-dark',
      ]"
    >
      <section
        class="relative aspect-video max-w-7xl w-full overflow-hidden border border-slate-400/25 rounded-xl bg-black shadow-[0_14px_40px_rgb(0_0_0/42%)]"
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
          class="absolute inset-0 flex flex-col items-center justify-center gap-3.5 bg-slate-950/72 backdrop-blur-[2px]"
        >
          <p class="m-0 text-[18px] text-slate-200 tracking-[0.03em]">
            正在预加载资源 {{ preloadPercent }}%
          </p>
        </div>

        <div
          v-else-if="!preloadReady && preloadError"
          class="absolute inset-0 flex flex-col items-center justify-center gap-3.5 bg-slate-950/72 backdrop-blur-[2px]"
        >
          <p class="m-0 text-[18px] text-slate-200 tracking-[0.03em]">
            {{ preloadError }}
          </p>
        </div>

        <div
          v-else-if="!preloadReady"
          class="absolute inset-0 flex flex-col items-center justify-center gap-3.5 bg-slate-950/72 backdrop-blur-[2px]"
        >
          <p class="m-0 text-[18px] text-slate-200 tracking-[0.03em]">
            准备中...
          </p>
        </div>
      </section>

      <section
        class="max-w-7xl w-full flex flex-wrap items-center justify-between gap-3 border border-slate-400/20 rounded-xl bg-slate-900/70 px-4 py-3 shadow-[0_8px_24px_rgb(0_0_0/28%)]"
        aria-label="播放控制"
      >
        <NSpace align="center" :wrap="true">
          <span class="text-xs text-slate-400 font-bold tracking-[0.12em]">
            播放模式
          </span>
          <NButtonGroup size="small">
            <NButton
              v-for="option in playModeOptions"
              :key="option.value"
              :type="autoPlayMode === option.value ? 'warning' : 'default'"
              :disabled="controlsDisabled"
              @click="setAutoPlayMode(option.value)"
            >
              {{ option.label }}
            </NButton>
          </NButtonGroup>
        </NSpace>

        <NSpace align="center" :wrap="true">
          <NButton size="small" :disabled="!hasScript" @click="openLogAll">
            <template #icon>
              <NIcon><LogAllIcon /></NIcon>
            </template>
            LOG ALL
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
            type="warning"
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
          <span class="text-xs text-slate-400 font-bold tracking-[0.12em]">
            播放速度
          </span>
          <NSelect
            size="small"
            style="width: 96px"
            :value="currentSpeedLevel"
            :options="speedOptions"
            :disabled="controlsDisabled || autoPlayMode === 'default'"
            @update:value="setAutoPlaySpeedLevel"
          />
        </NSpace>

        <p
          class="m-0 select-none text-xs text-slate-400 tracking-[0.03em] uppercase"
        >
          state: {{ state }}
        </p>
      </section>

      <LogAllPanel
        v-model:show="showLogAll"
        :entries="logAllEntries"
        :active-line-index="logAllActiveLineIndex"
        :decision-select-value="logAllDecisionValue"
      />
    </main>
  </NConfigProvider>
</template>

<style scoped>
@import "@/styles/dark-mode.scss";
</style>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";

import {
  DownloadOutlined as DownloadIcon,
  FileDownloadOutlined as ExportIcon,
  FullscreenExitOutlined as FullscreenExitIcon,
  FullscreenOutlined as FullscreenIcon,
  FeedbackOutlined as FeedbackIcon,
  ImageOutlined as ImageIcon,
  InsertDriveFileOutlined as FileIcon,
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
  NImage,
  NAlert,
  NModal,
  NSelect,
  NSpace,
  NSpin,
  NTag,
  NText,
} from "naive-ui";

import { useTheme } from "@/utils/theme";

import CharacterFacePreview from "./components/CharacterFacePreview.vue";
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
import {
  collectContextAssetManifest,
  preloadContextAssets,
  type StoryCharacterFaceAsset,
} from "./engine/preload";

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
const showAssetList = ref(false);
const assetUrls = ref<string[]>([]);
const characterFaceAssets = ref<StoryCharacterFaceAsset[]>([]);

type AssetKind = "audio" | "image" | "other" | "video";

interface AssetListItem {
  faces: StoryCharacterFaceAsset[];
  kind: AssetKind;
  name: string;
  url: string;
}

interface CharacterFacePreviewInstance {
  exportComposite: () => Promise<Blob>;
}

const selectedCharacterAsset = ref<AssetListItem | null>(null);
const selectedCharacterFace = ref<StoryCharacterFaceAsset | null>(null);
const characterFacePreviewRef = ref<CharacterFacePreviewInstance | null>(null);
const downloadingAsset = ref<"composite" | "face" | null>(null);
const assetDownloadError = ref<string | null>(null);
const showCharacterFaces = ref(false);

function getAssetKind(url: string): AssetKind {
  const normalized = url.split(/[?#]/)[0]?.toLowerCase() ?? "";
  if (
    url.startsWith("data:audio/") ||
    /\.(?:aac|flac|m4a|mp3|oga|ogg|opus|wav|weba)$/.test(normalized)
  )
    return "audio";
  if (
    url.startsWith("data:image/") ||
    /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/.test(normalized)
  )
    return "image";
  if (
    url.startsWith("data:video/") ||
    /\.(?:m4v|mkv|mov|mp4|ogv|webm)$/.test(normalized)
  )
    return "video";
  return "other";
}

function getAssetName(url: string, index: number): string {
  if (url.startsWith("data:")) return `内置资源 ${index + 1}`;

  try {
    const pathParts = new URL(url, window.location.href).pathname
      .split("/")
      .filter(Boolean);
    const name = pathParts.at(-1);
    return name ? decodeURIComponent(name) : `资源 ${index + 1}`;
  } catch {
    return `资源 ${index + 1}`;
  }
}

const assetItems = computed<AssetListItem[]>(() =>
  assetUrls.value
    .filter((url) =>
      characterFaceAssets.value.every((face) => face.faceUrl !== url),
    )
    .map((url, index) => {
      const kind = getAssetKind(url);
      return {
        faces: characterFaceAssets.value.filter((face) => face.baseUrl === url),
        kind,
        name: getAssetName(url, index),
        url,
      };
    }),
);

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

function openAssetList(): void {
  if (!context) return;
  const manifest = collectContextAssetManifest(context);
  assetUrls.value = manifest.urls;
  characterFaceAssets.value = manifest.faceAssets;
  showAssetList.value = true;
}

function openCharacterFaces(asset: AssetListItem): void {
  if (asset.faces.length === 0) return;
  selectedCharacterAsset.value = asset;
  selectedCharacterFace.value =
    asset.faces.find((face) => face.used) ?? asset.faces[0] ?? null;
  assetDownloadError.value = null;
  showCharacterFaces.value = true;
}

function selectCharacterFace(face: StoryCharacterFaceAsset): void {
  selectedCharacterFace.value = face;
  assetDownloadError.value = null;
}

function safeFilename(raw: string): string {
  return raw.replace(/[<>:"/\\|?*]/g, "_");
}

function saveBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = safeFilename(filename);
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function downloadSelectedComposite(): Promise<void> {
  const face = selectedCharacterFace.value;
  const asset = selectedCharacterAsset.value;
  if (!face || !asset || !characterFacePreviewRef.value) return;

  downloadingAsset.value = "composite";
  assetDownloadError.value = null;
  try {
    const blob = await characterFacePreviewRef.value.exportComposite();
    const baseName = asset.name.replace(/\.[^.]+$/, "");
    saveBlob(blob, `${baseName}_${face.expression}.png`);
  } catch (error) {
    console.error("[story-player] composite download failed:", error);
    assetDownloadError.value = "合成图下载失败";
  } finally {
    downloadingAsset.value = null;
  }
}

async function downloadSelectedFace(): Promise<void> {
  const face = selectedCharacterFace.value;
  if (!face) return;

  downloadingAsset.value = "face";
  assetDownloadError.value = null;
  try {
    const response = await fetch(face.faceUrl);
    if (!response.ok) throw new Error(`failed to fetch ${face.faceUrl}`);
    saveBlob(await response.blob(), getAssetName(face.faceUrl, 0));
  } catch (error) {
    console.error("[story-player] face download failed:", error);
    assetDownloadError.value = "脸部差分下载失败";
  } finally {
    downloadingAsset.value = null;
  }
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

      <NModal
        v-model:show="showAssetList"
        :to="fullscreenRootRef || undefined"
        preset="card"
        title="资源列表"
        style="width: min(860px, 94vw); max-width: min(860px, 94vw)"
        :bordered="false"
        :auto-focus="false"
      >
        <template #header-extra>
          <NText depth="3" class="text-xs font-normal">
            共 {{ assetItems.length }} 项
          </NText>
        </template>

        <div
          class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] max-h-[70vh] gap-3 overflow-y-auto p-1"
        >
          <article
            v-for="asset in assetItems"
            :key="asset.url"
            class="asset-card min-w-0 overflow-hidden rounded-xl"
          >
            <div
              v-if="asset.kind === 'image'"
              class="asset-preview asset-preview--transparent flex items-center justify-center"
            >
              <NImage
                :src="asset.url"
                :alt="asset.name"
                lazy
                object-fit="contain"
                show-toolbar-tooltip
                class="asset-image h-full w-full overflow-hidden"
              />
            </div>

            <div
              v-else-if="asset.kind === 'audio'"
              class="asset-preview flex items-center justify-center p-3"
            >
              <audio
                :src="asset.url"
                controls
                preload="none"
                class="block h-10 max-w-full w-full"
              />
            </div>

            <video
              v-else-if="asset.kind === 'video'"
              :src="asset.url"
              controls
              preload="metadata"
              class="asset-preview block h-auto w-full object-contain"
            />

            <a
              v-else
              :href="asset.url"
              target="_blank"
              rel="noopener noreferrer"
              class="asset-preview flex items-center justify-center"
              :aria-label="`打开文件 ${asset.name}`"
            >
              <NIcon size="56"><FileIcon /></NIcon>
            </a>

            <div class="p-3">
              <a
                :href="asset.url"
                target="_blank"
                rel="noopener noreferrer"
                class="line-clamp-2 break-all text-sm font-medium leading-5"
                :title="asset.url"
              >
                {{ asset.name }}
              </a>

              <NButton
                v-if="asset.faces.length > 0"
                class="mt-3 w-full"
                size="small"
                secondary
                @click="openCharacterFaces(asset)"
              >
                <template #icon>
                  <NIcon><ImageIcon /></NIcon>
                </template>
                查看表情（{{ asset.faces.length }}）
              </NButton>
            </div>
          </article>
        </div>
      </NModal>

      <NModal
        v-model:show="showCharacterFaces"
        :to="fullscreenRootRef || undefined"
        preset="card"
        :title="`${selectedCharacterAsset?.name ?? '角色'} · 表情预览`"
        style="width: min(1000px, 94vw); max-width: min(1000px, 94vw)"
        :bordered="false"
        :auto-focus="false"
      >
        <template #header-extra>
          <NText depth="3" class="text-xs font-normal">
            共 {{ selectedCharacterAsset?.faces.length ?? 0 }} 项
          </NText>
        </template>

        <div
          v-if="selectedCharacterAsset && selectedCharacterFace"
          class="character-face-browser"
        >
          <section
            class="asset-card min-h-0 min-w-0 flex flex-col overflow-hidden rounded-xl"
          >
            <CharacterFacePreview
              ref="characterFacePreviewRef"
              :base-url="selectedCharacterFace.baseUrl"
              :face-url="selectedCharacterFace.faceUrl"
              :face-rect="selectedCharacterFace.faceRect"
              :label="selectedCharacterFace.expression"
              class="min-h-[280px] flex-1"
            />

            <footer class="face-preview-actions p-3">
              <NSpace :wrap="true">
                <NButton
                  size="small"
                  type="primary"
                  :loading="downloadingAsset === 'composite'"
                  :disabled="Boolean(downloadingAsset)"
                  @click="downloadSelectedComposite"
                >
                  <template #icon>
                    <NIcon><DownloadIcon /></NIcon>
                  </template>
                  下载合成图
                </NButton>
                <NButton
                  size="small"
                  :loading="downloadingAsset === 'face'"
                  :disabled="Boolean(downloadingAsset)"
                  @click="downloadSelectedFace"
                >
                  <template #icon>
                    <NIcon><DownloadIcon /></NIcon>
                  </template>
                  下载脸部差分
                </NButton>
              </NSpace>
              <NText
                v-if="assetDownloadError"
                type="error"
                class="mt-2 block text-xs"
              >
                {{ assetDownloadError }}
              </NText>
            </footer>
          </section>

          <aside class="character-face-options min-h-0" aria-label="脸部差分">
            <NButton
              v-for="face in selectedCharacterAsset.faces"
              :key="`${face.faceUrl}:${face.expression}`"
              class="character-face-option mb-2 w-full last:mb-0 h-auto! p-2!"
              :type="selectedCharacterFace === face ? 'primary' : 'default'"
              :secondary="selectedCharacterFace === face"
              :disabled="Boolean(downloadingAsset)"
              @click="selectCharacterFace(face)"
            >
              <div class="min-w-0 w-full flex items-center gap-2 text-left">
                <div
                  class="face-option-thumbnail h-12 w-12 flex-none overflow-hidden rounded-md"
                >
                  <NImage
                    :src="face.faceUrl"
                    :alt="face.expression"
                    object-fit="contain"
                    preview-disabled
                    class="asset-image h-full w-full overflow-hidden"
                  />
                </div>
                <div class="min-w-0 flex-1 break-all text-sm">
                  <div>{{ face.expression }}</div>
                  <NTag
                    v-if="face.used"
                    class="mt-1 block w-fit"
                    size="tiny"
                    type="success"
                    :bordered="false"
                  >
                    剧情使用
                  </NTag>
                </div>
              </div>
            </NButton>
          </aside>
        </div>
      </NModal>
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

.asset-card {
  border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
}

.asset-preview {
  width: 100%;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: color-mix(in srgb, currentColor 7%, transparent);
}

.asset-preview--transparent {
  background-color: #f4f4f4;
  background-image:
    linear-gradient(45deg, #d8d8d8 25%, transparent 25%),
    linear-gradient(-45deg, #d8d8d8 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #d8d8d8 75%),
    linear-gradient(-45deg, transparent 75%, #d8d8d8 75%);
  background-position:
    0 0,
    0 8px,
    8px -8px,
    -8px 0;
  background-size: 16px 16px;
}

.asset-image :deep(img) {
  display: block;
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.character-face-browser {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 12px;
  height: min(70vh, 680px);
}

.character-face-options {
  overflow-y: auto;
  padding-right: 4px;
}

.face-preview-actions {
  border-top: 1px solid color-mix(in srgb, currentColor 15%, transparent);
}

.face-option-thumbnail {
  background-color: #f4f4f4;
  background-image:
    linear-gradient(45deg, #d8d8d8 25%, transparent 25%),
    linear-gradient(-45deg, #d8d8d8 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #d8d8d8 75%),
    linear-gradient(-45deg, transparent 75%, #d8d8d8 75%);
  background-position:
    0 0,
    0 6px,
    6px -6px,
    -6px 0;
  background-size: 12px 12px;
}

@media (max-width: 700px) {
  .character-face-browser {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(320px, 55vh) auto;
    height: auto;
  }

  .character-face-options {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 0 0 4px;
  }

  .character-face-option {
    flex: 0 0 180px;
    margin-bottom: 0;
  }
}
</style>

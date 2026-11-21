<script setup lang="ts">
import { computed, ref } from "vue";

import {
  AkButton,
  AkCard,
  AkDialog,
  AkEmpty,
  AkIcon,
} from "@mooncellwiki/prts-design-vue";

import AssetImagePreview from "./AssetImagePreview.vue";
import CharacterFaceBrowserModal from "./CharacterFaceBrowserModal.vue";

import type { StoryCharacterFaceAsset } from "../engine/types";

const props = defineProps<{
  urls: string[];
  faceAssets: StoryCharacterFaceAsset[];
}>();
const show = defineModel<boolean>("show", { default: false });

type AssetKind = "audio" | "image" | "other" | "video";

interface AssetListItem {
  faces: StoryCharacterFaceAsset[];
  kind: AssetKind;
  name: string;
  url: string;
}

const selectedImage = ref<AssetListItem | null>(null);
const showImage = ref(false);
const selectedCharacterAsset = ref<AssetListItem | null>(null);
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
  props.urls
    .filter((url) => props.faceAssets.every((face) => face.faceUrl !== url))
    .map((url, index) => {
      const kind = getAssetKind(url);
      return {
        faces: props.faceAssets.filter((face) => face.baseUrl === url),
        kind,
        name: getAssetName(url, index),
        url,
      };
    }),
);

function openCharacterFaces(asset: AssetListItem): void {
  if (asset.faces.length === 0) return;
  selectedCharacterAsset.value = asset;
  showCharacterFaces.value = true;
}

function openImage(asset: AssetListItem): void {
  selectedImage.value = asset;
  showImage.value = true;
}
</script>

<template>
  <AkDialog
    v-model="show"
    class="story-asset-dialog"
    size="lg"
    @keydown.esc.stop
  >
    <template #header>
      资源列表 <span class="asset-count">共 {{ assetItems.length }} 项</span>
    </template>
    <template v-if="show">
      <AkEmpty v-if="!assetItems.length" title="没有可导出的资源" />
      <div v-else class="asset-grid">
        <AkCard v-for="asset in assetItems" :key="asset.url" class="asset-card">
          <template #cover>
            <button
              v-if="asset.kind === 'image'"
              type="button"
              class="asset-preview asset-preview--image"
              :aria-label="`预览图片 ${asset.name}`"
              @click="openImage(asset)"
            >
              <img :src="asset.url" alt="" loading="lazy" decoding="async" />
            </button>

            <div
              v-else-if="asset.kind === 'audio'"
              class="asset-preview asset-preview--audio"
            >
              <audio
                :src="asset.url"
                controls
                preload="none"
                :aria-label="asset.name"
              />
            </div>

            <video
              v-else-if="asset.kind === 'video'"
              :src="asset.url"
              controls
              preload="metadata"
              class="asset-preview asset-preview--video"
              :aria-label="asset.name"
            />

            <a
              v-else
              :href="asset.url"
              target="_blank"
              rel="noopener noreferrer"
              class="asset-preview"
              :aria-label="`打开文件 ${asset.name}`"
            >
              <AkIcon name="empty" :size="40" />
            </a>
          </template>

          <a
            :href="asset.url"
            target="_blank"
            rel="noopener noreferrer"
            class="asset-link"
            :title="asset.url"
          >
            {{ asset.name }}
          </a>

          <AkButton
            v-if="asset.faces.length > 0"
            class="asset-faces"
            size="sm"
            icon="glasses"
            block
            @click="openCharacterFaces(asset)"
          >
            查看表情（{{ asset.faces.length }}）
          </AkButton>
        </AkCard>
      </div>
    </template>
  </AkDialog>

  <!-- 原生对话框都留在播放器树内，原生和网页全屏均可打开。 -->
  <AssetImagePreview
    v-if="show && selectedImage"
    :key="selectedImage.url"
    v-model="showImage"
    :name="selectedImage.name"
    :url="selectedImage.url"
  />
  <CharacterFaceBrowserModal
    v-if="show && selectedCharacterAsset"
    v-model:show="showCharacterFaces"
    :faces="selectedCharacterAsset.faces"
    :filename-base="selectedCharacterAsset.name"
    :title="`${selectedCharacterAsset.name} · 表情预览`"
  />
</template>

<style scoped>
.story-asset-dialog {
  box-sizing: border-box;
  max-width: min(56rem, calc(100vw - 2 * var(--ak-space-3)));
}

.asset-count {
  margin-left: var(--ak-space-2);
  color: var(--ak-fg-muted);
  font-size: var(--ak-fs-xs);
  font-weight: 400;
}

.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 13rem), 1fr));
  gap: var(--ak-space-3);
}

.asset-card {
  min-width: 0;
}

.asset-card :deep(.ak-card__body) {
  padding: var(--ak-space-3);
}

.asset-preview {
  box-sizing: border-box;
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 16 / 10;
  padding: 0;
  border: 0;
  background: var(--ak-bg-inset);
}

.asset-preview--image {
  overflow: hidden;
  background: var(--story-preview-background);
  cursor: zoom-in;
}

.asset-preview--image:is(:hover, :focus-visible) {
  outline: 2px solid var(--ak-focus);
  outline-offset: -2px;
}

.asset-preview--image img {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  object-fit: contain;
}

.asset-preview--audio {
  padding-inline: var(--ak-space-2);
}

.asset-preview--audio audio {
  width: 100%;
}

.asset-preview--video {
  display: block;
  object-fit: contain;
}

.asset-link {
  display: block;
  color: var(--ak-link);
  font-size: var(--ak-fs-sm);
  overflow-wrap: anywhere;
}

.asset-link:hover {
  color: var(--ak-link-hover);
  text-decoration: underline;
}

.asset-faces {
  margin-top: var(--ak-space-2);
}
</style>

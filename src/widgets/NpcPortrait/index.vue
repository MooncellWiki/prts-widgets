<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";

import {
  buildBodies,
  fileBodies,
  loadCharacterMap,
  parseExclude,
  parseKeys,
  type PortraitBody,
} from "./resolve";

const props = defineProps<{
  /** 逗号分隔的剧情 key（模板:角色考据 的 id 或 Module:GetNpcKeyData 查到的） */
  keys: string;
  /** 条目的 nottitleregexp，对 wiki 文件名匹配 */
  exclude?: string;
  /** 条目手写的 wiki 文件名，逗号分隔 */
  files?: string;
  /** 角色名，用作图片替代文本 */
  name?: string;
}>();

type Status = "loading" | "ready" | "error";

const status = ref<Status>("loading");
const bodies = ref<PortraitBody[]>([]);
const bodyIndex = ref(0);
const faceIndex = ref(0);
/** 叠图底图的原始尺寸，脸部区域按它换算成百分比 */
const baseSize = ref<{ width: number; height: number } | null>(null);
/** 主图（全身图或叠图底图）没加载出来；底图原图大的上 MB，偶尔会超时 */
const imageFailed = ref(false);
/** 重试时换掉 key，让 <img> 重建、重新请求 */
const attempt = ref(0);

const body = computed<PortraitBody | undefined>(
  () => bodies.value[bodyIndex.value],
);
const face = computed(() =>
  body.value?.kind === "overlay"
    ? body.value.faces[faceIndex.value]
    : undefined,
);
const alt = computed(() => props.name || "剧情立绘");

const faceStyle = computed(() => {
  const size = baseSize.value;
  if (body.value?.kind !== "overlay" || !size) return null;
  const { x, y, w, h } = body.value.faceRect;
  if (w <= 0 || h <= 0) return null;
  const percent = (value: number, total: number) => `${(value / total) * 100}%`;
  return {
    left: percent(x, size.width),
    top: percent(y, size.height),
    width: percent(w, size.width),
    height: percent(h, size.height),
  };
});

watch(bodyIndex, () => {
  faceIndex.value = 0;
  baseSize.value = null;
  imageFailed.value = false;
});

function retryImage(): void {
  imageFailed.value = false;
  baseSize.value = null;
  attempt.value += 1;
}

function onBaseLoad(event: Event): void {
  const image = event.target as HTMLImageElement;
  baseSize.value = { width: image.naturalWidth, height: image.naturalHeight };
}

async function load(): Promise<void> {
  status.value = "loading";
  try {
    const keys = parseKeys(props.keys);
    // 只有手写文件时不用拉 character.json
    const fromTorappu =
      keys.length > 0
        ? buildBodies(
            keys,
            await loadCharacterMap(),
            parseExclude(props.exclude ?? ""),
          )
        : [];
    bodies.value = [...fromTorappu, ...fileBodies(props.files ?? "")];
    status.value = "ready";
  } catch (error) {
    console.warn("[NpcPortrait]", error);
    status.value = "error";
  }
}

onMounted(load);
</script>

<template>
  <div class="npc-portrait-viewer">
    <p v-if="status === 'loading'" class="npc-portrait-viewer__hint">
      立绘加载中…
    </p>
    <p v-else-if="status === 'error'" class="npc-portrait-viewer__hint">
      立绘加载失败
      <button type="button" class="npc-portrait-viewer__chip" @click="load">
        重试
      </button>
    </p>
    <p v-else-if="!body" class="npc-portrait-viewer__hint">
      该角色暂无剧情立绘
    </p>
    <template v-else>
      <div
        v-if="bodies.length > 1"
        class="npc-portrait-viewer__chips"
        role="tablist"
        aria-label="立绘"
      >
        <button
          v-for="(item, index) in bodies"
          :key="item.id"
          type="button"
          role="tab"
          class="npc-portrait-viewer__chip"
          :aria-selected="index === bodyIndex"
          @click="bodyIndex = index"
        >
          立绘{{ index + 1 }}
        </button>
      </div>

      <div class="npc-portrait-viewer__stage">
        <p v-if="imageFailed" class="npc-portrait-viewer__hint">
          立绘加载失败
          <button
            type="button"
            class="npc-portrait-viewer__chip"
            @click="retryImage"
          >
            重试
          </button>
        </p>
        <a
          v-else-if="body.kind === 'single'"
          :key="`${body.id}@${attempt}`"
          :href="body.url"
          target="_blank"
          rel="noopener"
        >
          <img
            :src="body.url"
            :alt="alt"
            decoding="async"
            @error="imageFailed = true"
          />
        </a>
        <div
          v-else
          :key="`${body.id}@${attempt}`"
          class="npc-portrait-viewer__composite"
        >
          <img
            :src="body.baseUrl"
            :alt="alt"
            decoding="async"
            @load="onBaseLoad"
            @error="imageFailed = true"
          />
          <img
            v-if="face && faceStyle"
            :src="face.url"
            alt=""
            decoding="async"
            class="npc-portrait-viewer__face"
            :style="faceStyle"
          />
        </div>
      </div>

      <div
        v-if="body.kind === 'overlay' && body.faces.length > 1"
        class="npc-portrait-viewer__chips"
        role="tablist"
        aria-label="表情"
      >
        <span class="npc-portrait-viewer__label">表情</span>
        <button
          v-for="(item, index) in body.faces"
          :key="item.name"
          type="button"
          role="tab"
          class="npc-portrait-viewer__chip npc-portrait-viewer__chip--small"
          :aria-selected="index === faceIndex"
          @click="faceIndex = index"
        >
          {{ index + 1 }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* 放在 Vector / Arknights / Minerva 的表格单元格里，明暗主题都用：只用 currentColor 与半透明灰，不写死底色 */
.npc-portrait-viewer {
  max-width: 300px;
  margin: 0 auto;
  text-align: center;
}

.npc-portrait-viewer__hint {
  margin: 0;
  padding: 2em 0;
  opacity: 0.7;
}

.npc-portrait-viewer__stage {
  aspect-ratio: 1;
}

.npc-portrait-viewer__stage img {
  display: block;
  width: 100%;
  height: auto;
}

.npc-portrait-viewer__composite {
  position: relative;
}

/* 位置和大小由 faceStyle 按底图原始尺寸换算成百分比，和 StoryPlayer 的 canvas 合成一样把脸拉伸进 faceRect */
.npc-portrait-viewer__stage .npc-portrait-viewer__face {
  position: absolute;
}

.npc-portrait-viewer__chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin: 4px 0;
}

.npc-portrait-viewer__label {
  margin-right: 2px;
  font-size: 0.85em;
  opacity: 0.7;
}

.npc-portrait-viewer__chip {
  min-width: 2em;
  padding: 1px 8px;
  border: 1px solid rgb(128 128 128 / 40%);
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.85em;
  line-height: 1.6;
  cursor: pointer;
}

.npc-portrait-viewer__chip--small {
  min-width: 1.8em;
  padding: 0 4px;
}

.npc-portrait-viewer__chip:hover {
  border-color: currentColor;
}

.npc-portrait-viewer__chip[aria-selected="true"] {
  border-color: currentColor;
  font-weight: bold;
}
</style>

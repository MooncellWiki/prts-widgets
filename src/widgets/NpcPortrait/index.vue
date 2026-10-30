<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";

import {
  AkButton,
  AkChip,
  AkEmpty,
  AkScope,
  AkSpinner,
  AkTab,
  AkTabs,
} from "@mooncellwiki/prts-design-vue";

import { useHostTheme } from "@/utils/useHostTheme";

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
/** 别的皮肤上按宿主页面的明暗给作用域定主题（见 useHostTheme），Arknights 皮肤上跟皮肤走 */
const theme = useHostTheme();

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
  <!-- .ak-* 是设计系统组件（样式来自皮肤 / skins.arknights.components，入口挂载前已加载）；
       根节点标 ak-not-prose 不吃正文排版，data-no-toggle 让皮肤脚本别替芯片翻状态 -->
  <AkScope
    class="npc-portrait-viewer ak-not-prose"
    :theme="theme"
    data-no-toggle
  >
    <AkSpinner v-if="status === 'loading'" description="立绘加载中…" />
    <AkEmpty v-else-if="status === 'error'" title="立绘加载失败" icon="warn">
      <template #extra>
        <AkButton size="sm" variant="outline" @click="load">重试</AkButton>
      </template>
    </AkEmpty>
    <AkEmpty v-else-if="!body" title="该角色暂无剧情立绘" />
    <template v-else>
      <AkTabs
        v-if="bodies.length > 1"
        v-model="bodyIndex"
        label="立绘"
        class="npc-portrait-viewer__tabs"
      >
        <AkTab
          v-for="(item, index) in bodies"
          :key="item.id"
          :name="index"
          :tab="`立绘${index + 1}`"
        />
      </AkTabs>

      <div class="npc-portrait-viewer__stage">
        <AkEmpty v-if="imageFailed" title="立绘加载失败" icon="warn">
          <template #extra>
            <AkButton size="sm" variant="outline" @click="retryImage">
              重试
            </AkButton>
          </template>
        </AkEmpty>
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

      <!-- 单选芯片组（同设计系统 Chip 文档的「单选」：再点已选中的那枚不取消） -->
      <div
        v-if="body.kind === 'overlay' && body.faces.length > 1"
        class="npc-portrait-viewer__faces"
        role="group"
        aria-label="表情"
      >
        <span class="npc-portrait-viewer__label" aria-hidden="true">表情</span>
        <AkChip
          v-for="(item, index) in body.faces"
          :key="item.name"
          :model-value="index === faceIndex"
          @update:model-value="faceIndex = index"
        >
          {{ index + 1 }}
        </AkChip>
      </div>
    </template>
  </AkScope>
</template>

<style scoped>
.npc-portrait-viewer {
  max-width: 300px;
  margin: 0 auto;
}

/* 别的皮肤上作用域带 data-theme，设计系统会连画布底色一起铺；这里嵌在表格单元格里，不要那块底 */
.npc-portrait-viewer.ak-scope[data-theme] {
  background-color: transparent;
}

/* 页签一行不换行（设计系统里溢出就横向滚动）：宽度不往外撑，否则窄屏上会把整张表格的立绘列撑到 300px、挤扁右边两列 */
.npc-portrait-viewer__tabs {
  width: 0;
  min-width: 100%;
  margin-bottom: var(--ak-space-2);
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

.npc-portrait-viewer__faces {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ak-space-1);
  margin-top: var(--ak-space-2);
}

.npc-portrait-viewer__label {
  margin-right: var(--ak-space-1);
  font: 600 var(--ak-fs-xs) / 1 var(--ak-font-body);
  color: var(--ak-fg-muted);
}
</style>

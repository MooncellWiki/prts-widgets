<script setup lang="ts">
import { ref, shallowRef } from "vue";

import { AkButton, AkScope } from "@mooncellwiki/prts-design-vue";

import { TORAPPU_ENDPOINT } from "@/utils/consts";
import { useHostTheme } from "@/utils/useHostTheme";

import SpineViewer from "./SpineViewer.vue";

import type { SpineMeta } from "./types";

/**
 * 未载入时只有一个「载入模型」按钮（同旧版）：运行时与模型都等点了再取。
 * 有 data-id 时从 torappu 取 meta.json，否则用页面里 #SPINEDATA 的那份
 */
const props = defineProps<{
  conf?: SpineMeta | null;
  id?: string;
}>();

const theme = useHostTheme();
const meta = shallowRef<SpineMeta | null>(null);
const loading = ref(false);
const error = ref("");

async function load() {
  loading.value = true;
  error.value = "";
  try {
    if (props.id) {
      const resp = await fetch(
        `${TORAPPU_ENDPOINT}/assets/char_spine/${props.id}/meta.json`,
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      meta.value = await resp.json();
    } else if (props.conf) {
      meta.value = props.conf;
    } else {
      throw new Error("没有模型数据");
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AkScope class="spine-viewer-widget ak-not-prose" :theme="theme">
    <SpineViewer v-if="meta" :conf="meta" />
    <div v-else class="sv-load">
      <AkButton variant="primary" :loading="loading" @click="load">
        载入模型
      </AkButton>
      <span v-if="error" class="sv-load__error">
        载入失败（{{ error }}），点按钮重试
      </span>
    </div>
  </AkScope>
</template>

<style scoped lang="scss">
// 别的皮肤上根节点带 data-theme（见 useHostTheme），设计系统会连画布底色一起铺；这里嵌在宿主正文里，不要那块底。
// 这些皮肤的正文列不封顶（Vector 宽屏能到 1700），封到 Arknights 皮肤正文列的宽度上下，免得动作列表拉得老长
.spine-viewer-widget.ak-scope[data-theme] {
  background-color: transparent;
  max-width: 1000px;
}

// 未载入：一个按钮，载入失败时旁边一行红字
.sv-load {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}

.sv-load__error {
  font-size: var(--ak-fs-sm);
  color: var(--ak-danger);
}
</style>

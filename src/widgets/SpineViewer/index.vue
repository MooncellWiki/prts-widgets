<script setup lang="ts">
import { ref, shallowRef } from "vue";

import { AkButton, AkScope } from "@mooncellwiki/prts-design-vue";

import { TORAPPU_ENDPOINT } from "@/utils/consts";
import { useHostTheme } from "@/utils/useHostTheme";

import SpineViewer from "./SpineViewer.vue";

import type { SpineMeta } from "./types";

/**
 * 未载入时只有一块矮舞台 + 「载入模型」：运行时与模型都等点了再取，同现网。
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
    <div v-else class="sv">
      <div class="sv__stage ak-bg-grid">
        <AkButton variant="primary" size="lg" :loading="loading" @click="load">
          载入模型
        </AkButton>
        <span class="sv__hint">
          {{
            error
              ? `载入失败（${error}），点按钮重试`
              : "SpineViewer · 战斗正面 / 背面 · 基建 · 全部时装"
          }}
        </span>
      </div>
    </div>
  </AkScope>
</template>

<style scoped lang="scss">
@use "./frame";

// 别的皮肤上根节点带 data-theme（见 useHostTheme），设计系统会连画布底色一起铺；这里嵌在宿主正文里，不要那块底
.spine-viewer-widget.ak-scope[data-theme] {
  background-color: transparent;
}

// 未载入：只有一块矮舞台 + 载入钮（模型与运行时都等点了再取）
.sv {
  @include frame.box;
}

.sv__stage {
  @include frame.stage;
  height: 220px;
  display: grid;
  place-items: center;
}

.sv__hint {
  @include frame.hint;
}

@media (max-width: 767px) {
  .sv__hint {
    display: none;
  }
}
</style>

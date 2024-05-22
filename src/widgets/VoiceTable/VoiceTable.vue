<script lang="ts">
import type { PropType } from "vue";
import { defineComponent, provide, ref } from "vue";

import { NConfigProvider, NSelect } from "naive-ui";

import FormItem from "@/components/FormItem.vue";

import VoicePlayer from "./VoicePlayer.vue";

const isSimplified = !decodeURIComponent(document.title).includes("/语音记录");

export default defineComponent({
  components: {
    NSelect,
    NConfigProvider,
    VoicePlayer,
    FormItem,
  },
  props: {
    tocTitle: String,
    voiceKey: String,
    voiceData: Array as PropType<
      {
        title?: string;
        index?: string;
        fileName?: string;
        directLinks: {
          [index: string]: string;
        };
        cond?: string;
        detail: {
          [index: string]: string;
        };
      }[]
    >,
    langArr: { type: Array as PropType<string[]>, default: () => [] },
    voiceBase: {
      type: Array as PropType<{ lang: string; path: string }[]>,
      default: () => [],
    },
  },
  setup(props) {
    const isCollapsed = ref(true);
    const selectedWordLang = ref(["中文"]);
    const selectedVoicePath = ref(props.voiceBase[0]?.path || "");
    const selectedVoiceLang = ref(props.voiceBase[0]?.lang || "");
    const playKey = ref(-1);

    const onVoicePathUpdate = (
      newValue: string,
      newOptions: { lang: string },
    ) => {
      selectedVoicePath.value = newValue;
      selectedVoiceLang.value = newOptions.lang || "";
    };

    provide("audioElem", new Audio());

    return {
      isSimplified,
      isCollapsed,
      selectedWordLang,
      selectedVoiceLang,
      selectedVoicePath,
      playKey,
      onVoicePathUpdate,
    };
  },
});
</script>

<template>
  <NConfigProvider
    preflight-style-disabled
    :breakpoints="{ s: 640, m: 768, lg: 1024, xl: 1280, xxl: 1536 }"
    :theme-overrides="{ common: { primaryColor: '#6a6aff' } }"
  >
    <div class="max-w-screen-lg">
      <div v-if="!isSimplified" class="mb-1 flex">
        <FormItem label="选择语音文本差分" class="mr-2 flex-grow">
          <NSelect
            v-model:value="selectedWordLang"
            multiple
            :options="langArr.map((v) => ({ label: v, value: v }))"
          />
        </FormItem>
        <FormItem label="选择语音资源差分">
          <NSelect
            :value="selectedVoicePath"
            :options="voiceBase"
            label-field="lang"
            value-field="path"
            @update:value="onVoicePathUpdate"
          />
        </FormItem>
      </div>
      <div
        v-if="isSimplified"
        class="overflow-hidden border border-divider rounded border-solid p-1 text-center font-bold shadow !bg-table"
      >
        <span>{{ tocTitle }}</span>
        <a
          class="z-1 float-right select-none"
          @click="
            () => {
              isCollapsed = !isCollapsed;
            }
          "
        >
          {{ isCollapsed ? "展开" : "折叠" }}
        </a>
      </div>
      <div
        v-show="!isSimplified || !isCollapsed"
        class="table border-collapse overflow-hidden border border-divider rounded border-solid bg-wikitable shadow"
      >
        <div class="table-row-group">
          <div v-for="(ele, index) in voiceData" :key="index" class="table-row">
            <div
              class="table-cell truncate border border-divider border-solid p-1 text-center align-middle font-bold !bg-table"
            >
              {{ ele.title }}
            </div>
            <div
              class="w-full table-cell border border-divider rounded border-solid p-2 align-middle"
            >
              <p v-for="(v, i) in selectedWordLang" :key="i">
                <span
                  :lang="v.includes('日文') ? 'ja' : ''"
                  v-html="ele.detail[v || '中文']"
                />
                <b v-if="ele.cond">({{ ele.cond }})</b>
              </p>
            </div>
            <div
              class="table-cell truncate border border-divider rounded border-solid p-1 align-middle"
            >
              <VoicePlayer
                :key="index"
                v-model:playKey="playKey"
                :direct-link="ele.directLinks[selectedVoiceLang]"
                :voice-id="`${voiceKey}/${ele.title}`"
                :voice-path="`${selectedVoicePath}/${ele.fileName?.replace(
                  /\s/g,
                  '_',
                )}`"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </NConfigProvider>
</template>

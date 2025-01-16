<script setup lang="ts">
import { ref } from "vue";

import { HomeSharp } from "@vicons/material";
import {
  NBreadcrumb,
  NBreadcrumbItem,
  NCard,
  NConfigProvider,
  NDropdown,
  NIcon,
  NLayout,
  NLayoutContent,
  NSpace,
} from "naive-ui";

import { getImagePath } from "@/utils/utils";

import ISEventOption from "./ISEventOption.vue";

interface Option {
  title: string;
  type: string;
  icon: string;
  iconId?: string;
  desc1: string;
  desc2: string;
  dest: number;
  index: number;
  customBadgeText?: string;
}
const props = withDefaults(
  defineProps<{
    sceneData: {
      etype?: string;
      edesc?: string;
      name?: string;
      nav?: string;
      index?: number;
      image?: string;
      text?: string;
      options: Array<Option>;
    }[];
    isTheme: string;
  }>(),
  {
    sceneData: () => [],
  },
);

const sceneNav = ref<Array<number>>([0]);
const currentSceneId = ref(0);
function jump(id: number) {
  if (id) {
    const index = sceneNav.value.indexOf(id);
    if (index === -1) sceneNav.value.push(id);
    else if (index + 1 < sceneNav.value.length)
      sceneNav.value.splice(index + 1);

    currentSceneId.value = id;
  }
}
function navJump(index: number) {
  if (index === sceneNav.value.length - 1) return;

  currentSceneId.value = sceneNav.value[index];
  sceneNav.value.splice(index + 1);
}
function optionsToNavDrop(options: Array<Option>) {
  return options
    .filter((option) => option.type !== "desc")
    .map((option) => {
      return {
        label: option.title,
        key: option.index,
      };
    });
}
function dropJump(key: number, navIndex: number) {
  const option = props.sceneData[sceneNav.value[navIndex]].options[key];
  navJump(navIndex);
  jump(option.dest);
}
</script>

<template>
  <h2 v-if="sceneData[0].etype">
    <span :id="sceneData[0].etype" />
    <span
      :id="encodeURI(sceneData[0].etype).replace(/%/g, '.')"
      class="mw-headline"
    >
      {{ sceneData[0].etype }}
    </span>
  </h2>
  <h3>
    <span :id="sceneData[0].name" />
    <span
      :id="encodeURI(sceneData[0].name!).replace(/%/g, '.')"
      class="mw-headline"
    >
      {{ sceneData[0].name }}
    </span>
  </h3>
  <div v-if="sceneData[0].edesc" v-html="sceneData[0].edesc"></div>
  <NConfigProvider
    preflight-style-disabled
    :theme-overrides="{
      Card: {
        color: '#212121',
        textColor: '#fff',
        titleTextColor: '#fff',
        borderRadius: '3px',
        actionColor: '#343434',
        paddingSmall: '0.8em',
        lineHeight: '1.5',
        titleFontSizeSmall: '1rem',
        fontSizeSmall: '0.8rem',
      },
      Breadcrumb: { itemTextColor: '#A8AFB5' },
      Button: { textColor: '#fff' },
    }"
  >
    <NSpace class="max-w-full w-140">
      <NLayout>
        <NLayoutContent>
          <NBreadcrumb separator=">">
            <NBreadcrumbItem
              v-for="(SceneId, index) in sceneNav"
              :key="index"
              @click="navJump(index)"
            >
              <NDropdown
                v-if="
                  sceneData[SceneId].options.length > 0 &&
                  index !== sceneNav.length - 1
                "
                placement="bottom-start"
                :show-arrow="true"
                :options="optionsToNavDrop(sceneData[SceneId].options)"
                @select="(i) => dropJump(i, index)"
              >
                <div class="trigger">
                  <NIcon v-if="SceneId === 0">
                    <HomeSharp />
                  </NIcon>
                  <span v-else>{{ sceneData[SceneId].nav }}</span>
                </div>
              </NDropdown>
              <div v-else>
                <NIcon v-if="SceneId === 0">
                  <HomeSharp />
                </NIcon>
                <span v-else>{{ sceneData[SceneId].nav }}</span>
              </div>
            </NBreadcrumbItem>
          </NBreadcrumb>
          <NCard
            class="relative"
            :title="sceneData[currentSceneId].name || ''"
            size="small"
          >
            <template #cover>
              <a :href="`/w/File:${sceneData[currentSceneId].image}.png`">
                <img
                  class="img w-140"
                  :src="getImagePath(`${sceneData[currentSceneId].image}.png`)"
                />
              </a>
            </template>
            <div v-html="sceneData[currentSceneId].text" />
            <template v-if="sceneData[currentSceneId].options" #action>
              <NSpace vertical>
                <ISEventOption
                  v-for="(item, index) in sceneData[currentSceneId].options"
                  :key="index"
                  :title="item.title"
                  :type="item.type"
                  :icon="item.icon"
                  :icon-id="item.iconId"
                  :desc1="item.desc1"
                  :desc2="item.desc2"
                  :is-theme="isTheme"
                  :custom-badge-text="item.customBadgeText"
                  @click="jump(item.dest)"
                />
              </NSpace>
            </template>
          </NCard>
        </NLayoutContent>
      </NLayout>
    </NSpace>
  </NConfigProvider>
</template>

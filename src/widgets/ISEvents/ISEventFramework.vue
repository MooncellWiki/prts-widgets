<script lang="ts">
import type { PropType } from "vue";

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
import { defineComponent, ref } from "vue";

import { getImagePath } from "@/utils/utils";

import ISEventOption from "./ISEventOption.vue";

interface Option {
  title: string;
  type: string;
  icon: string;
  desc1: string;
  desc2: string;
  dest: number;
  index: number;
}
export default defineComponent({
  components: {
    NConfigProvider,
    NBreadcrumb,
    NBreadcrumbItem,
    NDropdown,
    NSpace,
    NLayout,
    NLayoutContent,
    NCard,
    NIcon,
    HomeSharp,
    ISEventOption,
  },
  props: {
    sceneData: {
      type: Array as PropType<
        {
          etype?: string;
          name?: string;
          nav?: string;
          index?: number;
          image?: string;
          text?: string;
          options: Array<Option>;
        }[]
      >,
      default: () => [],
    },
    isTheme: String,
  },
  setup(props) {
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
    return {
      getImagePath,
      sceneNav,
      currentSceneId,
      jump,
      navJump,
      optionsToNavDrop,
      dropJump,
    };
  },
});
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
  <NConfigProvider
    preflight-style-disabled
    :theme-overrides="{
      Card: {
        color: '#212121',
        textColor: '#fff',
        titleTextColor: '#fff',
        borderRadius: '5px',
        actionColor: '#343434',
      },
      Breadcrumb: { itemTextColor: '#A8AFB5' },
      Button: { textColor: '#fff' },
    }"
  >
    <NSpace class="w-140 max-w-full">
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
                  class="lazyload img w-140"
                  :data-src="
                    getImagePath(`${sceneData[currentSceneId].image}.png`)
                  "
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
                  :desc1="item.desc1"
                  :desc2="item.desc2"
                  :is-theme="isTheme"
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

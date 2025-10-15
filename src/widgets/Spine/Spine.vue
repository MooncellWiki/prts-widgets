<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import {
  CenterFocusStrongSharp,
  DownloadOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  InfoOutlined,
} from "@vicons/material";
import {
  NButton,
  NColorPicker,
  NIcon,
  NPopover,
  NSelect,
  NSkeleton,
  NSlider,
  NSwitch,
} from "naive-ui";

import Card from "@/components/Card.vue";
import FormItem from "@/components/FormItem.vue";
import { isMobile } from "@/utils/utils";

import Detail from "./Detail.vue";
import { Spine } from "./spine";
import { useEvent } from "./useEvent";

const props = defineProps<{
  prefix: string;
  name: string;
  skin: {
    [key: string]: {
      [key: string]: {
        file: string;
        skin?: string;
      };
    };
  };
}>();

const canvas = ref<HTMLCanvasElement>();
const spineRef: { spine?: Spine } = {};

const isLoading = ref(true);
const speed = ref(1);
const skinList = Object.keys(props.skin!);
const skinListOptions = skinList.map((v) => ({ label: v, value: v }));
const curSkin = ref(skinList[0] ?? "");
const modelList = computed(() => {
  return Object.keys(props.skin![curSkin.value] || {}).map((v) => ({
    label: v,
    value: v,
  }));
});
const curModel = ref(
  Object.keys(props.skin![skinList[0] ?? ""] || {})[0] ?? "",
);
const animations = ref<string[]>([]);
const aniList = computed(() => {
  return animations.value.map((v) => ({ label: v, value: v }));
});
const animationsDetail = ref<{ name: string; duration: number }[]>([]);
const curAni = ref("");
const isLoop = ref(false);
async function load() {
  isLoading.value = true;
  const path =
    props.prefix + (props.skin![curSkin.value]?.[curModel.value]?.file ?? "");
  const { skeleton, state: animationState } = await spineRef.spine!.load(
    `${curSkin.value}-${curModel.value}`,
    `${path}.skel`,
    `${path}.atlas`,
    {
      x: -500,
      y: -200,
      scale: 1,
    },
    props!.skin![curSkin.value]?.[curModel.value]?.skin ?? "",
  );
  const names = (animations.value = skeleton.data.animations.map(
    (v) => v.name,
  ));
  animationsDetail.value = skeleton.data.animations.map((v) => ({
    name: v.name,
    duration: v.duration,
  }));
  isLoading.value = false;
  spineRef.spine!.play(`${curSkin.value}-${curModel.value}`);
  animationState.setAnimation(0, names[0] ?? "", isLoop.value);
  curAni.value = names[0] ?? "";
  animationState.timeScale = speed.value;
}
onMounted(() => {
  console.warn("canvas", canvas.value);
  if (!canvas.value) return;

  spineRef.spine = new Spine(canvas.value);
  load();
});
const { big } = useEvent(canvas, spineRef);
function onSelectSkin(e: string) {
  curSkin.value = e;
  curModel.value = Object.keys(props.skin![e] || {})[0] ?? "";
  load();
}
function onSelectModel(e: string) {
  curModel.value = e;
  load();
}
function onSelectAni(e: string) {
  const cur = spineRef.spine?.getCurrent();
  if (cur) {
    console.log("ani change", cur);
    cur.state.setAnimation(0, e, isLoop.value);
    cur.state.timeScale = speed.value;
  }
}
function onChangeLoop(e: boolean) {
  const state = spineRef.spine?.getCurrent()?.state;
  if (!state) return;

  state.setAnimation(0, state.tracks[0]?.animation?.name ?? "", e);
}
function onChangeColor(e: string) {
  if (!spineRef.spine) return;

  // console.log(e)
  const color = Number.parseInt(e.slice(1), 16);
  // console.log(color);
  spineRef.spine.bg = [
    (color >>> 24) / 255,
    ((color & 0x00_ff_00_00) >>> 16) / 255,
    ((color & 0x00_00_ff_00) >>> 8) / 255,
    (color & 0x00_00_00_ff) / 255,
  ];
}
function onChangeSpeed(e: number) {
  const state = spineRef.spine?.getCurrent()?.state;
  if (!state) return;

  state.timeScale = e;
}
function reset() {
  spineRef.spine?.transform(-500, -200, 1);
}
const supportWebm =
  window.MediaRecorder &&
  MediaRecorder.isTypeSupported("video/webm") &&
  !isMobile();
const recording = ref(false);
async function record() {
  if (!spineRef.spine || recording.value) return;

  recording.value = true;
  await spineRef.spine.record(
    curAni.value,
    `${props.name}-${curSkin.value}-${curModel.value}-${curAni.value}-x${speed.value}`,
  );
  recording.value = false;
}
</script>

<template>
  <Card
    :style="{ width: !isMobile() ? 'fit-content' : '' }"
    class="relative bg-white"
  >
    <div
      :class="{ 'pr-5': !isMobile() }"
      class="m-5 flex flex-wrap justify-around"
    >
      <div
        class="h-[400px] w-[330px] flex flex-col justify-around pr-4 space-y-2"
      >
        <FormItem label="时装组">
          <NSelect
            v-model:value="curSkin"
            :options="skinListOptions"
            @update:value="onSelectSkin"
          />
        </FormItem>
        <FormItem label="模型组">
          <NSelect
            v-model:value="curModel"
            :options="modelList"
            @update:value="onSelectModel"
          />
        </FormItem>
        <FormItem label="动画">
          <NSelect
            v-model:value="curAni"
            :options="aniList"
            @update:value="onSelectAni"
          />
        </FormItem>
        <div class="flex">
          <FormItem label="循环播放" class="mr-2">
            <div>
              <NSwitch
                v-model:value="isLoop"
                size="small"
                @update:value="onChangeLoop"
              />
            </div>
          </FormItem>
          <FormItem label="背景颜色" class="flex-grow">
            <NColorPicker
              size="small"
              default-value="#00000000"
              :swatches="[
                '#00000000',
                '#FFFFFFFF',
                '#DBDBDBFF',
                '#2F2F2FFF',
                '#000000FF',
                '#FF0000FF',
                '#00FF00FF',
                '#0000FFFF',
              ]"
              :show-preview="true"
              @update:value="onChangeColor"
            />
          </FormItem>
        </div>
        <FormItem label-placement="left" label="播放速度">
          <NSlider
            v-model:value="speed"
            :min="0.1"
            :max="2"
            :step="0.1"
            :marks="{
              0.1: 'x0.1',
              0.5: 'x0.5',
              1: 'x1.0',
              1.5: 'x1.5',
              2: 'x2.0',
            }"
            :format-tooltip="
              (value) => {
                return `x${value.toFixed(1)}`;
              }
            "
            @update:value="onChangeSpeed"
          />
        </FormItem>
        <div class="flex justify-around">
          <NPopover v-if="supportWebm">
            <template #trigger>
              <NButton circle size="large" @click="record">
                <template #icon>
                  <NIcon :size="28">
                    <DownloadOutlined />
                  </NIcon>
                </template>
              </NButton>
            </template>
            实验性WEBM导出
          </NPopover>
          <NPopover v-if="supportWebm">
            <template #trigger>
              <NButton circle size="large" @click="reset">
                <template #icon>
                  <NIcon :size="28">
                    <CenterFocusStrongSharp />
                  </NIcon>
                </template>
              </NButton>
            </template>
            重置模型中心
          </NPopover>
          <NPopover v-if="supportWebm">
            <template #trigger>
              <NButton
                circle
                size="large"
                @click="
                  () => {
                    big = !big;
                  }
                "
              >
                <template #icon>
                  <NIcon :size="28">
                    <FullscreenExitOutlined v-if="big" />
                    <FullscreenOutlined v-else />
                  </NIcon>
                </template>
              </NButton>
            </template>
            <span v-if="big">小屏查看</span>
            <span v-else>大屏查看</span>
          </NPopover>

          <NPopover trigger="hover">
            <template #trigger>
              <NButton circle size="large">
                <template #icon>
                  <NIcon :size="28">
                    <InfoOutlined />
                  </NIcon>
                </template>
              </NButton>
            </template>
            <b>模型动画数据</b>
            <Detail :details="animationsDetail" />
          </NPopover>
        </div>
      </div>
      <div
        class="relative overflow-hidden"
        :style="{
          width: big ? '1000px' : '300px',
          height: big ? '1000px' : '300px',
        }"
      >
        <NSkeleton
          v-if="isLoading"
          class="absolute right-0 top-0 h-full w-full"
        />
        <div
          :style="{
            backgroundImage:
              'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(135deg, #ccc 25%, transparent 25%),linear-gradient(45deg, transparent 75%, #ccc 75%),linear-gradient(135deg, transparent 75%, #ccc 75%)',
            backgroundSize: '24px 24px',
            backgroundPosition: '0 0, 12px 0, 12px -12px, 0px 12px',
          }"
        >
          <div
            :style="{
              width: 1000,
              height: 1000,
              transformOrigin: 'top left',
              transform: big ? '' : 'scale(0.3,0.3)',
              display: isLoading ? 'none' : 'block',
            }"
          >
            <canvas ref="canvas" width="1000" height="1000" />
          </div>
        </div>
      </div>
    </div>
    <div
      v-if="recording"
      class="absolute bottom-0 left-0 right-0 top-0 h-full flex items-center justify-center"
      :style="{ backgroundColor: 'rgba(0,0,0,0.4)' }"
    >
      <div class="rounded bg-white p-4">
        正在导出 {{ name }}-{{ curSkin }}-{{ curModel }}-{{ curAni }}-x{{
          speed
        }}.webm
      </div>
    </div>
  </Card>
</template>

<template>
  <card :style="{ width: 'fit-content' }" class="bg-white relative">
    <div class="m-5 flex justify-around">
      <div class="w-[330px] h-[300px] pr-4 flex flex-col justify-around">
        <form-item label="皮肤">
          <n-select :options="skinList" v-model:value="curSkin" @update:value="onSelectSkin"></n-select>
        </form-item>
        <form-item label="模型">
          <n-select :options="modelList" v-model:value="curModel" @update:value="onSelectModel"></n-select>
        </form-item>
        <form-item label="动画">
          <n-select :options="aniList" v-model:value="curAni" @update:value="onSelectAni"></n-select>
        </form-item>
        <div class="flex">
          <form-item label="循环播放" class="mr-2">
            <div>
              <n-switch size="small" v-model:value="isLoop" @update:value="onChangeLoop"></n-switch>
            </div>
          </form-item>
          <form-item label="背景颜色" class="flex-grow">
            <n-color-picker size="small" :actions="['confirm']" @confirm="onChangeColor" default-value="#00000000" />
          </form-item>
        </div>
        <form-item label-placement="left" label="播放速度">
          <n-slider :min="0.1" :max="2" :step="0.1" v-model:value="speed" @update:value="onChangeSpeed"></n-slider>
        </form-item>
        <div class="flex justify-around">
          <n-popover v-if="supportWebm">
            <template #trigger>
              <n-button circle size="large" @click="record">
                <template #icon>
                  <n-icon :size="28">
                    <DownloadOutlined />
                  </n-icon>
                </template>
              </n-button>
            </template>
            实验性WEBM导出
          </n-popover>
          <n-button circle size="large" @click="reset">
            <template #icon>
              <n-icon :size="28">
                <RefreshOutlined />
              </n-icon>
            </template>
          </n-button>
          <n-button circle size="large" @click="() => { big = !big }">
            <template #icon>
              <n-icon :size="28">
                <FullscreenExitOutlined v-if="big" />
                <FullscreenOutlined v-else />
              </n-icon>
            </template>
          </n-button>
          <n-popover trigger="hover">
            <template #trigger>
              <n-button circle size="large">
                <template #icon>
                  <n-icon :size="28">
                    <InfoOutlined />
                  </n-icon>
                </template>
              </n-button>
            </template>
            <Detail :detailes="animationsDetail"></Detail>
          </n-popover>
        </div>
      </div>
      <div class="overflow-hidden relative" :style="{
        width: big ? '1000px' : '300px',
        height: big ? '1000px' : '300px',
      }">
        <n-skeleton class="w-full h-full absolute top-0 right-0" v-if="isLoading"></n-skeleton>
        <div :style="
          {
            backgroundImage: 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(135deg, #ccc 25%, transparent 25%),linear-gradient(45deg, transparent 75%, #ccc 75%),linear-gradient(135deg, transparent 75%, #ccc 75%)',
            backgroundSize: '24px 24px',
            backgroundPosition: '0 0, 12px 0, 12px -12px, 0px 12px',
          }
        ">
          <div :style="{
            width: 1000,
            height: 1000,
            transformOrigin: 'top left',
            transform: big ? '' : 'scale(0.3,0.3)',
            display: isLoading ? 'none' : 'block',
          }
          ">
            <canvas width="1000" height="1000" ref="canvas" />
          </div>
        </div>
      </div>
    </div>
    <div v-if="recording" class="absolute top-0 bottom-0 right-0 left-0 h-full flex justify-center items-center"
      :style="{ backgroundColor: 'rgba(0,0,0,0.4)' }">
      <div class="bg-white p-4 rounded ">正在导出 {{ name }}-{{ curSkin }}-{{ curModel }}-{{ curAni }}-x{{ speed }}.webm</div>
    </div>
  </card>
</template>
<script lang="ts">
import { computed, defineComponent, onMounted, PropType, ref, render, h } from "vue";
import {
  NButton,
  NSkeleton,
  // NForm,
  // NFormItem,
  NSelect,
  NSwitch,
  NColorPicker,
  NSlider,
  NIcon,
  NPopover,
} from "naive-ui";
import {
  DownloadOutlined,
  RefreshOutlined,
  FullscreenOutlined,
  InfoOutlined,
  FullscreenExitOutlined
} from "@vicons/material";
import { useEvent } from "./useEvent";
import { Spine } from "../../utils/spine";
import FormItem from "../../components/FormItem.vue";
import Card from "../../components/Card.vue";
import Detail from './Detail.vue';
import { isMobile } from "../../utils/utils";
interface States {
  skin: string;
  modelList: string[];
  model: string;
  animations: string[];
  animation: string;
}
enum Actions {
  changeSkin,
  changeModel,
  changeAni,
  update,
}
export interface Props {
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
}
export default defineComponent({
  components: {
    NButton,
    NSkeleton,
    // NForm,
    // NFormItem,
    NSelect,
    NSwitch,
    NColorPicker,
    NSlider,
    NIcon,
    NPopover,
    DownloadOutlined,
    RefreshOutlined,
    FullscreenOutlined,
    InfoOutlined,
    FullscreenExitOutlined,
    FormItem,
    Card,
    Detail
  },
  props: {
    prefix: String,
    name: String,
    skin: Object as PropType<{
      [key: string]: {
        [key: string]: {
          file: string;
          skin?: string;
        };
      };
    }>,
  },
  setup(props) {
    const canvas = ref<HTMLCanvasElement>();
    let spineRef: { spine?: Spine } = {};

    const isLoading = ref(true);
    const color = ref('#00000000');
    const speed = ref(1);
    const skinList = Object.keys(props.skin!!);
    const curSkin = ref(skinList[0]);
    const modelList = computed(() => {
      return Object.keys(props.skin!![curSkin.value]).map(v => ({ label: v, value: v }));
    })
    const curModel = ref(Object.keys(props.skin!![skinList[0]])[0]);
    const animations = ref<string[]>([]);
    const aniList = computed(() => {
      return animations.value.map(v => ({ label: v, value: v }));
    })
    const animationsDetail = ref<{ name: string; duration: number; }[]>([]);
    const curAni = ref('');
    const isLoop = ref(false);
    async function load() {
      isLoading.value = true;
      const path = props.prefix + props.skin!![curSkin.value][curModel.value].file;
      const { skeleton, state: animationState } = await spineRef.spine!!.load(`${curSkin.value}-${curModel.value}`, `${path}.skel`, `${path}.atlas`, {
        x: -500,
        y: -200,
        scale: 1,
      });
      const names = animations.value = skeleton.data.animations.map((v) => v.name);
      animationsDetail.value = skeleton.data.animations.map((v) => ({ name: v.name, duration: v.duration })),
        isLoading.value = false;
      spineRef.spine!!.play(`${curSkin.value}-${curModel.value}`);
      animationState.setAnimation(0, names[0], isLoop.value);
      curAni.value = names[0];
      animationState.timeScale = speed.value;
    }
    onMounted(() => {
      console.warn('canvas', canvas.value);
      if (!canvas.value) {
        return;
      }
      spineRef.spine = new Spine(canvas.value);
      load();
    });
    const { big } = useEvent(canvas, spineRef);
    function onSelectSkin(e: string) {
      curSkin.value = e;
      load();
    }
    function onSelectModel(e: string) {
      curModel.value = e;
      load();
    }
    function onSelectAni(e: string) {
      const cur = spineRef.spine?.getCurrent();
      if (cur) {
        console.log('ani change', cur);
        cur.state.setAnimation(0, e, isLoop.value);
        cur.state.timeScale = speed.value;
      }
    }
    function onChangeLoop(e: boolean) {
      const state = spineRef.spine?.getCurrent()?.state;
      if (!state) {
        return;
      }
      state.setAnimation(
        0,
        state.tracks[0].animation.name,
        e
      );
    }
    function onChangeColor(e: string) {
      if (!spineRef.spine) {
        return;
      }
      const color = parseInt(e.slice(1), 16);
      console.log(color);
      spineRef.spine.bg = [(color >>> 24) / 255, ((color & 0x00ff0000) >>> 16) / 255, ((color & 0x0000ff00) >>> 8) / 255, (color & 0x000000ff) / 255];
    }
    function onChangeSpeed(e: number) {
      const state = spineRef.spine?.getCurrent()?.state;
      if (!state) {
        return;
      }
      state.timeScale = e;
    }
    function reset() {
      spineRef.spine?.transform(-500, -200, 1);
    }
    const supportWebm =
      window.MediaRecorder && MediaRecorder.isTypeSupported('video/webm') && !isMobile();
    const recording = ref(false);
    async function record() {
      if (!spineRef.spine || recording.value) {
        return;
      }
      recording.value = true;
      await spineRef.spine.record(curAni.value, `${name}-${curSkin.value}-${curModel.value}-${curAni.value}-x${speed.value}`)
      recording.value = false;
    }
    return {
      canvas,
      big,
      isLoading,
      isLoop,
      speed,
      onChangeSpeed,
      color,
      onChangeColor,
      skinList: skinList.map(v => ({ label: v, value: v })),
      curSkin,
      modelList,
      curModel,
      aniList,
      curAni,
      onSelectSkin,
      onSelectModel,
      onSelectAni,
      onChangeLoop,
      reset,
      animationsDetail,
      supportWebm,
      record,
      recording
    };
  },
});
</script>

<script setup lang="ts">
import { computed, ref } from "vue";

import {
  DownloadOutlined as GetAppIcon,
  PauseFilled as PauseIcon,
  PlayArrowFilled as PlayArrowIcon,
} from "@vicons/material";
import {
  NButton,
  NCard,
  NIcon,
  NSelect,
  NSlider,
  NSpin,
  NTooltip,
} from "naive-ui";

import Volume from "./Volume.vue";
import { useAudio } from "./hooks/useAudio";
import { sec2str } from "./utils/time";
enum Quality {
  Low = 0,
  High = 1,
}

const props = defineProps({
  name: String,
  title: String,
  lowSource: String,
  highSource: String,
  p: Number,
});

const quality = ref<Quality>(Quality.High);

const low = useAudio(props.lowSource || "", props.p || 0);
const high = useAudio(props.highSource || "", props.p || 0);

const qualityOptions = [
  { label: "wav", value: Quality.High },
  { label: "mp3", value: Quality.Low },
];

const currentAudio = computed(() => {
  return quality.value === Quality.Low ? low : high;
});

const playAble = computed(() => {
  return (
    currentAudio.value.state.value !== "idle" &&
    currentAudio.value.state.value !== "loading"
  );
});

const playIconToolTip = computed(() => {
  switch (currentAudio.value.state.value) {
    case "idle": {
      return "开始加载";
    }
    case "loading": {
      return "加载中...";
    }
    case "loaded": {
      return "播放";
    }
    case "playing": {
      return "暂停";
    }
    case "paused": {
      return "继续播放";
    }
    default: {
      return "";
    }
  }
});

function playIconHandler() {
  console.log("playIconHandler", currentAudio.value.state);
  switch (currentAudio.value.state.value) {
    case "idle": {
      currentAudio.value.load();
      break;
    }

    case "loaded": {
      currentAudio.value.play();
      break;
    }

    case "playing": {
      currentAudio.value.pause();
      break;
    }

    case "paused": {
      currentAudio.value.play();
      break;
    }
  }
}

function handleSeek(value: number) {
  currentAudio.value.seek(value);
}

function handleQualityChange(value: Quality) {
  low.stopped.value = value === Quality.High;
  high.stopped.value = value === Quality.Low;

  quality.value = value;
}
</script>

<template>
  <n-card :bordered="false" class="audio-player">
    <div v-if="name || title" class="header">
      <div v-if="title" class="title" v-html="title"></div>
      <div v-else class="title">{{ name }}</div>
    </div>

    <div class="slider-group">
      <div class="time-display">
        {{ sec2str(currentAudio.process.value) }}/{{
          sec2str(currentAudio.len.value)
        }}
      </div>
      <n-slider
        class="progress-slider"
        :disabled="!playAble"
        :value="currentAudio.process.value"
        :min="0"
        :format-tooltip="sec2str"
        :max="currentAudio.len.value"
        @update:value="handleSeek"
      />
    </div>

    <div class="control-bar">
      <n-tooltip>
        <template #trigger>
          <n-spin :show="currentAudio.state.value === 'loading'" size="small">
            <n-button
              quaternary
              circle
              :disabled="currentAudio.state.value === 'loading'"
              @click="playIconHandler"
            >
              <template #icon>
                <n-icon v-if="currentAudio.state.value === 'playing'">
                  <PauseIcon />
                </n-icon>
                <n-icon v-else>
                  <PlayArrowIcon />
                </n-icon>
              </template>
            </n-button>
          </n-spin>
        </template>
        {{ playIconToolTip }}
      </n-tooltip>

      <n-tooltip :disabled="!playAble">
        <template #trigger>
          <n-button
            quaternary
            circle
            :disabled="!playAble"
            @click="currentAudio.changeLoop()"
          >
            <template #icon>
              <span v-if="currentAudio.loop.value" class="mdi mdi-autorenew" />
              <span v-else class="mdi mdi-autorenew-off" />
            </template>
          </n-button>
        </template>
        {{ currentAudio.loop.value ? "循环播放" : "顺序播放" }}
      </n-tooltip>

      <Volume
        v-model:vol="currentAudio.vol.value"
        v-model:mute="currentAudio.mute.value"
      />

      <n-button quaternary circle @click="currentAudio.download()">
        <template #icon>
          <n-icon>
            <GetAppIcon />
          </n-icon>
        </template>
      </n-button>

      <n-select
        class="quality-select"
        :value="quality"
        :options="qualityOptions"
        @update:value="handleQualityChange"
      />
    </div>
  </n-card>
</template>

<style scoped>
.audio-player {
  max-width: 800px;
  padding: 16px;
}

.header {
  padding: 0;
  margin-bottom: 12px;
}

.title {
  font-size: 1.25rem;
  font-weight: 500;
}

.slider-group {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.time-display {
  min-width: 80px;
  margin-right: 12px;
}

.progress-slider {
  flex: 1;
}

.control-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.quality-select {
  width: 80px;
  margin-left: 8px;
}
</style>

<script setup lang="ts">
import { ref, computed } from "vue";

import {
  PlayArrowFilled as PlayArrowIcon,
  PauseFilled as PauseIcon,
  DownloadOutlined as GetAppIcon,
} from "@vicons/material";
import {
  NButton,
  NIcon,
  NTooltip,
  NSelect,
  NCard,
  NSlider,
  NSpin,
} from "naive-ui";

import Volume from "./Volume.vue";
import { useAudio, PlayState, PlayerAction } from "./hooks/useAudio";

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
    currentAudio.value.state.value !== PlayState.Idle &&
    currentAudio.value.state.value !== PlayState.Loading
  );
});

const playIconToolTip = computed(() => {
  switch (currentAudio.value.state.value) {
    case PlayState.Idle: {
      return "开始加载";
    }
    case PlayState.Loading: {
      return "加载中...";
    }
    case PlayState.Loaded:
    case PlayState.Stopped: {
      return "播放";
    }
    case PlayState.Playing: {
      return "暂停";
    }
    case PlayState.Paused: {
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
    case PlayState.Idle: {
      currentAudio.value.control(PlayerAction.Load);
      break;
    }

    case PlayState.Loaded: {
      currentAudio.value.control(PlayerAction.Play);
      break;
    }

    case PlayState.Playing: {
      currentAudio.value.control(PlayerAction.Pause);
      break;
    }

    case PlayState.Paused: {
      currentAudio.value.control(PlayerAction.Play);
      break;
    }
  }
}

function toggleLoop() {
  currentAudio.value.control(PlayerAction.ChangeLoop);
}

function handleSeek(value: number) {
  currentAudio.value.control(PlayerAction.Process, value);
}

function handleQualityChange(value: Quality) {
  currentAudio.value.control(PlayerAction.Stop);
  quality.value = value;
}

function download() {
  currentAudio.value.control(PlayerAction.Download, 0);
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
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
        {{ formatTime(currentAudio.process.value) }}/{{
          formatTime(currentAudio.len.value)
        }}
      </div>
      <n-slider
        class="progress-slider"
        :disabled="!playAble"
        :value="currentAudio.process.value"
        :min="0"
        :format-tooltip="formatTime"
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
          <n-button quaternary circle :disabled="!playAble" @click="toggleLoop">
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

      <n-button quaternary circle @click="download()">
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

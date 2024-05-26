<script setup lang="ts">
import { computed, getCurrentInstance, inject, ref, watch } from "vue";

import { getImagePath } from "@/utils/utils";

const isSimplified = !decodeURIComponent(window.location.href).includes(
  "/语音",
);
const pauseImageSource = getImagePath("Pause.png");
const playImageSource = getImagePath("Play.png");
const downloadImageSource = getImagePath("Download.png");
const props = defineProps<{
  directLink?: string;
  voiceId?: string;
  voicePath?: string;
  playKey?: number;
}>();
const emit = defineEmits<{
  "update:playKey": [number];
}>();

const key = getCurrentInstance()?.vnode.key;

const source = computed(
  () => `//torappu.prts.wiki/assets/audio/${props.voicePath}`,
);
const transformSourceURL = (ext: string) =>
  source.value.replaceAll(".wav", ext);

const fileName = computed(() => props.voiceId?.split("/").pop());
const audioHref = computed(
  () => props.directLink || `${source.value}?filename=${fileName.value}.wav`,
);
const playing = ref(false);
const audioElem = inject<HTMLAudioElement>("audioElem") ?? new Audio();

const pause = () => {
  playing.value = false;
  audioElem?.pause();
};
const play = () => {
  playing.value = true;
  audioElem.src = props.directLink || transformSourceURL(".mp3");
  emit("update:playKey", key as number);

  const playPromise = audioElem?.play();
  if (playPromise) {
    playPromise.catch(() => {
      playing.value = false;
    });
  }
  audioElem.addEventListener("ended", () => {
    playing.value = false;
  });
};

watch(
  () => props.voicePath,
  () => {
    playing.value = false;
    audioElem?.pause();
  },
);

watch(
  () => props.playKey,
  (newVal) => {
    if (newVal !== key) playing.value = false;
  },
);
</script>

<template>
  <div class="container">
    <img
      class="cursor-pointer <sm:w-7 md:w-10"
      :title="playing ? '暂停' : '播放'"
      :src="playing ? pauseImageSource : playImageSource"
      @click="
        () => {
          playing ? pause() : play();
        }
      "
    />
    <a
      v-if="!isSimplified && voicePath"
      :href="audioHref"
      :download="`${fileName}.wav`"
    >
      <img
        class="cursor-pointer <sm:w-7 md:w-10"
        title="下载"
        :src="downloadImageSource"
      />
    </a>
  </div>
</template>

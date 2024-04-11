<script lang="ts">
import {
  computed,
  defineComponent,
  getCurrentInstance,
  inject,
  ref,
  watch,
} from "vue";

import { MEDIA_ENDPOINT } from "@/utils/consts";
import { getImagePath } from "@/utils/utils";

const isSimplified = !decodeURIComponent(window.location.href).includes(
  "/语音",
);
const pauseImageSource = getImagePath("Pause.png");
const playImageSource = getImagePath("Play.png");
const downloadImageSource = getImagePath("Download.png");

export default defineComponent({
  props: {
    directLink: String,
    voiceId: String,
    voicePath: String,
    playKey: Number,
  },
  emits: ["update:playKey"],
  setup(props, { emit }) {
    const key = getCurrentInstance()?.vnode.key;

    const source = computed(
      () => `//torappu.prts.wiki/assets/audio/${props.voicePath}`,
    );
    const transformSourceURL = (ext: string) =>
      source.value.replaceAll(".wav", ext);

    const fileName = computed(() => props.voiceId?.split("/").pop());
    const audioHref = computed(
      () =>
        props.directLink || `${source.value}?filename=${fileName.value}.wav`,
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
      emit("update:playKey", key);

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

    return {
      source,
      playing,
      isSimplified,
      audioElem,
      fileName,
      audioHref,
      pause,
      play,
      MEDIA_ENDPOINT,
      pauseImageSource,
      playImageSource,
      downloadImageSource,
    };
  },
});
</script>

<template>
  <div class="container">
    <img
      class="md:w-10 <sm:w-7 cursor-pointer"
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
        class="md:w-10 <sm:w-7 cursor-pointer"
        title="下载"
        :src="downloadImageSource"
      />
    </a>
  </div>
</template>

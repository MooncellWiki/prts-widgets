<!-- eslint-disable vue/no-mutating-props -->
<template>
  <div class="container">
    <img
      class="md:w-10 <sm:w-7 cursor-pointer"
      :title="playing ? '暂停' : '播放'"
      :src="playing ? '/images/4/47/Pause.png' : '/images/9/90/Play.png'"
      @click="
        () => {
          playing ? pause() : play()
        }
      "
    />
    <a
      v-if="!isSimplified && voicePath"
      :href="`//static.prts.wiki/${voicePath}?filename=${fileName}.wav`"
      :download="`${fileName}.wav`"
    >
      <img
        class="md:w-10 <sm:w-7 cursor-pointer lazyload"
        title="下载"
        data-src="/images/f/f1/Download.png"
      />
    </a>
  </div>
</template>

<script lang="ts">
import {
  computed,
  defineComponent,
  getCurrentInstance,
  inject,
  ref,
  watch,
} from 'vue'

const isSimplified =
  decodeURIComponent(window.location.href).indexOf('/语音') === -1

export default defineComponent({
  props: {
    voiceId: String,
    voicePath: String,
    playKey: Number,
  },
  setup(props, { emit }) {
    const key = getCurrentInstance()?.vnode.key
    const source = computed(() => `//static.prts.wiki/${props.voicePath}`)
    const fileName = computed(() => props.voiceId?.split('/').pop())
    const playing = ref(false)
    const audioElem = inject<HTMLAudioElement>('audioElem') ?? new Audio()

    const pause = () => {
      playing.value = false
      audioElem?.pause()
    }
    const play = () => {
      audioElem.src = source.value
      emit('update:playKey', key)

      var playPromise = audioElem?.play()
      if (playPromise) {
        playPromise
          .then(() => {
            playing.value = true
          })
          .catch(() => {
            playing.value = false
          })
      }
    }

    watch(
      () => props.voicePath,
      () => {
        playing.value = false
        audioElem?.pause()
      },
    )

    watch(
      () => props.playKey,
      (newVal) => {
        if (newVal != key) {
          playing.value = false
        }
      },
    )

    return {
      source,
      playing,
      isSimplified,
      audioElem,
      fileName,
      pause,
      play,
    }
  },
})
</script>

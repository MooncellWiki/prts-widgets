<template>
  <div class="container">
    <img
      class="md:w-10 <sm:w-7 cursor-pointer"
      :title="playing ? '暂停' : '播放'"
      :src="playing ? '/images/4/47/Pause.png' : '/images/9/90/Play.png'"
      @click="
        () => {
          loaded || load()
          playing ? pause() : play()
          playing = !playing
        }
      "
    />
    <a
      v-if="!isSimplified && voicePath"
      :href="`//static.prts.wiki/${voicePath}`"
      :download="voicePath.split('/')[voicePath.split('/').length - 1]"
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
import { computed, defineComponent, ref, watch } from 'vue'

const isSimplified =
  decodeURIComponent(window.location.href).indexOf('/语音') === -1

export default defineComponent({
  props: {
    voiceId: String,
    voicePath: String,
  },
  setup(props) {
    const audioRef = ref<HTMLAudioElement>()
    const source = computed(() => `//static.prts.wiki/${props.voicePath}`)

    let audioCtx: AudioContext | null
    let audioSource: AudioBufferSourceNode | null
    const loaded = ref(false)
    const playing = ref(false)
    const suspended = ref(false)
    const load = () => {
      loaded.value = true
      audioCtx = new AudioContext()
      audioSource = audioCtx.createBufferSource()
      fetch(source.value)
        .then((response) => response.arrayBuffer())
        .then((arrayBuffer) => audioCtx?.decodeAudioData(arrayBuffer))
        .then((audioBuffer) => {
          if (audioSource) {
            audioSource.buffer = audioBuffer || null
            audioSource.connect((audioCtx as AudioContext).destination)
          }
        })
      audioSource?.start()
    }
    const play = () => {
      return suspended.value && audioCtx?.resume()
    }
    const pause = () => {
      audioCtx?.suspend()
      suspended.value = true
    }

    watch(
      () => props.voicePath,
      () => {
        audioCtx?.close()
        audioCtx = null
        audioSource = null
        playing.value = false
        loaded.value = false
        suspended.value = false
      },
    )
    return {
      playing,
      isSimplified,
      audioRef,
      loaded,
      load,
      play,
      pause,
    }
  },
})
</script>

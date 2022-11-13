<template>
  <div class="container">
    <img
      class="md:w-10 <sm:w-7 cursor-pointer"
      :title="playing ? '暂停' : '播放'"
      :src="playing ? '/images/4/47/Pause.png' : '/images/9/90/Play.png'"
      @click="
        () => {
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
    const source = computed(() => `//static.prts.wiki/${props.voicePath}`)

    let audioCtx: AudioContext | null = new AudioContext()
    let _audioBuffer: AudioBuffer | null = null

    const playing = ref(false)
    const suspended = ref(false)

    const playSound = (buffer: AudioBuffer | null) => {
      if (audioCtx == null || buffer == null) return
      var source = audioCtx.createBufferSource()
      source.buffer = buffer
      source.connect(audioCtx?.destination)
      source.onended = () => {
        playing.value = false
        suspended.value = false
      }
      source.start()
    }
    const load = () => {
      fetch(source.value)
        .then((response) => response.arrayBuffer())
        .then((arrayBuffer) => audioCtx?.decodeAudioData(arrayBuffer))
        .then((audioBuffer) => {
          if (audioBuffer) {
            _audioBuffer = audioBuffer
            playSound(_audioBuffer)
          }
        })
    }
    const play = () => {
      if (suspended.value) {
        audioCtx?.resume().then(() => (suspended.value = false))
      } else {
        if (_audioBuffer) playSound(_audioBuffer)
        else load()
      }
    }
    const pause = () => {
      audioCtx?.suspend().then(() => (suspended.value = true))
    }

    watch(
      () => props.voicePath,
      () => {
        audioCtx?.close()
        audioCtx = null
        _audioBuffer = null
        playing.value = false
        suspended.value = false
      },
    )
    return {
      playing,
      isSimplified,
      load,
      play,
      pause,
    }
  },
})
</script>

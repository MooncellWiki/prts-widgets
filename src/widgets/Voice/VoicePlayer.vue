<template>
    <div class="container">
        <img
            class="md:w-10 <sm:w-7 cursor-pointer"
            :title="playing ? '暂停' : '播放'"
            :src="playing ? '/images/4/47/Pause.png' : '/images/9/90/Play.png'"
            @click="
                () => {
                    playing = !playing;
                }
            "
        />
        <audio ref="audioRef"></audio>
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
import { computed, defineComponent, ref, watch } from 'vue';
import { useMediaControls } from '@vueuse/core';

const isSimplified =
    decodeURIComponent(window.location.href).indexOf('/语音') === -1;

export default defineComponent({
    props: {
        voiceId: String,
        voicePath: String,
    },
    setup(props) {
        const audioRef = ref<HTMLAudioElement>();
        const source = computed(() => `//static.prts.wiki/${props.voicePath}`);
        const { playing } = useMediaControls(audioRef, {
            src: source,
        });
        watch(
            () => props.voicePath,
            () => {
                playing.value = false;
            },
        );
        return {
            playing,
            isSimplified,
            audioRef,
        };
    },
});
</script>

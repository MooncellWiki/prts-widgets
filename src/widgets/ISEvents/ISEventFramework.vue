<template>
    <h2>{{eventName}}</h2>
    <n-breadcrumb separator=">">
        <n-breadcrumb-item v-for="navpoint in sceneNav">
            {{navpoint}}
        </n-breadcrumb-item>
    </n-breadcrumb>
    <card :style="{ width: 'fit-content' }" class="bg-white relative">
        <template #cover>
            <img class="lazyload img" :data-src="`/images/${getImagePath(`${scenebg}.png`)}`">
        </template>
        <span :v-modal="unknownPlaceHolder"></span>
        <template #footer>
            <span :v-modal="unknownPlaceHolder"></span>
        </template>
        <template #action>
            <n-button-group vertical>

            </n-button-group>
        </template>
    </card>
</template>
<script lang="ts">
import { defineComponent, PropType, ref } from 'vue';
import { NSelect, NConfigProvider } from 'naive-ui';
import FormItem from '../../components/FormItem.vue';
import {getImagePath} from '../../utils/utils';
const isSimplified =
    decodeURIComponent(window.location.href).indexOf('/语音') === -1;
export default defineComponent({
    components: {
        NSelect,
        NConfigProvider,
        FormItem,
    },
    data: () => ({
        sceneNav : { type: Array as PropType<String[]>, default: ['开始'] },
    }),
    props: {
        unknownPlaceHolder: String,
        //
        eventName: String,
        currentSceneId: Number,
        
        scenebg: String,
        
        eventSetArr: { type: Array as PropType<string[]>, default: [] },

        voiceData: Array as PropType<
            {
                title?: string;
                index?: string;
                voiceFilename?: string;
                cond?: string;
                detail: {
                    [index: string]: string;
                };
            }[]
        >,
        voiceBase: {
            type: Array as PropType<{ lang: string; path: string }[]>,
            default: [],
        },
    },
    watch: {
        
    },
    setup(props) {
        return {
            getImagePath,
        };
    },
});
</script>

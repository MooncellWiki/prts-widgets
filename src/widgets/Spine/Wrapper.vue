<template>
    <n-config-provider preflight-style-disabled :breakpoints="{ s: 640, m: 768, lg: 1024, xl: 1280, xxl: 1536 }"
        :theme-overrides="{ common: { primaryColor: '#6a6aff' } }" :locale="zhCN">
        <Spine v-if="loaded" :prefix="prefix" :name="name" :skin="skin"></Spine>
        <n-button v-else @click="
            () => {
                loaded = true;
            }
        ">点击加载</n-button>
    </n-config-provider>
</template>
<script lang="ts">
import { NConfigProvider, NButton } from 'naive-ui';
import { defineComponent, PropType, ref } from 'vue'
import Spine from './Spine.vue';
import { zhCN } from 'naive-ui'
export default defineComponent({
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
    components: {
        NConfigProvider,
        NButton,
        Spine
    },
    setup() {
        const loaded = ref(false);
        return {
            loaded,
            zhCN
        }
    },
})
</script>

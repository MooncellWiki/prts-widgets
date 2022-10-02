<template>
    <n-config-provider
        preflight-style-disabled
        :breakpoints="{ s: 640, m: 768, lg: 1024, xl: 1280, xxl: 1536 }"
        :theme-overrides="{ common: { primaryColor: '#6a6aff' } }"
        :locale="zhCN"
    >
        <!-- <n-dialog-provider> -->
        <Spine v-if="loaded" :prefix="prefix" :name="name" :skin="skin"></Spine>
        <n-button
            v-else
            type="info"
            @click="
                () => {
                    loaded = true;
                }
            "
        >
            点击加载
        </n-button>
        <!-- </n-dialog-provider> -->
    </n-config-provider>
</template>
<script lang="ts">
import { NConfigProvider, NButton, NDialogProvider } from 'naive-ui';
import { defineComponent, PropType, ref } from 'vue';
import { zhCN } from 'naive-ui';
import Spine from './Spine.vue';
export default defineComponent({
    components: {
        NConfigProvider,
        NButton,
        // NDialogProvider,
        Spine,
    },
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
    setup() {
        const loaded = ref(false);
        return {
            loaded,
            zhCN,
        };
    },
});
</script>

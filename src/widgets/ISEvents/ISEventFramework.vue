<template>
    <n-config-provider
        preflight-style-disabled
        :theme-overrides="{ Card: { color: '#212121' , textColor: '#fff', titleTextColor: '#fff', borderRadius: '5px', actionColor: '#343434'},
                            Breadcrumb: {itemTextColor: '#A8AFB5'} }"
    >
        <n-space>
            <n-layout>
            <n-layout-header>
                
            </n-layout-header>
            <n-layout-content>
                <n-breadcrumb separator=">">
                    <n-breadcrumb-item v-for="[navId, navText] in sceneNav">
                        <n-icon v-if="navId === 1"><HomeSharp /></n-icon> {{ navText }}
                    </n-breadcrumb-item>
                </n-breadcrumb>
                <n-card :style="{ width: '560px' }" class="relative" :title="sceneTitle" size="small">
                    <template #cover>
                        <img class="lazyload img" :data-src="`/images/${getImagePath(`${sceneBg}.png`)}`" style="width:560px">
                    </template>
                    {{ sceneText }}
                    <template #action>
                        action
                        <n-button-group vertical>

                        </n-button-group>
                    </template>
                </n-card>
            </n-layout-content>
            </n-layout>
        </n-space>
    </n-config-provider>
    
</template>
<script lang="ts">
import { defineComponent, PropType, onMounted, getCurrentInstance, ref } from 'vue';
import {
    NConfigProvider,
    NBreadcrumb,
    NBreadcrumbItem,
    NSpace,
    NLayout,
    NLayoutHeader,
    NLayoutContent,
    NCard,
    NIcon,
} from 'naive-ui';
import {
    HomeSharp,
} from '@vicons/material';
import {getImagePath} from '../../utils/utils';
export default defineComponent({
    components: {
        NConfigProvider,
        NBreadcrumb,
        NBreadcrumbItem,
        NSpace,
        NLayout,
        NLayoutHeader,
        NLayoutContent,
        NCard,
        NIcon,
        HomeSharp,
    },
    // data: () => ({
    //     sceneNav : [[1, '开始']],
    //     sceneBg : "Avg_pic_rogue_2_46",
    //     sceneTitle: "sceneTitle",
    //     sceneText: "sceneText",
    //     currentSceneId: -999
    // }),
    props: {
        sceneData: Array as PropType<
            {
                name?: string;
                nav?: string;
                index? : number;
                image?: string;
                text?: string;
                option?: Array<any>;
            }[]
        >,
    },
    watch: {
        currentSceneId(newEle, oldEle) {
            this.sceneNavChange();
        }
    },
    methods:{
        async sceneNavChange(){
            var currentScene = this.sceneData[this.currentSceneId || 0];
            this.sceneTitle = currentScene.name;
            this.sceneText = currentScene.text;
        }
    },
    setup(props) {
        const sceneNav = ref([[1, "开始"]]);
        const currentSceneId = ref(1);
        const currentScene = ref(props.sceneData[currentSceneId-1]);
        const sceneBg = ref(currentScene.image);
        const sceneTitle = ref(currentScene.name);
        const sceneText = ref(currentScene.text);
        return {
            getImagePath,
            sceneNav,
            currentSceneId,
            sceneBg,
            sceneTitle,
            sceneText,
        };
    },
});
</script>

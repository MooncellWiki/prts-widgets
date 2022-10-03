<template>
    <n-config-provider
        preflight-style-disabled
        :theme-overrides="{ Card: { color: '#212121' , textColor: '#fff', titleTextColor: '#fff', borderRadius: '5px', actionColor: '#343434'},
                            Breadcrumb: {itemTextColor: '#A8AFB5'} }"
    >
        <n-button>Default</n-button>
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
    data: () => ({
        sceneNav : [[1, '开始']],
        sceneBg : "Avg_pic_rogue_2_46",
        sceneTitle: "sceneTitle",
        sceneText: "sceneText",
        currentSceneId: -999
    }),
    props: {
        unknownPlaceHolder: String,
        //
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
        const ins = getCurrentInstance();
        const selectedWordLang = ref(['中文']);
        onMounted(() => {
            //console.log(ins.data.currentSceneId)
            //ins.data.currentSceneId = 1
        });
        return {
            getImagePath,
        };
    },
});
</script>

<template>
    <h2>{{ sceneData[0].name }}</h2>
    <n-config-provider preflight-style-disabled :theme-overrides="{ Card: { color: '#212121' , textColor: '#fff', titleTextColor: '#fff', borderRadius: '5px', actionColor: '#343434'},
    Breadcrumb: {itemTextColor: '#A8AFB5'},
    Button: {textColor: '#fff'} }">
        <n-space>
            <n-layout>
                <n-layout-content>
                    <n-breadcrumb separator=">">
                        <n-breadcrumb-item v-for="([SceneId, navText]) in sceneNav" @click="currentSceneId = SceneId">
                            <n-icon v-if="SceneId === '0'">
                                <HomeSharp />
                            </n-icon> {{ navText }}
                        </n-breadcrumb-item>
                    </n-breadcrumb>
                    <n-card :style="{ width: '560px' }" class="relative" :title="sceneData[currentSceneId].name"
                        size="small">
                        <template #cover>
                            <a :href="`/images/${getImagePath(`${sceneData[currentSceneId].image}.png`)}`">
                                <img class="lazyload img"
                                    :data-src="`/images/${getImagePath(`${sceneData[currentSceneId].image}.png`)}`"
                                    style="width:560px">
                            </a>
                        </template>
                        {{ sceneData[currentSceneId].text }}
                        <template #action>
                            <n-space vertical>
                                <ISEventOption v-for="optionitem in sceneData[currentSceneId].options"
                                    :optionData="optionitem" :themeColor="themeColor"
                                    @click="currentSceneId = optionitem.dest"></ISEventOption>
                            </n-space>
                        </template>
                    </n-card>
                </n-layout-content>
            </n-layout>
        </n-space>
    </n-config-provider>

</template>
<script lang="ts">
import { defineComponent, PropType, ref } from 'vue';
import {
    NConfigProvider,
    NBreadcrumb,
    NBreadcrumbItem,
    NSpace,
    NLayout,
    NLayoutContent,
    NCard,
    NIcon,
} from 'naive-ui';
import {
    HomeSharp,
} from '@vicons/material';
import { getImagePath } from '../../utils/utils';
import ISEventOption from './ISEventOption.vue';
export default defineComponent({
    components: {
        NConfigProvider,
        NBreadcrumb,
        NBreadcrumbItem,
        NSpace,
        NLayout,
        NLayoutContent,
        NCard,
        NIcon,
        HomeSharp,
        ISEventOption,
    },
    props: {
        sceneData: Array as PropType<
            {
                name?: string;
                nav?: string;
                index?: number;
                image?: string;
                text?: string;
                options?: Array<any>;
            }[]
        >,
        themeColor: String,
    },
    watch: {
        currentSceneId(newEle, oldEle) {
            this.sceneNavRefresh(newEle);
        }
    },
    methods: {
        async findIfSceneOnNav(destSceneIndex) {
            var res = -999
            this.sceneNav.find((nav, index, arr, dest = destSceneIndex) => {
                if (nav[0] == dest) {
                    res = index
                }
            })
            return res
        },
        async sceneNavRefresh(newSceneId) {
            var newScene = this.sceneData[newSceneId || 0];
            console.log("newSceneId", newSceneId)
            var findRepetedSceneOnNav = this.findIfSceneOnNav(newSceneId);
            console.log("findRepetedSceneOnNav", findRepetedSceneOnNav)
            if (findRepetedSceneOnNav) {

            } else {
                this.sceneNav.push([newSceneId, newScene.nav])
            }
        }
    },
    setup(props) {
        const sceneNav = ref([['0', "开始"]]);
        const currentSceneId = ref('0');
        return {
            getImagePath,
            sceneNav,
            currentSceneId,
        };
    },
});
</script>

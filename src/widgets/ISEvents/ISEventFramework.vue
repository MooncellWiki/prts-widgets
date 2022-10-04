<template>
    <h2>{{ sceneData[0].name }}</h2>
    <n-config-provider
        preflight-style-disabled
        :theme-overrides="{
            Card: {
                color: '#212121',
                textColor: '#fff',
                titleTextColor: '#fff',
                borderRadius: '5px',
                actionColor: '#343434',
            },
            Breadcrumb: { itemTextColor: '#A8AFB5' },
            Button: { textColor: '#fff' },
        }"
    >
        <n-space>
            <n-layout>
                <n-layout-content>
                    <n-breadcrumb separator=">">
                        <n-breadcrumb-item
                            v-for="(SceneId, index) in sceneNav"
                            :key="index"
                            @click="navJump(index)"
                        >
                            <n-icon v-if="SceneId === 0">
                                <HomeSharp />
                            </n-icon>
                            {{ sceneData[SceneId].text }}
                        </n-breadcrumb-item>
                    </n-breadcrumb>
                    <n-card
                        :style="{ width: '560px' }"
                        class="relative"
                        :title="sceneData[currentSceneId].name"
                        size="small"
                    >
                        <template #cover>
                            <a
                                :href="`/images/${getImagePath(
                                    `${sceneData[currentSceneId].image}.png`,
                                )}`"
                            >
                                <img
                                    class="lazyload img"
                                    :data-src="`/images/${getImagePath(
                                        `${sceneData[currentSceneId].image}.png`,
                                    )}`"
                                    style="width: 560px"
                                />
                            </a>
                        </template>
                        {{ sceneData[currentSceneId].text }}
                        <template #action>
                            <n-space vertical>
                                <ISEventOption
                                    v-for="(item, index) in sceneData[
                                        currentSceneId
                                    ].options"
                                    :key="index"
                                    :title="item.title"
                                    :type="item.type"
                                    :icon="item.icon"
                                    :description="item.description"
                                    @click="jump(item.dest)"
                                ></ISEventOption>
                            </n-space>
                        </template>
                    </n-card>
                </n-layout-content>
            </n-layout>
        </n-space>
    </n-config-provider>
</template>
<script lang="ts">
import { computed, defineComponent, PropType, ref } from 'vue';
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
import { HomeSharp } from '@vicons/material';
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
        sceneData: {
            type: Array as PropType<
                {
                    name?: string;
                    nav?: string;
                    index?: number;
                    image?: string;
                    text?: string;
                    options?: Array<{
                        title: string;
                        type: string;
                        icon: string;
                        description: string;
                        dest: number;
                    }>;
                }[]
            >,
            default: [],
        },
    },
    setup() {
        const sceneNav = ref<Array<number>>([0]);
        const currentSceneId = ref(0);
        function jump(id: number) {
            let index = sceneNav.value.findIndex((v) => v == id);
            if (index == -1) {
                sceneNav.value.push(id);
            } else if (index + 1 < sceneNav.value.length) {
                sceneNav.value.splice(index + 1);
            }
            currentSceneId.value = id;
        }
        function navJump(index: number) {
            if (index == sceneNav.value.length - 1) {
                return;
            }
            currentSceneId.value = sceneNav.value[index];
            sceneNav.value.splice(index + 1);
        }
        return {
            getImagePath,
            sceneNav,
            currentSceneId,
            jump,
            navJump,
        };
    },
});
</script>

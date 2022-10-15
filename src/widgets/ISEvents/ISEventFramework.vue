<template>
    <h2 v-if="sceneData[0].etype">{{ sceneData[0].etype }}</h2>
    <h3>{{ sceneData[0].name }}</h3>
    {{ sceneData }}
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
        <n-space class="w-140 max-w-full">
            <n-layout>
                <n-layout-content>
                    <n-breadcrumb separator=">">
                        <n-breadcrumb-item
                            v-for="(SceneId, index) in sceneNav"
                            :key="index"
                            @click="navJump(index)"
                        >
                            <n-dropdown
                                v-if="
                                    sceneData[SceneId].options.length &&
                                    index !== sceneNav.length - 1
                                "
                                placement="bottom-start"
                                :show-arrow="true"
                                :options="
                                    optionsToNavDrop(sceneData[SceneId].options)
                                "
                                @select="(i) => dropJump(i, index)"
                            >
                                <div class="trigger">
                                    <n-icon v-if="SceneId === 0">
                                        <HomeSharp />
                                    </n-icon>
                                    <span v-else>{{
                                        sceneData[SceneId].nav
                                    }}</span>
                                </div>
                            </n-dropdown>
                            <div v-else>
                                <n-icon v-if="SceneId === 0">
                                    <HomeSharp />
                                </n-icon>
                                <span v-else>{{ sceneData[SceneId].nav }}</span>
                            </div>
                        </n-breadcrumb-item>
                    </n-breadcrumb>
                    <n-card
                        class="relative"
                        :title="sceneData[currentSceneId].name || ''"
                        size="small"
                    >
                        <template #cover>
                            <a
                                :href="`/w/File:${sceneData[currentSceneId].image}.png`"
                            >
                                <img
                                    class="lazyload img w-140"
                                    :data-src="`/images/${getImagePath(
                                        `${sceneData[currentSceneId].image}.png`,
                                    )}`"
                                />
                            </a>
                        </template>
                        <div v-html="sceneData[currentSceneId].text"></div>
                        <template
                            v-if="sceneData[currentSceneId].options"
                            #action
                        >
                            <n-space vertical>
                                <ISEventOption
                                    v-for="(item, index) in sceneData[
                                        currentSceneId
                                    ].options"
                                    :key="index"
                                    :title="item.title"
                                    :type="item.type"
                                    :icon="item.icon"
                                    :desc1="item.desc1"
                                    :desc2="item.desc2"
                                    :ISTheme="ISTheme"
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
import { defineComponent, PropType, ref } from 'vue';
import {
    NConfigProvider,
    NBreadcrumb,
    NBreadcrumbItem,
    NDropdown,
    NSpace,
    NLayout,
    NLayoutContent,
    NCard,
    NIcon,
    DropdownOption,
} from 'naive-ui';
import { HomeSharp } from '@vicons/material';
import { getImagePath } from '../../utils/utils';
import ISEventOption from './ISEventOption.vue';
interface Option {
    title: string;
    type: string;
    icon: string;
    desc1: string;
    desc2: string;
    dest: number;
    index: number;
}
export default defineComponent({
    components: {
        NConfigProvider,
        NBreadcrumb,
        NBreadcrumbItem,
        NDropdown,
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
                    etype?: string;
                    name?: string;
                    nav?: string;
                    index?: number;
                    image?: string;
                    text?: string;
                    options: Array<Option>;
                }[]
            >,
            default: [],
        },
        ISTheme: String,
    },
    setup(props) {
        const sceneNav = ref<Array<number>>([0]);
        const currentSceneId = ref(0);
        function jump(id: number) {
            if (id) {
                let index = sceneNav.value.findIndex((v) => v == id);
                if (index == -1) {
                    sceneNav.value.push(id);
                } else if (index + 1 < sceneNav.value.length) {
                    sceneNav.value.splice(index + 1);
                }
                currentSceneId.value = id;
            }
        }
        function navJump(index: number) {
            if (index == sceneNav.value.length - 1) {
                return;
            }
            currentSceneId.value = sceneNav.value[index];
            sceneNav.value.splice(index + 1);
        }
        function optionsToNavDrop(options: Array<Option>) {
            return options
                .filter((option) => option.type != 'desc')
                .map((option) => {
                    return {
                        label: option.title,
                        key: option.index,
                    };
                });
        }
        function dropJump(key: number, navIndex: number) {
            let option = props.sceneData[sceneNav.value[navIndex]].options[key];
            navJump(navIndex);
            jump(option.dest);
        }
        return {
            getImagePath,
            sceneNav,
            currentSceneId,
            jump,
            navJump,
            optionsToNavDrop,
            dropJump,
        };
    },
});
</script>

<template>
    <h2 v-if="sceneData[0].etype">{{ sceneData[0].etype }}</h2>
    <h3>{{ sceneData[0].name }}</h3>
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
        <n-space :style="{ width: '560px', maxWidth: '100%'}">
            <n-layout>
                <n-layout-content>
                    <n-breadcrumb separator=">">
                        <n-breadcrumb-item
                            v-for="(SceneId, index) in sceneNav"
                            :key="index"
                            @click="navJump(index)"
                        >
                            <n-dropdown v-if="sceneData[SceneId].options.length>1 && index!=sceneNav.length-1" 
                                placement="bottom-start" :show-arrow="true" :options="optionsToNavDrop(sceneData[SceneId].options, index)" @select="dropjump">
                                <div class="trigger">
                                    <n-icon v-if="SceneId === 0">
                                        <HomeSharp />
                                    </n-icon>
                                    {{ sceneData[SceneId].nav }}
                                </div>
                            </n-dropdown>
                            <div v-else>
                                <n-icon v-if="SceneId === 0">
                                    <HomeSharp />
                                </n-icon>
                                {{ sceneData[SceneId].nav }}
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
                        <div v-html="sceneData[currentSceneId].text"></div>
                        <template #action v-if="sceneData[currentSceneId].options.length>1">
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
import { computed, defineComponent, PropType, ref } from 'vue';
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
                    options?: Array<{
                        title: string;
                        type: string;
                        icon: string;
                        desc1: string;
                        desc2: string;
                        dest: number;
                    }>;
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
        function optionsToNavDrop(options: Array<Object>, navIndex: number){
            var dropdownData = Array.from(options).map((option, index) => {
                if (index>0 && option.type != "desc") {
                    return {
                        label: option.title,
                        key: option.dest,
                        props: {
                            navIndex: navIndex,
                        }
                    }
                }else{
                    return { label: "desc"}
                }
            })
            dropdownData = dropdownData.filter((data) => {
                if (data.label != "desc"){
                    return data
                }
            })
            return dropdownData
        }
        function dropjump(key:number, option:DropdownOption){
            navJump(option.props.navIndex)
            jump(key)
        }
        return {
            getImagePath,
            sceneNav,
            currentSceneId,
            jump,
            navJump,
            optionsToNavDrop,
            dropjump,
        };
    },
});
</script>

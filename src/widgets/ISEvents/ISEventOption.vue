<template>
    <n-card
        :style="type === 'desc' ? { cursor: 'default' } : { cursor: 'pointer', borderColor:'#929292' }"
        :title="title"
        size="small"
        :header-style="{ height: '3.35em' }"
        v-if = "title || desc1 || desc2"
    >
        <template v-if="icon" #header-extra>
            <n-avatar
                v-if="type === 'simple'"
                color="#212121"
                object-fit="scale-down"
                :size="45"
                :src="`/images/${getImagePath(`集成战略_选项_${icon}.png`)}`"
            />
            <n-avatar
                v-if="type === 'item'"
                color="#212121"
                object-fit="scale-down"
                :size="45"
                :src="`/images/${getImagePath(`集成战略_道具_${icon}.png`)}`"
            />
            <n-badge :value="icon" color="#666666" v-if="type === 'collection'">
                <n-avatar
                    color="#212121"
                    object-fit="scale-down"
                    :size="45"
                    :src="`/images/${getImagePath(ISTheme ? `收藏品_${ISTheme}_${icon}.png` : `收藏品_${icon}.png`)}`"
                />
            </n-badge>
        </template>
        <div v-html="desc1"></div>
        <template #footer v-if="desc2">
            <div v-html="desc2" class="text-xs"></div>
        </template>
    </n-card>
</template>
<script lang="ts">
import { defineComponent } from 'vue';
import { NCard, NAvatar, NBadge, } from 'naive-ui';
import { getImagePath } from '../../utils/utils';
export default defineComponent({
    components: {
        NCard,
        NAvatar,
        NBadge,
    },
    props: {
        title: String,
        type: String,
        icon: String,
        desc1: String,
        desc2: String,
        ISTheme: String,
    },
    setup() {
        return {
            getImagePath,
        };
    },
});
</script>

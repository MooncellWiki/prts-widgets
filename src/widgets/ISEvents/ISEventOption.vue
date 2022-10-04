<template>
    <n-card
        :style="{ cursor: 'pointer' }"
        :title="title"
        size="small"
        :header-style="{ height: '3em' }"
    >
        <template v-if="icon" #header-extra>
            <n-avatar
                v-if="type === 'simple'"
                color="#212121"
                object-fit="scale-down"
                :size="40"
                :src="`/images/${getImagePath(`集成战略_选项_${icon}.png`)}`"
            />
            <n-avatar
                v-if="type === 'item'"
                color="#212121"
                object-fit="scale-down"
                :size="40"
                :src="`/images/${getImagePath(`集成战略_道具_${icon}.png`)}`"
            />
        </template>
        {{ description }}
    </n-card>
</template>
<script lang="ts">
import { defineComponent } from 'vue';
import { NCard, NAvatar } from 'naive-ui';
import { getImagePath } from '../../utils/utils';
export default defineComponent({
    components: {
        NCard,
        NAvatar,
    },
    props: {
        title: String,
        type: String,
        icon: String,
        description: String,
    },
    setup() {
        return {
            getImagePath,
        };
    },
});
</script>

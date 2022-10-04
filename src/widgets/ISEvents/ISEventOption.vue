<template>
    <n-card :style="{ cursor: 'pointer' }" :title="optionData.title" size="small" :header-style="{ height:'3em' }">
        <template #header-extra v-if="optionData.icon">
            <n-avatar v-if="optionData.type === 'simple'" color="#212121" object-fit='scale-down' :size="40"
                :src="`/images/${getImagePath(`集成战略_选项_${optionData.icon}.png`)}`" />
            <n-avatar v-if="optionData.type === 'item'" color="#212121" object-fit='scale-down' :size="40"
                :src="`/images/${getImagePath(`集成战略_道具_${optionData.icon}.png`)}`" />
        </template>
        {{optionData.description}}
    </n-card>
</template>
<script lang="ts">
import { defineComponent, PropType, onMounted, getCurrentInstance, ref } from 'vue';
import {
    NCard,
    NAvatar,
     NIcon,
} from 'naive-ui';
 import {
     ChevronRightSharp,
     InfoSharp,
     HelpSharp,
     WarningSharp,
     DangerousSharp,
     DoDisturbSharp,
     DoNotDisturbSharp,
 } from '@vicons/material';
import { getImagePath } from '../../utils/utils';
export default defineComponent({
    components: {
        NCard,
        NAvatar,
        NIcon,
        
         ChevronRightSharp,
         InfoSharp,
         HelpSharp,
         WarningSharp,
         DangerousSharp,
         DoDisturbSharp,
         DoNotDisturbSharp,
    },
    props: {
        optionData: Array as PropType<
            {
                title?: string;
                type?: string;
                icon?: string;
                description?: string;
                dest?: Number;
            }[]
        >,
    },
    setup(props) {
        //console.log("optiondata", props.optionData)
        return {
            getImagePath,
        }
     }
}
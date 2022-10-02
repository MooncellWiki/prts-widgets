<template>
    <div class="flex flex-col justify-center items-center my-8px">
        <Avatar
            :rarity="rarity"
            :name="name"
            :profession="profession"
            :size="60"
        />
        <div>
            精英化：
            <span> {{ elite }} </span>
        </div>
        <div>
            技能1→7：
            <span> {{ skill }} </span>
        </div>
        <div v-if="mastery">
            技能专精：
            <span> {{ sum(mastery) === 0 ? 0 : `${mastery.join('/')}` }} </span>
        </div>
        <div>
            模组：
            <span> {{ uniequip }} </span>
        </div>
    </div>
</template>
<script lang="ts">
import { defineComponent, PropType } from 'vue';
import { professionMap, sum } from '../utils/utils';
export interface costProps {
    rarity: number;
    name: string;
    profession: keyof typeof professionMap;
    elite: number; //精英化
    skill: number; //技能1-7
    mastery: [number, number, number]; //技能专精
    uniequip: number; //模组
}
import Avatar from './Avatar.vue';
export default defineComponent({
    components: { Avatar },
    props: {
        rarity: Number,
        name: String,
        profession: String as PropType<keyof typeof professionMap>,
        elite: Number, //精英化
        skill: Number, //技能1-7
        mastery: Array as PropType<number[]> as PropType<
            [number, number, number]
        >, //技能专精
        uniequip: Number, //模组
    },
    setup() {
        return {
            sum,
        };
    },
});
</script>

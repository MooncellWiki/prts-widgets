<template>
    <div
        class="filter-row-container"
        :class="{ disabled: states?.length === 0, long: both }"
    >
        <div class="title">{{ title }}</div>
        <div class="btns">
            <button class="btn" @click="addAll">全选</button>
            <button class="btn" @click="removeAll">清除</button>
            <CheckBox
                v-if="both"
                :key="'both'"
                v-model:states="selectedLabels"
                :text="'同时满足'"
            ></CheckBox>
        </div>
        <div class="checkboxs">
            <CheckBox
                v-for="label in labels"
                :key="label"
                v-model:states="selectedLabels"
                :text="label"
                :noWidth="noWidth"
            ></CheckBox>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import CheckBox from './CheckBox.vue'

export default defineComponent({
    name: 'FilterRow',
    components: {
        CheckBox,
    },
    props: {
        labels: Array<string>,
        title: String,
        both: Boolean,
        noWidth: Boolean,
        states: Array,
    },
    emits: ['update:states'],
    data(): {
        selectedLabels: string[]
    } {
        return {
            selectedLabels: this.states,
        }
    },
    watch: {
        selectedLabels(val) {
            this.$emit('update:states', val)
        },
    },
    methods: {
        addAll() {
            if (this.states) {
                this.selectedLabels = this.labels
                this.$emit('update:states', this.labels)
            }
        },
        removeAll() {
            this.selectedLabels = []
            this.$emit('update:states', this.selectedLabels)
        },
    },
})
</script>

<style scoped>
.filter-row-container {
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
    border-left: 0.2em solid #4487df;
    animation: 1s;
    flex-wrap: nowrap;
    padding: 3px;
    background-color: #f8f9fa;
}
.disabled {
    border-left: 0.2em solid rgba(0, 0, 0, 0);
}
.checkboxs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-start;
    flex: 1 1 auto;
}
.checkboxs > * {
    margin: 0.3em;
}
.title {
    height: 28px;
    /* min-width: 40px; */
    width: 60px;
    padding: 0 8px;
    display: inline-flex;
    flex: 0 0 auto;
    margin: 0.3em;
    align-items: center;
    justify-content: flex-start;
    vertical-align: middle;
}
.btns {
    display: flex;
    justify-content: flex-start;
    align-items: baseline;
    flex-wrap: wrap;
    flex: 0 1000 auto;
    width: 116px;
}
.btn {
    margin: 0.3em;
    box-shadow: 0 3px 5px grey;
    will-change: box-shadow;
    color: rgba(0, 0, 0, 0.87);
    background-color: #f5f5f5;
    height: 28px;
    min-width: 50px;
    padding: 0 8px;
    align-items: center;
    /* border-radius: 4px; */
    display: inline-flex;
    flex: 0 0 auto;
    letter-spacing: 0.08em;
    justify-content: center;
    outline: 0;
    position: relative;
    text-decoration: none;
    text-indent: 0.08em;
    vertical-align: middle;
    white-space: nowrap;
    border-width: 0px;
    cursor: pointer;
}
.btns > div {
    margin: 3px;
    width: 94px;
}
@media screen and (max-width: 750px) {
    .filter-row-container {
        flex-wrap: wrap;
        border-bottom: solid 0.1em grey;
    }
    .btns {
        justify-content: flex-start;
        /* flex-grow: 1; */
    }
    .long .btns {
        width: 232px;
    }
}
</style>

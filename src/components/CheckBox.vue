<template>
    <div
        :class="{
            selected: selected,
            nowidth: noWidth,
        }"
        class="checkbox-container"
        @click="onClick"
    >
        {{ text }}
    </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
export default defineComponent({
    name: 'CheckBox',
    props: {
        states: Array,
        text: String,
        atLeastOne: Boolean,
        onlyOne: Boolean,
        noWidth: Boolean,
    },
    emits: ['update:states'],
    computed: {
        selected() {
            if (this.states) {
                return this.states.indexOf(this.text) !== -1
            } else {
                return false
            }
        },
    },
    methods: {
        onClick: function () {
            let statesCopy = [...this.states]
            const i: number = this.states?.indexOf(this.text)

            if (this.atLeastOne && i !== -1) {
                return
            }

            if (this.onlyOne) {
                statesCopy = [this.text]
                this.$emit('update:states', statesCopy)
                return
            }

            if (i !== -1) {
                statesCopy.splice(i, 1)
            } else {
                statesCopy.push(this.text)
            }
            this.$emit('update:states', statesCopy)
        },
    },
})
</script>
<style scoped>
.checkbox-container {
    width: 70px;
    background-color: #313131;
    color: #ffffff;
    height: 28px;
    min-width: 40px;
    padding: 0 8px;
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    vertical-align: middle;
    box-shadow: 0 3px 5px grey;
    letter-spacing: 0.08em;
    text-indent: 0.08em;
    cursor: pointer;
}
.selected {
    background-color: #0098dc;
}
.nowidth {
    width: initial;
}
</style>

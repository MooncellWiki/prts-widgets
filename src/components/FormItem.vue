<template>
    <div>
        <label class="mb-1">{{ label }}</label>
        <slot></slot>
    </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
    props: {
        label: String,
    },
    setup() {

    },
})
</script>

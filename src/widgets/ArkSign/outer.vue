<template>
    <n-config-provider :theme-overrides="themeOverrides" preflight-style-disabled>
        <n-message-provider>
            <n-modal-provider>
                <arksignInner />
            </n-modal-provider>
        </n-message-provider>
    </n-config-provider>
</template>

<script setup>
    import arksignInner from './index.vue'
    import { NConfigProvider, NMessageProvider, NModalProvider } from "naive-ui";

    const themeOverrides = {
        common: {
            primaryColor: '#22bbff',
            primaryColorHover: '#91ddff',
            primaryColorPressed: '#91ddff'
        },
        // Button: {
        //   textColor: '#ff69b4'
        // },
        Select: {
            peers: {
                // InternalSelection: {
                //     textColor: '#FF0000'
                // }
            }
        }
    }
</script>
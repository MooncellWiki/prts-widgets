<template>
    <div style="margin-bottom: 20px;">
        <span style="font-weight: bold;font-size:large; color:var(--darkblue)">01.</span>
        首先，使用PC端浏览器或带有开发者工具功能的移动端浏览器（如狐猴浏览器）登录网页端
        <n-a href="https://www.skland.com/" target="_blank">森空岛官网</n-a> 进行登录，如果已经登录，建议退出重新登录一次。
        <br>
        <img src="https://static.prts.wiki/charinfo/img/skland/step1.jpg" width="100%" style="max-width: 500px;"
            srcset="">
    </div>
    <div style="margin-bottom: 20px;">
        <span style="font-weight: bold;font-size:large;color:var(--darkblue)">02.</span>
        按下F12呼出开发者工具，选择控制台（console）页签，输入以下命令：
        <n-input size="small" type="textarea" v-model:value="commandValue" style="margin-top: 10px;" />
        <n-button size="small" type="primary" ghost style="margin-top: 10px;margin-bottom: 10px;"
            @click="textCopy">复制命令</n-button>
        <br>
        <img src="https://static.prts.wiki/charinfo/img/skland/step2.jpg" width="100%" style="max-width: 500px;"
            srcset="">
    </div>
    <div style="margin-bottom: 20px;">
        <span style="font-weight: bold;font-size:large;color:var(--darkblue)">03.</span>
        按下回车，复制全部控制台返回的信息，格式应为中间带逗号的一长串字符。
        <br>
        <img src="https://static.prts.wiki/charinfo/img/skland/step3.jpg" width="100%" style="max-width: 500px;"
            srcset="">
    </div>
    <div style="margin-bottom: 20px;">
        <span style="font-weight: bold;font-size:large;color:var(--darkblue)">04.</span>
        把上一步获取的字符串粘贴到“森空岛凭据”输入栏内，点击导入数据按钮即可。
    </div>
</template>
<script setup>
    import { ref } from 'vue'
    import { NA, NInputGroup, NInput, NButton } from "naive-ui";
    const commandValue = ref("localStorage.getItem('SK_OAUTH_CRED_KEY')+','+localStorage .getItem('SK_TOKEN_CACHE_KEY')")
    function textCopy() {
        // 如果当前浏览器版本不兼容navigator.clipboard
        if (!navigator.clipboard) {
            var ele = document.createElement("input");
            ele.value = commandValue.value;
            document.body.appendChild(ele);
            ele.select();
            document.execCommand("copy");
            document.body.removeChild(ele);
            if (document.execCommand("copy")) {
                window.$message.info('复制成功！')
            } else {
                window.$message.info('复制失败，请手动选择文字复制')
            }
        } else {
            navigator.clipboard.writeText(commandValue.value).then(function () {
                window.$message.info('复制成功！')
            }).catch(function () {
                window.$message.info('复制失败，请手动选择文字复制')
            })
        }
    }
</script>
<script setup lang="ts">
import { NInput, NButton, useMessage } from "naive-ui";
const message = useMessage();
const commandValue =
  "localStorage.getItem('SK_OAUTH_CRED_KEY')+','+localStorage .getItem('SK_TOKEN_CACHE_KEY')";

async function textCopy() {
  // 如果当前浏览器版本不兼容navigator.clipboard
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(commandValue);
    } catch {
      message.info("复制失败，请手动选择文字复制");
      return;
    }
    message.info("复制成功！");
  } else {
    const ele = document.createElement("input");
    ele.value = commandValue;
    document.body.append(ele);
    ele.select();
    document.execCommand("copy");
    ele.remove();
    if (document.execCommand("copy")) {
      message.info("复制成功！");
    } else {
      message.info("复制失败，请手动选择文字复制");
    }
  }
}
</script>

<template>
  <div style="margin-bottom: 20px">
    <span class="title">01.</span>
    首先，使用PC端浏览器或带有开发者工具功能的移动端浏览器（如狐猴浏览器）登录网页端
    <a href="https://www.skland.com/" target="_blank">森空岛官网</a>
    进行登录，如果已经登录，建议退出重新登录一次。
    <br />
    <img
      src="https://static.prts.wiki/charinfo/img/skland/step1.jpg"
      width="100%"
    />
  </div>
  <div style="margin-bottom: 20px">
    <span class="title">02.</span>
    按下F12呼出开发者工具，选择控制台（console）页签，输入以下命令：
    <n-input
      :value="commandValue"
      size="small"
      type="textarea"
      style="margin-top: 10px"
    />
    <n-button size="small" type="primary" ghost class="my-2" @click="textCopy">
      复制命令
    </n-button>
    <br />
    <img
      src="https://static.prts.wiki/charinfo/img/skland/step2.jpg"
      width="100%"
    />
  </div>
  <div style="margin-bottom: 20px">
    <span class="title">03.</span>
    按下回车，复制全部控制台返回的信息，格式应为中间带逗号的一长串字符。
    <br />
    <img
      src="https://static.prts.wiki/charinfo/img/skland/step3.jpg"
      width="100%"
      srcset=""
    />
  </div>
  <div style="margin-bottom: 20px">
    <span class="title">04.</span>
    把上一步获取的字符串粘贴到“森空岛凭据”输入栏内，点击导入数据按钮即可。
  </div>
</template>

<style scoped>
.title {
  font-weight: bold;
  font-size: large;
  color: var(--darkblue);
}
</style>

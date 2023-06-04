<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'SHead',
})
</script>

<template>
  <div id="shead">
    <div id="avatar">
      头像
    </div>
    <div id="name">
      姓名
    </div>
    <div id="camp">
      <div>子职业</div>
      <div>势力</div>
      <div>出身地</div>
      <div>种族</div>
    </div>
    <div id="data">
      <div>生命值</div>
      <div>攻击</div>
      <div>防御</div>
      <div>法术抗性</div>
    </div>
    <div id="property">
      <div>再部署时间</div>
      <div>部署费用</div>
      <div>阻挡</div>
      <div>攻击间隔</div>
    </div>
    <div id="obtain">
      获取方式
    </div>
    <div id="tag">
      <div>性别</div>
      <div>位置</div>
      <div>标签</div>
    </div>
    <div id="feature">
      特性
    </div>
  </div>
</template>

<style scoped>
#shead {
  display: flex;
  flex-wrap: nowrap;
  align-items: stretch;
  margin-top: 6px;
  box-shadow: 0 3px 1px -2px rgba(0, 0, 0, 0.2), 0 2px 2px 0 rgba(0, 0, 0, 0.14),
    0 1px 5px 0 rgba(0, 0, 0, 0.12);
  background-color: #eaebee;
}
#shead > div {
  display: flex;
  align-items: center;
  justify-content: center;
}
#avatar {
  width: 100px;
}
#name,
#camp,
#data,
#property,
#obtain,
#tag {
  flex-direction: column;
  width: 60px;
  flex: 1;
}
#feature {
  flex: 2 1;
}
</style>

<!--元素宽度大于900时-->
<template>
  <div class="long-container">
    <div class="avatar">
      <avatar :rarity="row.rarity" :class_="row.class_" :zh="row.zh"></avatar>
    </div>
    <div class="name">
      <div>
        <a :href="`${$8data.domain}/w/${row.zh}`">
          <div>{{ row.zh }}</div>
        </a>
        <div>{{ row.en }}</div>
        <div>{{ row.ja }}</div>
        <div>{{ row.id }}</div>
      </div>
    </div>
    <div class="camp">
      <div>
        <div>{{ row.logo }}</div>
        <div>{{ row.birth_place }}</div>
        <div>{{ row.team }}</div>
        <div>{{ row.race }}</div>
      </div>
    </div>
    <div class="data1">
      <div class="hp">{{ hp_ }}</div>
      <div class="atk">{{ atk_ }}</div>
      <div class="def">{{ def_ }}</div>
      <div class="res">{{ res_ }}</div>
    </div>
    <div class="data2">
      <div class="re_deploy">{{ re_deploy_ }}</div>
      <div class="cost">{{ cost_ }}</div>
      <div class="block">{{ row.block }}</div>
      <div class="interval">{{ row.interval }}</div>
    </div>
    <div class="other">
      <div class="sex">{{ row.sex }}</div>
      <div class="position">{{ row.position }}</div>
    </div>
    <div class="obtain">
      <div v-for="(obtain, i) in row.obtain_method" :key="i">{{ obtain }}</div>
    </div>
    <div class="tag">
      <div v-for="(tag, i) in row.tag" :key="i">{{ tag }}</div>
    </div>
    <div class="feature">
      <div><slot></slot></div>
    </div>
  </div>
</template>
<script>
import avatar from '../head/Avatar.vue'
export default {
  name: 'long',
  components: { avatar },
  props: {
    row: {
      class_: String, //职业
      rarity: Number, //稀有度（0-5）
      logo: String, //标志
      birth_place: String, //出身地
      team: String, //团队
      race: String, //种族
      zh: String, //中文干员名
      en: String, //英文干员名
      ja: String, //日文干员名
      id: String, //情报编号
      hp: Number, //生命值
      atk: Number, //攻击力
      def: Number, //防御
      res: Number, //法抗
      re_deploy: String, //再部署时间
      cost: Number, //部署费用
      block: Number, //阻挡数,
      interval: Number, //攻击间隔
      sex: String, //性别
      position: String, //位置
      tag: Array, //词缀
      obtain_method: Array, //获得方式
    },
    addtrust: Boolean, //是否加算信赖
    addpotential: Boolean, //是否加算潜能
  },
  computed: {
    hp_: function () {
      let result = parseInt(this.row.hp)
      if (this.addtrust) {
        result += this.row.trust[0]
      }
      if (this.addpotential) {
        this.row.potential[0].forEach((v, i) => {
          if (v == 'hp') {
            result += this.row.potential[1][i]
          }
        })
      }
      return result
    },
    atk_: function () {
      let result = parseInt(this.row.atk)
      if (this.addtrust) {
        result += this.row.trust[1]
      }
      if (this.addpotential) {
        this.row.potential[0].forEach((v, i) => {
          if (v == 'atk') {
            result += this.row.potential[1][i]
          }
        })
      }
      return result
    },
    def_: function () {
      let result = parseInt(this.row.def)
      if (this.addtrust) {
        result += this.row.trust[2]
      }
      if (this.addpotential) {
        this.row.potential[0].forEach((v, i) => {
          if (v == 'def') {
            result += this.row.potential[1][i]
          }
        })
      }
      return result
    },
    res_: function () {
      let result = parseInt(this.row.res)
      if (this.addpotential) {
        this.row.potential[0].forEach((v, i) => {
          if (v == 'res') {
            result += this.row.potential[1][i]
          }
        })
      }
      return result
    },
    cost_: function () {
      let result = parseInt(this.row.cost)
      if (this.addpotential) {
        this.row.potential[0].forEach((v, i) => {
          if (v == 'cost') {
            result += this.row.potential[1][i]
          }
        })
      }
      return result
    },
    re_deploy_: function () {
      let result = parseInt(this.row.re_deploy.slice(0, -1))
      if (this.addpotential) {
        this.row.potential[0].forEach((v, i) => {
          if (v == 're_deploy') {
            result += this.row.potential[1][i]
          }
        })
      }
      return result + 's'
    },
  },
}
</script>
<style scoped>
.long-container {
  width: 100%;
  display: flex;
  flex-wrap: nowrap;
  align-items: stretch;
  margin-top: 6px;
  box-shadow: 0 3px 1px -2px rgba(0, 0, 0, 0.2), 0 2px 2px 0 rgba(0, 0, 0, 0.14),
    0 1px 5px 0 rgba(0, 0, 0, 0.12);
  background-color: #f8f9fa;
}
.long-container > div {
  display: flex;
  align-items: center;
  justify-content: center;
}
.camp,
.data1,
.data2,
.other,
.obtain,
.tag {
  flex-direction: column;
  width: 70px;
  flex: 1;
}
.name {
  width: 140px;
  flex: 1.8;
}
.feature {
  flex: 3 1;
}
</style>

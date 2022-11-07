<!--元素宽度小于等于800且大于640-->
<template>
  <div class="short-container">
    <div class="avatar">
      <Avatar :rarity="row.rarity" :class_="row.class_" :zh="row.zh"></Avatar>
    </div>
    <div class="name">
      <div>
        <a :href="`${domain}/w/${row.zh}`">
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
    <div class="data">
      <div class="hp">
        {{ hp_ }}
      </div>
      <div class="atk">
        {{ atk_ }}
      </div>
      <div class="def">
        {{ def_ }}
      </div>
      <div class="res">{{ res_ }}</div>
    </div>
    <div class="property">
      <div class="re_deploy">{{ re_deploy_ }}</div>
      <div class="cost">{{ cost_ }}</div>
      <div class="block">{{ row.block }}</div>
      <div class="interval">{{ row.interval }}</div>
    </div>
    <div class="obtain">
      <div v-for="(obtain, i) in row.obtain_method" :key="i">{{ obtain }}</div>
    </div>
    <div class="tag">
      <div class="sex">{{ row.sex }}</div>
      <div class="position">{{ row.position }}</div>
      <div v-for="(tag, i) in row.tag" :key="i">{{ tag }}</div>
    </div>
    <div class="feature">
      <div><slot></slot></div>
    </div>
  </div>
</template>
<script lang="ts">
import { defineComponent, computed, PropType } from 'vue'
import { domain } from '../../utils/utils.js'
import Avatar from '../head/Avatar.vue'
export default defineComponent({
  name: 'Short',
  components: { Avatar },
  props: {
    row: Object as PropType<{
      class_: string //职业
      rarity: number //稀有度（0-5）
      logo: string //标志
      birth_place: string //出身地
      team: string //团队
      race: string //种族
      zh: string //中文干员名
      en: string //英文干员名
      ja: string //日文干员名
      id: string //情报编号
      hp: number //生命值
      atk: number //攻击力
      def: number //防御
      res: number //法抗
      re_deploy: string //再部署时间
      cost: number //部署费用
      block: number //阻挡数,
      interval: number //攻击间隔
      sex: string //性别
      position: string //位置
      tag: Array<string> //词缀
      feature: string //特性
      obtain_method: Array<string> //获得方式
      trust: Array<string> //信赖加成
      potential: Array<string> //潜能加成
    }>,
    addtrust: Boolean, //是否加算信赖
    addpotential: Boolean, //是否加算潜能
  },
  setup(props) {
    const hp_ = computed(() => {
      let result = parseInt(props.row.hp)
      if (this.addtrust) {
        result += props.row.trust[0]
      }
      if (this.addpotential) {
        props.row.potential[0].forEach((v, i) => {
          if (v == 'hp') {
            result += props.row.potential[1][i]
          }
        })
      }
      return result
    })
    const atk_ = computed(() => {
      let result = parseInt(props.row.atk)
      if (this.addtrust) {
        result += props.row.trust[1]
      }
      if (this.addpotential) {
        props.row.potential[0].forEach((v, i) => {
          if (v == 'atk') {
            result += props.row.potential[1][i]
          }
        })
      }
      return result
    })
    const def_ = computed(() => {
      let result = parseInt(props.row.def)
      if (this.addtrust) {
        result += props.row.trust[2]
      }
      if (this.addpotential) {
        props.row.potential[0].forEach((v, i) => {
          if (v == 'def') {
            result += props.row.potential[1][i]
          }
        })
      }
      return result
    })
    const res_ = computed(() => {
      let result = parseInt(props.row.res)
      if (this.addpotential) {
        props.row.potential[0].forEach((v, i) => {
          if (v == 'res') {
            result += props.row.potential[1][i]
          }
        })
      }
      return result
    })
    const cost_ = computed(() => {
      let result = parseInt(props.row.cost)
      if (this.addpotential) {
        props.row.potential[0].forEach((v, i) => {
          if (v == 'cost') {
            result += props.row.potential[1][i]
          }
        })
      }
      return result
    })
    const re_deploy_ = computed(() => {
      let result = parseInt(props.row.re_deploy.slice(0, -1))
      if (this.addpotential) {
        props.row.potential[0].forEach((v, i) => {
          if (v == 're_deploy') {
            result += props.row.potential[1][i]
          }
        })
      }
      return result + 's'
    })

    return {
      domain,
      hp_,
      atk_,
      def_,
      res_,
      cost_,
      re_deploy_,
    }
  },
})
</script>
<style scoped>
.short-container {
  width: 100%;
  display: flex;
  flex-wrap: nowrap;
  align-items: stretch;
  margin-top: 6px;
  box-shadow: 0 3px 1px -2px rgba(0, 0, 0, 0.2), 0 2px 2px 0 rgba(0, 0, 0, 0.14),
    0 1px 5px 0 rgba(0, 0, 0, 0.12);
  background-color: #f8f9fa;
}
.short-container > div {
  display: flex;
  align-items: center;
  justify-content: center;
}
.data,
.property,
.obtain,
.tag {
  flex-direction: column;
}
.name,
.camp,
.data,
.property,
.obtain,
.tag {
  width: 60px;
  flex: 1;
}
.feature {
  flex: 2 1;
}
</style>

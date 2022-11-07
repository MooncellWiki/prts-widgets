<!--元素宽度小于等于640px-->
<template>
  <div class="card-container">
    <div class="basic">
      <div class="avatar">
        <Avatar :rarity="row.rarity" :class_="row.class_" :zh="row.zh"></Avatar>
      </div>
      <div class="info">
        <div class="name">
          <div class="zh">
            <a :href="`${$8data.domain}/w/${row.zh}`">
              <div>{{ row.zh }}</div>
            </a>
          </div>
          <div class="id">{{ row.id }}</div>
          <div class="en">{{ row.en }}</div>
          <div class="ja">{{ row.ja }}</div>
        </div>
        <div class="sp">
          <div class="head">性别</div>
          <div class="head">位置</div>
          <div class="button">
            <transition name="fade">
              <div @click="collapsed = !collapsed">
                <svg
                  v-show="collapsed"
                  t="1590476789572"
                  class="icon"
                  viewBox="0 0 1024 1024"
                  version="1.1"
                  xmlns="http://www.w3.org/2000/svg"
                  p-id="6592"
                  width="24"
                  height="24"
                >
                  <path
                    d="M500.8 604.779L267.307 371.392l-45.227 45.27 278.741 278.613L779.307 416.66l-45.248-45.248z"
                    p-id="6593"
                  ></path>
                </svg>
                <svg
                  v-show="!collapsed"
                  t="1590477111828"
                  class="icon"
                  viewBox="0 0 1024 1024"
                  version="1.1"
                  xmlns="http://www.w3.org/2000/svg"
                  p-id="6715"
                  width="24"
                  height="24"
                >
                  <path
                    d="M500.8 461.909333L267.306667 695.296l-45.226667-45.269333 278.741333-278.613334L779.306667 650.026667l-45.248 45.226666z"
                    p-id="6716"
                  ></path>
                </svg>
              </div>
            </transition>
          </div>
          <div>{{ row.sex }}</div>
          <div>{{ row.position }}</div>
        </div>
      </div>
    </div>
    <div :ref="'panel'" class="expand-panel" :class="{ collapsed: collapsed }">
      <div class="story">
        <div class="head">标志</div>
        <div class="head">出身地</div>
        <div class="head">团队</div>
        <div class="head">种族</div>
        <div>{{ row.logo }}</div>
        <div>{{ row.birth_place }}</div>
        <div>{{ row.team }}</div>
        <div>{{ row.race }}</div>
      </div>
      <div class="data1">
        <div class="head">生命值</div>
        <div class="head">攻击力</div>
        <div class="head">防御</div>
        <div class="head">法术抗性</div>
        <div>{{ hp_ }}</div>
        <div>{{ atk_ }}</div>
        <div>{{ def_ }}</div>
        <div>{{ res_ }}</div>
      </div>
      <div class="data2">
        <div class="head">再部署</div>
        <div class="head">部署费用</div>
        <div class="head">阻挡数</div>
        <div class="head">攻击间隔</div>
        <div>{{ re_deploy_ }}</div>
        <div>{{ cost_ }}</div>
        <div>{{ row.block }}</div>
        <div>{{ row.interval }}</div>
      </div>
      <div class="tags">
        <!-- <div>标签</div> -->
        <div class="tag">
          <div v-for="(tag, i) in row.tag" :key="i">{{ tag }}</div>
        </div>
      </div>
      <div class="feature head"><slot></slot></div>
    </div>
  </div>
</template>
<script lang="ts">
import { defineComponent, ref, computed, inject, PropType, watch } from 'vue'
import { domain } from '../../utils/utils.js'
import Avatar from '../head/Avatar.vue'

export default defineComponent({
  name: 'Card',
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
      re_deploy: string //再部署时间
      cost: number //部署费用
      block: number //阻挡数
      sex: string //性别
      position: string //位置
      tag: Array<string> //词缀,
      feature: string //特性
      obtain_method: Array<string> //获得方式
    }>,
    addtrust: Boolean, //是否加算信赖
    addpotential: Boolean, //是否加算潜能
  },
  setup(props) {
    const collapsed = ref(true)
    const $vel = inject('$vel')
    const refs = inject('refs')
    watch(collapsed, () => {
      if (collapsed) {
        $vel(
          refs['panel'],
          { height: 0 },
          {
            duration: 500,
            delay: 0,
          },
        )
      } else {
        let targetHeight = 0
        for (let j = 0; j < refs['panel'].children.length; j++) {
          targetHeight += refs['panel'].children[j].offsetHeight
        }
        $vel(
          refs['panel'],
          { height: targetHeight },
          {
            duration: 500,
            delay: 0,
          },
        ).then(() => {
          refs['panel'].style.height = 'auto'
        })
      }
    })
    const hp_ = computed(() => {
      let result = parseInt(props.row.hp)
      if (props.addtrust) {
        result += props.row.trust[0]
      }
      if (props.addpotential) {
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
      if (props.addtrust) {
        result += props.row.trust[1]
      }
      if (props.addpotential) {
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
      if (props.addtrust) {
        result += props.row.trust[2]
      }
      if (props.addpotential) {
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
      if (props.addpotential) {
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
      if (props.addpotential) {
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
      if (props.addpotential) {
        props.row.potential[0].forEach((v, i) => {
          if (v == 're_deploy') {
            result += props.row.potential[1][i]
          }
        })
      }
      return result + 's'
    })
    return { collapsed, hp_, atk_, def_, res_, cost_, re_deploy_, domain }
  },
})
</script>
<style scoped>
.card-container {
  width: calc(100% - 18px);
  border-radius: 10px;
  border: 1px solid #a2a9b1;
  background-color: #f8f9fa;
  margin: 3px;
  padding: 5px;
}
.avatar {
  width: 100px;
  height: 100px;
}
.basic {
  display: flex;
}
.info {
  flex: 1;
  display: grid;
  grid-template: 1fr, 1fr;
}
.name {
  display: flex;
  flex-wrap: wrap;
  flex-direction: row;
}
.name > div {
  flex-grow: 1;
}
.sp {
  display: grid;
  grid-template: repeat(2, 1fr) / repeat(3, 1fr);
}
.button {
  grid-column: 3/4;
  grid-row: 1/3;
  display: flex;
  align-items: center;
  justify-content: center;
}
.button > div {
  width: 36px;
  height: 31px;
  padding-top: 5px;
}
.button > div:hover {
  border-radius: 50%;
  background-color: rgba(213, 215, 219, 0.4);
}
.story {
  display: grid;
  grid-template: repeat(2, 1fr) / repeat(4, 1fr);
}
.data1,
.data2 {
  display: grid;
  grid-template: repeat(2, 1fr) / repeat(4, 1fr);
}
.tags {
  display: flex;
}
.tag {
  flex-grow: 1;
  display: flex;
  justify-content: space-around;
}
.tag > div {
  flex-grow: 0;
  border-radius: 10px;
  border: 1px solid #a2a9b1;
  padding: 0px 3px;
}
.head {
  background-color: rgba(213, 215, 219, 0.4);
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s;
}
.fade-enter,
.fade-leave-to {
  opacity: 0;
}
.expand-panel {
  overflow: hidden;
}
.collapsed {
  height: 0px;
}
</style>

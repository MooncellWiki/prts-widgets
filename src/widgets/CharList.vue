<template>
  <div id="app" ref="app">
    <div
      v-for="(v, i) in filters"
      :key="v.title"
      class="filter"
      :class="['filter-' + i]"
    >
      <div
        class="filter-title"
        :class="{
          enabled: states[i].flat().length > 0 && !expanded[i],
        }"
      >
        {{ v.title }}
      </div>

      <div class="collapsible" @click="toggleCollapse(i)">
        <div>
          <svg
            v-show="!expanded[i]"
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
            v-show="expanded[i]"
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
      </div>
      <Transition name="slide-fade">
        <div
          v-if="expanded[i]"
          :ref="
            (el) => {
              el && refs.indexOf(el) === -1 && refs.push(el)
            }
          "
          class="expand-panel"
          :style="{ height: expanded[i] ? 'auto' : '0px' }"
        >
          <FilterRow
            v-for="(v2, i2) in v.filter"
            :key="v2.title"
            v-model:states="states[i][i2]"
            :title="v2.title"
            :labels="v2.cbt"
            :both="v2.both"
            :noWidth="i === 2"
          ></FilterRow>
        </div>
      </Transition>
    </div>
    <div class="control">
      <div>????????????</div>
      <div class="order">
        <CheckBox
          v-for="v in sortMethods"
          :key="v"
          v-model:states="currSortMethod"
          :text="v"
          :atLeastOne="true"
          :onlyOne="true"
        ></CheckBox>
      </div>
    </div>
    <div class="mode">
      <input v-model="searchText" placeholder="??????????????????/??????/??????" />
      <div>
        <CheckBox
          v-for="v in dataTypes"
          :key="v"
          v-model:states="currDataTypes"
          :text="v"
        ></CheckBox>
      </div>
      <div>
        <CheckBox
          v-for="v in displayModes"
          :key="v"
          v-model:states="currDisplayMode"
          :text="v"
          :atLeastOne="true"
          :onlyOne="true"
        ></CheckBox>
      </div>
    </div>

    <div id="pagination">
      <div class="btn" :data-clipboard-text="url" @click="copyUrl">
        ???????????????
      </div>
      <Pagination
        :length="oridata.length"
        :index="page.index"
        :step="page.step"
        @update:values="onPageChange"
        @update:step="onStepChange"
      ></Pagination>
    </div>
    <div id="result">
      <SHead
        v-if="currDisplayMode[0] === '??????' && bp === 1"
        :class="{ fix: fix }"
      ></SHead>
      <LHead
        v-else-if="currDisplayMode[0] === '??????' && bp === 2"
        :class="{ fix: fix }"
      ></LHead>
      <div
        id="filter-result"
        :class="{
          showhead: currDisplayMode[0] === '??????',
          showavatar: currDisplayMode[0] === '?????????',
        }"
      >
        <template v-if="currDisplayMode[0] === '?????????'">
          <Half
            v-for="v in data"
            :key="v.sortid"
            :class_="v.class_"
            :rarity="parseInt(v.rarity)"
            :logo="v.logo"
            :zh="v.zh"
            :en="v.en"
          ></Half>
        </template>
        <template v-if="currDisplayMode[0] === '??????'">
          <Avatar
            v-for="v in data"
            :key="v.sortid"
            :class_="v.class_"
            :rarity="parseInt(v.rarity)"
            :zh="v.zh"
          ></Avatar>
        </template>
        <template v-if="currDisplayMode[0] === '??????' && bp === 1">
          <Short
            v-for="v in data"
            :key="v.sortid"
            :row="v"
            :addtrust="currDataTypes.indexOf('?????????') !== -1"
            :addpotential="currDataTypes.indexOf('?????????') !== -1"
          >
            <div v-html="v.feature"></div>
          </Short>
        </template>
        <template v-if="currDisplayMode[0] === '??????' && bp === 2">
          <Long
            v-for="v in data"
            :key="v.sortid"
            :row="v"
            :addtrust="currDataTypes.indexOf('?????????') !== -1"
            :addpotential="currDataTypes.indexOf('?????????') !== -1"
          >
            <div v-html="v.feature"></div>
          </Long>
        </template>
        <template v-if="currDisplayMode[0] === '??????' && bp === 0">
          <Card
            v-for="v in data"
            :key="v.sortid"
            :row="v"
            :addtrust="currDataTypes.indexOf('?????????') !== -1"
            :addpotential="currDataTypes.indexOf('?????????') !== -1"
          >
            <div v-html="v.feature"></div>
          </Card>
        </template>
      </div>
    </div>
    <Pagination
      :length="oridata.length"
      :index="page.index"
      :step="page.step"
      @update:values="onPageChange"
      @update:step="onStepChange"
    ></Pagination>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, onMounted, reactive, ref, Ref } from 'vue'
import Cookies from 'js-cookie'

import CheckBox from '@/components/CheckBox.vue'
import FilterRow from '@/components/FilterRow.vue'
import Half from '@/components/Half.vue'
import Avatar from '@/components/head/Avatar.vue'
import LHead from '@/components/head/LHead.vue'
import SHead from '@/components/head/SHead.vue'
import Pagination from '@/components/Pagination.vue'
import Card from '@/components/row/Card.vue'
import Long from '@/components/row/Long.vue'
import Short from '@/components/row/Short.vue'
import { DataSource } from '@/utils/charList'
import { keyStr } from '@/utils/utils'

export default defineComponent({
  components: {
    FilterRow,
    CheckBox,
    Pagination,
    SHead,
    LHead,
    Avatar,
    Card,
    Long,
    Short,
    Half,
  },
  props: {
    filters: {
      type: Array<{
        filter: Array<{
          both: boolean
          cbt: Array<string>
          title: string
        }>
        title: string
      }>,
      required: true,
    },
    source: {
      type: Array<DataSource>,
      required: true,
    },
    shortLinkMap: { type: Array<Array<Array<string>>>, required: true },
    filterMap: { type: Array<Record<string, Array<string>>>, required: true },
  },
  setup(props) {
    const app = ref()
    const m: Array<Array<keyof DataSource>> = [
      ['class_', 'rarity', 'position', 'sex', 'obtain_method', 'tag'],
      ['phy', 'flex', 'tolerance', 'plan', 'skill', 'adapt'],
      ['logo', 'birth_place', 'team', 'race'],
    ]
    let bp = ref(0)
    let fix = ref(false)
    onMounted(() => {
      let bpf = () => {
        if (app.value.offsetWidth > 900) {
          bp.value = 2
        } else if (app.value.offsetWidth > 640) {
          bp.value = 1
        } else {
          bp.value = 0
        }
      }
      window.addEventListener(
        'resize',
        ((fn) => {
          let canRun = true
          return function () {
            if (!canRun) return
            canRun = false
            fn()
            setTimeout(() => {
              fn()
              canRun = true
            }, 500)
          }
        })(bpf),
      )
      bpf()
      let f = () => {
        let ele
        if (bp.value == 1) {
          ele = document.querySelector('#pagination')
        } else if (bp.value === 2) {
          ele = document.querySelector('#pagination')
        } else {
          return 0
        }
        if (
          ele &&
          ele.getBoundingClientRect().top + ele.getBoundingClientRect().height <
            0
        ) {
          fix.value = true
        } else {
          fix.value = false
        }
      }
      f()
      window.addEventListener(
        'scroll',
        ((fn) => {
          let timeout: number | undefined
          return function () {
            if (timeout) {
              clearTimeout(timeout)
            }
            timeout = setTimeout(() => {
              fn()
            }, 10)
          }
        })(f),
      )
    })
    let page = ref({
      index: 1,
      step: '50',
    })
    const states = reactive<string[][][]>([
      [[], [], [], [], [], []],
      [[], [], [], [], [], []],
      [[], [], [], []],
    ]) // ?????? ???????????? ??????/?????????/??????/????????????
    const opFilterExpandState = Cookies.get('opFilterExpandState')
    const expanded: Ref<Array<boolean>> = ref(
      opFilterExpandState
        ? JSON.parse(opFilterExpandState)
        : [true, false, false],
    ) // ?????? ???????????? ??????/?????????/??????/???????????? ????????????
    const refs: Ref = ref([])
    const currSortMethod = ref(['????????????'])
    const sortMethods = ref([
      '????????????',
      '????????????',
      '????????????',
      '????????????',
      '???????????????',
      '???????????????',
    ])
    const searchText = ref('')
    const dataTypes = ref(['?????????', '?????????'])
    const currDataTypes: Ref<Array<string>> = ref([])
    const displayModes = ref(['??????', '?????????', '??????'])
    const currDisplayMode = ref(['??????'])

    const toggleCollapse = (index: number) => {
      expanded.value[index] = !expanded.value[index]
      Cookies.set('opFilterExpandState', JSON.stringify(expanded.value), {
        expires: 365,
      })
    }
    const onPageChange = (newPage: { index: number; step: string }) => {
      page.value = newPage
    }
    const onStepChange = ({ n, o }: { n: string; o: string }) => {
      const _n = parseInt(n)
      const _o = parseInt(o)
      if (_o < _n) {
        page.value.index = Math.ceil((_o / _n) * page.value.index)
      } else {
        if (page.value.index >= 1) {
          page.value.index = ((page.value.index - 1) * _o) / _n + 1
        }
      }
      page.value.step = n.toString()
    }

    const oridata = computed(() => {
      let temp: Array<DataSource> = props.source
      let filters = props.filters
      let filterMap = props.filterMap
      const has = (v: string, arr: Array<string>, i1: number, i2: number) => {
        let a = arr
        if (i1 == 2) {
          a = arr.map((v) => props?.filterMap?.[i2]?.[v] || v).flat()
        }
        return a.indexOf(v) !== -1
      }
      const other = (v: string, arr: Array<string>, i1: number, i2: number) => {
        if (arr.indexOf('??????') !== -1) {
          let da =
            filters &&
            filters[i1]['filter'][i2]['cbt']
              .map((v) => {
                if (filterMap && filterMap[i2] && filterMap[i2][v]) {
                  return filterMap[i2][v]
                } else {
                  return v
                }
              })
              .flat()
          da?.splice(da.indexOf('??????'), 1)
          return arr.indexOf(v) !== -1 || da?.indexOf(v) == -1
        } else {
          return has(v, arr, i1, i2)
        }
      }
      states.forEach((v1, i1) => {
        v1.forEach((v2: Array<string>, i2: number) => {
          if (v2.length !== 0) {
            temp = temp.filter((v3) => {
              if (i1 == 0 && i2 == 1) {
                //?????????
                return (
                  v2.indexOf('???' + (1 + parseInt(v3[m[i1][i2]] as string))) !==
                  -1
                )
              } else if (i1 == 0 && i2 == 3) {
                //??????
                if (v2.indexOf('??????') !== -1) {
                  return (
                    v2.indexOf(v3[m[i1][i2]] + '???') !== -1 ||
                    (v3.sex !== '???' && v3.sex !== '???')
                  )
                } else {
                  return v2.indexOf(v3[m[i1][i2]] + '???') !== -1
                }
              } else if (i1 == 0 && i2 == 4) {
                return (
                  (v3[m[i1][i2]] as Array<string>).filter((v4: string) =>
                    other(v4, v2, i1, i2),
                  ).length != 0
                )
                // return other(v3[m[i1][i2]], v2, i1, i2)
              } else if (i1 == 0 && i2 == 5) {
                //??????
                if (v2.indexOf('????????????') !== -1) {
                  //????????????
                  if (v2.length === 1) {
                    return true
                  }
                  let flag = true
                  for (let i = 0; i < v2.length; i++) {
                    if (v2[i] !== '????????????') {
                      if (v3.tag.indexOf(v2[i]) === -1) {
                        flag = false
                      }
                    }
                  }
                  return flag
                } else {
                  let flag = false
                  for (let i = 0; i < v2.length; i++) {
                    if (v3.tag.indexOf(v2[i]) !== -1) {
                      flag = true
                      break
                    }
                  }
                  return flag
                }
              } else if (i1 == 1 || (i1 == 2 && (i2 == 1 || i2 == 3))) {
                //??????????????????????????????????????????
                return other(v3[m[i1][i2]] as string, v2, i1, i2)
              } else {
                return has(v3[m[i1][i2]] as string, v2, i1, i2)
                // return v2.indexOf(v3[m[i1][i2]]) !== -1
              }
            })
          }
        })
      })
      temp = temp.filter((v) => {
        let tags = ['zh', 'en', 'ja', 'id', 'noHtmlFeature']
        return (
          tags.filter(
            (key: string) =>
              (v[key as keyof DataSource] as Array<string>).indexOf(
                searchText.value,
              ) != -1,
          ).length != 0
        )
      })
      switch (currSortMethod.value[0]) {
        case '????????????':
          temp.sort((a, b) => parseInt(a.sortid) - parseInt(b.sortid))
          break
        case '????????????':
          temp.sort((a, b) => parseInt(b.sortid) - parseInt(a.sortid))
          break
        case '????????????':
          temp.sort((a, b) => a.zh.localeCompare(b.zh, 'zh'))
          break
        case '????????????':
          temp.sort((a, b) => b.zh.localeCompare(a.zh, 'zh'))
          break
        case '???????????????':
          temp.sort((a, b) => {
            let r = parseInt(a.rarity) - parseInt(b.rarity)
            if (r === 0) {
              let classes = filters?.[0].filter[0].cbt ?? []
              let o = classes.indexOf(a.class_) - classes.indexOf(b.class_)
              if (o === 0) {
                return a.zh.localeCompare(b.zh, 'zh')
              } else {
                return o
              }
            } else {
              return r
            }
          })
          break
        case '???????????????':
          temp.sort((a, b) => {
            let r = parseInt(b.rarity) - parseInt(a.rarity)
            if (r === 0) {
              let classes = filters?.[0].filter[0].cbt ?? []
              let o = classes.indexOf(a.class_) - classes.indexOf(b.class_)
              if (o === 0) {
                return a.zh.localeCompare(b.zh, 'zh')
              } else {
                return o
              }
            } else {
              return r
            }
          })
          break
      }
      return temp
    })
    const data = computed(() => {
      let start = (page.value.index - 1) * parseInt(page.value.step)
      return oridata.value.slice(start, start + parseInt(page.value.step))
    })
    const url = computed(() => {
      const arrToBase64 = (arr: Array<number>) => {
        if (arr.indexOf(1) == -1) {
          return ''
        }
        let result = []
        while (arr.length % 6 != 0) {
          arr.push(0)
        }
        for (let i = 0; i < arr.length; i += 6) {
          result.push(keyStr.charAt(parseInt(arr.slice(i, i + 6).join(''), 2)))
        }
        return result.join('')
      }
      let result: Array<string> = []
      props.filters.forEach((v1, i1) => {
        v1.filter.forEach((v2, i2) => {
          let temp = Array(v2.cbt.length).fill(0)
          states[i1][i2].forEach((selected) => {
            temp[props.shortLinkMap[i1][i2].indexOf(selected)] = 1
          })
          result.push(arrToBase64(temp))
        })
      })

      return (
        window.location.origin +
        window.location.pathname +
        '#' +
        result.join('|') +
        '|' +
        searchText.value +
        '#'
      )
    })
    const copyUrl = () => {
      window.navigator.clipboard.writeText(url.value)
      alert('???????????????: ' + url.value)
    }

    const _keyStr =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+,'

    let hash = /#([^#]+)#/.exec(window.location.hash)
    if (hash && hash[1]) {
      const base64ToArr = (str: string) => {
        return str
          .split('')
          .map((v) => {
            let temp = _keyStr.indexOf(v).toString(2)
            while (temp.length % 6 != 0) {
              temp = '0' + temp
            }
            return temp.split('')
          })
          .flat()
      }
      let arr = hash[1].split('|')
      searchText.value = arr[arr.length - 1]
      let arr2 = arr.slice(0, -1).map((v) => base64ToArr(v))
      let i = 0
      states.forEach((v1, i1) => {
        v1.forEach((v2, i2) => {
          if (arr2[i].filter((v: string) => v != '0').length != 0) {
            arr2[i].forEach((v3, i3) => {
              if (v3 == '1') {
                states[i1][i2].push(props.shortLinkMap[i1][i2][i3])
              }
            })
          }
          i++
        })
      })
    }

    return {
      app,
      bp,
      page,
      states,
      expanded,
      refs,
      currSortMethod,
      sortMethods,
      searchText,
      dataTypes,
      currDataTypes,
      displayModes,
      currDisplayMode,
      oridata,
      data,
      fix,
      url,
      toggleCollapse,
      onPageChange,
      onStepChange,
      copyUrl,
    }
  },
})
</script>

<style>
.slide-fade-enter-active {
  transition: all 0.3s ease-out;
}

.slide-fade-leave-active {
  transition: all 0.3s ease-out;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(-5px);
  opacity: 0;
}
</style>

<style scoped>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  max-width: 1353px;
}
.filter {
  width: 100%;
  position: relative;
  box-shadow: 0 3px 1px -2px rgba(0, 0, 0, 0.2), 0 2px 2px 0 rgba(0, 0, 0, 0.14),
    0 1px 5px 0 rgba(0, 0, 0, 0.12);
  background-color: #f8f8f8;
  margin-bottom: 5px;
}
.filter-title {
  border-left: solid rgba(0, 0, 0, 0) 0.2em;
  transition: ease 0.5s;
  padding: 7px;
  box-shadow: 0 3px 1px -2px rgba(0, 0, 0, 0.2), 0 2px 2px 0 rgba(0, 0, 0, 0.14),
    0 1px 5px 0 rgba(0, 0, 0, 0.12);
  font-size: 16px;
  letter-spacing: 0.08em;
  text-indent: 0.08em;
  background-color: #eaebee;
}
.collapsible {
  position: absolute;
  right: 1.1em;
  top: 0px;
  color: blue;
  cursor: pointer;
  letter-spacing: 0.08em;
  text-indent: 0.08em;
  font-weight: 700;
  width: 29px;
  height: 24px;
  padding-top: 5px;
}
.collapsible > div:hover {
  border-radius: 50%;
  background-color: rgba(213, 215, 219, 0.4);
}
.expand-panel {
  /* transition: height 0.5s; */
  overflow: hidden;
}
.control {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  flex-wrap: wrap;
  box-shadow: 0 3px 1px -2px rgba(0, 0, 0, 0.2), 0 2px 2px 0 rgba(0, 0, 0, 0.14),
    0 1px 5px 0 rgba(0, 0, 0, 0.12);
  /* border-radius: 4px; */
  background-color: #f8f8f8;
  margin-bottom: 5px;
  padding: 3px;
}
.control > :first-child {
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
#pagination :first-child,
.mode .checkbox-container,
.control .checkbox-container {
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
}
.order {
  display: flex;
  /* flex-grow: 1; */
  justify-content: flex-start;
  flex-wrap: wrap;
}
.mode {
  display: flex;
  flex-wrap: wrap;
  padding: 3px;
}
.mode > div > div {
  margin: 0.3em;
}
.order > div {
  width: 80px !important;
  margin: 0.3em;
}
input {
  flex-grow: 1;
  height: 30px;
  min-width: 280px;
  outline: 0;
  border: rgba(0, 0, 0, 0.42) solid thin;
  box-shadow: 0 3px 1px -2px rgba(0, 0, 0, 0.2), 0 2px 2px 0 rgba(0, 0, 0, 0.14),
    0 1px 5px 0 rgba(0, 0, 0, 0.12);
  margin: 1px;
  padding-left: 0.5em;
  padding-right: 0.5em;
  /* padding: 2px; */
}
input:focus {
  border-color: #4487df;
}
.showavatar,
.showhead {
  display: flex;
  flex-wrap: wrap;
}
.enabled {
  border-left: solid#4487df 0.2em;
}
#pagination {
  display: flex;
  padding: 2px 0;
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
.fix {
  position: fixed;
  top: 0;
  right: 1em;
  left: 201px;
  z-index: 2;
}
@media screen and (min-width: 982px) {
  .fix {
    max-width: 1353px;
    right: 1.5em;
  }
}
.fix + #filter-result > div:first-child {
  margin-top: 100px;
}
</style>

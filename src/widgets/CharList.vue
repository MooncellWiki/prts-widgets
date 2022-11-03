<template>
    <div id="app">
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
            <div
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
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import FilterRow from '../components/FilterRow.vue'

export default defineComponent({
    components: {
        FilterRow,
    },
    props: {},
    data() {
        return {
            filters: [
                {
                    title: '筛选',
                    filter: [
                        {
                            title: '职业',
                            cbt: [
                                '先锋',
                                '近卫',
                                '狙击',
                                '重装',
                                '医疗',
                                '辅助',
                                '术师',
                                '特种',
                            ],
                            both: false,
                        },
                        {
                            title: '稀有度',
                            cbt: ['★1', '★2', '★3', '★4', '★5', '★6'],
                            both: false,
                        },
                        {
                            title: '位置',
                            cbt: ['近战位', '远程位'],
                            both: false,
                        },
                        {
                            title: '性别',
                            cbt: ['男性', '女性', '其他'],
                            both: false,
                        },
                        {
                            title: '获取途径',
                            cbt: ['公开招募', '标准寻访', '限定寻访', '其他'],
                            both: false,
                        },
                        {
                            title: '词缀',
                            cbt: [
                                '治疗',
                                '支援',
                                '输出',
                                '群攻',
                                '减速',
                                '生存',
                                '防护',
                                '削弱',
                                '位移',
                                '控场',
                                '爆发',
                                '召唤',
                                '快速复活',
                                '费用回复',
                                '支援机械',
                            ],
                            both: true,
                        },
                    ],
                },
                {
                    title: '六维筛选',
                    filter: [
                        {
                            title: '物理强度',
                            cbt: [
                                '卓越',
                                '优良',
                                '标准',
                                '普通',
                                '缺陷',
                                '其他',
                            ],
                            both: false,
                        },
                        {
                            title: '战场机动',
                            cbt: [
                                '卓越',
                                '优良',
                                '标准',
                                '普通',
                                '缺陷',
                                '其他',
                            ],
                            both: false,
                        },
                        {
                            title: '生理耐受',
                            cbt: [
                                '卓越',
                                '优良',
                                '标准',
                                '普通',
                                '缺陷',
                                '其他',
                            ],
                            both: false,
                        },
                        {
                            title: '战术规划',
                            cbt: [
                                '卓越',
                                '优良',
                                '标准',
                                '普通',
                                '缺陷',
                                '其他',
                            ],
                            both: false,
                        },
                        {
                            title: '战斗技巧',
                            cbt: [
                                '卓越',
                                '优良',
                                '标准',
                                '普通',
                                '缺陷',
                                '其他',
                            ],
                            both: false,
                        },
                        {
                            title: '源石技艺适应性',
                            cbt: [
                                '卓越',
                                '优良',
                                '标准',
                                '普通',
                                '缺陷',
                                '其他',
                            ],
                            both: false,
                        },
                    ],
                },
                {
                    title: '标志/出身地/团队/种族筛选',
                    filter: [
                        {
                            title: '标志',
                            cbt: [
                                '乌萨斯',
                                '企鹅物流',
                                '卡西米尔',
                                '拉特兰',
                                '深海猎人',
                                '维多利亚',
                                '罗德岛',
                                '巴别塔',
                                '莱塔尼亚',
                                '莱茵生命',
                                '谢拉格',
                                '雷姆必拓',
                                '黑钢',
                                '龙门',
                                '炎国',
                                '汐斯塔',
                            ],
                            both: false,
                        },
                        {
                            title: '出身地',
                            cbt: [
                                '卡西米尔',
                                '未公开',
                                '雷姆必拓',
                                '乌萨斯',
                                '谢拉格',
                                '玻利瓦尔',
                                '卡兹戴尔',
                                '莱塔尼亚',
                                '米诺斯',
                                '龙门',
                                '哥伦比亚',
                                '东',
                                '维多利亚',
                                '拉特兰',
                                '叙拉古',
                                '炎',
                                '阿戈尔',
                                '萨尔贡',
                                '萨米',
                                '汐斯塔',
                                '瓦伊凡',
                                '伊比利亚',
                                '其他',
                            ],
                            both: false,
                        },
                        {
                            title: '团队',
                            cbt: [
                                '龙门近卫局',
                                '黑钢',
                                '行动预备组A6',
                                '行动预备组A4',
                                '行动预备组A1',
                                '行动组A4',
                                '莱茵生命',
                                '深海猎人',
                                '格拉斯哥帮',
                                '喀兰贸易',
                                '使徒',
                                '企鹅物流',
                                '乌萨斯学生自治团',
                                'S.W.E.E.P原型',
                                '无团队',
                            ],
                            both: false,
                        },
                        {
                            title: '种族',
                            cbt: [
                                '龙',
                                '黎博利',
                                '鲁珀',
                                '鬼',
                                '阿达克利斯',
                                '阿纳缇',
                                '萨科塔',
                                '萨弗拉',
                                '萨卡兹',
                                '菲林',
                                '瓦伊凡',
                                '德拉克',
                                '瑞柏巴',
                                '沃尔珀',
                                '杜林',
                                '札拉克',
                                '未公开',
                                '曼提柯',
                                '库兰塔',
                                '安努拉',
                                '埃拉菲亚',
                                '卡特斯',
                                '卡普里尼',
                                '匹特拉姆',
                                '依特拉',
                                '佩洛',
                                '丰蹄',
                                '乌萨斯',
                                '奇美拉',
                                '阿斯兰',
                                '麒麟',
                                '阿戈尔',
                                '其他',
                            ],
                            both: false,
                        },
                    ],
                },
            ],
            states: [
                [[], [], [], [], [], []],
                [[], [], [], [], [], []],
                [[], [], [], []],
            ], // 筛选 六维筛选 标志/出身地/团队/种族筛选
            expanded: [true, false, false], // 筛选 六维筛选 标志/出身地/团队/种族筛选 折叠状态
        }
    },
    methods: {
        toggleCollapse(index: number) {
            console.log(this.expanded)
            this.expanded[index] = !this.expanded[index]
        },
    },
})
</script>

<style scoped>
#app {
    font-family: Avenir, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-align: center;
    color: #2c3e50;
    margin-top: 60px;
    max-width: 1353px;
}
.filter {
    width: 100%;
    position: relative;
    box-shadow: 0 3px 1px -2px rgba(0, 0, 0, 0.2),
        0 2px 2px 0 rgba(0, 0, 0, 0.14), 0 1px 5px 0 rgba(0, 0, 0, 0.12);
    background-color: #f8f8f8;
    margin-bottom: 5px;
}
.filter-title {
    border-left: solid rgba(0, 0, 0, 0) 0.2em;
    transition: ease 0.5s;
    padding: 7px;
    box-shadow: 0 3px 1px -2px rgba(0, 0, 0, 0.2),
        0 2px 2px 0 rgba(0, 0, 0, 0.14), 0 1px 5px 0 rgba(0, 0, 0, 0.12);
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
    box-shadow: 0 3px 1px -2px rgba(0, 0, 0, 0.2),
        0 2px 2px 0 rgba(0, 0, 0, 0.14), 0 1px 5px 0 rgba(0, 0, 0, 0.12);
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
    box-shadow: 0 3px 1px -2px rgba(0, 0, 0, 0.2),
        0 2px 2px 0 rgba(0, 0, 0, 0.14), 0 1px 5px 0 rgba(0, 0, 0, 0.12);
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

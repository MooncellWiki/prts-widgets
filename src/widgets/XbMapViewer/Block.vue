<script lang="ts">
import type { PropType } from "vue";
import { computed, defineComponent, onMounted, ref } from "vue";

import { getImagePath } from "@/utils/utils";
const classMap: Record<string, string> = {
  start: "fas fa-exclamation-triangle",
  end: "fas fa-exclamation-triangle",
  flystart: "fas fa-plane",
  telin: "fas fa-indent",
  telout: "fas fa-outdent",
  // tokens
  gtreasure: "fas fa-crown",
  ballis: "fas fa-exclamation",
  streasure: "fas fa-crown",
  airsup: "fas fa-times",
  wdescp: "fas fa-sign-out-alt",
  redtower: "fas fa-broadcast-tower",
  xbbase: "fas fa-chess-rook",
  poachr: "far fa-dot-circle",
  ore: "fas fa-radiation",
  tower: "fas fa-broadcast-tower",
  xbalis: "fas fa-exclamation",
  xbbillb: "fas fa-sign",
};
const TipMap: Record<string, string> = {
  start: "<b>侵入点</b><br>敌方会从此进入战场",
  end: "<b>保护目标</b><br>蓝色目标点，敌方进入后会减少此目标点的耐久",
  flystart: "<b>空袭侵入点</b><br>敌方飞行单位会从此处进入战场",
  hole: "<b>地穴</b><br>危险的凹陷地形或地面破洞，经过的敌人会摔落至底部直接死亡",
  grass: "<b>草丛</b><br>置于其中的干员不会成为敌军远程攻击的目标",
  deepsea: "<b>清澈水域</b><br>可使用<蟹蟹抽水泵>采集<清水>",
  infection:
    "<b>活性源石</b><br>部署于其上的我军和经过的敌军持续受到伤害，但攻击力和攻速大幅度提升",
  corrosion_2: "<b>腐蚀地面</b><br>置于其上的我方单位防御力减半",
  healing: "<b>医疗符文</b><br>部署在其上的干员会持续恢复生命",
  telin: "<b>通道入口</b><br>敌方会从此进入通道，从通道出口出现",
  telout: "<b>通道出口</b><br>进入通道的敌方单位会从此处再度出现",
  volcano: "<b>热泵通道</b><br>每隔一段时间便会对其上的我军和敌军造成大量伤害",
  volspread:
    "<b>岩浆喷射处</b><br>每隔一定时间会喷出岩浆，对周围8格内的我方单位造成大量伤害且融化障碍物",
  steam: "<b>隐焰</b><br><盛季>和<荒季>时每隔一段时间对其上的任何单位造成无视防御和法术抗性的伤害",
  puddle: "<b>池沼</b><br><荒季>时会干涸露出地面",
  // tokens
  xbwood: "<b>杂木林</b><br>可开采<木材>",
  xboverwatch: "<b>监控塔</b><br>可以侦查范围内的视野",
  vegetation: "<b>灌木丛</b><br>击破后可以获得一些素材",
  hiddenstone: "<b>遗迹残骸</b><br>击破后可解锁隐藏区域",
  gtreasure: "<b>埋没金属箱</b><br>击破后可获得一些宝物",
  ballis: "<b>弩炮</b><br>会定期射出弩箭对我方单位造成物理伤害",
  streasure:
    "<b>宝刺金属箱</b><br>击破后可以获得一些珍贵宝物，受到攻击时会反弹真实伤害",
  xbstone: "<b>巨大岩石</b><br>可开采<石材>",
  roadblock: "<b>道路障碍物</b><br>不容易受到我方单位的攻击",
  xbiron: "<b>奇异矿脉</b><br>可开采<铁矿石>",
  airsup:
    "<b>可移动战术机库</b><br>根据需要可随时发射无人机支援敌方佣兵小队作战",
  wdescp: "<b>逃脱点</b><br>部署干员后激活野外支援可进行逃脱",
  redtower:
    "<b>移动战塔</b><br>敌方老巢，击败该地区的全部老巢使该地区不会刷新精英敌袭",
  xbbase: "<b>基地</b>",
  xbfarm: "<b>便携式种植槽</b><br>每天产出一定数量的<稻谷>，可部署在低地",
  poachr:
    "<b>老练猎手</b><br>只攻击野生动物，找不到攻击目标时可以闪现移动至周围随机可部署低地，拥有25%的物理和法术闪避",
  ore: "<b>源石祭坛</b><br>周期性向四周释放脉冲波，对我军与敌军造成伤害",
  tidectrl: "<b>涨潮控制</b>",
  stone: "<b>碎石</b><br>改变敌人行径路线",
  tower:
    '<b>L-44"留声机"</b><br>我方与敌方可夺取控制权，激活后对敌方造成法术伤害，并可治疗友方单位',
  rmtarms: "<b>R-11a突击动力装甲</b><br>吸收周围实验产物回复技力，技力满时激活",
  xblight: "<b>监视哨站</b><br>可以侦查范围内的视野",
  xbalis: "<b>简易弩台</b>",
  xbdiam: "<b>澄亮矿脉</b><br>可被采集",
  xbhydr: "<b>机关石门</b>",
  xbstation: "<b>号令点</b>",
  xbmgbird: "<b>喙中奇物</b><br>可被治疗",
  xbbillb: "<b>告示牌</b>",
};
const bgMap: Record<string, string> = {
  infection: "特殊地形_活性源石.png",
  corrosion_2: "特殊地形_腐蚀地面.png",
  healing: "特殊地形_医疗符文.png",
  volcano: "特殊地形_热泵通道.png",
  volspread: "特殊地形_岩浆喷射处.png",
  // tokens,
  xbwood: "生息演算_资源_木材.png",
  xboverwatch: "头像_装置_监控塔.png",
  vegetation: "生息演算_资源_其他掉落物品.png",
  xbstone: "生息演算_资源_石材.png",
  xbiron: "生息演算_资源_铁矿石.png",
  xbfarm: "头像_装置_便携式种植槽.png",
  stone: "头像_装置_碎石.png",
  rmtarms: "头像_装置_R-11突击动力装甲.png",
  xblight: "头像_装置_监视哨站.png",
  xbdiam: "生息演算_资源_澄亮石.png",
};
function bg(name: string) {
  return `background-image: url(/images/${getImagePath(name)})`;
}
export default defineComponent({
  props: {
    tile: String,
    tileHeightType: String,
    tokens: { type: Array as PropType<string[]> },
    black: { type: String, default: "" },
  },
  setup(props) {
    const self = ref();
    const style = computed(() => {
      let result = "";
      if (bgMap[props.tile!]) result += ` ${bg(bgMap[props.tile!])}`;

      props.tokens?.forEach((token: any) => {
        if (token && bgMap[token]) result += ` ${bg(bgMap[token])}`;
      });

      if (props.tile === "grass" && (props.tileHeightType === "1" || props.tileHeightType === "HIGHLAND")) {
        result +=
          "box-shadow: 5px 5px 8px black; filter: brightness(1.15); z-index: 2";
      }
      return result;
    });
    onMounted(() => {
      let content = "";
      if (props.tile && TipMap[props.tile]) content += TipMap[props.tile];

      props.tokens?.forEach((token: any) => {
        if (token && TipMap[token])
          content += content ? `<br/> ${TipMap[token]}` : ` ${TipMap[token]}`;
      });

      if (content.length > 0) {
        // @ts-expect-error tippy
        // eslint-disable-next-line no-undef
        tippy6(self.value, {
          allowHTML: true,
          content,
          arrow: true,
          theme: "light-border",
          size: "large",
          maxWidth: 250,
        });
      }
    });
    return { self, style, classMap };
  },
});
</script>

<template>
  <div
    ref="self"
    :class="`block ${tile} ${
      tokens ? 'token '.concat(tokens.toString().replace(/,/g, ' ')) : ''
    } ${black}`"
    :style="style"
  >
    <template v-if="tokens">
      <template v-for="(token, i) in tokens" :key="i">
        <span v-if="classMap[token!]">
          <i :class="classMap[token!]" />
        </span>
      </template>
    </template>
    <template v-else>
      <span v-if="classMap[tile!]">
        <i :class="classMap[tile!]" />
      </span>
    </template>
  </div>
</template>

<style scoped>
.block {
  display: inline-block;
  position: relative;
  background-color: gray;
}
@media screen and (max-width: 540px) {
  .block {
    border-width: 1px !important;
    border-style: none;
    border-color: transparent;
  }
}
.block:before {
  content: "";
  display: block;
  padding-top: 100%;
}
.block span {
  position: absolute;
  /*font-weight: bold;*/
  font-family: initial;
  color: white;
  pointer-events: none;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}
.token {
  background-position: center;
  background-size: contain;
  background-repeat: no-repeat;
}
.rect {
  filter: opacity(0.75);
}

.empty {
  background-color: transparent;
}
.start,
.flystart {
  background-color: indianred;
  border: 2px solid darkred;
}
.start span,
.flystart span,
.ballis span,
.ore span,
.airsup span,
.xbalis span,
.xbbillb span {
  color: darkred;
}
.end {
  background-color: skyblue;
  border: 2px solid dodgerblue;
}
.end span {
  color: dodgerblue;
}
.floor {
  background-color: darkgray;
  border: 1px dashed yellow;
  box-shadow: inset 0 0 0 2px black;
}
.floor span {
  color: white;
}
.road {
  background-color: darkgray;
  border: 2px dotted dimgray;
}
.wall {
  background-color: lightgray;
  border: 2px dotted dimgray;
  box-shadow: 5px 5px 8px black;
  z-index: 2;
}
.fence_bound {
  background-color: darkgray;
  border: 2px solid lightgray;
}
.hole {
  background-color: black;
}
.grass {
  background-color: yellowgreen;
  border: 2px dotted dimgray;
}
.deepsea {
  background-color: steelblue;
  border: 2px dotted darkgray;
}
.infection,
.corrosion_2,
.healing,
.telin,
.telout,
.volcano,
.volspread {
  background-color: darkgray;
  border: 2px dotted dimgray;
  background-position: center;
  background-size: contain;
  background-repeat: no-repeat;
}
.corrosion_2 span {
  color: darkgoldenrod;
}
.telin,
.telout {
  border: 2px dashed dimgray;
}
.telin {
  transform: rotate(180deg); /* fa 和 windicss 都不起作用 */
}

.token {
  background-position: center;
  background-size: contain;
  background-repeat: no-repeat;
}
.hiddenstone {
  background-color: dimgray;
  border: 2px solid darkgray;
}
.streasure span {
  color: black;
}
.roadblock {
  background-color: slategray;
  border: 2px dotted darkgray;
}
.airsup {
  background-color: indianred;
  border: 2px solid darkred;
}
.wdescp span,
.xbbase span {
  color: green;
}
.tower span {
  color: darkslategray;
}
.redtower span {
  color: crimson;
}
</style>

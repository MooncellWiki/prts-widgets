<template>
  <div id="map" class="w-full">
    <div v-for="(row, i) in mapData.map" :key="i" class="row">
      <div
        v-for="(board, n) in row"
        :key="n"
        :class="'board-' + board + ' ' + (mapData.height - 1 - i) + '-' + n"
        :style="'width: ' + 100 / mapData.width + '%'"
      ></div>
    </div>
  </div>
</template>

<script>
import { getImagePath } from '.././utils/utils'

export default {
  props: {},
  data() {
    return {
      //data: Array,
      options: Array,
      mapData: Array,
      predefines: Array,
    }
  },
  mounted() {
    // 获取关卡数据
    $.getJSON(document.URL + '/data', (data) => {
      this.options = data.options
      this.mapData = data.mapData
      this.predefines = data.predefines
    })
  },
  updated() {
    this.$nextTick(() => {
      this.renderTiles(this.mapData.tiles)
      this.renderToken(this.predefines.tokenInsts)
      this.renderBlackBoard(this.options.configBlackBoard)
      this.setFontSize()
      //tippy('[data-tippy-content]', { allowHTML: true })
    })
  },
  methods: {
    // 添加popup
    addTippy(elem, cont) {
      if ($(elem).hasClass('mc-tooltips')) {
        $(elem)
          .children('.tippy-data')
          .append('<br>' + cont)
      } else {
        $(elem).addClass('mc-tooltips')
        $(elem).append(
          '<span class="tippy-data" style="display:none">' + cont + '</span>',
        )
      }
    },
    // 根据地块宽度调整fa大小
    setFontSize() {
      let span = $('[class|="board"] span')
      let size = parseInt((span.parent().width() / 4) * 3)
      span.css('font-size', size + 'px')
    },
    // 设置地块背景图
    setBgImg(key, filename) {
      $('.' + key).css(
        'background-image',
        'url("https://prts.wiki/images/' + getImagePath(filename) + '")',
      )
    },

    // 地形数据
    renderTiles(data) {
      data.forEach((tile, i) => {
        let key = tile.tileKey.replace('tile_', '')
        let height = tile.heightType
        $('.board-' + i).addClass(key)
        switch (key) {
          case 'start':
            $('.board-' + i).html(
              '<span><i class="fas fa-exclamation-triangle"></i></span>',
            )
            this.addTippy('.board-' + i, '<b>侵入点</b>')
            break
          case 'end':
            $('.board-' + i).html(
              '<span><i class="fas fa-exclamation-triangle"></i></span>',
            )
            this.addTippy('.board-' + i, '<b>保护目标</b>')
            break
          case 'flystart':
            $('.board-' + i).html('<span><i class="fas fa-plane"></i></span>')
            this.addTippy('.board-' + i, '<b>空袭侵入点</b>')
            break
          case 'hole':
            this.addTippy('.board-' + i, '<b>地穴</b>')
            break
          case 'grass':
            this.addTippy('.board-' + i, '<b>草丛</b>')
            if (height == 1) {
              $('.board-' + i).css('box-shadow', '5px 5px 8px black')
              $('.board-' + i).css('filter', 'brightness(1.15)')
              $('.board-' + i).css('z-index', '2')
            }
            break
          case 'deepsea':
            this.addTippy('.board-' + i, '<b>清澈水域</b>')
            break
          case 'infection':
            this.setBgImg(key, '特殊地形_活性源石.png')
            this.addTippy(
              '.board-' + i,
              '<b>活性源石</b><br>部署于其上的我军和经过的敌军持续受到伤害，但攻击力和攻速大幅度提升',
            )
            break
          case 'corrosion_2':
            $('.board-' + i).html(
              '<span><i class="fas fa-angle-double-down"></i></span>',
            )
            this.addTippy(
              '.board-' + i,
              '<b>腐蚀地面</b><br>置于其上的我方单位防御力减半',
            )
            break
          case 'healing':
            this.setBgImg(key, '特殊地形_医疗符文.png')
            this.addTippy(
              '.board-' + i,
              '<b>医疗符文</b><br>部署在其上的干员会持续恢复生命',
            )
            break
          case 'telin':
            $('.board-' + i).html('<span><i class="fas fa-indent"></i></span>')
            this.addTippy('.board-' + i, '<b>通道入口</b>')
            break
          case 'telout':
            $('.board-' + i).html('<span><i class="fas fa-outdent"></i></span>')
            this.addTippy('.board-' + i, '<b>通道出口</b>')
            break
          case 'volcano':
            this.setBgImg(key, '特殊地形_热泵通道.png')
            this.addTippy(
              '.board-' + i,
              '<b>热泵通道</b><br>每隔一段时间便会对其上的我军和敌军造成大量伤害',
            )
            break
          case 'volspread':
            this.setBgImg(key, '特殊地形_岩浆喷射处.png')
            this.addTippy(
              '.board-' + i,
              '<b>岩浆喷射处</b><br>每隔一定时间会喷出岩浆，对周围8格内的我方单位造成大量伤害且融化障碍物',
            )
            break
        }
      })
    },
    // 装置数据
    renderToken(data) {
      data.forEach((token) => {
        let pos = token.position
        let key = token.inst.characterKey.replace(/trap_[0-9]+_/g, '')
        $('.' + pos.row + '-' + pos.col).addClass('token ' + key)
        switch (key) {
          case 'xbwood':
            this.setBgImg(key, '生息演算_资源_木材.png')
            this.addTippy(
              '.' + pos.row + '-' + pos.col,
              '<b>杂木林</b><br>可开采<木材>',
            )
            break
          case 'xboverwatch':
            this.setBgImg(key, '头像_装置_监控塔.png')
            this.addTippy(
              '.' + pos.row + '-' + pos.col,
              '<b>监控塔</b><br>可以侦查范围内的视野',
            )
            break
          case 'vegetation':
            this.setBgImg(key, '生息演算_资源_其他掉落物品.png')
            this.addTippy(
              '.' + pos.row + '-' + pos.col,
              '<b>灌木丛</b><br>击破后可以获得一些素材',
            )
            break
          case 'hiddenstone':
            this.addTippy(
              '.' + pos.row + '-' + pos.col,
              '<b>遗迹残骸</b><br>击破后可解锁隐藏区域',
            )
            break
          case 'gtreasure':
            $('.' + pos.row + '-' + pos.col).html(
              '<span><i class="fas fa-crown"></i></span>',
            )
            this.addTippy(
              '.' + pos.row + '-' + pos.col,
              '<b>埋没金属箱</b><br>击破后可获得一些宝物',
            )
            break
          case 'ballis':
            $('.' + pos.row + '-' + pos.col).html(
              '<span><i class="fas fa-exclamation"></i></span>',
            )
            this.addTippy(
              '.' + pos.row + '-' + pos.col,
              '<b>弩炮</b><br>会定期射出弩箭对我方单位造成物理伤害',
            )
            break
          case 'streasure':
            $('.' + pos.row + '-' + pos.col).html(
              '<span><i class="fas fa-crown"></i></span>',
            )
            this.addTippy(
              '.' + pos.row + '-' + pos.col,
              '<b>宝刺金属箱</b><br>击破后可以获得一些珍贵宝物，受到攻击时会反弹真实伤害',
            )
            break
          case 'xbstone':
            this.setBgImg(key, '生息演算_资源_石材.png')
            this.addTippy(
              '.' + pos.row + '-' + pos.col,
              '<b>巨大岩石</b><br>可开采<石材>',
            )
            break
          case 'roadblock':
            this.addTippy(
              '.' + pos.row + '-' + pos.col,
              '<b>道路障碍物</b><br>不容易受到我方单位的攻击',
            )
            break
          case 'xbiron':
            this.setBgImg(key, '生息演算_资源_铁矿石.png')
            this.addTippy(
              '.' + pos.row + '-' + pos.col,
              '<b>奇异矿脉</b><br>可开采<铁矿石>',
            )
            break
          case 'airsup':
            this.addTippy('.' + pos.row + '-' + pos.col, '<b>无人机出发点</b>')
            break
          case 'wdescp':
            $('.' + pos.row + '-' + pos.col).html(
              '<span><i class="fas fa-sign-out-alt"></i></span>',
            )
            this.addTippy(
              '.' + pos.row + '-' + pos.col,
              '<b>逃脱点</b><br>部署干员后激活野外支援可进行逃脱',
            )
            break
          case 'redtower':
            $('.' + pos.row + '-' + pos.col).html(
              '<span><i class="fas fa-broadcast-tower"></i></span>',
            )
            this.addTippy(
              '.' + pos.row + '-' + pos.col,
              '<b>移动战塔</b><br>敌方老巢，击败该地区的全部老巢使该地区不会刷新精英敌袭',
            )
            break
          case 'xbbase':
            $('.' + pos.row + '-' + pos.col).html(
              '<span><i class="fas fa-chess-rook"></i></span>',
            )
            this.addTippy('.' + pos.row + '-' + pos.col, '<b>基地</b>')
            break
          case 'xbfarm':
            this.setBgImg(key, '头像_装置_便携式种植槽.png')
            this.addTippy(
              '.' + pos.row + '-' + pos.col,
              '<b>便携式种植槽</b><br>每天产出一定数量的<稻谷>，可部署在低地',
            )
            break
          case 'poachr':
            $('.' + pos.row + '-' + pos.col).html(
              '<span><i class="far fa-dot-circle"></i></span>',
            )
            this.addTippy(
              '.' + pos.row + '-' + pos.col,
              '<b>老练猎手</b><br>只攻击野生动物，找不到攻击目标时可以闪现移动至周围随机可部署低地，拥有25%的物理和法术闪避',
            )
            break
          case 'ore':
            $('.' + pos.row + '-' + pos.col).html(
              '<span><i class="fas fa-radiation"></i></span>',
            )
            this.addTippy(
              '.' + pos.row + '-' + pos.col,
              '<b>源石祭坛</b><br>周期性向四周释放脉冲波，对我军与敌军造成伤害',
            )
            break
          case 'tidectrl':
            this.addTippy('.' + pos.row + '-' + pos.col, '<b>涨潮控制</b>')
            break
          case 'stone':
            this.setBgImg(key, '头像_装置_碎石.png')
            this.addTippy(
              '.' + pos.row + '-' + pos.col,
              '<b>碎石</b><br>改变敌人行径路线',
            )
            break
        }
      })
    },
    // 隐藏区块 (y1,x1),(y2,x2)
    renderBlackBoard(data) {
      data.forEach((block) => {
        let val = block.valueStr
        if (!val <= 0) {
          let pos = val.replace(/\(|\)/g, '').split(',')
          if (pos.length == 4) {
            let list = []
            for (let y = parseInt(pos[0]); y <= parseInt(pos[2]); y++) {
              for (let x = parseInt(pos[1]); x <= parseInt(pos[3]); x++) {
                list.push([y, x])
              }
            }
            list.forEach((n) => {
              $('.' + n[0] + '-' + n[1]).addClass('rect')
            })
          }
        }
      })
    },
  },
}
</script>

<style scoped>
.row {
  display: flex;
}
[class|='board'] {
  display: inline-block;
  position: relative;
  background-color: gray;
}
[class|='board']:before {
  content: '';
  display: block;
  padding-top: 100%;
}
:deep([class|='board'] span) {
  position: absolute;
  /*font-weight: bold;*/
  font-family: initial;
  color: white;
  pointer-events: none;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
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
:deep(.start span),
:deep(.flystart span) {
  color: darkred;
}
.end {
  background-color: skyblue;
  border: 2px solid dodgerblue;
}
:deep(.end span) {
  color: dodgerblue;
}
.floor {
  background-color: darkgray;
  border: 1px dashed yellow;
  box-shadow: inset 0 0 0 2px black;
}
:deep(.floor span) {
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
:deep(.corrosion_2 span) {
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
:deep(.ballis span),
:deep(.ore span),
:deep(.airsup span) {
  color: darkred;
}
:deep(.streasure span) {
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
:deep(.wdescp span),
:deep(.xbbase span) {
  color: green;
}
:deep(.redtower span) {
  color: darkred;
}
</style>

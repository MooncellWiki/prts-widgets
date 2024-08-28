export const classMap: Record<string, string> = {
  start: "mdi mdi-alert", // 侵入点
  end: "mdi mdi-alert", // 保护目标
  flystart: "mdi mdi-quadcopter", // 空袭侵入点
  telin: "mdi mdi-login-variant", // 通道入口
  telout: "mdi mdi-logout", // 通道出口
  puddle: "mdi mdi-waves", // 池沼地块
  steam: "mdi mdi-fire", // 隐焰地块
  // tokens
  gtreasure: "mdi mdi-crown", // 埋没金属箱
  //ballis: "fas fa-exclamation", // 弩炮
  streasure: "mdi mdi-crown-outline", // 宝刺金属箱
  airsup: "mdi mdi-close-octagon-outline", //可移动战术机库
  wdescp: "mdi mdi-run", //逃脱点
  redtower: "mdi mdi-transmission-tower", // 移动战塔
  xbbase: "mdi mdi-chess-rook", // 基地
  xbfdtion: "mdi mdi-chess-rook", // 风沙营垒
  xbmcv: "mdi mdi-car", // 风沙营垒
  poachr: "mdi mdi-crosshairs-gps", // 老练猎手
  ore: "mdi mdi-radioactive", //源石祭坛
  tower: "mdi mdi-tower-fire", // L-44留声机
  xbalis: "mdi mdi-bow-arrow", //简易弩台
  xbhydr: "mdi mdi-star-three-points", //机关石门
  xbbillb: "mdi mdi-sign-real-estate", // 告示牌
  roadblock: "mdi mdi-cube", //道路障碍物
  hiddenstone: "mdi mdi-shield-key", //遗迹残骸
  xbstation: "mdi mdi-flag-triangle", //号令点
  xbmgbird: "mdi mdi-bird", //喙中奇物
  hstone: "mdi mdi-cube-outline", //城防路障
  xbrandprop: "mdi mdi-help-box-outline", //赛虫-随机道具盒
};

export const TipMap: Record<string, string> = {
  start: "<b>侵入点</b><br>敌方会从此进入战场",
  end: "<b>保护目标</b><br>蓝色目标点，敌方进入后会减少此目标点的耐久",
  flystart: "<b>空袭侵入点</b><br>敌方飞行单位会从此处进入战场",
  hole: "<b>地穴</b><br>危险的凹陷地形或地面破洞，经过的敌人会摔落至底部直接死亡",
  grass: "<b>草丛</b><br>置于其中的干员不会成为敌军远程攻击的目标",
  deepsea: "<b>清澈水域</b><br>可使用<蟹蟹抽水泵>采集<清水>",
  xbdpsea: "<b>清澈水域</b><br>可使用<蟹蟹抽水泵>采集<清水>",
  infection:
    "<b>活性源石</b><br>部署于其上的我军和经过的敌军持续受到伤害，但攻击力和攻速大幅度提升",
  corrosion_2: "<b>腐蚀地面</b><br>置于其上的我方单位防御力减半",
  healing: "<b>医疗符文</b><br>部署在其上的干员会持续恢复生命",
  telin: "<b>通道入口</b><br>敌方会从此进入通道，从通道出口出现",
  telout: "<b>通道出口</b><br>进入通道的敌方单位会从此处再度出现",
  volcano: "<b>热泵通道</b><br>每隔一段时间便会对其上的我军和敌军造成大量伤害",
  volspread:
    "<b>岩浆喷射处</b><br>每隔一定时间会喷出岩浆，对周围8格内的我方单位造成大量伤害且融化障碍物",
  steam:
    "<b>隐焰</b><br><盛季>和<荒季>时每隔一段时间对其上的任何单位造成无视防御和法术抗性的伤害",
  puddle:
    "<b>池沼</b><br>未干涸时具有与<清澈水域>相同的效果，<荒季>时会干涸露出地面",
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
  xbbase: "<b>基地</b>必须保护的核心，被击败后视为演算失败",
  xbfdtion: "<b>风沙营垒</b>必须保护的核心，被击败后视为演算失败",
  xbmcv: "<b>旷野房车</b>在特殊行动中必须保护的核心，被击败后视为本次行动失败",
  xbfarm: "<b>便携式种植槽</b><br>每天产出一定数量的<稻谷>，可部署在低地",
  xbfarmm: "<b>种植箱集群</b><br>部署后，每个演算日产出一定数量的<稻谷>",
  poachr:
    "<b>老练猎手</b><br>只攻击野生动物，找不到攻击目标时可以闪现移动至周围随机可部署低地，拥有25%的物理和法术闪避",
  ore: "<b>源石祭坛</b><br>周期性向四周释放脉冲波，对我军与敌军造成伤害",
  tidectrl: "<b>涨潮控制</b>",
  stone: "<b>碎石</b><br>改变敌人行进路线",
  tower:
    '<b>L-44"留声机"</b><br>我方与敌方可夺取控制权，激活后对敌方造成法术伤害，并可治疗友方单位',
  rmtarms: "<b>R-11a突击动力装甲</b><br>吸收周围实验产物回复技力，技力满时激活",
  xblight: "<b>监视哨站</b><br>可以侦查范围内的视野",
  xbalis:
    "<b>简易弩台</b><br>自身前方直线存在我方单位时发射弩箭造成物理伤害，可被击破",
  xbdiam: "<b>澄亮矿脉</b><br>可被采集",
  xbhydr: "<b>机关石门</b><br>被攻破后开启后续区域",
  xbstation: "<b>号令点</b><br>被攻破后解锁荒废城镇远征",
  xbmgbird: "<b>喙中奇物</b><br>可被治疗，完全恢复后可获得额外资源",
  xbbillb: "<b>告示牌</b><br>会记录一些信息",
  hstone: "<b>城防路障</b><br>可以阻挡多名敌人",
  xbabal:
    "<b>追猎发射台</b><br>每受到一定次数攻击，向范围内的一只【野生动物】发射捕猎网，其生命值低于一定比例时被捕获，否则受到一段时间的束缚",
  xbrandprop:
    "<b>随机道具盒</b><br>源石虫触碰后获得随机一个本场比赛中可提供的比赛用道具，之后消失一段时间",
  xbcp: "<b>检查点</b><br>源石虫赛跑时的目标点位，其中靠近出发点的检查点为终点线",
  xbspd: "<b>加速块</b><br>源石虫经过后会加速",
  pushtw: "<b>喷拒器</b><br>将前方一名敌人推开",
  battery: "<b>便携式补给站</b><br>每4秒对友方单位回复3点技力",
  bondtw: "<b>缚网发射台</b><br>对前方一名敌方释放束缚网，束缚一段时间",
  eradio:
    "<b>废热喷口</b><br>对前方范围内所有敌人造成法术伤害并降低移动速度，可通过受击加速启动",
};

export const bgMap: Record<string, string> = {
  infection: "特殊地形_活性源石.png",
  corrosion_2: "特殊地形_腐蚀地面.png",
  healing: "特殊地形_医疗符文.png",
  volcano: "特殊地形_热泵通道.png",
  volspread: "特殊地形_岩浆喷射处.png",
  // tokens
  ballis: "技能_发射弩箭.png",
  xbwood: "生息演算_资源_木材.png",
  xboverwatch: "头像_装置_监控塔.png",
  vegetation: "生息演算_资源_其他掉落物品.png",
  xbstone: "生息演算_资源_石材.png",
  xbiron: "生息演算_资源_铁矿石.png",
  xbfarm: "头像_装置_便携式种植槽.png",
  xbfarmm: "头像_装置_种植箱集群.png",
  stone: "头像_装置_碎石.png",
  rmtarms: "头像_装置_R-11突击动力装甲.png",
  xblight: "头像_装置_监视哨站.png",
  xbdiam: "生息演算_资源_澄亮石.png",
  xbabal: "头像_装置_追猎发射台.png",
  xbspd: "特殊地形_加速块.png",
  xbcp: "特殊地形_检查点.png",
  pushtw: "头像_装置_喷拒器.png",
  battery: "头像_装置_便携式补给站.png",
  bondtw: "头像_装置_缚网发射台.png",
  eradio: "头像_装置_废热喷口.png",
};

# PRTS Widgets
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FMooncellWiki%2Fprts-widgets.svg?type=shield)](https://app.fossa.com/projects/git%2Bgithub.com%2FMooncellWiki%2Fprts-widgets?ref=badge_shield)


## 推荐开发环境配置

- [VS Code](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)

## 子应用列表

会逐步迁移一些没人会去搜，而且需要复杂 lua/smw 查询的模板过来

- 签名生成 [Widget:ArkSign/dev](https://prts.wiki/w/Widget:ArkSign/dev)
- 干员一览 [Widget:CharList/dev](https://prts.wiki/w/Widget:CharList/dev)
- 配音一览 [Widget:CVList/dev](https://prts.wiki/w/Widget:CVList/dev)
- 敌人一览 [Widget:EnemiesListV2/dev](https://prts.wiki/w/Widget:EnemiesListV2/dev)
- 模组一览 [Widget:EquipList/dev](https://prts.wiki/w/Widget:EquipList/dev)
- 抽卡模拟器 [Widget:GachaSimulatorV2/dev](https://prts.wiki/w/Widget:GachaSimulatorV2/dev)
- 公招计算 [Widget:HrCalculator/dev](https://prts.wiki/w/Widget:HrCalculator/dev)
- 不期而遇事件 [Widget:IsEvent/dev](https://prts.wiki/w/Widget:ISEvent/dev)
- 材料需求 [Widget:ItemDemand/dev](https://prts.wiki/w/Widget:ItemDemand/dev)
- 蚀刻章（光荣之路）[Widget:MedalList/dev](https://prts.wiki/w/Widget:MedalList/dev)
- 干员密录一览 [Widget:MemoryList/dev](https://prts.wiki/w/Widget:MemoryList/dev)
- 企鹅数据小组件 [Widget:PenguinWidget/dev](https://prts.wiki/w/Widget:PenguinWidget/dev)
- Spine [Widget:SpineViewer/dev](https://prts.wiki/w/Widget:SpineViewer/dev)
- 语音表格 [Widget:VoiceTable/dev](https://prts.wiki/w/Widget:VoiceTable/dev)
- 生息演算地图 [Widget:XbMapViewer/dev](https://prts.wiki/w/Widget:XbMapViewer/dev)
- 特勤经验表 [Widget:SOExpCalc/dev](https://prts.wiki/w/Widget:SOExpCalc/dev)

## 贡献代码

[CONTRIBUTING.md](CONTRIBUTING.md)

## 发布

> [!WARNING]
> 部署更新包需要上传到站内 OSS 后才会生效，发布小部件应仅在 Pull Request 被合并后由 GitHub Actions 机器人自动操作。
>
> 在未获确认的情况下请勿执行，hash 变动会导致其他线上组件出错。

```bash
pnpm run build
# ... 上传 dist/ 至 OSS
pnpm run update username password
```


## License
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FMooncellWiki%2Fprts-widgets.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2FMooncellWiki%2Fprts-widgets?ref=badge_large)
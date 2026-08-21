# PRTS Widgets

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
- AudioPlayerV2 [Widget:AudioPlayerV2/dev](https://prts.wiki/w/Widget:AudioPlayerV2/dev)
- 道具一览 [Widget:ItemList/dev](https://prts.wiki/w/Widget:ItemList/dev)
- 剧情播放器 [Widget:StoryPlayer/dev](https://prts.wiki/w/Widget:StoryPlayer/dev)

## 贡献代码

[CONTRIBUTING.md](CONTRIBUTING.md)

## 全站脚本

`src/entries/` 里有几个不对应 `Widget:` 页面的入口，它们由站内 `<head>` 直接按固定
文件名引用，所以产物不带 hash（见 `vite.config.ts` 的 `nohashEntries`）：

| 入口                | 产物                   | 作用                                            |
| ------------------- | ---------------------- | ----------------------------------------------- |
| `sentry.ts`         | `sentry.<hash>.js`     | 前端错误上报                                    |
| `DisplayController` | `DisplayController.js` | 森空岛内嵌浏览器的显示调整                      |
| `Tooltip.ts`        | `Tooltip.js`           | 全站 tippy（`tippy6`）+ `.mc-tooltips` 自动挂载 |

### Tooltip.js

替代站内 `<head>` 里原先手写的两行：

```html
<link
  href="https://static.prts.wiki/npm/tippy.js/tippy-light-border.css"
  rel="stylesheet"
/>
<script src="https://static.prts.wiki/npm/tippy.js/tippy.js"></script>
```

换成：

```html
<link
  rel="modulepreload"
  href="https://static.prts.wiki/widgets/production/Tooltip.js"
  as="script"
/>
<script
  type="module"
  crossorigin
  src="https://static.prts.wiki/widgets/production/Tooltip.js"
></script>
```

上线后站内这几个页面就不再需要了，可以清空或从 `MediaWiki:Gadgets-definition` 摘掉：

- `MediaWiki:Gadget-popup.js`（`.mc-tooltips` 的挂载逻辑已经并进 `Tooltip.ts`，并且改成
  `MutationObserver`，小部件动态渲染出来的 DOM 也会自动挂上）
- `MediaWiki:Gadget-Tippy.js`、`MediaWiki:Gadget-Tippy-light-border.css`（`ext.gadget.tippy`
  本来就没在 `Gadgets-definition` 里注册过）

`MediaWiki:Gadget-TippyRef.js`、`微件:MemoryMedalCatcher` 用的 `tippy6` 全局，以及
`MediaWiki:Gadget-darkModeFix.css`、`微件:CharShow` 里写死的 `.tippy6-*` 类名都保持可用：
npm 包的 `tippy-` 前缀在打包时会被改写成 `tippy6-`（`vite.config.ts` 的 `tippyNamespace`
插件），避开 SMW 自带的那份 `window.tippy` / `.tippy-box`。

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

MIT

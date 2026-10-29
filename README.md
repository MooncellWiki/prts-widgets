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
- 时装商店 [Widget:SkinShop/dev](https://prts.wiki/w/Widget:SkinShop/dev)
- 高级凭证区 [Widget:HighShop/dev](https://prts.wiki/w/Widget:HighShop/dev)

## 贡献代码

[CONTRIBUTING.md](CONTRIBUTING.md)

## 全站脚本

`src/entries/` 里有几个不对应 `Widget:` 页面的入口，它们由站内按固定文件名引用，所以
产物不带 hash。普通全站脚本见 `vite.config.ts` 的 `nohashEntries`；Service Worker 由
`scripts/build-sw.ts` 独立构建：

| 入口                   | 产物                   | 引用位置               | 作用                                            |
| ---------------------- | ---------------------- | ---------------------- | ----------------------------------------------- |
| `sentry.ts`            | `sentry.js`            | `<head>`               | 前端错误上报                                    |
| `DisplayController.ts` | `DisplayController.js` | `<head>`               | 森空岛内嵌浏览器的显示调整                      |
| `Tooltip.ts`           | `Tooltip.js`           | `<head>`               | 全站 tippy（`tippy6`）+ `.mc-tooltips` 自动挂载 |
| `sw.prts.ts`           | `sw.prts.js`           | wiki 根目录的 `/sw.js` | Service Worker                                  |
| `sw.fgo.ts`            | `sw.fgo.js`            | FGO 根目录的 `/sw.js`  | FGO Service Worker                              |

这些产物必须自包含（不 import 任何带 hash 的 chunk）：站内引用的是固定 URL，CDN 和浏览器
会缓存旧版，而 `pnpm run prune` 会把 OSS 上不在本次 `dist/` 里的文件删掉，一旦它们依赖了
带 hash 的 chunk，缓存里的旧产物就会指向已经被删掉的文件。
Worker 通过独立的单入口 IIFE 构建生成 classic 脚本。

### Service Worker

`pnpm run build` 包含 Worker 构建；只构建 Worker 可运行：

```bash
pnpm run build:sw
```

输出 `dist/sw.prts.js`（PRTS，mooncell 目前共用）和 `dist/sw.fgo.js`，各自将 Workbox 打进
单个 classic Worker，不依赖共享 ESM chunk 或 `workbox-v6.5.0/`。FGO 保留原有的
NetworkFirst（页面及 PHP，6 秒网络超时）与 CacheFirst（Sentry / bytecdntp / pstatp）规则。
Worker 不再通过 UA 判断浏览器版本；浏览器是否注册仍由站点的 Service Worker 能力检测决定。

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

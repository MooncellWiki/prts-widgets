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
- 不期而遇事件 [Widget:ISEvent/dev](https://prts.wiki/w/Widget:ISEvent/dev)
- 材料需求 [Widget:ItemDemand/dev](https://prts.wiki/w/Widget:ItemDemand/dev)
- 蚀刻章（光荣之路）[Widget:MedalList/dev](https://prts.wiki/w/Widget:MedalList/dev)
- 蚀刻章展示 [Widget:MedalShowcase/dev](https://prts.wiki/w/Widget:MedalShowcase/dev)
- 干员密录一览 [Widget:MemoryList/dev](https://prts.wiki/w/Widget:MemoryList/dev)
- 企鹅数据小组件 [Widget:PenguinWidget/dev](https://prts.wiki/w/Widget:PenguinWidget/dev)
- Spine [Widget:SpineViewer/dev](https://prts.wiki/w/Widget:SpineViewer/dev)
- 语音表格 [Widget:VoiceTable/dev](https://prts.wiki/w/Widget:VoiceTable/dev)
- 生息演算地图 [Widget:XbMapViewer/dev](https://prts.wiki/w/Widget:XbMapViewer/dev)
- 特勤经验表 [Widget:SOExpCalc/dev](https://prts.wiki/w/Widget:SOExpCalc/dev)
- AudioPlayerV2 [Widget:AudioPlayerV2/dev](https://prts.wiki/w/Widget:AudioPlayerV2/dev)
- 道具一览 [Widget:ItemList/dev](https://prts.wiki/w/Widget:ItemList/dev)
- 剧情播放器 [Widget:StoryPlayer/dev](https://prts.wiki/w/Widget:StoryPlayer/dev)
- 剧情资源概览 [Widget:StoryAssetExplorer/dev](https://prts.wiki/w/Widget:StoryAssetExplorer/dev)
- 时装商店 [Widget:SkinShop/dev](https://prts.wiki/w/Widget:SkinShop/dev)
- 时装回廊（新版）[Widget:SkinGalleryV2/dev](https://prts.wiki/w/Widget:SkinGalleryV2/dev)，迁移和发布顺序见 [迁移计划](https://github.com/MooncellWiki/prts-widgets/issues/491)
- 高级凭证区 [Widget:HighShop/dev](https://prts.wiki/w/Widget:HighShop/dev)
- 泰拉人名录剧情立绘 [Widget:NpcPortrait/dev](https://prts.wiki/w/Widget:NpcPortrait/dev)
- 后勤技能一览 [Widget:BaseSkillList/dev](https://prts.wiki/w/Widget:BaseSkillList/dev)

## 独立页面

### 开发与调试

运行 `pnpm dev`，按终端实际端口打开：

```text
/pages/StoryPlayer.html?path=obt/main/level_main_00-01_beg.txt
```

`path` 相对 `gamedata/latest/story`；也可用 `url` 传完整 HTTP(S) 地址，优先于 `path`。
在同一地址后加 `&debug&line=9`，开启调试工具栏、原始脚本、行号跳转和 `window.__storyRec` 抓帧器。
调试模式仅在 dev 可用，生产构建不包含调试代码。

要预览本地产物，使用本地 base 构建，避免请求默认配置中的线上 OSS 资源：

```bash
pnpm exec vite build --base=/ --outDir dist-preview
pnpm exec vite preview --base=/ --outDir dist-preview
```

打开预览地址下的同一路径。生产字体有跨源限制，本地预览可能退回系统字体；字体效果使用 `pnpm dev` 的代理检查。

### 接入独立页模式

以 StoryPlayer 为例：

1. 在 `pages/<Name>.html` 创建 HTML 壳，包含 viewport、挂载节点及 `/src/entries/pages/<Name>.ts` 入口。
2. 在 `src/entries/pages/` 创建入口，导入 `@mooncellwiki/prts-design-css/standalone.css` 和 `src/pages/page.css`，页面 `body` 加 `ak-scope`。
3. 在 `src/pages/` 编写 Vue 页面壳，调用 `usePageTheme()`，负责取数、加载与错误状态，通过 props 挂载 `src/widgets/` 中的共享组件。跨源数据接口须支持 CORS。
4. Wiki 入口继续放在 `src/entries/widgets/`。独立 HTML 不放入 `templates/`；Vite 自动收集 `pages/*.html`，`pnpm build` 后产物位于 `dist/pages/`。

参考 [StoryPlayer 入口](src/entries/pages/StoryPlayer.ts) 和 [页面壳](src/pages/StoryPlayer.vue)。

## 贡献代码

[CONTRIBUTING.md](CONTRIBUTING.md)

## 全站脚本

`src/entries/widgets/` 里有几个不对应 `Widget:` 页面的入口，它们由站内按固定文件名引用，所以
产物不带 hash（见 `vite.config.ts` 的 `nohashEntries`）：

| 入口                   | 产物                   | 引用位置               | 作用                                            |
| ---------------------- | ---------------------- | ---------------------- | ----------------------------------------------- |
| `sentry.ts`            | `sentry.js`            | `<head>`               | 前端错误上报                                    |
| `DisplayController.ts` | `DisplayController.js` | `<head>`               | 森空岛内嵌浏览器的显示调整                      |
| `Tooltip.ts`           | `Tooltip.js`           | `<head>`               | 全站 tippy（`tippy6`）+ `.mc-tooltips` 自动挂载 |
| `sw.prts.ts`           | `sw.js`                | wiki 根目录的 `/sw.js` | Service Worker                                  |

这些产物必须自包含（不 import 任何带 hash 的 chunk）：站内引用的是固定 URL，CDN 和浏览器
会缓存旧版，而 `pnpm run prune` 会把 OSS 上不在本次 `dist/` 里的文件删掉，一旦它们依赖了
带 hash 的 chunk，缓存里的旧产物就会指向已经被删掉的文件。修改构建配置时需检查这些固定入口的依赖；当前没有自动断言插件。

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

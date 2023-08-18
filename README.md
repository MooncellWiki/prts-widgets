# PRTS Widgets

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)

## Type Support For `.vue` Imports in TS

Since TypeScript cannot handle type information for `.vue` imports, they are shimmed to be a generic Vue component type by default. In most cases this is fine if you don't really care about component prop types outside of templates. However, if you wish to get actual prop types in `.vue` imports (for example to get props validation when using manual `h(...)` calls), you can enable Volar's Take Over mode by following these steps:

1. Run `Extensions: Show Built-in Extensions` from VS Code's command palette, look for `TypeScript and JavaScript Language Features`, then right click and select `Disable (Workspace)`. By default, Take Over mode will enable itself if the default TypeScript extension is disabled.
2. Reload the VS Code window by running `Developer: Reload Window` from the command palette.

You can learn more about Take Over mode [here](https://github.com/johnsoncodehk/volar/discussions/471).

## 子应用列表

会逐步迁移一些没人会去搜，而且需要复杂 lua/smw 查询的模板过来

- 干员一览[Widget:CharList/dev](https://prts.wiki/w/Widget:CharList/dev)
- 公招计算[Widget:HrCalculator/dev](https://prts.wiki/w/Widget:HrCalculator/dev)
- 需求材料干员 [Widget:ItemDemand/dev](http://prts.wiki/w/Widget:ItemDemand/dev)
- 语音表格 [Widget:VoiceTable/dev](https://prts.wiki/w/Widget:VoiceTable/dev)
- Spine [Widget:Spinev2/dev](https://prts.wiki/w/Widget:Spinev2/dev)
- 干员图鉴 [Widget:CharList/dev](https://prts.wiki/w/Widget:CharList/dev)
- 不期而遇事件 [Widget:IsEvent/dev](https://prts.wiki/w/Widget:ISEvent/dev)
- 生息演算地图 [Widget:XbMapViewer/dev](https://prts.wiki/w/Widget:XbMapViewer/dev)

## 项目配置

### 安装项目依赖

项目使用 [pnpm](https://pnpm.io/) 管理项目依赖，请使用 [pnpm](https://pnpm.io/) 安装本项目。

```bash
$ pnpm install
```

### 创建新应用

```bash
$ pnpm run create WidgetName username password
```

### 发布

> [!WARNING]
> 部署更新包需要上传到站内 OSS 后才会生效，发布小部件应仅在 Pull Request 被合并后由 GitHub Actions 机器人自动操作。
>
> 在未获确认的情况下请勿执行，hash 变动会导致其他线上组件出错。

```bash
$ pnpm run build
# ... 上传 dist/ 至 OSS
$ pnpm run update username password
```

# PRTS Widgets

## 推荐开发环境配置

- [VS Code](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)

## `.vue` TypeScript 类型支持

由于 TypeScript 不能处理 `.vue`  导入的类型信息，它们默认会被作为通用的 Vue 组件类型来处理。在大多数情况下，如果您不太关心模板之外的组件属性类型，这是可以接受的。然而，如果您希望在 `.vue` 导入中获取实际的属性类型（例如，在使用手动的 `h(...)` 调用时获取属性验证），您可以按照以下步骤启用 Volar 的接管模式：

1. 从 VS Code 的命令面板运行 `Extensions: Show Built-in Extensions`，找到 `TypeScript and JavaScript Language Features`，然后右键单击并选择 `Disable (Workspace)`。默认情况下，如果默认的 TypeScript 扩展被禁用，接管模式将自动启用。
2. 通过从命令面板运行 `Developer: Reload Window` 来重新加载 VS Code 窗口。
您可以在 [这里](https://github.com/johnsoncodehk/volar/discussions/471) 了解更多关于接管模式的信息。

## 子应用列表

会逐步迁移一些没人会去搜，而且需要复杂 lua/smw 查询的模板过来

- 干员一览 [Widget:CharList/dev](https://prts.wiki/w/Widget:CharList/dev)
- 敌人一览 [Widget:EnemiesListV2/dev](https://prts.wiki/w/Widget:EnemiesListV2/dev)
- 模组一览 [Widget:EquipList/dev](https://prts.wiki/w/Widget:EquipList/dev)
- 公招计算 [Widget:HrCalculator/dev](https://prts.wiki/w/Widget:HrCalculator/dev)
- 材料需求 [Widget:ItemDemand/dev](https://prts.wiki/w/Widget:ItemDemand/dev)
- 企鹅数据小组件 [Widget:PenguinWidget/dev](https://prts.wiki/w/Widget:PenguinWidget/dev)
- 语音表格 [Widget:VoiceTable/dev](https://prts.wiki/w/Widget:VoiceTable/dev)
- Spine [Widget:Spinev2/dev](https://prts.wiki/w/Widget:Spinev2/dev)
- 不期而遇事件 [Widget:IsEvent/dev](https://prts.wiki/w/Widget:ISEvent/dev)
- 生息演算地图 [Widget:XbMapViewer/dev](https://prts.wiki/w/Widget:XbMapViewer/dev)
- 蚀刻章（光荣之路）[Widget:MedalList/dev](https://prts.wiki/w/Widget:MedalList/dev)
## 项目配置

### 安装项目依赖

项目使用 [pnpm](https://pnpm.io/) 管理项目依赖，请使用 [pnpm](https://pnpm.io/) 安装本项目。

```bash
pnpm install
```

### 创建新应用

```bash
pnpm run create WidgetName username password
```

### 发布

> [!WARNING]
> 部署更新包需要上传到站内 OSS 后才会生效，发布小部件应仅在 Pull Request 被合并后由 GitHub Actions 机器人自动操作。
>
> 在未获确认的情况下请勿执行，hash 变动会导致其他线上组件出错。

```bash
pnpm run build
# ... 上传 dist/ 至 OSS
pnpm run update username password
```

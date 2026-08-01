## 目标
把 `../arknights-story-player` 的实现迁入本仓库（prts-widgets），按本仓库约定改造成一个小部件：
- **只搬「引擎 + 播放器壳」**（不含原 App.vue 里的故事选择器/lobby 阶段）。播放器由调用方通过 DOM `data-*` 指定故事。
- **去掉 Sentry**（wiki 已全局加载 Sentry，本仓库约定不重新 init）。
- 引擎代码放 `src/widgets/StoryPlayer/engine/`，引擎外的 `context.ts` 放 `src/widgets/StoryPlayer/context.ts`（保留原相对路径结构 `engine/` ← `../context`，使引擎内部 import 无需改动）。
- **原 App.vue 里手写的 Vue 组件**（按钮、`<select>`、模式分段、LOG ALL 弹窗壳）改用 **naive-ui** 组件。

## 架构结论（已核实）
- 引擎（~9.3k 行）是框架无关纯 TS，仅依赖 `pixi.js` + `@pixi/sound`；资源 URL 全是绝对地址（`torappu.prts.wiki` / jsdelivr），`font.ts` 字体预加载走 JS。无 vue/naive-ui/sentry 引用 → 可整目录照搬。
- 本仓库用 **UnoCSS presetUno**（即 presetWind3）→ 完整 Tailwind 默认色板 + 任意值工具类（`bg-[linear-gradient(...)]`/`shadow-[...]`/`aspect-video` 等已在仓库中使用）。原 App.vue/LogAll 里的 Tailwind 布局类可直接复用。
- 本仓库 prettier 约定：**双引号 / 分号 / `trailingComma:"all"`**（与源仓库 antfu 风格相反）→ 搬入后必须重新格式化。

## 实施步骤

### 1. 依赖与构建配置
- `package.json` → `dependencies` 增加 `pixi.js ^8.16.0`、`@pixi/sound ^6.0.1`（与源仓库同版本，peer 兼容）。
- `vite.config.ts` → `manualChunks` 在 `howler` 那行后插入 `if (id.includes("pixi")) return "pixi";`（须在 `node_modules` 兜底分支之前，子串匹配 `pixi.js` 与 `@pixi/sound`）。

### 2. 搬入引擎（`src/widgets/StoryPlayer/`）
- 新建 `src/widgets/StoryPlayer/context.ts`：照搬 `../arknights-story-player/src/context.ts`。
- 新建 `src/widgets/StoryPlayer/engine/`：照搬 `../arknights-story-player/src/engine/` 整目录（含 `rendering/core|panels` 子目录与 `renderer.ts` 兼容重导出）。
- 每个文件搬入后跑 prettier/eslint `--fix` 统一到双引号+分号，修剩余 lint。引擎内部相对 import（`'../context'`、`'./parser'`、`'../../execution'` 等）因目录结构一致保持有效，不改。
- 不搬 `main.ts`、`style.css`（全局 body 背景在 widget 上下文里不适用，字体预加载已由 `engine/font.ts` 用 JS 处理）。

### 3. 播放器壳组件 `src/widgets/StoryPlayer/index.vue`（新建，替代原 App.vue）
拆掉 selector/lobby 阶段，保留并改造播放器部分。逻辑（player ref / preloadAssets / syncState / onAdvance / onKeydown / setAutoPlayMode / setAutoPlaySpeedLevel / openLogAll 等）基本照搬，UI 改造如下：
- 顶层用 `<NConfigProvider :theme :theme-overrides preflight-style-disabled>` + `useTheme()` 包裹，沿用 AudioPlayerV2/ISEvents 的暗色适配约定。
- 16:9 播放容器（`aspect-video`、host div、`@click/@keydown`）保留（pixi 挂载点，非表单组件）。
- 「跳过片段」按钮 → `NButton`（type/ghost + `NIcon` 可选）。
- 预加载/错误遮罩文字保留（纯展示，非表单）。
- 播放控制条：
  - 播放模式（手动/自动/快速）→ `NButtonGroup` + `NButton`（`v-for`，选中态用 `:type`）。
  - 播放速度 → `NSelect`（选项动态 `1..3` 或 `1..4` 档，`:value` 绑定 `buttonSpeedLevel`/`quickSpeedLevel`）。
  - 「LOG ALL」按钮 → `NButton`。
- 状态行 `state: xxx` 保留。
- props：`storyTxt: string`（故事 txt 路径，由 entry 传入）。删除 `storyGroups/cascader/fetchStoryList/selectedPath/viewMode==='selector'|'lobby'` 等 selector 相关逻辑。
- 调用流程：mount 时若 `storyTxt` 有值 → 调 `fetchStoryScriptByPath` + `loadContextByPath` + `preloadDialogFont` + `createStoryPlayer` + mount host + `preloadContextAssets`（合并原 `onLoadStory`+`onStartPlay`+`preloadAssets`）。

### 4. LOG ALL 面板（新建 `src/widgets/StoryPlayer/components/LogAllPanel.vue`、`LogAllList.vue`）
- `LogAllList.vue`：**照搬**，保留 UnoCSS 类（递归分支树，无对应 naive-ui 表单组件，仅展示文本）。
- `LogAllPanel.vue`：**重写外壳**为 `<NModal preset="card" :show :title style>`，内部滚动容器 + `LogAllList` 保留，标题栏「关闭」改 `NButton`。滚动定位逻辑（watch activeLineIndex → scrollIntoView）照搬。

### 5. 入口 `src/entries/StoryPlayer.ts`（新建）
按本仓库 entry 约定（参考 `AudioPlayerV2.ts`/`SpineViewer.ts`）：
- `import "virtual:uno.css"` + `createApp`。
- 查询挂载点（如 `#story-player-root`），读取 `data-story-txt`，`createApp(StoryPlayer, { storyTxt }).mount(el)`。
- 不引入 Sentry。

### 6. 模板与文档
- 新建 `templates/StoryPlayer.html`，仿照其他模板：`<includeonly><div id="story-player-root" data-story-txt="..."></div><head></head><script type="module" src="/src/entries/StoryPlayer.ts"></script></includeonly>...`。
- `README.md` → 子应用列表追加「剧情播放器 [Widget:StoryPlayer/dev]」一行。

### 7. 验证
- `pnpm install`（拉 pixi 依赖）。
- `pnpm exec vue-tsc -b` 类型检查（引擎需通过本仓库更严格 tsconfig，必要时修类型）。
- `pnpm exec eslint --fix src/widgets/StoryPlayer src/entries/StoryPlayer.ts`。
- `pnpm build` 通过（确认 pixi chunk 生成、无打包错误）。
- 报告每个验证步骤的真实结果；不跳过、失败照实说明。

## 不做的事
- 不搬故事选择器/lobby UI 与 `NCascader`。
- 不引入 `@sentry/vue`，不在 entry 里 init Sentry。
- 不动其他既有 widget/entry。
- 不改全局 body 样式（`style.css` 丢弃）。
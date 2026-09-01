# StoryPlayer

明日方舟 AVG 剧情播放器 widget（PRTS wiki 用）：把反编译的 `Torappu.AVG.*`
（Unity）移植到 Web——Vue 3 外壳 + PixiJS 8 渲染 + @pixi/sound 音频。产物跨源
部署到 OSS 由 prts.wiki 宿主页加载，很多"怪写法"是跨源/宿主约束的结果，
改动前先看文件内注释。

## 本地调试

```bash
pnpm dev  # 打开 http://localhost:8080/debug/StoryPlayer.html?path=obt/main/level_main_00-01_beg.txt
```

不依赖 prts.wiki 宿主页。URL 参数、seek 档位、`window.__storyRec` 抓帧器、
依赖的引擎钩子与坑位清单等调试文档全在 `debug/StoryPlayer.html` 顶部注释里，
改调试行为时同步更新。

## 数据流

```
src/entries/StoryPlayer.ts        # 从 #datas_txt 取剧情 txt，挂载 index.vue
  └─ index.vue                    # UI 外壳：lobby/text/player 三种 viewMode、全屏、自动播放
      ├─ context.ts               # 拉 character.json + story_variables.json
      ├─ engine/createStoryPlayer # 组装 parser + runtime + renderer + audio
      ├─ engine/preload.ts        # 静态扫描脚本收集资源，预热 PIXI Assets
      └─ engine/log/              # Log All（文本全览）符号分析，独立于播放
```

播放位置由 index.vue 每 80ms `syncState()` 轮询（有引用相等性去重，别改成
无条件换新数组）；当前显示行例外，由 runtime 的 `onDisplayedLineChange` 推送，
Log All 高亮与调试页行跟随都订阅它。

## 目录导览

| 路径 | 职责 |
| --- | --- |
| `engine/types.ts` | 全部公共类型 + `StoryRenderer`/`StoryAudio`/`StoryPlayer` 接口 + 1280×720 常量 |
| `engine/parser.ts` | `[command(args)]text` 行解析、反斜杠续行、隐式 endtip、header→StoryMetadata |
| `engine/runtime.ts` | 核心状态机：`PlayerState`、decision 闸门、skipnode/skiptothis、打字机、自动播放多档速度 |
| `engine/commandRegistry.ts` / `execution.ts` | 命令名小写化分发；`ExecutionHandle` 阻塞语义 + 可注入 `AnimationClock` |
| `engine/asset.ts` | 资源路由到 `torappu.prts.wiki/assets`（bg/images/characters/video/audio、`$var`/`@path` 音频键） |
| `engine/characterRef.ts` | 角色引用 `$group`/`@alias`/`#index` 解析 + fade identity |
| `engine/font.ts` | FontFace 显式预载思源黑体 Bold，必须在 PIXI 测量前完成 |
| `engine/rendering/PixiStoryRenderer.ts` | `StoryRenderer` 的 PIXI 实现，逻辑坐标恒 1280×720 |
| `engine/rendering/panels/` | 各命令 UI 面板：Dialog/Decision/Video/Interlude/CgItem/AvgDisplay/AnimText/SpellSticker/FocusEffect |
| `engine/rendering/core/` | `LayerGraph`（层序）、`TweenRunner`、`Shake-path`（镜头抖动）、`SceneGeometry` |
| `engine/log/` | `semantics`（与 runtime 共享的纯语义）→ `symbolicFlow`（符号状态 DAG）→ `condition`（DNF 路径条件）→ `document`（UI 投影） |
| `engine/` 其余 | `richtext`（富文本颜色）、`textVariables`（`{@xxx}` 展开，nickname 取 `wgUserName` 兜底"博士"）、`showitem`（960×540→1280×720）、`audio` |
| `components/` | LogAllPanel/LogAllList、AssetListModal + CharacterFacePreview |
| `assets.ts` + `assets/ui/` | APK 内置 UI 贴片，随包打包 |

## 关键不变量

- **Native provenance 注释**：每个移植行为注明原生日对应的 `Torappu.AVG.*`
  类/方法，并说明哪些是 Web 适配；新增/修改移植时延续此约定。
- **大小写规则**（均有原生依据，别"顺手统一"）：命令名小写、参数键保留源
  大小写；character.json 的 map key 折叠小写但 `name`/`image`/`face` 原样；
  fade identity 不折叠、按 ordinal 比较。
- **semantics.ts 是单一真相**：runtime 执行闸门与 log 符号分析共用
  `passesGate`/`parseDecision` 等函数，不得分叉第二份实现。
- **Log All 退化契约**：状态数/条件乘积超限时退化为无条件全量文本，宁丢
  分支标注也不漏行。
- **无暂停语义**（原生 AVG 全靠点击驱动）：`advance()` 仅在
  idle/waiting_input 有效。
- **assets.ts 必须用 `new URL('./x.png', import.meta.url)` 字面量**：widget
  跨源加载，普通 import 在 dev 下会 404，字面量才能被 Vite 静态打包。
- **两处不能删的"怪代码"**：`entries/StoryPlayer.ts` 开头的原型补丁还原
  （防同页旧版播放器的 krliov.toolbox.js 可枚举补丁破坏 pixi `for...in`）；
  `createStoryPlayer.ts` 对 `@pixi/sound` 的副作用 import（注册 Assets 加载器，
  不能改 `import type`）。

## 测试与验证

```bash
pnpm test            # 单测（vitest + happy-dom），spec 在仓库根 tests/
pnpm test:story-log  # 全语料 Log All 回归（约 1-2 分钟；语料缺失整组跳过，不进 CI）
pnpm lint            # ESLint（prettier + unicorn + import-x，import 按序）
pnpm build           # 含 vue-tsc 类型检查
```

- 改哪个模块就跑对应 spec；改动 `engine/log/` 或 runtime 的
  decision/multiline 语义后，本地必跑 `pnpm test:story-log`
  （语料目录用 `STORY_CORPUS_ROOT` 指定）。
- `tests/helpers/storyOracle.ts` 是独立于 `engine/log/symbolicFlow.ts` 的
  第二套解释器，全语料对拍用；必须保持独立实现，不要复用引擎代码。

## 常见任务

- **移植新命令**：`runtime.ts` 注册 `builtinCommandNames` → 参数解析成
  `types.ts` 的 `*Input` → 渲染落在 `PixiStoryRenderer` 或新 panel →
  `preload.ts` 补资源收集 → 注释标 provenance。涉及分支/文本可见性的命令
  还要同步 `log/semantics.ts`、`log/symbolicFlow.ts`、
  `tests/helpers/storyOracle.ts` 三处语义。
- **改 Log All 展示**：只动 `log/document.ts` 和 `components/LogAll*.vue`；
  `symbolicFlow` 的 DAG 是语义真相，不要为展示改它。

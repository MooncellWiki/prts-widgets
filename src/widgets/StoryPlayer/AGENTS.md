# StoryPlayer

明日方舟 AVG 剧情播放器 widget（PRTS wiki 用）。把游戏原生 Unity 引擎
（反编译的 `Torappu.AVG.*`）移植到 Web：Vue 3 外壳 + PixiJS 8 渲染 +
@pixi/sound 音频。产物跨源部署到 OSS（`static.prts.wiki`）并由 prts.wiki
页面加载，很多"怪写法"是跨源/宿主页面约束的结果，改动前先看文件内注释。

## 本地独立调试

不依赖 prts.wiki 宿主页的调试入口（不需要 `#datas_txt` / 微件:StoryPlayer/dev）：

```bash
pnpm dev
# 打开 http://localhost:8080/debug/StoryPlayer.html?path=obt/main/level_main_00-01_beg.txt
```

- `path` 是相对 `torappu.prts.wiki/gamedata/latest/story` 的剧情 txt 路径，也
  接受完整 URL；页面顶部输入框可直接换脚本（换脚本会用 key 整体重建播放器）。
- `line` 是可选的目标行号（文本行的 1-based 源行号，与 Log All 一致）。确认后
  从头播放：快速模式 4 档 + `setDecisionPolicy` 按方案自动选 decision，到达
  该行后切回手动。方案由 `engine/log/seek.ts` 的 `planChoicesForLine` 从
  `analyzeStoryFlow` 产物里贪心求出（每个 decision 尽量选第一个选项，被
  predicate gate 挡住的才选指定项）。目标行必须是文本 emission 的行号，
  multiline 中间片段会提示改填段末行号。
- 页面为左右分栏：左侧播放器，右侧原始脚本（带行号；当前播放行高亮并自动
  滚动跟随；decision 行带 ◆ 标记，seek 中的计划选择会显示 ◆→n；点击文本行
  即跳转到该行）。注意 arming 时必须先 `setAutoPlayMode("quick_play")` 再
  `setAutoPlaySpeedLevel`——后者按当前模式写档位，顺序反了 4 档会被钳到
  按钮自动的 3 档上限。
- 组成：`debug/StoryPlayer.html`（仅 dev 的宿主页，页面级高度样式）+
  `src/entries/StoryPlayerDebug.ts`（薄入口：挂载 shell）+
  `components/StoryPlayerDebugShell.vue`（工具栏 / seek 编排 / 原始脚本面板，
  spd-* 样式在其 scoped style 里）。三者都不在 `templates/`，
  不会进 build 产物，也不会被同步到 wiki。
- 对话字体走 vite 的 `/debug-static` 代理（`engine/font.ts` 在 DEV 下指向代理
  路径）：static.prts.wiki 的 OSS 桶有 Referer 防盗链且 403 不带 CORS 头，
  localhost 直连会被拦。
- 独立页里"加载旧版播放器"不可用（依赖宿主页的 `#old-player`），Sentry 反馈
  与 `{@nickname}` 用户名同样依赖宿主环境，会走兜底逻辑。
- 相关引擎钩子（均为 Web 调试适配，宿主页不用）：runtime 的
  `setDecisionPolicy`（decision 免面板自动选择，命中时不翻转自动播放模式）、
  `ConditionStore.satisfyingAssignment`（DNF 贪心取满足赋值）、index.vue
  `defineExpose` 的 `getPlayer`/`getContext`。

## 数据流

```
src/entries/StoryPlayer.ts        # 从 #datas_txt 取剧情 txt，挂载 index.vue
  └─ index.vue                    # UI 外壳（lobby/text/player 三种 viewMode）
      ├─ context.ts               # 拉 avg/character.json + story_variables.json
      ├─ engine/createStoryPlayer # 组装 runtime + renderer + audio
      │   ├─ engine/parser.ts     # 剧情行 → ParsedLine（AVGParser 移植）
      │   ├─ engine/runtime.ts    # 命令解释器 / 状态机（AVGController 移植）
      │   ├─ engine/rendering/…   # PixiStoryRenderer + panels/ + core/
      │   └─ engine/audio.ts      # HtmlStoryAudio（@pixi/sound）
      ├─ engine/preload.ts        # 收集资源清单并预热 PIXI Assets 缓存
      └─ engine/log/…             # Log All（文本全览）符号分析，独立于播放
```

播放位置轮询：index.vue 每 80ms `syncState()` 从 player 拉状态（有引用
相等性去重，别改成无条件换新数组）。例外是当前显示行：runtime 的
`onDisplayedLineChange` 推送（setter 去重、多监听器），index.vue 的 Log All
高亮与调试页行跟随都订阅它，不走轮询。

## 目录导览

| 路径 | 职责 |
| --- | --- |
| `index.vue` | 三个 viewMode（lobby 加载选择 / text 纯文本 / player 播放）、全屏、自动播放控制、反馈（Sentry）、旧版播放器兜底（`#old-player`，接管后无返回） |
| `context.ts` | `Context`：script、storyMetadata、audioVariables、linkMap（character.json 规范化） |
| `engine/types.ts` | 全部公共类型 + `StoryRenderer`/`StoryAudio`/`StoryPlayer` 接口 + 1280×720 常量 |
| `engine/parser.ts` | `[command(args)]text` 行解析、反斜杠续行、隐式 endtip、header→StoryMetadata |
| `engine/runtime.ts` | 核心状态机：`PlayerState`（idle/running/waiting_input/waiting_timer/waiting_video/waiting_decision/finished/error）、decision 闸门、skipnode/skiptothis、打字机、自动播放三模式×多档速度 |
| `engine/commandRegistry.ts` | 命令名小写化分发（一个命令可挂多个 executor） |
| `engine/execution.ts` | `ExecutionHandle`（阻塞命令一次性完成语义）+ `AnimationClock`（可注入，测试用） |
| `engine/asset.ts` | 资源路由到 `torappu.prts.wiki/assets`（ResourceRouter 移植：bg/images/characters/video/audio、`$var`/`@path` 音频键） |
| `engine/preload.ts` | 静态扫描脚本收集全部图片/音频/角色差分 URL，导出清单（导出弹窗也用） |
| `engine/characterRef.ts` | 角色引用 `$group`/`@alias`/`#index` 解析（`_LoadImage` 移植）+ fade identity |
| `engine/richtext.ts` | `<color=#xxx>` 富文本 → 逐字符颜色 |
| `engine/textVariables.ts` | `{@xxx}` 文本变量展开；`{@nickname}` 取 `mw.config wgUserName`，兜底"博士" |
| `engine/font.ts` | FontFace API 显式预载思源黑体 Bold；必须在 PIXI 测量前完成（BestFit/长文本偏移依赖真实 metrics） |
| `engine/showitem.ts` | 旧版 showitem 布局换算（960×540 → 1280×720） |
| `engine/rendering/PixiStoryRenderer.ts` | `StoryRenderer` 的 PIXI 实现；逻辑坐标恒 1280×720，分辨率按宿主 CSS×devicePixelRatio |
| `engine/rendering/panels/` | 各命令的 UI 面板：Dialog/Decision/Video/Interlude/CgItem/AvgDisplay/AnimText/SpellSticker/FocusEffect |
| `engine/rendering/core/` | `LayerGraph`（场景层级顺序）、`TweenRunner`、`ShakePath`（镜头抖动）、`SceneGeometry` |
| `engine/log/` | Log All 子系统：`semantics`（与 runtime 共享的 decision/predicate 纯语义）→ `symbolicFlow`（按行分层的符号状态 DAG）→ `condition`（DNF 路径条件）→ `document`（投影成 UI 文档） |
| `components/` | LogAllPanel/LogAllList（文本全览）、AssetListModal + CharacterFacePreview（资源导出/差分预览） |
| `assets.ts` + `assets/ui/` | APK 内置 UI 贴片，随包打包 |

## 关键不变量

- **Native provenance 注释**：每个移植行为都在注释里标明原生日中对应的
  `Torappu.AVG.*` 类/方法。新增/修改命令移植时必须延续这个约定，并说明
  哪些部分是 Web 适配而非原生行为。
- **大小写规则**（每条都有原生依据，别"顺手统一"）：
  - 命令名小写；参数键保留源大小写（`[Name="X"]` 是无说话人对白，不是 header 参数）；
  - character.json 的 map key 折叠成小写，但 `name`/`image`/`face` 保持原样；
  - fade identity（`nativeCharacterFadeIdentity`）不折叠，按 ordinal 比较。
- **semantics.ts 是单一真相**：runtime 的执行闸门和 log 的符号分析调同一组
  函数（`passesGate`/`parseDecision`/`parsePredicateReferences`），不得分叉出第二份实现。
- **Log All 退化契约**：状态数/条件乘积超限时退化为"无条件全量文本"，
  宁可丢分支标注也不能漏行。
- **播放器没有暂停语义**（原生 AVG 全靠点击驱动）：`advance()` 只在
  idle/waiting_input 有效。
- **assets.ts 必须用 `new URL('./x.png', import.meta.url)` 字面量形式**：
  widget 跨源加载，普通 import 在 dev 下按页面源解析会 404；字面量才能被
  Vite 静态分析打包。
- **src/entries/StoryPlayer.ts 开头的原型补丁还原不能删**：同页旧版播放器
  的 krliov.toolbox.js 给原型挂可枚举补丁，会破坏 pixi 的 `for...in` 遍历。
- `createStoryPlayer.ts` 顶部对 `@pixi/sound` 的副作用 import 是有意为之
  （注册 Assets 加载器），不能改成 `import type`。

## 测试与验证

```bash
pnpm test          # 单测（vitest + happy-dom），spec 在仓库根 tests/*.spec.ts
pnpm test:story-log # 全语料 Log All 回归（约 1-2 分钟）
STORY_CORPUS_ROOT=/path/to/story pnpm test:story-log
pnpm lint          # ESLint（flat config：prettier + unicorn + import-x，import 按序排列）
```

- 测试在仓库根 `tests/`，不在本目录。改动哪个模块就跑对应 spec
  （parser/runtime/renderer/audio/context/preload/characterRef/showitem/
  textVariables/logAll/各 panel）。
- `tests/helpers/storyOracle.ts` 是**独立于** `engine/log/symbolicFlow.ts`
  的第二套解释器，全语料对拍用。它必须保持独立实现，不要让它复用引擎代码。
- **改动 `engine/log/` 或 runtime 的 decision/multiline 语义后，本地跑一次
  `pnpm test:story-log`**（语料目录不存在时整组跳过，不进 CI）。
- UI/类型检查：`pnpm build` 跑 `vue-tsc -b`。

## 常见任务

- **移植新命令**：在 `runtime.ts` 的 `builtinCommandNames` 注册，参数在
  `executeBuiltinCommand` 解析成 `types.ts` 里的 `*Input` 接口，渲染落在
  `PixiStoryRenderer` 或新 panel；`preload.ts` 补资源收集；注释标 provenance。
  涉及分支/文本可见性的命令还要同步 `log/semantics.ts`、`log/symbolicFlow.ts`
  和 `tests/helpers/storyOracle.ts` 三处语义。
- **改 Log All 展示**：只动 `log/document.ts` 及 `components/LogAll*.vue`；
  `symbolicFlow` 的 DAG 是语义真相，不要为了展示改它。

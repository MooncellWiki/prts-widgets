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
  └─ index.vue                    # UI 外壳：lobby/text/player 三种 viewMode、全屏 HUD、自动播放
      ├─ fullscreen.ts            # Fullscreen API + 网页全屏兜底（iPhone），触屏锁横屏
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
| `engine/runtime.ts` | 核心状态机：`PlayerState`、命令循环与等待调度（帧/点击/决策）、skipnode/skiptothis、自动播放多档速度；尚未拆成面板的命令（背景、立绘、音频、blocker、video、focusout 等）仍在这里执行 |
| `engine/commandRegistry.ts` / `execution.ts` | 命令名小写化分发与 `CommandWait` 等待类型；`ExecutionHandle` 阻塞语义 + 可注入 `AnimationClock` |
| `engine/ExecutorComponent.ts` | 原生 `ExecutorComponent` 基类：`getExecutors()` 注册命令，面板共用一个 `finishCommand` 完成槽，`onFinish`/`forceCommandEnd` 对应原生同名方法 |
| `engine/panels/` | 命令侧面板（`ExecutorComponent` 子类）：Dialog、Decision、Subtitle、Sticker（含 timer）、SpellSticker、ShowItem、CgItem、DisplayableExecutor（animtext/avgdisplay）；负责参数解析和命令生命周期，画面交给 `StoryRenderer`。`AVGTypeWriterText` 是对话/字幕共用的打字机 |
| `engine/DecisionCommandPredicator.ts` / `eventPool.ts` | decision 闸门共享状态（runtime 分发前读，DecisionPanel 写）；`AVGController.eventPool` 的 ON_CLICK/ON_SPEED_SET |
| `engine/asset.ts` | 资源路由到 `torappu.prts.wiki/assets`（bg/images/characters/video/audio、`$var`/`@path` 音频键） |
| `engine/characterRef.ts` | 角色引用 `$group`/`@alias`/`#index` 解析 + fade identity |
| `engine/font.ts` | FontFace 显式预载客户端字体（对话 NotoSansHans-Medium；animtext、萨米 spellsticker 的字体由 preload.ts 按需加载并计入进度），必须在 PIXI 测量前完成 |
| `engine/rendering/PixiStoryRenderer.ts` | `StoryRenderer` 的 PIXI 实现，逻辑坐标恒 1280×720 |
| `engine/rendering/panels/` | 各命令的 PIXI 视图：Dialog/Decision/Subtitle/Sticker/Timer/SpellSticker/ShowItem 槽位/CgItem/AvgDisplay/AnimText/FocusEffect/Video/Interlude/CharacterCutin |
| `engine/rendering/core/` | `LayerGraph`（层序，含 2791 SceneCanvas 排序值）、`TweenRunner`、`Sequence`（DOTween Sequence 的 insert/append/join）、`TextureAsset`（同步读预加载缓存）、`DotweenEase`、`ShakePath`（镜头、角色与 CG 抖动）、`SceneGeometry`、`ColorEffectMatrix`/`SlideMaskFilter`、`ClickClaim`（点击归属） |
| `engine/log/` | `semantics`（与 runtime 共享的纯语义）→ `symbolicFlow`（符号状态 DAG）→ `condition`（DNF 路径条件）→ `document`（UI 投影） |
| `engine/` 其余 | `richtext`（富文本颜色）、`textVariables`（`{@xxx}` 展开，nickname 取 `wgUserName` 兜底"博士"）、`avgDisplay`（avgdisplay style/slot 枚举归一，runtime 与 preload 共用）、`showitem`（道具原生尺寸 + 内置九宫格相框 `sprite_avg_showItem_photo`，见 assets/ui）、`audio` |
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
  idle/waiting_input 推进；其他阻塞状态下的点击只把自动播放模式重置为手动
  （对齐 OnClickPress，theater 下连这一步也不做）。画布内可交互对象（决策
  选项）认领的点击由 `rendering/core/ClickClaim` 截停，不会冒泡成推进点击。
- **帧顺序**（对齐 2791 的 DOTween Update → 命令协程 → 绘制）：Pixi ticker
  的 update 阶段推进补间与打字机，`afterUpdate` 阶段 runtime 检查
  `WaitForFrame` 并推进命令，然后才绘制；点击、决策选项和视频结束在帧末
  （绘制后）确认，下一帧再推进。面板命令的阻塞补间要用
  `PixiStoryRenderer` 的 `updatePhaseTweenRunner`，否则完成会晚一帧。
  道具、CG、印章和 avgdisplay 执行时经 `TextureAsset.getCachedTexture`
  同步读贴图，资源须由 `preload.ts` 预热；缓存未命中才退回异步加载，首帧会缺图。
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
pnpm lint            # ESLint（prettier + import-x，import 按序）
pnpm build           # 含 vue-tsc 类型检查
```

- 改哪个模块就跑对应 spec；改动 `engine/log/` 或 runtime 的
  decision/multiline 语义后，本地必跑 `pnpm test:story-log`
  （语料目录用 `STORY_CORPUS_ROOT` 指定）。
- `tests/helpers/storyOracle.ts` 是独立于 `engine/log/symbolicFlow.ts` 的
  第二套解释器，全语料对拍用；必须保持独立实现，不要复用引擎代码。
- `runtime.ts` 与 `PixiStoryRenderer` 的用例按命令族分文件，新用例放进对应文件：
  `tests/runtime/` 下 flow / skip / decision / character / background /
  large-background / effects / text / panels / audio，
  `tests/renderer/` 下 character / background / large-background / effects /
  text / panels。
  runtime 的 `FakeRenderer`/`FakeAudio`/`createContext` 在
  `tests/helpers/runtimeFakes.ts`，renderer 跨文件共用的 helper 在
  `tests/helpers/rendererFixtures.ts`。
- `engine/panels/` 的命令面板经 runtime 用例覆盖（`tests/runtime/panels.spec.ts`、
  `text.spec.ts` 等）；`rendering/panels/` 中较复杂的视图在 `tests/` 根目录另有
  独立 spec（如 `cgItemView.spec.ts`、`avgDisplayPanel.spec.ts`）。

## 常见任务

- **移植新命令**：先按原生归属选位置。属于已拆出的面板就加进
  `engine/panels/` 对应类的 `getExecutors()`；新的原生面板继承
  `ExecutorComponent`，在 `runtime.ts` 构造函数里 `register`；其余命令才进
  `runtime.ts` 的 `builtinCommandNames`。面板执行器返回 `"continue"`、
  `{ animation, block }`（阻塞时由 runtime 逐帧检查，动画结束调
  `finishCommand`）、点击或决策等待。之后参数解析成 `types.ts` 的 `*Input` →
  渲染落在 `PixiStoryRenderer` 或 `rendering/panels/` 的视图 →
  `preload.ts` 补资源收集 → 注释标 provenance。涉及分支/文本可见性的命令
  还要同步 `log/semantics.ts`、`log/symbolicFlow.ts`、
  `tests/helpers/storyOracle.ts` 三处语义。
- **改 Log All 展示**：只动 `log/document.ts` 和 `components/LogAll*.vue`；
  `symbolicFlow` 的 DAG 是语义真相，不要为展示改它。

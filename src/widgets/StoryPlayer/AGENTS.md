# StoryPlayer 维护指南

移植或排查剧情命令时，先查 [架构与 Native 对照](ARCHITECTURE.md)。用命令表定位 2791 的执行器、Web 命令模块和 Pixi 视图，再查参数 helper 与帧时序两节确认行为边界。涉及宿主接入时，从架构文档的入口与分层一节定位 Wiki 和独立页。

## 移植命令

1. 按 Native 的 `GetExecutors()` 找命令归属。已有面板在 `engine/panels/` 的 `getExecutors()` 注册，新面板继承 `ExecutorComponent` 并在 `StoryRuntime` 构造函数注册。命令解析、默认值和完成条件放在命令模块，Pixi 容器、资源与动画状态放在视图。游标、等待调度和播放模式由 `StoryRuntime` 管理。
2. 从 [参数 helper](ARCHITECTURE.md#命令参数解析) 选对应的 Native 取值方式，保持参数键大小写、缺失与显式 `null` 的语义。命令名由解析器和注册表折叠为小写。立绘资源查找可以折叠映射键，`nativeCharacterFadeIdentity()` 保留源拼写做 ordinal 比较。
3. 通过 `StoryRenderer` 或 `StoryAudio` 传递解析后的输入。命令执行时同步取贴图的路径要在 [preload.ts](engine/preload.ts) 收集资源。新增文字样式时，在 Pixi 测量前准备字体。按 Native 的完成、强制结束和 reset 行为核对正常播放、跳段和故事结束。
4. 在行为所在处注明对应的 Native 类和方法，记录版本相关取值及 Web 适配。命令归属、层边界或公共参数约定有变化时，更新 [架构文档](ARCHITECTURE.md)。

## 播放与分支约束

- **帧顺序。** 在 Pixi Update 推进补间和打字机，runtime 在 `afterUpdate` 检查等待，再绘制。推进点击、决策选择和视频完成在绘制后的帧末确认，下一帧继续。面板的阻塞补间使用 `updatePhaseTweenRunner`，保留 `ExecutorComponent` 的面板级共享完成槽。 [帧时序与阻塞](ARCHITECTURE.md#帧时序与阻塞)
- **点击归属。** `advance()` 只在 `idle` 或 `waiting_input` 推进。阻塞中的舞台点击在适用时切回手动，剧场忽略舞台点击，决策选项通过 `ClickClaim` 消费点击。 [运行时](engine/runtime.ts) · [点击归属](engine/rendering/core/ClickClaim.ts)
- **分支和文本。** runtime 与 Log All 共用 `log/semantics.ts` 的谓词及决策解析。超出状态或条件上限时，Log All 退化为完整文本，允许省略分支标记。展示改动从 `log/document.ts` 和 `components/LogAll*.vue` 入手。 [共享语义](engine/log/semantics.ts) · [符号分析](engine/log/symbolicFlow.ts)
- **当前显示行。** Log All 高亮和调试跳行订阅 `onDisplayedLineChange()`，它能逐行收到快速播放中的变化。Vue 每 80 ms 同步其他状态，选择历史比较内容后复用数组引用。 [Vue 外壳](index.vue) · [调试壳](components/StoryPlayerDebugShell.vue)

## 宿主与资源

- Wiki 和独立页共用 `index.vue`。宿主取数、主题和独立页设计 CSS 留在各自的入口或页面壳。验证入口或样式改动时检查两种入口，独立页开发步骤见 [贡献指南](../../../CONTRIBUTING.md#独立页开发)。
- Widget 由 Wiki 跨源加载。内置贴图使用字面量 `new URL("…", import.meta.url)` 交给 Vite 打包。保留 Wiki 入口的原型属性去枚举处理，避免同页旧版播放器的原型补丁被 Pixi 迭代。保留播放器工厂的 `@pixi/sound` 运行时 import，以注册 Pixi Assets 的音频加载器。 [内置贴图](assets.ts) · [Wiki 入口](../../entries/widgets/StoryPlayer.ts) · [播放器工厂](engine/createStoryPlayer.ts)

## 本地调试

运行 `vp env exec pnpm dev`，按终端端口打开 [独立页入口](../../../pages/StoryPlayer.html)。

```text
/pages/StoryPlayer.html?path=obt/main/level_main_00-01_beg.txt
/pages/StoryPlayer.html?debug&path=obt/main/level_main_00-01_beg.txt&line=9
```

- `path` 可用相对 `gamedata/latest/story` 的路径或完整 HTTP(S) 地址，`url` 参数优先且要求完整地址。 [取数](../../pages/story.ts)
- `debug` 在 dev 中启用调试工具栏。`line` 填 1-based 原始脚本行号，multiline 填段末行。 `window.__storySeekPlan` 记录最近一次跳行的选项计划。 [调试壳](components/StoryPlayerDebugShell.vue)
- `window.__storyRec` 提供 `start()`、`stop()`、`clear()`、`status()`、`collect(stride)` 和 `snapshot(quality)`。闲置画布录制可能为空，核对终态用 `snapshot()` 或页面截图。 [抓帧接口](components/storyRecorder.ts)

## 验证

- 按命令族运行 [runtime](../../../tests/story-player/runtime) 和 [renderer](../../../tests/story-player/renderer) 下对应的 spec，或用 `vp env exec pnpm test tests/story-player` 跑 StoryPlayer 单测。共用的 fake renderer、audio、播放帧和 Pixi fixture 在 [helpers](../../../tests/story-player/helpers)。
- 修改 `engine/log/` 或 runtime 的 decision / multiline 语义时，运行 `vp env exec pnpm test:story-log`。用 `STORY_CORPUS_ROOT` 指向非默认语料目录，确认语料用例实际执行。保持 [storyOracle.ts](../../../tests/story-player/helpers/storyOracle.ts) 独立于引擎，作为全语料对拍的解释器。 [全语料测试](../../../tests/story-player/story-log-corpus.spec.ts)

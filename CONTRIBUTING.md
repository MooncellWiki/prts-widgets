# 贡献指南

## 前置条件

- 有编辑 Widget 的权限（如果你希望加新的 Widget）

## 项目配置

1. fork 这个仓库，clone 到本地，并从 main 创建一个新的分支

   ```bash
   git checkout -b <WidgetName>
   ```

2. 安装项目依赖

   项目使用 [pnpm](https://pnpm.io/) 管理项目依赖，请使用 [pnpm](https://pnpm.io/) 安装本项目。

   ```bash
   pnpm install
   ```

3. 创建新应用

   ```bash
   pnpm run create <WidgetName> <username> <password>
   ```

> [!IMPORTANT]  
> 不要忘记更新 [README.md](README.md) 中的子应用列表

## 在 Wiki 页面里调试

运行 `pnpm dev`，打开 `https://prts.wiki/w/Widget:<WidgetName>/dev`。

`/dev` 页面按当前页面 URL 的 `vitePort` 参数连接本地 Vite，如 `?vitePort=8082`（已有查询参数时
用 `&vitePort=8082`），不带参数时连 `http://localhost:8080`。8080 被占用时 Vite 会自动换端口，
终端会列出带上实际端口的全部调试链接；同时开多个实例时各自用各自的链接即可。
加载失败的原因见控制台。

`/dev` 页面里加载 Vite 的片段由 `scripts/dev/widget.ts` 生成，新建应用时自动带上。
改了片段，或者还有页面写死端口时，运行：

```bash
pnpm dev:sync --dry-run              # 只列出会改哪些页面
pnpm dev:sync <username> <password>
```

它只替换页面里加载 Vite 的 `<script>`，根节点和 noinclude 里的测试数据不动；认不出的页面会跳过并列出来。

## 测试

```bash
pnpm test        # 单元测试，CI 也跑这一条
pnpm lint        # ESLint
```

### 剧情日志全语料回归（可选）

`tests/story-log-corpus.spec.ts` 会把全部剧情脚本跑一遍 Log All 分析，并与
`tests/helpers/storyOracle.ts` 里的独立解释器逐条选择路径对拍。它依赖游戏
文本语料，默认在仓库同级目录找：

```
../torappu/storage/asset/gamedata/latest/story
```

语料放在别处时用环境变量指定，跑起来约一分钟：

```bash
STORY_CORPUS_ROOT=/path/to/story pnpm test:story-log
```

语料目录不存在时该测试整组跳过，所以它不进 CI，改动
`src/widgets/StoryPlayer/engine/log/` 时请在本地跑一次。

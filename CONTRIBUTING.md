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

运行 `pnpm dev`，终端会按 `templates/*.html` 列出所有 Widget 的完整 Wiki 调试链接，
点击对应链接即可。端口被占用时 Vite 仍会自动选择下一个可用端口，所有链接使用实际监听端口。

新建应用的 `/dev` 页面会自动带上开发加载器。
加载器只读取当前页面 URL 的 `vitePort` 参数，如 `?vitePort=8082`；已有查询参数时
用 `&vitePort=8082`。没有参数时默认连接 `http://localhost:8080`。
不同调试页可以通过各自的 URL 连接不同本地实例。加载失败会在页面显示提示，详细错误见控制台。

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

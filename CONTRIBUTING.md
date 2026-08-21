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

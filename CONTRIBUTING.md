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

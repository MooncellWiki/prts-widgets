# 时装回廊迁移待办

对照 PRTS 话题 [话题:Zpdhjyv84k49sn56](https://prts.wiki/w/%E8%AF%9D%E9%A2%98:Zpdhjyv84k49sn56)（"目前为止时装回廊珊瑚海岸宣传图11仍未添加"）整理的现状与方案。

## 一、背景

用户反馈 `时装回廊/珊瑚海岸` 宣传图第 11 张不显示。查证后确认这不是单页内容缺失，而是
`微件:SkinGallery/Slider` 的固定槽位上限，**所有宣传图超过 11 张的系列页都在丢图**。

同时评估了把整个时装回廊迁到本仓库（prts-widgets）的可行性，结论是可行，分四步走，
第 1 步与迁移无关，可以立刻上线。

## 二、现状

### 2.1 渲染链路

```
时装回廊（首页）
  模板:时装回廊            ← 533 条 {{时装回廊/半身像}}，按 ===Y-x===' 分 188 期
  微件:Garansandbox/brandbtn ← 25 个品牌按钮，硬编码，2022 年至今未改
  微件:SkinGallery         ← 半身像卡片，全局只输出一次 <style> + 一次脚本
模板:时装回廊/半身像        ← 每张卡片，拼 filepath + #switch 品牌名/logo名
时装回廊/<系列>（25 个）
  模板:时装回廊/轮播        ← 传 default + 图1..图20 + imgdis_1..20
  微件:SkinGallery/Slider   ← 宣传图轮播，**只写了 11 个 slide**
  模板:干员时装            ← 每个时装下方的运营数据表格（价格 / 限时 / 复刻 / 回顾）
```

### 2.2 丢图的根因

`模板:时装回廊/轮播` 传给 `微件:SkinGallery/Slider` 的参数是 `图1`…`图20`，
但 Widget 里 `swiper-slide` 的 div 是逐个手写的，只有 `default` + `图1`…`图10` 共 11 个。
参数进了 Widget 的作用域，没有被任何节点消费，于是静默消失。

各系列实测（`action=parse` 出的 HTML 里数 `swiper-slide`）：

| 系列页   | 传入         | 实际渲染                  | 丢失          |
| -------- | ------------ | ------------------------- | ------------- |
| 珊瑚海岸 | `图1`–`图11` | 11                        | `图11`        |
| 时代     | `图1`–`图14` | 11                        | `图11`–`图14` |
| 斗争血脉 | `图1`–`图8`  | 11（3 个 `display:none`） | 无            |

`文件:宣传图 珊瑚海岸11.png` 本身完好（874×510，media 可访问），页面源码里
`|图11={{filepath:宣传图_珊瑚海岸11.png|nowiki}}` 也写了。纯粹是槽位不够。

`斗争血脉` 里那两个 `display:none` 的隐藏 slide 佐证了设计意图：**固定槽位 + 空槽隐藏**，
槽位总数才是硬上限。

另有一处内容侧问题：`时代` 页的 `图10` 指向 `宣传图_时代11.png`，而
`文件:宣传图 时代10.png` 本就不存在（11–16 都有）。扩槽后 `图11`–`图14` 会显示出来，
但编号错位是否要顺带理顺，需要和内容维护者确认。

### 2.3 与游戏数据的比对

用 `../torappu/storage/asset/gamedata/latest/excel/skin_table.json`（2442 条 `charSkins`，
其中 531 条有 `displaySkin.skinName`）和 wiki 现状逐项对过：

| 维度       | wiki 现状                             | gamedata                                               | 结论                                                           |
| ---------- | ------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------- |
| 半身像卡片 | 533 条                                | 531 条                                                 | gamedata 缺 2 条新时装（暗能质子、绿影之下），wiki 无多余项    |
| 品牌       | 25 个（brandbtn 硬编码）              | `brandList` 25 个                                      | 一一对应                                                       |
| 品牌名     | `0011-飙系列` / `0011-韵系列`         | `0011/飙系列` / `0011/韵系列`                          | 2 处写法不同；`巫异盛宴 ` 尾部有空格                           |
| 宣传图编号 | 各页 `图N` 手工维护                   | `kvImgIdList` 按品牌列出                               | 数量完全一致（珊瑚海岸 11、时代 14、斗争血脉 8、0011™制造 7…） |
| 时装注释   | 8 种                                  | `displayTagId` 8 种                                    | 集合完全相同                                                   |
| 半身像图片 | `文件:半身像 {中文名} skin{N}.png`    | `portraitId` → `assets/char_portrait/{portraitId}.png` | 531 条全部可取，含 `#` 需 urlencode                            |
| 系列页锚点 | 472 条按时装名自动、61 条显式 `锚点=` | 无对应概念                                             | 抽样核对，自动锚点与系列页 `==时装名==` 标题 100% 一致         |

gamedata 里取不到的：价格、限时 / 复刻 / 回顾时间（`模板:干员时装` 的运营数据），
以及首页 `===Y-x===' 的 188 个期号分组（`sortId`/`getTime` 能近似推导但与现网划分未必一致）。

## 三、方案

### 第 1 步：修 Slider 槽位（wiki 侧，独立于迁移）

改 `微件:SkinGallery/Slider`：slide 块从 11 个扩到 21 个（`default` + `1`–`20`），
保持现有倒序（10 → 9 → … → 1 → default），新增的 11–20 插在 10 前面。
`imgdis_11`–`imgdis_20` 在 `轮播` 模板里已生成，直接引用即可。

```html
<div class="swiper-slide" style="<!--{$imgdis_20|regex_replace:"/(script|<script)/":""}-->"><img src="<!--{$sliderimg_20|regex_replace:"/(script|<script)/":""}-->" width="100%" height="100%"></div>
<!-- … 19、18 … 11 … -->
<div class="swiper-slide" style="<!--{$imgdis_10|...}-->">…</div>
```

只改 Widget 一处，25 个系列页不用动。

- [x] 提交 `微件:SkinGallery/Slider` 编辑（2026-11-16，rev 450690）
- [x] 用 `action=parse` 复核珊瑚海岸（12 个可见 slide）、时代（15 个）都不再截断；全部槽位为 21 个，斗争血脉仍为 9 个可见 slide
- [ ] 回帖说明"kv10 张 + 品牌图 1 张就不显示"的原因与修复
- [ ] 确认 `时代` 页 `图10` 编号错位是否一并理顺

### 第 2 步：迁轮播（消灭整类 bug）

新建 `src/widgets/SkinGallery`，轮播部分改为读取 `skin_table.brandList[brand].kvImgIdList`，
按 `linkedSkinGroupId` 关联到具体批次。宣传图不再人工维护 `图N=` 列表，也就不存在
"参数漏传 / 槽位不够"。

前置依赖：**宣传图本体**。bundle 里有 `spritepack/ui_kv_img_0..9.ab` 与 `ui/kvimg/pic_hub.ab`，
但 torappu 目前没有导出任务（`MixStory` 的 `kv` 子目录是剧情 KV，不是品牌 KV）。
需要照 `torappu/core/tasks/char_portrait.py` 新增一个 task，sprite 名即 `kvImgId`，
产出 `torappu.prts.wiki/assets/skin_kv/{kvImgId}.png`。品牌 logo 同理
（`spritepack/ui_brand_image_hub_0.ab` ↔ `Skin brand {系列}.png`）。

- [x] torappu 侧新增 KV 图导出 task（`SkinKV` / `skin_kv.py`，已用真实 bundle 导出验证）
- [x] 品牌 logo 继续用 media 的 `Skin brand *.png`
- [x] `SkinGallery` 组件：轮播 + 品牌信息（`brandCapitalName`、`description`）
- [x] `templates/SkinGalleryV2.html` + `src/entries/widgets/SkinGallery.ts`（新 Widget 必须使用 V2 名称，避免覆盖现有逐卡片 Widget）
- [ ] 用户反馈的两个系列页改为挂新 Widget

### 第 3 步：迁半身像墙与首页

卡片数据一部分来自 `skin_table`，一部分需要兼容 wiki 现有结构：

- 卡片：`skinName` / `skinGroupId` / `displayTagId`，图片走 `portraitId`（
  `src/utils/charImage.ts` 的 `halfPortrait()` 目前只拼 `_1`，需要扩成按 `portraitId` 取）；
  `#` 要 urlencode
- 链接与锚点：仍生成 `时装回廊/{系列}#{锚点}`。472 条自动锚点即时装名，
  61 条显式 `锚点=` 需保留（值形如 `悠然假日_HD91`），迁移时可临时解析 `模板:时装回廊` 源码取锚点表
- 首页品牌切换与 `===Y-x===' 期号分组：先解析 `模板:时装回廊`源码的分段结构，后续再考虑按`skinGroupSortIndex` 自动分组
- 品牌名映射：`0011/飙系列` → `0011-飙系列`、`0011/韵系列` → `0011-韵系列`、
  `巫异盛宴 ` 需 trim。52 条联动时装（彩虹六号、三丽鸥、怪物猎人等）在 `brandList` 里
  没有独立品牌，wiki 上一律归到 `合作款`

- [x] `SkinGallery` 卡片网格组件（半身像 + 品牌 logo + 注释角标 + 外文名）
- [x] 首页品牌切换（按钮筛选，数据来自 `brandList`）
- [x] 期号分组数据源（保留 `模板:时装回廊` 原始源码，不替换模板本身）
- [x] 锚点兼容层（同名按干员匹配，兼容升变阿米娅职业后缀）
- [ ] 首页正式切换到 `SkinGalleryV2`（等待发布）

### 第 4 步：保留部分

`模板:干员时装` 的运营表格（价格、限时 / 复刻 / 回顾时间、画师、`content` / `dialog`）不在
gamedata 里，继续留在 wiki 侧手工维护。Widget 只负责轮播和卡片网格。

## 四、风险与注意

- 改 `微件:SkinGallery/Slider` 是线上可见的写操作，且该 Widget 被全部 25 个系列页共用，
  需要保证倒序与 `display:none` 行为不变。
- `微件:SkinGallery` 的 `<style>` 用 `skinGalleryCount` 变量保证每页只输出一次（`<2` 判断），
  重写时若在客户端渲染，这段全局脚本（鼠标倾斜、放大动画）需要一并迁进 Vue 组件。
- `微件:Garansandbox/brandbtn` 自 2022-03 未更新，仍在提供首页品牌切换；迁移期间两套并存时
  注意 DOM 类名冲突（`.contentcontainer` / `.halfimgcontainer` / `.brandbtncontainer`）。
- 半身像图片文件名含 `#`，URL 必须 urlencode，否则浏览器会当成 fragment 截断。

## 五、实现与发布记录（2026-11-16）

### 已上线

- [Slider 修复差异](https://prts.wiki/index.php?diff=450690&oldid=356208)：只新增 `20 → 11` 十个槽，原有 CSS、脚本、`10 → default` 和空槽隐藏保持不变。已刷新轮播模板及全部 25 个品牌系列页的解析缓存。
- [新版开发微件](https://prts.wiki/w/Widget:SkinGalleryV2/dev)：rev 450694。使用本地 Vite 的 `SkinGallery.ts` 入口；通过 `?vitePort=实际端口` 调试。正式 `Widget:SkinGalleryV2` 尚待 CI 发布，KV 图片也尚待发布。
- 珊瑚海岸首图为 `宣传图_珊瑚海岸11.png`；时代首图为 `宣传图_时代15.png`；斗争血脉首图保持 `宣传图_斗争血脉8.png`。

### 兼容方式

组件位于 `src/widgets/SkinGallery/`，挂载类为 `.prts-skin-gallery-v2`，各轮播实例独立。
不覆盖旧的 `Widget:SkinGallery` 或 `模板:时装回廊/半身像`，系列页的现有卡片和运营表格可以继续工作。

首页迁移只将主页面中的 `{{时装回廊}}` 换为 `{{#Widget:SkinGalleryV2}}`。
`模板:时装回廊` 继续提供期号、干员 wiki 名称、时装序号、外文名与显式锚点，也保留 SkinShop 的数据来源。
游戏数据先更新时，新时装放入“待编入期号”；wiki 先更新时，保留其卡片并使用 wiki 图片。
匹配图片失败后退回该时装的 wiki 文件；没有 wiki 时装序号时不退回默认服装。

轮播直接按 `kvImgIdList` 顺序渲染，末尾附加 `default_kv_{brandId}`；没有固定数量上限。
通过 `linkedSkinGroupId` 关联对应批次的时装链接。品牌名和描述以文本渲染，不注入 HTML。
品牌默认图名保留大小写，特别是 `default_kv_ambienceSynesthesia.png`，不能对 `brandId` 统一转小写。

### 发布顺序与命令

1. 发布 torappu 的 `SkinKV` 任务，首次对当前版本运行完整补导出，不传 previous-version 参数：

   ```bash
   uv run torappu run CLIENT_VERSION RES_VERSION -i SkinKV
   ```

   将 `storage/asset/raw/skin_kv/` 按现有资源发布流程发布为
   `https://torappu.prts.wiki/assets/skin_kv/`。任务本身不上传资源。

2. 合并 prts-widgets PR，由现有 CI 构建、上传 OSS 并更新 `Widget:SkinGalleryV2`。
   不手工运行全量 `upload/update`，避免把其他未发布组件一起上线。

3. 预览并应用两个反馈系列页的轮播替换，再应用首页切换：

   ```bash
   pnpm exec tsx scripts/skin-gallery/index.ts series
   pnpm exec tsx scripts/skin-gallery/index.ts home
   pnpm exec tsx scripts/skin-gallery/index.ts series --apply --credentials /path/to/.env
   pnpm exec tsx scripts/skin-gallery/index.ts home --apply --credentials /path/to/.env
   ```

   凭证文件使用 `WIKI_USERNAME` / `WIKI_PASSWORD`。也可直接通过环境变量提供。
   不加 `--apply` 时只读取页面并写本地预览。脚本保存 `.cache/skin-gallery/` 下的
   `before.wiki`、`after.wiki` 和修订结果；编辑带 `baserevid` 冲突检查，并读回验证。
   正式切换前检查 Widget 的 JS/CSS/预加载资源及所需全部 KV 图片是否可访问。
   系列页只替换完整的轮播模板调用，运营表格和标题原样保留。

临时补丁及其线上验证可重复执行：

```bash
pnpm exec tsx scripts/skin-gallery/index.ts slider
pnpm exec tsx scripts/skin-gallery/index.ts slider --apply --credentials /path/to/.env
pnpm exec tsx scripts/skin-gallery/verify-slider.ts
```

开发微件的创建/同步：

```bash
pnpm exec tsx scripts/skin-gallery/index.ts dev --apply --credentials /path/to/.env
```

回滚系列页和首页时，基于最新修订审查后恢复保存的 `before.wiki`，不要覆盖期间新增内容。
旧 Widget 和模板均保留，回滚不依赖旧 JS 构建。临时扩槽修复可独立保留。

### 验证结果

- 本地资源版本 `26-10-29-15-36-11-33649006` 实际导出 103 张 KV/default 图片；覆盖 `skin_table` 引用的全部 101 张，大小写完全匹配。
- `模板:时装回廊` rev 450620：533 张卡片、188 个期号；531 张匹配游戏图片，暗能质子和绿影之下使用 wiki 图片；没有重复添加升变阿米娅。
- 浏览器验证全部品牌、珊瑚海岸 12 图 / 62 张卡片、时代 15 图 / 109 张卡片，以及窄屏、暗色、无横向溢出。
- prts-widgets 完整测试 基于最新 main 的 PR 工作树中，71 个文件 / 1256 条测试通过，lint 与生产构建通过；新增测试覆盖超 20 图、首尾循环、多实例、显式锚点、同名时装、`#` 编码、扩槽幂等及运营表格保留。
- torappu 8 条 unittest 通过；新增测试覆盖透明度、大小写、仅导出目标 Sprite、空导出报错、增量包依赖及无关变更跳过。

### 内容侧待办

`时代` 的旧图片编号仍未修改；迁移会按游戏 `kvImgId` 取图，不推断旧 wiki 文件编号。
讨论帖尚未回帖，可使用以下说明：

> 已修复。旧轮播微件只有品牌图加 10 张宣传图的固定槽位，第 11 张及以后的参数虽然传入，但没有对应节点，所以不会显示。现已扩到品牌图加 20 张宣传图，并复核珊瑚海岸 12 张、时代 15 张均可显示。后续新版将直接按游戏品牌宣传图列表渲染，消除固定槽位上限。

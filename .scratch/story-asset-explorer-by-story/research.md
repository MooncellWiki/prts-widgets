# 剧情目录与剧本索引的覆盖

2026-11-14 核对 PRTS「剧情导航」修订 445770、当时的 Cargo 与 torappu 使用记录，以及本地简中服快照 `26-10-22-14-02-11-51447808`。本地快照用于比较游戏表字段，现网资源命中另行反查。 [剧情导航修订](https://prts.wiki/index.php?oldid=445770) · [剧情一览](https://prts.wiki/w/%E5%89%A7%E6%83%85%E4%B8%80%E8%A7%88) · [游戏数据入口](https://torappu.prts.wiki/gamedata/latest/)

## 关联键与排序

| 来源 | 可直接取得的信息 | 样本中的边界 |
| --- | --- | --- |
| PRTS「剧情导航」 | 分类、组名、剧情链接标题、显示文字和人工排列顺序。MediaWiki 可按标题读取页面 ID、修订和模板参数。 | 模板没有关卡 ID。页面 ID 可用于定位单个 Wiki 页面，活动和聚合后的关卡没有对应的通用页面 ID。 |
| Cargo `story` | 系统字段 `_pageName` 可匹配剧情链接，`textPath` 可匹配剧本索引。另有 `storyType`、`storyGroup`。 | 没有关卡 ID 或目录排序字段。同一组可能同时有「支线」和「剧情」条目，特殊分组下多个活动也可能都标为「剧情」。 |
| `story_review_table.json` | 剧情回顾分组 `id`、`name`、`entryType`，以及条目 `storyId`、`storySort`、`storyCode`、`storyName`、`storyTxt`。 | 排序属于游戏内回顾。抽查的四月辑录、集成战略和生息演算条目均存在未收进回顾的样本。 |
| `story_table.json` 与 `stage_table.json` | 用 `storyTxt` 或 Cargo `textPath` 查询 `story_table`。`BEFORE_BATTLE`、`AFTER_BATTLE` 的 `trigger.key` 可直接匹配存在的 `stageId`，取得关卡编号与名字。 | 除关卡触发外还有 `GAME_START`、`ACTIVITY_ANNOUNCE` 等。部分关卡触发键在 `stages` 下没有条目。 |
| torappu 剧本资源索引 | `script_path` 是 `story/` 下去掉 `.txt` 的路径。数据库按 `script_path` 建索引，用 `(script_path, resource_type, resource_id)` 去重。 | 使用表只保存解析成功的资源引用。某剧本的资源使用行为空时，需要结合源文件检查才能判断原因。 |

PRTS 来源可通过 [Cargo story 表](https://prts.wiki/w/Special:CargoTables/story) 和 [剧情导航源码](https://prts.wiki/index.php?title=%E6%A8%A1%E6%9D%BF%3A%E5%89%A7%E6%83%85%E5%AF%BC%E8%88%AA&action=raw) 复查。资源索引的路径和取数规则见 [剧情资源导入](https://github.com/MooncellWiki/ak-asset-storage/blob/4da043e6c6d450a5492394171fd6f66e2d084a54/src/service/story_usage.rs#L82-L192) 与 [数据库迁移](https://github.com/MooncellWiki/ak-asset-storage/blob/4da043e6c6d450a5492394171fd6f66e2d084a54/migrations/20260817100000_add_story_resource_usages.up.sql#L8-L34)。

## 五类样本

- **主线「黑暗时代·上」**。Cargo 给「0-1 坍塌」行动前后两个剧本的路径 `obt/main/level_main_00-01_beg`、`obt/main/level_main_00-01_end`，游戏表都指向 `main_00-01`。「序章·上」用 `obt/guide/beg/0_welcome_to_guide`，触发类型是 `GAME_START`。主线编号 `0-1` 还给了突袭记录 `main_00-01#f#`。 [0-1 行动前](https://prts.wiki/w/0-1_%E5%9D%8D%E5%A1%8C/BEG) · [序章·上](https://prts.wiki/w/W2G/BEG)
- **支线「愚人号」**。SN-1 行动前后都指向 `act17side_01`。SN-ST-1 的 `requiredStages` 也是 `act17side_01`，自身触发键却是 `act17side_st01`，本地关卡表没有该键。按解锁条件聚合会把两条独立剧情混在一起。跨活动也会重复关卡编号，`SV-1` 同时用于「闯入者」`act18d3_01` 和「四面埋伏」`act10d5_01`。 [SN-1 行动前](https://prts.wiki/w/SN-1_%E4%B8%AD%E5%BF%83%E5%B9%BF%E5%9C%BA/BEG) · [SN-ST-1](https://prts.wiki/w/SN-ST-1_%E5%8F%A4%E4%BA%95/NBT)
- **四月辑录「断罪者的挑战状」和「泰拉 说唱之夜！」**。`APF-2020/NBT` 对应 `activities/act8d2/level_act8d2_entry`，触发类型为 `ACTIVITY_ANNOUNCE`。 `LTTB Extraordinary rap battle!/END` 对应 `activities/act17d7/level_act17d7_01_end`，触发键是登记在关卡表中的 `act17d7_01`。两者均无对应的剧情回顾条目。 [艺术之神](https://prts.wiki/w/APF-2020/NBT) · [艺术之神资源用例](https://torappu.prts.wiki/api/v1/story-resource-usages?type=background&id=bg_rhodescom&limit=200)
- **集成战略「傀影与猩红孤钻」**。Wiki 把序章和结局列在同一组，Cargo 分别标成「支线」与「剧情」。`obt/roguelike/ro1/level_rogue1_entry` 和 `obt/roguelike/ro1/level_rogue1_ending_1` 源文件都在，样本未出现在本地 `story_review_table` 和 `story_table`。现网通过背景 `24_rl_castlehall` 可反查到结局。 [序章](https://prts.wiki/w/RO1-BEG/NBT) · [舞会终场](https://prts.wiki/w/RO1-END-1/NBT) · [结局资源用例](https://torappu.prts.wiki/api/v1/story-resource-usages?type=background&id=24_rl_castlehall&limit=200)
- **生息演算「沙洲遗闻」与「沙中之火」**。沙洲遗闻的开篇和结局分别用 `obt/sandboxperm/sandbox_1/sandbox_1_entry`、`obt/sandboxperm/sandbox_1/sandbox_1_ending_1`，均有源文件，两张游戏剧情表均未收录样本。现网可从背景 `bg_desert_1` 反查到开篇。沙中之火开场和结局 1 有 Wiki 页面和 Cargo 路径，但其 `activities/act1sandbox/` 下两个原路径在本地快照中不存在，现网 `gamedata/latest` 也返回 404。 [初来乍到](https://prts.wiki/w/RA1/ENTRY) · [开篇资源用例](https://torappu.prts.wiki/api/v1/story-resource-usages?type=background&id=bg_desert_1&limit=200) · [沙中之火](https://prts.wiki/w/RA/ENTRY) · [开场剧本路径](https://torappu.prts.wiki/gamedata/latest/story/activities/act1sandbox/level_act1sandbox_entry.txt)

## 已确认的缺口

- 从修订 445770 的模板源码提取含 `/` 的唯一站内链接标题，得到 1,756 个候选标题。按以空格替代下划线的标题比对 Cargo 当时的 2,143 行，有 7 个标题没有逐字匹配。其中「SN-ST-5 登陆点」的 Wiki 正文仍有 `文本路径=activities/act17side/level_act17side_st05`，现网资源用例也返回同一路径。另一个例子 `CR-BEG/NBT` 的正文给出 `activities/act1lock/level_act1lock_entry`，现网有该文件。 [SN-ST-5](https://prts.wiki/w/SN-ST-5_%E7%99%BB%E9%99%86%E7%82%B9/NBT) · [SN-ST-5 资源用例](https://torappu.prts.wiki/api/v1/story-resource-usages?type=background&id=27_g16_lighthouse_street&limit=200) · [荷谟伊智境开篇](https://prts.wiki/w/CR-BEG/NBT)
- 可核对的状态有目录条目未关联到路径、路径已知但源文件暂不可用、以及源文件存在但使用表没有资源行。最后一种还需检查导入快照和提取规则。导入器只处理就绪快照，跳过 `[uc]info/`，无法解析到角色资源身份的引用也会跳过。查询前端现有分页只能覆盖全站列表的一页，而且后端从全站汇总目录起步。按剧情查询需要在计数、排序和分页前限定剧本集合。 [资源导入规则](https://github.com/MooncellWiki/ak-asset-storage/blob/4da043e6c6d450a5492394171fd6f66e2d084a54/src/service/story_usage.rs#L82-L192) · [现有聚合查询](https://github.com/MooncellWiki/ak-asset-storage/blob/4da043e6c6d450a5492394171fd6f66e2d084a54/src/database/story_explorer.rs#L18-L101)

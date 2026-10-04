import { createApp, nextTick } from "vue";

import { afterEach, describe, expect, it, vi } from "vitest";

import { convertAbility } from "@/widgets/EnemiesListV2/ability";
import {
  GRADES,
  gradeRange,
  STAT_COLS,
  View,
} from "@/widgets/EnemiesListV2/consts";
import { toEnemy, type EnemyData } from "@/widgets/EnemiesListV2/enemy";
import {
  createFilters,
  emptyOptions,
  failedFilters,
  matchFilter,
  matchText,
} from "@/widgets/EnemiesListV2/filter";
import { buildHash, readHash } from "@/widgets/EnemiesListV2/hash";
import EnemiesListV2 from "@/widgets/EnemiesListV2/index.vue";
import { sortEnemies } from "@/widgets/EnemiesListV2/sort";

// 字段与写法取自现网「敌人一览/数据」，只留用得到的几条
const data = (over: Partial<EnemyData>): EnemyData => ({
  enemyIndex: "B1",
  sortId: 1,
  name: "源石虫",
  enemyLink: "源石虫",
  enemyRace: "感染生物",
  enemyLevel: "普通",
  attackType: "近战",
  damageType: "物理",
  motion: "地面",
  endure: "E",
  attack: "E",
  defence: "E",
  moveSpeed: "A",
  attackSpeed: "B+",
  resistance: "E",
  enemyRes: "E",
  enemyDamageRes: "E",
  ability: "",
  ...over,
});

const SOURCE: EnemyData[] = [
  data({}),
  data({
    enemyIndex: "A1",
    sortId: 14,
    name: "术师",
    enemyLink: "术师",
    enemyRace: "其他",
    attackType: "远程",
    damageType: "法术",
    endure: "D",
    attack: "C",
    resistance: "B+",
    ability: "·攻击造成法术伤害",
  }),
  data({
    enemyIndex: "D1",
    sortId: 40,
    name: "妖怪",
    enemyLink: "妖怪",
    enemyRace: "无人机",
    enemyLevel: "精英",
    attackType: "不攻击",
    damageType: "无",
    motion: "飞行",
    endure: "C",
    ability:
      '·为周围的敌人提供<span class="mc-tooltips"><span>隐匿</span><span>不会被远程攻击选为目标<br>可被阻挡</span></span>',
  }),
  data({
    enemyIndex: "W",
    sortId: 120,
    name: "W",
    enemyLink: "W(敌方)",
    enemyRace: "萨卡兹",
    enemyLevel: "领袖",
    attackType: "近战 远程",
    damageType: "物理 法术",
    endure: "A+",
    attack: "A",
    ability:
      '<span style="color:#FF4F0B">第一形态</span><br>·对<PRTS>与<斗士塔露拉>放置<span style="color:#00FFFF;">炸弹</span><br>※被沉默时不再放置',
  }),
  data({
    enemyIndex: "U15",
    sortId: 226,
    name: "“皇帝的利刃”",
    enemyLink: "“皇帝的利刃”",
    enemyRace: "其他",
    enemyLevel: "领袖",
    endure: "?",
    attack: "?",
    ability: "·无法被攻击",
  }),
];
const ENEMIES = SOURCE.map(toEnemy);
const by = (name: string) => ENEMIES.find((e) => e.name === name)!;
const names = (list: readonly { name: string }[]) => list.map((e) => e.name);

describe("toEnemy", () => {
  it("拆开攻击方式 / 伤害类型，地位换成色条用的级别，链接指向敌人页", () => {
    const w = by("W");
    expect(w.attackType).toEqual(["近战", "远程"]);
    expect(w.damageType).toEqual(["物理", "法术"]);
    expect(w.rank).toBe("boss");
    expect(w.href).toBe(`/w/${encodeURIComponent("W(敌方)")}`);
    expect(by("源石虫").rank).toBe("normal");
    expect(by("妖怪").rank).toBe("elite");
  });
});

describe("convertAbility", () => {
  it("一行一条，行首的 · / ※ 单独包起来；尖括号里的名字照原样留着", () => {
    const { html, plain } = convertAbility(SOURCE[3].ability);
    const el = document.createElement("div");
    el.innerHTML = html;
    expect(el.children).toHaveLength(3);
    expect(el.children[0].className).toBe("el-ab__title");
    expect(el.children[0].textContent).toBe("第一形态");
    expect(el.children[1].className).toBe("el-ab__line");
    expect(el.children[1].querySelector("i")?.textContent).toBe("·");
    expect(el.children[1].textContent).toBe("·对<PRTS>与<斗士塔露拉>放置炸弹");
    expect(el.children[1].querySelector(".ak-rt-kw")?.textContent).toBe("炸弹");
    expect(el.children[2].querySelector("i")?.textContent).toBe("※");
    expect(plain).toBe(
      "第一形态\n·对<PRTS>与<斗士塔露拉>放置炸弹\n※被沉默时不再放置",
    );
  });

  it("术语换成 .ak-term，提示正文进 data-tip、不进搜索用的纯文字", () => {
    const { html, plain } = convertAbility(SOURCE[2].ability);
    const el = document.createElement("div");
    el.innerHTML = html;
    const term = el.querySelector<HTMLElement>(".ak-term")!;
    expect(term.textContent).toBe("隐匿");
    expect(term.dataset.tip).toBe("不会被远程攻击选为目标\n可被阻挡");
    expect(term.tabIndex).toBe(0);
    expect(plain).toBe("·为周围的敌人提供隐匿");
  });

  it("数据里混进别的标签也只当文字输出", () => {
    const { html } = convertAbility('·<img src=x onerror="alert(1)">&amp;');
    const el = document.createElement("div");
    el.innerHTML = html;
    expect(el.querySelector("img")).toBeNull();
    expect(el.textContent).toBe('·<img src=x onerror="alert(1)">&amp;');
  });

  it("没有能力的敌人什么都不输出", () => {
    expect(convertAbility("")).toEqual({ html: "", plain: "" });
  });
});

describe("筛选", () => {
  const setup = () => {
    const filterById = createFilters();
    return { filterById, filters: Object.values(filterById) };
  };
  const result = (filters: ReturnType<typeof setup>["filters"], q = "") => {
    const out = [];
    for (const [enemy, fails] of failedFilters(ENEMIES, filters, q))
      if (fails.length === 0) out.push(enemy);
    return names(out);
  };

  it("一行里是「或」，行与行之间是「且」", () => {
    const { filterById, filters } = setup();
    filterById.enemyLevel.selected.add("精英").add("领袖");
    expect(result(filters)).toEqual(["妖怪", "W", "“皇帝的利刃”"]);
    filterById.motion.selected.add("飞行");
    expect(result(filters)).toEqual(["妖怪"]);
  });

  it("同时会近战和远程的敌人，选哪个都算", () => {
    const { attackType, damageType } = createFilters();
    expect(matchFilter(attackType, by("W"), new Set(["远程"]))).toBe(true);
    expect(matchFilter(attackType, by("W"), new Set(["近战"]))).toBe(true);
    expect(matchFilter(attackType, by("W"), new Set(["不攻击"]))).toBe(false);
    expect(matchFilter(damageType, by("W"), new Set(["法术"]))).toBe(true);
  });

  it("属性按等级筛，隐藏数值的（?）哪一档都不算", () => {
    const { filterById, filters } = setup();
    filterById.endure.selected.add("A+").add("C");
    expect(result(filters)).toEqual(["妖怪", "W"]);
    expect(
      matchFilter(filterById.endure, by("“皇帝的利刃”"), new Set(GRADES)),
    ).toBe(false);
  });

  it("搜索名称 / 编号 / 能力，不分大小写", () => {
    expect(matchText(by("术师"), "法术伤害")).toBe(true);
    expect(matchText(by("术师"), "a1")).toBe(true);
    expect(matchText(by("妖怪"), "隐匿")).toBe(true);
    expect(matchText(by("妖怪"), "可被阻挡")).toBe(false);
    expect(matchText(by("W"), "prts")).toBe(true);
  });

  it("会筛出 0 条的选项：其余条件不变、只选这一项", () => {
    const { filterById, filters } = setup();
    filterById.enemyLevel.selected.add("领袖");
    const failed = failedFilters(ENEMIES, filters, "");
    const race = emptyOptions(filterById.enemyRace, failed);
    expect(race.has("萨卡兹")).toBe(false);
    expect(race.has("其他")).toBe(false);
    expect(race.has("无人机")).toBe(true);
    // 自己这一行换个选项还有结果，不算空
    const level = emptyOptions(filterById.enemyLevel, failed);
    expect(level.size).toBe(0);
  });
});

describe("排序", () => {
  it("图鉴顺序升降", () => {
    expect(names(sortEnemies(ENEMIES, { key: "index", dir: -1 }))[0]).toBe(
      "“皇帝的利刃”",
    );
    expect(names(sortEnemies(ENEMIES, { key: "index", dir: 1 }))[0]).toBe(
      "源石虫",
    );
  });

  it("按属性等级排，同级按图鉴顺序，没有等级的不分升降都在最后", () => {
    expect(names(sortEnemies(ENEMIES, { key: "attack", dir: -1 }))).toEqual([
      "W",
      "术师",
      "源石虫",
      "妖怪",
      "“皇帝的利刃”",
    ]);
    expect(names(sortEnemies(ENEMIES, { key: "attack", dir: 1 }))).toEqual([
      "源石虫",
      "妖怪",
      "术师",
      "W",
      "“皇帝的利刃”",
    ]);
  });
});

describe("属性等级的数值范围", () => {
  const col = (key: string) => STAT_COLS.find((c) => c.key === key)!;

  it("一般的属性：这一档的下限到上一档的下限", () => {
    expect(gradeRange(col("endure"), "SS")).toBe("生命值 SS：≥ 500000");
    expect(gradeRange(col("endure"), "A")).toBe("生命值 A：12000 – 25000");
    expect(gradeRange(col("defence"), "E")).toBe("防御力 E：< 100");
  });

  it("攻击速度按攻击间隔分档，越短越高", () => {
    expect(gradeRange(col("attackSpeed"), "SS")).toBe(
      "攻击速度 SS：攻击间隔 < 0.5 秒",
    );
    expect(gradeRange(col("attackSpeed"), "B")).toBe(
      "攻击速度 B：攻击间隔 2.6 – 3.5 秒",
    );
    expect(gradeRange(col("attackSpeed"), "E")).toBe(
      "攻击速度 E：攻击间隔 ≥ 6.9 秒",
    );
  });
});

describe("分享链接", () => {
  it("写出再读回是同一组状态；默认状态是空串", () => {
    const filterById = createFilters();
    const filters = Object.values(filterById);
    expect(buildHash(filters, readHash("", filters))).toBe("");

    filterById.enemyLevel.selected.add("领袖").add("精英");
    filterById.endure.selected.add("S+");
    const hash = buildHash(filters, {
      q: "隐匿",
      sort: { key: "attack", dir: -1 },
      view: View.GRID,
    });
    expect(decodeURIComponent(hash)).toBe(
      "enemyLevel=精英;领袖&endure=S+&_s=隐匿&_o=attack-d&_d=1",
    );

    const other = createFilters();
    const state = readHash(`#${hash}`, Object.values(other));
    expect([...other.enemyLevel.selected]).toEqual(["精英", "领袖"]);
    expect([...other.endure.selected]).toEqual(["S+"]);
    expect(state).toEqual({
      q: "隐匿",
      sort: { key: "attack", dir: -1 },
      view: View.GRID,
    });
  });

  it("认不得的字段、选项、排序都丢掉", () => {
    const filterById = createFilters();
    const filters = Object.values(filterById);
    const state = readHash("#enemyLevel=领袖;首领&x=1&_o=hp-d&_d=7", filters);
    expect([...filterById.enemyLevel.selected]).toEqual(["领袖"]);
    expect(state).toEqual({
      q: "",
      sort: { key: "index", dir: 1 },
      view: View.TABLE,
    });
  });

  it("显示方式和这台设备的默认值一样时不写 _d", () => {
    const filters = Object.values(createFilters());
    const state = readHash("", filters, View.GRID);
    expect(state.view).toBe(View.GRID);
    expect(buildHash(filters, state, View.GRID)).toBe("");
    expect(buildHash(filters, { ...state, view: View.TABLE }, View.GRID)).toBe(
      "_d=0",
    );
  });
});

describe("EnemiesListV2 UI smoke", () => {
  let app: ReturnType<typeof createApp> | undefined;
  afterEach(() => {
    app?.unmount();
    app = undefined;
    document.body.innerHTML = "";
    localStorage.clear();
    history.replaceState(null, "", "/w/敌人一览");
    vi.unstubAllGlobals();
  });

  /** happy-dom 不排版，ResizeObserver 也不回调（宽度停在挂载前的 +∞）；要看窄屏的卡片就得自己报一个宽度 */
  const mount = async (
    path = "/w/敌人一览",
    props: { source?: EnemyData[]; failed?: boolean } = { source: SOURCE },
    width = 1200,
  ) => {
    const report: (() => void)[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(private callback: ResizeObserverCallback) {}
        observe(target: Element) {
          const size = { inlineSize: width, blockSize: 0 };
          const entry = {
            target,
            borderBoxSize: [size],
            contentBoxSize: [size],
            contentRect: { width, height: 0 },
          } as unknown as ResizeObserverEntry;
          report.push(() =>
            this.callback([entry], this as unknown as ResizeObserver),
          );
        }
        unobserve() {}
        disconnect() {}
      },
    );
    history.replaceState(null, "", path);
    const host = document.createElement("div");
    document.body.append(host);
    app = createApp(EnemiesListV2, props);
    app.mount(host);
    await nextTick();
    for (const fire of report) fire();
    await nextTick();
    return host;
  };
  const chip = (host: HTMLElement, label: string) =>
    [...host.querySelectorAll<HTMLButtonElement>(".ak-chip")].find(
      (b) => b.textContent?.trim() === label,
    )!;
  const rows = (host: HTMLElement) =>
    [...host.querySelectorAll(".el-table .el-name")].map((a) => a.textContent);

  it("表格按图鉴顺序列出全部敌人；点芯片筛选，不改地址栏", async () => {
    const host = await mount();
    expect(rows(host)).toEqual(names(ENEMIES));
    expect(host.querySelector(".ls-bar__count")?.textContent).toContain("5");
    // 编号叠在头像上；地位只画成色条，读屏另有文字
    const boss = host.querySelector('tbody[data-rank="boss"]')!;
    expect(boss.querySelector(".el-avatar__index")?.textContent).toBe("W");
    expect(boss.querySelector(".ak-sr-only")?.textContent?.trim()).toBe("领袖");
    expect(
      host.querySelector('tbody[data-rank="normal"] .el-c-name .ak-sr-only'),
    ).toBeNull();
    // 没有能力的敌人不出能力行
    const bodies = host.querySelectorAll("tbody.el-enemy");
    expect(bodies[0].querySelectorAll("tr")).toHaveLength(1);
    expect(bodies[1].querySelectorAll("tr")).toHaveLength(2);

    chip(host, "领袖").click();
    await nextTick();
    expect(chip(host, "领袖").getAttribute("aria-pressed")).toBe("true");
    expect(rows(host)).toEqual(["W", "“皇帝的利刃”"]);
    expect(chip(host, "无人机").classList.contains("is-empty")).toBe(true);
    expect(host.querySelector(".ls-bar .ak-tag")?.textContent).toContain(
      "地位：领袖",
    );
    expect(location.hash).toBe("");
  });

  it("点表头按属性排序：降序 → 升序 → 回到图鉴顺序", async () => {
    const host = await mount();
    const head = [
      ...host.querySelectorAll<HTMLButtonElement>(".ak-table__sort"),
    ].find((b) => b.textContent?.trim() === "生命")!;
    head.click();
    await nextTick();
    expect(rows(host)[0]).toBe("W");
    expect(head.parentElement?.getAttribute("aria-sort")).toBe("descending");
    head.click();
    await nextTick();
    expect(rows(host)[0]).toBe("源石虫");
    head.click();
    await nextTick();
    expect(rows(host)).toEqual(names(ENEMIES));
    expect(head.parentElement?.hasAttribute("aria-sort")).toBe(false);
  });

  it("打开分享链接：照 # 参数筛选，带属性筛选时面板展开", async () => {
    const host = await mount("/w/敌人一览#enemyLevel=精英&endure=C&_d=1");
    expect(
      [...host.querySelectorAll(".el-cell .ak-enemy__name")].map(
        (el) => el.textContent,
      ),
    ).toEqual(["妖怪"]);
    expect(host.querySelector(".el-cell")?.getAttribute("href")).toBe(
      `/w/${encodeURIComponent("妖怪")}`,
    );
    expect(host.querySelector(".el-more")?.getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(chip(host, "C").dataset.tip).toBe("生命值 C：3500 – 5000");
  });

  it("页内锚点（不带 =）不当成分享链接，不清空已选的条件", async () => {
    const host = await mount();
    chip(host, "精英").click();
    await nextTick();
    history.replaceState(null, "", "/w/敌人一览#top");
    window.dispatchEvent(new Event("hashchange"));
    await nextTick();
    expect(rows(host)).toEqual(["妖怪"]);
  });

  it("结果区窄于 1000 时表格换成卡片", async () => {
    const host = await mount(undefined, undefined, 800);
    expect(host.querySelector(".el-table")).toBeNull();
    expect(host.querySelectorAll(".el-card")).toHaveLength(5);
    expect(
      host.querySelector(".el-card.ak-enemy--boss .el-ability")?.textContent,
    ).toContain("<PRTS>");
  });

  it("筛不出结果时给「清除全部条件」", async () => {
    const host = await mount("/w/敌人一览#_s=不存在的敌人");
    expect(host.querySelector(".ak-empty")?.textContent).toContain(
      "没有符合条件的敌人",
    );
    host.querySelector<HTMLButtonElement>(".ak-empty .ak-btn")!.click();
    await nextTick();
    expect(rows(host)).toHaveLength(5);
  });

  it("数据没取到：结果区是失败提示，不转圈", async () => {
    const host = await mount(undefined, { failed: true });
    expect(host.querySelector(".ak-empty")?.textContent).toContain(
      "敌人数据读取失败",
    );
    expect(host.querySelector(".ak-spinner")).toBeNull();
  });

  it("外壳预渲染（没有数据）：筛选面板在，结果区转圈", async () => {
    const host = await mount(undefined, {});
    expect(chip(host, "领袖").getAttribute("aria-pressed")).toBe("false");
    expect(host.querySelector(".ak-spinner")).not.toBeNull();
  });
});

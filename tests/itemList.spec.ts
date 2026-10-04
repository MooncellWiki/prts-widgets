import { createApp, nextTick, type App } from "vue";

import { createPinia, disposePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SORT, View } from "@/widgets/ItemList/consts";
import { FILTER_IDS, FILTERS, itemOptions } from "@/widgets/ItemList/filters";
import { buildHash, readHash } from "@/widgets/ItemList/hash";
import ItemList from "@/widgets/ItemList/index.vue";
import {
  PLACEHOLDER_ICON,
  readItems,
  type Item,
} from "@/widgets/ItemList/item";
import {
  emptyOptions,
  emptySelection,
  filterItems,
  sortItems,
  type Selection,
} from "@/widgets/ItemList/query";

interface Fixture {
  name: string;
  itemId?: string;
  rarity?: number;
  sortId?: number;
  categories?: string[];
  iconId?: string;
  filename?: string;
  dark?: boolean;
  obtain?: string;
  description?: string;
  usage?: string;
}

/** 照 模板:道具筛选数据2 的输出拼一块 #cargo-data */
function cargo(fixtures: Fixture[]) {
  const container = document.createElement("div");
  for (const f of fixtures) {
    const el = document.createElement("div");
    const [c1 = "", c2 = "", c3 = ""] = f.categories ?? [];
    Object.assign(el.dataset, {
      name: f.name,
      rarity: String(f.rarity ?? 0),
      category1: c1,
      category2: c2,
      category3: c3,
      itemId: f.itemId ?? f.name,
      sortId: String(f.sortId ?? 0),
      iconId: f.iconId ?? "",
      filename: f.filename ?? "",
      darkBackground: f.dark ? "1" : "0",
    });
    el.innerHTML =
      `<div class="obtain-method">${f.obtain ?? ""}</div>` +
      `<div class="description">${f.description ?? ""}</div>` +
      `<div class="purpose">${f.usage ?? ""}</div>`;
    container.append(el);
  }
  return container;
}

const items = (fixtures: Fixture[]) => readItems(cargo(fixtures));
const names = (list: Item[]) => list.map((item) => item.name);
const select = (picked: Partial<Record<keyof Selection, string[]>>) => {
  const selection = emptySelection();
  for (const id of FILTER_IDS) selection[id] = new Set(picked[id] ?? []);
  return selection;
};

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("读模板输出", () => {
  it("读出各字段，用途 / 描述 / 获取途径的 HTML 原样留着", () => {
    const [item] = items([
      {
        name: "固源岩",
        itemId: "30012",
        rarity: 1,
        sortId: 100031,
        categories: ["材料"],
        iconId: "MTL_SL_G2",
        obtain: '<a href="/w/1-7">1-7</a>、加工站，  采购中心',
        usage: "多种<b>强化</b>场合",
        description: "一小块源岩。",
      },
    ]);
    expect(item).toMatchObject({
      index: 0,
      name: "固源岩",
      itemId: "30012",
      rarity: 1,
      sortId: 100031,
      categories: ["材料"],
      usage: "多种强化场合",
      usageHtml: "多种<b>强化</b>场合",
      description: "一小块源岩。",
      obtain: ["1-7", "加工站", "采购中心"],
      obtainHtml: '<a href="/w/1-7">1-7</a>、加工站，  采购中心',
      icon: "https://torappu.prts.wiki/assets/item_icon/MTL_SL_G2.png",
      dark: false,
      href: `/w/${encodeURIComponent("固源岩")}`,
    });
    expect(item.haystack).toContain("多种强化场合");
  });

  it("图标：模板给了图用模板的，否则按 iconId 取，都没有用占位图", () => {
    const list = items([
      {
        name: "甲",
        filename: "https://media.prts.wiki/a/ab/x.png",
        iconId: "A",
      },
      { name: "乙", iconId: "B", dark: true },
      { name: "丙" },
    ]);
    expect(list.map((item) => item.icon)).toEqual([
      "https://media.prts.wiki/a/ab/x.png",
      "https://torappu.prts.wiki/assets/item_icon/B.png",
      PLACEHOLDER_ICON,
    ]);
    expect(list.map((item) => item.dark)).toEqual([false, true, false]);
  });

  it("没有 itemId 的不收，次序号接着排（重名、重 itemId 的都各算一件）", () => {
    const list = items([
      { name: "甲", itemId: "a" },
      { name: "旧道具", itemId: "" },
      { name: "甲", itemId: "a" },
    ]);
    expect(list.map((item) => item.index)).toEqual([0, 1]);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("容器不在时是空列表", () => {
    expect(readItems(null)).toEqual([]);
  });
});

describe("筛选项归属", () => {
  const options = (categories: string[], obtain: string[] = []) =>
    itemOptions({ categories, rarity: 3, obtain });

  it("选项的 id 在各行内不重复", () => {
    for (const id of FILTER_IDS) {
      const ids = FILTERS[id].options.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(FILTERS.category.groups?.flatMap((g) => g.options)).toEqual(
      FILTERS.category.options,
    );
  });

  it("分类：按别名归并，category2 也算", () => {
    expect([...options(["芯片组"]).category]).toEqual(["精英化芯片"]);
    expect([...options(["建材原材料"]).category]).toEqual(["基建材料"]);
    expect([...options(["家具收藏包"]).category]).toEqual(["道具组合"]);
    expect([...options(["基础道具", "可露希尔票券"]).category]).toEqual([
      "基础道具",
      "可露希尔票券",
    ]);
    expect([...options(["", "寻访数据契约"].filter(Boolean)).category]).toEqual(
      ["寻访数据契约"],
    );
  });

  it("分类：哪项都不沾的归「其他」，沾了别的就不算", () => {
    expect([...options([]).category]).toEqual(["其他"]);
    expect([...options(["理智回复道具"]).category]).toEqual(["其他"]);
    expect([...options(["其他干员道具"]).category]).toEqual(["其他"]);
    expect([...options(["理智回复道具", "食物"]).category]).toEqual(["食物"]);
  });

  it("获取途径：逐段看含不含那几个字，都不含（或没写）的归「其他」", () => {
    const obtain = (...pieces: string[]) => [...options([], pieces).obtain];
    expect(obtain("干员入职的馈赠")).toEqual(["干员入职"]);
    expect(obtain("周常任务奖励", "赠送")).toEqual(["任务奖励", "赠送"]);
    expect(obtain("活动关卡掉落")).toEqual(["关卡掉落", "活动获得"]);
    expect(obtain("CE-4常规掉落")).toEqual(["关卡掉落"]);
    expect(obtain("1-1首次通关掉落")).toEqual(["首次通关"]);
    expect(obtain("记录修复获得")).toEqual(["记录修复"]);
    expect(obtain("加工站")).toEqual(["加工站产物"]);
    expect(obtain("在集成战略模式中获得")).toEqual(["其他"]);
    expect(obtain()).toEqual(["其他"]);
  });

  it("稀有度照模板的 0–5", () => {
    expect([...options([]).rarity]).toEqual(["3"]);
  });
});

const SAMPLE: Fixture[] = [
  {
    name: "龙门币",
    itemId: "4001",
    rarity: 3,
    sortId: 10004,
    categories: ["基础道具"],
    obtain: "关卡掉落",
    usage: "龙门发行的货币。",
  },
  {
    name: "固源岩",
    itemId: "30012",
    rarity: 1,
    sortId: 100031,
    categories: ["材料"],
    obtain: "关卡掉落、加工站",
    description: "一小块源岩，结构致密。",
  },
  {
    name: "聚合剂",
    itemId: "30125",
    rarity: 4,
    sortId: 100001,
    categories: ["材料"],
    obtain: "加工站",
  },
  {
    name: "活动代币",
    itemId: "act_token",
    rarity: 3,
    sortId: -10000,
    categories: ["活动道具"],
    obtain: "活动获得",
  },
  {
    name: "阿米娅的信物",
    itemId: "p_char_002_amiya",
    rarity: 4,
    sortId: 600001,
    categories: ["信物"],
    obtain: "干员入职的馈赠",
  },
];

describe("筛选", () => {
  const all = items(SAMPLE);
  const pick = (
    picked: Partial<Record<keyof Selection, string[]>>,
    needle = "",
  ) => names(filterItems(all, select(picked), needle)).sort();

  it("行内「或」、行间「且」，没选的行不筛", () => {
    expect(pick({})).toHaveLength(5);
    expect(pick({ category: ["材料", "信物"] })).toEqual(
      ["固源岩", "聚合剂", "阿米娅的信物"].sort(),
    );
    expect(pick({ category: ["材料", "信物"], rarity: ["4"] })).toEqual(
      ["聚合剂", "阿米娅的信物"].sort(),
    );
    expect(
      pick({ category: ["材料"], rarity: ["4"], obtain: ["关卡掉落"] }),
    ).toEqual([]);
  });

  it("搜索：名称 / 用途 / 描述，不分大小写", () => {
    expect(pick({}, "源岩")).toEqual(["固源岩"]);
    expect(pick({}, "货币")).toEqual(["龙门币"]);
    expect(pick({}, "致密")).toEqual(["固源岩"]);
    expect(pick({ category: ["信物"] }, "源岩")).toEqual([]);
  });

  it("点了也不会多出道具的选项：其余条件不变，这一行里没有道具落在它上面", () => {
    const empties = emptyOptions(all, select({ category: ["材料"] }), "");
    // 分类行只看别的行：别的行没选，凡是有道具的分类都不算空
    expect(empties.category.has("信物")).toBe(false);
    expect(empties.category.has("作战记录")).toBe(true);
    // 稀有度 / 获取途径行要过「分类：材料」
    expect(empties.rarity.has("1")).toBe(false);
    expect(empties.rarity.has("3")).toBe(true);
    expect(empties.obtain.has("加工站产物")).toBe(false);
    expect(empties.obtain.has("干员入职")).toBe(true);
  });
});

describe("排序", () => {
  const all = items(SAMPLE);

  it("仓库顺序：sortId 升序；sortId 为负的不管正序倒序都在最后", () => {
    expect(names(sortItems(all, DEFAULT_SORT))).toEqual([
      "龙门币",
      "聚合剂",
      "固源岩",
      "阿米娅的信物",
      "活动代币",
    ]);
    expect(names(sortItems(all, { key: "order", dir: -1 }))).toEqual([
      "阿米娅的信物",
      "固源岩",
      "聚合剂",
      "龙门币",
      "活动代币",
    ]);
  });

  it("sortId 相同的比 itemId（同游戏仓库）", () => {
    const list = items([
      { name: "乙", itemId: "b", sortId: 5 },
      { name: "甲", itemId: "a", sortId: 5 },
    ]);
    expect(names(sortItems(list, DEFAULT_SORT))).toEqual(["甲", "乙"]);
  });

  it("稀有度：同稀有度的照仓库顺序", () => {
    expect(names(sortItems(all, { key: "rarity", dir: -1 }))).toEqual([
      "聚合剂",
      "阿米娅的信物",
      "龙门币",
      "活动代币",
      "固源岩",
    ]);
    expect(names(sortItems(all, { key: "rarity", dir: 1 }))[0]).toBe("固源岩");
  });
});

describe("地址栏 # 参数", () => {
  const ids = (state: ReturnType<typeof readHash>) =>
    Object.fromEntries(FILTER_IDS.map((id) => [id, [...state.selection[id]]]));

  it("不写 = 默认：分类选着「材料」，仓库正序，图标", () => {
    const state = readHash("");
    expect(ids(state)).toEqual({ category: ["材料"], rarity: [], obtain: [] });
    expect(state).toMatchObject({ q: "", sort: DEFAULT_SORT, view: View.GRID });
    expect(buildHash(state)).toBe("");
  });

  it("读：各行、搜索、排序、显示方式；认不得的选项和键丢掉", () => {
    const state = readHash(
      `#${new URLSearchParams({
        category: "1-信物;没有这一项;材料",
        rarity: "1-4;9",
        obtain: "1-采购中心",
        nonsense: "1-x",
        _s: "源岩",
        _o: "rarity-d",
        _d: "1",
      })}`,
    );
    expect(ids(state)).toEqual({
      category: ["信物", "材料"],
      rarity: ["4"],
      obtain: ["采购中心"],
    });
    expect(state).toMatchObject({
      q: "源岩",
      sort: { key: "rarity", dir: -1 },
      view: View.LIST,
    });
  });

  it("写：选项按面板上的次序；和默认一样的不写", () => {
    const state = readHash("");
    state.selection.category = new Set(["信物", "材料"]);
    state.selection.rarity = new Set(["4"]);
    state.sort = { key: "order", dir: -1 };
    expect(decodeURIComponent(buildHash(state))).toBe(
      "category=1-材料;信物&rarity=1-4&_o=order-d",
    );
  });

  it("分类一项都不选要写出来（不写会被当成默认的「材料」）", () => {
    const state = readHash("");
    state.selection.category.clear();
    expect(buildHash(state)).toBe("category=1-");
    expect(ids(readHash("#category=1-"))).toEqual({
      category: [],
      rarity: [],
      obtain: [],
    });
  });

  it("写了再读回来是同一个状态", () => {
    const state = readHash("#category=1-食物&obtain=1-赠送;其他&_s=蛋糕&_d=1");
    expect(readHash(buildHash(state))).toEqual(state);
  });

  it("坏的 _o 不认，照默认排", () => {
    expect(readHash("#_o=hp-d").sort).toEqual(DEFAULT_SORT);
    expect(readHash("#_o=3").sort).toEqual(DEFAULT_SORT);
  });
});

describe("挂载", () => {
  let app: App | undefined;
  let pinia: ReturnType<typeof createPinia> | undefined;
  let host: HTMLDivElement;

  const mount = async (hash = "") => {
    history.replaceState(null, "", `/${hash}`);
    host = document.createElement("div");
    document.body.append(host);
    pinia = createPinia();
    app = createApp(ItemList, { source: items(SAMPLE) }).use(pinia);
    app.mount(host);
    await nextTick();
  };
  const chip = (label: string) => {
    const button = Array.from(
      host.querySelectorAll<HTMLButtonElement>(".ak-chip"),
    ).find((el) => el.textContent?.trim() === label);
    if (!button) throw new Error(`找不到筛选项：${label}`);
    return button;
  };
  const cells = () =>
    Array.from(host.querySelectorAll(".il-cell__name"), (el) => el.textContent);

  afterEach(() => {
    app?.unmount();
    if (pinia) disposePinia(pinia);
    app = pinia = undefined;
    document.body.innerHTML = "";
    history.replaceState(null, "", "/");
  });

  it("进页面默认选着「材料」，图标视图按仓库顺序排", async () => {
    await mount();
    expect(chip("材料").getAttribute("aria-pressed")).toBe("true");
    expect(cells()).toEqual(["聚合剂", "固源岩"]);
    expect(host.querySelector(".ls-bar__count")?.textContent).toContain("2");
    expect(location.hash).toBe("");
  });

  it("点芯片：结果、结果栏的已选条件、地址栏一起变", async () => {
    await mount();
    chip("信物").click();
    await nextTick();
    expect(cells()).toEqual(["聚合剂", "固源岩", "阿米娅的信物"]);
    expect(
      Array.from(host.querySelectorAll(".ls-bar__active .ak-tag"), (el) =>
        el.textContent?.replace("✕", "").trim(),
      ),
    ).toEqual(["分类：材料", "分类：信物"]);
    expect(new URLSearchParams(location.hash.slice(1)).get("category")).toBe(
      "1-材料;信物",
    );
  });

  it("点了也不会多出道具的选项压淡", async () => {
    await mount();
    expect(chip("干员入职").classList.contains("is-empty")).toBe(true);
    expect(chip("加工站产物").classList.contains("is-empty")).toBe(false);
  });

  it("筛不出东西时出空状态，「清除全部条件」连默认的「材料」一起清掉", async () => {
    await mount("#rarity=1-5");
    expect(cells()).toEqual([]);
    const reset = host.querySelector<HTMLButtonElement>(".ak-empty button")!;
    reset.click();
    await nextTick();
    expect(cells()).toHaveLength(5);
    expect(location.hash).toBe("#category=1-");
  });

  it("列表视图：用途 / 描述 / 获取途径摊开，链到道具页", async () => {
    await mount("#_d=1");
    const rows = Array.from(host.querySelectorAll(".il-table tbody tr"));
    expect(rows).toHaveLength(2);
    const [, rock] = rows;
    expect(rock.querySelector(".il-name")?.getAttribute("href")).toBe(
      `/w/${encodeURIComponent("固源岩")}`,
    );
    expect(rock.querySelector(".il-desc")?.textContent).toBe(
      "一小块源岩，结构致密。",
    );
    expect(rock.querySelector(".il-c-obtain")?.textContent).toBe(
      "关卡掉落、加工站",
    );
  });

  it("图标取不到换占位图，只换一次", async () => {
    await mount();
    const img = host.querySelector<HTMLImageElement>(".il-cell img")!;
    img.dispatchEvent(new Event("error"));
    expect(decodeURI(img.src)).toBe(PLACEHOLDER_ICON);
    // 占位图也取不到：不再重设 src（不然会一直重试）
    img.src = "about:blank";
    img.dispatchEvent(new Event("error"));
    expect(img.src).toBe("about:blank");
  });
});

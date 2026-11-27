import { createApp, h, nextTick, reactive, ref, type App } from "vue";

import { createPinia, disposePinia, type Pinia } from "pinia";
import { afterEach, describe, expect, it } from "vitest";

import Toolbar from "@/widgets/EquipList/Toolbar.vue";
import FilterPanel from "@/widgets/EquipList/filter/FilterPanel.vue";
import ModuleFilterPanel from "@/widgets/EquipList/filter/ModuleFilterPanel.vue";
import {
  createEquipFilterSelection,
  createOperatorSelection,
  DEFAULT_SORT,
  GroupBy,
  RARITY_FILTER_OPTIONS,
  TYPE_FILTER_OPTIONS,
  View,
  type EquipFilterSelection,
  type EquipGroupBy,
  type EquipSort,
  type EquipView,
  type OperatorFilterDef,
  type OperatorFilterId,
  type OperatorSelection,
} from "@/widgets/EquipList/filters";
import {
  matchesEquipSearch,
  matchesFilter,
  matchesFilters,
  sortEquipRows,
} from "@/widgets/EquipList/query";
import { useEquipListStore } from "@/widgets/EquipList/store";
import type { EquipRow } from "@/widgets/EquipList/types";

const OPERATOR_FILTERS: OperatorFilterDef[] = [
  { id: "type", title: "职业", options: TYPE_FILTER_OPTIONS },
  { id: "rarity", title: "稀有度", options: RARITY_FILTER_OPTIONS },
  {
    id: "sub",
    title: "职业分支",
    options: [
      { value: "策士", label: "策士" },
      { value: "领主", label: "领主" },
    ],
    groups: [
      { label: "先锋", options: [{ value: "策士", label: "策士" }] },
      { label: "近卫", options: [{ value: "领主", label: "领主" }] },
    ],
  },
];

function row(overrides: Partial<EquipRow> & { data?: Record<string, string> }) {
  return {
    name: overrides.name ?? "模组",
    type: overrides.type ?? "SWO-X",
    operator: overrides.operator ?? "测试干员",
    oprarity: overrides.oprarity ?? 4,
    opid: overrides.opid ?? 1,
    data: overrides.data ?? {},
  } satisfies EquipRow;
}

describe("模组筛选条件", () => {
  it("空选择放行；模组类型按 -X / -Y 这类后缀匹配", () => {
    expect(matchesFilters({}, createEquipFilterSelection())).toBe(true);

    expect(matchesFilter({ type: "SWO-X" }, "type", ["x", "β"])).toBe(true);
    expect(matchesFilter({ type: "SWO-β" }, "type", ["x", "β"])).toBe(true);
    expect(matchesFilter({ type: "SWO-Y" }, "type", ["x", "β"])).toBe(false);
    expect(matchesFilter({ type: "SWO-Y" }, "type", [])).toBe(true);
  });

  it("新增天赋 / 特性追加 / 实装时间 / 任务关卡 / 数值", () => {
    expect(
      matchesFilter({ talent2: "天赋：新增天赋「x」" }, "talent", ["yes"]),
    ).toBe(true);
    expect(matchesFilter({ talent2: "天赋：x" }, "talent", ["yes"])).toBe(
      false,
    );
    expect(matchesFilter({ talent2: "天赋：x" }, "talent", ["no"])).toBe(true);

    expect(matchesFilter({ add: "1" }, "trait", ["yes"])).toBe(true);
    expect(matchesFilter({}, "trait", ["yes"])).toBe(false);

    expect(
      matchesFilter({ addtime: "1700000000" }, "addtime", ["1700000000"]),
    ).toBe(true);
    expect(matchesFilter({ addtime: "1" }, "addtime", ["1700000000"])).toBe(
      false,
    );

    expect(matchesFilter({ mission2opt: "1-7" }, "mission2opt", ["1-7"])).toBe(
      true,
    );
    expect(matchesFilter({ mission2opt: "2-1" }, "mission2opt", ["1-7"])).toBe(
      false,
    );

    expect(matchesFilter({ hp: "10" }, "hp", ["yes"])).toBe(true);
    expect(matchesFilter({ hp: "0" }, "hp", ["yes"])).toBe(false);
    expect(matchesFilter({ hp: "0" }, "hp", ["no"])).toBe(true);
  });

  it("不同筛选方式之间是「且」", () => {
    const selection = createEquipFilterSelection();
    selection.type = ["x"];
    selection.hp = ["yes"];
    expect(matchesFilters({ type: "SWO-X", hp: "10" }, selection)).toBe(true);
    expect(matchesFilters({ type: "SWO-X", hp: "0" }, selection)).toBe(false);
    expect(matchesFilters({ type: "SWO-Y", hp: "10" }, selection)).toBe(false);
  });

  it("按干员名称 / 模组名称搜索", () => {
    const char = { name: "阿米娅", nameEN: "Amiya", nameJP: "アーミヤ" };
    expect(matchesEquipSearch(char, { name: "任意模组" }, "")).toBe(true);
    expect(matchesEquipSearch(char, { name: "任意模组" }, "阿米娅")).toBe(true);
    expect(matchesEquipSearch(char, { name: "任意模组" }, "amiya")).toBe(true);
    expect(matchesEquipSearch(char, { name: "任意模组" }, "アーミヤ")).toBe(
      true,
    );
    expect(matchesEquipSearch(char, { name: "任意模组" }, "银灰")).toBe(false);
    expect(matchesEquipSearch(char, { name: "精神爆发" }, "爆发")).toBe(true);
  });
});

describe("模组排序", () => {
  const list = [
    row({
      name: "乙",
      operator: "乙",
      oprarity: 5,
      opid: 2,
      data: { addtime: "10", hp3: "5", time3: "3" },
    }),
    row({
      name: "甲",
      operator: "甲",
      oprarity: 4,
      opid: 1,
      data: { addtime: "20", hp3: "20", time3: "1" },
    }),
  ];

  it("干员稀有度：方向反转时顺序反过来", () => {
    expect(
      sortEquipRows(list, { key: "default", dir: -1 }).map((r) => r.operator),
    ).toEqual(["乙", "甲"]);
    expect(
      sortEquipRows(list, { key: "default", dir: 1 }).map((r) => r.operator),
    ).toEqual(["甲", "乙"]);
  });

  it("实装时间升 / 降序；同时间按序号倒序", () => {
    expect(
      sortEquipRows(list, { key: "addtime", dir: 1 }).map((r) => r.operator),
    ).toEqual(["乙", "甲"]);
    expect(
      sortEquipRows(list, { key: "addtime", dir: -1 }).map((r) => r.operator),
    ).toEqual(["甲", "乙"]);
  });

  it("数值：生命降序，再部署时间升序", () => {
    expect(
      sortEquipRows(list, { key: "hp", dir: -1 }).map((r) => r.operator),
    ).toEqual(["甲", "乙"]);
    expect(
      sortEquipRows(list, { key: "time", dir: 1 }).map((r) => r.operator),
    ).toEqual(["甲", "乙"]);
  });
});

describe("干员筛选面板", () => {
  let app: App | undefined;
  let host: HTMLDivElement;

  afterEach(() => {
    app?.unmount();
    app = undefined;
    host?.remove();
    document.body.innerHTML = "";
  });

  function mount(selection: OperatorSelection) {
    host = document.createElement("div");
    document.body.append(host);
    const toggle = (id: OperatorFilterId, value: string) => {
      const selected = selection[id];
      const index = selected.indexOf(value);
      if (index === -1) selected.push(value);
      else selected.splice(index, 1);
    };
    app = createApp({
      render: () =>
        h(FilterPanel, {
          filters: OPERATOR_FILTERS,
          selection,
          onToggle: toggle,
          onClear: (id: OperatorFilterId) => {
            selection[id] = [];
          },
        }),
    });
    app.mount(host);
  }

  const chip = (label: string) => {
    const button = Array.from(
      host.querySelectorAll<HTMLButtonElement>(".ak-chip"),
    ).find((el) => el.textContent?.trim() === label);
    if (!button)
      throw new Error(
        `找不到筛选项：${label}；现有：${Array.from(
          host.querySelectorAll<HTMLButtonElement>(".ak-chip"),
          (el) => el.textContent?.trim(),
        ).join("|")}`,
      );
    return button;
  };

  it("没选职业时不显示职业分支；选了才出，且带职业 / 分支图标", async () => {
    const selection = reactive(createOperatorSelection());
    mount(selection);
    await nextTick();

    expect(
      Array.from(host.querySelectorAll(".ep-row__label span")).map(
        (el) => el.textContent,
      ),
    ).toEqual(["职业", "稀有度"]);
    expect(host.querySelector(".ep-branch")).toBeNull();

    chip("先锋").click();
    await nextTick();
    expect(selection.type).toEqual(["先锋"]);
    expect(
      Array.from(host.querySelectorAll(".ep-row__label span")).map(
        (el) => el.textContent,
      ),
    ).toEqual(["职业", "职业分支", "稀有度"]);
    expect(host.querySelector(".ep-branch")?.getAttribute("aria-label")).toBe(
      "先锋分支",
    );
    expect(host.querySelector(".ep-branch__prof .ol-ico")).toBeInstanceOf(
      HTMLElement,
    );
    expect(chip("策士").querySelector(".ol-ico")).toBeInstanceOf(HTMLElement);
  });

  it("稀有度星色与行内「清除」", async () => {
    const selection = reactive(createOperatorSelection());
    mount(selection);
    await nextTick();

    expect(chip("4").closest(".ep-contents")?.getAttribute("data-rarity")).toBe(
      "4",
    );

    chip("先锋").click();
    await nextTick();
    host.querySelector<HTMLButtonElement>(".ep-row__clear")!.click();
    await nextTick();
    expect(selection.type).toEqual([]);
  });
});

describe("高级筛选里的模组筛选", () => {
  let app: App | undefined;
  let host: HTMLDivElement;

  afterEach(() => {
    app?.unmount();
    app = undefined;
    host?.remove();
    document.body.innerHTML = "";
  });

  function mount() {
    const selection = ref<EquipFilterSelection>(createEquipFilterSelection());
    host = document.createElement("div");
    document.body.append(host);
    app = createApp({
      setup() {
        return () =>
          h(ModuleFilterPanel, {
            timeOptions: [
              { value: "1700000000", label: "2023/11/15" },
              { value: "2", label: "2023/12/01" },
            ],
            selection: selection.value,
            "onUpdate:selection": (value: EquipFilterSelection) => {
              selection.value = value;
            },
          });
      },
    });
    app.mount(host);
    return { selection };
  }

  const panel = (id: string) =>
    host.querySelector<HTMLElement>(`.ep-adv__panel--${id}`)!;

  const tab = (label: string) => {
    const el = Array.from(host.querySelectorAll<HTMLElement>(".ak-tab")).find(
      (item) => item.textContent?.includes(label),
    );
    if (!el) throw new Error(`找不到页签：${label}`);
    return el;
  };

  const chip = (id: string, label: string) =>
    Array.from(panel(id).querySelectorAll<HTMLButtonElement>(".ak-chip")).find(
      (el) => el.textContent?.trim() === label,
    )!;

  it("模组信息合并成一个页签；数值单独一个页签", async () => {
    const { selection } = mount();
    await nextTick();

    expect(
      Array.from(host.querySelectorAll(".ak-tab"), (el) =>
        el.textContent?.replace(/\d+/g, "").trim(),
      ),
    ).toEqual(["模组信息", "数值"]);

    chip("info", "有").click();
    await nextTick();
    expect(selection.value.talent).toEqual(["yes"]);

    chip("info", "X").click();
    await nextTick();
    chip("info", "Y").click();
    await nextTick();
    expect(selection.value.type).toEqual(["x", "y"]);

    tab("数值").click();
    await nextTick();
    expect(panel("stats").querySelectorAll(".ep-row")).toHaveLength(8);
    chip("stats", "有").click();
    await nextTick();
    expect(selection.value.hp).toEqual(["yes"]);
  });

  it("实装时间多选下拉 / 任务关卡输入", async () => {
    const { selection } = mount();
    await nextTick();

    const trigger =
      panel("info").querySelector<HTMLButtonElement>(".ep-time__trigger")!;
    trigger.click();
    await nextTick();

    const option = (label: string) =>
      Array.from(
        document.querySelectorAll<HTMLElement>(".ep-time__menu .ak-chip"),
      ).find((el) => el.textContent?.trim() === label)!;

    option("2023/11/15").click();
    await nextTick();
    option("2023/12/01").click();
    await nextTick();
    expect(selection.value.addtime).toEqual(["1700000000", "2"]);

    const input =
      panel("info").querySelector<HTMLInputElement>("input.ak-input")!;
    input.value = "1-7";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();
    expect(selection.value.mission2opt).toEqual(["1-7"]);
  });
});

describe("工具条", () => {
  let app: App | undefined;
  let host: HTMLDivElement;
  let pinia: Pinia | undefined;

  afterEach(() => {
    app?.unmount();
    if (pinia) disposePinia(pinia);
    app = undefined;
    pinia = undefined;
    host?.remove();
    document.body.innerHTML = "";
  });

  function mount() {
    pinia = createPinia();
    const sort = ref<EquipSort>({ ...DEFAULT_SORT });
    const view = ref<EquipView>(View.TABLE);
    const group = ref<EquipGroupBy>(GroupBy.SUB);
    const q = ref("");
    host = document.createElement("div");
    document.body.append(host);
    app = createApp({
      setup() {
        return () =>
          h(Toolbar, {
            q: q.value,
            sort: sort.value,
            view: view.value,
            group: group.value,
            "onUpdate:q": (value: string) => {
              q.value = value;
            },
            "onUpdate:sort": (value: EquipSort) => {
              sort.value = value;
            },
            "onUpdate:view": (value: EquipView) => {
              view.value = value;
            },
            "onUpdate:group": (value: EquipGroupBy) => {
              group.value = value;
            },
          });
      },
    }).use(pinia);
    app.mount(host);
    return { q, sort, view, group, store: useEquipListStore(pinia) };
  }

  it("排序项 + 升降、显示方式、头像分组、简略内容", async () => {
    const { sort, view, group, store } = mount();
    await nextTick();

    const sortSelect =
      host.querySelector<HTMLSelectElement>("select.ak-select")!;
    expect(sortSelect.value).toBe("addtime");
    expect(host.querySelector(".ep-simple")).toBeInstanceOf(HTMLElement);
    sortSelect.value = "hp";
    sortSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await nextTick();
    expect(sort.value).toEqual({ key: "hp", dir: -1 });

    const dir = Array.from(
      host.querySelectorAll<HTMLButtonElement>(".ep-sort .ak-btn"),
    ).find((el) => el.textContent?.includes("降序"))!;
    dir.click();
    await nextTick();
    expect(sort.value).toEqual({ key: "hp", dir: 1 });

    expect(host.querySelector(".ep-simple")).toBeInstanceOf(HTMLElement);
    expect(host.querySelector(".ep-group")).toBeNull();
    const avatar = Array.from(
      host.querySelectorAll<HTMLButtonElement>(".ep-view .ak-btn"),
    ).find((el) => el.textContent?.includes("头像"))!;
    avatar.click();
    await nextTick();
    expect(view.value).toBe("avatar");
    expect(host.querySelector(".ep-sort")).toBeNull();
    expect(host.querySelector(".ep-simple")).toBeNull();
    expect(host.querySelector(".ep-group")).toBeInstanceOf(HTMLElement);

    const timeGroup = Array.from(
      host.querySelectorAll<HTMLButtonElement>(".ep-group .ak-btn"),
    ).find((el) => el.textContent?.includes("按时间"))!;
    timeGroup.click();
    await nextTick();
    expect(group.value).toBe("time");

    const table = Array.from(
      host.querySelectorAll<HTMLButtonElement>(".ep-view .ak-btn"),
    ).find((el) => el.textContent?.includes("表格"))!;
    table.click();
    await nextTick();
    expect(host.querySelector(".ep-sort")).not.toBeNull();
    expect(host.querySelector(".ep-group")).toBeNull();
    const mission = Array.from(
      host.querySelectorAll<HTMLButtonElement>(".ep-simple .ak-btn"),
    ).find((el) => el.textContent?.includes("模组任务"))!;
    mission.click();
    await nextTick();
    expect(store.simple).toBe("mission");
  });
});

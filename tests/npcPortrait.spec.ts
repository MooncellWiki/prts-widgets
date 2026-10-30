import { createApp, nextTick, type App } from "vue";

import { afterEach, describe, expect, it, vi } from "vitest";

import NpcPortrait from "../src/widgets/NpcPortrait/index.vue";
import { observePortraits } from "../src/widgets/NpcPortrait/observe";
import {
  basesOf,
  buildBodies,
  fileBodies,
  parseExclude,
  parseKeys,
  wikiFileName,
} from "../src/widgets/NpcPortrait/resolve";
import { parseCharacterMap } from "../src/widgets/StoryAssetExplorer/utils";

const ASSET = "https://torappu.prts.wiki/assets/avg/characters";

const single = (base: string, name = base) => ({
  pos: { x: 0, y: 180 },
  size: { x: 1024, y: 1024 },
  groups: [],
  array: [{ name, alias: "", group: -1, image: `${base}/${name}`, body: 0 }],
});

const overlay = (
  base: string,
  groups: string[],
  faces: [name: string, group: number][],
  faceRect = { x: 531, y: 7, w: 144, h: 213 },
) => ({
  pos: { x: 0, y: 150 },
  size: { x: 1196, y: 1196 },
  groups: groups.map((image) => ({
    mode: "face_overlay",
    base: `${base}/${image}`,
    faceRect,
  })),
  array: faces.map(([name, group], index) => ({
    name,
    alias: "",
    group,
    face: `${base}/${name}`,
    body: 0,
    index,
  })),
});

// 结构取自 torappu 的 avg/character.json（表情只留了几个）
const RAW = {
  avg_npc_048: single("avg_npc_048"),
  avg_npc_1360_1: single("avg_npc_1360_1", "avg_npc_1360_1$1"),
  avg_npc_102: single("avg_npc_102"),
  avg_npc_102_2: single("avg_npc_102_2"),
  avg_npc_1020_1: single("avg_npc_1020_1"),
  avg_npc_138: {
    ...single("avg_npc_138", "avg_npc_138#1"),
    array: ["avg_npc_138#1", "avg_npc_138#2"].map((name) => ({
      name,
      alias: "",
      group: -1,
      image: `avg_npc_138/${name}`,
    })),
  },
  avg_npc_1618_1: overlay(
    "avg_npc_1618_1",
    ["avg_npc_1618_1$1"],
    [
      ["1$1", 0],
      ["2$1", 0],
      ["3$1", 0],
    ],
  ),
  avg_npc_1779_1: overlay(
    "avg_npc_1779_1",
    ["avg_npc_1779_1$1", "avg_npc_1779_1$2"],
    [
      ["1$1", 0],
      ["2$1", 0],
      ["1$2", 1],
      ["2$2", 1],
    ],
  ),
  avg_npc_208: single("avg_npc_208"),
  avg_npc_208_1: overlay(
    "avg_npc_208_1",
    ["avg_npc_208_1"],
    [
      ["1", 0],
      ["2", 0],
    ],
  ),
  avg_npc_2084_1: single("avg_npc_2084_1"),
  // character.json 保留原始大小写，parseCharacterMap 把键折成小写
  npc_2001_Aya_1: single("npc_2001_Aya_1"),
  npc_2001_Aya_rock: single("npc_2001_Aya_rock"),
};

const links = parseCharacterMap(RAW);

describe("parseKeys", () => {
  it("剧情 key、带空格的 id、写成文件名前缀的 id 都归一成 key", () => {
    expect(parseKeys("doctor,avg_npc_048, avg_npc_1360")).toEqual([
      "doctor",
      "avg_npc_048",
      "avg_npc_1360",
    ]);
    expect(parseKeys("avg npc 041")).toEqual(["avg_npc_041"]);
    expect(parseKeys("Avg avg npc 245")).toEqual(["avg_npc_245"]);
    expect(parseKeys(" , ")).toEqual([]);
  });
});

describe("basesOf", () => {
  it("同名或 key 后接 _ - $ 才算，不会把 avg_npc_208 扩到 avg_npc_2084", () => {
    expect(basesOf("avg_npc_208", links.keys())).toEqual([
      "avg_npc_208",
      "avg_npc_208_1",
    ]);
    expect(basesOf("avg_npc_102", links.keys())).toEqual([
      "avg_npc_102",
      "avg_npc_102_2",
    ]);
    expect(basesOf("avg_npc_1360", links.keys())).toEqual(["avg_npc_1360_1"]);
    expect(basesOf("doctor", links.keys())).toEqual([]);
  });

  it("key 里有大写也能对上（parseCharacterMap 的键是小写）", () => {
    expect(basesOf("npc_2001_Aya", links.keys())).toEqual([
      "npc_2001_aya_1",
      "npc_2001_aya_rock",
    ]);
  });
});

describe("wikiFileName", () => {
  it("和 wiki 上传的文件名一致（现网 3031 个立绘文件里对上 3030 个，剩下的 Npc_doctor.png 不是解包资源）", () => {
    expect(wikiFileName("avg_npc_048", "avg_npc_048")).toBe(
      "Avg_avg_npc_048.png",
    );
    expect(wikiFileName("avg_npc_1360_1", "avg_npc_1360_1$1")).toBe(
      "Avg_avg_npc_1360_1$1.png",
    );
    expect(wikiFileName("avg_npc_1618_1", "1$1")).toBe(
      "Avg_avg_npc_1618_1-1$1.png",
    );
    expect(wikiFileName("avg_npc_208_1", "2")).toBe("Avg_avg_npc_208_1-2.png");
    expect(wikiFileName("avg_npc_138", "avg_npc_138#2")).toBe(
      "Avg_avg_npc_138-2.png",
    );
  });
});

describe("buildBodies", () => {
  it("按 key 顺序列出，独立全身图一张一个", () => {
    const bodies = buildBodies(
      parseKeys("doctor,avg_npc_048,avg_npc_1360"),
      links,
    );
    expect(bodies).toEqual([
      {
        kind: "single",
        id: "avg_npc_048#avg_npc_048",
        url: `${ASSET}/avg_npc_048/avg_npc_048.png`,
      },
      {
        kind: "single",
        id: "avg_npc_1360_1#avg_npc_1360_1$1",
        url: `${ASSET}/avg_npc_1360_1/avg_npc_1360_1%241.png`,
      },
    ]);
  });

  it("叠图角色每个表情组一个立绘，组内表情收进 faces", () => {
    const bodies = buildBodies(["avg_npc_1779"], links);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toMatchObject({
      kind: "overlay",
      id: "avg_npc_1779_1$1",
      baseUrl: `${ASSET}/avg_npc_1779_1/avg_npc_1779_1%241.png`,
      faceRect: { x: 531, y: 7, w: 144, h: 213 },
      faces: [
        { name: "1$1", url: `${ASSET}/avg_npc_1779_1/1%241.png` },
        { name: "2$1", url: `${ASSET}/avg_npc_1779_1/2%241.png` },
      ],
    });
    expect(bodies[1]).toMatchObject({
      id: "avg_npc_1779_1$2",
      faces: [{ name: "1$2" }, { name: "2$2" }],
    });
  });

  it("两个 key 对到同一个 base 时只列一次", () => {
    expect(buildBodies(["avg_npc_1618", "avg_npc_1618_1"], links)).toHaveLength(
      1,
    );
  });

  it("nottitleregexp 照旧按 wiki 文件名排除（现网 腐败骑士 / 凋零骑士 / 坎诺特 的写法）", () => {
    const ids = (keys: string, exclude: string) =>
      buildBodies(parseKeys(keys), links, parseExclude(exclude)).map(
        (body) => body.id,
      );
    expect(ids("avg_npc_102", "Avg_avg_npc_102_2.png")).toEqual([
      "avg_npc_102#avg_npc_102",
    ]);
    expect(ids("avg_npc_102", "Avg_avg_npc_102.png")).toEqual([
      "avg_npc_102_2#avg_npc_102_2",
    ]);
    // 1- 去掉了叠图的全部表情，只剩独立全身图
    expect(ids("avg npc 208", "1-")).toEqual(["avg_npc_208#avg_npc_208"]);
    // 文件名按资源路径的原始大小写拼，资源地址也保留大小写
    expect(ids("npc_2001_Aya", "Avg_npc_2001_Aya_rock.png")).toEqual([
      "npc_2001_aya_1#npc_2001_Aya_1",
    ]);
    expect(buildBodies(["npc_2001_Aya"], links)[0]).toMatchObject({
      url: `${ASSET}/npc_2001_Aya_1/npc_2001_Aya_1.png`,
    });
  });

  it("写错的正则当没写", () => {
    expect(parseExclude("[")).toBeNull();
    expect(parseExclude("  ")).toBeNull();
    expect(parseExclude("Avg avg npc 102.png")?.source).toBe(
      "Avg_avg_npc_102.png",
    );
  });
});

describe("fileBodies", () => {
  it("手写的 wiki 文件按文件名拼 media 地址，首字母大写、空格换下划线", () => {
    expect(fileBodies("Npc doctor.png, 文件:npc_doctor.png,")).toEqual([
      {
        kind: "single",
        id: "File:Npc_doctor.png",
        url: "https://media.prts.wiki/a/aa/Npc_doctor.png",
      },
      {
        kind: "single",
        id: "File:Npc_doctor.png",
        url: "https://media.prts.wiki/a/aa/Npc_doctor.png",
      },
    ]);
    expect(fileBodies("")).toEqual([]);
  });
});

describe("observePortraits", () => {
  class FakeObserver {
    static instances: FakeObserver[] = [];
    observed: Element[] = [];
    constructor(public callback: IntersectionObserverCallback) {
      FakeObserver.instances.push(this);
    }
    observe(element: Element) {
      this.observed.push(element);
    }
    unobserve(element: Element) {
      this.observed = this.observed.filter((item) => item !== element);
    }
    fire(element: Element, isIntersecting: boolean) {
      const entry: Pick<
        IntersectionObserverEntry,
        "target" | "isIntersecting"
      > = { target: element, isIntersecting };
      this.callback(
        [entry as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    }
  }

  afterEach(() => {
    FakeObserver.instances = [];
    vi.unstubAllGlobals();
  });

  it("相交时才挂载，同一个占位只处理一次", () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    const root = document.createElement("div");
    root.innerHTML =
      '<div class="npc-portrait" data-keys="avg_npc_048"></div><div class="npc-portrait"></div>';
    const mount = vi.fn();
    const seen = new WeakSet<Element>();

    observePortraits(root, mount, seen);
    observePortraits(root, mount, seen);

    expect(FakeObserver.instances).toHaveLength(1);
    const [observer] = FakeObserver.instances;
    // 没有 data-keys 的不算
    expect(observer.observed).toHaveLength(1);

    const [element] = observer.observed;
    observer.fire(element, false);
    expect(mount).not.toHaveBeenCalled();
    observer.fire(element, true);
    expect(mount).toHaveBeenCalledWith(element);
    expect(observer.observed).toHaveLength(0);
  });
});

describe("NpcPortrait", () => {
  let app: App | null = null;

  afterEach(() => {
    app?.unmount();
    app = null;
    vi.unstubAllGlobals();
  });

  async function render(props: Record<string, string>) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(RAW))),
    );
    const host = document.createElement("div");
    app = createApp(NpcPortrait, props);
    app.mount(host);
    // fetch → json → 渲染
    for (let i = 0; i < 5; i++) await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
    return host;
  }

  it("多个立绘给出切换，叠图角色按底图尺寸叠脸、可切表情", async () => {
    const host = await render({
      keys: "avg_npc_048,avg_npc_1779",
      name: "梵里妮",
    });

    const tabs = host.querySelectorAll('[aria-label="立绘"] button');
    expect([...tabs].map((tab) => tab.textContent?.trim())).toEqual([
      "立绘1",
      "立绘2",
      "立绘3",
    ]);
    expect(host.querySelector("img")?.getAttribute("src")).toBe(
      `${ASSET}/avg_npc_048/avg_npc_048.png`,
    );
    expect(host.querySelector("img")?.getAttribute("alt")).toBe("梵里妮");

    (tabs[1] as HTMLButtonElement).click();
    await nextTick();
    const base = host.querySelector<HTMLImageElement>(
      ".npc-portrait-viewer__composite img",
    )!;
    expect(base.getAttribute("src")).toBe(
      `${ASSET}/avg_npc_1779_1/avg_npc_1779_1%241.png`,
    );
    // 底图加载完才知道尺寸，之前不画脸
    expect(host.querySelector(".npc-portrait-viewer__face")).toBeNull();
    Object.defineProperty(base, "naturalWidth", { value: 1196 });
    Object.defineProperty(base, "naturalHeight", { value: 1196 });
    base.dispatchEvent(new Event("load"));
    await nextTick();

    const face = host.querySelector<HTMLImageElement>(
      ".npc-portrait-viewer__face",
    )!;
    expect(face.getAttribute("src")).toBe(`${ASSET}/avg_npc_1779_1/1%241.png`);
    expect(face.style.left).toBe(`${(531 / 1196) * 100}%`);
    expect(face.style.width).toBe(`${(144 / 1196) * 100}%`);

    const faces = host.querySelectorAll('[aria-label="表情"] button');
    expect(faces).toHaveLength(2);
    (faces[1] as HTMLButtonElement).click();
    await nextTick();
    expect(
      host.querySelector(".npc-portrait-viewer__face")?.getAttribute("src"),
    ).toBe(`${ASSET}/avg_npc_1779_1/2%241.png`);
  });

  it("手写的 wiki 文件排在 torappu 立绘后面（博士）", async () => {
    const host = await render({
      keys: "doctor,avg_npc_048",
      files: "Npc doctor.png",
    });
    const tabs = host.querySelectorAll<HTMLButtonElement>(
      '[aria-label="立绘"] button',
    );
    expect(tabs).toHaveLength(2);
    tabs[1].click();
    await nextTick();
    expect(host.querySelector("img")?.getAttribute("src")).toBe(
      "https://media.prts.wiki/a/aa/Npc_doctor.png",
    );
  });

  it("主图加载失败时给出重试，重试会重建 <img>", async () => {
    const host = await render({ keys: "avg_npc_048" });
    const image = host.querySelector("img")!;
    image.dispatchEvent(new Event("error"));
    await nextTick();
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("立绘加载失败");

    host
      .querySelector<HTMLButtonElement>(".npc-portrait-viewer__stage button")!
      .click();
    await nextTick();
    const retried = host.querySelector("img");
    expect(retried).not.toBeNull();
    expect(retried).not.toBe(image);
    expect(retried?.getAttribute("src")).toBe(
      `${ASSET}/avg_npc_048/avg_npc_048.png`,
    );
  });

  it("torappu 里没有的 key 显示暂无立绘", async () => {
    const host = await render({ keys: "doctor" });
    expect(host.textContent).toContain("该角色暂无剧情立绘");
  });
});

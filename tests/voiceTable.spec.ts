import { describe, expect, it } from "vitest";

import { SkinVoiceType } from "../src/widgets/VoiceTable/consts";
import {
  buildDownloads,
  buildLanguages,
  buildSources,
  buildText,
  htmlToText,
  langBadge,
  langCode,
  readCvNames,
  unlockText,
  voiceCode,
} from "../src/widgets/VoiceTable/voice";

import type { VoiceDataItem } from "../src/widgets/VoiceTable/types";

// 数据取自现网 陈 / 罗小黑 / 凯尔希 的 {{VoiceTable}} 参数与 CharinfoV2 的 char_info.cv
const CHEN_BASE = [
  { lang: "日语", path: "voice/char_010_chen" },
  { lang: "中文-普通话", path: "voice_cn/char_010_chen" },
  { lang: "中文-方言", path: "voice_custom/char_010_chen_cn_topolect" },
  { lang: "韩语", path: "voice_kr/char_010_chen" },
  { lang: "英语", path: "voice_en/char_010_chen" },
];
const CHEN_CV = {
  cv: {
    日文: { name: "石上静香" },
    "中文-普通话": { name: "虫虫" },
    "中文-方言": { name: "包少爷" },
    英文: { name: "Amy Lennox" },
    韩文: { name: "郑侑廷" },
    意大利语: { name: "" },
    联动: { name: "" },
  },
};

const item = (partial: Partial<VoiceDataItem>): VoiceDataItem => ({
  directLinks: {},
  detail: {},
  ...partial,
});

describe("语种名归一", () => {
  it("文本差分、音频差分与 char_info.cv 三套叫法归到同一个代码", () => {
    expect(langCode("中文")).toBe("cn");
    expect(langCode("中文-普通话")).toBe("cn");
    expect(langCode("日文")).toBe("jp");
    expect(langCode("日语")).toBe("jp");
    expect(langCode("英文")).toBe("en");
    expect(langCode("英语")).toBe("en");
    expect(langCode("韩文")).toBe("kr");
    expect(langCode("韩语")).toBe("kr");
    expect(langCode("中文-方言")).toBe("yue");
    expect(langCode("意大利文")).toBe("it");
    expect(langCode("意大利语")).toBe("it");
    expect(langCode("法语")).toBe("fr");
    // 繁体前缀与差分后缀不影响代码；认不出的名字原样返回
    expect(langCode("繁体中文-方言")).toBe("yue");
    expect(langCode("中文-普通话(残余)")).toBe("cn");
    expect(langCode("日语（猫形态）")).toBe("jp");
    expect(langCode("联动")).toBe("联动");
  });

  it("徽标同设计稿：CN / 粤 / JP，差分后缀另标", () => {
    expect(langBadge("中文-普通话")).toBe("CN");
    expect(langBadge("中文-方言")).toBe("粤");
    expect(langBadge("日语")).toBe("JP");
    expect(langBadge("日语(猫形态)")).toBe("JP(猫形态)");
    expect(langBadge("中文-普通话(残余)")).toBe("CN(残余)");
    expect(langBadge("联动")).toBe("联动");
  });

  it("char_info.cv 按语种代码取 CV 名，空名不收", () => {
    expect(readCvNames(CHEN_CV)).toEqual({
      jp: "石上静香",
      cn: "虫虫",
      yue: "包少爷",
      en: "Amy Lennox",
      kr: "郑侑廷",
    });
    expect(readCvNames(undefined)).toEqual({});
  });
});

describe("语种芯片", () => {
  it("按 |路径= 的顺序列语种，value 是语种名，配徽标与 CV", () => {
    const languages = buildLanguages(CHEN_BASE, readCvNames(CHEN_CV));
    expect(languages).toEqual([
      { value: "日语", label: "日语", badge: "JP", cv: "石上静香" },
      { value: "中文-普通话", label: "中文-普通话", badge: "CN", cv: "虫虫" },
      { value: "中文-方言", label: "中文-方言", badge: "粤", cv: "包少爷" },
      { value: "韩语", label: "韩语", badge: "KR", cv: "郑侑廷" },
      { value: "英语", label: "英语", badge: "EN", cv: "Amy Lennox" },
    ]);
  });

  it("差分语种各自一枚芯片（罗小黑猫形态 / 凯尔希残余），坏掉的项跳过", () => {
    const languages = buildLanguages(
      [
        { lang: "日语(猫形态)", path: "voice/char_4067_lolxh" },
        { lang: "中文-普通话(猫形态)", path: "voice_cn/char_4067_lolxh" },
        { lang: "中文-普通话", path: "voice_cn/char_4067_lolxh__1" },
        { lang: "中文-普通话(残余)", path: "voice_cn/char_003_kalts_boc__6" },
        { lang: "{{{路径}}}", path: undefined as unknown as string },
      ],
      { cn: "山新", jp: "花泽香菜" },
    );
    expect(languages.map((l) => [l.value, l.badge, l.cv])).toEqual([
      ["日语(猫形态)", "JP(猫形态)", "花泽香菜"],
      ["中文-普通话(猫形态)", "CN(猫形态)", "山新"],
      ["中文-普通话", "CN", "山新"],
      ["中文-普通话(残余)", "CN(残余)", "山新"],
    ]);
  });
});

describe("每条语音的台词与音频", () => {
  it("选中的几种语言一种一行，HTML 只留文字，空台词跳过", () => {
    const voice = item({
      detail: {
        中文: "博士，现在起由我担任你的护卫。",
        英文: "I <i>am</i> quite skilled at<br>teamwork.",
        繁体中文: "",
      },
    });
    expect(buildText(voice, ["中文"])).toBe("博士，现在起由我担任你的护卫。");
    expect(buildText(voice, ["中文", "繁体中文", "英文"])).toBe(
      "博士，现在起由我担任你的护卫。\nI am quite skilled at teamwork.",
    );
    expect(buildText(voice, ["日文"])).toBe("");
    expect(htmlToText("a&amp;b <span>c</span>")).toBe("a&b c");
  });

  it("音频走 torappu 的 mp3，键是语种名，直链优先", () => {
    const src = buildSources(
      item({
        fileName: "cn_001.wav",
        placeType: "HOME_PLACE",
        directLinks: { 日语: "https://example.com/jp/001.mp3" },
      }),
      CHEN_BASE,
    );
    expect(src).toEqual({
      日语: "https://example.com/jp/001.mp3",
      "中文-普通话":
        "https://torappu.prts.wiki/assets/audio/voice_cn/char_010_chen/cn_001.mp3",
      "中文-方言":
        "https://torappu.prts.wiki/assets/audio/voice_custom/char_010_chen_cn_topolect/cn_001.mp3",
      韩语: "https://torappu.prts.wiki/assets/audio/voice_kr/char_010_chen/cn_001.mp3",
      英语: "https://torappu.prts.wiki/assets/audio/voice_en/char_010_chen/cn_001.mp3",
    });
    // 没有文件名也没有直链：没有音频，播放钮禁用
    expect(buildSources(item({}), CHEN_BASE)).toEqual({});
  });

  it("下载给 wav 原文件，?filename= 用标题；直链原样", () => {
    const downloads = buildDownloads(
      item({
        title: "任命助理",
        fileName: "cn_001.wav",
        placeType: "HOME_PLACE",
        directLinks: { 日语: "https://example.com/jp/001.mp3" },
      }),
      CHEN_BASE.slice(0, 2),
    );
    expect(downloads).toEqual({
      日语: "https://example.com/jp/001.mp3",
      "中文-普通话":
        "https://torappu.prts.wiki/assets/audio/voice_cn/char_010_chen/cn_001.wav?filename=%E4%BB%BB%E5%91%BD%E5%8A%A9%E7%90%86.wav",
    });
    expect(buildDownloads(item({}), CHEN_BASE)).toEqual({});
  });

  it("罗小黑覆盖路径：战斗内语音（不在 ILLUST_SHOW_TYPES）换成人形态目录", () => {
    const base = [{ lang: "中文-普通话", path: "voice_cn/char_4067_lolxh__1" }];
    const override = [
      {
        lang: "中文-普通话",
        mode: SkinVoiceType.ILLUST,
        path: "voice_cn/char_4067_lolxh",
      },
    ];
    expect(
      buildSources(
        item({ fileName: "cn_025.wav", placeType: "BATTLE_FACE_ENEMY" }),
        base,
        override,
      )["中文-普通话"],
    ).toBe(
      "https://torappu.prts.wiki/assets/audio/voice_cn/char_4067_lolxh/cn_025.mp3",
    );
    expect(
      buildSources(
        item({ fileName: "cn_001.wav", placeType: "HOME_PLACE" }),
        base,
        override,
      )["中文-普通话"],
    ).toBe(
      "https://torappu.prts.wiki/assets/audio/voice_cn/char_4067_lolxh__1/cn_001.mp3",
    );
  });

  it("编号与灰标", () => {
    expect(voiceCode("cn_001.wav")).toBe("CN_001");
    expect(voiceCode("cn 001.wav")).toBe("CN_001");
    expect(voiceCode(undefined)).toBeUndefined();
    expect(
      unlockText(item({ title: "晋升后交谈1", cond: "提升至精英阶段1以查看" })),
    ).toBe("提升至精英阶段1以查看");
    expect(unlockText(item({ title: "生日", cond: "" }))).toBe(
      "游戏内仅在每年博士生日显示",
    );
    expect(unlockText(item({ title: "交谈1", cond: "" }))).toBeUndefined();
  });
});

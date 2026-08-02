import { afterEach, describe, expect, it } from "vitest";

import {
  expandStoryText,
  getStoryNickname,
} from "../src/widgets/StoryPlayer/engine/textVariables";

afterEach(() => {
  window.mw = undefined;
});

describe("story text variables", () => {
  it("uses the MediaWiki username and removes Dr. case-insensitively", () => {
    window.mw = { config: { get: () => "Dr.Kal'tsit" } };

    expect(getStoryNickname()).toBe("Kal'tsit");
    expect(expandStoryText("欢迎，{@nickname}。{@nickname}！")).toBe(
      "欢迎，Kal'tsit。Kal'tsit！",
    );
    expect(expandStoryText("欢迎，{@Nickname}！")).toBe("欢迎，Kal'tsit！");
  });

  it("falls back to 博士 for anonymous users", () => {
    window.mw = { config: { get: () => null } };

    expect(getStoryNickname()).toBe("博士");
    expect(expandStoryText("Dr.{@nickname}。")).toBe("Dr.博士。");
  });

  it("resolves story variables case-insensitively and removes unknown ones", () => {
    expect(expandStoryText("Ave{@NBS}Mujica")).toBe("Ave\u00A0Mujica");
    expect(expandStoryText("{@answer}/{@missing}", { answer: 42 })).toBe("42/");
  });
});

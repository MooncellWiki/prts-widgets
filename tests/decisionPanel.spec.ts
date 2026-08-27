import { Container, type FederatedPointerEvent, type Text } from "pixi.js";
import { describe, expect, it } from "vitest";

import { DecisionPanel } from "../src/widgets/StoryPlayer/engine/rendering/panels/DecisionPanel";

describe("DecisionPanel", () => {
  it("resolves a pointer selection before clearing the panel", async () => {
    const layer = new Container();
    const panel = new DecisionPanel(layer);
    const selection = panel.show(
      ["阿米娅，我站在你这边。", "......", "凯尔希，合作愉快。"],
      [1, 2, 3],
    );

    const root = layer.children[0] as Container;
    const firstOption = root.children[1] as Container;
    firstOption.emit("pointertap", {} as FederatedPointerEvent);

    await expect(selection).resolves.toEqual({ optionIndex: 0, value: 1 });
    expect(layer.children).toHaveLength(0);
  });

  it("renders ampersand options disabled without settling on tap", async () => {
    const layer = new Container();
    const panel = new DecisionPanel(layer);
    // 原生 _SetupOptionText：`&` 前缀项剥前缀 + interactable=false。
    // 前缀由 log/semantics.parseDecision 剥掉，面板只收 disabled 标记。
    const selection = panel.show(["可选", "不可选"], [1, 2], [false, true]);

    const root = layer.children[0] as Container;
    const disabledOption = root.children[2] as Container;
    const disabledLabel = disabledOption.children[1] as Text;
    expect(disabledLabel.text).toBe("不可选");

    // 禁用按钮不注册指针事件，tap 不结算
    disabledOption.emit("pointertap", {} as FederatedPointerEvent);
    await Promise.resolve();

    const enabledOption = root.children[1] as Container;
    enabledOption.emit("pointertap", {} as FederatedPointerEvent);
    await expect(selection).resolves.toEqual({ optionIndex: 0, value: 1 });
  });
});

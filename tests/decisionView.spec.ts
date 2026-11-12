import { Container, type FederatedPointerEvent, type Text } from "pixi.js";
import { describe, expect, it, vi } from "vitest";

import { DecisionView } from "../src/widgets/StoryPlayer/engine/rendering/panels/DecisionView";

describe("DecisionView", () => {
  it("reports the tapped option immediately and leaves the panel open until cleared", () => {
    const layer = new Container();
    const panel = new DecisionView(layer);
    const select = vi.fn();
    panel.show(
      ["阿米娅，我站在你这边。", "......", "凯尔希，合作愉快。"],
      [1, 2, 3],
      [],
      select,
    );

    const root = layer.children[0] as Container;
    const firstOption = root.children[1] as Container;
    firstOption.emit("pointertap", {} as FederatedPointerEvent);

    expect(select).toHaveBeenCalledExactlyOnceWith({
      optionIndex: 0,
      value: 1,
    });
    expect(layer.children).toHaveLength(1);
    panel.clear();
    expect(layer.children).toHaveLength(0);
  });

  it("renders ampersand options disabled without selecting on tap", () => {
    const layer = new Container();
    const panel = new DecisionView(layer);
    // 原生 _SetupOptionText：`&` 前缀项剥前缀 + interactable=false。
    // 前缀由 log/semantics.parseDecision 剥掉，面板只收 disabled 标记。
    const select = vi.fn();
    panel.show(["可选", "不可选"], [1, 2], [false, true], select);

    const root = layer.children[0] as Container;
    const disabledOption = root.children[2] as Container;
    const disabledLabel = disabledOption.children[1] as Text;
    expect(disabledLabel.text).toBe("不可选");

    // 禁用按钮不注册指针事件，tap 不结算
    disabledOption.emit("pointertap", {} as FederatedPointerEvent);
    expect(select).not.toHaveBeenCalled();

    const enabledOption = root.children[1] as Container;
    enabledOption.emit("pointertap", {} as FederatedPointerEvent);
    expect(select).toHaveBeenCalledExactlyOnceWith({
      optionIndex: 0,
      value: 1,
    });
  });
});

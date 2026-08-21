import { Container } from "pixi.js";
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
    firstOption.emit("pointertap");

    await expect(selection).resolves.toEqual({ optionIndex: 0, value: 1 });
    expect(layer.children).toHaveLength(0);
  });
});

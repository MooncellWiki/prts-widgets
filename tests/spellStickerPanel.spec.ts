import { Container } from "pixi.js";
import { describe, expect, it, vi } from "vitest";

import { SpellStickerPanel } from "../src/widgets/StoryPlayer/engine/rendering/panels/SpellStickerPanel";

import type { Text } from "pixi.js";

describe("SpellStickerPanel", () => {
  it("renders the two native text slots in centered coordinates and hides without removing", () => {
    const layer = new Container();
    const panel = new SpellStickerPanel(layer);
    panel.show({
      alpha: 2,
      angle: 5,
      content: "<p=1>main</><p=2>sub</>",
      id: "spell1",
      style: "SAMI",
      x: -130,
      xScale: 1.3,
      y: 20,
      yScale: 1.2,
    });

    const root = layer.children[0] as Container;
    expect(root.position.x).toBe(510);
    expect(root.position.y).toBe(340);
    expect(root.scale.x).toBe(1.3);
    expect(root.scale.y).toBe(1.2);
    expect(root.angle).toBe(5);
    expect(root.alpha).toBe(1);
    expect((root.getChildByLabel("text_spell_main") as Text).text).toBe("main");
    expect((root.getChildByLabel("text_spell_sub") as Text).text).toBe("sub");

    panel.hide("spell1");
    expect(root.visible).toBe(false);
    expect(layer.children).toHaveLength(1);

    panel.show({
      alpha: 0.5,
      content: "<p=1>again</>",
      id: "spell1",
      style: "sami",
    });
    expect(layer.children[0]).toBe(root);
    expect(root.visible).toBe(true);
  });

  it("keeps a style-switched view orphaned until clear and rejects unknown styles", () => {
    const layer = new Container();
    const warning = vi.fn();
    const panel = new SpellStickerPanel(layer, warning);
    panel.show({ alpha: 1, content: "", id: "spell1", style: "sami" });
    panel.show({ alpha: 1, content: "", id: "spell1", style: "fire" });
    expect(layer.children).toHaveLength(2);

    panel.show({ alpha: 1, content: "", id: "bad", style: "unknown" });
    expect(layer.children).toHaveLength(2);
    expect(warning).toHaveBeenCalledWith("missing spellsticker style: unknown");

    panel.clear();
    expect(layer.children).toHaveLength(0);
  });
});

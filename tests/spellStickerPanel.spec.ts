import { Container, type Text } from "pixi.js";
import { describe, expect, it, vi } from "vitest";

import { SpellStickerPanel } from "../src/widgets/StoryPlayer/engine/rendering/panels/SpellStickerPanel";

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

    // Intentional deviation from native _ClearAll, which cannot see orphans
    // and would leave them visible; see the comment in clear().
    panel.clear();
    expect(layer.children).toHaveLength(0);
  });

  it("keeps the previous alpha when the alpha param is missing", () => {
    const layer = new Container();
    const panel = new SpellStickerPanel(layer);

    // A fresh view starts at PIXI's default alpha 1 (native: fresh
    // CanvasGroup) when the first show has no alpha param.
    panel.show({ content: "<p=1>a</>", id: "s", style: "sami" });
    const root = layer.children[0] as Container;
    expect(root.alpha).toBe(1);

    // Native _ShowSticker only writes alpha via TryGetParam, so a reused view
    // keeps its last value instead of snapping back to 1.
    panel.show({ alpha: 0.25, content: "<p=1>a</>", id: "s", style: "sami" });
    expect(root.alpha).toBe(0.25);
    panel.show({ content: "<p=1>a</>", id: "s", style: "sami" });
    expect(root.alpha).toBe(0.25);
  });

  it("keeps the previous text for segments missing from the new content", () => {
    const layer = new Container();
    const panel = new SpellStickerPanel(layer);
    panel.show({
      alpha: 1,
      content: "<p=1>main</><p=2>sub</>",
      id: "s",
      style: "sami",
    });
    const root = layer.children[0] as Container;

    // Native dict.ContainsKey(i) gating: <p=2> only updates the second slot.
    panel.show({
      alpha: 1,
      content: "<p=2>new sub</>",
      id: "s",
      style: "sami",
    });
    expect((root.getChildByLabel("text_spell_main") as Text).text).toBe("main");
    expect((root.getChildByLabel("text_spell_sub") as Text).text).toBe(
      "new sub",
    );

    // No <p=N> tags at all: dict is empty, both slots keep their text.
    panel.show({ alpha: 1, content: "plain", id: "s", style: "sami" });
    expect((root.getChildByLabel("text_spell_main") as Text).text).toBe("main");
    expect((root.getChildByLabel("text_spell_sub") as Text).text).toBe(
      "new sub",
    );
  });
});

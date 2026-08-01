import { Container, Text, TextStyle } from "pixi.js";

import { DIALOG_FONT_FAMILY } from "../../font";
import { STORY_HEIGHT, STORY_WIDTH } from "../../types";

import type { SpellStickerInput } from "../../types";
import type { Container as ContainerType } from "pixi.js";

interface SpellStickerView {
  root: Container;
  style: string;
}

function splitContent(content: string): [string, string] {
  const parts = new Map<number, string>();
  const pattern = /<p=(\d+)>([\s\S]*?)<\/>/gi;
  for (const match of content.matchAll(pattern))
    parts.set(Number(match[1]), match[2] ?? "");
  return [parts.get(1) ?? "", parts.get(2) ?? ""];
}

export class SpellStickerPanel {
  private readonly orphans = new Set<Container>();
  private readonly views = new Map<string, SpellStickerView>();

  constructor(
    private readonly layer: ContainerType,
    private readonly warn?: (detail: string) => void,
  ) {}

  show(input: SpellStickerInput): void {
    const style = input.style.toLowerCase();
    if (style !== "sami" && style !== "fire") {
      this.warn?.(`missing spellsticker style: ${input.style}`);
      return;
    }

    let view = this.views.get(input.id);
    if (view && view.style !== style) {
      this.views.delete(input.id);
      this.orphans.add(view.root);
      view = undefined;
    }
    if (!view) {
      view = this.createView(style);
      this.views.set(input.id, view);
    }

    const [mainText, subText] = splitContent(input.content);
    const main = view.root.getChildByLabel("text_spell_main") as Text;
    const sub = view.root.getChildByLabel("text_spell_sub") as Text;
    main.text = mainText;
    sub.text = subText;
    view.root.visible = true;
    view.root.alpha = Math.max(0, Math.min(1, input.alpha));
    if (input.x !== undefined) view.root.x = STORY_WIDTH / 2 + input.x;
    if (input.y !== undefined) view.root.y = STORY_HEIGHT / 2 - input.y;
    if (input.xScale !== undefined) view.root.scale.x = input.xScale;
    if (input.yScale !== undefined) view.root.scale.y = input.yScale;
    if (input.angle !== undefined) view.root.angle = input.angle;
    this.warn?.(`unsupported_visual spellsticker:${style}`);
  }

  hide(id: string): void {
    const view = this.views.get(id);
    if (view) view.root.visible = false;
  }

  clear(): void {
    for (const view of this.views.values()) this.destroyRoot(view.root);
    for (const root of this.orphans) this.destroyRoot(root);
    this.views.clear();
    this.orphans.clear();
  }

  destroy(): void {
    this.clear();
  }

  private createView(style: string): SpellStickerView {
    const root = new Container();
    root.position.set(STORY_WIDTH / 2, STORY_HEIGHT / 2);
    const sami = style === "sami";
    const main = new Text({
      label: "text_spell_main",
      style: new TextStyle({
        fill: "#ffffff",
        fontFamily: [DIALOG_FONT_FAMILY, "sans-serif"],
        fontSize: sami ? 32 : 24,
        fontStyle: "italic",
        fontWeight: "bold",
      }),
      text: "",
    });
    main.scale.set(sami ? 0.9 : 1, sami ? 1.1 : 1);
    main.position.set(36, -52);
    const sub = new Text({
      label: "text_spell_sub",
      style: new TextStyle({
        fill: "rgba(255,255,255,0.5608)",
        fontFamily: [DIALOG_FONT_FAMILY, "sans-serif"],
        fontSize: sami ? 16 : 14,
        fontStyle: sami ? "italic" : "normal",
        fontWeight: sami ? "bold" : "normal",
      }),
      text: "",
    });
    sub.scale.set(sami ? 0.9 : 0.88, sami ? 1.2 : 1);
    sub.position.set(sami ? -147.5 : -189.4, 19.5);
    root.addChild(main, sub);
    this.layer.addChild(root);
    return { root, style };
  }

  private destroyRoot(root: Container): void {
    root.removeFromParent();
    root.destroy({ children: true });
  }
}

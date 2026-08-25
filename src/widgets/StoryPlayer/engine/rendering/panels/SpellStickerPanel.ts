import {
  Container,
  Text,
  TextStyle,
  type Container as ContainerType,
} from "pixi.js";

import { DIALOG_FONT_FAMILY } from "../../font";
import { STORY_HEIGHT, STORY_WIDTH, type SpellStickerInput } from "../../types";

/**
 * Serialized `m_InputText` of each style prefab's Texts
 * (`avg/spellsticker/sticker_<style>_fx_spell`), as [main, sub]. Native
 * `_ShowSticker` inlines `_ApplyFallbackInputText`, which switches TextId-less
 * Texts to display this input text before the `<p=N>` writes, so a fresh
 * sticker shows it in any slot its first content leaves out.
 */
const PREFAB_INPUT_TEXT = {
  fire: ["夜雪无痕，噤声。", "Ночной снег без следа, молчи."],
  sami: ["不是灾异，而是目光。", "er eigi ógæfa, heldr augna máttur."],
} as const;

type SpellStickerStyle = keyof typeof PREFAB_INPUT_TEXT;

interface SpellStickerView {
  root: Container;
  style: SpellStickerStyle;
}

/**
 * `<p=N>` segments keyed by their 1-based N. Native `FormatUtil.
 * _HandleAvgSplitContentTextTags` stores `dict[N-1]` and `_ShowSticker` walks
 * `GetComponentsInChildren<Text>(true)` by 0-based index; both prefabs yield
 * exactly [text_spell_main, text_spell_sub], so N=1/2 map to those slots.
 */
function splitContent(content: string): Map<number, string> {
  const parts = new Map<number, string>();
  const pattern = /<p=(\d+)>([\s\S]*?)<\/>/gi;
  for (const match of content.matchAll(pattern))
    parts.set(Number(match[1]), match[2] ?? "");
  return parts;
}

/**
 * Port scope: `Torappu.AVG.AVGSpellStickerPanel._ExecuteSpellSticker` /
 * `_ShowSticker` / `_HideSticker` / `_GetOrCreateSticker` state transitions.
 * The two supported styles are lightweight PIXI approximations of their
 * prefab visuals; native entrances replay a Legacy `Animation` clip per show,
 * which is a declared omission here (no animator/clip ports).
 */
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
      // Native `_GetOrCreateSticker`: same id with a different style removes
      // the dict entry without destroying the GameObject, leaving a visible
      // orphan that hide/clear-by-id can no longer address.
      this.views.delete(input.id);
      this.orphans.add(view.root);
      view = undefined;
    }
    if (!view) {
      view = this.createView(style);
      this.views.set(input.id, view);
    }

    // Native `_ShowSticker` only overwrites child Texts whose index exists in
    // the split dict (`dict.ContainsKey(i)`), so a segment missing from the
    // new content keeps the previous text — same optional-write philosophy as
    // the transform fields below.
    const parts = splitContent(input.content);
    const main = view.root.getChildByLabel("text_spell_main") as Text;
    const sub = view.root.getChildByLabel("text_spell_sub") as Text;
    const mainText = parts.get(1);
    const subText = parts.get(2);
    if (mainText !== undefined) main.text = mainText;
    if (subText !== undefined) sub.text = subText;
    view.root.visible = true;
    // Native inlines `_ApplyAlpha`: alpha is written (clamped to 0..1) only
    // when the param exists; a reused sticker keeps its last alpha. New views
    // default to PIXI's alpha 1, matching a fresh native CanvasGroup.
    if (input.alpha !== undefined)
      view.root.alpha = Math.max(0, Math.min(1, input.alpha));
    if (input.x !== undefined) view.root.x = STORY_WIDTH / 2 + input.x;
    // Native `_ApplyTransform` writes anchoredPosition = (x, -y) in Unity's
    // y-up space, so a positive `y` param renders BELOW center on device
    // (fire stickers' y=283 sits at screenY≈643). Mapping into PIXI's y-down
    // space is therefore `STORY_HEIGHT / 2 + y`, not a mirrored minus.
    if (input.y !== undefined) view.root.y = STORY_HEIGHT / 2 + input.y;
    if (input.xScale !== undefined) view.root.scale.x = input.xScale;
    if (input.yScale !== undefined) view.root.scale.y = input.yScale;
    // `_ApplyTransform` writes localEulerAngles.z = angle. Unity's z is
    // counter-clockwise on screen while PIXI's `angle` is clockwise, so the
    // same y-up/y-down flip as `y` applies here.
    if (input.angle !== undefined) view.root.angle = -input.angle;
  }

  hide(id: string): void {
    const view = this.views.get(id);
    if (view) view.root.visible = false;
  }

  /**
   * Native port: `Torappu.AVG.AVGSpellStickerPanel._ClearAll` (2.7.61 VA
   * 0x183e5d770) destroys only the values left in `m_spellStickerDict`, then
   * clears both dicts. Orphans created by a style switch were already removed
   * from that dict, so in the native client they stay visible after
   * `spellstickerclear` and only disappear when the panel/scene GameObject is
   * destroyed (a known native leak). Intentional deviation: this port destroys
   * orphans here as well, so clear actually clears the screen.
   */
  clear(): void {
    // Intentional deviation from native `_ClearAll` (also used for OnReset /
    // ShouldResetOnSkip): native only scans the id→view dict, so a
    // style-switched orphan survives `spellstickerclear` and skip and stays
    // visible for the rest of the story, until the panel itself is destroyed.
    // We destroy orphans too so such a leftover cannot linger over later
    // scenes. No corpus sample switches styles for the same id, so the
    // divergent path is unreachable in production data.
    for (const view of this.views.values()) this.destroyRoot(view.root);
    for (const root of this.orphans) this.destroyRoot(root);
    this.views.clear();
    this.orphans.clear();
  }

  destroy(): void {
    this.clear();
  }

  private createView(style: SpellStickerStyle): SpellStickerView {
    const root = new Container();
    root.position.set(STORY_WIDTH / 2, STORY_HEIGHT / 2);
    const sami = style === "sami";
    const [mainInputText, subInputText] = PREFAB_INPUT_TEXT[style];
    const main = new Text({
      label: "text_spell_main",
      style: new TextStyle({
        fill: "#ffffff",
        fontFamily: [DIALOG_FONT_FAMILY, "sans-serif"],
        fontSize: sami ? 32 : 24,
        fontStyle: "italic",
        fontWeight: "bold",
      }),
      text: mainInputText,
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
      text: subInputText,
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

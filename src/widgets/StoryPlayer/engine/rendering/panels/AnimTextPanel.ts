import {
  Assets,
  Container,
  Sprite,
  Text,
  TextStyle,
  type Texture,
  type TextStyleOptions,
} from "pixi.js";

import { STAMP_ASSETS } from "../../../assets";
import {
  ANIMTEXT_MAIN_FONT_FAMILY,
  ANIMTEXT_MAIN_FONT_WEIGHT,
  DIALOG_FONT_FAMILY,
  DIALOG_FONT_WEIGHT,
} from "../../font";
import { STORY_HEIGHT, STORY_WIDTH, type AnimTextInput } from "../../types";

const ANIMATION_MS = 5000;

interface StampView {
  root: Container;
  sessionId: number;
}

function lerpKeyframes(
  time: number,
  frames: ReadonlyArray<readonly [number, number]>,
): number {
  if (time <= frames[0]![0]) return frames[0]![1];
  for (let index = 1; index < frames.length; index += 1) {
    const next = frames[index]!;
    const previous = frames[index - 1]!;
    if (time <= next[0]) {
      const progress = (time - previous[0]) / (next[0] - previous[0]);
      return previous[1] + (next[1] - previous[1]) * progress;
    }
  }
  return frames.at(-1)![1];
}

const SPLIT_TAG_PREFIX = "p=";

/**
 * Native provenance: `Torappu.SharedFormatUtil.LightStringStream`. Indexes
 * UTF-16 code units, like the C# string it wraps.
 */
class LightStringStream {
  head = 0;

  constructor(private readonly source: string) {}

  get isEnd(): boolean {
    return this.head >= this.source.length;
  }

  read(): string {
    return this.source[this.head++]!;
  }

  range(start: number, end: number): string {
    return this.source.slice(start, end);
  }
}

/** Native provenance: `SharedFormatUtil.CheckIfStartTag` (2.7.71 VA 0x186301d80). */
function isStartTag(tag: string): boolean {
  return (
    tag.startsWith("color") ||
    tag === "b" ||
    tag === "i" ||
    tag.startsWith("@") ||
    tag.startsWith("$") ||
    tag.startsWith(SPLIT_TAG_PREFIX)
  );
}

/**
 * Native provenance: `System.Int32.TryParse(string, out int)` with its default
 * `NumberStyles.Integer` — leading/trailing white space and a leading sign are
 * accepted, anything else (or Int32 overflow) fails.
 */
function tryParseInt32(raw: string): number | null {
  const match = /^[\t\n\v\f\r ]*([+-]?\d+)[\t\n\v\f\r ]*$/.exec(raw);
  if (!match) return null;
  const value = Number(match[1]);
  return value >= -2_147_483_648 && value <= 2_147_483_647 ? value : null;
}

/**
 * Native provenance: `SharedFormatUtil.RichTextConvertTagsHandler`
 * (2.7.71 VA 0x186302390). Returns the converted span when `endTag` closes
 * `startTag`, or `null` to keep scanning. `color`/`b`/`i` close with their own
 * `</color>`/`</b>`/`</i>`; `@style` and `$` close with the bare `</>`.
 *
 * `@style` looks the template up in the common game data's rich-text style
 * table, which the widget does not load, so it takes native's style-not-found
 * branch (plain content) and warns.
 */
function convertRichTextTag(
  startTag: string,
  endTag: string,
  content: string,
  onWarning?: (detail: string) => void,
): string | null {
  if (startTag.startsWith("@")) {
    if (endTag !== "/") return null;
    onWarning?.(`unsupported_visual animtext rich text style:${startTag}`);
    return content;
  }
  if (startTag.startsWith("color")) {
    if (endTag !== "/color") return null;
    const color = startTag.slice(startTag.indexOf("=") + 1);
    return `<color=${color}>${content}</color>`;
  }
  if (startTag === "i") return endTag === "/i" ? `<i>${content}</i>` : null;
  if (startTag === "b") return endTag === "/b" ? `<b>${content}</b>` : null;
  if (startTag.startsWith("$") && endTag === "/") return content;
  return null;
}

/**
 * Native provenance: `FormatUtil._HandleAvgSplitContentTextTags`
 * (2.7.71 VA 0x181f108b0). A `<p=N>` span closes only on the bare `</>`; N is
 * parsed with `Int32.TryParse`, `dict[N - 1] = content` is an upsert (a repeated
 * N keeps the last span), and N ≤ 0 logs
 * `[FormatUtil]Avg split content id should start with 1, not 0` without
 * storing. A failed parse still closes the span, silently.
 */
function closeTag(
  startTag: string | null,
  endTag: string,
  content: string,
  slots: string[],
  onWarning?: (detail: string) => void,
): string | null {
  if (!startTag) return null;
  if (!startTag.startsWith(SPLIT_TAG_PREFIX))
    return convertRichTextTag(startTag, endTag, content, onWarning);
  if (endTag !== "/") return null;
  const id = tryParseInt32(startTag.slice(SPLIT_TAG_PREFIX.length));
  if (id !== null) {
    if (id - 1 >= 0) slots[id - 1] = content;
    else onWarning?.("animtext split content id should start with 1, not 0");
  }
  return content;
}

/**
 * Native provenance: `FormatUtil._FormatAvgSplitContentTextTag`
 * (2.7.71 VA 0x181f0fb50). Recursive descent over `<tag>` tokens: a
 * recognised start tag opens a nested frame that returns when `closeTag`
 * accepts an end tag (so `</>` closes the innermost `p=`/`@`/`$` span), an
 * unrecognised tag is kept literally, and an unclosed frame runs to the end of
 * the input without storing anything. A nested frame's result is also
 * appended to its parent, so `<p=1>a<p=2>b</>c</>` yields slot 0 = `abc`.
 */
function formatSplitContentTag(
  stream: LightStringStream,
  startTag: string | null,
  slots: string[],
  onWarning?: (detail: string) => void,
): string {
  let output = "";
  let inTag = false;
  let tagStart = 0;
  let tagLength = 0;
  while (!stream.isEnd) {
    const char = stream.read();
    if (char === "<") {
      if (inTag && tagLength > 0)
        output += `<${stream.range(tagStart, tagStart + tagLength)}`;
      tagStart = stream.head;
      tagLength = 0;
      inTag = true;
    } else if (char === ">" && inTag) {
      inTag = false;
      const tag = stream.range(tagStart, tagStart + tagLength);
      tagStart = 0;
      tagLength = 0;
      const closed = closeTag(startTag, tag, output, slots, onWarning);
      if (closed !== null) return closed;
      output += isStartTag(tag)
        ? formatSplitContentTag(stream, tag, slots, onWarning)
        : `<${tag}>`;
    } else if (inTag) {
      tagLength += 1;
    } else {
      output += char;
    }
  }
  if (tagLength > 0)
    output += `<${stream.range(tagStart, tagStart + tagLength)}`;
  return output;
}

/**
 * Native provenance: `Torappu.FormatUtil.FormatAvgSplitContentTextFromData`
 * (2.7.71 VA 0x181f0a270), consumed by `AnimatedTextStampView.InitView`
 * (2.7.71 VA 0x183ed1470):
 * - the literal two-character `\n` is unescaped into a real newline before
 *   tag parsing;
 * - each closed `<p=N>…</>` stores its (rich-text converted) inner text at
 *   index N - 1;
 * - `InitView` fills `_textArray[i]` (serialized prefab order: `text_main`,
 *   `text_sub`) via `dict.TryGetValue(i)`, `String.Empty` on a miss — slot i ←
 *   `<p=i+1>` by index, NOT document order: a stamp that only writes `<p=2>`
 *   fills the sub slot and leaves the main slot empty.
 */
export function parseSplitContent(
  content: string,
  onWarning?: (detail: string) => void,
): string[] {
  const slots: string[] = [];
  if (!content) return slots;
  formatSplitContentTag(
    new LightStringStream(content.replaceAll(String.raw`\n`, "\n")),
    null,
    slots,
    onWarning,
  );
  return slots;
}

/**
 * Port scope: `Torappu.AVG.AVGDisplayableExecutor._ExecuteAnimatedText` and
 * the serialized `AVG/AnimateText/group_location_stamp` prefab's visible
 * timeline. Sprite construction and keyframe playback are a Web/PIXI
 * adaptation, not a port of Unity Animator internals.
 *
 * `AnimTextInput.id` is intentionally unused: native `InitView` records it
 * into `m_stampId`, and `_ExecuteAnimatedTextClean` (2.7.71 VA 0x183ecec90)
 * would dismiss stamps by that id (or all of them for an empty id), but it is
 * only reached from `_ExecuteAnimatedText`'s `CmdParam.clear` branch — and
 * `_GenParamWithCmd` (2.7.71 VA 0x183ecf210) reads `clear` without storing it,
 * so the branch is dead. `GetExecutors` (2.7.71 VA 0x183ece380) registers only
 * `animtext`/`avgdisplay`, so the `[animtextclean]` lines in story data hit no
 * executor either. Stamps are therefore only cleared wholesale
 * (`_CleanAllTextStamps` on reset / script end).
 */
export class AnimTextPanel {
  private readonly stamps: StampView[] = [];
  private sessionId = 0;

  constructor(
    private readonly layer: Container,
    private readonly tween: (
      durationMs: number,
      update: (progress: number) => void,
      complete?: () => void,
    ) => Promise<void>,
    private readonly onWarning?: (detail: string) => void,
  ) {}

  async show(input: AnimTextInput): Promise<void> {
    // Native loads any template via
    // `ResourceRouter.GetAVGAnimateTextTemplatePath` (`AVG/AnimateText/{0}`,
    // 2.7.71 VA 0x183f386c0) and LogError+throws when the prefab is missing. This
    // widget intentionally crops to the only template that exists in the
    // game data (`group_location_stamp`); other names warn and no-op.
    if (input.name !== "group_location_stamp") {
      this.onWarning?.(`unsupported_visual animtext:${input.name}`);
      return;
    }

    const names = [
      "back_shadow",
      "frame_outer",
      "icon_back",
      "frame_inner",
      "icon_comps",
      "icon_start",
      "back_gradient",
    ] as const;
    let textures: Record<(typeof names)[number], Texture>;
    try {
      const loaded = await Promise.all(
        names.map((name) => Assets.load<Texture>(STAMP_ASSETS[name])),
      );
      textures = Object.fromEntries(
        names.map((name, index) => [name, loaded[index]]),
      ) as Record<(typeof names)[number], Texture>;
    } catch {
      this.onWarning?.("missing animtext prefab sprites: group_location_stamp");
      return;
    }

    const root = new Container();
    root.position.set(
      STORY_WIDTH / 2 + input.position.x,
      STORY_HEIGHT / 2 - input.position.y,
    );

    const shadow = this.sprite(
      textures.back_shadow,
      root,
      -244.14,
      0,
      520,
      209.06,
      0,
      0.5,
    );
    const outer = this.sprite(textures.frame_outer, root, -143.42, 0, 123, 123);
    const iconGroup = new Container();
    iconGroup.position.set(-143.42, 0);
    root.addChild(iconGroup);
    const iconBack = this.sprite(textures.icon_back, iconGroup, 0, 0, 74, 74);
    iconBack.alpha = 0.6;
    const inner = this.sprite(textures.frame_inner, iconGroup, 0, 0, 53, 53);
    inner.alpha = 0.6;
    const comps = this.sprite(textures.icon_comps, iconGroup, 0, 0, 14, 42);
    comps.alpha = 0;
    const bricks = [
      [-5.5, -5.5],
      [5.5, -5.5],
      [5.5, 5.5],
      [-5.5, 5.5],
    ].map(() => {
      const brick = this.sprite(textures.icon_start, iconGroup, 0, 0, 11, 11);
      brick.alpha = 0;
      return brick;
    });

    const textGroup = new Container();
    textGroup.position.set(-93.42, 0);
    root.addChild(textGroup);
    const gradient = this.sprite(
      textures.back_gradient,
      textGroup,
      -70,
      0,
      260,
      87,
    );
    gradient.anchor.set(0.5);
    gradient.alpha = 0.15;
    const parts = parseSplitContent(input.content, this.onWarning);
    // Prefab fonts come from DynFontLoader: text_main loads
    // SourceHanSansCN-Heavy, text_sub NotoSansHans-Medium, both FontStyle
    // Normal.
    const main = this.text(parts[0] ?? "", 30, {
      fontFamily: [ANIMTEXT_MAIN_FONT_FAMILY, "sans-serif"],
      fontWeight: ANIMTEXT_MAIN_FONT_WEIGHT,
    });
    const sub = this.text(parts[1] ?? "", 26, {
      fontFamily: [DIALOG_FONT_FAMILY, "sans-serif"],
      fontWeight: DIALOG_FONT_WEIGHT,
    });
    main.anchor.set(0, 0.5);
    sub.anchor.set(0, 0.5);
    main.position.set(0, -20);
    sub.position.set(0, 20);
    main.visible = input.style !== "avg_only_medium";
    sub.visible = input.style !== "avg_only_heavy";
    textGroup.addChild(main, sub);

    root.alpha = 0;
    this.layer.addChild(root);
    const view = { root, sessionId: ++this.sessionId };
    this.stamps.push(view);
    const run = this.tween(ANIMATION_MS, (progress) => {
      if (!this.stamps.includes(view)) return;
      const time = progress * 5;
      root.alpha = lerpKeyframes(time, [
        [0, 0],
        [1 / 3, 1],
        [4, 1],
        [5, 0],
      ]);
      outer.width = outer.height = lerpKeyframes(time, [
        [0, 25],
        [1 / 3, 109.74],
        [5 / 6, 123],
        [5, 140.01],
      ]);
      inner.width = inner.height = lerpKeyframes(time, [
        [0, 16],
        [1 / 3, 50.1],
        [5 / 6, 53],
        [5, 55.81],
      ]);
      outer.alpha = lerpKeyframes(time, [
        [0, 1],
        [2.5, 1],
        [4.5, 0],
      ]);
      iconGroup.alpha = lerpKeyframes(time, [
        [0, 1],
        [4.5, 1],
        [5, 0],
      ]);
      comps.alpha = lerpKeyframes(time, [
        [0, 0],
        [0.95, 0],
        [1.1167, 1],
      ]);
      textGroup.x = lerpKeyframes(time, [
        [0, -121.03],
        [1 / 3, -97.31],
        [5 / 6, -93.42],
        [5, -85.35],
      ]);
      for (const [index, brick] of bricks.entries()) {
        const [endX, endY] = [
          [-5.5, -5.5],
          [5.5, -5.5],
          [5.5, 5.5],
          [-5.5, 5.5],
        ][index]!;
        brick.alpha = lerpKeyframes(time, [
          [0, 0],
          [1 / 12, 1],
          [0.8167, 1],
          [0.9667, 0],
        ]);
        brick.position.set(
          lerpKeyframes(time, [
            [0, 0],
            [2 / 3, endX * 0.92],
            [0.9167, endX],
          ]),
          lerpKeyframes(time, [
            [0, 0],
            [2 / 3, endY * 0.92],
            [0.9167, endY],
          ]),
        );
      }
      shadow.visible = true;
    });
    if (input.block) await run;
    else void run;
  }

  clear(): void {
    this.sessionId += 1;
    for (const stamp of this.stamps) stamp.root.destroy({ children: true });
    this.stamps.length = 0;
  }

  destroy(): void {
    this.clear();
  }

  /**
   * Shows the slot text literally, tags included. Native provenance: both
   * prefab Texts serialize `m_RichText` 0, and neither `InitView` (2.7.71 VA
   * 0x183ed1470), the stamp's clips nor any AVG code turns
   * `supportRichText` on, so the `<color>`/`<b>`/`<i>` spans that
   * `RichTextConvertTagsHandler` keeps are displayed as text. No tagStyles:
   * PIXI only parses tag markup when tagStyles is non-empty.
   */
  private text(
    content: string,
    fontSize: number,
    font: Pick<TextStyleOptions, "fontFamily" | "fontWeight">,
  ): Text {
    const style = new TextStyle({
      fill: "#ffffff",
      ...font,
      fontSize,
    });
    return new Text({ style, text: content });
  }

  private sprite(
    texture: Texture,
    parent: Container,
    x: number,
    y: number,
    width: number,
    height: number,
    anchorX = 0.5,
    anchorY = 0.5,
  ): Sprite {
    const sprite = new Sprite(texture);
    sprite.anchor.set(anchorX, anchorY);
    sprite.position.set(x, y);
    sprite.width = width;
    sprite.height = height;
    parent.addChild(sprite);
    return sprite;
  }
}

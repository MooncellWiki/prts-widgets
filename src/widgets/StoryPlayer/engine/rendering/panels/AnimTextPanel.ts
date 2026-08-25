import {
  Assets,
  Container,
  Sprite,
  Text,
  TextStyle,
  type Texture,
} from "pixi.js";

import { STAMP_ASSETS } from "../../../assets";
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

/**
 * Native provenance: `Torappu.FormatUtil.FormatAvgSplitContentTextFromData`
 * (VA 0x181efb180) → `_HandleAvgSplitContentTextTags` (VA 0x181f017c0), then
 * `AnimatedTextStampView.InitView` (VA 0x183e244f0):
 * - the literal two-character `\n` is unescaped into a real newline before
 *   tag parsing;
 * - each `<p=N>…</>` contributes dict[N - 1] = inner text (`Int32.TryParse`,
 *   so only pure digits count as split tags);
 * - `<p=0>` logs `Avg split content id should start from 1, not 0` and is
 *   dropped from the dict;
 * - `InitView` fills slot i via `dict.TryGetValue(i)` — slot i ← `<p=i+1>` by
 *   index, NOT document order: a stamp that only writes `<p=2>` fills the sub
 *   slot and leaves the main slot empty.
 *
 * Non-`p` rich-text tags are not converted here: the widget rich-text pipeline
 * (`engine/richtext.ts`) only ports `<color>`, and production animtext data
 * carries no rich-text tags inside the split content.
 */
function splitStampSlots(content: string, onInvalidId?: () => void): string[] {
  const normalized = content.replaceAll(String.raw`\n`, "\n");
  const slots: string[] = [];
  for (const match of normalized.matchAll(/<p=(\d+)>(.*?)<\/>/gs)) {
    const id = Number.parseInt(match[1]!, 10);
    if (id === 0) {
      onInvalidId?.();
      continue;
    }
    slots[id - 1] = match[2] ?? "";
  }
  return slots;
}

/**
 * Port scope: `Torappu.AVG.AVGDisplayableExecutor._ExecuteAnimatedText` and
 * the serialized `AVG/AnimateText/group_location_stamp` prefab's visible
 * timeline. Sprite construction and keyframe playback are a Web/PIXI
 * adaptation, not a port of Unity Animator internals.
 *
 * `AnimTextInput.id` is intentionally unused: native `InitView` records it
 * into `m_stampId`, but every targeted-cleanup path is unreachable in 2.7.61
 * (`clear` is discarded by `_GenParamWithCmd` before reaching the executor,
 * and no `animtextclean` executor is registered), so stamps are only ever
 * cleared wholesale (`_CleanAllTextStamps` on reset / script end).
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
    // VA 0x183e8fb60) and LogError+throws when the prefab is missing. This
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
    const parts = splitStampSlots(input.content, () =>
      this.onWarning?.("animtext split content id should start from 1, not 0"),
    );
    const main = new Text({
      style: new TextStyle({
        fill: "#ffffff",
        fontFamily: "Noto Sans SC, sans-serif",
        fontSize: 30,
      }),
      text: parts[0] ?? "",
    });
    const sub = new Text({
      style: new TextStyle({
        fill: "#ffffff",
        fontFamily: "Noto Sans SC, sans-serif",
        fontSize: 26,
      }),
      text: parts[1] ?? "",
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

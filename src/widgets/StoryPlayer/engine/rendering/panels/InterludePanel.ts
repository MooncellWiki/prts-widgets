import {
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  type Texture,
} from "pixi.js";

import { STORY_HEIGHT, STORY_WIDTH, type InterludeInput } from "../../types";

type TextureLoader = (input: InterludeInput) => Promise<Texture | null>;
type Tween = (
  durationMs: number,
  update: (progress: number) => void,
  complete?: () => void,
) => Promise<void>;

interface ChannelState {
  elements: Map<string, Container>;
  label: Text | null;
  mask: Graphics;
  root: Container;
  /** Current template scale ratio (tracked through ts tweens for clear). */
  ratio: { x: number; y: number };
  /** Guards element tweens; bumped by every command on the channel. */
  sessionId: number;
  size: { x: number; y: number };
  /**
   * Guards the template show/scale tween separately: native element commands
   * DOKill only the element tweens, never the template DOScale, so element
   * sessions must not cancel it (only clear/recreate does).
   */
  templateSessionId: number;
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

/**
 * Port scope: `Torappu.AVG.AVGCharacterCutinPanel._ExecuteInterlude` /
 * `CutinController` / `CutinChannel` / `CutinTemplate` (2.7.61, build 2761):
 *
 * - Channel begin (`OnCutinBegin` → `CutinTemplate.ShowCutinMask`) applies
 *   size/offset once and owns the show timing: the sequence has a 1s
 *   `AppendInterval` floor, Fade/Both styles join a hardcoded 3s mask fade,
 *   and Scale style runs an independent tsFrom→tsTo DOScale that does not
 *   gate completion.
 * - Channel update (`OnCutinUpdate` → `CutinTemplate.UpdateCutinMask`) only
 *   refreshes the deco (charName/switch); it never re-applies size/offset.
 *   `switch` feeds the deco `TwoStateToggle` (`CutinTemplateDecoView.Render`)
 *   alone, so only the content layers toggle and only when the key is present.
 * - Elements (`CutinChannel._ProcessElement` → `CutinElement.SetCutinElement`)
 *   run alpha/pos/scale tweens in parallel, each with its own duration
 *   (alpha via aDuration on the Set append, pos via duration, scale via
 *   sDuration); the command completes when all of them finish.
 * - Clear (`CutinTemplate.HideCutinMask`) scales the mask from its current
 *   ratio to `tsto` over tsduration (style 0 path: DOScale to tsTo only,
 *   tsFrom is not reused).
 *
 * Web adaptations (intentional simplifications): the native mask-template
 * prefab (stencil pass, `maskid`, deco TwoStateToggle wiring, `direction`
 * animator entry) is approximated by a rectangular Graphics mask plus a text
 * label; `dialogCharPos`/`dialogCharScale` (2.7.61 `CutinTemplateDialogView`)
 * are forwarded on the input but have no Web template to consume them yet.
 */
export class InterludePanel {
  private readonly channels = new Map<number, ChannelState>();

  constructor(
    private readonly layer: Container,
    private readonly loadTexture: TextureLoader,
    private readonly tween: Tween,
    private readonly onWarning?: (detail: string) => void,
  ) {}

  async run(input: InterludeInput): Promise<void> {
    if (input.clear) {
      await this.clear(input);
      return;
    }
    if (input.channel < 0) {
      this.onWarning?.("interlude has no channel and is not a clear command");
      return;
    }

    const existing = this.channels.get(input.channel);
    const state = existing ?? this.createChannel(input);
    const created = existing === undefined;
    const sessionId = ++state.sessionId;
    this.refreshDeco(state, input);

    // Native OnCutinUpdate: type 0/unknown never reaches _ProcessElement; with
    // a plain template the completion callback is not fired either, so a
    // blocking type-0 update would hang natively. We intentionally complete
    // immediately instead.
    if (input.type === 0) {
      if (created && input.block)
        await this.tween(this.showMs(input.style), () => {});
      return;
    }

    const slot = input.slot || "m";
    // Native _GetImgElementByParam fails the lookup when a char/uichar slot
    // name is missing (LogError + immediate callback); bg (type 2) never uses
    // a slot. Keep the historical "m" fallback but surface the mismatch.
    if ((input.type === 1 || input.type === 3) && !input.slot)
      this.onWarning?.(
        `interlude element slot is missing (type ${input.type}), falling back to "m"`,
      );
    let element = state.elements.get(slot);
    if (input.name) {
      const texture = await this.loadTexture(input);
      if (!texture) {
        this.onWarning?.(`interlude element asset is missing: ${input.name}`);
        return;
      }
      element?.destroy({ children: true });
      element = new Container();
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      element.addChild(sprite);
      state.root.addChild(element);
      state.elements.set(slot, element);
      element.alpha = Math.max(input.alphaFrom, 0);
    }
    if (!element) {
      this.onWarning?.(`interlude element slot is missing: ${slot}`);
      return;
    }

    const el = element;
    if (input.switchSet) el.visible = input.switchOn;
    if (input.positionFrom && input.positionTo)
      el.position.set(input.positionFrom.x, -input.positionFrom.y);
    if (input.scaleFrom) el.scale.set(input.scaleFrom.x, input.scaleFrom.y);

    // Native _ProcessElement: the SetCutinElement alpha tween (name present)
    // and the pos/scale tweens each keep their own duration and run in
    // parallel; the sequence completes when every tween finished.
    const runs: Array<Promise<void>> = [];
    if (input.positionFrom && input.positionTo) {
      const from = input.positionFrom;
      const to = input.positionTo;
      runs.push(
        this.tween(input.durationMs, (progress) => {
          if (state.sessionId !== sessionId) return;
          el.position.set(
            lerp(from.x, to.x, progress),
            -lerp(from.y, to.y, progress),
          );
        }),
      );
    }
    if (input.scaleFrom && input.scaleTo) {
      const from = input.scaleFrom;
      const to = input.scaleTo;
      runs.push(
        this.tween(input.scaleDurationMs, (progress) => {
          if (state.sessionId !== sessionId) return;
          el.scale.set(
            lerp(from.x, to.x, progress),
            lerp(from.y, to.y, progress),
          );
        }),
      );
    }
    if (input.name) {
      const startAlpha = Math.max(input.alphaFrom, 0);
      const endAlpha = input.alphaTo >= 0 ? input.alphaTo : 1;
      runs.push(
        this.tween(input.alphaDurationMs, (progress) => {
          if (state.sessionId !== sessionId) return;
          el.alpha = lerp(startAlpha, endAlpha, progress);
        }),
      );
    }
    if (input.block) {
      const show = created
        ? this.tween(this.showMs(input.style), () => {})
        : null;
      await Promise.all(show ? [show, ...runs] : runs);
    } else {
      for (const run of runs) void run;
    }
  }

  async clearAll(): Promise<void> {
    for (const state of this.channels.values())
      state.root.destroy({ children: true });
    this.channels.clear();
  }

  destroy(): void {
    void this.clearAll();
  }

  /**
   * Native CutinTemplate.ShowCutinMask completion floor: the show sequence
   * always starts with AppendInterval(1.0); Fade/Both styles join a hardcoded
   * 3s DOFade; ANIMATOR hands completion to the template animation (not
   * ported, completes immediately).
   */
  private showMs(style: number): number {
    if (style === 3) return 0;
    return style === 1 || style === 2 ? 3000 : 1000;
  }

  private createChannel(input: InterludeInput): ChannelState {
    const root = new Container();
    const mask = new Graphics();
    root.position.set(
      STORY_WIDTH / 2 + input.offset.x,
      STORY_HEIGHT / 2 - input.offset.y,
    );
    root.addChild(mask);
    root.mask = mask;
    this.layer.addChild(root);

    const state: ChannelState = {
      elements: new Map(),
      label: null,
      mask,
      root,
      ratio: { x: 1, y: 1 },
      sessionId: 0,
      size: { ...input.size },
      templateSessionId: 0,
    };

    // Native ShowCutinMask style Scale(0): when tsTo has any component > 0 the
    // template starts at localScale=tsFrom and DOScales to tsTo over
    // tsduration. Other styles keep scale 1 (their ts keys are ignored).
    const scaleEntry =
      input.style === 0 &&
      (input.templateSizeTo.x > 0 || input.templateSizeTo.y > 0);
    if (scaleEntry) {
      const from = input.templateSizeFrom;
      const to = input.templateSizeTo;
      state.ratio = { x: from.x, y: from.y };
      if (input.templateSizeDurationMs > 0) {
        const templateSessionId = ++state.templateSessionId;
        void this.tween(input.templateSizeDurationMs, (progress) => {
          if (state.templateSessionId !== templateSessionId) return;
          state.ratio = {
            x: lerp(from.x, to.x, progress),
            y: lerp(from.y, to.y, progress),
          };
          this.drawMask(
            state.mask,
            state.size.x * state.ratio.x,
            state.size.y * state.ratio.y,
          );
        });
      } else {
        state.ratio = { x: to.x, y: to.y };
      }
    }
    this.drawMask(
      state.mask,
      state.size.x * state.ratio.x,
      state.size.y * state.ratio.y,
    );

    if (input.charName) {
      const label = this.makeLabel(input.charName);
      state.label = label;
      state.root.addChild(label);
    }

    this.channels.set(input.channel, state);
    return state;
  }

  /**
   * Native CutinTemplate.UpdateCutinMask: only the deco is refreshed (name
   * text and the TwoStateToggle); size/offset are never re-applied and the
   * mask itself never toggles. The Web stand-in for the deco TwoStateToggle is
   * toggling the content layers (elements + name label) visibility.
   */
  private refreshDeco(state: ChannelState, input: InterludeInput): void {
    if (input.switchSet) {
      for (const element of state.elements.values())
        element.visible = input.switchOn;
      if (state.label) state.label.visible = input.switchOn;
    }

    if (!input.charName) {
      // CutinTemplateDecoView.Render sets the text every update; an empty
      // name keeps the (now empty) deco alive.
      if (state.label) state.label.text = "";
      return;
    }
    if (state.label) {
      state.label.text = input.charName;
      return;
    }
    const label = this.makeLabel(input.charName);
    state.label = label;
    state.root.addChild(label);
  }

  private async clear(input: InterludeInput): Promise<void> {
    const states =
      input.channel < 0
        ? [...this.channels.entries()]
        : [...this.channels.entries()].filter(
            ([channel]) => channel === input.channel,
          );
    // Native _ProcessChannelClean clear-all invokes the completion callback
    // once per recycled channel (and never when there are none); we aggregate
    // into a single completion on purpose.
    if (input.channel < 0 && input.block && states.length > 1)
      this.onWarning?.(
        `interlude clear-all aggregates ${states.length} channel completions into one (native fires per channel)`,
      );
    const tasks = states.map(async ([channel, state]) => {
      const sessionId = ++state.sessionId;
      state.templateSessionId += 1;
      // Native HideCutinMask style 0: DOScale from the current scale to tsTo
      // over tsduration (tsFrom is not reused); other styles only fade the
      // mask image, which the rectangular Graphics mask cannot express.
      const from = { ...state.ratio };
      const to = input.templateSizeTo;
      const run = this.tween(
        input.templateSizeDurationMs,
        (progress) => {
          if (state.sessionId !== sessionId) return;
          state.ratio = {
            x: lerp(from.x, to.x, progress),
            y: lerp(from.y, to.y, progress),
          };
          this.drawMask(
            state.mask,
            state.size.x * state.ratio.x,
            state.size.y * state.ratio.y,
          );
        },
        () => {
          state.root.destroy({ children: true });
          this.channels.delete(channel);
        },
      );
      if (input.block) await run;
      else void run;
    });
    if (input.block) await Promise.all(tasks);
  }

  private makeLabel(charName: string): Text {
    const label = new Text({
      style: new TextStyle({ fill: 0xff_ff_ff, fontSize: 24 }),
      text: charName,
    });
    label.label = "interlude-char";
    label.anchor.set(0.5);
    return label;
  }

  private drawMask(mask: Graphics, width: number, height: number): void {
    mask
      .clear()
      .rect(-width / 2, -height / 2, width, height)
      .fill(0xff_ff_ff);
  }
}

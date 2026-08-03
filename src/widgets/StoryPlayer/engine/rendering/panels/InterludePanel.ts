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
  mask: Graphics;
  root: Container;
  sessionId: number;
  size: { x: number; y: number };
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

/**
 * Port scope: `Torappu.AVG.AVGCharacterCutinPanel._ExecuteInterlude`, including
 * channel replacement, template masking, and block timing. Containers/masks
 * are a Web/PIXI adaptation of the native character-cutin prefab hierarchy.
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

    const state = this.channels.get(input.channel) ?? this.createChannel(input);
    const sessionId = ++state.sessionId;
    this.updateTemplate(state, input);

    if (input.type === 0) return;

    const slot = input.slot || "m";
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

    element.visible = input.switchOn;
    if (input.positionFrom && input.positionTo)
      element.position.set(input.positionFrom.x, -input.positionFrom.y);
    if (input.scaleFrom)
      element.scale.set(input.scaleFrom.x, input.scaleFrom.y);

    const duration = Math.max(
      input.durationMs,
      input.scaleDurationMs,
      input.alphaDurationMs,
    );
    const startAlpha = input.alphaFrom >= 0 ? input.alphaFrom : element.alpha;
    const endAlpha = input.alphaTo >= 0 ? input.alphaTo : 1;
    const run = this.tween(duration, (progress) => {
      if (state.sessionId !== sessionId) return;
      if (input.positionFrom && input.positionTo) {
        element!.position.set(
          lerp(input.positionFrom.x, input.positionTo.x, progress),
          -lerp(input.positionFrom.y, input.positionTo.y, progress),
        );
      }
      if (input.scaleFrom && input.scaleTo) {
        element!.scale.set(
          lerp(input.scaleFrom.x, input.scaleTo.x, progress),
          lerp(input.scaleFrom.y, input.scaleTo.y, progress),
        );
      }
      element!.alpha = lerp(startAlpha, endAlpha, progress);
    });
    if (input.block) await run;
    else void run;
  }

  async clearAll(): Promise<void> {
    for (const state of this.channels.values())
      state.root.destroy({ children: true });
    this.channels.clear();
    await Promise.resolve();
  }

  destroy(): void {
    void this.clearAll();
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
    const state = {
      elements: new Map(),
      mask,
      root,
      sessionId: 0,
      size: { ...input.size },
    };
    this.channels.set(input.channel, state);
    return state;
  }

  private updateTemplate(state: ChannelState, input: InterludeInput): void {
    if (input.size.x > 0) state.size.x = input.size.x;
    if (input.size.y > 0) state.size.y = input.size.y;
    state.root.position.set(
      STORY_WIDTH / 2 + input.offset.x,
      STORY_HEIGHT / 2 - input.offset.y,
    );
    state.root.visible = input.switchOn;
    this.drawMask(state.mask, state.size.x, state.size.y);

    const oldLabel = state.root.getChildByLabel("interlude-char");
    oldLabel?.destroy();
    if (input.charName) {
      const label = new Text({
        style: new TextStyle({ fill: 0xff_ff_ff, fontSize: 24 }),
        text: input.charName,
      });
      label.label = "interlude-char";
      label.anchor.set(0.5);
      state.root.addChild(label);
    }

    if (input.templateSizeDurationMs > 0) {
      const from = input.templateSizeFrom;
      const to = input.templateSizeTo;
      void this.tween(input.templateSizeDurationMs, (progress) => {
        this.drawMask(
          state.mask,
          state.size.x * lerp(from.x, to.x, progress),
          state.size.y * lerp(from.y, to.y, progress),
        );
      });
    }
  }

  private async clear(input: InterludeInput): Promise<void> {
    const states =
      input.channel < 0
        ? [...this.channels.entries()]
        : [...this.channels.entries()].filter(
            ([channel]) => channel === input.channel,
          );
    const duration = input.templateSizeDurationMs;
    const tasks = states.map(async ([channel, state]) => {
      const sessionId = ++state.sessionId;
      const run = this.tween(
        duration,
        (progress) => {
          if (state.sessionId !== sessionId) return;
          const x = lerp(
            input.templateSizeFrom.x,
            input.templateSizeTo.x,
            progress,
          );
          const y = lerp(
            input.templateSizeFrom.y,
            input.templateSizeTo.y,
            progress,
          );
          this.drawMask(state.mask, state.size.x * x, state.size.y * y);
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

  private drawMask(mask: Graphics, width: number, height: number): void {
    mask
      .clear()
      .rect(-width / 2, -height / 2, width, height)
      .fill(0xff_ff_ff);
  }
}

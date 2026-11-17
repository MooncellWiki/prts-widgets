import { createExecutionHandle, type ExecutionHandle } from "../../execution";

import { CutinChannel } from "./CutinChannel";

import type { InterludeInput } from "../../types";
import type { CharacterArtLoad } from "../characters/CharacterArt";
import type { TextureLoad } from "../core/TextureAsset";
import type { TweenRunner } from "../core/TweenRunner";
import type { Container, Texture } from "pixi.js";

interface ChannelAllocation {
  readonly channel: CutinChannel;
}

/** GameObjectPool.Allocate/Recycle, 2791 @ 0x182AB73D0 / 0x182AB82E0. */
class ChannelPool {
  private readonly available: CutinChannel[] = [];
  private readonly allocated = new Set<ChannelAllocation>();

  constructor(private readonly create: () => CutinChannel) {}

  allocate(input: InterludeInput): ChannelAllocation {
    const channel = this.available.pop() ?? this.create();
    channel.allocate(input);
    const allocation = { channel };
    this.allocated.add(allocation);
    return allocation;
  }

  recycle(allocation: ChannelAllocation): void {
    if (!this.allocated.delete(allocation)) return;
    allocation.channel.recycle();
    this.available.push(allocation.channel);
  }

  clear(): void {
    for (const { channel } of this.allocated) channel.destroy();
    for (const channel of this.available) channel.destroy();
    this.allocated.clear();
    this.available.length = 0;
  }
}

/** CutinController.RunCutin (2791 @ 0x1814FB370) and command completion. */
export class InterludePanel {
  private readonly channels = new Map<number, ChannelAllocation>();
  private readonly pending = new Set<ExecutionHandle>();
  private readonly pool: ChannelPool;

  constructor(
    layer: Container,
    loadTexture: (input: InterludeInput) => TextureLoad,
    nativeBackgroundRect: (
      key: string,
      texture: Texture,
    ) => readonly [number, number],
    loadAvatar: (input: InterludeInput) => CharacterArtLoad,
    tweens: Pick<TweenRunner, "start" | "killTarget" | "afterUpdate">,
    private readonly onWarning?: (detail: string) => void,
  ) {
    this.pool = new ChannelPool(
      () =>
        new CutinChannel(
          layer,
          loadTexture,
          nativeBackgroundRect,
          loadAvatar,
          tweens,
          onWarning,
        ),
    );
  }

  run(input: InterludeInput, onComplete?: () => void): ExecutionHandle | void {
    if (!input.clear && input.channel < 0) {
      this.onWarning?.("interlude has no channel and is not a clear command");
      return;
    }

    const animation = createExecutionHandle(true, () =>
      this.pending.delete(animation),
    );
    this.pending.add(animation);
    const complete = () => {
      if (animation.endReason !== undefined) return;
      animation.end();
      onComplete?.();
    };
    try {
      if (input.clear) this.clear(input, complete);
      else {
        const allocation = this.channels.get(input.channel);
        if (allocation) allocation.channel.update(input, animation, complete);
        else {
          const created = this.pool.allocate(input);
          this.channels.set(input.channel, created);
          created.channel.begin(input, animation, complete);
        }
      }
    } catch (error) {
      animation.fail(error);
    }
    return animation.endReason === "complete" ? undefined : animation;
  }

  clearAll(): void {
    for (const animation of this.pending) animation.end("reset");
    this.channels.clear();
    this.pool.clear();
  }

  destroy(): void {
    this.clearAll();
  }

  private clear(input: InterludeInput, complete: () => void): void {
    if (input.channel < 0) {
      this.hideAllChannels(input);
      if (!input.block) complete();
      return;
    }

    const allocation = this.channels.get(input.channel);
    if (!allocation) {
      complete();
      return;
    }

    allocation.channel.end(input, () => {
      // A second clear can finish in the same update. It owns its own
      // completion, while only the current allocation can return the view.
      if (this.channels.get(input.channel) === allocation) {
        this.channels.delete(input.channel);
        this.pool.recycle(allocation);
      }
      if (input.block) complete();
    });
    if (!input.block) complete();
  }

  private hideAllChannels(input: InterludeInput): void {
    // _ProcessChannelClean (2791 @ 0x1814FB710) leaves the shared callback's
    // channel unset. b__1 (0x181507EC0) faults before recycling or finishing
    // the command. DOTween catches callback failures in Safe Mode
    // (0x18443D780). An inline OnCutinEnd propagates the error.
    const message = "interlude clear-all completion received an unset channel";
    const done = (fromTween: boolean) => {
      if (!fromTween) throw new Error(message);
      this.onWarning?.(message);
    };
    for (const { channel } of this.channels.values()) channel.end(input, done);
  }
}

import {
  exactArg,
  toBoolean,
  toNumber,
  toOptionalNumber,
  toString,
} from "../commandParams";

import type { CommandRegistry, CommandResult } from "../commandRegistry";
import type { ParsedCommandLine, StoryRenderer } from "../types";

interface CameraEffectPlayback {
  animateRatio: () => number;
  calculateFadeMs: (seconds: unknown, fallback: number) => number;
  warnUnsupportedVisual: (detail: string) => void;
}

/** Native port: the commands registered by Torappu.AVG.AVGCameraEffect. */
export class CameraEffectExecutor {
  constructor(
    private readonly renderer: Pick<
      StoryRenderer,
      | "setCameraEffect"
      | "setFocusOut"
      | "setFocusParam"
      | "shakeCamera"
      | "stopCameraShake"
    >,
    private readonly playback: CameraEffectPlayback,
  ) {}

  register(registry: CommandRegistry<CommandResult>): void {
    registry.register("cameraeffect", (line) => this.executeCameraEffect(line));
    registry.register("camerashake", (line) => this.executeCameraShake(line));
    registry.register("focusout", (line) => this.executeFocusOut(line));
    registry.register("focusparam", (line) => this.executeFocusParam(line));
  }

  private async executeCameraEffect({
    args,
  }: ParsedCommandLine): Promise<CommandResult> {
    // _ExecuteCameraEffect (2.7.61 @ 0x183E32560) dispatches case-sensitive
    // Grayscale and Colorinverse. The Web port reports Chaos as unsupported.
    const effect = toString(exactArg(args, "effect"));
    const block = toBoolean(exactArg(args, "block"), false);
    const keep = toBoolean(exactArg(args, "keep"), false);
    // AVGCameraEffect._defaultFadetime is serialized as 0.4 on
    // AVGController > AVGCamera_Scene. The executor applies animateRatio
    // (0x183E327C1) before tweening.
    const fadeMs = this.playback.calculateFadeMs(
      exactArg(args, "fadetime"),
      0.4,
    );
    if (effect === "Chaos") {
      this.playback.warnUnsupportedVisual("cameraeffect:Chaos");
      return "continue";
    }
    if (effect === "Colorinverse") {
      await this.renderer.setCameraEffect(effect, keep ? 1 : 0, 0, false, true);
      return "continue";
    }
    if (effect !== "Grayscale") return "continue";
    await this.renderer.setCameraEffect(
      effect,
      toNumber(exactArg(args, "amount"), 1),
      fadeMs,
      block,
      keep,
      toOptionalNumber(exactArg(args, "initamount")),
    );
    return "continue";
  }

  private async executeCameraShake({
    args,
  }: ParsedCommandLine): Promise<CommandResult> {
    // _ExecuteCameraShake scales the duration before choosing one cycle or
    // infinite 10-second cycles (2.7.61 @ 0x183E32E52). MathUtil.IsZero
    // (0x183E32EFD) skips shaking at animateRatio 0. The Web renderer
    // mirrors that path with its durationMs <= 0 guard.
    const scaledDuration =
      toNumber(exactArg(args, "duration"), -1) * this.playback.animateRatio();
    await this.renderer.shakeCamera({
      block: toBoolean(exactArg(args, "block"), false),
      durationMs:
        scaledDuration < 0 ? 10_000 : Math.max(0, scaledDuration * 1000),
      fadeOut: toBoolean(exactArg(args, "fadeout"), false),
      infinite: scaledDuration < 0,
      randomness: toNumber(exactArg(args, "randomness"), 90),
      stop: toBoolean(exactArg(args, "stop"), false),
      vibrato: Math.trunc(toNumber(exactArg(args, "vibrato"), 10)),
      xStrength: toNumber(exactArg(args, "xstrength"), 1),
      yStrength: toNumber(exactArg(args, "ystrength"), 0),
    });
    return "continue";
  }

  private executeFocusOut({ args }: ParsedCommandLine): CommandResult {
    // _ExecuteFocusout (2791 @ 0x184187C20) passes the duration through
    // unscaled. MathUtil.GT/GE use a 1e-5 tolerance.
    const duration = toNumber(exactArg(args, "duration"));
    const from = toOptionalNumber(exactArg(args, "from"));
    const epsilon = Math.fround(1e-5);
    const durationMs = Math.fround(duration) > epsilon ? duration * 1000 : 0;
    const animation = this.renderer.setFocusOut({
      block: durationMs > 0 && toBoolean(exactArg(args, "block"), false),
      durationMs,
      from:
        from !== undefined && Math.fround(from) >= -epsilon ? from : undefined,
      id: toString(exactArg(args, "id")),
      to: toNumber(exactArg(args, "to"), 0),
      type: toString(exactArg(args, "type")),
    });
    if (!animation || animation.endReason !== undefined) return "continue";
    return {
      // ForceCommandEnd (2791 @ 0x184186000) resets the scene transform.
      // The scene effect manager owns the focus tween.
      forceEnd: () => this.renderer.stopCameraShake(),
      isComplete: () => animation.endReason !== undefined,
    };
  }

  private executeFocusParam({ args }: ParsedCommandLine): CommandResult {
    // _ExecuteFocusParam sets useBlur and color on the shared
    // AVGSceneFocusOut config and marks the command buffer dirty.
    const effect = toString(exactArg(args, "effect"));
    this.renderer.setFocusParam({
      blur: toBoolean(exactArg(args, "blur"), true),
      color:
        effect === "Grayscale" || effect === "Colorinverse" ? effect : "None",
    });
    return "continue";
  }
}

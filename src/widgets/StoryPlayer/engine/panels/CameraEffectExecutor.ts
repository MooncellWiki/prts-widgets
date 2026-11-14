import {
  ExecutorComponent,
  type ExecutorResult,
  type PanelExecutors,
} from "../ExecutorComponent";
import {
  exactArg,
  toBoolean,
  toNumber,
  toOptionalNumber,
  toString,
} from "../commandParams";

import type { ParsedCommandLine, StoryRenderer } from "../types";

interface CameraEffectPlayback {
  animateRatio: () => number;
  calculateFadeMs: (seconds: unknown, fallback: number) => number;
  warnUnsupportedVisual: (detail: string) => void;
}

/** Native port: Torappu.AVG.AVGCameraEffect (2791 GetExecutors @ 0x184186080). */
export class CameraEffectExecutor extends ExecutorComponent {
  constructor(
    private readonly renderer: Pick<
      StoryRenderer,
      | "resetCameraEffects"
      | "setCameraEffect"
      | "setFocusOut"
      | "setFocusParam"
      | "shakeCamera"
      | "stopCameraShake"
    >,
    private readonly playback: CameraEffectPlayback,
  ) {
    super();
  }

  protected getExecutors(): PanelExecutors {
    return {
      cameraeffect: (line) => this.executeCameraEffect(line),
      camerashake: (line) => this.executeCameraShake(line),
      focusout: (line) => this.executeFocusOut(line),
      focusparam: (line) => this.executeFocusParam(line),
    };
  }

  /** OnReset (2791 @ 0x184186390) stops scene shakes and clears used effects. */
  reset(): void {
    this.renderer.resetCameraEffects();
  }

  protected override forceCommandEnd(): void {
    // ForceCommandEnd (2791 @ 0x184186000) kills scene-root tweens and resets
    // its position. Grayscale and focus tween independently of the root.
    this.renderer.stopCameraShake();
  }

  private executeCameraEffect({ args }: ParsedCommandLine): ExecutorResult {
    // _ExecuteCameraEffect (2791 @ 0x184186EF0) dispatches case-sensitive
    // Grayscale and Colorinverse. The Web port reports Chaos as unsupported.
    const effect = toString(exactArg(args, "effect"));
    const block = toBoolean(exactArg(args, "block"), false);
    const keep = toBoolean(exactArg(args, "keep"), false);
    // AVGCameraEffect._defaultFadetime is serialized as 0.4 on
    // AVGController > AVGCamera_Scene. The executor scales it by animateRatio.
    const fadeMs = this.playback.calculateFadeMs(
      exactArg(args, "fadetime"),
      0.4,
    );
    if (effect === "Chaos") {
      this.playback.warnUnsupportedVisual("cameraeffect:Chaos");
      return "continue";
    }
    if (effect === "Colorinverse") {
      this.renderer.setCameraEffect(effect, keep ? 1 : 0, 0, false, true);
      return "continue";
    }
    if (effect !== "Grayscale") return "continue";
    return {
      animation: this.renderer.setCameraEffect(
        effect,
        toNumber(exactArg(args, "amount"), 1),
        fadeMs,
        block,
        keep,
        toOptionalNumber(exactArg(args, "initamount")),
        block ? this.finishCommand : undefined,
      ),
      block,
    };
  }

  private executeCameraShake({ args }: ParsedCommandLine): ExecutorResult {
    // _ExecuteCameraShake scales the duration before choosing one cycle or
    // infinite 10-second cycles (2791 @ 0x1841874E0). NeedSkipAnimation
    // tests MathUtil.IsZero (0x186945A80) on the scaled seconds.
    const scaledDuration =
      toNumber(exactArg(args, "duration"), -1) * this.playback.animateRatio();
    const durationMs =
      Math.abs(Math.fround(scaledDuration)) <= Math.fround(1e-5)
        ? 0
        : scaledDuration < 0
          ? 10_000
          : scaledDuration * 1000;
    const stop = toBoolean(exactArg(args, "stop"), false);
    const block = durationMs > 0 && !stop && toBoolean(exactArg(args, "block"));
    return {
      animation: this.renderer.shakeCamera(
        {
          block,
          durationMs,
          fadeOut: toBoolean(exactArg(args, "fadeout"), false),
          infinite: durationMs > 0 && scaledDuration < 0,
          randomness: toNumber(exactArg(args, "randomness"), 90),
          stop,
          vibrato: Math.trunc(toNumber(exactArg(args, "vibrato"), 10)),
          xStrength: toNumber(exactArg(args, "xstrength"), 1),
          yStrength: toNumber(exactArg(args, "ystrength"), 0),
        },
        block ? this.finishCommand : undefined,
      ),
      block,
    };
  }

  private executeFocusOut({ args }: ParsedCommandLine): ExecutorResult {
    // _ExecuteFocusout (2791 @ 0x184187C20) passes the duration through
    // unscaled. MathUtil.GT/GE use a 1e-5 tolerance.
    const duration = toNumber(exactArg(args, "duration"));
    const from = toOptionalNumber(exactArg(args, "from"));
    const epsilon = Math.fround(1e-5);
    const durationMs = Math.fround(duration) > epsilon ? duration * 1000 : 0;
    const block = durationMs > 0 && toBoolean(exactArg(args, "block"));
    return {
      animation: this.renderer.setFocusOut(
        {
          block,
          durationMs,
          from:
            from !== undefined && Math.fround(from) >= -epsilon
              ? from
              : undefined,
          id: toString(exactArg(args, "id")),
          to: toNumber(exactArg(args, "to"), 0),
          type: toString(exactArg(args, "type")),
        },
        block ? this.finishCommand : undefined,
      ),
      block,
    };
  }

  private executeFocusParam({ args }: ParsedCommandLine): ExecutorResult {
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

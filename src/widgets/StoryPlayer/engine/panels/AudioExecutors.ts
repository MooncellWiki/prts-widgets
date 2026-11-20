import { resolveStoryAudioByKey } from "../asset";
import { exactArg, toBoolean, toNumber, toString } from "../commandParams";

import type { Context } from "../../context";
import type { CommandRegistry, CommandResult } from "../commandRegistry";
import type { StoryAudio, StoryCommandArgs } from "../types";

function durationMs(args: StoryCommandArgs, key: string, fallback = 0): number {
  return Math.max(0, toNumber(exactArg(args, key), fallback) * 1000);
}

/**
 * Torappu.AVG.CommonExecutors.GetCommandExecutors (2791 @ 0x1841C2DB0).
 * Each audio executor submits its literal durations to AudioManager and
 * finishes synchronously. StoryAudio manages Web playback and channel fades.
 */
export class AudioExecutors {
  constructor(
    private readonly audio: Omit<StoryAudio, "destroy">,
    private readonly context: Pick<Context, "audioVariables">,
    private readonly warn: (
      type: "parse" | "missing_asset",
      detail: string,
    ) => void,
  ) {}

  register(registry: CommandRegistry<CommandResult>): void {
    const executors: Record<string, (args: StoryCommandArgs) => void> = {
      playmusic: (args) => this.playMusic(args),
      // CommonExecutors._ExecuteStopMusicCommand (2791 @ 0x1841C56C0).
      stopmusic: (args) => {
        void this.audio.stopMusic(durationMs(args, "fadetime"));
      },
      // CommonExecutors._ExecuteMusicVolumeCommand (2791 @ 0x1841C48D0).
      musicvolume: (args) => {
        void this.audio.setMusicVolume(
          toNumber(exactArg(args, "volume"), 1),
          durationMs(args, "fadetime"),
        );
      },
      playsound: (args) => this.playSound(args),
      // CommonExecutors._ExecuteStopSoundCommand (2791 @ 0x1841C57D0).
      stopsound: (args) => {
        const key = toString(exactArg(args, "key"));
        void this.audio.stopSound(
          toString(exactArg(args, "channel"), key),
          durationMs(args, "fadetime"),
        );
      },
      // CommonExecutors._ExecuteSoundVolumeCommand (2791 @ 0x1841C5170).
      soundvolume: (args) => {
        void this.audio.setSoundVolume(
          toString(exactArg(args, "channel")),
          toNumber(exactArg(args, "volume"), 1),
          durationMs(args, "fadetime"),
        );
      },
    };
    for (const [name, execute] of Object.entries(executors)) {
      registry.register(name, ({ args }) => {
        execute(args);
        return "continue";
      });
    }
  }

  /**
   * CommonExecutors.OnReset (2791 @ 0x1841C3920) calls _ResetAudio to fade
   * tracked SOUND channels at story end. ShouldResetOnSkip defaults to false.
   */
  reset(): void {
    this.audio.resetAudio();
  }

  private hasAudioKey(key: string): boolean {
    return Boolean(resolveStoryAudioByKey(key, this.context.audioVariables));
  }

  private playMusic(args: StoryCommandArgs): void {
    // CommonExecutors._ExecutePlayMusicCommand (2791 @ 0x1841C4A30).
    // Submit even an unresolved key so the backend can retire the old track.
    const key = toString(exactArg(args, "key"));
    if (!key) this.warn("parse", "playmusic key is empty");
    else if (!this.hasAudioKey(key))
      this.warn("missing_asset", `music: ${key}`);

    const intro = toString(exactArg(args, "intro")) || undefined;
    if (intro && !this.hasAudioKey(intro))
      this.warn("missing_asset", `music intro: ${intro}`);

    void this.audio.playMusic({
      crossfadeMs: durationMs(args, "crossfade", 0.4),
      delayMs: durationMs(args, "delay"),
      intro,
      key,
      volume: toNumber(exactArg(args, "volume"), 1),
    });
  }

  private playSound(args: StoryCommandArgs): void {
    // CommonExecutors._ExecutePlaySoundCommand (2791 @ 0x1841C4D90).
    // The Web player uses Normal mode, where both one-shots and loops play.
    const key = toString(exactArg(args, "key"));
    if (!key) {
      this.warn("parse", "playsound key is empty");
      return;
    }
    if (!this.hasAudioKey(key)) {
      this.warn("missing_asset", `sound: ${key}`);
      return;
    }

    void this.audio.playSound({
      channel: toString(exactArg(args, "channel"), key),
      delayMs: durationMs(args, "delay"),
      key,
      loop: toBoolean(exactArg(args, "loop")),
      volume: toNumber(exactArg(args, "volume"), 1),
    });
  }
}

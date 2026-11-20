import { resolveStoryAudioByKey } from "../asset";
import {
  boxedParamString,
  convertStoryParameter,
  exactArg,
  getBool,
  getFiniteFloat,
} from "../commandParams";

import type { Context } from "../../context";
import type { CommandRegistry, CommandResult } from "../commandRegistry";
import type { StoryAudio, StoryCommandArgs } from "../types";

function stringArg(args: StoryCommandArgs, key: string): string {
  return boxedParamString(exactArg(args, key));
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
        void this.audio.stopMusic(this.durationMs(args, "fadetime"));
      },
      // CommonExecutors._ExecuteMusicVolumeCommand (2791 @ 0x1841C48D0).
      musicvolume: (args) => {
        void this.audio.setMusicVolume(
          this.volume(args),
          this.durationMs(args, "fadetime"),
        );
      },
      playsound: (args) => this.playSound(args),
      // CommonExecutors._ExecuteStopSoundCommand (2791 @ 0x1841C57D0).
      stopsound: (args) => {
        void this.audio.stopSound(
          this.soundChannel(args, stringArg(args, "key")),
          this.durationMs(args, "fadetime"),
        );
      },
      // CommonExecutors._ExecuteSoundVolumeCommand (2791 @ 0x1841C5170).
      soundvolume: (args) => {
        void this.audio.setSoundVolume(
          this.soundChannel(args),
          this.volume(args),
          this.durationMs(args, "fadetime"),
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

  private durationMs(
    args: StoryCommandArgs,
    key: string,
    fallback = 0,
  ): number {
    return (
      (getFiniteFloat(args, key, this.context.audioVariables) ?? fallback) *
      1000
    );
  }

  private volume(args: StoryCommandArgs): number {
    return getFiniteFloat(args, "volume", this.context.audioVariables) ?? 1;
  }

  private soundChannel(args: StoryCommandArgs, key = ""): string {
    // _GenAVGSoundChannelName (2791 @ 0x1841C5C60) receives the substituted
    // explicit channel or key. Keep the original key for Web URL resolution.
    // GetString (0x1869417D0) uses the key default only when channel is absent.
    const channel = exactArg(args, "channel");
    return boxedParamString(
      convertStoryParameter(
        channel === undefined ? key : channel,
        this.context.audioVariables,
      ),
    );
  }

  private playMusic(args: StoryCommandArgs): void {
    // CommonExecutors._ExecutePlayMusicCommand (2791 @ 0x1841C4A30).
    // Submit even an unresolved key so the backend can retire the old track.
    const key = stringArg(args, "key");
    if (!key) this.warn("parse", "playmusic key is empty");
    else if (!this.hasAudioKey(key))
      this.warn("missing_asset", `music: ${key}`);

    const intro = stringArg(args, "intro");
    const introKey = boxedParamString(
      convertStoryParameter(intro, this.context.audioVariables),
    );
    if (introKey && !this.hasAudioKey(intro))
      this.warn("missing_asset", `music intro: ${intro}`);

    void this.audio.playMusic({
      crossfadeMs: this.durationMs(args, "crossfade", 0.4),
      delayMs: this.durationMs(args, "delay"),
      intro: introKey ? intro : undefined,
      key,
      volume: this.volume(args),
    });
  }

  private playSound(args: StoryCommandArgs): void {
    // CommonExecutors._ExecutePlaySoundCommand (2791 @ 0x1841C4D90).
    // The Web player uses Normal mode, where both one-shots and loops play.
    const key = stringArg(args, "key");
    if (!key) this.warn("parse", "playsound key is empty");
    else if (!this.hasAudioKey(key))
      this.warn("missing_asset", `sound: ${key}`);

    void this.audio.playSound({
      channel: this.soundChannel(args, key),
      delayMs: this.durationMs(args, "delay"),
      key,
      loop: getBool(args, "loop", this.context.audioVariables),
      volume: this.volume(args),
    });
  }
}

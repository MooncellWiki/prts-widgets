import { Assets } from "pixi.js";

import { resolveStoryAudioByKey } from "./asset";

import type { Context } from "../context";
import type { PlayMusicInput, PlaySoundInput, StoryAudio } from "./types";
import type { IMediaInstance, Sound } from "@pixi/sound";

function nowMs(): number {
  if (typeof performance !== "undefined") return performance.now();
  return Date.now();
}

interface ActivePlayback {
  identity: string;
  instance: IMediaInstance | null;
  sound: Sound;
}

export class HtmlStoryAudio implements StoryAudio {
  private readonly context: Context;
  private destroyed = false;
  private musicAudio: ActivePlayback | null = null;
  /**
   * Native provenance: `_ExecuteStopMusicCommand` fades the MUSIC channel but
   * keeps it registered in `AudioManager.m_channels` until the fade ends, so
   * a musicvolume/playmusic landing inside the fade window still resolves the
   * channel and `AudioChannel.TweenVolume` clears `m_stopWhenTweenEnd` — the
   * pending stop is cancelled. Holds the fading playback while it is still
   * addressable; `null` once the fade completes or is superseded.
   */
  private musicPendingStop: ActivePlayback | null = null;
  private musicRequestId = 0;
  /**
   * Native provenance: `Torappu.AVG.CommonExecutors._ExecutePlayMusicCommand`,
   * `_ExecuteMusicVolumeCommand`, `_ExecutePlaySoundCommand`,
   * `_ExecuteSoundVolumeCommand`, `_ExecuteStopMusicCommand`, and
   * `_ExecuteStopSoundCommand`; downstream `AudioManager` / `AudioChannel`.
   *
   * Ports persistent MUSIC and `avgsound_<channel>` base-volume state so a
   * following volume/stop command observes an in-flight async web load. PIXI
   * loading and browser playback are web adaptations of the native backend.
   *
   */
  private musicBaseVolume = 1;
  /**
   * Native provenance: `AudioChannel.TweenVolume` (`0x183edef70`) replaces the
   * whole tween state (start/target volume, start/end time) and clears
   * `m_stopWhenTweenEnd`, so the newest fade command supersedes any in-flight
   * fade — including one that was going to stop the channel. Modeled by
   * invalidating the previous fade's token per playback.
   */
  private readonly fadeTokens = new WeakMap<ActivePlayback, object>();
  private readonly soundBaseVolumes = new Map<string, number>();
  private readonly soundRequestIds = new Map<string, number>();
  private readonly soundCache = new Map<string, Sound>();
  private readonly soundChannels = new Map<string, ActivePlayback>();

  constructor(context: Context) {
    this.context = context;
  }

  destroy(): void {
    this.destroyed = true;

    this.stopPlayback(this.musicAudio);
    this.musicAudio = null;
    this.musicPendingStop = null;

    for (const sound of this.soundChannels.values()) this.stopPlayback(sound);
    this.soundChannels.clear();
    this.soundBaseVolumes.clear();
    this.soundRequestIds.clear();
  }

  async playMusic(input: PlayMusicInput): Promise<void> {
    if (this.destroyed) return;

    const mainUrl = this.resolveAudioUrl(input.key);
    if (!mainUrl) return;

    const introUrl = input.intro ? this.resolveAudioUrl(input.intro) : null;
    const identity = `${introUrl ?? ""}\n${mainUrl}`;
    this.musicBaseVolume = input.volume;
    if (this.musicAudio?.identity === identity) {
      // Native provenance: `_PlayAudio` (a) fast path — `set_volume` retargets
      // the same playing channel instantly and drops a mid-fade stop request
      // (`m_stopWhenTweenEnd` is cleared by the replaced tween).
      this.cancelPendingMusicStop(this.musicAudio);
      this.setVolume(this.musicAudio, input.volume);
      return;
    }

    const requestId = ++this.musicRequestId;
    if (input.delayMs > 0)
      await new Promise((resolve) => setTimeout(resolve, input.delayMs));
    if (this.destroyed || requestId !== this.musicRequestId) return;

    const next = await this.createPlayback(introUrl ?? mainUrl, identity);
    if (!next || this.destroyed || requestId !== this.musicRequestId) return;

    const previous = this.musicAudio;
    const crossfade = previous !== null && input.crossfadeMs > 10;
    this.musicAudio = next;
    const instance = await this.playPlayback(next, {
      complete: introUrl
        ? () => {
            if (this.destroyed || this.musicAudio !== next) return;
            // Native provenance: `AudioManager.PlayMusic` / `AudioChannel`.
            // Preserve the current channel base volume while switching from
            // intro to loop, so an intervening musicvolume command is retained.
            void this.playLoopMusic(mainUrl, identity, requestId);
          }
        : undefined,
      loop: !introUrl,
      volume: crossfade ? 0 : this.musicBaseVolume,
    });
    // A stopmusic/playmusic landing while `play()` was still pending cannot
    // reach this instance through `next` yet, so releasing ownership without
    // stopping it here would leave a looping track nothing can ever silence.
    const claimed = this.claimPlayback(
      next,
      instance,
      this.musicAudio === next,
    );
    if (claimed && crossfade)
      void this.fadeVolume(next, this.musicBaseVolume, input.crossfadeMs);

    if (previous) {
      if (crossfade) void this.fadeAndStop(previous, input.crossfadeMs);
      else this.stopPlayback(previous);
    }
  }

  async stopMusic(fadeMs: number): Promise<void> {
    this.musicRequestId++;
    const current = this.musicAudio;
    if (!current) return;

    // Native provenance: the fading MUSIC channel stays registered (see
    // `musicPendingStop`), so keep it addressable until the fade either
    // completes (channel stops and is released) or is superseded.
    this.musicPendingStop = current;
    const stopped = await this.fadeAndStop(current, fadeMs);
    if (this.musicPendingStop !== current) return; // taken over by a newer fade
    this.musicPendingStop = null;
    if (stopped && this.musicAudio === current) this.musicAudio = null;
  }

  async playSound(input: PlaySoundInput): Promise<void> {
    if (this.destroyed) return;

    const url = this.resolveAudioUrl(input.key);
    if (!url) return;

    // Native provenance: `CommonExecutors._GenAVGSoundChannelName` and
    // `_ExecutePlaySoundCommand`. Ports deterministic channel ownership before
    // playback begins, so a following soundvolume/stopsound targets this sound.
    const channel = this.soundChannelName(input.channel);
    const requestId = (this.soundRequestIds.get(channel) ?? 0) + 1;
    this.soundRequestIds.set(channel, requestId);
    this.soundBaseVolumes.set(channel, input.volume);

    if (input.delayMs > 0)
      await new Promise((resolve) => setTimeout(resolve, input.delayMs));
    if (this.destroyed || this.soundRequestIds.get(channel) !== requestId)
      return;

    const prev = this.soundChannels.get(channel);
    if (prev) {
      this.stopPlayback(prev);
      this.soundChannels.delete(channel);
    }

    const sound = await this.createPlayback(url, url);
    if (
      !sound ||
      this.destroyed ||
      this.soundRequestIds.get(channel) !== requestId
    )
      return;
    this.soundChannels.set(channel, sound);

    const instance = await this.playPlayback(sound, {
      complete: input.loop
        ? undefined
        : () => {
            if (this.soundChannels.get(channel) === sound)
              this.soundChannels.delete(channel);
          },
      loop: input.loop,
      volume: this.soundBaseVolumes.get(channel) ?? input.volume,
    });

    // A stopsound/playsound landing while `play()` was still pending cannot
    // reach this instance through `sound` yet, so releasing ownership without
    // stopping it here would leave a looping sound nothing can ever silence.
    this.claimPlayback(
      sound,
      instance,
      this.soundChannels.get(channel) === sound,
    );
  }

  async stopSound(channel: string, fadeMs: number): Promise<void> {
    const channelName = this.soundChannelName(channel);
    // Web adaptation: cancellation also covers pending PIXI loads. The native
    // command resolves the same named channel through AudioManager.
    this.soundRequestIds.set(
      channelName,
      (this.soundRequestIds.get(channelName) ?? 0) + 1,
    );
    this.soundBaseVolumes.delete(channelName);

    const sound = this.soundChannels.get(channelName);
    if (!sound) return;

    this.soundChannels.delete(channelName);
    await this.fadeAndStop(sound, fadeMs);
  }

  async setSoundVolume(
    channel: string,
    volume: number,
    fadeMs: number,
  ): Promise<void> {
    const channelName = this.soundChannelName(channel);
    this.soundBaseVolumes.set(channelName, volume);

    const sound = this.soundChannels.get(channelName);
    if (!sound) return;

    await this.fadeVolume(sound, volume, fadeMs);
  }

  async setMusicVolume(volume: number, fadeMs: number): Promise<void> {
    // Native provenance: `CommonExecutors._ExecuteMusicVolumeCommand` and
    // `AudioChannel.TweenVolume`. MUSIC base volume outlives a playback instance,
    // so retain it while PIXI is still loading.
    this.musicBaseVolume = volume;
    const current = this.musicAudio;
    if (!current) return;

    // Native: the MUSIC channel is still resolvable during a stopmusic fade
    // (`GetMusicChannel` hits `m_channels`); `TweenVolume` clears
    // `m_stopWhenTweenEnd`, cancelling the pending stop, and retargets the
    // tween from the current mid-fade volume — the track keeps playing.
    this.cancelPendingMusicStop(current);

    await this.fadeVolume(current, volume, fadeMs);
  }

  private async createPlayback(
    url: string,
    identity: string,
  ): Promise<ActivePlayback | null> {
    const sound = await this.getSound(url);
    if (!sound) return null;

    return {
      identity,
      instance: null,
      sound,
    };
  }

  private async fadeVolume(
    playback: ActivePlayback,
    targetVolume: number,
    durationMs: number,
  ): Promise<void> {
    await this.runFade(
      playback,
      targetVolume,
      durationMs,
      this.beginFade(playback),
    );
  }

  private async runFade(
    playback: ActivePlayback,
    targetVolume: number,
    durationMs: number,
    token: object,
  ): Promise<void> {
    const startVolume = this.getVolume(playback);
    if (durationMs <= 0) {
      this.setVolume(playback, targetVolume);
      return;
    }

    const start = nowMs();

    await new Promise<void>((resolve) => {
      const tick = () => {
        if (this.destroyed || !this.ownsFade(playback, token)) {
          resolve();
          return;
        }

        const elapsed = nowMs() - start;
        const progress = Math.min(1, elapsed / durationMs);
        this.setVolume(
          playback,
          startVolume + (targetVolume - startVolume) * progress,
        );

        if (progress >= 1) {
          resolve();
          return;
        }

        requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
    });
  }

  private async playLoopMusic(
    url: string,
    identity: string,
    requestId: number,
  ): Promise<void> {
    const music = await this.createPlayback(url, identity);
    if (!music || this.destroyed || requestId !== this.musicRequestId) return;
    this.musicAudio = music;
    const instance = await this.playPlayback(music, {
      loop: true,
      volume: this.musicBaseVolume,
    });
    this.claimPlayback(music, instance, this.musicAudio === music);
  }

  /**
   * Fade to silence, then stop — unless a newer fade (a musicvolume retarget
   * or a same-track playmusic fast path) took over the playback mid-fade.
   * Native provenance: `AudioChannel.Update` only stops the channel when the
   * tween ends with `m_stopWhenTweenEnd` still set.
   */
  private async fadeAndStop(
    playback: ActivePlayback,
    durationMs: number,
  ): Promise<boolean> {
    const token = this.beginFade(playback);
    await this.runFade(playback, 0, durationMs, token);
    if (this.destroyed || !this.ownsFade(playback, token)) return false;
    this.stopPlayback(playback);
    return true;
  }

  /**
   * Cancel a pending stopmusic fade on `playback` and retire its fade loop.
   * Native provenance: `AudioChannel.TweenVolume` clears `m_stopWhenTweenEnd`.
   */
  private cancelPendingMusicStop(playback: ActivePlayback): void {
    if (this.musicPendingStop !== playback) return;
    this.musicPendingStop = null;
    this.beginFade(playback);
  }

  private beginFade(playback: ActivePlayback): object {
    const token = {};
    this.fadeTokens.set(playback, token);
    return token;
  }

  private ownsFade(playback: ActivePlayback, token: object): boolean {
    return this.fadeTokens.get(playback) === token;
  }

  private soundChannelName(channel: string): string {
    return `avgsound_${channel}`;
  }

  private getVolume(playback: ActivePlayback): number {
    return playback.instance?.volume ?? 1;
  }

  private setVolume(playback: ActivePlayback, volume: number): void {
    if (playback.instance) playback.instance.volume = volume;
  }

  /**
   * Hand `instance` to `playback` only while it still owns its channel.
   * Otherwise stop it right here: an instance that was never written back is
   * unreachable from `stopPlayback`, which reads `playback.instance`.
   */
  private claimPlayback(
    playback: ActivePlayback,
    instance: IMediaInstance | null,
    stillOwned: boolean,
  ): boolean {
    if (this.destroyed || !stillOwned) {
      instance?.stop();
      return false;
    }

    playback.instance = instance;
    return true;
  }

  private stopPlayback(playback: ActivePlayback | null): void {
    if (!playback) return;

    playback.instance?.stop();
    playback.instance = null;
  }

  private async getSound(url: string): Promise<Sound | null> {
    const existing = this.soundCache.get(url);
    if (existing) return existing;

    const cached = Assets.get<Sound>(url);
    if (cached) {
      this.soundCache.set(url, cached);
      return cached;
    }

    try {
      const loaded = await Assets.load<Sound>(url);
      this.soundCache.set(url, loaded);
      return loaded;
    } catch {
      return null;
    }
  }

  private async playPlayback(
    playback: ActivePlayback,
    options: Parameters<Sound["play"]>[0],
  ): Promise<IMediaInstance | null> {
    try {
      const result = playback.sound.play(options);
      if (result instanceof Promise) return await result.catch(() => null);
      return result;
    } catch {
      return null;
    }
  }

  private resolveAudioUrl(key: string): string | null {
    const raw = resolveStoryAudioByKey(key, this.context.audioVariables);
    return raw ?? null;
  }
}

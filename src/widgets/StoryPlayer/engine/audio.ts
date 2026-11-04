import { Assets } from "pixi.js";

import { resolveStoryAudioByKey } from "./asset";

import type { Context } from "../context";
import type { PlayMusicInput, PlaySoundInput, StoryAudio } from "./types";
import type { IMediaInstance, Sound } from "@pixi/sound";

function nowMs(): number {
  if (typeof performance !== "undefined") return performance.now();
  return Date.now();
}

// AudioChannel.Stop takes the immediate branch at or below 0.01 seconds.
const INSTANT_STOP_MS = 10;

interface ActivePlayback {
  fadeGeneration: number;
  volume: number;
  identity: string;
  instance: IMediaInstance | null;
  sound: Sound;
}

export class HtmlStoryAudio implements StoryAudio {
  private readonly context: Context;
  private destroyed = false;
  private musicAudio: ActivePlayback | null = null;
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
  private readonly soundBaseVolumes = new Map<string, number>();
  private readonly soundRequestIds = new Map<string, number>();
  private readonly soundCache = new Map<string, Sound>();
  private readonly soundChannels = new Map<string, ActivePlayback>();
  /**
   * Native provenance: `CommonExecutors.m_allSoundChannels`. playsound adds its
   * channel as the command executes (before any delay), stopsound removes it,
   * and `_ResetAudio` sweeps only what is left. A channel the script already
   * stopped keeps its own fade instead of being cut to the reset fade.
   */
  private readonly avgSoundChannels = new Set<string>();

  // Renamed/outgoing channels still belong to the player until their fade ends.
  private readonly retiring = new Set<ActivePlayback>();

  constructor(context: Context) {
    this.context = context;
  }

  destroy(): void {
    this.destroyed = true;

    this.stopPlayback(this.musicAudio);
    this.musicAudio = null;

    for (const sound of this.soundChannels.values()) this.stopPlayback(sound);
    for (const sound of this.retiring) this.stopPlayback(sound);
    this.retiring.clear();
    this.soundChannels.clear();
    this.avgSoundChannels.clear();
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
      await this.fadeVolume(this.musicAudio, input.volume, 0);
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
    next.volume = crossfade ? 0 : this.musicBaseVolume;
    if (previous)
      void this.retirePlayback(previous, crossfade ? input.crossfadeMs : 0);

    const instance = await this.playPlayback(next, {
      complete: introUrl
        ? () => {
            next.instance = null;
            if (!this.destroyed && this.musicAudio === next)
              void this.playLoopMusic(next, mainUrl);
          }
        : undefined,
      loop: !introUrl,
      volume: next.volume,
    });
    // A stopmusic/playmusic landing while `play()` was still pending cannot
    // reach this instance through `next` yet, so releasing ownership without
    // stopping it here would leave a looping track nothing can ever silence.
    const claimed = this.claimPlayback(
      next,
      instance,
      this.musicAudio === next,
    );
    if (claimed && crossfade && next.fadeGeneration === 0)
      void this.fadeVolume(next, this.musicBaseVolume, input.crossfadeMs);
  }

  async stopMusic(fadeMs: number): Promise<void> {
    this.musicRequestId++;
    const current = this.musicAudio;
    if (!current) return;

    await this.fadeAndStop(current, fadeMs, () => {
      if (this.musicAudio === current) this.musicAudio = null;
    });
  }

  async playSound(input: PlaySoundInput): Promise<void> {
    if (this.destroyed) return;

    const url = this.resolveAudioUrl(input.key);
    if (!url) return;

    // Native provenance: `CommonExecutors._GenAVGSoundChannelName` and
    // `_ExecutePlaySoundCommand`. Ports deterministic channel ownership before
    // playback begins, so a following soundvolume/stopsound targets this sound
    // and the end-of-story `_ResetAudio` sweep reaches a still-delayed one.
    const channel = this.soundChannelName(input.channel);
    const requestId = (this.soundRequestIds.get(channel) ?? 0) + 1;
    this.soundRequestIds.set(channel, requestId);
    this.soundBaseVolumes.set(channel, input.volume);
    this.avgSoundChannels.add(channel);

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
    sound.volume = this.soundBaseVolumes.get(channel) ?? input.volume;

    const instance = await this.playPlayback(sound, {
      complete: input.loop
        ? undefined
        : () => {
            // PIXI recycles completed instances. Retire any tween still writing to it.
            sound.fadeGeneration++;
            sound.instance = null;
            if (this.soundChannels.get(channel) === sound)
              this.soundChannels.delete(channel);
          },
      loop: input.loop,
      volume: sound.volume,
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
    this.avgSoundChannels.delete(channelName);

    const sound = this.soundChannels.get(channelName);
    if (!sound) return;

    await this.fadeAndStop(sound, fadeMs, () => {
      if (this.soundChannels.get(channelName) === sound)
        this.soundChannels.delete(channelName);
    });
  }

  /**
   * Native `_ResetAudio` fades every channel it stops with the serialized
   * `_soundDefaultFadeTime` = 0.5s, measured off the AVGController prefab's
   * `panel_common_executors` node — identical on Android 2.7.61 APK
   * (sharedassets1.assets, MonoBehaviour path_id 4091) and the live PC 2.7.91
   * client (sharedassets1.assets, path_id 4283, file MD5 matches the CDN
   * manifest).
   */
  resetAudio(): void {
    // Native provenance: `CommonExecutors.OnReset -> _ResetAudio` (2791 VA
    // 0x1841C6200): StopChannel(name, 0.5) for each name in
    // m_allSoundChannels -> AudioChannel.Stop 0.5s linear fade-out, then the
    // set is cleared. MUSIC is global and untouched.
    //
    // Web adaptation: native PlayAudio creates the channel at command time and
    // only defers playback by `delay`, so the same Stop also kills a playsound
    // still inside its delay. Here such a request has no ActivePlayback yet;
    // bumping its requestId cancels it (and any in-flight PIXI load) instead.
    for (const channelName of this.avgSoundChannels) {
      this.soundRequestIds.set(
        channelName,
        (this.soundRequestIds.get(channelName) ?? 0) + 1,
      );
      this.soundBaseVolumes.delete(channelName);

      const sound = this.soundChannels.get(channelName);
      if (!sound) continue;
      void this.fadeAndStop(sound, 500, () => {
        if (this.soundChannels.get(channelName) === sound)
          this.soundChannels.delete(channelName);
      });
    }
    this.avgSoundChannels.clear();
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
    if (!this.musicAudio) return;

    await this.fadeVolume(this.musicAudio, volume, fadeMs);
  }

  private async createPlayback(
    url: string,
    identity: string,
  ): Promise<ActivePlayback | null> {
    const sound = await this.getSound(url);
    if (!sound) return null;

    return {
      fadeGeneration: 0,
      volume: 1,
      identity,
      instance: null,
      sound,
    };
  }

  private async fadeVolume(
    playback: ActivePlayback,
    targetVolume: number,
    durationMs: number,
    onComplete?: () => void,
  ): Promise<void> {
    // Native AudioChannel.TweenVolume replaces the entire tween, including
    // m_stopWhenTweenEnd. Only the current generation can write or finish it.
    const generation = ++playback.fadeGeneration;
    const startVolume = playback.volume;
    if (durationMs <= 0) {
      this.setVolume(playback, targetVolume);
      onComplete?.();
      return;
    }

    const start = nowMs();

    await new Promise<void>((resolve) => {
      const tick = () => {
        if (this.destroyed || playback.fadeGeneration !== generation) {
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
          onComplete?.();
          resolve();
          return;
        }

        requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
    });
  }

  private async playLoopMusic(
    music: ActivePlayback,
    url: string,
  ): Promise<void> {
    // AudioChannel keeps its tween and stop state across the intro/loop
    // boundary. Only the PIXI media instance changes.
    const sound = await this.getSound(url);
    if (!sound || this.destroyed || this.musicAudio !== music) return;
    music.sound = sound;
    const instance = await this.playPlayback(music, {
      loop: true,
      volume: music.volume,
    });
    this.claimPlayback(music, instance, this.musicAudio === music);
  }

  private fadeAndStop(
    playback: ActivePlayback,
    durationMs: number,
    release?: () => void,
  ): Promise<void> {
    // AudioChannel.Stop keeps the channel addressable until an uninterrupted
    // fade reaches zero. A later TweenVolume replaces its stop callback.
    return this.fadeVolume(
      playback,
      0,
      durationMs <= INSTANT_STOP_MS ? 0 : durationMs,
      () => {
        this.stopPlayback(playback);
        release?.();
      },
    );
  }

  private async retirePlayback(
    playback: ActivePlayback,
    fadeMs: number,
  ): Promise<void> {
    this.retiring.add(playback);
    await this.fadeAndStop(playback, fadeMs);
    this.retiring.delete(playback);
  }

  private soundChannelName(channel: string): string {
    return `avgsound_${channel}`;
  }

  private setVolume(playback: ActivePlayback, volume: number): void {
    playback.volume = volume;
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
    if (instance) instance.volume = playback.volume;
    return true;
  }

  private stopPlayback(playback: ActivePlayback | null): void {
    if (!playback) return;

    playback.fadeGeneration++;
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

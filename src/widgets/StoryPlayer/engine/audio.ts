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

interface Playback {
  fadeGeneration: number;
  volume: number;
  instance: IMediaInstance | null;
}

interface MusicPlayback extends Playback {
  introKey: string;
  loopKey: string;
}

/**
 * Fallback identity for a key that resolves to no URL. Resolved URLs already
 * lowercase game assets and keep the case of Web URLs and @paths.
 */
function musicAssetIdentity(rawKey: string): string {
  const key = rawKey.trim();
  return /^(?:@|https?:\/\/)/i.test(key) ? key : key.toLowerCase();
}

/**
 * Native provenance: the music and sound commands in
 * `Torappu.AVG.CommonExecutors` use `AudioManager` and `AudioChannel`.
 * A logical channel carries the base volume independently of its PIXI instance.
 */
export class HtmlStoryAudio implements StoryAudio {
  private readonly context: Context;
  private destroyed = false;
  private musicAudio: MusicPlayback | null = null;
  private readonly soundBaseVolumes = new Map<string, number>();
  private readonly soundRequestIds = new Map<string, number>();
  private readonly soundCache = new Map<string, Sound>();
  private readonly soundChannels = new Map<string, Playback>();
  /**
   * Native provenance: `CommonExecutors.m_allSoundChannels`. playsound adds its
   * channel as the command executes (before any delay), stopsound removes it,
   * and `_ResetAudio` sweeps only what is left. A channel the script already
   * stopped keeps its own fade instead of being cut to the reset fade.
   */
  private readonly avgSoundChannels = new Set<string>();

  // Renamed/outgoing channels still belong to the player until their fade ends.
  private readonly retiring = new Set<MusicPlayback>();

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

    // AssetMusicInfo.IsSameAudio compares the substituted intro/loop asset
    // paths with OrdinalIgnoreCase, so story variables aliasing one asset
    // name the same music. Compare resolved URLs, not raw script keys.
    const mainUrl = this.resolveAudioUrl(input.key);
    const introUrl = input.intro ? this.resolveAudioUrl(input.intro) : null;
    const introKey = input.intro
      ? (introUrl ?? musicAssetIdentity(input.intro))
      : "";
    const loopKey = mainUrl ?? musicAssetIdentity(input.key);
    const previous = this.musicAudio;
    if (previous?.introKey === introKey && previous.loopKey === loopKey) {
      await this.fadeVolume(previous, input.volume, 0);
      return;
    }

    // AudioManager._PlayAudio<MusicParam> renames and stops the outgoing
    // channel before loading its successor. The successor owns MUSIC while
    // its playback is scheduled (2791 VA 0x184675C8E).
    if (previous) {
      this.musicAudio = null;
      this.retiring.add(previous);
      void this.fadeOutMusic(previous, input.crossfadeMs);
    }

    if (!mainUrl) return;
    const crossfade = previous !== null && input.crossfadeMs > INSTANT_STOP_MS;
    const next: MusicPlayback = {
      fadeGeneration: 0,
      introKey,
      loopKey,
      instance: null,
      volume: crossfade ? 0 : input.volume,
    };
    this.musicAudio = next;

    const startTime =
      nowMs() + input.delayMs + (crossfade ? input.crossfadeMs : 0);
    if (crossfade)
      void this.fadeVolume(next, input.volume, input.crossfadeMs, {
        startTime,
      });
    await this.playMusicClip(
      next,
      introUrl ?? mainUrl,
      introUrl ? mainUrl : undefined,
      startTime,
    );
  }

  async stopMusic(fadeMs: number): Promise<void> {
    if (this.musicAudio) await this.fadeOutMusic(this.musicAudio, fadeMs);
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

    const clip = await this.getSound(url);
    if (
      !clip ||
      this.destroyed ||
      this.soundRequestIds.get(channel) !== requestId
    )
      return;
    const sound: Playback = {
      fadeGeneration: 0,
      instance: null,
      volume: this.soundBaseVolumes.get(channel) ?? input.volume,
    };
    this.soundChannels.set(channel, sound);

    const instance = await this.playPlayback(clip, {
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
    // still inside its delay. Here such a request has no Playback yet;
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
    // `AudioChannel.TweenVolume`. The new tween replaces a scheduled fade-in
    // and starts now, including while the clip is still waiting to play.
    if (!this.musicAudio) return;

    await this.fadeVolume(this.musicAudio, volume, fadeMs);
  }

  private async fadeVolume(
    playback: Playback,
    targetVolume: number,
    durationMs: number,
    {
      startTime = nowMs(),
      onComplete,
    }: { startTime?: number; onComplete?: () => void } = {},
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

    await new Promise<void>((resolve) => {
      const tick = () => {
        if (this.destroyed || playback.fadeGeneration !== generation) {
          resolve();
          return;
        }

        const elapsed = nowMs() - startTime;
        const progress = Math.max(0, Math.min(1, elapsed / durationMs));
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

  private async playMusicClip(
    music: MusicPlayback,
    url: string,
    loopUrl?: string,
    startTime = nowMs(),
  ): Promise<void> {
    // Load during the wait. A slow load can delay the browser's start, while
    // the volume tween still runs on the channel's command-time clock.
    const clip = await this.getSound(url);
    if (!this.ownsMusic(music)) return;
    if (!clip) {
      await this.fadeOutMusic(music, 0);
      return;
    }

    const remainingMs = startTime - nowMs();
    if (remainingMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, remainingMs));
      if (!this.ownsMusic(music)) return;
    }

    // UnityAudioSchedule plays the loop on the same logical channel. Renaming
    // the channel for fade-out leaves that transition scheduled.
    const instance = await this.playPlayback(clip, {
      complete: loopUrl
        ? () => {
            music.instance = null;
            if (this.ownsMusic(music)) void this.playMusicClip(music, loopUrl);
          }
        : undefined,
      loop: !loopUrl,
      volume: music.volume,
    });
    this.claimPlayback(music, instance, this.ownsMusic(music));
    if (!instance && this.ownsMusic(music)) await this.fadeOutMusic(music, 0);
  }

  private ownsMusic(playback: MusicPlayback): boolean {
    return (
      !this.destroyed &&
      (this.musicAudio === playback || this.retiring.has(playback))
    );
  }

  private fadeAndStop(
    playback: Playback,
    durationMs: number,
    release?: () => void,
  ): Promise<void> {
    // AudioChannel.Stop keeps the channel addressable until an uninterrupted
    // fade reaches zero. A later TweenVolume replaces its stop callback.
    return this.fadeVolume(
      playback,
      0,
      durationMs <= INSTANT_STOP_MS ? 0 : durationMs,
      {
        onComplete: () => {
          release?.();
          this.stopPlayback(playback);
        },
      },
    );
  }

  private fadeOutMusic(playback: MusicPlayback, fadeMs: number): Promise<void> {
    return this.fadeAndStop(playback, fadeMs, () => {
      if (this.musicAudio === playback) this.musicAudio = null;
      this.retiring.delete(playback);
    });
  }

  private soundChannelName(channel: string): string {
    return `avgsound_${channel}`;
  }

  private setVolume(playback: Playback, volume: number): void {
    playback.volume = volume;
    if (playback.instance) playback.instance.volume = volume;
  }

  /**
   * Hand `instance` to `playback` only while it still owns its channel.
   * Otherwise stop it right here: an instance that was never written back is
   * unreachable from `stopPlayback`, which reads `playback.instance`.
   */
  private claimPlayback(
    playback: Playback,
    instance: IMediaInstance | null,
    stillOwned: boolean,
  ): void {
    if (this.destroyed || !stillOwned) {
      instance?.stop();
      return;
    }

    playback.instance = instance;
    if (instance) instance.volume = playback.volume;
  }

  private stopPlayback(playback: Playback | null): void {
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
    clip: Sound,
    options: Parameters<Sound["play"]>[0],
  ): Promise<IMediaInstance | null> {
    try {
      const result = clip.play(options);
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

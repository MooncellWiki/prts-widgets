import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveStoryAudioByKey } from "../src/widgets/StoryPlayer/engine/asset";
import { HtmlStoryAudio } from "../src/widgets/StoryPlayer/engine/audio";
import { StoryRuntime } from "../src/widgets/StoryPlayer/engine/runtime";

import {
  FakeSound,
  flush,
  loads,
  preloaded,
  preloadSound,
  settleLoad,
  settlePlayback,
} from "./helpers/fakePixiSound";
import { createContext, FakeRenderer } from "./helpers/runtimeFakes";

import type { Context } from "../src/widgets/StoryPlayer/context";

vi.mock("pixi.js", async () => ({
  Assets: (await import("./helpers/fakePixiSound")).fakeAssets,
}));

const context = { linkMap: {}, script: [] } satisfies Context;

describe("HtmlStoryAudio", () => {
  beforeEach(() => {
    loads.length = 0;
  });

  it("stops a sound instance that lost its channel while play() was pending", async () => {
    const audio = new HtmlStoryAudio(context);
    void audio.playSound({
      channel: "c",
      delayMs: 0,
      key: "k",
      loop: true,
      volume: 1,
    });

    await flush();
    const sound = settleLoad();
    await flush();

    // stopsound lands after the channel was claimed but before `play()`
    // resolved, so `sound.instance` is still null and unreachable.
    void audio.stopSound("c", 0);
    const instance = sound.settlePlay();
    await flush();

    expect(instance.stopped).toBe(1);
  });

  it("stops a music instance that lost the channel while play() was pending", async () => {
    const audio = new HtmlStoryAudio(context);
    void audio.playMusic({ crossfadeMs: 0, delayMs: 0, key: "k", volume: 1 });

    await flush();
    const sound = settleLoad();
    await flush();

    void audio.stopMusic(0);
    const instance = sound.settlePlay();
    await flush();

    expect(instance.stopped).toBe(1);
  });

  it("keeps the instance when the channel is still owned", async () => {
    const audio = new HtmlStoryAudio(context);
    void audio.playSound({
      channel: "c",
      delayMs: 0,
      key: "k",
      loop: true,
      volume: 1,
    });

    await flush();
    const sound = settleLoad();
    await flush();
    const instance = sound.settlePlay();
    await flush();

    expect(instance.stopped).toBe(0);

    await audio.stopSound("c", 0);
    expect(instance.stopped).toBe(1);
  });
});

describe("playmusic scheduling", () => {
  beforeEach(() => {
    loads.length = 0;
    vi.useFakeTimers({
      toFake: ["performance", "requestAnimationFrame", "setTimeout"],
    });
  });

  afterEach(() => {
    preloaded.clear();
    vi.useRealTimers();
  });

  async function startTrack(audio: HtmlStoryAudio, key: string) {
    void audio.playMusic({ key, volume: 1, crossfadeMs: 0, delayMs: 0 });
    return (await settlePlayback()).instance;
  }

  function queueNextTrack(audio: HtmlStoryAudio) {
    void audio.playMusic({
      key: "b",
      volume: 1,
      crossfadeMs: 320,
      delayMs: 640,
    });
    return settleLoad();
  }

  it("fades out now, then starts the new track after delay + crossfade", async () => {
    const audio = new HtmlStoryAudio(context);
    const first = await startTrack(audio, "a");
    const nextClip = queueNextTrack(audio);

    await vi.advanceTimersByTimeAsync(160);
    expect(first.volume).toBeCloseTo(0.5);
    await vi.advanceTimersByTimeAsync(160);
    expect(first.stopped).toBe(1);
    await vi.advanceTimersByTimeAsync(639);
    expect(nextClip.playCalls).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    const { instance: next } = await settlePlayback(nextClip);
    expect(next.volume).toBe(0);
    await vi.advanceTimersByTimeAsync(160);
    expect(next.volume).toBeCloseTo(0.5);
    await vi.advanceTimersByTimeAsync(160);
    expect(next.volume).toBe(1);
  });

  it("replaces the pending fade-in with an immediate musicvolume", async () => {
    const audio = new HtmlStoryAudio(context);
    const first = await startTrack(audio, "a");
    const nextClip = queueNextTrack(audio);
    await vi.advanceTimersByTimeAsync(160);
    await audio.setMusicVolume(0.8, 0);
    expect(first.volume).toBeCloseTo(0.5);

    await vi.advanceTimersByTimeAsync(800);
    const { instance } = await settlePlayback(nextClip);
    expect(instance.volume).toBe(0.8);
    await vi.advanceTimersByTimeAsync(320);
    expect(instance.volume).toBe(0.8);
  });

  it("runs a replacement musicvolume tween on the waiting channel", async () => {
    const audio = new HtmlStoryAudio(context);
    await startTrack(audio, "a");
    const nextClip = queueNextTrack(audio);
    await vi.advanceTimersByTimeAsync(800);
    void audio.setMusicVolume(0.8, 320);

    await vi.advanceTimersByTimeAsync(160);
    const { instance } = await settlePlayback(nextClip);
    expect(instance.volume).toBeCloseTo(0.4);
    await vi.advanceTimersByTimeAsync(160);
    expect(instance.volume).toBe(0.8);
  });

  it("keeps the pending start time when playmusic repeats the same track", async () => {
    const audio = new HtmlStoryAudio(context);
    await startTrack(audio, "a");
    const nextClip = queueNextTrack(audio);
    await vi.advanceTimersByTimeAsync(160);
    void audio.playMusic({ key: "B", volume: 0.7, crossfadeMs: 0, delayMs: 0 });

    await vi.advanceTimersByTimeAsync(799);
    expect(nextClip.playCalls).toBe(0);
    expect(loads).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    const { instance } = await settlePlayback(nextClip);
    expect(instance.volume).toBe(0.7);
  });

  it("uses the waiting MUSIC channel when switching to a third track", async () => {
    const audio = new HtmlStoryAudio(context);
    await startTrack(audio, "a");
    const secondClip = queueNextTrack(audio);
    await vi.advanceTimersByTimeAsync(160);
    void audio.playMusic({
      key: "c",
      volume: 0.7,
      crossfadeMs: 320,
      delayMs: 0,
    });
    const thirdClip = settleLoad();

    await vi.advanceTimersByTimeAsync(319);
    expect(thirdClip.playCalls).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    const { instance } = await settlePlayback(thirdClip);
    expect(instance.volume).toBe(0);
    await vi.advanceTimersByTimeAsync(800);
    expect(instance.volume).toBe(0.7);
    expect(secondClip.playCalls).toBe(0);
  });

  it("starts a delayed track during a stop fade that ends later", async () => {
    const audio = new HtmlStoryAudio(context);
    void audio.playMusic({ key: "a", volume: 1, crossfadeMs: 0, delayMs: 320 });
    const clip = settleLoad();
    await vi.advanceTimersByTimeAsync(160);
    const stopping = audio.stopMusic(640);

    await vi.advanceTimersByTimeAsync(160);
    const { instance } = await settlePlayback(clip);
    expect(instance.volume).toBeCloseTo(0.75);
    await vi.advanceTimersByTimeAsync(480);
    await stopping;
    expect(instance.stopped).toBe(1);
  });

  it("silences a scheduled track whose stop fade ends before its start", async () => {
    const audio = new HtmlStoryAudio(context);
    void audio.playMusic({ key: "a", volume: 1, crossfadeMs: 0, delayMs: 640 });
    const clip = settleLoad();
    const stopping = audio.stopMusic(320);
    await vi.advanceTimersByTimeAsync(640);
    await stopping;
    expect(clip.playCalls).toBe(0);
  });

  it("continues a retiring intro into its loop until the fade ends", async () => {
    const audio = new HtmlStoryAudio(context);
    void audio.playMusic({
      key: "a",
      intro: "a-intro",
      volume: 1,
      crossfadeMs: 0,
      delayMs: 0,
    });
    const intro = await settlePlayback();
    queueNextTrack(audio);
    await vi.advanceTimersByTimeAsync(160);

    intro.sound.complete!();
    const loop = await settlePlayback();
    expect(loop.instance.volume).toBeCloseTo(0.5);
    await vi.advanceTimersByTimeAsync(160);
    expect(loop.instance.volume).toBe(0);
    expect(loop.instance.stopped).toBe(1);
  });

  it("cuts immediately at the 10 ms threshold even if the new track has delay", async () => {
    const audio = new HtmlStoryAudio(context);
    const first = await startTrack(audio, "a");
    void audio.playMusic({
      key: "b",
      volume: 0.7,
      crossfadeMs: 10,
      delayMs: 320,
    });
    const nextClip = settleLoad();
    expect(first.stopped).toBe(1);
    await vi.advanceTimersByTimeAsync(319);
    expect(nextClip.playCalls).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    const { instance: next } = await settlePlayback(nextClip);
    expect(next.volume).toBe(0.7);
  });

  it("compares both game asset names ignoring case and cancels a stop", async () => {
    const audio = new HtmlStoryAudio({
      ...context,
      audioVariables: {
        intro: "sound_beta_2/bgm/intro",
        loop: "sound_beta_2/bgm/loop",
      },
    });
    void audio.playMusic({
      key: "$loop",
      intro: "$intro",
      volume: 1,
      crossfadeMs: 0,
      delayMs: 0,
    });
    const { instance: first } = await settlePlayback();
    void audio.stopMusic(320);
    await vi.advanceTimersByTimeAsync(160);
    void audio.playMusic({
      key: "$Loop",
      intro: "$Intro",
      volume: 0.7,
      crossfadeMs: 320,
      delayMs: 640,
    });
    expect(first.volume).toBe(0.7);
    await vi.advanceTimersByTimeAsync(1280);
    expect(loads).toHaveLength(0);
    expect(first.stopped).toBe(0);
  });

  it("treats story variables aliasing one asset as the same music", async () => {
    // story_variables.json maps both $m_bat_epic_loop and $epic_loop to this
    // asset. AssetMusicInfo.IsSameAudio compares the substituted paths.
    const loopPath = "Sound_Beta_2/Music/beta1_180603/m_bat_epic_loop";
    const audio = new HtmlStoryAudio({
      ...context,
      audioVariables: { epic_loop: loopPath, m_bat_epic_loop: loopPath },
    });
    const first = await startTrack(audio, "$m_bat_epic_loop");
    void audio.playMusic({
      key: "$epic_loop",
      volume: 0.7,
      crossfadeMs: 320,
      delayMs: 0,
    });

    expect(first.volume).toBe(0.7);
    await vi.advanceTimersByTimeAsync(640);
    expect(loads).toHaveLength(0);
    expect(first.stopped).toBe(0);
  });

  it("keeps distinct Web URLs case-sensitive", async () => {
    const audio = new HtmlStoryAudio(context);
    const first = await startTrack(
      audio,
      "https://example.com/Bgm.ogg?token=AbC",
    );
    const next = await startTrack(
      audio,
      "https://example.com/Bgm.ogg?token=aBc",
    );
    expect(first.stopped).toBe(1);
    expect(next.stopped).toBe(0);
  });

  it("keeps the scripted musicvolume fade when the first clip is already cached", async () => {
    const story = createContext([
      '[playMusic(intro="$m_sys_act1mainss_intro", key="$m_sys_act1mainss_loop", volume=0)]',
      "[musicvolume(volume=0.6, fadetime=4)]",
      '[name="A"]ok',
    ]);
    story.audioVariables = {
      m_sys_act1mainss_intro: "sound_beta_2/bgm/m_sys_act1mainss_intro",
      m_sys_act1mainss_loop: "sound_beta_2/bgm/m_sys_act1mainss_loop",
    };
    const clip = new FakeSound();
    preloaded.set(
      resolveStoryAudioByKey("$m_sys_act1mainss_intro", story.audioVariables)!,
      clip,
    );
    const audio = new HtmlStoryAudio(story);
    const runtime = new StoryRuntime(story, new FakeRenderer(), audio);
    await runtime.start();
    const { instance } = await settlePlayback(clip);
    expect(instance.volume).toBe(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(instance.volume).toBeCloseTo(0.3);
    runtime.destroy();
  });

  it("retires the old channel even when the requested key is empty", async () => {
    const audio = new HtmlStoryAudio(context);
    const first = await startTrack(audio, "a");
    await audio.playMusic({ key: "", volume: 1, crossfadeMs: 320, delayMs: 0 });
    await vi.advanceTimersByTimeAsync(160);
    expect(first.volume).toBeCloseTo(0.5);
    await vi.advanceTimersByTimeAsync(160);
    expect(first.stopped).toBe(1);
    expect(loads).toHaveLength(0);
  });

  it("releases a failed incoming channel before a retry", async () => {
    const audio = new HtmlStoryAudio(context);
    const failed = audio.playMusic({
      key: "a",
      volume: 1,
      crossfadeMs: 320,
      delayMs: 640,
    });
    loads.shift()!.reject(new Error("asset missing"));
    await failed;

    void audio.playMusic({
      key: "a",
      volume: 0.7,
      crossfadeMs: 320,
      delayMs: 0,
    });
    const { instance } = await settlePlayback();
    expect(instance.volume).toBe(0.7);
  });

  it("destroys the detached outgoing track and cancels the delayed successor", async () => {
    const audio = new HtmlStoryAudio(context);
    const first = await startTrack(audio, "a");
    const nextClip = queueNextTrack(audio);
    await vi.advanceTimersByTimeAsync(160);
    audio.destroy();
    expect(first.stopped).toBe(1);
    await vi.advanceTimersByTimeAsync(1280);
    expect(first.stopped).toBe(1);
    expect(nextClip.playCalls).toBe(0);
  });
});

describe("cancelable audio fades", () => {
  beforeEach(() => {
    loads.length = 0;
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "performance"] });
  });

  afterEach(() => vi.useRealTimers());

  function playMusic(audio: HtmlStoryAudio, key: string, volume = 1) {
    return audio.playMusic({ key, volume, crossfadeMs: 0, delayMs: 0 });
  }

  function playSound(audio: HtmlStoryAudio, key: string, volume = 1) {
    return audio.playSound({
      key,
      volume,
      channel: "c",
      loop: true,
      delayMs: 0,
    });
  }

  describe.each([
    {
      name: "music",
      play: playMusic,
      stop: (audio: HtmlStoryAudio, ms: number) => audio.stopMusic(ms),
      volume: (audio: HtmlStoryAudio, value: number, ms: number) =>
        audio.setMusicVolume(value, ms),
    },
    {
      name: "sound",
      play: playSound,
      stop: (audio: HtmlStoryAudio, ms: number) => audio.stopSound("c", ms),
      volume: (audio: HtmlStoryAudio, value: number, ms: number) =>
        audio.setSoundVolume("c", value, ms),
    },
  ])("$name channel", ({ play, stop, volume }) => {
    it("retargets a stop fade from its current volume and keeps playing", async () => {
      const audio = new HtmlStoryAudio(context);
      void play(audio, "first");
      const { instance } = await settlePlayback();

      const stopping = stop(audio, 640);
      await vi.advanceTimersByTimeAsync(320);
      expect(instance.volume).toBeCloseTo(0.5);
      const retarget = volume(audio, 0.8, 320);
      await vi.advanceTimersByTimeAsync(160);
      expect(instance.volume).toBeCloseTo(0.65);
      await vi.advanceTimersByTimeAsync(640);
      await Promise.all([stopping, retarget]);
      expect(instance.stopped).toBe(0);
      expect(instance.volume).toBeCloseTo(0.8);

      await volume(audio, 0, 0);
      await volume(audio, 0.3, 0);
      expect(instance.volume).toBe(0.3);
    });

    it("lets a second stop replace the first and releases the channel only at its end", async () => {
      const audio = new HtmlStoryAudio(context);
      void play(audio, "first");
      const { instance, sound } = await settlePlayback();
      void stop(audio, 320);
      await vi.advanceTimersByTimeAsync(160);
      const stopping = stop(audio, 640);
      await vi.advanceTimersByTimeAsync(160);
      expect(instance.stopped).toBe(0);
      await vi.advanceTimersByTimeAsync(480);
      await stopping;
      expect(instance.stopped).toBe(1);
      expect(instance.volume).toBe(0);
      await volume(audio, 0.8, 0);
      expect(instance.volume).toBe(0);

      void play(audio, "first");
      const replay = await settlePlayback(sound);
      expect(replay.instance.stopped).toBe(0);
    });

    it("stops immediately at the 10 ms boundary", async () => {
      const audio = new HtmlStoryAudio(context);
      void play(audio, "first");
      const { instance } = await settlePlayback();
      void stop(audio, 10);
      expect(instance.stopped).toBe(1);
    });

    it("stops the old playback without touching its replacement", async () => {
      const audio = new HtmlStoryAudio(context);
      void play(audio, "first");
      const first = await settlePlayback();
      void stop(audio, 320);
      await vi.advanceTimersByTimeAsync(160);
      void play(audio, "second");
      const second = await settlePlayback();
      expect(first.instance.stopped).toBe(1);
      await vi.advanceTimersByTimeAsync(320);
      expect(first.instance.stopped).toBe(1);
      await volume(audio, 0.6, 0);
      expect(second.instance.volume).toBe(0.6);
      expect(second.instance.stopped).toBe(0);
    });
  });

  it("same-track playmusic takes over a stop fade without replaying", async () => {
    const audio = new HtmlStoryAudio(context);
    void playMusic(audio, "first");
    const { instance } = await settlePlayback();
    void audio.stopMusic(320);
    await vi.advanceTimersByTimeAsync(160);
    await playMusic(audio, "first", 0.7);
    expect(instance.volume).toBe(0.7);
    await vi.advanceTimersByTimeAsync(320);
    expect(instance.stopped).toBe(0);
    expect(instance.volume).toBe(0.7);
    expect(loads).toHaveLength(0);
  });

  it("keeps an intro's volume tween through the transition to the loop after a canceled stop", async () => {
    const audio = new HtmlStoryAudio(context);
    void audio.playMusic({
      key: "loop",
      intro: "intro",
      volume: 1,
      crossfadeMs: 0,
      delayMs: 0,
    });
    const intro = await settlePlayback();
    void audio.stopMusic(320);
    await vi.advanceTimersByTimeAsync(160);
    void audio.setMusicVolume(0.9, 320);
    intro.sound.complete!();
    const loop = await settlePlayback();
    expect(loop.instance.volume).toBeCloseTo(0.5);
    await vi.advanceTimersByTimeAsync(320);
    expect(loop.instance.volume).toBeCloseTo(0.9);
    expect(loop.instance.stopped).toBe(0);
  });
});

describe("end-of-story resetAudio", () => {
  beforeEach(() => {
    loads.length = 0;
    preloaded.clear();
    vi.useFakeTimers({
      toFake: ["setTimeout", "requestAnimationFrame", "performance"],
    });
  });

  afterEach(() => vi.useRealTimers());

  function playLoop(audio: HtmlStoryAudio, delayMs = 0) {
    return audio.playSound({
      key: "ambience",
      volume: 1,
      channel: "c",
      loop: true,
      delayMs,
    });
  }

  it("fades live sound channels out over 0.5s, releases them, and leaves music alone", async () => {
    const audio = new HtmlStoryAudio(context);
    void audio.playMusic({ key: "bgm", volume: 1, crossfadeMs: 0, delayMs: 0 });
    const music = await settlePlayback();
    void playLoop(audio);
    const { instance } = await settlePlayback();

    audio.resetAudio();
    await vi.advanceTimersByTimeAsync(400);
    expect(instance.volume).toBeCloseTo(0.2);
    expect(instance.stopped).toBe(0);
    await vi.advanceTimersByTimeAsync(112);
    expect(instance.stopped).toBe(1);

    await audio.setSoundVolume("c", 0.8, 0);
    expect(instance.volume).toBe(0);
    expect(music.instance.volume).toBe(1);
    expect(music.instance.stopped).toBe(0);
  });

  it("lets a delayed sound start during the 500 ms story reset fade", async () => {
    const audio = new HtmlStoryAudio(context);
    const clip = preloadSound("ambience");
    void playLoop(audio, 400);
    audio.resetAudio();
    await vi.advanceTimersByTimeAsync(400);
    expect(clip.playCalls).toBe(1);
    const { instance } = await settlePlayback(clip);
    expect(instance.volume).toBeCloseTo(0.2);
    expect(instance.stopped).toBe(0);
    await vi.advanceTimersByTimeAsync(112);
    expect(instance.stopped).toBe(1);
  });

  it("suppresses a sound due to start at the reset fade deadline", async () => {
    const audio = new HtmlStoryAudio(context);
    const clip = preloadSound("ambience");
    const pending = playLoop(audio, 500);
    audio.resetAudio();
    await vi.advanceTimersByTimeAsync(500);
    await pending;
    expect(clip.playCalls).toBe(0);
  });

  it("suppresses a playsound whose load completes after the reset fade deadline", async () => {
    const audio = new HtmlStoryAudio(context);
    const pending = playLoop(audio);
    audio.resetAudio();
    await vi.advanceTimersByTimeAsync(501);
    const sound = settleLoad();
    await pending;
    expect(sound.playCalls).toBe(0);
  });

  it("leaves a channel the script already stopped on its own fade", async () => {
    const audio = new HtmlStoryAudio(context);
    void playLoop(audio);
    const { instance } = await settlePlayback();
    // stopsound drops the channel from m_allSoundChannels, so native
    // _ResetAudio never shortens its fade.
    void audio.stopSound("c", 3200);
    await vi.advanceTimersByTimeAsync(1600);

    audio.resetAudio();
    await vi.advanceTimersByTimeAsync(800);
    expect(instance.stopped).toBe(0);
    expect(instance.volume).toBeCloseTo(0.25);
    await vi.advanceTimersByTimeAsync(800);
    expect(instance.stopped).toBe(1);
  });
});

describe("playsound delay and story reset", () => {
  beforeEach(() => {
    loads.length = 0;
    preloaded.clear();
    vi.useFakeTimers({
      toFake: ["performance", "requestAnimationFrame", "setTimeout"],
    });
  });

  afterEach(() => vi.useRealTimers());

  function play(audio: HtmlStoryAudio, key: string, delayMs = 0) {
    return audio.playSound({
      channel: "c",
      key,
      delayMs,
      loop: true,
      volume: 1,
    });
  }

  it("replaces the old sound immediately and applies volume commands to the delayed sound", async () => {
    const audio = new HtmlStoryAudio(context);
    void play(audio, "first");
    const first = await settlePlayback();
    const nextClip = preloadSound("second");
    void play(audio, "second", 640);
    expect(first.instance.stopped).toBe(1);
    await audio.setSoundVolume("c", 0.4, 0);
    await vi.advanceTimersByTimeAsync(639);
    expect(nextClip.playCalls).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    const second = await settlePlayback(nextClip);
    expect(second.instance.volume).toBe(0.4);
    expect(second.instance.stopped).toBe(0);
  });

  it("starts a delayed sound partway through a scripted stopsound fade", async () => {
    const audio = new HtmlStoryAudio(context);
    const clip = preloadSound("steps");
    void play(audio, "steps", 320);
    const stopping = audio.stopSound("c", 640);
    await vi.advanceTimersByTimeAsync(320);
    expect(clip.playCalls).toBe(1);
    const { instance } = await settlePlayback(clip);
    expect(instance.volume).toBeCloseTo(0.5);
    await vi.advanceTimersByTimeAsync(320);
    await stopping;
    expect(instance.stopped).toBe(1);
  });

  it("continues a soundvolume tween through the delayed start", async () => {
    const audio = new HtmlStoryAudio(context);
    const clip = preloadSound("steps");
    void play(audio, "steps", 320);
    void audio.setSoundVolume("c", 0.2, 640);
    await vi.advanceTimersByTimeAsync(320);
    const { instance } = await settlePlayback(clip);
    expect(instance.volume).toBeCloseTo(0.6);
    await vi.advanceTimersByTimeAsync(320);
    expect(instance.volume).toBeCloseTo(0.2);
  });

  it("can cancel a stop fade before a delayed sound starts", async () => {
    const audio = new HtmlStoryAudio(context);
    const clip = preloadSound("steps");
    void play(audio, "steps", 320);
    const stopping = audio.stopSound("c", 160);
    await vi.advanceTimersByTimeAsync(80);
    await audio.setSoundVolume("c", 0.8, 0);
    await vi.advanceTimersByTimeAsync(240);
    await stopping;
    expect(clip.playCalls).toBe(1);
    const { instance } = await settlePlayback(clip);
    expect(instance.volume).toBeCloseTo(0.8);
    expect(instance.stopped).toBe(0);
  });

  it("cancels a fading sound's delayed replacement at story end, even if the channel is reused", async () => {
    const audio = new HtmlStoryAudio(context);
    void play(audio, "first");
    const first = await settlePlayback();
    void audio.stopSound("c", 320);
    await vi.advanceTimersByTimeAsync(160);
    const delayedClip = preloadSound("second");
    const delayed = play(audio, "second", 640);
    expect(first.instance.stopped).toBe(1);
    audio.resetAudio();
    void play(audio, "third");
    const third = await settlePlayback();
    await vi.advanceTimersByTimeAsync(640);
    await delayed;
    expect(delayedClip.playCalls).toBe(0);
    expect(third.instance.stopped).toBe(0);
    expect(first.instance.stopped).toBe(1);
  });

  it("fades out multiple residual sounds and leaves music playing", async () => {
    const audio = new HtmlStoryAudio(context);
    void play(audio, "loop");
    const loop = await settlePlayback();
    void audio.playMusic({ key: "bgm", volume: 1, delayMs: 0, crossfadeMs: 0 });
    const music = await settlePlayback();
    void audio.playSound({
      channel: "d",
      key: "another",
      delayMs: 0,
      loop: true,
      volume: 1,
    });
    const other = await settlePlayback();
    audio.resetAudio();
    await vi.advanceTimersByTimeAsync(400);
    expect(loop.instance.volume).toBeCloseTo(0.2);
    expect(other.instance.volume).toBeCloseTo(0.2);
    await vi.advanceTimersByTimeAsync(112);
    expect(loop.instance.stopped).toBe(1);
    expect(other.instance.stopped).toBe(1);
    expect(music.instance.stopped).toBe(0);
  });

  it("keeps a canceled load from claiming a channel reused after reset", async () => {
    const audio = new HtmlStoryAudio(context);
    const pending = play(audio, "old");
    const oldLoad = loads.shift()!;
    audio.resetAudio();
    void play(audio, "new");
    const current = await settlePlayback();
    const staleSound = new FakeSound();
    const stalePlay = vi.spyOn(staleSound, "play");
    oldLoad.resolve(staleSound);
    await flush();
    expect(stalePlay).not.toHaveBeenCalled();
    await pending;
    expect(current.instance.stopped).toBe(0);
  });

  it("hard-stops residual sounds if the player is destroyed during reset", async () => {
    const audio = new HtmlStoryAudio(context);
    void play(audio, "loop");
    const loop = await settlePlayback();
    audio.resetAudio();
    await vi.advanceTimersByTimeAsync(160);
    audio.destroy();
    expect(loop.instance.stopped).toBe(1);
    await vi.advanceTimersByTimeAsync(400);
    expect(loop.instance.stopped).toBe(1);
  });

  it("ends closing fades at their deadlines while animation frames are suspended", async () => {
    const audio = new HtmlStoryAudio(context);
    void play(audio, "loop");
    const loop = await settlePlayback();
    void audio.playSound({
      channel: "d",
      key: "steps",
      delayMs: 0,
      loop: true,
      volume: 1,
    });
    const steps = await settlePlayback();
    void audio.stopSound("d", 1280);
    // A hidden tab suspends requestAnimationFrame. disableAutoPause keeps the
    // sounds audible, so the fades alone would never reach their stop.
    vi.stubGlobal("requestAnimationFrame", () => 0);
    try {
      audio.resetAudio();
      const closing = audio.finishSoundFades();
      await vi.advanceTimersByTimeAsync(499);
      expect(loop.instance.stopped).toBe(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(loop.instance.stopped).toBe(1);
      expect(steps.instance.stopped).toBe(0);
      await vi.advanceTimersByTimeAsync(780);
      expect(steps.instance.stopped).toBe(1);
      await closing;
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

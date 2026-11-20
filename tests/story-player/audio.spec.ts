import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveStoryAudioByKey } from "../../src/widgets/StoryPlayer/engine/asset";
import { HtmlStoryAudio } from "../../src/widgets/StoryPlayer/engine/audio";
import { StoryRuntime } from "../../src/widgets/StoryPlayer/engine/runtime";

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

import type { Context } from "../../src/widgets/StoryPlayer/context";

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
      toFake: ["clearTimeout", "performance", "setTimeout"],
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
    await vi.advanceTimersByTimeAsync(161);
    expect(first.stopped).toBe(1);
    await vi.advanceTimersByTimeAsync(638);
    expect(nextClip.playCalls).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    const { instance: next } = await settlePlayback(nextClip);
    expect(next.volume).toBe(0);
    await vi.advanceTimersByTimeAsync(160);
    expect(next.volume).toBeCloseTo(0.5);
    await vi.advanceTimersByTimeAsync(160);
    expect(next.volume).toBe(1);
  });

  it("includes a negative script delay in the incoming track's crossfade time", async () => {
    const context = createContext([
      '[playmusic(key="a")]',
      "[delay(time=0)]",
      '[playmusic(key="b",delay=-0.16,crossfade=0.32)]',
      '[name="A"]done',
    ]);
    const firstClip = preloadSound("a");
    const nextClip = preloadSound("b");
    const renderer = new FakeRenderer();
    renderer.frames.manual = true;
    const runtime = new StoryRuntime(
      context,
      renderer,
      new HtmlStoryAudio(context),
    );
    const started = runtime.start();
    const first = (await settlePlayback(firstClip)).instance;

    renderer.frames.step(16);
    await started;
    expect(runtime.getState()).toBe("waiting_input");
    await vi.advanceTimersByTimeAsync(159);
    expect(nextClip.playCalls).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(nextClip.playCalls).toBe(1);
    const next = (await settlePlayback(nextClip)).instance;
    expect(next.volume).toBe(0);
    expect(first.stopped).toBe(0);
    await vi.advanceTimersByTimeAsync(160);
    expect(first.stopped).toBe(0);
    expect(next.volume).toBeCloseTo(0.5);
    await vi.advanceTimersByTimeAsync(1);
    expect(first.stopped).toBe(1);
    expect(loads).toHaveLength(0);
  });

  it("starts a track with an elapsed fade-in at zero volume until the next media update", async () => {
    const context = createContext([
      '[playmusic(key="first")]',
      "[delay(time=0)]",
      '[playmusic(key="second",delay=-1,crossfade=0.25)]',
      "[delay(time=0)]",
      '[name="A"]done',
    ]);
    const firstClip = preloadSound("first");
    const secondClip = preloadSound("second");
    const renderer = new FakeRenderer();
    renderer.frames.manual = true;
    const audio = new HtmlStoryAudio(
      context,
      renderer.onFrameUpdate.bind(renderer),
    );
    const runtime = new StoryRuntime(context, renderer, audio);

    const started = runtime.start();
    const first = (await settlePlayback(firstClip)).instance;
    await vi.advanceTimersByTimeAsync(16);
    renderer.frames.step(16);
    const next = (await settlePlayback(secondClip)).instance;
    expect(runtime.getState()).toBe("waiting_timer");
    expect(first.volume).toBe(1);
    expect(next.volume).toBe(0);
    expect(next.stopped).toBe(0);

    await vi.advanceTimersByTimeAsync(16);
    renderer.frames.step(16);
    await started;
    expect(renderer.lastDialogue?.speaker).toBe("A");
    expect(first.volume).toBeCloseTo(1 - 16 / 250);
    expect(first.stopped).toBe(0);
    expect(next.volume).toBe(1);
    expect(loads).toHaveLength(0);
    runtime.destroy();
    audio.destroy();
  });

  it("starts cached clips immediately below the source delay threshold", async () => {
    const context = createContext([
      '[playmusic(key="track",intro="intro",delay=0.0078125)]',
      '[playsound(key="instant",delay=0.0078125)]',
      '[playsound(key="scheduled",delay=0.01)]',
      '[name="A"]done',
    ]);
    const intro = preloadSound("intro");
    const track = preloadSound("track");
    const instant = preloadSound("instant");
    const scheduled = preloadSound("scheduled");
    const renderer = new FakeRenderer();
    const audio = new HtmlStoryAudio(context);
    const runtime = new StoryRuntime(context, renderer, audio);

    await runtime.start();
    await flush();
    expect(renderer.lastDialogue?.speaker).toBe("A");
    expect(intro.playCalls).toBe(1);
    expect(instant.playCalls).toBe(1);
    expect(scheduled.playCalls).toBe(0);
    await settlePlayback(intro);
    await settlePlayback(instant);
    await vi.advanceTimersByTimeAsync(9);
    expect(scheduled.playCalls).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    await settlePlayback(scheduled);

    intro.complete?.();
    await settlePlayback(track);
    expect(loads).toHaveLength(0);
    runtime.destroy();
    audio.destroy();
  });

  it("replaces the pending fade-in with a zero-duration musicvolume", async () => {
    const audio = new HtmlStoryAudio(context);
    const first = await startTrack(audio, "a");
    const nextClip = queueNextTrack(audio);
    await vi.advanceTimersByTimeAsync(160);
    void audio.setMusicVolume(0.8, 0);
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

  it("replays an immediately stopped track only after the audio update recycles its channel", async () => {
    const context = createContext([
      '[playmusic(key="track")]',
      "[delay(time=0)]",
      "[stopmusic]",
      '[playmusic(key="track",volume=0.4)]',
      "[delay(time=0)]",
      '[playmusic(key="track",volume=0.6)]',
      '[name="A"]done',
    ]);
    const clip = preloadSound("track");
    const renderer = new FakeRenderer();
    renderer.frames.manual = true;
    const audio = new HtmlStoryAudio(
      context,
      renderer.onFrameUpdate.bind(renderer),
    );
    const runtime = new StoryRuntime(context, renderer, audio);

    const started = runtime.start();
    const first = (await settlePlayback(clip)).instance;
    renderer.frames.step(16);
    await flush();
    expect(runtime.getState()).toBe("waiting_timer");
    expect(first.stopped).toBe(1);
    expect(clip.playCalls).toBe(1);

    renderer.frames.step(16);
    await started;
    const second = (await settlePlayback(clip)).instance;
    expect(clip.playCalls).toBe(2);
    expect(second.volume).toBe(0.6);
    expect(second.stopped).toBe(0);
    expect(renderer.lastDialogue?.speaker).toBe("A");
    expect(loads).toHaveLength(0);
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
    await vi.advanceTimersByTimeAsync(481);
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
    await vi.advanceTimersByTimeAsync(161);
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
    await vi.advanceTimersByTimeAsync(161);
    expect(first.stopped).toBe(1);
    expect(loads).toHaveLength(0);
  });

  it("retires the old track when an explicit intro cannot be resolved", async () => {
    const context = createContext([
      '[playmusic(key="a")]',
      "[delay(time=0)]",
      '[playmusic(key="b",intro="$unresolved",crossfade=0.32)]',
      '[name="A"]done',
    ]);
    const firstClip = preloadSound("a");
    const nextClip = preloadSound("b");
    const renderer = new FakeRenderer();
    renderer.frames.manual = true;
    const onWarning = vi.fn();
    const runtime = new StoryRuntime(
      context,
      renderer,
      new HtmlStoryAudio(context),
      { onWarning },
    );
    const started = runtime.start();
    const first = (await settlePlayback(firstClip)).instance;

    renderer.frames.step(16);
    await started;
    expect(runtime.getState()).toBe("waiting_input");
    expect(onWarning).toHaveBeenCalledWith(
      expect.objectContaining({ detail: "music intro: $unresolved" }),
    );
    await vi.advanceTimersByTimeAsync(320);
    expect(first.stopped).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(first.stopped).toBe(1);
    expect(nextClip.playCalls).toBe(0);
    expect(loads).toHaveLength(0);
  });

  it("plays a numeric variable key without an intro when the intro variable is empty", async () => {
    const context = createContext([
      '[playmusic(key="$track",intro="$no_intro")]',
      '[name="A"]done',
    ]);
    context.audioVariables = { no_intro: "", track: 7 };
    const clip = preloadSound("7");
    const runtime = new StoryRuntime(
      context,
      new FakeRenderer(),
      new HtmlStoryAudio(context),
    );

    await runtime.start();
    expect(runtime.getState()).toBe("waiting_input");
    expect(clip.playCalls).toBe(1);
    expect(clip.complete).toBeUndefined();
    expect(loads).toHaveLength(0);
    await settlePlayback(clip);
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
    vi.useFakeTimers({ toFake: ["clearTimeout", "performance", "setTimeout"] });
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

      void volume(audio, 0, 0);
      await vi.advanceTimersByTimeAsync(16);
      expect(instance.volume).toBe(0);
      void volume(audio, 0.3, 0);
      await vi.advanceTimersByTimeAsync(16);
      expect(instance.volume).toBe(0.3);
    });

    it("lets a second stop replace the first and releases the channel after its deadline", async () => {
      const audio = new HtmlStoryAudio(context);
      void play(audio, "first");
      const { instance, sound } = await settlePlayback();
      void stop(audio, 320);
      await vi.advanceTimersByTimeAsync(160);
      const stopping = stop(audio, 640);
      await vi.advanceTimersByTimeAsync(160);
      expect(instance.stopped).toBe(0);
      await vi.advanceTimersByTimeAsync(480);
      expect(instance.stopped).toBe(0);
      await vi.advanceTimersByTimeAsync(1);
      await stopping;
      expect(instance.stopped).toBe(1);
      expect(instance.volume).toBe(0);
      await volume(audio, 0.8, 0);
      expect(instance.volume).toBe(0);

      void play(audio, "first");
      const replay = await settlePlayback(sound);
      expect(replay.instance.stopped).toBe(0);
    });

    it.each([-10, 10])(
      "stops immediately at the %i ms boundary",
      async (fadeMs) => {
        const audio = new HtmlStoryAudio(context);
        void play(audio, "first");
        const { instance } = await settlePlayback();
        void stop(audio, fadeMs);
        expect(instance.stopped).toBe(1);
      },
    );

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
      void volume(audio, 0.6, 0);
      await vi.advanceTimersByTimeAsync(16);
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
      toFake: ["clearTimeout", "performance", "setTimeout"],
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

  it("starts a sound silently at the reset fade deadline and then releases it", async () => {
    const audio = new HtmlStoryAudio(context);
    const clip = preloadSound("ambience");
    const pending = playLoop(audio, 500);
    audio.resetAudio();
    await vi.advanceTimersByTimeAsync(500);
    const { instance } = await settlePlayback(clip);
    await pending;
    expect(instance.volume).toBe(0);
    expect(instance.stopped).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(instance.stopped).toBe(1);
  });

  it("starts at the elapsed fade volume and stops on natural end without animation frames", async () => {
    vi.stubGlobal("requestAnimationFrame", () => 0);
    try {
      const audio = new HtmlStoryAudio(context);
      const clip = preloadSound("ambience");
      void playLoop(audio, 310);
      audio.resetAudio();

      await vi.advanceTimersByTimeAsync(310);
      const { instance } = await settlePlayback(clip);
      expect(clip.volume).toBeCloseTo(0.38, 3);
      await vi.advanceTimersByTimeAsync(90);
      expect(instance.volume).toBeCloseTo(0.2);
      expect(instance.stopped).toBe(0);
      await vi.advanceTimersByTimeAsync(101);
      expect(instance.stopped).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
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
    await vi.advanceTimersByTimeAsync(801);
    expect(instance.stopped).toBe(1);
  });
});

describe("playsound delay and story reset", () => {
  beforeEach(() => {
    loads.length = 0;
    preloaded.clear();
    vi.useFakeTimers({
      toFake: ["clearTimeout", "performance", "setTimeout"],
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

  it("keeps a negative stop pending until the next audio update and allows same-frame takeover", async () => {
    const context = createContext([
      '[playmusic(key="track")]',
      '[playsound(key="ambience",channel="c",loop=true)]',
      "[delay(time=0)]",
      "[stopmusic(fadetime=-0.25)]",
      '[stopsound(channel="c",fadetime=-0.25)]',
      "[musicvolume(volume=0.4)]",
      "[delay(time=0)]",
      '[soundvolume(channel="c",volume=0.6)]',
      '[name="A"]done',
    ]);
    const track = preloadSound("track");
    const ambience = preloadSound("ambience");
    const renderer = new FakeRenderer();
    renderer.frames.manual = true;
    const audio = new HtmlStoryAudio(
      context,
      renderer.onFrameUpdate.bind(renderer),
    );
    const runtime = new StoryRuntime(context, renderer, audio);

    const started = runtime.start();
    const music = (await settlePlayback(track)).instance;
    const effect = (await settlePlayback(ambience)).instance;
    renderer.frames.step(16);

    expect(runtime.getState()).toBe("waiting_timer");
    expect(music.stopped).toBe(0);
    expect(effect.stopped).toBe(0);

    renderer.frames.step(16);
    await started;
    expect(renderer.lastDialogue?.speaker).toBe("A");
    expect(music.stopped).toBe(0);
    expect(music.volume).toBe(0.4);
    expect(effect.stopped).toBe(1);
    expect(effect.volume).toBe(0);
    expect(loads).toHaveLength(0);
  });

  it("lets a script take over both channels on the exact stop-fade deadline", async () => {
    const context = createContext([
      '[playmusic(key="track")]',
      '[playsound(key="ambience",channel="c",loop=true)]',
      "[delay(time=0)]",
      "[stopmusic(fadetime=0.5)]",
      '[stopsound(channel="c",fadetime=0.5)]',
      "[delay(time=0.375)]",
      "[musicvolume(volume=0.75)]",
      '[soundvolume(channel="c",volume=0.5)]',
      "[delay(time=0)]",
      '[name="A"]done',
    ]);
    const track = preloadSound("track");
    const ambience = preloadSound("ambience");
    const renderer = new FakeRenderer();
    renderer.frames.manual = true;
    const audio = new HtmlStoryAudio(
      context,
      renderer.onFrameUpdate.bind(renderer),
    );
    const runtime = new StoryRuntime(context, renderer, audio);
    const started = runtime.start();
    const music = (await settlePlayback(track)).instance;
    const effect = (await settlePlayback(ambience)).instance;

    await vi.advanceTimersByTimeAsync(16);
    renderer.frames.step(16); // Submit both stops and the script delay.
    await vi.advanceTimersByTimeAsync(125);
    renderer.frames.step(125); // Start the delay's independent 375 ms clock.
    await vi.advanceTimersByTimeAsync(375);
    renderer.frames.step(375); // Both fades are at zero; the channels are live.

    expect(runtime.getState()).toBe("waiting_timer");
    expect(music.volume).toBe(0);
    expect(effect.volume).toBe(0);
    expect(music.stopped).toBe(0);
    expect(effect.stopped).toBe(0);

    await vi.advanceTimersByTimeAsync(1);
    renderer.frames.step(1);
    await started;
    expect(renderer.lastDialogue?.speaker).toBe("A");
    expect(music.volume).toBe(0.75);
    expect(effect.volume).toBe(0.5);
    expect(music.stopped).toBe(0);
    expect(effect.stopped).toBe(0);
    expect(loads).toHaveLength(0);
    runtime.destroy();
    audio.destroy();
  });

  it("releases a faded channel before the script when a frame runs ahead of the audio timer", async () => {
    const context = createContext([
      '[playsound(key="ambience",channel="c",loop=true)]',
      "[delay(time=0)]",
      '[stopsound(channel="c",fadetime=0.5)]',
      "[delay(time=0.376)]",
      '[soundvolume(channel="c",volume=0.5)]',
      '[name="A"]done',
    ]);
    const clip = preloadSound("ambience");
    const renderer = new FakeRenderer();
    renderer.frames.manual = true;
    const audio = new HtmlStoryAudio(
      context,
      renderer.onFrameUpdate.bind(renderer),
    );
    const runtime = new StoryRuntime(context, renderer, audio);
    // Pixi may reach the next frame while a Web fallback timer is still queued.
    const clock = vi
      .spyOn(performance, "now")
      .mockImplementation(renderer.frames.now);
    try {
      const started = runtime.start();
      const { instance } = await settlePlayback(clip);
      renderer.frames.step(16);
      renderer.frames.step(125);
      renderer.frames.step(376);
      await started;

      expect(renderer.lastDialogue?.speaker).toBe("A");
      expect(instance.volume).toBe(0);
      expect(instance.stopped).toBe(1);
      expect(loads).toHaveLength(0);
    } finally {
      clock.mockRestore();
      runtime.destroy();
      audio.destroy();
    }
  });

  it("cancels an earlier stop without changing volume for a negative tween target", async () => {
    const context = createContext([
      '[playsound(key="ambience",channel="c",loop=true)]',
      "[delay(time=0)]",
      '[stopsound(channel="c",fadetime=0.25)]',
      '[soundvolume(channel="c",volume=-1)]',
      '[name="A"]done',
    ]);
    const clip = preloadSound("ambience");
    const renderer = new FakeRenderer();
    renderer.frames.manual = true;
    const audio = new HtmlStoryAudio(context);
    const runtime = new StoryRuntime(context, renderer, audio);

    const started = runtime.start();
    const { instance } = await settlePlayback(clip);
    renderer.frames.step(16);
    await started;
    await vi.advanceTimersByTimeAsync(300);

    expect(instance.volume).toBe(1);
    expect(instance.stopped).toBe(0);
    expect(loads).toHaveLength(0);
  });

  it("starts a stop fade at the current volume when it replaces a same-frame zero-duration tween", async () => {
    const context = createContext([
      '[playsound(key="ambience",channel="c",loop=true)]',
      "[delay(time=0)]",
      '[soundvolume(channel="c",volume=0.2)]',
      '[stopsound(channel="c",fadetime=0.32)]',
      '[name="A"]done',
    ]);
    const clip = preloadSound("ambience");
    const renderer = new FakeRenderer();
    renderer.frames.manual = true;
    const audio = new HtmlStoryAudio(context);
    const runtime = new StoryRuntime(context, renderer, audio);

    const started = runtime.start();
    const { instance } = await settlePlayback(clip);
    renderer.frames.step(16);
    await started;
    expect(renderer.lastDialogue?.speaker).toBe("A");

    await vi.advanceTimersByTimeAsync(160);
    expect(instance.volume).toBeCloseTo(0.5);
    expect(instance.stopped).toBe(0);
    await vi.advanceTimersByTimeAsync(161);
    expect(instance.stopped).toBe(1);
    expect(loads).toHaveLength(0);
  });

  it("replaces the old sound immediately and applies volume commands to the delayed sound", async () => {
    const audio = new HtmlStoryAudio(context);
    void play(audio, "first");
    const first = await settlePlayback();
    const nextClip = preloadSound("second");
    void play(audio, "second", 640);
    expect(first.instance.stopped).toBe(1);
    void audio.setSoundVolume("c", 0.4, 0);
    await vi.advanceTimersByTimeAsync(639);
    expect(nextClip.playCalls).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    const second = await settlePlayback(nextClip);
    expect(second.instance.volume).toBe(0.4);
    expect(second.instance.stopped).toBe(0);
  });

  it("reuses the default channel for two variables naming the same sound", async () => {
    const context = createContext([
      '[playsound(key="$first",loop=true)]',
      "[delay(time=0)]",
      '[playsound(key="$second",delay="$hold",loop=true)]',
      '[soundvolume(channel="$first",volume="$gain")]',
      '[name="A"]done',
    ]);
    const path = "sound_beta_2/avg/waves";
    context.audioVariables = {
      first: path,
      gain: 0.4,
      hold: 0.2,
      second: path,
    };
    const clip = preloadSound(path);
    const renderer = new FakeRenderer();
    renderer.frames.manual = true;
    const runtime = new StoryRuntime(
      context,
      renderer,
      new HtmlStoryAudio(context),
    );

    const started = runtime.start();
    const first = (await settlePlayback(clip)).instance;
    renderer.frames.step(16);
    await started;
    expect(runtime.getState()).toBe("waiting_input");
    expect(first.stopped).toBe(1);
    await vi.advanceTimersByTimeAsync(199);
    expect(clip.playCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    const second = (await settlePlayback(clip)).instance;
    expect(second.volume).toBe(0.4);
    expect(loads).toHaveLength(0);
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
    await vi.advanceTimersByTimeAsync(321);
    await stopping;
    expect(instance.stopped).toBe(1);
  });

  it.each([
    { command: '[playsound(channel="c")]', warning: "parse" },
    {
      command: '[playsound(key="$unresolved",channel="c")]',
      warning: "missing_asset",
    },
  ])(
    "retires the old sound channel on a $warning failure",
    async ({ command, warning }) => {
      const context = createContext([
        '[playsound(key="first",channel="c",loop=true)]',
        "[delay(time=0)]",
        command,
        '[name="A"]done',
      ]);
      const clip = preloadSound("first");
      const audio = new HtmlStoryAudio(context);
      const renderer = new FakeRenderer();
      renderer.frames.manual = true;
      const onWarning = vi.fn();
      const runtime = new StoryRuntime(context, renderer, audio, { onWarning });

      const started = runtime.start();
      const { instance } = await settlePlayback(clip);
      expect(instance.stopped).toBe(0);
      renderer.frames.step(16);
      await started;

      expect(runtime.getState()).toBe("waiting_input");
      expect(renderer.lastDialogue?.speaker).toBe("A");
      expect(onWarning).toHaveBeenCalledWith(
        expect.objectContaining({ type: warning }),
      );
      expect(instance.stopped).toBe(1);
      expect(loads).toHaveLength(0);
    },
  );

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
    void audio.setSoundVolume("c", 0.8, 0);
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

  it("releases closing fades after their deadlines while animation frames are suspended", async () => {
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
    // A hidden tab suspends requestAnimationFrame while disableAutoPause keeps
    // the sounds audible. Fades run on timers, so they must still reach their
    // stops with animation frames stubbed out.
    vi.stubGlobal("requestAnimationFrame", () => 0);
    try {
      audio.resetAudio();
      const closing = audio.finishSoundFades();
      await vi.advanceTimersByTimeAsync(400);
      expect(loop.instance.volume).toBeCloseTo(0.2);
      expect(steps.instance.volume).toBeCloseTo(0.6875);
      await vi.advanceTimersByTimeAsync(100);
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

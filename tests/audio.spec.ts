import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HtmlStoryAudio } from "../src/widgets/StoryPlayer/engine/audio";

import type { Context } from "../src/widgets/StoryPlayer/context";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function defer<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Minimal stand-in for `@pixi/sound`'s IMediaInstance. */
class FakeInstance {
  stopped = 0;
  volume = 1;
  stop(): void {
    this.stopped += 1;
  }
}

/**
 * `Sound.play()` returns a Promise whenever the clip is not preloaded. The
 * window between that call and its resolution is where a concurrent
 * stopsound/playsound can orphan the instance, so the fake keeps it open.
 */
class FakeSound {
  readonly instances: FakeInstance[] = [];
  private pending: Deferred<FakeInstance> | null = null;

  volume = 1;
  complete?: () => void;

  play(options: {
    volume: number;
    complete?: () => void;
  }): Promise<FakeInstance> {
    this.volume = options.volume;
    this.complete = options.complete;
    const pending = defer<FakeInstance>();
    this.pending = pending;
    return pending.promise;
  }

  settlePlay(): FakeInstance {
    const pending = this.pending;
    if (!pending) throw new Error("play() was not called");
    this.pending = null;
    const instance = new FakeInstance();
    instance.volume = this.volume;
    this.instances.push(instance);
    pending.resolve(instance);
    return instance;
  }
}

const loads: Array<Deferred<FakeSound>> = [];

vi.mock("pixi.js", () => ({
  Assets: {
    get: () => null,
    load: () => {
      const pending = defer<FakeSound>();
      loads.push(pending);
      return pending.promise;
    },
  },
}));

function settleLoad(): FakeSound {
  const pending = loads.shift();
  if (!pending) throw new Error("Assets.load was not called");
  const sound = new FakeSound();
  pending.resolve(sound);
  return sound;
}

/** Let every already-scheduled microtask (each `await`) run to completion. */
async function flush(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

async function settlePlayback(cached?: FakeSound) {
  await flush();
  const sound = cached ?? settleLoad();
  await flush();
  const instance = sound.settlePlay();
  await flush();
  return { instance, sound };
}

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

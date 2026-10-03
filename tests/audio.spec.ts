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

  play(): Promise<FakeInstance> {
    const pending = defer<FakeInstance>();
    this.pending = pending;
    return pending.promise;
  }

  settlePlay(): FakeInstance {
    const pending = this.pending;
    if (!pending) throw new Error("play() was not called");
    this.pending = null;
    const instance = new FakeInstance();
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

const context = { linkMap: {}, script: [] } satisfies Context;

/** Play a track to completion and hand back its started instance. */
async function startMusic(
  audio: HtmlStoryAudio,
  key = "k",
  volume = 1,
): Promise<FakeInstance> {
  void audio.playMusic({ crossfadeMs: 0, delayMs: 0, key, volume });
  await flush();
  const sound = settleLoad();
  await flush();
  const instance = sound.settlePlay();
  await flush();
  return instance;
}

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

describe("HtmlStoryAudio stopmusic cancelable stop", () => {
  /**
   * Native provenance: `AudioChannel.Stop` (VA 0x183ededf0, 2.7.61) keeps the
   * MUSIC channel registered for the whole fade (`m_stopWhenTweenEnd = 1`),
   * so a `musicvolume` (`AudioChannel.TweenVolume` clears the flag) or a
   * same-track `playmusic` (`AudioChannel.set_volume` clears the tween) can
   * cancel a pending stop; only an uncanceled fade end releases the channel.
   */
  let frames: Array<(time: number) => void>;
  let fakeNow: number;
  let rafSpy: ReturnType<typeof vi.spyOn>;
  let nowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    loads.length = 0;
    frames = [];
    fakeNow = 0;
    rafSpy = vi
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation((callback) => {
        frames.push(callback as FrameRequestCallback);
        return frames.length;
      });
    nowSpy = vi.spyOn(performance, "now").mockImplementation(() => fakeNow);
  });

  afterEach(() => {
    rafSpy.mockRestore();
    nowSpy.mockRestore();
  });

  /** Advance the faked clock by `dt` ms and run one animation frame. */
  function flushFrame(dt: number): void {
    fakeNow += dt;
    const pending = [...frames];
    frames.length = 0;
    for (const callback of pending) callback(fakeNow);
  }

  it("a musicvolume during the stopmusic fade cancels the stop", async () => {
    const audio = new HtmlStoryAudio(context);
    const instance = await startMusic(audio);

    void audio.stopMusic(2000);
    await flush();
    flushFrame(500);
    expect(instance.volume).toBeCloseTo(0.75);
    expect(instance.stopped).toBe(0);

    const volumePromise = audio.setMusicVolume(0.8, 1000);
    await flush();
    // The volume tween replaced the fade-to-zero (native single tween slot).
    flushFrame(1000);
    await volumePromise;
    await flush();
    expect(instance.volume).toBeCloseTo(0.8);

    flushFrame(2000);
    await flush();
    expect(instance.stopped).toBe(0);
    expect(instance.volume).toBeCloseTo(0.8);
  });

  it("a same-track playmusic during the stopmusic fade cancels the stop without reloading", async () => {
    const audio = new HtmlStoryAudio(context);
    const instance = await startMusic(audio);

    void audio.stopMusic(2000);
    await flush();
    flushFrame(400);
    expect(instance.volume).toBeCloseTo(0.8);

    void audio.playMusic({ crossfadeMs: 0, delayMs: 0, key: "k", volume: 0.5 });
    await flush();
    // Native `_PlayAudio` short-circuit → `set_volume`: instant jump, the
    // track keeps playing, and no new load is started.
    expect(instance.volume).toBe(0.5);
    expect(loads.length).toBe(0);

    flushFrame(2000);
    await flush();
    expect(instance.stopped).toBe(0);
    expect(instance.volume).toBe(0.5);
  });

  it("an uncanceled stopmusic fade stops the track and releases the channel", async () => {
    const audio = new HtmlStoryAudio(context);
    void audio.playMusic({ crossfadeMs: 0, delayMs: 0, key: "k", volume: 1 });
    await flush();
    const sound = settleLoad();
    await flush();
    const instance = sound.settlePlay();
    await flush();

    void audio.stopMusic(2000);
    await flush();
    flushFrame(2000);
    await flush();
    expect(instance.stopped).toBe(1);
    expect(instance.volume).toBeCloseTo(0);

    // Channel recycled: a later musicvolume cannot resurrect it, and a
    // same-track playmusic no longer short-circuits — a fresh playback is
    // created (served from the sound cache) and `play()` runs again.
    await audio.setMusicVolume(0.9, 0);
    expect(instance.volume).toBeCloseTo(0);

    void audio.playMusic({ crossfadeMs: 0, delayMs: 0, key: "k", volume: 1 });
    await flush();
    const replayed = sound.settlePlay();
    await flush();
    expect(replayed).not.toBe(instance);
    expect(replayed.stopped).toBe(0);
  });

  it("treats a fadetime at or below the native 0.01s threshold as an instant stop", async () => {
    const audio = new HtmlStoryAudio(context);
    const instance = await startMusic(audio);

    await audio.stopMusic(10);
    expect(instance.stopped).toBe(1);
    expect(frames.length).toBe(0);
  });

  it("a different-track playmusic during the stopmusic fade takes over the old playback", async () => {
    const audio = new HtmlStoryAudio(context);
    const instance = await startMusic(audio, "a");

    void audio.stopMusic(2000);
    await flush();
    flushFrame(500);

    void audio.playMusic({ crossfadeMs: 0, delayMs: 0, key: "b", volume: 1 });
    await flush();
    const sound = settleLoad();
    await flush();
    const next = sound.settlePlay();
    await flush();

    expect(instance.stopped).toBe(1);
    expect(next.stopped).toBe(0);
  });
});

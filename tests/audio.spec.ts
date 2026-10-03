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

/** Drive `playsound` through the fakes until its instance is live. */
async function playLoopingSound(
  audio: HtmlStoryAudio,
  key: string,
): Promise<FakeInstance> {
  void audio.playSound({
    channel: "c",
    delayMs: 0,
    key,
    loop: true,
    volume: 1,
  });
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

  describe("stopsound fade interplay (AudioChannel.m_stopWhenTweenEnd)", () => {
    beforeEach(() => {
      // fadeVolume drives both rAF ticks and performance.now(); fake them so
      // the fade window can be advanced deterministically.
      vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("revives a stopsound fade-out when soundvolume lands inside the window", async () => {
      const audio = new HtmlStoryAudio(context);
      const instance = await playLoopingSound(audio, "k");

      // Native: `AudioChannel.Stop` (fadetime > 0.01) keeps the channel
      // registered while fading out (`m_stopWhenTweenEnd = 1`).
      void audio.stopSound("c", 1000);
      await flush();
      await vi.advanceTimersByTimeAsync(480);

      expect(instance.stopped).toBe(0);
      expect(instance.volume).toBeGreaterThan(0);
      expect(instance.volume).toBeLessThan(1);

      // Native: `AudioChannel.TweenVolume` zeroes `m_stopWhenTweenEnd`, so
      // the pending stop is cancelled and the sound tweens to the new volume
      // from its current mid-fade volume instead of stopping.
      void audio.setSoundVolume("c", 0.8, 200);
      await flush();
      await vi.advanceTimersByTimeAsync(1000);

      expect(instance.stopped).toBe(0);
      expect(instance.volume).toBeCloseTo(0.8);

      // The revived channel stays resolvable: a later soundvolume (even with
      // fadetime=0) keeps acting on it.
      await audio.setSoundVolume("c", 0.3, 0);
      expect(instance.stopped).toBe(0);
      expect(instance.volume).toBe(0.3);
    });

    it("stops and drops the channel once the stopsound fade finishes uncanceled", async () => {
      const audio = new HtmlStoryAudio(context);
      const instance = await playLoopingSound(audio, "k");

      void audio.stopSound("c", 400);
      await flush();
      await vi.advanceTimersByTimeAsync(600);

      expect(instance.volume).toBe(0);
      expect(instance.stopped).toBe(1);

      // Channel is gone: a later soundvolume is a silent no-op
      // (native `AudioManager.GetChannel` miss).
      await audio.setSoundVolume("c", 0.9, 0);
      expect(instance.volume).toBe(0);
      expect(instance.stopped).toBe(1);
    });

    it("lets a newer stopsound supersede an older stop fade", async () => {
      const audio = new HtmlStoryAudio(context);
      const instance = await playLoopingSound(audio, "k");

      void audio.stopSound("c", 1000);
      await flush();
      await vi.advanceTimersByTimeAsync(500);

      void audio.stopSound("c", 400);
      await flush();
      // Still inside the second fade: the superseded stop fade must not have
      // stopped the instance early.
      await vi.advanceTimersByTimeAsync(100);
      expect(instance.stopped).toBe(0);

      await vi.advanceTimersByTimeAsync(2000);
      expect(instance.stopped).toBe(1);
    });

    it("does not let a stale stop fade stop a replacement playsound on the channel", async () => {
      const audio = new HtmlStoryAudio(context);
      const first = await playLoopingSound(audio, "k1");

      void audio.stopSound("c", 1000);
      await flush();
      await vi.advanceTimersByTimeAsync(200);

      // A same-channel playsound takes the channel over; native `_PlayAudio`
      // stops the old instance instantly.
      const second = await playLoopingSound(audio, "k2");
      expect(first.stopped).toBe(1);

      await vi.advanceTimersByTimeAsync(2000);
      expect(second.stopped).toBe(0);
    });
  });
});

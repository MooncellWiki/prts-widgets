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
  private pendingOptions: { volume?: number } | undefined;

  play(options?: { volume?: number }): Promise<FakeInstance> {
    const pending = defer<FakeInstance>();
    this.pending = pending;
    this.pendingOptions = options;
    return pending.promise;
  }

  settlePlay(): FakeInstance {
    const pending = this.pending;
    if (!pending) throw new Error("play() was not called");
    this.pending = null;
    const instance = new FakeInstance();
    if (this.pendingOptions?.volume !== undefined)
      instance.volume = this.pendingOptions.volume;
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

/** Start a non-crossfading music track and hand back its live fake instance. */
async function startTrack(
  audio: HtmlStoryAudio,
  key: string,
): Promise<FakeInstance> {
  void audio.playMusic({ crossfadeMs: 0, delayMs: 0, key, volume: 1 });
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

  it("short-circuits the same track regardless of URL letter case", async () => {
    const audio = new HtmlStoryAudio(context);
    void audio.playMusic({
      crossfadeMs: 0,
      delayMs: 0,
      key: "https://example.com/Audio/Bgm.ogg",
      volume: 0.5,
    });

    await flush();
    const sound = settleLoad();
    await flush();
    const instance = sound.settlePlay();
    await flush();
    expect(instance.volume).toBe(0.5);

    void audio.playMusic({
      crossfadeMs: 400,
      delayMs: 0,
      key: "https://example.com/audio/bgm.OGG",
      volume: 0.8,
    });
    await flush();

    // Same asset pair under OrdinalIgnoreCase: instant volume set, no reload,
    // no outgoing fade (native `_PlayAudio` branch (a)).
    expect(instance.volume).toBe(0.8);
    expect(loads.length).toBe(0);
    expect(instance.stopped).toBe(0);
  });

  describe("playMusic crossfade scheduling", () => {
    beforeEach(() => {
      vi.useFakeTimers({
        toFake: ["performance", "requestAnimationFrame", "setTimeout", "Date"],
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("runs the outgoing fade immediately and the incoming fade after delay+crossfade", async () => {
      const audio = new HtmlStoryAudio(context);
      const first = await startTrack(audio, "a");
      expect(first.stopped).toBe(0);

      const switching = audio.playMusic({
        crossfadeMs: 400,
        delayMs: 1000,
        key: "b",
        volume: 1,
      });
      await flush();

      // Outgoing fade-out spans [0, crossfade] and starts at once; the delay
      // never postpones it (native `Stop(crossfade, linear)` on the renamed
      // `_CROSSFADING_` channel).
      vi.advanceTimersByTime(200);
      expect(first.volume).toBeGreaterThan(0);
      expect(first.volume).toBeLessThan(1);

      // Incoming track waits out delay + crossfade before it even loads:
      // fade-in spans [delay+crossfade, delay+2*crossfade].
      expect(loads.length).toBe(0);

      vi.advanceTimersByTime(201);
      await flush();
      expect(first.volume).toBe(0);
      expect(first.stopped).toBe(1);

      vi.advanceTimersByTime(999);
      await flush();
      expect(loads.length).toBe(1);
      const secondSound = settleLoad();
      await flush();
      const second = secondSound.settlePlay();
      await flush();
      expect(second.volume).toBe(0);

      // First 16ms frame past t=1800 lands at 1808 (frames sit on 16ms
      // boundaries), so advance past it to complete the fade-in.
      vi.advanceTimersByTime(500);
      expect(second.volume).toBeCloseTo(1);
      expect(second.stopped).toBe(0);

      await switching;
    });

    it("cuts the outgoing track immediately when crossfade is at or below the 10ms threshold", async () => {
      const audio = new HtmlStoryAudio(context);
      const first = await startTrack(audio, "a");

      const switching = audio.playMusic({
        crossfadeMs: 0,
        delayMs: 500,
        key: "b",
        volume: 0.7,
      });
      await flush();

      // Native branch (c): `Stop(~0)` is an immediate cut, not postponed by
      // the incoming track's delay.
      expect(first.stopped).toBe(1);
      expect(loads.length).toBe(0);

      vi.advanceTimersByTime(500);
      await flush();
      expect(loads.length).toBe(1);
      const secondSound = settleLoad();
      await flush();
      const second = secondSound.settlePlay();
      await flush();

      // No fade-in: the incoming track starts directly at its volume.
      expect(second.volume).toBeCloseTo(0.7);

      await switching;
    });
  });
});

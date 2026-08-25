import { beforeEach, describe, expect, it, vi } from "vitest";

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

  it("stops the previous instance before waiting out the delay window", async () => {
    vi.useFakeTimers();
    try {
      const audio = new HtmlStoryAudio(context);
      void audio.playSound({
        channel: "c",
        delayMs: 0,
        key: "k",
        loop: true,
        volume: 1,
      });

      await flush();
      const first = settleLoad();
      await flush();
      const firstInstance = first.settlePlay();
      await flush();
      expect(firstInstance.stopped).toBe(0);

      const second = audio.playSound({
        channel: "c",
        delayMs: 5000,
        key: "k2",
        loop: true,
        volume: 1,
      });

      // Native `_PlayAudio<SoundParam>` is synchronous: forceReplay replaces
      // the channel immediately and `delay` only defers the audible start, so
      // the outgoing instance must be stopped before the delay elapses.
      expect(firstInstance.stopped).toBe(1);
      await flush();
      // Still inside the delay window: no load for the new key has started.
      expect(loads.length).toBe(0);

      vi.advanceTimersByTime(5000);
      await flush();
      const secondSound = settleLoad();
      await flush();
      const secondInstance = secondSound.settlePlay();
      await flush();
      await second;

      expect(secondInstance.stopped).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops residual loop channels and cancels pending delayed plays on reset", async () => {
    vi.useFakeTimers();
    try {
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

      const delayed = audio.playSound({
        channel: "d",
        delayMs: 60_000,
        key: "k2",
        loop: true,
        volume: 1,
      });

      await audio.stopAllSounds(0);
      expect(instance.stopped).toBe(1);

      vi.advanceTimersByTime(60_000);
      await flush();
      await delayed;

      // The reset cancelled the delayed request, so its load never started.
      expect(loads.length).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

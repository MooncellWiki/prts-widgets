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

/** Drive `requestAnimationFrame`-based fades manually with a fake clock. */
function useManualFadeClock(): { frame: (ms: number) => void } {
  const frames: FrameRequestCallback[] = [];
  let clock = 0;
  vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(
    (callback) => {
      frames.push(callback);
      return frames.length;
    },
  );
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  return {
    /** Advance one animation frame worth of fade time. */
    frame(ms: number): void {
      clock += ms;
      const pending = frames.slice();
      frames.length = 0;
      for (const callback of pending) callback(clock);
    },
  };
}

async function playMusicTrack(
  audio: HtmlStoryAudio,
  volume = 1,
): Promise<FakeInstance> {
  void audio.playMusic({ crossfadeMs: 0, delayMs: 0, key: "k", volume });
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

describe("HtmlStoryAudio musicvolume during a stopmusic fade", () => {
  beforeEach(() => {
    loads.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cancels the pending stop and retargets the fade (TweenVolume clears m_stopWhenTweenEnd)", async () => {
    const { frame } = useManualFadeClock();
    const audio = new HtmlStoryAudio(context);
    const instance = await playMusicTrack(audio, 1);

    void audio.stopMusic(1000);
    await flush();
    frame(500); // halfway down the fade to silence
    expect(instance.volume).toBeCloseTo(0.5);

    const retargeted = audio.setMusicVolume(0.8, 400);
    frame(400); // retargeted tween reaches the new volume
    frame(600); // the retired stop-fade loop must never write again
    await retargeted;
    await flush();

    expect(instance.stopped).toBe(0);
    expect(instance.volume).toBeCloseTo(0.8);

    // The channel was never released, so later volume commands still hit it.
    await audio.setMusicVolume(0.2, 0);
    expect(instance.volume).toBe(0.2);
  });

  it("still stops the music when nothing interrupts the fade", async () => {
    const { frame } = useManualFadeClock();
    const audio = new HtmlStoryAudio(context);
    const instance = await playMusicTrack(audio, 1);

    void audio.stopMusic(1000);
    await flush();
    frame(500);
    frame(500);
    await flush();

    expect(instance.stopped).toBe(1);
    expect(instance.volume).toBe(0);

    // Channel released: a later musicvolume is a silent no-op (native
    // GetMusicChannel returns null once the channel stopped).
    await audio.setMusicVolume(0.7, 0);
    expect(instance.volume).toBe(0);
    expect(instance.stopped).toBe(1);
  });

  it("retargets instantly on a same-track playmusic inside the fade (_PlayAudio fast path)", async () => {
    const { frame } = useManualFadeClock();
    const audio = new HtmlStoryAudio(context);
    const instance = await playMusicTrack(audio, 1);

    void audio.stopMusic(1000);
    await flush();
    frame(500);
    expect(instance.volume).toBeCloseTo(0.5);

    await audio.playMusic({
      crossfadeMs: 0,
      delayMs: 0,
      key: "k",
      volume: 0.9,
    });
    frame(1000); // the retired stop-fade loop must never write again
    await flush();

    expect(instance.stopped).toBe(0);
    expect(instance.volume).toBe(0.9);
    expect(loads).toHaveLength(0); // fast path: no reload, track keeps playing
  });
});

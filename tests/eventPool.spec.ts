import { expect, it, vi } from "vitest";

import {
  AVGEvent,
  EventPool,
} from "../src/widgets/StoryPlayer/engine/eventPool";

it("keeps the current listener set stable through nested emits", () => {
  const pool = new EventPool<AVGEvent>();
  const added = vi.fn();
  const removed = vi.fn();
  let nested = false;
  pool.on(AVGEvent.Click, () => {
    if (nested) return;
    off();
    pool.on(AVGEvent.Click, added);
    nested = true;
    pool.emit(AVGEvent.Click);
  });
  const off = pool.on(AVGEvent.Click, removed);
  pool.on(AVGEvent.Click, removed);

  pool.emit(AVGEvent.Click);
  expect(removed).toHaveBeenCalledTimes(2);
  expect(added).not.toHaveBeenCalled();

  pool.emit(AVGEvent.Click);
  expect(removed).toHaveBeenCalledTimes(2);
  expect(added).toHaveBeenCalledTimes(1);

  pool.clear();
  pool.emit(AVGEvent.Click);
  expect(added).toHaveBeenCalledTimes(1);
});

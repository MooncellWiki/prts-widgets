import { describe, expect, it, vi } from "vitest";

import { guardClaimedClicks } from "../src/widgets/StoryPlayer/engine/rendering/core/ClickClaim";

function setup(isClaimed: (clientX: number, clientY: number) => boolean) {
  const host = document.createElement("div");
  const canvas = document.createElement("canvas");
  host.append(canvas);
  const onHostClick = vi.fn();
  host.addEventListener("click", onHostClick);
  const release = guardClaimedClicks(canvas, isClaimed);
  return { canvas, onHostClick, release };
}

function pressDown(target: HTMLElement, clientX: number): void {
  target.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, clientX, clientY: 0 }),
  );
}

function click(target: HTMLElement, clientX: number): void {
  target.dispatchEvent(
    new MouseEvent("click", { bubbles: true, clientX, clientY: 0 }),
  );
}

describe("guardClaimedClicks", () => {
  it("keeps the click of a claimed press from reaching the host", () => {
    // 决策选项按下（claimed）后的 click 不能再冒泡成宿主的推进点击；
    // 空白处的按下照常冒泡。
    const isClaimed = vi.fn((clientX: number) => clientX < 100);
    const { canvas, onHostClick, release } = setup(isClaimed);

    pressDown(canvas, 50);
    click(canvas, 50);
    expect(isClaimed).toHaveBeenLastCalledWith(50, 0);
    expect(onHostClick).not.toHaveBeenCalled();

    pressDown(canvas, 500);
    click(canvas, 500);
    expect(onHostClick).toHaveBeenCalledExactlyOnceWith(expect.any(MouseEvent));

    release();
    pressDown(canvas, 50);
    click(canvas, 50);
    expect(onHostClick).toHaveBeenCalledTimes(2);
  });

  it("decides ownership per press, not per click", () => {
    // 按在选项上又拖走松开（没有 click）：下一次空白处的点击不能被吞掉。
    const { canvas, onHostClick } = setup((clientX) => clientX < 100);

    pressDown(canvas, 50);
    pressDown(canvas, 500);
    click(canvas, 500);
    expect(onHostClick).toHaveBeenCalledExactlyOnceWith(expect.any(MouseEvent));
  });
});

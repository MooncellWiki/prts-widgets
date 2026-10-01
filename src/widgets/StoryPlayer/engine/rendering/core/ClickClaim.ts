/**
 * Native port: AVGController only advances through `_clickBtn`, an
 * `AVGButton` whose press arrives as UGUI `IPointerDownHandler.OnPointerDown`
 * (2.7.71 VA 0x183EDDF70) and whose release fires `OnClickPress`. UGUI hands
 * a press to the topmost raycast target alone, so a press on a DecisionPanel
 * option never reaches OnClickPress.
 *
 * Web adaptation: the host advances on the DOM `click` of the element hosting
 * the canvas. PIXI already fires `pointertap` on `pointerup`, the decision
 * settles in the microtasks right after it, and only then does the browser
 * dispatch `click`, which would bubble up and be taken for an advance press
 * as well (resetting the auto play mode the decision just restored). The
 * press owner is therefore decided on `pointerdown`, mirroring UGUI's
 * raycast: a click whose press landed on an interactive canvas object stops
 * at `target` instead of bubbling to the host.
 */
export function guardClaimedClicks(
  target: HTMLElement,
  isClaimed: (clientX: number, clientY: number) => boolean,
): () => void {
  let claimed = false;
  const onPointerDown = (event: PointerEvent) => {
    claimed = isClaimed(event.clientX, event.clientY);
  };
  const onClick = (event: MouseEvent) => {
    if (!claimed) return;
    claimed = false;
    event.stopPropagation();
  };

  target.addEventListener("pointerdown", onPointerDown, true);
  target.addEventListener("click", onClick);
  return () => {
    target.removeEventListener("pointerdown", onPointerDown, true);
    target.removeEventListener("click", onClick);
  };
}

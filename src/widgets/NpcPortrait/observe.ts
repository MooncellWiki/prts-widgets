export const PORTRAIT_SELECTOR = ".npc-portrait[data-keys]";

/**
 * 找出 root 下的立绘占位，进入视口附近时才交给 mount。
 * 泰拉人名录的条目默认折叠（display:none），展开之前不会相交，
 * character.json 和图片都等到读者真的点开才拉。
 * 同一个占位只处理一次，正文被实时预览等重新插入时可以放心重复调用。
 */
export function observePortraits(
  root: ParentNode,
  mount: (element: HTMLElement) => void,
  seen: WeakSet<Element> = new WeakSet(),
): void {
  const elements = [...root.querySelectorAll<HTMLElement>(PORTRAIT_SELECTOR)];
  const pending = elements.filter((element) => !seen.has(element));
  for (const element of pending) seen.add(element);
  if (pending.length === 0) return;

  if (!("IntersectionObserver" in window)) {
    for (const element of pending) mount(element);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        mount(entry.target as HTMLElement);
      }
    },
    { rootMargin: "200px 0px" },
  );
  for (const element of pending) observer.observe(element);
}

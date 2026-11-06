import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  type ComputedRef,
  type Ref,
} from "vue";

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape") => Promise<void>;
  unlock?: () => void;
};

const orientation = (): LockableOrientation | undefined =>
  typeof screen === "undefined"
    ? undefined
    : (screen.orientation as LockableOrientation | undefined);

/**
 * 播放器全屏：优先走 Fullscreen API；不可用时（iPhone Safari 只允许
 * video 元素全屏，document.fullscreenEnabled 恒为 false）或请求被拒时，
 * 退化为"网页全屏"——由调用方按 isPseudo 把根节点 fixed 铺满视口。
 *
 * 舞台固定 16:9，触屏设备竖屏进全屏后舞台只有屏宽那么大，所以原生全屏
 * 成功后顺手锁横屏（Screen Orientation API 只在全屏下可用，Android Chrome
 * 支持，iOS/桌面会 reject，静默忽略）；退出全屏时浏览器会自动解锁。
 */
export function useStageFullscreen(target: Ref<HTMLElement | null>): {
  isFullscreen: ComputedRef<boolean>;
  isPseudo: Ref<boolean>;
  toggle: () => Promise<void>;
  exitNative: () => Promise<void>;
} {
  const nativeSupported =
    typeof document !== "undefined" && document.fullscreenEnabled === true;
  const isNative = ref(false);
  const isPseudo = ref(false);
  const isFullscreen = computed(() => isNative.value || isPseudo.value);

  let restoreScrollLock: (() => void) | null = null;

  function syncNative(): void {
    isNative.value =
      target.value !== null && document.fullscreenElement === target.value;
  }

  function onPseudoKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") setPseudo(false);
  }

  function setPseudo(active: boolean): void {
    if (isPseudo.value === active) return;
    isPseudo.value = active;
    if (active) {
      // 网页全屏时页面本身不能再滚，否则 iOS 上滑动会带着底下的 wiki 走
      const root = document.documentElement;
      const previous = root.style.overflow;
      root.style.overflow = "hidden";
      document.addEventListener("keydown", onPseudoKeydown);
      restoreScrollLock = () => {
        root.style.overflow = previous;
        document.removeEventListener("keydown", onPseudoKeydown);
      };
    } else {
      restoreScrollLock?.();
      restoreScrollLock = null;
    }
  }

  async function lockLandscape(): Promise<void> {
    if (!window.matchMedia?.("(pointer: coarse)").matches) return;
    try {
      await orientation()?.lock?.("landscape");
    } catch {
      // 不支持锁定方向（iOS、部分平板）时保持当前方向
    }
  }

  async function enter(): Promise<void> {
    const element = target.value;
    if (!element) return;
    if (!nativeSupported) {
      setPseudo(true);
      return;
    }
    try {
      await element.requestFullscreen();
    } catch (error) {
      console.error("[story-player] fullscreen failed:", error);
      setPseudo(true);
      return;
    }
    await lockLandscape();
  }

  async function exitNative(): Promise<void> {
    if (!document.fullscreenElement) return;
    try {
      await document.exitFullscreen();
    } catch (error) {
      console.error("[story-player] exit fullscreen failed:", error);
    }
  }

  async function toggle(): Promise<void> {
    if (isPseudo.value) {
      setPseudo(false);
      return;
    }
    await (isNative.value ? exitNative() : enter());
  }

  onMounted(() => {
    document.addEventListener("fullscreenchange", syncNative);
  });

  onBeforeUnmount(() => {
    document.removeEventListener("fullscreenchange", syncNative);
    setPseudo(false);
  });

  return { isFullscreen, isPseudo, toggle, exitNative };
}

import hammer from 'hammerjs'
import { onMounted, onUnmounted, ref, Ref } from 'vue'
import { Spine } from '../../utils/spine'
import { isFirefox } from '../../utils/utils'
export function useEvent(
  canvas: Ref<HTMLCanvasElement | undefined>,
  spine: { spine?: Spine },
): {
  big: Ref<boolean>
} {
  const big = ref(false)
  const startPosition = ref<{ x: number; y: number }>()
  const getPosition = () => {
    return spine.spine!.position
  }
  const wheelHandler = (e: WheelEvent) => {
    e.preventDefault()
    const widget = canvas.value
    if (!widget) {
      return
    }
    const delta = isFirefox() ? e.deltaY / -480 : e.deltaY * -0.001
    if (!spine.spine) {
      return
    }
    const { scale } = getPosition()
    if (scale + delta <= 0) {
      return
    }
    spine.spine?.scale(scale + delta)
  }
  let hm: HammerManager
  onMounted(() => {
    if (!canvas.value) {
      return
    }
    hm = new hammer(canvas.value)
    hm.get('pinch').set({ enable: true })
    hm.on('panstart', () => {
      if (!spine.spine) {
        return
      }
      const { x, y } = getPosition()
      startPosition.value = {
        x,
        y,
      }
    })
    hm.on('panmove', (e) => {
      if (!spine.spine) {
        return
      }
      const { scale } = getPosition()
      const { x, y } = startPosition.value!
      // console.log(e.deltaX, e.deltaY);
      const ratio = (big.value ? 1 : 10 / 3) / scale
      spine.spine.move(x - e.deltaX * ratio, y + e.deltaY * ratio)
    })
    hm.on('panend', () => {
      startPosition.value = void 0
    })
    canvas.value.addEventListener('wheel', wheelHandler)
  })
  onUnmounted(() => {
    hm?.destroy()
    canvas.value?.removeEventListener('wheel', wheelHandler)
  })
  return {
    big,
  }
}

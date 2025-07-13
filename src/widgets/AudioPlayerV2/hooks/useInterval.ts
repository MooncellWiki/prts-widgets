import { onMounted, onUnmounted, ref } from "vue";

export function useInterval(callback: () => void, delay: number) {
  const intervalId = ref<number | null>(null);
  const savedCallback = ref(callback);

  savedCallback.value = callback;

  onMounted(() => {
    if (delay !== null) {
      intervalId.value = setInterval(() => {
        savedCallback.value();
      }, delay) as unknown as number;
    }
  });

  onUnmounted(() => {
    if (intervalId.value !== null) {
      clearInterval(intervalId.value);
    }
  });

  const clear = () => {
    if (intervalId.value !== null) {
      clearInterval(intervalId.value);
      intervalId.value = null;
    }
  };

  return { clear };
}

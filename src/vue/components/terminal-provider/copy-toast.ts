import { ref } from "vue";

export function createCopyToastState(defaultText = "Copied to clipboard") {
  const visible = ref(false);
  const text = ref(defaultText);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer(): void {
    if (timer == null) return;
    clearTimeout(timer);
    timer = null;
  }

  function show(message = defaultText): void {
    text.value = message;
    visible.value = true;
    clearTimer();
    timer = setTimeout(() => {
      visible.value = false;
      timer = null;
    }, 1200);
  }

  return {
    visible,
    text,
    show,
    dispose: clearTimer,
  } as const;
}

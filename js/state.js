export const DEFAULT_LESSON = "rat-disc-1";

/**
 * 앱의 전역 상태 관리
 */
export const app = {
  lesson: null,
  currentIdx: 0,
};

/**
 * 활성 Firebase 리스너 해제 관리
 */
export const activeUnsubscribers = [];

export function clearListeners() {
  while (activeUnsubscribers.length) {
    const unsub = activeUnsubscribers.pop();
    if (typeof unsub === "function") unsub();
  }
}

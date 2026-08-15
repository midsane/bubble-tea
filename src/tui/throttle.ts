/**
 * Leading+trailing throttle: the first call in a quiet period fires
 * immediately, later calls within `intervalMs` collapse into a single
 * trailing call carrying the latest value, so a fast-arriving stream never
 * fires the sink more than ~1000/intervalMs times per second regardless of
 * how often `update` is called.
 */
export function createThrottled<T>(sink: (value: T) => void, intervalMs: number) {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: T | null = null;

  function flush() {
    timer = null;
    if (pending !== null) {
      last = Date.now();
      sink(pending);
      pending = null;
    }
  }

  function update(value: T) {
    const now = Date.now();
    const elapsed = now - last;
    if (elapsed >= intervalMs) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      pending = null;
      last = now;
      sink(value);
    } else {
      pending = value;
      timer ??= setTimeout(flush, intervalMs - elapsed);
    }
  }

  function cancel() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pending = null;
  }

  return { update, cancel };
}

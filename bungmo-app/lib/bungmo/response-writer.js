export function createResponseWriter(save, onStatus) {
  let pending = {}, inFlight = {}, writing = null, timer;
  const hasPending = () => Object.keys(pending).length > 0;
  function flush() {
    clearTimeout(timer);
    if (writing) return writing.then(flush);
    if (!hasPending()) return Promise.resolve();
    const delta = pending;
    pending = {}; inFlight = delta;
    onStatus("saving");
    writing = Promise.resolve().then(() => save(delta)).then(() => {
      inFlight = {};
      onStatus(hasPending() ? "saving" : "saved");
    }, error => {
      pending = { ...delta, ...pending }; inFlight = {};
      onStatus("error");
      throw error;
    }).finally(() => { writing = null; });
    return writing;
  }
  return {
    change(delta) {
      pending = { ...pending, ...delta };
      onStatus("saving");
      clearTimeout(timer);
      timer = setTimeout(() => flush().catch(() => {}), 300);
    },
    pending: () => ({ ...inFlight, ...pending }),
    flush
  };
}

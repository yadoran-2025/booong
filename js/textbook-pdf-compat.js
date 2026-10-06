// PDF.js requires this API even in its legacy build; older Samsung Internet lacks it.
if (!Promise.withResolvers) Promise.withResolvers = function () {
  let resolve, reject;
  const promise = new this((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

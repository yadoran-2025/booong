export function adminReturnPath(search) {
  const next = new URLSearchParams(search).get("next");
  if (!next) return null;
  try {
    const url = new URL(next, "https://booong.invalid");
    if (url.origin !== "https://booong.invalid" || !/^\/bungmo\/(?:members\/|schedule\/|settlement\/|trip\/|archive\/)?$/.test(url.pathname)) return null;
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}

export const profileMemberId = profileId => `booong:${profileId}`;

export function normalizeBooongProfiles(data) {
  if (!Array.isArray(data?.members)) throw new Error("BOOONG 프로필을 확인해주세요.");
  const ids = new Set();
  return data.members.map(profile => {
    if (typeof profile?.id !== "string" || !profile.id.trim() || profile.id !== profile.id.trim() || profile.id.length > 80 || /[/\x00-\x1f]/.test(profile.id)
      || typeof profile.name !== "string" || !profile.name.trim() || profile.name.length > 120 || ids.has(profile.id.toLowerCase())) throw new Error("BOOONG 프로필을 확인해주세요.");
    ids.add(profile.id.toLowerCase());
    return { id: profileMemberId(profile.id), profileId: profile.id, nickname: profile.name.trim(), photoURL: typeof profile.avatar === "string" ? profile.avatar : "" };
  });
}

export function subscribeBooongProfiles(callback, onError) {
  let stopped = false, request;
  async function load() {
    request?.abort();
    const current = request = new AbortController();
    try {
      const response = await fetch("/api/members", { cache: "no-store", signal: AbortSignal.any([current.signal, AbortSignal.timeout(10000)]) });
      if (!response.ok) throw new Error("BOOONG 프로필을 불러오지 못했어요.");
      const profiles = normalizeBooongProfiles(await response.json());
      if (!stopped && request === current) callback(profiles);
    } catch (error) {
      if (!stopped && request === current && !current.signal.aborted) onError?.(error);
    }
  }
  load();
  window.addEventListener("focus", load);
  return () => { stopped = true; request?.abort(); window.removeEventListener("focus", load); };
}

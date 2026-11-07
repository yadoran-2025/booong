export function getLessonContributors(row = {}, members = []) {
  const lookup = new Map();
  for (const member of members) for (const key of [member.id, ...(member.aliases || [])]) lookup.set(String(key).toLowerCase(), member.id);
  const source = Array.isArray(row.contributors) ? row.contributors
    : String(row.maker || "").split(/[,\n;/|]+/).filter(code => code.trim()).map(code => ({ code: code.trim(), role: "" }));
  const seen = new Set();
  return source.flatMap(item => {
    if (!item || typeof item.code !== "string" || !item.code.trim()) return [];
    const code = lookup.get(item.code.trim().toLowerCase()) || item.code.trim();
    if (seen.has(code.toLowerCase())) return [];
    seen.add(code.toLowerCase());
    return [{ code, role: typeof item.role === "string" ? item.role.trim() : "" }];
  });
}

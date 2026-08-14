const STORAGE_KEY = "booong-teacher-profile-v1";

export const SCHOOL_OPTIONS = [
  { value: "중학교", label: "중학교" },
  { value: "고등학교", label: "고등학교" },
];

export function normalizeTeacherProfile(value = {}, subjectOptions) {
  const school = SCHOOL_OPTIONS.find(option => option.value === value.school)?.value;
  const subject = String(value.subject || "").trim();
  if (!school || !(subjectOptions?.[school] || []).includes(subject)) return null;
  return { school, subject };
}

export function loadTeacherProfile(subjectOptions) {
  try {
    return normalizeTeacherProfile(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || {}, subjectOptions);
  } catch {
    return null;
  }
}

export function saveTeacherProfile(profile, subjectOptions) {
  const normalized = normalizeTeacherProfile(profile, subjectOptions);
  if (!normalized) return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

export function getAdjacentTeacherProfile(profile, subjectOptions, direction) {
  const choices = SCHOOL_OPTIONS.flatMap(({ value: school }) => (subjectOptions?.[school] || []).map(subject => ({ school, subject })));
  if (!choices.length) return null;
  const currentIndex = choices.findIndex(choice => choice.school === profile.school && choice.subject === profile.subject);
  const offset = Math.sign(direction);
  return choices[((currentIndex < 0 ? 0 : currentIndex) + offset + choices.length) % choices.length];
}

export function createSubjectOptions(catalog) {
  return (catalog?.subjects || []).reduce((options, { school, value }) => {
    if (options[school] && value) options[school].push(value);
    return options;
  }, { 중학교: [], 고등학교: [] });
}

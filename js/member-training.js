import { getMemberLookupKeys } from './dashboard-data.js';

export function normalizeTrainingMembers(value) {
  if (!Array.isArray(value) || value.length > 50 || value.some(code => typeof code !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(code))) {
    throw new TypeError('BOOONG 참가자 코드를 확인해 주세요.');
  }
  const seen = new Set();
  return value.filter(code => {
    const key = code.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function memberTrainingCareer(member, trainings) {
  const keys = new Set(getMemberLookupKeys(member));
  const recorded = trainings
    .filter(training => training.memberCodes.some(code => keys.has(code.toLowerCase())))
    .map(training => [training.lectureDate.replaceAll('-', '.'), training.name, training.school].filter(Boolean).join(' · '));
  return [...new Set([...recorded, ...(member.trainingCareer || [])])];
}

export const nextAvailability = state => state === "available" ? "unavailable" : state === "unavailable" ? "undecided" : "available";

export function changeAvailability(availability, pendingDelta, slotId, state) {
  return {
    availability: { ...availability, [slotId]: state },
    delta: { ...pendingDelta, [slotId]: state }
  };
}

export function availabilityGroups(responses, id) {
  const groups = { available: [], unavailable: [], undecided: [] };
  for (const response of responses) {
    const state = response.availability?.[id];
    groups[state === "available" || state === "unavailable" ? state : "undecided"].push(response);
  }
  return groups;
}

export function changeAvailability(availability, pendingDelta, slotId, state) {
  return {
    availability: { ...availability, [slotId]: state },
    delta: { ...pendingDelta, [slotId]: state }
  };
}

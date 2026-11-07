export function googleMapsSearchUrl(placeName) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeName.trim())}`;
}

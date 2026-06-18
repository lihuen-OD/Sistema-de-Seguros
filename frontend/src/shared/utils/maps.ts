/** Extract lat/lng coordinates from a Google Maps URL. Returns null if not parseable. */
export function parseGoogleMapsUrl(url: string): { lat: number; lng: number } | null {
  const patterns = [
    /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /\/(-?\d+\.?\d*),(-?\d+\.?\d*)/,
  ]
  for (const re of patterns) {
    const m = url.match(re)
    if (m) {
      const lat = parseFloat(m[1])
      const lng = parseFloat(m[2])
      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng }
      }
    }
  }
  return null
}

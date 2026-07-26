export function estimateServiceEnd(
  start: Date | null,
  durationHours: number,
): Date | null {
  if (!start) return null;
  return new Date(start.getTime() + Number(durationHours) * 3_600_000);
}

export function estimateTravelMinutes(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
  speedKmh = 25,
  preparationMinutes = 10,
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(destination.latitude - origin.latitude);
  const dLng = radians(destination.longitude - origin.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(origin.latitude)) *
      Math.cos(radians(destination.latitude)) *
      Math.sin(dLng / 2) ** 2;
  const distanceKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.ceil(
    (distanceKm / Math.max(1, speedKmh)) * 60 + Math.max(0, preparationMinutes),
  );
}

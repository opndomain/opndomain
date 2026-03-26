export function nowIso(date = new Date()): string {
  return date.toISOString();
}

export function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function isExpired(isoTimestamp: string, now = new Date()): boolean {
  return new Date(isoTimestamp).getTime() <= now.getTime();
}

import type { Candle } from "../models/candle.js";
import type { SessionWindow } from "../models/config.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export function toUtcDateKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function isInSession(timestamp: number, session: SessionWindow): boolean {
  const hour = new Date(timestamp).getUTCHours();
  return hour >= session.startHourUtc && hour <= session.endHourUtc;
}

export function isInAnySession(timestamp: number, sessions: readonly SessionWindow[]): boolean {
  return sessions.some((session) => isInSession(timestamp, session));
}

export function addDays(timestamp: number, days: number): number {
  return timestamp + days * DAY_MS;
}

export function groupCandlesByUtcDay(candles: readonly Candle[]): Map<string, Candle[]> {
  const groups = new Map<string, Candle[]>();
  for (const candle of candles) {
    const key = toUtcDateKey(candle.timestamp);
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(candle);
    } else {
      groups.set(key, [candle]);
    }
  }
  return groups;
}

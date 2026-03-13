import type { PriceZone } from "../models/setup.js";

export function priceWithinZone(price: number, zone: PriceZone): boolean {
  return price >= zone.lower && price <= zone.upper;
}

export function zoneMidPrice(zone: PriceZone): number {
  return (zone.lower + zone.upper) / 2;
}

export function absoluteDistance(a: number, b: number): number {
  return Math.abs(a - b);
}

export function relativeDistancePct(a: number, b: number): number {
  if (a === 0) {
    return 0;
  }
  return Math.abs((a - b) / a);
}

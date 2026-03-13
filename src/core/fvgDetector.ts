import type { Candle } from "../models/candle.js";
import type { DorisViewConfig } from "../models/config.js";
import type { PriceZone } from "../models/setup.js";
import { clamp } from "../utils/math.js";

export interface FairValueGap {
  readonly id: string;
  readonly direction: "bullish" | "bearish";
  readonly formedAtIndex: number;
  readonly timestamp: number;
  readonly zone: PriceZone;
  readonly sizePct: number;
  readonly fillPct: number;
  readonly isFilled: boolean;
  readonly expiryIndex: number;
  readonly qualityScore: number;
}

function gapFillPct(
  candles: readonly Candle[],
  direction: "bullish" | "bearish",
  zone: PriceZone,
  startIndex: number,
  endIndex: number,
): number {
  const total = zone.upper - zone.lower;
  if (total <= 0) {
    return 1;
  }

  let maxFill = 0;
  for (let i = startIndex; i <= endIndex; i += 1) {
    const candle = candles[i];
    if (!candle) {
      continue;
    }

    let fill = 0;
    if (direction === "bullish") {
      const deepest = Math.max(zone.lower, Math.min(zone.upper, candle.low));
      fill = (zone.upper - deepest) / total;
    } else {
      const highest = Math.min(zone.upper, Math.max(zone.lower, candle.high));
      fill = (highest - zone.lower) / total;
    }
    maxFill = Math.max(maxFill, fill);
  }
  return clamp(maxFill, 0, 1);
}

export function detectFairValueGaps(candles: readonly Candle[], config: DorisViewConfig): FairValueGap[] {
  const fvgs: FairValueGap[] = [];

  for (let i = 2; i < candles.length; i += 1) {
    const first = candles[i - 2];
    const third = candles[i];
    if (!first || !third) {
      continue;
    }

    const bullishGap = first.high < third.low;
    const bearishGap = first.low > third.high;
    if (!bullishGap && !bearishGap) {
      continue;
    }

    const direction = bullishGap ? "bullish" : "bearish";
    const lower = bullishGap ? first.high : third.high;
    const upper = bullishGap ? third.low : first.low;
    const sizePct = (upper - lower) / lower;

    if (sizePct < config.fvg.minGapPct) {
      continue;
    }

    const expiryIndex = Math.min(candles.length - 1, i + config.fvg.expiryBars);
    const fillPct = gapFillPct(candles, direction, { lower, upper }, i + 1, expiryIndex);
    const isFilled = fillPct >= 1;
    const qualityScore = clamp((sizePct / config.fvg.minGapPct) * 25 + (1 - fillPct) * 75, 0, 100);

    fvgs.push({
      id: `fvg-${direction}-${i}`,
      direction,
      formedAtIndex: i,
      timestamp: third.timestamp,
      zone: { lower, upper },
      sizePct,
      fillPct,
      isFilled,
      expiryIndex,
      qualityScore,
    });
  }

  return fvgs;
}

export function getFirstFvgAfterBos(
  fvgs: readonly FairValueGap[],
  direction: "bullish" | "bearish",
  bosIndex: number,
  minFillThreshold: number,
): FairValueGap | undefined {
  return fvgs.find(
    (fvg) =>
      fvg.direction === direction &&
      fvg.formedAtIndex >= bosIndex &&
      fvg.fillPct >= minFillThreshold &&
      !fvg.isFilled,
  );
}

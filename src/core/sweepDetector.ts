import type { Candle } from "../models/candle.js";
import type { DorisViewConfig } from "../models/config.js";
import type { LiquidityPool, SweepEvent } from "../models/liquidityPool.js";
import { clamp, percentDiff } from "../utils/math.js";

function createSweepId(poolId: string, index: number): string {
  return `sweep-${poolId}-${index}`;
}

function sweepQuality(overshootPct: number, reclaimDistancePct: number): number {
  const overshootScore = clamp(overshootPct * 15_000, 0, 60);
  const reclaimScore = clamp(reclaimDistancePct * 12_000, 0, 40);
  return clamp(overshootScore + reclaimScore, 0, 100);
}

export function detectSweeps(
  candles: readonly Candle[],
  pools: readonly LiquidityPool[],
  config: DorisViewConfig,
): SweepEvent[] {
  const events: SweepEvent[] = [];

  for (const pool of pools) {
    const start = Math.max(0, pool.createdAtIndex + 1);
    const end = Math.min(candles.length - 1, pool.expiryIndex ?? candles.length - 1);

    for (let i = start; i <= end; i += 1) {
      const candle = candles[i];
      if (!candle) {
        continue;
      }

      const expectedDirection = pool.side === "buy_side" ? "bearish" : "bullish";
      const overshootRaw =
        pool.side === "buy_side" ? candle.high - pool.price : pool.price - candle.low;

      if (overshootRaw <= 0) {
        continue;
      }

      const overshootPct = overshootRaw / pool.price;
      if (overshootPct < config.sweep.minOvershootPct) {
        continue;
      }

      const immediateReclaim =
        pool.side === "buy_side"
          ? candle.close < pool.price - pool.price * config.sweep.reclaimThresholdPct
          : candle.close > pool.price + pool.price * config.sweep.reclaimThresholdPct;

      const wickRulePassed = config.sweep.allowWickSweep && immediateReclaim;
      if (wickRulePassed) {
        events.push({
          id: createSweepId(pool.id, i),
          poolId: pool.id,
          sideTaken: pool.side,
          expectedDirection,
          sweepIndex: i,
          timestamp: candle.timestamp,
          liquidityLevel: pool.price,
          sweepExtreme: pool.side === "buy_side" ? candle.high : candle.low,
          overshootPct,
          reclaimIndex: i,
          reclaimClose: candle.close,
          qualityScore: sweepQuality(overshootPct, percentDiff(pool.price, candle.close)),
          reason: "Wick sweep with immediate reclaim close.",
        });
        break;
      }

      if (!config.sweep.allowCloseBeyondReclaim) {
        continue;
      }

      let foundReclaim = false;
      for (
        let j = i + 1;
        j <= Math.min(i + config.sweep.maxConfirmationCandles, candles.length - 1);
        j += 1
      ) {
        const reclaimCandle = candles[j];
        if (!reclaimCandle) {
          continue;
        }
        const reclaimed =
          pool.side === "buy_side"
            ? reclaimCandle.close < pool.price - pool.price * config.sweep.reclaimThresholdPct
            : reclaimCandle.close > pool.price + pool.price * config.sweep.reclaimThresholdPct;
        if (!reclaimed) {
          continue;
        }

        events.push({
          id: createSweepId(pool.id, i),
          poolId: pool.id,
          sideTaken: pool.side,
          expectedDirection,
          sweepIndex: i,
          timestamp: candle.timestamp,
          liquidityLevel: pool.price,
          sweepExtreme: pool.side === "buy_side" ? candle.high : candle.low,
          overshootPct,
          reclaimIndex: j,
          reclaimClose: reclaimCandle.close,
          qualityScore: sweepQuality(overshootPct, percentDiff(pool.price, reclaimCandle.close)),
          reason: "Close beyond liquidity followed by reclaim.",
        });
        foundReclaim = true;
        break;
      }

      if (foundReclaim) {
        break;
      }
    }
  }

  return events.sort((a, b) => a.sweepIndex - b.sweepIndex);
}

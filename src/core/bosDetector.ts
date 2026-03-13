import type { Candle } from "../models/candle.js";
import type { DorisViewConfig } from "../models/config.js";
import type { SweepEvent } from "../models/liquidityPool.js";
import type { MarketStructureState, StructureBias, SwingPoint } from "../models/swing.js";

export type BosType = "BOS" | "CHOCH";

export interface BosEvent {
  readonly id: string;
  readonly direction: "bullish" | "bearish";
  readonly type: BosType;
  readonly breakIndex: number;
  readonly timestamp: number;
  readonly brokenSwingIndex: number;
  readonly brokenLevel: number;
  readonly sourceSweepId: string;
  readonly qualityScore: number;
  readonly reason: string;
}

function getLatestSwingBefore(
  swings: readonly SwingPoint[],
  type: "high" | "low",
  index: number,
): SwingPoint | undefined {
  return [...swings]
    .filter((swing) => swing.type === type && swing.index < index)
    .sort((a, b) => b.index - a.index)
    .at(0);
}

function bosType(direction: "bullish" | "bearish", htfBias: StructureBias, enabled: boolean): BosType {
  if (!enabled) {
    return "BOS";
  }
  const aligned = (direction === "bullish" && htfBias === "bullish") || (direction === "bearish" && htfBias === "bearish");
  return aligned ? "BOS" : "CHOCH";
}

export function detectBosEvents(
  candles: readonly Candle[],
  structure: MarketStructureState,
  sweeps: readonly SweepEvent[],
  config: DorisViewConfig,
): BosEvent[] {
  const events: BosEvent[] = [];

  for (const sweep of sweeps) {
    const direction = sweep.expectedDirection;
    const brokenSwingType = direction === "bearish" ? "low" : "high";
    const candidateSwing = getLatestSwingBefore(
      structure.internalSwings,
      brokenSwingType,
      sweep.reclaimIndex,
    );

    if (!candidateSwing) {
      continue;
    }

    const buffer = candidateSwing.price * config.bos.breakBufferPct;
    const minIndex = sweep.reclaimIndex + 1;
    const maxIndex = Math.min(candles.length - 1, minIndex + config.bos.maxBreakCandlesAfterSweep);

    for (let i = minIndex; i <= maxIndex; i += 1) {
      const candle = candles[i];
      if (!candle) {
        continue;
      }

      const levelBroken = direction === "bearish"
        ? (config.bos.requireBodyClose
          ? candle.close < candidateSwing.price - buffer
          : candle.low < candidateSwing.price - buffer)
        : (config.bos.requireBodyClose
          ? candle.close > candidateSwing.price + buffer
          : candle.high > candidateSwing.price + buffer);

      if (!levelBroken) {
        continue;
      }

      events.push({
        id: `bos-${sweep.id}-${i}`,
        direction,
        type: bosType(direction, structure.bias, config.bos.enableChoch),
        breakIndex: i,
        timestamp: candle.timestamp,
        brokenSwingIndex: candidateSwing.index,
        brokenLevel: candidateSwing.price,
        sourceSweepId: sweep.id,
        qualityScore: Math.min(100, (candidateSwing.strength * 30_000) + 30),
        reason: `Price broke internal ${brokenSwingType} at ${candidateSwing.price.toFixed(3)}.`,
      });
      break;
    }
  }

  return events.sort((a, b) => a.breakIndex - b.breakIndex);
}

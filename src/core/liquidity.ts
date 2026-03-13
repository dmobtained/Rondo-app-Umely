import type { Candle } from "../models/candle.js";
import type { DorisViewConfig } from "../models/config.js";
import type { LiquidityPool, LiquidityPoolType } from "../models/liquidityPool.js";
import type { MarketStructureState, SwingPoint } from "../models/swing.js";
import { average, percentDiff } from "../utils/math.js";
import { groupCandlesByUtcDay } from "../utils/time.js";

function poolId(type: LiquidityPoolType, index: number, price: number): string {
  return `${type}-${index}-${Math.round(price * 100)}`;
}

function fromSwing(swing: SwingPoint, type: LiquidityPoolType): LiquidityPool {
  const side = swing.type === "high" ? "buy_side" : "sell_side";
  return {
    id: poolId(type, swing.index, swing.price),
    type,
    side,
    price: swing.price,
    createdAtIndex: swing.index,
    sourceSwingIndices: [swing.index],
    significance: swing.strength,
    touchedCount: 1,
  };
}

function detectEqualPools(swings: readonly SwingPoint[], config: DorisViewConfig): LiquidityPool[] {
  const pools: LiquidityPool[] = [];
  const tolerance = config.liquidity.equalLevelTolerancePct;
  const minDistance = config.liquidity.minimumDistanceBetweenEqualPoints;

  for (let i = 0; i < swings.length; i += 1) {
    const left = swings[i];
    if (!left || left.strength < config.liquidity.minimumSwingSignificance) {
      continue;
    }

    for (let j = i + 1; j < swings.length; j += 1) {
      const right = swings[j];
      if (!right || left.type !== right.type) {
        continue;
      }

      if (right.index - left.index < minDistance) {
        continue;
      }

      if (percentDiff(left.price, right.price) > tolerance) {
        continue;
      }

      const type = left.type === "high" ? "equal_highs" : "equal_lows";
      const price = average([left.price, right.price]);
      const side = left.type === "high" ? "buy_side" : "sell_side";
      pools.push({
        id: poolId(type, right.index, price),
        type,
        side,
        price,
        createdAtIndex: right.index,
        sourceSwingIndices: [left.index, right.index],
        significance: average([left.strength, right.strength]),
        touchedCount: 2,
        expiryIndex: right.index + config.liquidity.poolExpiryBars,
      });
    }
  }

  return pools;
}

function detectPreviousDayPools(candles: readonly Candle[], config: DorisViewConfig): LiquidityPool[] {
  if (!config.liquidity.includePreviousDayLevels) {
    return [];
  }

  const grouped = groupCandlesByUtcDay(candles);
  const dayKeys = [...grouped.keys()].sort();
  const pools: LiquidityPool[] = [];

  for (let i = 1; i < dayKeys.length; i += 1) {
    const previous = grouped.get(dayKeys[i - 1] ?? "");
    const current = grouped.get(dayKeys[i] ?? "");
    if (!previous || !current || current.length === 0) {
      continue;
    }

    const prevHigh = Math.max(...previous.map((candle) => candle.high));
    const prevLow = Math.min(...previous.map((candle) => candle.low));
    const createIndex = candles.findIndex((candle) => candle.timestamp === current[0]?.timestamp);
    if (createIndex < 0) {
      continue;
    }

    pools.push({
      id: poolId("previous_day_high", createIndex, prevHigh),
      type: "previous_day_high",
      side: "buy_side",
      price: prevHigh,
      createdAtIndex: createIndex,
      sourceSwingIndices: [],
      significance: 1,
      touchedCount: 1,
      expiryIndex: createIndex + config.liquidity.poolExpiryBars,
    });
    pools.push({
      id: poolId("previous_day_low", createIndex, prevLow),
      type: "previous_day_low",
      side: "sell_side",
      price: prevLow,
      createdAtIndex: createIndex,
      sourceSwingIndices: [],
      significance: 1,
      touchedCount: 1,
      expiryIndex: createIndex + config.liquidity.poolExpiryBars,
    });
  }

  return pools;
}

function detectRangePools(candles: readonly Candle[], config: DorisViewConfig): LiquidityPool[] {
  if (!config.liquidity.includeRangeLevels || candles.length < config.liquidity.rangeLookbackBars) {
    return [];
  }
  const start = candles.length - config.liquidity.rangeLookbackBars;
  const window = candles.slice(start);
  const rangeHigh = Math.max(...window.map((candle) => candle.high));
  const rangeLow = Math.min(...window.map((candle) => candle.low));

  return [
    {
      id: poolId("range_high", start, rangeHigh),
      type: "range_high",
      side: "buy_side",
      price: rangeHigh,
      createdAtIndex: start,
      sourceSwingIndices: [],
      significance: 0.8,
      touchedCount: 1,
      expiryIndex: start + config.liquidity.poolExpiryBars,
    },
    {
      id: poolId("range_low", start, rangeLow),
      type: "range_low",
      side: "sell_side",
      price: rangeLow,
      createdAtIndex: start,
      sourceSwingIndices: [],
      significance: 0.8,
      touchedCount: 1,
      expiryIndex: start + config.liquidity.poolExpiryBars,
    },
  ];
}

function dedupePools(pools: readonly LiquidityPool[], tolerancePct: number): LiquidityPool[] {
  const deduped: LiquidityPool[] = [];
  for (const pool of pools) {
    const existing = deduped.find(
      (item) => item.side === pool.side && percentDiff(item.price, pool.price) <= tolerancePct,
    );
    if (!existing) {
      deduped.push(pool);
    }
  }
  return deduped.sort((a, b) => a.createdAtIndex - b.createdAtIndex);
}

export function detectLiquidityPools(
  candles: readonly Candle[],
  structure: MarketStructureState,
  config: DorisViewConfig,
): LiquidityPool[] {
  const swingPools = structure.externalSwings.map((swing) =>
    fromSwing(swing, swing.type === "high" ? "swing_high" : "swing_low"),
  );

  const pools = [
    ...swingPools,
    ...detectEqualPools(structure.externalSwings, config),
    ...detectPreviousDayPools(candles, config),
    ...detectRangePools(candles, config),
  ];

  return dedupePools(pools, config.liquidity.equalLevelTolerancePct / 2);
}

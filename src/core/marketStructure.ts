import type { Candle } from "../models/candle.js";
import type { DorisViewConfig } from "../models/config.js";
import type { MarketStructureState, StructureBias, StructureLayer, SwingPoint } from "../models/swing.js";
import { percentDiff } from "../utils/math.js";

interface SwingDetectionParams {
  readonly leftBars: number;
  readonly rightBars: number;
  readonly minSwingDistanceBars: number;
  readonly minSwingSizePct: number;
  readonly layer: StructureLayer;
}

function isSwingHigh(candles: readonly Candle[], index: number, left: number, right: number): boolean {
  const candidate = candles[index];
  if (!candidate) {
    return false;
  }

  for (let i = index - left; i <= index + right; i += 1) {
    if (i === index) {
      continue;
    }
    const compare = candles[i];
    if (!compare || compare.high >= candidate.high) {
      return false;
    }
  }
  return true;
}

function isSwingLow(candles: readonly Candle[], index: number, left: number, right: number): boolean {
  const candidate = candles[index];
  if (!candidate) {
    return false;
  }

  for (let i = index - left; i <= index + right; i += 1) {
    if (i === index) {
      continue;
    }
    const compare = candles[i];
    if (!compare || compare.low <= candidate.low) {
      return false;
    }
  }
  return true;
}

function computeSwingStrength(candles: readonly Candle[], index: number, type: "high" | "low"): number {
  const left = candles[index - 1];
  const right = candles[index + 1];
  const current = candles[index];
  if (!left || !right || !current) {
    return 0;
  }

  if (type === "high") {
    return (percentDiff(current.high, left.high) + percentDiff(current.high, right.high)) / 2;
  }
  return (percentDiff(current.low, left.low) + percentDiff(current.low, right.low)) / 2;
}

function detectSwings(candles: readonly Candle[], params: SwingDetectionParams): SwingPoint[] {
  const swings: SwingPoint[] = [];
  let lastAcceptedIndex = -Infinity;

  for (let i = params.leftBars; i < candles.length - params.rightBars; i += 1) {
    const high = isSwingHigh(candles, i, params.leftBars, params.rightBars);
    const low = isSwingLow(candles, i, params.leftBars, params.rightBars);
    if (!high && !low) {
      continue;
    }

    if (i - lastAcceptedIndex < params.minSwingDistanceBars) {
      continue;
    }

    const swingType = high ? "high" : "low";
    const candle = candles[i];
    if (!candle) {
      continue;
    }

    const price = swingType === "high" ? candle.high : candle.low;
    const strength = computeSwingStrength(candles, i, swingType);
    if (strength < params.minSwingSizePct) {
      continue;
    }

    swings.push({
      index: i,
      timestamp: candle.timestamp,
      price,
      type: swingType,
      strength,
      layer: params.layer,
    });
    lastAcceptedIndex = i;
  }

  return swings;
}

function deriveBias(swings: readonly SwingPoint[]): StructureBias {
  const highs = swings.filter((swing) => swing.type === "high");
  const lows = swings.filter((swing) => swing.type === "low");
  const lastHigh = highs.at(-1);
  const prevHigh = highs.at(-2);
  const lastLow = lows.at(-1);
  const prevLow = lows.at(-2);

  if (!lastHigh || !prevHigh || !lastLow || !prevLow) {
    return "neutral";
  }

  const bullish = lastHigh.price > prevHigh.price && lastLow.price > prevLow.price;
  const bearish = lastHigh.price < prevHigh.price && lastLow.price < prevLow.price;

  if (bullish) {
    return "bullish";
  }
  if (bearish) {
    return "bearish";
  }
  return "neutral";
}

export function buildMarketStructure(candles: readonly Candle[], config: DorisViewConfig): MarketStructureState {
  const externalSwings = detectSwings(candles, {
    leftBars: config.swing.externalLeftBars,
    rightBars: config.swing.externalRightBars,
    minSwingDistanceBars: config.swing.minSwingDistanceBars,
    minSwingSizePct: config.swing.minSwingSizePct,
    layer: "external",
  });

  const internalSwings = detectSwings(candles, {
    leftBars: config.swing.internalLeftBars,
    rightBars: config.swing.internalRightBars,
    minSwingDistanceBars: 1,
    minSwingSizePct: config.swing.minSwingSizePct / 2,
    layer: "internal",
  });

  const bias = deriveBias(externalSwings);
  const highs = externalSwings.filter((swing) => swing.type === "high");
  const lows = externalSwings.filter((swing) => swing.type === "low");

  const notes = [
    `External swings: ${externalSwings.length}`,
    `Internal swings: ${internalSwings.length}`,
    `Derived bias: ${bias}`,
  ];

  return {
    bias,
    externalSwings,
    internalSwings,
    lastHigherHigh: highs.at(-1),
    lastHigherLow: lows.at(-1),
    lastLowerHigh: highs.at(-2),
    lastLowerLow: lows.at(-2),
    notes,
  };
}

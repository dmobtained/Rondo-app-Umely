import type { Candle } from "../models/candle.js";
import type { DorisViewConfig } from "../models/config.js";
import type { StructureBias } from "../models/swing.js";
import { average } from "../utils/math.js";
import { relativeDistancePct } from "../utils/price.js";
import { isInAnySession } from "../utils/time.js";

export interface ValidationResult {
  readonly valid: boolean;
  readonly reasons: readonly string[];
  readonly invalidationReason?: string;
  readonly sessionQuality: number;
}

function trueRange(current: Candle, previous?: Candle): number {
  if (!previous) {
    return current.high - current.low;
  }
  return Math.max(
    current.high - current.low,
    Math.abs(current.high - previous.close),
    Math.abs(current.low - previous.close),
  );
}

export function calculateAtrPct(candles: readonly Candle[], endIndex: number, period: number): number {
  if (endIndex <= 0 || period <= 0) {
    return 0;
  }
  const start = Math.max(1, endIndex - period + 1);
  const ranges: number[] = [];
  for (let i = start; i <= endIndex; i += 1) {
    const current = candles[i];
    const previous = candles[i - 1];
    if (!current) {
      continue;
    }
    ranges.push(trueRange(current, previous));
  }

  const candle = candles[endIndex];
  if (!candle || ranges.length === 0) {
    return 0;
  }
  return average(ranges) / candle.close;
}

function rangePct(candles: readonly Candle[], endIndex: number, lookback: number): number {
  const start = Math.max(0, endIndex - lookback + 1);
  const window = candles.slice(start, endIndex + 1);
  if (window.length === 0) {
    return 0;
  }
  const high = Math.max(...window.map((c) => c.high));
  const low = Math.min(...window.map((c) => c.low));
  const close = window.at(-1)?.close ?? 0;
  if (close === 0) {
    return 0;
  }
  return (high - low) / close;
}

export function validateSetupFilters(args: {
  candles: readonly Candle[];
  signalIndex: number;
  direction: "long" | "short";
  htfBias: StructureBias;
  entryPrice: number;
  stopLoss: number;
  config: DorisViewConfig;
}): ValidationResult {
  const reasons: string[] = [];
  const { candles, signalIndex, direction, htfBias, entryPrice, stopLoss, config } = args;
  const signalCandle = candles[signalIndex];
  if (!signalCandle) {
    return {
      valid: false,
      reasons,
      invalidationReason: "Missing signal candle.",
      sessionQuality: 0,
    };
  }

  let sessionQuality = 100;
  if (config.filters.sessionFilterEnabled) {
    const inSession = isInAnySession(signalCandle.timestamp, [config.filters.london, config.filters.newYork]);
    if (!inSession) {
      return {
        valid: false,
        reasons,
        invalidationReason: "Signal outside configured sessions.",
        sessionQuality: 0,
      };
    }
    sessionQuality = 100;
    reasons.push("Session filter passed.");
  } else {
    sessionQuality = 60;
  }

  if (signalCandle.spread !== undefined && signalCandle.spread > config.filters.maxSpread) {
    return {
      valid: false,
      reasons,
      invalidationReason: "Spread above configured maximum.",
      sessionQuality,
    };
  }

  const atrPct = calculateAtrPct(candles, signalIndex, config.filters.atrPeriod);
  if (atrPct < config.filters.minAtrPct) {
    return {
      valid: false,
      reasons,
      invalidationReason: "ATR below minimum volatility threshold.",
      sessionQuality,
    };
  }
  reasons.push(`ATR check passed (${(atrPct * 100).toFixed(2)}%).`);

  const chop = rangePct(candles, signalIndex, config.filters.atrPeriod);
  if (chop < config.filters.chopThresholdPct) {
    return {
      valid: false,
      reasons,
      invalidationReason: "Market in chop/range filter zone.",
      sessionQuality,
    };
  }

  if (config.filters.alignWithHtfBias) {
    const aligned =
      (direction === "long" && htfBias === "bullish") ||
      (direction === "short" && htfBias === "bearish");
    if (!aligned && htfBias !== "neutral") {
      return {
        valid: false,
        reasons,
        invalidationReason: "Direction not aligned with HTF bias.",
        sessionQuality,
      };
    }
  }

  const stopDistancePct = relativeDistancePct(entryPrice, stopLoss);
  if (stopDistancePct > config.filters.maxEntryToStopPct) {
    return {
      valid: false,
      reasons,
      invalidationReason: "Entry-to-stop distance too wide.",
      sessionQuality,
    };
  }
  reasons.push("Risk distance filter passed.");

  return {
    valid: true,
    reasons,
    sessionQuality,
  };
}

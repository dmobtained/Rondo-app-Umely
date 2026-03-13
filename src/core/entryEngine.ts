import type { BosEvent } from "./bosDetector.js";
import type { FairValueGap } from "./fvgDetector.js";
import type { Candle } from "../models/candle.js";
import type { DorisViewConfig } from "../models/config.js";
import type { LiquidityPool, SweepEvent } from "../models/liquidityPool.js";
import type { TradeSetup } from "../models/setup.js";
import type { StructureBias } from "../models/swing.js";
import { validateSetupFilters } from "./tradeValidator.js";
import { clamp } from "../utils/math.js";

function riskReward(entry: number, stop: number, target: number): number {
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  if (risk <= 0) {
    return 0;
  }
  return reward / risk;
}

function pickTargetPool(
  pools: readonly LiquidityPool[],
  direction: "long" | "short",
  entryPrice: number,
): LiquidityPool | undefined {
  const side = direction === "long" ? "buy_side" : "sell_side";
  const eligible = pools.filter((pool) => {
    if (pool.side !== side) {
      return false;
    }
    if (direction === "long") {
      return pool.price > entryPrice;
    }
    return pool.price < entryPrice;
  });

  if (eligible.length === 0) {
    return undefined;
  }

  return eligible.sort((a, b) => Math.abs(a.price - entryPrice) - Math.abs(b.price - entryPrice))[0];
}

function alignmentScore(direction: "long" | "short", htfBias: StructureBias): number {
  if (htfBias === "neutral") {
    return 60;
  }
  const aligned =
    (direction === "long" && htfBias === "bullish") ||
    (direction === "short" && htfBias === "bearish");
  return aligned ? 100 : 20;
}

function rrScore(rr: number, minRr: number): number {
  if (rr <= 0) {
    return 0;
  }
  return clamp((rr / minRr) * 60, 0, 100);
}

function confidenceScore(args: {
  htf: number;
  sweep: number;
  bos: number;
  fvg: number;
  rr: number;
  session: number;
  config: DorisViewConfig;
}): number {
  const { config } = args;
  const totalWeight =
    config.confidence.htfAlignment +
    config.confidence.sweepQuality +
    config.confidence.bosQuality +
    config.confidence.fvgQuality +
    config.confidence.rrQuality +
    config.confidence.sessionQuality;

  const weighted =
    args.htf * config.confidence.htfAlignment +
    args.sweep * config.confidence.sweepQuality +
    args.bos * config.confidence.bosQuality +
    args.fvg * config.confidence.fvgQuality +
    args.rr * config.confidence.rrQuality +
    args.session * config.confidence.sessionQuality;

  if (totalWeight <= 0) {
    return 0;
  }
  return clamp(weighted / totalWeight, 0, 100);
}

function findRelatedFvg(
  fvgs: readonly FairValueGap[],
  direction: "bullish" | "bearish",
  bosIndex: number,
  sweepIndex: number,
): FairValueGap | undefined {
  return fvgs.find(
    (fvg) =>
      fvg.direction === direction &&
      fvg.formedAtIndex >= bosIndex &&
      fvg.formedAtIndex <= bosIndex + 6 &&
      fvg.expiryIndex > sweepIndex &&
      !fvg.isFilled,
  );
}

export function buildTradeSetups(args: {
  candles: readonly Candle[];
  symbol: string;
  htfBias: StructureBias;
  pools: readonly LiquidityPool[];
  sweeps: readonly SweepEvent[];
  bosEvents: readonly BosEvent[];
  fvgs: readonly FairValueGap[];
  config: DorisViewConfig;
}): TradeSetup[] {
  const { candles, symbol, htfBias, pools, sweeps, bosEvents, fvgs, config } = args;
  const sweepById = new Map(sweeps.map((sweep) => [sweep.id, sweep]));
  const setups: TradeSetup[] = [];

  for (const bos of bosEvents) {
    const sweep = sweepById.get(bos.sourceSweepId);
    if (!sweep) {
      continue;
    }

    const isBearish = bos.direction === "bearish";
    const direction = isBearish ? "short" : "long";
    const fvgDirection = isBearish ? "bearish" : "bullish";
    const entryFvg = findRelatedFvg(fvgs, fvgDirection, bos.breakIndex, sweep.sweepIndex);
    if (!entryFvg) {
      continue;
    }

    const entryPrice = (entryFvg.zone.lower + entryFvg.zone.upper) / 2;
    const stopLoss = isBearish
      ? sweep.sweepExtreme * (1 + config.risk.stopBufferPct)
      : sweep.sweepExtreme * (1 - config.risk.stopBufferPct);

    const targetPool = pickTargetPool(pools, direction, entryPrice);
    if (!targetPool) {
      continue;
    }
    const takeProfit = targetPool.price;
    const rr = riskReward(entryPrice, stopLoss, takeProfit);

    const validation = validateSetupFilters({
      candles,
      signalIndex: bos.breakIndex,
      direction,
      htfBias,
      entryPrice,
      stopLoss,
      config,
    });

    const reasons = [
      `Liquidity sweep confirmed (${sweep.reason})`,
      bos.reason,
      `FVG selected (${entryFvg.id})`,
      ...validation.reasons,
    ];

    if (!validation.valid) {
      continue;
    }
    if (rr < config.risk.minRiskReward) {
      continue;
    }

    const confidence = confidenceScore({
      htf: alignmentScore(direction, htfBias),
      sweep: sweep.qualityScore,
      bos: bos.qualityScore,
      fvg: entryFvg.qualityScore,
      rr: rrScore(rr, config.risk.minRiskReward),
      session: validation.sessionQuality,
      config,
    });

    setups.push({
      id: `setup-${symbol}-${bos.breakIndex}-${direction}`,
      symbol,
      direction,
      htfBias,
      liquidityTargetUsed: targetPool.type,
      sweepTimestamp: sweep.timestamp,
      sweepIndex: sweep.sweepIndex,
      bosLevel: bos.brokenLevel,
      bosIndex: bos.breakIndex,
      entryZone: entryFvg.zone,
      entryPrice,
      stopLoss,
      takeProfit,
      riskReward: rr,
      confidenceScore: confidence,
      reasons,
      status: "waiting_retest",
      signalIndex: bos.breakIndex,
      expiresAtIndex: Math.min(entryFvg.expiryIndex, bos.breakIndex + config.fvg.expiryBars),
    });
  }

  return setups;
}

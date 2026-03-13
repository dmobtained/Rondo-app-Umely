import { detectBosEvents, type BosEvent } from "../core/bosDetector.js";
import { buildTradeSetups } from "../core/entryEngine.js";
import { detectFairValueGaps, type FairValueGap } from "../core/fvgDetector.js";
import { detectLiquidityPools } from "../core/liquidity.js";
import { buildMarketStructure } from "../core/marketStructure.js";
import { detectSweeps } from "../core/sweepDetector.js";
import type { Candle } from "../models/candle.js";
import type { DorisViewConfig } from "../models/config.js";
import type { LiquidityPool, SweepEvent } from "../models/liquidityPool.js";
import type { TradeSetup } from "../models/setup.js";
import type { MarketStructureState } from "../models/swing.js";

export interface StrategyAnalysisResult {
  readonly htfStructure: MarketStructureState;
  readonly ltfStructure: MarketStructureState;
  readonly liquidityPools: readonly LiquidityPool[];
  readonly sweeps: readonly SweepEvent[];
  readonly bosEvents: readonly BosEvent[];
  readonly fairValueGaps: readonly FairValueGap[];
  readonly setups: readonly TradeSetup[];
}

export class DorisViewStrategy {
  constructor(private readonly config: DorisViewConfig) {}

  analyze(input: {
    htfCandles: readonly Candle[];
    ltfCandles: readonly Candle[];
    symbol?: string;
  }): StrategyAnalysisResult {
    const symbol = input.symbol ?? this.config.symbol;
    const htfStructure = buildMarketStructure(input.htfCandles, this.config);
    const ltfStructure = buildMarketStructure(input.ltfCandles, this.config);

    const liquidityPools = detectLiquidityPools(input.ltfCandles, ltfStructure, this.config);
    const sweeps = detectSweeps(input.ltfCandles, liquidityPools, this.config);
    const bosEvents = detectBosEvents(input.ltfCandles, ltfStructure, sweeps, this.config);
    const fairValueGaps = detectFairValueGaps(input.ltfCandles, this.config);

    const htfBias = htfStructure.bias === "neutral" ? ltfStructure.bias : htfStructure.bias;
    const setups = buildTradeSetups({
      candles: input.ltfCandles,
      symbol,
      htfBias,
      pools: liquidityPools,
      sweeps,
      bosEvents,
      fvgs: fairValueGaps,
      config: this.config,
    });

    return {
      htfStructure,
      ltfStructure,
      liquidityPools,
      sweeps,
      bosEvents,
      fairValueGaps,
      setups,
    };
  }
}

// TODO(broker-integration): Add adapter interface for broker order placement and live execution state sync.

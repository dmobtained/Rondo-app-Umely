import type { Timeframe } from "./candle.js";

export interface TimeframeConfig {
  readonly htf: Timeframe;
  readonly ltf: Timeframe;
}

export interface SwingConfig {
  readonly externalLeftBars: number;
  readonly externalRightBars: number;
  readonly internalLeftBars: number;
  readonly internalRightBars: number;
  readonly minSwingDistanceBars: number;
  readonly minSwingSizePct: number;
}

export interface LiquidityConfig {
  readonly equalLevelTolerancePct: number;
  readonly minimumSwingSignificance: number;
  readonly minimumDistanceBetweenEqualPoints: number;
  readonly rangeLookbackBars: number;
  readonly includePreviousDayLevels: boolean;
  readonly includeRangeLevels: boolean;
  readonly poolExpiryBars: number;
}

export interface SweepConfig {
  readonly allowWickSweep: boolean;
  readonly allowCloseBeyondReclaim: boolean;
  readonly minOvershootPct: number;
  readonly reclaimThresholdPct: number;
  readonly maxConfirmationCandles: number;
}

export interface BosConfig {
  readonly breakBufferPct: number;
  readonly requireBodyClose: boolean;
  readonly maxBreakCandlesAfterSweep: number;
  readonly enableChoch: boolean;
}

export interface FvgConfig {
  readonly minGapPct: number;
  readonly fillThresholdPct: number;
  readonly requirePartialFill: boolean;
  readonly expiryBars: number;
}

export interface SessionWindow {
  readonly startHourUtc: number;
  readonly endHourUtc: number;
}

export interface FilterConfig {
  readonly sessionFilterEnabled: boolean;
  readonly london: SessionWindow;
  readonly newYork: SessionWindow;
  readonly maxSpread: number;
  readonly minAtrPct: number;
  readonly atrPeriod: number;
  readonly chopThresholdPct: number;
  readonly maxEntryToStopPct: number;
  readonly alignWithHtfBias: boolean;
}

export interface RiskConfig {
  readonly accountCurrency: string;
  readonly accountSize: number;
  readonly riskPerTradePct: number;
  readonly minRiskReward: number;
  readonly maxTradesPerDay: number;
  readonly maxDailyDrawdownPct: number;
  readonly maxConsecutiveLosses: number;
  readonly breakEvenAfterR?: number;
  readonly partialTakeProfitAtR?: number;
  readonly partialTakeProfitSizePct?: number;
  readonly instrumentPointValue: number;
  readonly stopBufferPct: number;
}

export interface ConfidenceWeights {
  readonly htfAlignment: number;
  readonly sweepQuality: number;
  readonly bosQuality: number;
  readonly fvgQuality: number;
  readonly rrQuality: number;
  readonly sessionQuality: number;
}

export interface DorisViewConfig {
  readonly symbol: string;
  readonly timeframe: TimeframeConfig;
  readonly swing: SwingConfig;
  readonly liquidity: LiquidityConfig;
  readonly sweep: SweepConfig;
  readonly bos: BosConfig;
  readonly fvg: FvgConfig;
  readonly filters: FilterConfig;
  readonly risk: RiskConfig;
  readonly confidence: ConfidenceWeights;
}

export const defaultConfig: DorisViewConfig = {
  symbol: "XAUUSD",
  timeframe: {
    htf: "1h",
    ltf: "5m",
  },
  swing: {
    externalLeftBars: 3,
    externalRightBars: 3,
    internalLeftBars: 1,
    internalRightBars: 1,
    minSwingDistanceBars: 2,
    minSwingSizePct: 0.0008,
  },
  liquidity: {
    equalLevelTolerancePct: 0.0004,
    minimumSwingSignificance: 0.0008,
    minimumDistanceBetweenEqualPoints: 2,
    rangeLookbackBars: 48,
    includePreviousDayLevels: true,
    includeRangeLevels: true,
    poolExpiryBars: 120,
  },
  sweep: {
    allowWickSweep: true,
    allowCloseBeyondReclaim: true,
    minOvershootPct: 0.0002,
    reclaimThresholdPct: 0,
    maxConfirmationCandles: 6,
  },
  bos: {
    breakBufferPct: 0.00015,
    requireBodyClose: true,
    maxBreakCandlesAfterSweep: 8,
    enableChoch: true,
  },
  fvg: {
    minGapPct: 0.00015,
    fillThresholdPct: 0.5,
    requirePartialFill: false,
    expiryBars: 40,
  },
  filters: {
    sessionFilterEnabled: true,
    london: {
      startHourUtc: 7,
      endHourUtc: 11,
    },
    newYork: {
      startHourUtc: 12,
      endHourUtc: 16,
    },
    maxSpread: 0.8,
    minAtrPct: 0.0006,
    atrPeriod: 14,
    chopThresholdPct: 0.0012,
    maxEntryToStopPct: 0.003,
    alignWithHtfBias: true,
  },
  risk: {
    accountCurrency: "USD",
    accountSize: 10_000,
    riskPerTradePct: 0.005,
    minRiskReward: 2,
    maxTradesPerDay: 3,
    maxDailyDrawdownPct: 0.02,
    maxConsecutiveLosses: 3,
    breakEvenAfterR: 1.2,
    partialTakeProfitAtR: 1,
    partialTakeProfitSizePct: 0.5,
    instrumentPointValue: 1,
    stopBufferPct: 0.0001,
  },
  confidence: {
    htfAlignment: 20,
    sweepQuality: 20,
    bosQuality: 20,
    fvgQuality: 20,
    rrQuality: 15,
    sessionQuality: 5,
  },
};

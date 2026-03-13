import { runBacktest } from "../backtest/backtestEngine.js";
import { buildMockScenario } from "../data/mockCandles.js";
import { defaultConfig, type DorisViewConfig } from "../models/config.js";
import { DorisViewStrategy, type StrategyAnalysisResult } from "../strategies/dorisViewStrategy.js";

export interface DemoRunResult {
  readonly config: DorisViewConfig;
  readonly htfCandles: ReturnType<typeof buildMockScenario>["htfCandles"];
  readonly ltfCandles: ReturnType<typeof buildMockScenario>["ltfCandles"];
  readonly analysis: StrategyAnalysisResult;
  readonly backtest: ReturnType<typeof runBacktest>;
}

export function createDemoConfig(): DorisViewConfig {
  return {
    ...defaultConfig,
    filters: {
      ...defaultConfig.filters,
      sessionFilterEnabled: true,
      alignWithHtfBias: false,
      minAtrPct: 0.0001,
      chopThresholdPct: 0.0002,
      maxEntryToStopPct: 0.03,
    },
    swing: {
      ...defaultConfig.swing,
      externalLeftBars: 2,
      externalRightBars: 2,
      minSwingSizePct: 0.00001,
      minSwingDistanceBars: 1,
    },
    liquidity: {
      ...defaultConfig.liquidity,
      minimumSwingSignificance: 0.00001,
      rangeLookbackBars: 20,
      equalLevelTolerancePct: 0.0008,
    },
    sweep: {
      ...defaultConfig.sweep,
      minOvershootPct: 0.00005,
      maxConfirmationCandles: 8,
    },
    bos: {
      ...defaultConfig.bos,
      requireBodyClose: false,
      maxBreakCandlesAfterSweep: 10,
    },
    risk: {
      ...defaultConfig.risk,
      accountSize: 25_000,
      minRiskReward: 1.4,
    },
  };
}

export function runDemoPipeline(): DemoRunResult {
  const config = createDemoConfig();
  const { htfCandles, ltfCandles } = buildMockScenario(config.symbol);
  const strategy = new DorisViewStrategy(config);
  const analysis = strategy.analyze({
    htfCandles,
    ltfCandles,
    symbol: config.symbol,
  });

  const backtest = runBacktest({
    candles: ltfCandles,
    setups: analysis.setups,
    config,
  });

  return {
    config,
    htfCandles,
    ltfCandles,
    analysis,
    backtest,
  };
}

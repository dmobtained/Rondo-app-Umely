import { runBacktest } from "./backtest/backtestEngine.js";
import { buildMockScenario } from "./data/mockCandles.js";
import { defaultConfig, type DorisViewConfig } from "./models/config.js";
import { DorisViewStrategy } from "./strategies/dorisViewStrategy.js";
import { logger } from "./utils/logger.js";

function createDemoConfig(): DorisViewConfig {
  return {
    ...defaultConfig,
    filters: {
      ...defaultConfig.filters,
      sessionFilterEnabled: true,
      alignWithHtfBias: false,
      minAtrPct: 0.0001,
      chopThresholdPct: 0.0002,
    },
    swing: {
      ...defaultConfig.swing,
      externalLeftBars: 2,
      externalRightBars: 2,
    },
    risk: {
      ...defaultConfig.risk,
      accountSize: 25_000,
      minRiskReward: 1.8,
    },
  };
}

function runDemo(): void {
  const config = createDemoConfig();
  const { htfCandles, ltfCandles } = buildMockScenario(config.symbol);
  const strategy = new DorisViewStrategy(config);
  const analysis = strategy.analyze({
    htfCandles,
    ltfCandles,
    symbol: config.symbol,
  });

  logger.info("DorisView analysis completed.", {
    htfBias: analysis.htfStructure.bias,
    ltfBias: analysis.ltfStructure.bias,
    liquidityPools: analysis.liquidityPools.length,
    sweeps: analysis.sweeps.length,
    bosEvents: analysis.bosEvents.length,
    fvgs: analysis.fairValueGaps.length,
    setups: analysis.setups.length,
  });

  if (analysis.setups.length > 0) {
    logger.info("First setup preview", analysis.setups[0]);
  }

  const backtest = runBacktest({
    candles: ltfCandles,
    setups: analysis.setups,
    config,
  });

  logger.info("Backtest metrics", backtest.metrics);
  logger.info("Trade outcomes", backtest.trades.map((trade) => ({
    id: trade.setup.id,
    outcome: trade.outcome,
    pnl: Number(trade.pnl.toFixed(2)),
    pnlR: Number(trade.pnlR.toFixed(2)),
  })));
}

runDemo();

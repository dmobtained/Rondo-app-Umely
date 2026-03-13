import { runDemoPipeline } from "./demo/demoPipeline.js";
import { logger } from "./utils/logger.js";

function runDemo(): void {
  const { analysis, backtest } = runDemoPipeline();

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

  logger.info("Backtest metrics", backtest.metrics);
  logger.info("Trade outcomes", backtest.trades.map((trade) => ({
    id: trade.setup.id,
    outcome: trade.outcome,
    pnl: Number(trade.pnl.toFixed(2)),
    pnlR: Number(trade.pnlR.toFixed(2)),
  })));
}

runDemo();

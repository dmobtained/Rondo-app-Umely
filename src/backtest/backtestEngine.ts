import { calculatePositionSize } from "../core/riskManager.js";
import type { Candle } from "../models/candle.js";
import type { DorisViewConfig } from "../models/config.js";
import type { TradeSetup } from "../models/setup.js";
import type { SimulatedTrade } from "../models/trade.js";
import { toUtcDateKey } from "../utils/time.js";
import { calculateBacktestMetrics, type BacktestMetrics } from "./metrics.js";

export interface BacktestResult {
  readonly trades: readonly SimulatedTrade[];
  readonly metrics: BacktestMetrics;
}

function hitEntryZone(candle: Candle, setup: TradeSetup): boolean {
  return candle.low <= setup.entryZone.upper && candle.high >= setup.entryZone.lower;
}

function buildInvalidatedTrade(setup: TradeSetup): SimulatedTrade {
  return {
    setup,
    direction: setup.direction,
    quantity: 0,
    riskAmount: 0,
    outcome: "invalidated",
    pnl: 0,
    pnlR: 0,
  };
}

export function runBacktest(args: {
  candles: readonly Candle[];
  setups: readonly TradeSetup[];
  config: DorisViewConfig;
}): BacktestResult {
  const { candles, setups, config } = args;
  const sortedSetups = [...setups].sort((a, b) => a.signalIndex - b.signalIndex);
  const trades: SimulatedTrade[] = [];
  const dayState = new Map<string, { trades: number; dailyLoss: number }>();
  let consecutiveLosses = 0;

  for (const setup of sortedSetups) {
    const signalCandle = candles[setup.signalIndex];
    if (!signalCandle) {
      trades.push(buildInvalidatedTrade(setup));
      continue;
    }
    const dayKey = toUtcDateKey(signalCandle.timestamp);
    const day = dayState.get(dayKey) ?? { trades: 0, dailyLoss: 0 };
    if (day.trades >= config.risk.maxTradesPerDay) {
      trades.push(buildInvalidatedTrade(setup));
      continue;
    }
    if (Math.abs(day.dailyLoss) >= config.risk.accountSize * config.risk.maxDailyDrawdownPct) {
      trades.push(buildInvalidatedTrade(setup));
      continue;
    }
    if (consecutiveLosses >= config.risk.maxConsecutiveLosses) {
      trades.push(buildInvalidatedTrade(setup));
      continue;
    }

    let triggerIndex = -1;
    for (let i = setup.signalIndex + 1; i <= setup.expiresAtIndex && i < candles.length; i += 1) {
      const candle = candles[i];
      if (!candle) {
        continue;
      }

      // Invalidation rule before entry: if the protective stop is breached first, setup is invalid.
      if (setup.direction === "long" && candle.low <= setup.stopLoss) {
        break;
      }
      if (setup.direction === "short" && candle.high >= setup.stopLoss) {
        break;
      }

      if (!hitEntryZone(candle, setup)) {
        continue;
      }
      triggerIndex = i;
      break;
    }

    if (triggerIndex < 0) {
      trades.push(buildInvalidatedTrade(setup));
      continue;
    }

    const sizing = calculatePositionSize(setup.entryPrice, setup.stopLoss, config);
    if (sizing.quantity <= 0) {
      trades.push(buildInvalidatedTrade(setup));
      continue;
    }

    let closeIndex = -1;
    let closePrice = 0;
    let closeReason: "stop_loss" | "take_profit" | "time_invalidation" = "time_invalidation";
    for (let i = triggerIndex; i < candles.length; i += 1) {
      const candle = candles[i];
      if (!candle) {
        continue;
      }

      if (setup.direction === "long") {
        const hitStop = candle.low <= setup.stopLoss;
        const hitTarget = candle.high >= setup.takeProfit;
        if (hitStop || hitTarget) {
          closeIndex = i;
          if (hitStop && hitTarget) {
            // Conservative backtest assumption: adverse fill first on same candle.
            closePrice = setup.stopLoss;
            closeReason = "stop_loss";
          } else if (hitStop) {
            closePrice = setup.stopLoss;
            closeReason = "stop_loss";
          } else {
            closePrice = setup.takeProfit;
            closeReason = "take_profit";
          }
          break;
        }
      } else {
        const hitStop = candle.high >= setup.stopLoss;
        const hitTarget = candle.low <= setup.takeProfit;
        if (hitStop || hitTarget) {
          closeIndex = i;
          if (hitStop && hitTarget) {
            closePrice = setup.stopLoss;
            closeReason = "stop_loss";
          } else if (hitStop) {
            closePrice = setup.stopLoss;
            closeReason = "stop_loss";
          } else {
            closePrice = setup.takeProfit;
            closeReason = "take_profit";
          }
          break;
        }
      }
    }

    if (closeIndex < 0) {
      trades.push(buildInvalidatedTrade(setup));
      continue;
    }

    const directionMultiplier = setup.direction === "long" ? 1 : -1;
    const pnl =
      (closePrice - setup.entryPrice) *
      directionMultiplier *
      sizing.quantity *
      config.risk.instrumentPointValue;
    const pnlR = sizing.riskAmount === 0 ? 0 : pnl / sizing.riskAmount;
    const outcome = closeReason === "take_profit" ? "win" : "loss";
    day.trades += 1;
    if (pnl < 0) {
      day.dailyLoss += pnl;
      consecutiveLosses += 1;
    } else {
      consecutiveLosses = 0;
    }
    dayState.set(dayKey, day);

    trades.push({
      setup,
      direction: setup.direction,
      quantity: sizing.quantity,
      riskAmount: sizing.riskAmount,
      trigger: {
        index: triggerIndex,
        timestamp: candles[triggerIndex]?.timestamp ?? 0,
        price: setup.entryPrice,
      },
      close: {
        index: closeIndex,
        timestamp: candles[closeIndex]?.timestamp ?? 0,
        price: closePrice,
        reason: closeReason,
      },
      outcome,
      pnl,
      pnlR,
    });
  }

  return {
    trades,
    metrics: calculateBacktestMetrics(trades),
  };
}

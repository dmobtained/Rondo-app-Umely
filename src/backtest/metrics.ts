import type { SimulatedTrade } from "../models/trade.js";
import { average } from "../utils/math.js";

export interface BacktestMetrics {
  readonly trades: number;
  readonly wins: number;
  readonly losses: number;
  readonly invalidated: number;
  readonly winRate: number;
  readonly averageR: number;
  readonly totalR: number;
  readonly profitFactor: number;
}

export function calculateBacktestMetrics(trades: readonly SimulatedTrade[]): BacktestMetrics {
  const wins = trades.filter((trade) => trade.outcome === "win");
  const losses = trades.filter((trade) => trade.outcome === "loss");
  const invalidated = trades.filter((trade) => trade.outcome === "invalidated");
  const totalR = trades.reduce((sum, trade) => sum + trade.pnlR, 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.pnl, 0));

  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    invalidated: invalidated.length,
    winRate: trades.length === 0 ? 0 : wins.length / trades.length,
    averageR: average(trades.map((trade) => trade.pnlR)),
    totalR,
    profitFactor: grossLoss === 0 ? (grossProfit > 0 ? Number.POSITIVE_INFINITY : 0) : grossProfit / grossLoss,
  };
}

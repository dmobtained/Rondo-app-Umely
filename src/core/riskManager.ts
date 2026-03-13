import type { DorisViewConfig } from "../models/config.js";
import type { PositionSizingResult } from "../models/trade.js";
import { absoluteDistance } from "../utils/price.js";

export function calculatePositionSize(
  entryPrice: number,
  stopLoss: number,
  config: DorisViewConfig,
  accountSizeOverride?: number,
): PositionSizingResult {
  const accountSize = accountSizeOverride ?? config.risk.accountSize;
  const riskAmount = accountSize * config.risk.riskPerTradePct;
  const stopDistance = absoluteDistance(entryPrice, stopLoss);
  const valuePerPoint = config.risk.instrumentPointValue;

  if (stopDistance <= 0 || valuePerPoint <= 0) {
    return {
      quantity: 0,
      riskAmount,
      stopDistance,
    };
  }

  const quantity = riskAmount / (stopDistance * valuePerPoint);
  return {
    quantity,
    riskAmount,
    stopDistance,
  };
}

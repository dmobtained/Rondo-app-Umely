import { calculatePositionSize } from "./riskManager.js";
import type { Candle, Timeframe } from "../models/candle.js";
import type { DorisViewConfig } from "../models/config.js";
import type { TradeSetup } from "../models/setup.js";
import type { TradeVerdict } from "../models/verdict.js";
import type { StrategyAnalysisResult } from "../strategies/dorisViewStrategy.js";
import { relativeDistancePct } from "../utils/price.js";

const MT5_INSTRUCTION = "Voer deze waarden in bij MT5 en plaats de order.";

function timeframeToMs(timeframe: Timeframe): number {
  if (timeframe === "1m") {
    return 60_000;
  }
  if (timeframe === "5m") {
    return 5 * 60_000;
  }
  if (timeframe === "15m") {
    return 15 * 60_000;
  }
  if (timeframe === "1h") {
    return 60 * 60_000;
  }
  if (timeframe === "4h") {
    return 4 * 60 * 60_000;
  }
  return 24 * 60 * 60_000;
}

function hasStructureConflict(analysis: StrategyAnalysisResult): boolean {
  const htf = analysis.htfStructure.bias;
  const ltf = analysis.ltfStructure.bias;
  if (htf === "neutral" || ltf === "neutral") {
    return false;
  }
  return htf !== ltf;
}

function pickBestSetup(setups: readonly TradeSetup[]): TradeSetup | undefined {
  return [...setups].sort((left, right) => {
    if (right.confidenceScore !== left.confidenceScore) {
      return right.confidenceScore - left.confidenceScore;
    }
    if (right.riskReward !== left.riskReward) {
      return right.riskReward - left.riskReward;
    }
    return right.signalIndex - left.signalIndex;
  })[0];
}

function baseVerdict(symbol: string, currentPrice: number, reasons: readonly string[]): TradeVerdict {
  return {
    action: "GEEN TRADE",
    tone: "no_trade",
    instrument: symbol,
    currentPrice,
    reasons,
    mt5Instruction: MT5_INSTRUCTION,
  };
}

export function buildTradeVerdict(args: {
  symbol: string;
  config: DorisViewConfig;
  ltfCandles: readonly Candle[];
  analysis: StrategyAnalysisResult;
}): TradeVerdict {
  const { symbol, config, ltfCandles, analysis } = args;
  const latestCandle = ltfCandles.at(-1);
  if (!latestCandle) {
    return baseVerdict(symbol, 0, ["No candle data available."]);
  }

  const currentPrice = latestCandle.close;
  const timeframeMs = timeframeToMs(config.timeframe.ltf);
  const candleCloseTimestamp = latestCandle.timestamp + timeframeMs;
  const candleCloseCountdownSec = Math.max(0, Math.floor((candleCloseTimestamp - Date.now()) / 1000));
  const currentIndex = ltfCandles.length - 1;

  if (hasStructureConflict(analysis)) {
    return {
      ...baseVerdict(symbol, currentPrice, [
        "HTF and LTF structure conflict. Trade not allowed.",
      ]),
      candleCloseTimestamp,
      candleCloseCountdownSec,
    };
  }

  const setup = pickBestSetup(analysis.setups);
  if (!setup) {
    return {
      ...baseVerdict(symbol, currentPrice, ["No valid setup detected in current analysis."]),
      candleCloseTimestamp,
      candleCloseCountdownSec,
    };
  }

  const setupExpiresInCandles = setup.expiresAtIndex - currentIndex;
  const entryDistancePct = relativeDistancePct(currentPrice, setup.entryPrice);
  const stopDistancePct = relativeDistancePct(currentPrice, setup.stopLoss);
  const sizing = calculatePositionSize(setup.entryPrice, setup.stopLoss, config);

  const reasons: string[] = [];
  const confidenceOk = setup.confidenceScore >= config.verdict.minimumConfidence;
  const rrOk = setup.riskReward >= config.verdict.minimumRiskReward;
  const entryNearOk = entryDistancePct <= config.verdict.maxEntryDistancePct;
  const stopOk = stopDistancePct <= config.verdict.maxStopDistancePct;
  const expiryOk = setupExpiresInCandles >= 0;

  if (!confidenceOk) {
    reasons.push(`Confidence below threshold (${setup.confidenceScore.toFixed(1)} < ${config.verdict.minimumConfidence}).`);
  }
  if (!rrOk) {
    reasons.push(`Risk/Reward below threshold (${setup.riskReward.toFixed(2)} < ${config.verdict.minimumRiskReward.toFixed(2)}).`);
  }
  if (!stopOk) {
    reasons.push(
      `Stop distance too wide (${(stopDistancePct * 100).toFixed(2)}% > ${(config.verdict.maxStopDistancePct * 100).toFixed(2)}%).`,
    );
  }
  if (!expiryOk) {
    reasons.push("Setup expired (validity window passed).");
  }

  const shared = {
    instrument: setup.symbol || symbol,
    entryPrice: setup.entryPrice,
    stopLoss: setup.stopLoss,
    takeProfit: setup.takeProfit,
    riskReward: setup.riskReward,
    confidence: setup.confidenceScore,
    lotSize: sizing.quantity,
    currentPrice,
    entryDistancePct,
    stopDistancePct,
    candleCloseTimestamp,
    candleCloseCountdownSec,
    setupExpiresInCandles: Math.max(0, setupExpiresInCandles),
    setupId: setup.id,
    mt5Instruction: MT5_INSTRUCTION,
  } as const;

  if (!confidenceOk || !rrOk || !stopOk || !expiryOk) {
    return {
      action: "GEEN TRADE",
      tone: "no_trade",
      reasons,
      ...shared,
    };
  }

  if (!entryNearOk) {
    return {
      action: "WACHTEN",
      tone: "wait",
      reasons: [
        `Entry is ${(entryDistancePct * 100).toFixed(2)}% away from current price.`,
        ...setup.reasons,
      ],
      ...shared,
    };
  }

  const buyAction = setup.direction === "long";
  return {
    action: buyAction ? "NU BUY LIMIT PLAATSEN" : "NU SELL LIMIT PLAATSEN",
    tone: buyAction ? "buy" : "sell",
    reasons: [
      "All verdict validation rules passed.",
      ...setup.reasons,
    ],
    ...shared,
  };
}

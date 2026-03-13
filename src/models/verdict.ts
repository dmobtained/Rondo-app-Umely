export type TradeAction =
  | "NU BUY LIMIT PLAATSEN"
  | "NU SELL LIMIT PLAATSEN"
  | "WACHTEN"
  | "GEEN TRADE";

export type VerdictTone = "buy" | "sell" | "wait" | "no_trade";

export interface TradeVerdict {
  readonly action: TradeAction;
  readonly tone: VerdictTone;
  readonly instrument: string;
  readonly entryPrice?: number;
  readonly stopLoss?: number;
  readonly takeProfit?: number;
  readonly riskReward?: number;
  readonly confidence?: number;
  readonly lotSize?: number;
  readonly currentPrice: number;
  readonly entryDistancePct?: number;
  readonly stopDistancePct?: number;
  readonly candleCloseTimestamp?: number;
  readonly candleCloseCountdownSec?: number;
  readonly setupExpiresInCandles?: number;
  readonly setupId?: string;
  readonly reasons: readonly string[];
  readonly mt5Instruction: string;
}

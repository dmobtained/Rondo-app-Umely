export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export interface Candle {
  readonly symbol: string;
  readonly timestamp: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume?: number;
  readonly spread?: number;
}

export interface CandleWindow {
  readonly startIndex: number;
  readonly endIndex: number;
}

export function isBullishCandle(candle: Candle): boolean {
  return candle.close > candle.open;
}

export function isBearishCandle(candle: Candle): boolean {
  return candle.close < candle.open;
}

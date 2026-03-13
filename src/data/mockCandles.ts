import type { Candle } from "../models/candle.js";

function createCandle(
  symbol: string,
  timestamp: number,
  open: number,
  high: number,
  low: number,
  close: number,
): Candle {
  return {
    symbol,
    timestamp,
    open,
    high,
    low,
    close,
    volume: 100,
    spread: 0.3,
  };
}

export function buildMockScenario(symbol = "XAUUSD"): {
  htfCandles: Candle[];
  ltfCandles: Candle[];
} {
  const base = Date.UTC(2026, 1, 2, 7, 0, 0);
  const ltf: Candle[] = [];
  const raw = [
    [100.0, 100.4, 99.8, 100.2],
    [100.2, 100.5, 100.0, 100.3],
    [100.3, 100.6, 100.1, 100.5],
    [100.5, 100.7, 100.3, 100.6],
    [100.6, 100.8, 100.4, 100.7],
    [100.7, 100.85, 100.5, 100.6],
    [100.6, 100.9, 100.4, 100.8],
    [100.8, 100.92, 100.6, 100.7],
    [100.7, 100.95, 100.5, 100.9],
    [100.9, 100.96, 100.7, 100.82], // equal highs cluster
    [100.82, 100.9, 100.5, 100.55],
    [100.55, 100.7, 100.3, 100.4],
    [100.4, 100.5, 100.1, 100.25],
    [100.25, 100.4, 100.0, 100.1],
    [100.1, 101.2, 99.95, 100.35], // liquidity sweep above equal highs, reclaim close
    [100.35, 100.45, 99.9, 99.95], // bearish continuation
    [99.95, 100.1, 99.6, 99.7], // break of internal low (BOS)
    [99.7, 99.9, 98.9, 99.1],
    [99.1, 99.2, 98.7, 98.9],
    [98.9, 99.0, 98.5, 98.7], // candle1 for bearish FVG
    [98.7, 98.8, 98.2, 98.3],
    [98.3, 98.4, 97.9, 98.0], // candle3 high < candle1 low => bearish FVG
    [98.0, 98.35, 97.8, 98.1], // partial fill into FVG (entry trigger)
    [98.1, 98.2, 97.4, 97.6],
    [97.6, 97.8, 96.9, 97.2], // near target liquidity
    [97.2, 97.4, 96.8, 97.1],
    [97.1, 97.3, 96.7, 96.9],
    [96.9, 97.0, 96.5, 96.6],
    [96.6, 96.9, 96.4, 96.7],
    [96.7, 96.8, 96.3, 96.5],
  ] as const;

  raw.forEach((bar, index) => {
    ltf.push(createCandle(symbol, base + index * 5 * 60_000, bar[0], bar[1], bar[2], bar[3]));
  });

  const htf: Candle[] = [
    createCandle(symbol, base - 9 * 60 * 60_000, 104.0, 104.2, 103.5, 103.8),
    createCandle(symbol, base - 8 * 60 * 60_000, 103.8, 103.9, 103.1, 103.3),
    createCandle(symbol, base - 7 * 60 * 60_000, 103.3, 103.4, 102.6, 102.8),
    createCandle(symbol, base - 6 * 60 * 60_000, 102.8, 103.0, 102.2, 102.4),
    createCandle(symbol, base - 5 * 60 * 60_000, 102.4, 102.5, 101.8, 102.0),
    createCandle(symbol, base - 4 * 60 * 60_000, 102.0, 102.1, 101.4, 101.6),
    createCandle(symbol, base - 3 * 60 * 60_000, 101.6, 101.8, 101.0, 101.2),
    createCandle(symbol, base - 2 * 60 * 60_000, 101.2, 101.5, 100.7, 100.9),
    createCandle(symbol, base - 1 * 60 * 60_000, 100.9, 101.0, 100.2, 100.5),
    createCandle(symbol, base, 100.5, 100.8, 99.9, 100.1),
  ];

  return {
    htfCandles: htf,
    ltfCandles: ltf,
  };
}

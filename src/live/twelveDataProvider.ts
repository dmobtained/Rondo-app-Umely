import type { Candle, Timeframe } from "../models/candle.js";

interface TwelveDataValue {
  readonly datetime: string;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
  readonly volume?: string;
}

interface TwelveDataResponse {
  readonly status?: "ok" | "error";
  readonly values?: readonly TwelveDataValue[];
  readonly message?: string;
}

export interface LiveCandleRequest {
  readonly apiKey: string;
  readonly symbol: string;
  readonly timeframe: Timeframe;
  readonly outputSize: number;
}

function toTwelveInterval(timeframe: Timeframe): string {
  if (timeframe === "1m") {
    return "1min";
  }
  if (timeframe === "5m") {
    return "5min";
  }
  if (timeframe === "15m") {
    return "15min";
  }
  if (timeframe === "1h") {
    return "1h";
  }
  if (timeframe === "4h") {
    return "4h";
  }
  return "1day";
}

function normalizeSymbol(raw: string): string {
  const compact = raw.replace(/\s+/g, "");
  if (compact.includes("/")) {
    return compact.toUpperCase();
  }
  if (compact.length === 6) {
    return `${compact.slice(0, 3).toUpperCase()}/${compact.slice(3).toUpperCase()}`;
  }
  return compact.toUpperCase();
}

function parseTimestamp(datetime: string): number {
  // TwelveData generally returns UTC-like datetime strings.
  const normalized = datetime.includes("T") ? datetime : `${datetime.replace(" ", "T")}Z`;
  return Date.parse(normalized);
}

export async function fetchTwelveDataCandles(request: LiveCandleRequest): Promise<Candle[]> {
  const symbol = normalizeSymbol(request.symbol);
  const query = new URLSearchParams({
    symbol,
    interval: toTwelveInterval(request.timeframe),
    outputsize: String(request.outputSize),
    order: "ASC",
    apikey: request.apiKey,
  });

  const endpoint = `https://api.twelvedata.com/time_series?${query.toString()}`;
  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`TwelveData request failed with HTTP ${response.status}.`);
  }

  const json = (await response.json()) as TwelveDataResponse;
  if (json.status === "error") {
    throw new Error(json.message ?? "TwelveData returned an error response.");
  }
  if (!json.values || json.values.length === 0) {
    throw new Error("TwelveData returned no candles.");
  }

  return json.values
    .map((value) => {
      const parsedVolume = value.volume ? Number(value.volume) : undefined;
      return {
        symbol: symbol.replace("/", ""),
        timestamp: parseTimestamp(value.datetime),
        open: Number(value.open),
        high: Number(value.high),
        low: Number(value.low),
        close: Number(value.close),
        ...(parsedVolume !== undefined ? { volume: parsedVolume } : {}),
      };
    })
    .filter(
      (candle) =>
        Number.isFinite(candle.timestamp) &&
        Number.isFinite(candle.open) &&
        Number.isFinite(candle.high) &&
        Number.isFinite(candle.low) &&
        Number.isFinite(candle.close),
    )
    .sort((a, b) => a.timestamp - b.timestamp);
}

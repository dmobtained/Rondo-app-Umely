import { runBacktest } from "../backtest/backtestEngine.js";
import { createDemoConfig } from "../demo/demoPipeline.js";
import type { Candle, Timeframe } from "../models/candle.js";
import { DorisViewStrategy } from "../strategies/dorisViewStrategy.js";

export interface Mt5CsvAnalyzeParams {
  readonly csvText: string;
  readonly sourceTimeframe: Timeframe;
  readonly symbol?: string;
}

export interface Mt5CsvPipelineResult {
  readonly mode: "mt5_csv";
  readonly source: "mt5_csv";
  readonly fetchedAt: string;
  readonly providerSymbol: string;
  readonly result: {
    readonly config: ReturnType<typeof createDemoConfig>;
    readonly htfCandles: readonly Candle[];
    readonly ltfCandles: readonly Candle[];
    readonly analysis: ReturnType<DorisViewStrategy["analyze"]>;
    readonly backtest: ReturnType<typeof runBacktest>;
  };
}

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

function normalizeSymbol(raw?: string): string {
  if (!raw || raw.trim().length === 0) {
    return "XAUUSD";
  }
  return raw.replace(/\s+/g, "").replace("/", "").toUpperCase();
}

function parseNumberToken(raw: string): number {
  return Number(raw.trim().replace(",", "."));
}

function splitLine(line: string): string[] {
  if (line.includes("\t")) {
    return line.split("\t").map((item) => item.trim().replace(/^"|"$/g, ""));
  }
  if (line.includes(";")) {
    return line.split(";").map((item) => item.trim().replace(/^"|"$/g, ""));
  }
  return line.split(",").map((item) => item.trim().replace(/^"|"$/g, ""));
}

function parseTimestamp(datePart: string, timePart: string): number {
  const cleanDate = datePart.trim().replace(/\//g, ".").replace(/-/g, ".");
  const datePieces = cleanDate.split(".");
  if (datePieces.length !== 3) {
    throw new Error(`Unsupported date format: ${datePart}`);
  }
  const year = Number(datePieces[0]);
  const month = Number(datePieces[1]);
  const day = Number(datePieces[2]);

  const cleanTime = timePart.trim();
  const timePieces = cleanTime.split(":");
  if (timePieces.length < 2) {
    throw new Error(`Unsupported time format: ${timePart}`);
  }
  const hour = Number(timePieces[0]);
  const minute = Number(timePieces[1]);
  const second = Number(timePieces[2] ?? 0);

  const timestamp = Date.UTC(year, month - 1, day, hour, minute, second);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Invalid timestamp from ${datePart} ${timePart}`);
  }
  return timestamp;
}

function hasHeader(tokens: readonly string[]): boolean {
  const first = (tokens[0] ?? "").toLowerCase();
  return first.includes("date") || first.includes("time") || first.includes("<date>");
}

export function parseMt5Csv(csvText: string, symbol: string): Candle[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error("CSV is empty.");
  }

  const candles: Candle[] = [];
  for (const rawLine of lines) {
    const cells = splitLine(rawLine);
    if (cells.length < 6) {
      continue;
    }
    if (hasHeader(cells)) {
      continue;
    }

    let dateToken = "";
    let timeToken = "";
    let priceStart = 0;
    if (cells[0]?.includes(" ") || cells[0]?.includes("T")) {
      const parts = (cells[0] ?? "").replace("T", " ").split(" ");
      dateToken = parts[0] ?? "";
      timeToken = parts[1] ?? "";
      priceStart = 1;
    } else {
      dateToken = cells[0] ?? "";
      timeToken = cells[1] ?? "";
      priceStart = 2;
    }

    const open = parseNumberToken(cells[priceStart] ?? "");
    const high = parseNumberToken(cells[priceStart + 1] ?? "");
    const low = parseNumberToken(cells[priceStart + 2] ?? "");
    const close = parseNumberToken(cells[priceStart + 3] ?? "");
    const tickVolume = parseNumberToken(cells[priceStart + 4] ?? "");
    const spread = parseNumberToken(cells[priceStart + 6] ?? "");

    const timestamp = parseTimestamp(dateToken, timeToken);
    if (![open, high, low, close].every((value) => Number.isFinite(value))) {
      continue;
    }

    candles.push({
      symbol,
      timestamp,
      open,
      high,
      low,
      close,
      ...(Number.isFinite(tickVolume) ? { volume: tickVolume } : {}),
      ...(Number.isFinite(spread) ? { spread } : {}),
    });
  }

  const sorted = candles.sort((a, b) => a.timestamp - b.timestamp);
  if (sorted.length === 0) {
    throw new Error("No valid candles parsed from CSV.");
  }
  return sorted;
}

export function resampleCandles(
  candles: readonly Candle[],
  sourceTimeframe: Timeframe,
  targetTimeframe: Timeframe,
): Candle[] {
  const sourceMs = timeframeToMs(sourceTimeframe);
  const targetMs = timeframeToMs(targetTimeframe);
  if (sourceMs > targetMs) {
    throw new Error(`Cannot resample from ${sourceTimeframe} to smaller ${targetTimeframe}.`);
  }
  if (sourceMs === targetMs) {
    return [...candles];
  }

  const aggregated: Candle[] = [];
  let bucketStart = -1;
  let open = 0;
  let high = -Infinity;
  let low = Infinity;
  let close = 0;
  let volume = 0;
  let spread = 0;
  let symbol = candles[0]?.symbol ?? "XAUUSD";

  for (const candle of candles) {
    const nextBucket = Math.floor(candle.timestamp / targetMs) * targetMs;
    if (bucketStart < 0 || nextBucket !== bucketStart) {
      if (bucketStart >= 0) {
        aggregated.push({
          symbol,
          timestamp: bucketStart,
          open,
          high,
          low,
          close,
          ...(Number.isFinite(volume) ? { volume } : {}),
          ...(Number.isFinite(spread) ? { spread } : {}),
        });
      }

      bucketStart = nextBucket;
      open = candle.open;
      high = candle.high;
      low = candle.low;
      close = candle.close;
      volume = candle.volume ?? 0;
      spread = candle.spread ?? 0;
      symbol = candle.symbol;
      continue;
    }

    high = Math.max(high, candle.high);
    low = Math.min(low, candle.low);
    close = candle.close;
    volume += candle.volume ?? 0;
    spread = candle.spread ?? spread;
  }

  if (bucketStart >= 0) {
    aggregated.push({
      symbol,
      timestamp: bucketStart,
      open,
      high,
      low,
      close,
      ...(Number.isFinite(volume) ? { volume } : {}),
      ...(Number.isFinite(spread) ? { spread } : {}),
    });
  }

  return aggregated;
}

export function runMt5CsvPipeline(params: Mt5CsvAnalyzeParams): Mt5CsvPipelineResult {
  const baseConfig = createDemoConfig();
  const providerSymbol = normalizeSymbol(params.symbol);
  const sourceMs = timeframeToMs(params.sourceTimeframe);
  const configuredLtfMs = timeframeToMs(baseConfig.timeframe.ltf);
  const configuredHtfMs = timeframeToMs(baseConfig.timeframe.htf);

  const effectiveLtf: Timeframe =
    sourceMs <= configuredLtfMs ? baseConfig.timeframe.ltf : params.sourceTimeframe;
  const effectiveHtf: Timeframe =
    sourceMs <= configuredHtfMs ? baseConfig.timeframe.htf : effectiveLtf;

  const config = {
    ...baseConfig,
    symbol: providerSymbol,
    timeframe: {
      htf: effectiveHtf,
      ltf: effectiveLtf,
    },
  };

  const baseCandles = parseMt5Csv(params.csvText, providerSymbol);
  const ltfCandles = resampleCandles(baseCandles, params.sourceTimeframe, effectiveLtf);
  const htfCandles = resampleCandles(baseCandles, params.sourceTimeframe, effectiveHtf);

  if (ltfCandles.length < 120 || htfCandles.length < 50) {
    const minRowsFromLtf = Math.ceil((120 * timeframeToMs(effectiveLtf)) / timeframeToMs(params.sourceTimeframe));
    const minRowsFromHtf = Math.ceil((50 * timeframeToMs(effectiveHtf)) / timeframeToMs(params.sourceTimeframe));
    const suggestedRows = Math.max(minRowsFromLtf, minRowsFromHtf);
    throw new Error(
      `Not enough candles after resampling (ltf=${ltfCandles.length}, htf=${htfCandles.length}). Export at least ~${suggestedRows} rows from MT5.`,
    );
  }

  const strategy = new DorisViewStrategy(config);
  const analysis = strategy.analyze({
    htfCandles,
    ltfCandles,
    symbol: providerSymbol,
  });

  const backtest = runBacktest({
    candles: ltfCandles,
    setups: analysis.setups,
    config,
  });

  return {
    mode: "mt5_csv",
    source: "mt5_csv",
    fetchedAt: new Date().toISOString(),
    providerSymbol,
    result: {
      config,
      htfCandles,
      ltfCandles,
      analysis,
      backtest,
    },
  };
}

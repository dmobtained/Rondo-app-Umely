import { runBacktest } from "../backtest/backtestEngine.js";
import { createDemoConfig } from "../demo/demoPipeline.js";
import type { Candle } from "../models/candle.js";
import type { DorisViewConfig } from "../models/config.js";
import { DorisViewStrategy } from "../strategies/dorisViewStrategy.js";
import { fetchTwelveDataCandles } from "./twelveDataProvider.js";

export interface LivePipelineParams {
  readonly apiKey: string;
  readonly symbol?: string;
}

export interface LivePipelineResult {
  readonly mode: "live";
  readonly source: "twelvedata";
  readonly fetchedAt: string;
  readonly providerSymbol: string;
  readonly result: {
    readonly config: DorisViewConfig;
    readonly htfCandles: readonly Candle[];
    readonly ltfCandles: readonly Candle[];
    readonly analysis: ReturnType<DorisViewStrategy["analyze"]>;
    readonly backtest: ReturnType<typeof runBacktest>;
  };
}

export async function runLivePipeline(params: LivePipelineParams): Promise<LivePipelineResult> {
  const config = createDemoConfig();
  const providerSymbol = params.symbol ?? "XAU/USD";

  const [htfCandles, ltfCandles] = await Promise.all([
    fetchTwelveDataCandles({
      apiKey: params.apiKey,
      symbol: providerSymbol,
      timeframe: config.timeframe.htf,
      outputSize: 250,
    }),
    fetchTwelveDataCandles({
      apiKey: params.apiKey,
      symbol: providerSymbol,
      timeframe: config.timeframe.ltf,
      outputSize: 500,
    }),
  ]);

  if (htfCandles.length < 50 || ltfCandles.length < 120) {
    throw new Error("Not enough live candles returned for reliable structure detection.");
  }

  const strategy = new DorisViewStrategy(config);
  const analysis = strategy.analyze({
    htfCandles,
    ltfCandles,
    symbol: config.symbol,
  });

  const backtest = runBacktest({
    candles: ltfCandles,
    setups: analysis.setups,
    config,
  });

  return {
    mode: "live",
    source: "twelvedata",
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

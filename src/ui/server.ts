import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import type { IncomingMessage } from "node:http";
import { runLivePipeline } from "../live/livePipeline.js";
import { runMt5CsvPipeline } from "../live/mt5CsvPipeline.js";
import { runDemoPipeline } from "../demo/demoPipeline.js";
import type { Candle, Timeframe } from "../models/candle.js";
import type { DorisViewConfig } from "../models/config.js";
import type { StrategyAnalysisResult } from "../strategies/dorisViewStrategy.js";
import type { BacktestResult } from "../backtest/backtestEngine.js";

const PORT = Number(process.env.PORT ?? 8787);
const LIVE_CACHE_MS = 20_000;
const STATIC_DIR = resolve(process.cwd(), "ui");
const LIGHTWEIGHT_CHARTS_FILE = resolve(
  process.cwd(),
  "node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.js",
);

interface UiSetupRow {
  readonly id: string;
  readonly symbol: string;
  readonly direction: "long" | "short";
  readonly orderType: "buy_limit" | "sell_limit";
  readonly entryPrice: number;
  readonly stopLoss: number;
  readonly takeProfit: number;
  readonly riskReward: number;
  readonly confidenceScore: number;
  readonly entryZone: { lower: number; upper: number };
  readonly sweepIndex: number;
  readonly bosIndex: number;
  readonly reasons: readonly string[];
}

interface PipelineShape {
  readonly config: DorisViewConfig;
  readonly ltfCandles: readonly Candle[];
  readonly analysis: StrategyAnalysisResult;
  readonly backtest: BacktestResult;
}

interface LiveCacheEntry {
  readonly key: string;
  readonly expiresAt: number;
  readonly payload: unknown;
}

let liveCache: LiveCacheEntry | undefined;

function contentType(path: string): string {
  const extension = extname(path).toLowerCase();
  if (extension === ".html") {
    return "text/html; charset=utf-8";
  }
  if (extension === ".css") {
    return "text/css; charset=utf-8";
  }
  if (extension === ".js") {
    return "application/javascript; charset=utf-8";
  }
  if (extension === ".json") {
    return "application/json; charset=utf-8";
  }
  return "text/plain; charset=utf-8";
}

function toUiSetups(setups: StrategyAnalysisResult["setups"]): UiSetupRow[] {
  return setups.map((setup) => ({
    id: setup.id,
    symbol: setup.symbol,
    direction: setup.direction,
    orderType: setup.direction === "long" ? "buy_limit" : "sell_limit",
    entryPrice: setup.entryPrice,
    stopLoss: setup.stopLoss,
    takeProfit: setup.takeProfit,
    riskReward: setup.riskReward,
    confidenceScore: setup.confidenceScore,
    entryZone: setup.entryZone,
    sweepIndex: setup.sweepIndex,
    bosIndex: setup.bosIndex,
    reasons: setup.reasons,
  }));
}

function buildApiPayload(args: {
  mode: "demo" | "live" | "mt5_csv";
  source: "mock" | "twelvedata" | "mt5_csv";
  fetchedAt: string;
  providerSymbol?: string;
  pipeline: PipelineShape;
}): unknown {
  const result = args.pipeline;
  return {
    mode: args.mode,
    source: args.source,
    generatedAt: args.fetchedAt,
    liveConnected: args.mode === "live",
    providerSymbol: args.providerSymbol,
    config: {
      symbol: result.config.symbol,
      riskPerTradePct: result.config.risk.riskPerTradePct,
      accountSize: result.config.risk.accountSize,
      minRiskReward: result.config.risk.minRiskReward,
      instrumentPointValue: result.config.risk.instrumentPointValue,
    },
    candles: result.ltfCandles,
    liquidityPools: result.analysis.liquidityPools,
    sweeps: result.analysis.sweeps,
    bosEvents: result.analysis.bosEvents,
    fvgs: result.analysis.fairValueGaps,
    setups: toUiSetups(result.analysis.setups),
    backtestMetrics: result.backtest.metrics,
    backtestTrades: result.backtest.trades,
  };
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  return new Promise<T>((resolvePromise, rejectPromise) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const maxBytes = 10 * 1024 * 1024;

    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        rejectPromise(new Error("Request payload too large (max 10MB)."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("error", (error) => rejectPromise(error));
    request.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        const parsed = JSON.parse(text) as T;
        resolvePromise(parsed);
      } catch (error) {
        rejectPromise(error);
      }
    });
  });
}

function jsonResponse(payload: unknown): { status: number; body: string; type: string } {
  const body = JSON.stringify(payload, (_, value) => {
    if (typeof value === "number" && !Number.isFinite(value)) {
      return value > 0 ? "Infinity" : "-Infinity";
    }
    return value;
  });
  return {
    status: 200,
    body,
    type: "application/json; charset=utf-8",
  };
}

async function serveFile(path: string): Promise<{ status: number; body: string; type: string }> {
  try {
    const body = await readFile(path, "utf8");
    return { status: 200, body, type: contentType(path) };
  } catch {
    return { status: 404, body: "Not found", type: "text/plain; charset=utf-8" };
  }
}

function resolveStaticPath(urlPath: string): string | undefined {
  const trimmed = urlPath.replace(/^\/+/, "");
  const requested = trimmed.length > 0 ? trimmed : "index.html";
  const filePath = resolve(STATIC_DIR, requested);
  if (!filePath.startsWith(STATIC_DIR)) {
    return undefined;
  }
  return filePath;
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://localhost:${PORT}`);
  const path = requestUrl.pathname;

  if (path === "/api/demo" || path === "/api/live") {
    try {
      if (path === "/api/demo") {
        const demo = runDemoPipeline();
        const payload = buildApiPayload({
          mode: "demo",
          source: "mock",
          fetchedAt: new Date().toISOString(),
          pipeline: demo,
        });
        const json = jsonResponse(payload);
        response.writeHead(json.status, { "Content-Type": json.type });
        response.end(json.body);
        return;
      }

      const apiKey = process.env.TWELVEDATA_API_KEY;
      if (!apiKey) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(
          JSON.stringify({
            error:
              "Live mode requires TWELVEDATA_API_KEY in environment. Keep demo mode on until key is configured.",
          }),
        );
        return;
      }

      const symbol = requestUrl.searchParams.get("symbol") ?? "XAU/USD";
      const forceRefresh = requestUrl.searchParams.get("force") === "1";
      const cacheKey = symbol.toUpperCase();
      if (!forceRefresh && liveCache && liveCache.key === cacheKey && Date.now() < liveCache.expiresAt) {
        const json = jsonResponse(liveCache.payload);
        response.writeHead(json.status, { "Content-Type": json.type });
        response.end(json.body);
        return;
      }

      const live = await runLivePipeline({
        apiKey,
        symbol,
      });
      const payload = buildApiPayload({
        mode: "live",
        source: "twelvedata",
        fetchedAt: live.fetchedAt,
        providerSymbol: live.providerSymbol,
        pipeline: live.result,
      });

      liveCache = {
        key: cacheKey,
        expiresAt: Date.now() + LIVE_CACHE_MS,
        payload,
      };

      const json = jsonResponse(payload);
      response.writeHead(json.status, { "Content-Type": json.type });
      response.end(json.body);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: message }));
      return;
    }
  }

  if (path === "/api/mt5/csv") {
    if (request.method !== "POST") {
      response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Use POST for /api/mt5/csv." }));
      return;
    }

    try {
      const body = await readJsonBody<{
        csvText?: string;
        sourceTimeframe?: Timeframe;
        symbol?: string;
      }>(request);
      const csvText = body.csvText ?? "";
      const sourceTimeframe = body.sourceTimeframe ?? "1m";
      if (!csvText || csvText.trim().length === 0) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "csvText is required." }));
        return;
      }

      const mt5 = runMt5CsvPipeline({
        csvText,
        sourceTimeframe,
        symbol: body.symbol,
      });
      const payload = buildApiPayload({
        mode: "mt5_csv",
        source: "mt5_csv",
        fetchedAt: mt5.fetchedAt,
        providerSymbol: mt5.providerSymbol,
        pipeline: mt5.result,
      });

      const json = jsonResponse(payload);
      response.writeHead(json.status, { "Content-Type": json.type });
      response.end(json.body);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: message }));
      return;
    }
  }

  if (path === "/vendor/lightweight-charts.js") {
    const file = await serveFile(LIGHTWEIGHT_CHARTS_FILE);
    response.writeHead(file.status, { "Content-Type": "application/javascript; charset=utf-8" });
    response.end(file.body);
    return;
  }

  const filePath = resolveStaticPath(path);
  if (!filePath) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }
  const file = await serveFile(filePath);
  response.writeHead(file.status, { "Content-Type": file.type });
  response.end(file.body);
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`UI server running at http://localhost:${PORT}`);
});


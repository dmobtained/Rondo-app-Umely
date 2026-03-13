import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { runDemoPipeline } from "../demo/demoPipeline.js";

const PORT = Number(process.env.PORT ?? 8787);
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

function toUiSetups(result: ReturnType<typeof runDemoPipeline>): UiSetupRow[] {
  return result.analysis.setups.map((setup) => ({
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

function buildApiPayload(): unknown {
  const result = runDemoPipeline();
  return {
    generatedAt: new Date().toISOString(),
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
    setups: toUiSetups(result),
    backtestMetrics: result.backtest.metrics,
    backtestTrades: result.backtest.trades,
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

  if (path === "/api/demo") {
    const payload = JSON.stringify(buildApiPayload(), (_, value) => {
      if (typeof value === "number" && !Number.isFinite(value)) {
        return value > 0 ? "Infinity" : "-Infinity";
      }
      return value;
    });
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(payload);
    return;
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


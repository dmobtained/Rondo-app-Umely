const chartContainer = document.getElementById("chart");
const setupSelect = document.getElementById("setup-select");
const modeSelect = document.getElementById("mode-select");
const symbolInput = document.getElementById("symbol-input");
const refreshLiveBtn = document.getElementById("refresh-live");
const mt5FileInput = document.getElementById("mt5-file-input");
const mt5Timeframe = document.getElementById("mt5-timeframe");
const analyzeMt5Btn = document.getElementById("analyze-mt5");
const liveStatus = document.getElementById("live-status");
const summary = document.getElementById("summary");
const verdictCard = document.getElementById("verdict-card");
const verdictAction = document.getElementById("verdict-action");
const verdictGrid = document.getElementById("verdict-grid");
const verdictInstruction = document.getElementById("verdict-instruction");
const verdictCountdown = document.getElementById("verdict-countdown");
const copyOrderBtn = document.getElementById("copy-order");
const setupMeta = document.getElementById("setup-meta");
const reasonsList = document.getElementById("reasons");
const metricsEl = document.getElementById("metrics");
const accountInput = document.getElementById("account-size");
const riskInput = document.getElementById("risk-pct");
const pointValueInput = document.getElementById("point-value");
const recalcBtn = document.getElementById("recalc");
const lotResult = document.getElementById("lot-result");

let appState = null;
let selectedSetup = null;
let chart = null;
let candleSeries = null;
let overlaySeries = [];
let markerPlugin = null;
let livePollingTimer = null;
let mt5CsvText = "";
let verdictTimer = null;
let activeVerdict = null;

function fmt(value, decimals = 3) {
  return Number(value).toFixed(decimals);
}

function fmtPct(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function setLiveStatusText(text, color = "#8b949e") {
  liveStatus.textContent = text;
  liveStatus.style.color = color;
}

function showError(message, details) {
  summary.textContent = details ? `${message} (${details})` : message;
  summary.style.color = "#ff7b72";
}

function clearOverlays() {
  if (!chart) {
    return;
  }
  for (const series of overlaySeries) {
    chart.removeSeries(series);
  }
  overlaySeries = [];
}

function addLineSeriesCompat(options) {
  if (typeof chart.addLineSeries === "function") {
    return chart.addLineSeries(options);
  }
  if (typeof chart.addSeries === "function" && typeof LightweightCharts.LineSeries !== "undefined") {
    return chart.addSeries(LightweightCharts.LineSeries, options);
  }
  throw new Error("Line series API not supported by loaded LightweightCharts version.");
}

function addCandlestickSeriesCompat(options) {
  if (typeof chart.addCandlestickSeries === "function") {
    return chart.addCandlestickSeries(options);
  }
  if (
    typeof chart.addSeries === "function" &&
    typeof LightweightCharts.CandlestickSeries !== "undefined"
  ) {
    return chart.addSeries(LightweightCharts.CandlestickSeries, options);
  }
  throw new Error("Candlestick series API not supported by loaded LightweightCharts version.");
}

function setSeriesMarkersCompat(markers) {
  if (!candleSeries) {
    return;
  }
  if (typeof candleSeries.setMarkers === "function") {
    candleSeries.setMarkers(markers);
    return;
  }
  if (!markerPlugin && typeof LightweightCharts.createSeriesMarkers === "function") {
    markerPlugin = LightweightCharts.createSeriesMarkers(candleSeries, markers);
    return;
  }
  if (markerPlugin && typeof markerPlugin.setMarkers === "function") {
    markerPlugin.setMarkers(markers);
    return;
  }
  showError("Marker API not available in chart library.");
}

function createLine(fromTime, toTime, price, color) {
  const line = addLineSeriesCompat({
    color,
    lineWidth: 1,
    crosshairMarkerVisible: false,
    priceLineVisible: false,
    lastValueVisible: false,
  });
  line.setData([
    { time: fromTime, value: price },
    { time: toTime, value: price },
  ]);
  overlaySeries.push(line);
}

function clearSetupPanels() {
  setupMeta.innerHTML = "";
  reasonsList.innerHTML = "";
  setSeriesMarkersCompat([]);
  clearOverlays();
}

function verdictClassFromTone(tone) {
  if (tone === "buy") {
    return "verdict-buy";
  }
  if (tone === "sell") {
    return "verdict-sell";
  }
  if (tone === "wait") {
    return "verdict-wait";
  }
  return "verdict-no_trade";
}

function copyTextForVerdict(verdict) {
  if (!verdict || verdict.entryPrice === undefined || verdict.stopLoss === undefined || verdict.takeProfit === undefined) {
    return "";
  }
  const lot = verdict.lotSize !== undefined ? verdict.lotSize.toFixed(2) : "-";
  return [
    `Instrument: ${verdict.instrument}`,
    `Action: ${verdict.action}`,
    `Entry: ${verdict.entryPrice}`,
    `Stop Loss: ${verdict.stopLoss}`,
    `Take Profit: ${verdict.takeProfit}`,
    `Lot Size: ${lot}`,
  ].join("\n");
}

function stopVerdictTimer() {
  if (verdictTimer) {
    clearInterval(verdictTimer);
    verdictTimer = null;
  }
}

function updateVerdictCountdown(verdict) {
  const parts = [];
  if (verdict.candleCloseTimestamp) {
    const secondsLeft = Math.max(0, Math.floor((verdict.candleCloseTimestamp - Date.now()) / 1000));
    parts.push(`Candle close in: ${secondsLeft}s`);
  }
  if (verdict.setupExpiresInCandles !== undefined) {
    parts.push(`Setup expires in: ${verdict.setupExpiresInCandles} candles`);
  }
  verdictCountdown.textContent = parts.join(" | ");
}

function renderVerdict(verdict) {
  activeVerdict = verdict ?? null;
  if (!activeVerdict) {
    return;
  }

  verdictAction.textContent = `ACTIE: ${activeVerdict.action}`;
  verdictCard.classList.remove("verdict-buy", "verdict-sell", "verdict-wait", "verdict-no_trade");
  verdictCard.classList.add(verdictClassFromTone(activeVerdict.tone));

  const fields = [
    ["Instrument", activeVerdict.instrument ?? "-"],
    ["Entry", activeVerdict.entryPrice !== undefined ? fmt(activeVerdict.entryPrice) : "-"],
    ["Stop Loss", activeVerdict.stopLoss !== undefined ? fmt(activeVerdict.stopLoss) : "-"],
    ["Take Profit", activeVerdict.takeProfit !== undefined ? fmt(activeVerdict.takeProfit) : "-"],
    ["Risk Reward", activeVerdict.riskReward !== undefined ? fmt(activeVerdict.riskReward, 2) : "-"],
    ["Confidence", activeVerdict.confidence !== undefined ? `${fmt(activeVerdict.confidence, 1)}%` : "-"],
    ["Lot Size", activeVerdict.lotSize !== undefined ? activeVerdict.lotSize.toFixed(2) : "-"],
    ["Huidige Prijs", fmt(activeVerdict.currentPrice)],
    [
      "Entry afstand",
      activeVerdict.entryDistancePct !== undefined ? fmtPct(activeVerdict.entryDistancePct) : "-",
    ],
    [
      "Stop afstand",
      activeVerdict.stopDistancePct !== undefined ? fmtPct(activeVerdict.stopDistancePct) : "-",
    ],
  ];

  verdictGrid.innerHTML = "";
  for (const [label, value] of fields) {
    const box = document.createElement("div");
    box.textContent = `${label}: ${value}`;
    verdictGrid.appendChild(box);
  }

  verdictInstruction.textContent = "Voer deze waarden in bij MT5 en plaats de order.";
  updateVerdictCountdown(activeVerdict);
  stopVerdictTimer();
  verdictTimer = setInterval(() => {
    if (activeVerdict) {
      updateVerdictCountdown(activeVerdict);
    }
  }, 1000);
}

function markerForIndex(index, shape, color, text) {
  const candle = appState.candles[index];
  if (!candle) {
    return null;
  }
  return {
    time: Math.floor(candle.timestamp / 1000),
    position: shape === "arrowDown" ? "aboveBar" : "belowBar",
    color,
    shape,
    text,
  };
}

function updateMeta(setup) {
  setupMeta.innerHTML = "";
  const rows = [
    ["Symbol", setup.symbol],
    ["Direction", setup.direction],
    ["Order Type", setup.orderType],
    ["Entry", fmt(setup.entryPrice)],
    ["Stop Loss", fmt(setup.stopLoss)],
    ["Take Profit", fmt(setup.takeProfit)],
    ["RR", fmt(setup.riskReward, 2)],
    ["Confidence", `${fmt(setup.confidenceScore, 1)} / 100`],
  ];

  for (const [key, value] of rows) {
    const box = document.createElement("div");
    box.textContent = `${key}: ${value}`;
    setupMeta.appendChild(box);
  }

  reasonsList.innerHTML = "";
  for (const reason of setup.reasons) {
    const item = document.createElement("li");
    item.textContent = reason;
    reasonsList.appendChild(item);
  }
}

function recalcLot() {
  if (!selectedSetup) {
    return;
  }
  const account = Number(accountInput.value);
  const riskPct = Number(riskInput.value) / 100;
  const pointValue = Number(pointValueInput.value);
  if (!Number.isFinite(account) || !Number.isFinite(riskPct) || !Number.isFinite(pointValue)) {
    showError("Please enter valid numeric values for account/risk/point value.");
    return;
  }
  if (account <= 0 || riskPct <= 0 || pointValue <= 0) {
    showError("Account, risk %, and point value must be greater than zero.");
    return;
  }
  const riskAmount = account * riskPct;
  const stopDistance = Math.abs(selectedSetup.entryPrice - selectedSetup.stopLoss);
  const lot = stopDistance > 0 ? riskAmount / (stopDistance * pointValue) : 0;
  lotResult.textContent = `Use approx ${lot.toFixed(2)} lot | Risk $${riskAmount.toFixed(2)} | Stop distance ${stopDistance.toFixed(3)}`;
  summary.style.color = "#8b949e";
}

function renderSetup(setupId) {
  selectedSetup = appState.setups.find((item) => item.id === setupId) ?? null;
  if (!selectedSetup) {
    clearSetupPanels();
    summary.textContent = "No valid setup selected.";
    summary.style.color = "#8b949e";
    return;
  }

  clearOverlays();
  updateMeta(selectedSetup);
  recalcLot();

  const firstTime = Math.floor(appState.candles[0].timestamp / 1000);
  const lastTime = Math.floor(appState.candles[appState.candles.length - 1].timestamp / 1000);
  createLine(firstTime, lastTime, selectedSetup.entryPrice, "#f2cc60");
  createLine(firstTime, lastTime, selectedSetup.stopLoss, "#f2495c");
  createLine(firstTime, lastTime, selectedSetup.takeProfit, "#56d364");
  createLine(firstTime, lastTime, selectedSetup.bosLevel, "#58a6ff");
  createLine(firstTime, lastTime, selectedSetup.entryZone.upper, "#d29922");
  createLine(firstTime, lastTime, selectedSetup.entryZone.lower, "#d29922");

  const markers = [];
  const sweepMarker = markerForIndex(selectedSetup.sweepIndex, "arrowDown", "#ff7b72", "Sweep");
  const bosMarker = markerForIndex(
    selectedSetup.bosIndex,
    selectedSetup.direction === "short" ? "arrowDown" : "arrowUp",
    "#58a6ff",
    "BOS",
  );
  if (sweepMarker) {
    markers.push(sweepMarker);
  }
  if (bosMarker) {
    markers.push(bosMarker);
  }
  setSeriesMarkersCompat(markers);

  summary.textContent = `${selectedSetup.orderType.toUpperCase()} | Entry ${fmt(selectedSetup.entryPrice)} | SL ${fmt(selectedSetup.stopLoss)} | TP ${fmt(selectedSetup.takeProfit)}`;
  summary.style.color = "#8b949e";
}

function updateModeControls() {
  const liveMode = modeSelect.value === "live";
  const mt5Mode = modeSelect.value === "mt5_csv";
  symbolInput.disabled = !(liveMode || mt5Mode);
  refreshLiveBtn.disabled = !liveMode;
  mt5FileInput.disabled = !mt5Mode;
  mt5Timeframe.disabled = !mt5Mode;
  analyzeMt5Btn.disabled = !mt5Mode;
}

function getApiPath(force = false, modeOverride) {
  const mode = modeOverride ?? modeSelect.value;
  if (mode === "live") {
    const symbol = encodeURIComponent(symbolInput.value.trim() || "XAU/USD");
    const forceFlag = force ? "&force=1" : "";
    return `/api/live?symbol=${symbol}${forceFlag}`;
  }
  return "/api/demo";
}

async function fetchPayload(force = false, modeOverride) {
  const mode = modeOverride ?? modeSelect.value;
  if (mode === "mt5_csv") {
    if (!mt5CsvText || mt5CsvText.trim().length === 0) {
      throw new Error("Upload eerst je MT5 CSV file en klik daarna op Analyse CSV.");
    }
    const response = await fetch("/api/mt5/csv", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        csvText: mt5CsvText,
        sourceTimeframe: mt5Timeframe.value,
        symbol: symbolInput.value.trim() || "XAUUSDm",
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = payload?.error ? String(payload.error) : `HTTP ${response.status}`;
      throw new Error(detail);
    }
    return payload;
  }

  const response = await fetch(getApiPath(force, mode));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error ? String(payload.error) : `HTTP ${response.status}`;
    throw new Error(detail);
  }
  return payload;
}

function ensureChart() {
  if (typeof LightweightCharts === "undefined") {
    throw new Error("Chart library failed to load.");
  }
  if (chart && candleSeries) {
    return;
  }

  chart = LightweightCharts.createChart(chartContainer, {
    width: chartContainer.clientWidth,
    height: 500,
    layout: {
      background: { color: "#161b22" },
      textColor: "#c9d1d9",
    },
    grid: {
      vertLines: { color: "#30363d" },
      horzLines: { color: "#30363d" },
    },
    crosshair: {
      mode: 0,
    },
    rightPriceScale: {
      borderColor: "#30363d",
    },
    timeScale: {
      borderColor: "#30363d",
      timeVisible: true,
      secondsVisible: false,
    },
  });

  candleSeries = addCandlestickSeriesCompat({
    upColor: "#26a69a",
    downColor: "#ef5350",
    borderVisible: false,
    wickUpColor: "#26a69a",
    wickDownColor: "#ef5350",
  });
}

function applyPayload(payload) {
  appState = payload;
  if (!appState || !Array.isArray(appState.candles)) {
    throw new Error("API payload missing candle data.");
  }

  ensureChart();
  candleSeries.setData(
    appState.candles.map((candle) => ({
      time: Math.floor(candle.timestamp / 1000),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    })),
  );

  accountInput.value = String(appState.config.accountSize);
  riskInput.value = String(appState.config.riskPerTradePct * 100);
  pointValueInput.value = String(appState.config.instrumentPointValue ?? 100);
  metricsEl.textContent = JSON.stringify(appState.backtestMetrics, null, 2);

  const previousSelected = setupSelect.value;
  setupSelect.innerHTML = "";
  for (const setup of appState.setups) {
    const option = document.createElement("option");
    option.value = setup.id;
    option.textContent = `${setup.id} (${setup.direction.toUpperCase()})`;
    setupSelect.appendChild(option);
  }

  if (appState.setups.length > 0) {
    const keepSelection = appState.setups.some((setup) => setup.id === previousSelected);
    const selectedId = keepSelection ? previousSelected : appState.setups[0].id;
    setupSelect.value = selectedId;
    renderSetup(selectedId);
  } else {
    clearSetupPanels();
    summary.textContent = "No setup detected in current dataset.";
    summary.style.color = "#8b949e";
  }

  renderVerdict(appState.verdict);

  const source = appState.source?.toUpperCase?.() ?? "UNKNOWN";
  const generatedAt = appState.generatedAt ? new Date(appState.generatedAt).toLocaleTimeString() : "n/a";
  if (appState.mode === "live") {
    setLiveStatusText(
      `LIVE ${source} | Updated ${generatedAt} | ${appState.providerSymbol ?? "XAU/USD"}`,
      "#56d364",
    );
  } else if (appState.mode === "mt5_csv") {
    setLiveStatusText(
      `MT5 CSV loaded | Updated ${generatedAt} | ${appState.providerSymbol ?? "XAUUSDm"}`,
      "#58a6ff",
    );
  } else {
    setLiveStatusText(`DEMO ${source} | Updated ${generatedAt}`, "#8b949e");
  }
}

function stopLivePolling() {
  if (livePollingTimer) {
    clearInterval(livePollingTimer);
    livePollingTimer = null;
  }
}

function startLivePolling() {
  stopLivePolling();
  if (modeSelect.value !== "live") {
    return;
  }
  livePollingTimer = setInterval(async () => {
    try {
      const payload = await fetchPayload(false);
      applyPayload(payload);
    } catch (error) {
      setLiveStatusText(`LIVE disconnected: ${String(error)}`, "#ff7b72");
    }
  }, 30_000);
}

async function loadData(force = false) {
  updateModeControls();
  try {
    const payload = await fetchPayload(force);
    applyPayload(payload);
    startLivePolling();
  } catch (error) {
    showError("API error", String(error));
    if (modeSelect.value === "live") {
      setLiveStatusText(`LIVE error: ${String(error)}`, "#ff7b72");
    }
  }
}

async function init() {
  setupSelect.addEventListener("change", () => renderSetup(setupSelect.value));
  recalcBtn.addEventListener("click", recalcLot);
  refreshLiveBtn.addEventListener("click", () => {
    if (modeSelect.value === "live") {
      loadData(true).catch((error) => showError("Refresh error", String(error)));
    }
  });
  analyzeMt5Btn.addEventListener("click", () => {
    if (modeSelect.value === "mt5_csv") {
      loadData(true).catch((error) => showError("CSV analyse error", String(error)));
    }
  });
  mt5FileInput.addEventListener("change", async () => {
    const file = mt5FileInput.files?.[0];
    if (!file) {
      mt5CsvText = "";
      return;
    }
    mt5CsvText = await file.text();
    setLiveStatusText(`CSV selected: ${file.name} (${Math.round(file.size / 1024)} KB)`, "#58a6ff");
  });
  copyOrderBtn.addEventListener("click", async () => {
    const text = copyTextForVerdict(activeVerdict);
    if (!text) {
      setLiveStatusText("Geen order data om te kopieren.", "#d29922");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setLiveStatusText("MT5 order copied to clipboard.", "#56d364");
    } catch (error) {
      setLiveStatusText(`Copy failed: ${String(error)}`, "#ff7b72");
    }
  });
  modeSelect.addEventListener("change", () => {
    stopLivePolling();
    if (modeSelect.value === "mt5_csv" && (!mt5CsvText || mt5CsvText.trim().length === 0)) {
      updateModeControls();
      clearSetupPanels();
      summary.textContent = "Upload je MT5 CSV en klik Analyse CSV.";
      summary.style.color = "#8b949e";
      setLiveStatusText("MT5 mode ready. Waiting for CSV file.", "#58a6ff");
      return;
    }
    loadData(true).catch((error) => showError("Mode change error", String(error)));
  });
  symbolInput.addEventListener("change", () => {
    if (modeSelect.value === "live") {
      loadData(true).catch((error) => showError("Symbol change error", String(error)));
    }
    if (modeSelect.value === "mt5_csv" && mt5CsvText.trim().length > 0) {
      loadData(true).catch((error) => showError("Symbol change error", String(error)));
    }
  });
  mt5Timeframe.addEventListener("change", () => {
    if (modeSelect.value === "mt5_csv" && mt5CsvText.trim().length > 0) {
      loadData(true).catch((error) => showError("Timeframe change error", String(error)));
    }
  });
  window.addEventListener("resize", () => {
    if (chart) {
      chart.applyOptions({ width: chartContainer.clientWidth });
    }
  });

  await loadData(true);
}

window.addEventListener("error", (event) => {
  showError("Runtime error", event.message);
});

init().catch((error) => {
  showError("Fatal UI init error", String(error));
});

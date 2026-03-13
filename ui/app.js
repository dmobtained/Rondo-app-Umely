const chartContainer = document.getElementById("chart");
const setupSelect = document.getElementById("setup-select");
const summary = document.getElementById("summary");
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

function fmt(value, decimals = 3) {
  return Number(value).toFixed(decimals);
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
}

function renderSetup(setupId) {
  selectedSetup = appState.setups.find((item) => item.id === setupId) ?? null;
  if (!selectedSetup) {
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

async function init() {
  try {
    const response = await fetch("/api/demo");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    appState = await response.json();
  } catch (error) {
    showError("API error", String(error));
    return;
  }

  if (typeof LightweightCharts === "undefined") {
    showError("Chart library failed to load. Refresh the page.");
    return;
  }

  try {
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
  } catch (error) {
    showError("Chart init error", String(error));
    return;
  }

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

  for (const setup of appState.setups) {
    const option = document.createElement("option");
    option.value = setup.id;
    option.textContent = `${setup.id} (${setup.direction.toUpperCase()})`;
    setupSelect.appendChild(option);
  }

  metricsEl.textContent = JSON.stringify(appState.backtestMetrics, null, 2);

  setupSelect.addEventListener("change", () => renderSetup(setupSelect.value));
  recalcBtn.addEventListener("click", recalcLot);
  window.addEventListener("resize", () => {
    if (chart) {
      chart.applyOptions({ width: chartContainer.clientWidth });
    }
  });

  if (appState.setups.length > 0) {
    setupSelect.value = appState.setups[0].id;
    renderSetup(appState.setups[0].id);
  } else {
    summary.textContent = "No setup detected in current demo dataset.";
  }
}

window.addEventListener("error", (event) => {
  showError("Runtime error", event.message);
});

init().catch((error) => {
  showError("Fatal UI init error", String(error));
});

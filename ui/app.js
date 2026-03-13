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

function fmt(value, decimals = 3) {
  return Number(value).toFixed(decimals);
}

function clearOverlays() {
  for (const series of overlaySeries) {
    chart.removeSeries(series);
  }
  overlaySeries = [];
}

function createLine(fromTime, toTime, price, color) {
  const line = chart.addLineSeries({
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
  candleSeries.setMarkers(markers);

  summary.textContent = `${selectedSetup.orderType.toUpperCase()} | Entry ${fmt(selectedSetup.entryPrice)} | SL ${fmt(selectedSetup.stopLoss)} | TP ${fmt(selectedSetup.takeProfit)}`;
}

async function init() {
  const response = await fetch("/api/demo");
  appState = await response.json();

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

  candleSeries = chart.addCandlestickSeries({
    upColor: "#26a69a",
    downColor: "#ef5350",
    borderVisible: false,
    wickUpColor: "#26a69a",
    wickDownColor: "#ef5350",
  });

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
    chart.applyOptions({ width: chartContainer.clientWidth });
  });

  if (appState.setups.length > 0) {
    setupSelect.value = appState.setups[0].id;
    renderSetup(appState.setups[0].id);
  } else {
    summary.textContent = "No setup detected in current demo dataset.";
  }
}

init();

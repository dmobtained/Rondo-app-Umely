# DorisView Liquidity Bot Engine (v1 Foundation)

Robuuste, modulaire TypeScript-fundering voor een Smart Money / Liquidity gebaseerde trading engine volgens de DorisView-principes.

## Doel

Deze codebase vertaalt een subjectieve liquidity-trading methode naar objectieve, configureerbare regels:

1. HTF context en structuur
2. Liquidity pools
3. Liquidity sweeps
4. BOS / CHoCH
5. FVG detectie
6. Setup generatie (entry, SL, TP, RR)
7. Backtestbare output met uitlegbare redenen

## Projectstructuur

```text
/src
  /core
    marketStructure.ts   # Swing detectie + HTF/LTF bias
    liquidity.ts         # Equal highs/lows, swings, PDH/PDL, range levels
    sweepDetector.ts     # Wick/reclaim gebaseerde sweep detectie
    bosDetector.ts       # Break of Structure / CHoCH na sweep
    fvgDetector.ts       # FVG detectie + fill/expiry informatie
    entryEngine.ts       # Setup generatie met RR + confidence score
    riskManager.ts       # Position sizing op basis van stop distance
    tradeValidator.ts    # Session/ATR/chop/alignment filters
  /models
    candle.ts
    swing.ts
    liquidityPool.ts
    setup.ts
    trade.ts
    config.ts
  /utils
    price.ts
    time.ts
    math.ts
    logger.ts
  /backtest
    backtestEngine.ts    # Candle-by-candle setup lifecycle simulatie
    metrics.ts           # Winrate, PF, average R, total R
  /strategies
    dorisViewStrategy.ts # Orchestrator van de volledige pipeline
  /data
    mockCandles.ts       # Voorbeeldscenario met sweep -> BOS -> FVG -> setup
  index.ts               # Voorbeeldflow detectie -> setup output -> backtest
```

## Kernmodules (kort)

- **marketStructure.ts**: detecteert interne/externe swing points en leidt bull/bear/neutral bias af.
- **liquidity.ts**: bouwt liquidity pools uit swings, equal highs/lows, previous day levels en range levels.
- **sweepDetector.ts**: valideert of liquidity aantoonbaar is genomen en reclaimed (wick of close reclaim).
- **bosDetector.ts**: zoekt pas na sweep een structure break op echte swing-niveaus (geen directe entry).
- **fvgDetector.ts**: detecteert 3-candle imbalances met grootte, fill-percentage en expiry.
- **entryEngine.ts**: combineert sweep + BOS + FVG + target liquidity + filters tot concrete trade setups.
- **backtestEngine.ts**: simuleert waiting_retest -> triggered -> closed/invalidated met risicolimieten.

## Configuratie

Alle belangrijke thresholds staan centraal in `src/models/config.ts`, o.a.:

- timeframe instellingen
- swing sensitivity
- equal high/low tolerantie
- sweep regels (overshoot/reclaim)
- BOS regels
- FVG minimum size / expiry
- session / ATR / chop filters
- risk per trade, min RR, max daily drawdown
- confidence score weights

## Voorbeeld draaien

```bash
npm install
npm run start
```

Dit draait:
1. DorisView strategy analyse op mock candles
2. Detectie-overzicht (pools, sweeps, BOS, FVG, setups)
3. Backtest metrics + trade outcomes

## Kleine chart UI (MT5 invoer zichtbaar)

Je kunt een simpele browser-UI starten om te zien wat de engine "tekent" op de chart:

```bash
npm run ui
```

Open daarna:

```text
http://localhost:8787
```

In de UI zie je:
- candlestick chart
- sweep marker
- BOS level
- entry zone (upper/lower)
- entry / stop loss / take profit lijnen
- MT5 invoervelden (order type, entry, SL, TP)
- lot size calculator (account + risk%)

## TODO (bewust buiten scope van v1 foundation)

- Broker execution adapters (MT5/cTrader/REST)
- Live order state reconciliation
- Nieuwsfilter integratie (event calendar)
- Persistente opslag (bijv. Supabase/Postgres)
- Multi-symbol portfolio orchestration

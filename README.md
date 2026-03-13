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
    trade_verdict_engine.ts # Zet analyse om naar 1 MT5 actie
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
  /live
    twelveDataProvider.ts # Live XAU/USD candles via TwelveData API
    livePipeline.ts       # Live analyse-pipeline (HTF+LTF -> setups)
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

Standaard rekent de demo met `instrumentPointValue = 100` voor XAUUSD
(ongeveer $100 PnL per $1 move op 1.00 lot; broker-specs altijd verifiëren).

### Live mode in UI

De UI heeft een **Demo/Live** selector.
Voor live candles via TwelveData:

```bash
export TWELVEDATA_API_KEY="jouw_api_key"
npm run ui
```

Daarna in de UI:
1. zet mode op `Live`
2. laat symbool op `XAU/USD` (of pas aan)
3. gebruik `Refresh now` of wacht op auto-refresh (30s)

Zonder API key blijft demo mode beschikbaar en krijg je een duidelijke foutmelding in live mode.

### MT5 CSV mode (broker-exacte candles)

Als je 1-op-1 wilt matchen met jouw MT5 chart (bijv. XAUUSDm), gebruik `MT5 CSV` mode:

1. Exporteer candles uit MT5 (History Center / Save as CSV)
2. Start UI:

```bash
npm run ui
```

3. Open `http://localhost:8787`
4. Kies mode `MT5 CSV`
5. Upload je CSV file
6. Kies de CSV timeframe (M1/M5/M15/H1)
7. Klik `Analyse CSV`

De engine resampled intern naar LTF/HTF voor structuurdetectie en tekent daarna setups op jouw brokerdata.

## Trade verdict engine (grote actie bovenaan)

`src/core/trade_verdict_engine.ts` vertaalt analyse-output naar 1 duidelijke actie:

- `NU BUY LIMIT PLAATSEN`
- `NU SELL LIMIT PLAATSEN`
- `WACHTEN`
- `GEEN TRADE`

Validatieregels (aanpasbaar in `src/models/config.ts` onder `verdict`):

- `minimumConfidence` (default 65)
- `minimumRiskReward` (default 2.0)
- `maxEntryDistancePct` (default 0.25%)
- `maxStopDistancePct` (default 0.6%)

UI extras:
- grote actiekaart met kleur (groen/rood/geel/grijs)
- COPY MT5 ORDER knop
- huidige prijs
- countdown tot candle close
- setup verval in aantal candles

## TODO (bewust buiten scope van v1 foundation)

- Broker execution adapters (MT5/cTrader/REST)
- Live order state reconciliation
- Nieuwsfilter integratie (event calendar)
- Persistente opslag (bijv. Supabase/Postgres)
- Multi-symbol portfolio orchestration

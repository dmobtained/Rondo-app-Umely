export type LiquiditySide = "buy_side" | "sell_side";
export type LiquidityPoolType =
  | "equal_highs"
  | "equal_lows"
  | "previous_day_high"
  | "previous_day_low"
  | "range_high"
  | "range_low"
  | "swing_high"
  | "swing_low";

export interface LiquidityPool {
  readonly id: string;
  readonly type: LiquidityPoolType;
  readonly side: LiquiditySide;
  readonly price: number;
  readonly createdAtIndex: number;
  readonly sourceSwingIndices: readonly number[];
  readonly significance: number;
  readonly touchedCount: number;
  readonly expiryIndex?: number;
}

export interface SweepEvent {
  readonly id: string;
  readonly poolId: string;
  readonly sideTaken: LiquiditySide;
  readonly expectedDirection: "bullish" | "bearish";
  readonly sweepIndex: number;
  readonly timestamp: number;
  readonly liquidityLevel: number;
  readonly sweepExtreme: number;
  readonly overshootPct: number;
  readonly reclaimIndex: number;
  readonly reclaimClose: number;
  readonly qualityScore: number;
  readonly reason: string;
}

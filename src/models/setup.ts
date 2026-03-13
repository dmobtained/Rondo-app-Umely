import type { LiquidityPoolType } from "./liquidityPool.js";
import type { StructureBias } from "./swing.js";

export type TradeDirection = "long" | "short";

export type SetupStatus =
  | "detected"
  | "waiting_retest"
  | "triggered"
  | "invalidated"
  | "closed";

export interface PriceZone {
  readonly lower: number;
  readonly upper: number;
}

export interface TradeSetup {
  readonly id: string;
  readonly symbol: string;
  readonly direction: TradeDirection;
  readonly htfBias: StructureBias;
  readonly liquidityTargetUsed: LiquidityPoolType;
  readonly sweepTimestamp: number;
  readonly sweepIndex: number;
  readonly bosLevel: number;
  readonly bosIndex: number;
  readonly entryZone: PriceZone;
  readonly entryPrice: number;
  readonly stopLoss: number;
  readonly takeProfit: number;
  readonly riskReward: number;
  readonly confidenceScore: number;
  readonly reasons: readonly string[];
  readonly invalidationReason?: string;
  readonly status: SetupStatus;
  readonly signalIndex: number;
  readonly expiresAtIndex: number;
}

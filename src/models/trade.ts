import type { TradeDirection, TradeSetup } from "./setup.js";

export type TradeOutcome = "win" | "loss" | "invalidated" | "open";

export interface TriggerEvent {
  readonly index: number;
  readonly timestamp: number;
  readonly price: number;
}

export interface ClosedEvent {
  readonly index: number;
  readonly timestamp: number;
  readonly price: number;
  readonly reason: "stop_loss" | "take_profit" | "time_invalidation";
}

export interface SimulatedTrade {
  readonly setup: TradeSetup;
  readonly direction: TradeDirection;
  readonly quantity: number;
  readonly riskAmount: number;
  readonly trigger?: TriggerEvent;
  readonly close?: ClosedEvent;
  readonly outcome: TradeOutcome;
  readonly pnl: number;
  readonly pnlR: number;
}

export interface PositionSizingResult {
  readonly quantity: number;
  readonly riskAmount: number;
  readonly stopDistance: number;
}

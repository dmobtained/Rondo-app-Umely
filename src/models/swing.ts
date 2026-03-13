export type SwingType = "high" | "low";
export type StructureBias = "bullish" | "bearish" | "neutral";
export type StructureLayer = "internal" | "external";

export interface SwingPoint {
  readonly index: number;
  readonly timestamp: number;
  readonly price: number;
  readonly type: SwingType;
  readonly strength: number;
  readonly layer: StructureLayer;
}

export interface MarketStructureState {
  readonly bias: StructureBias;
  readonly externalSwings: readonly SwingPoint[];
  readonly internalSwings: readonly SwingPoint[];
  readonly lastHigherHigh?: SwingPoint;
  readonly lastHigherLow?: SwingPoint;
  readonly lastLowerHigh?: SwingPoint;
  readonly lastLowerLow?: SwingPoint;
  readonly notes: readonly string[];
}

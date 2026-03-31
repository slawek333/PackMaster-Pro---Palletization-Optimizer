export interface Dimensions {
  length: number;
  width: number;
  height: number;
}

export interface Part extends Dimensions {
  id: string;
  name: string;
  weight: number; // in kg
  orderQuantity: number;
  maxPartsPerBox?: number;
}

export interface Container extends Dimensions {
  id: string;
  name: string;
  maxWeight: number; // in kg
  emptyWeight: number; // in kg
}

export interface Pallet extends Dimensions {
  id: string;
  name: string;
  maxWeight: number; // in kg
  maxHeight: number; // in cm (including pallet)
  emptyWeight: number; // in kg
}

export interface PackingResult {
  partsPerBox: number;
  boxesPerPallet: number;
  totalPartsPerPallet: number;
  boxWeight: number;
  palletWeight: number;
  boxVolumeUtilization: number;
  palletVolumeUtilization: number;
  orientations: {
    box: string;
    pallet: string;
  };
  // Grid dimensions for visualization
  boxGrid: { nx: number; ny: number; nz: number };
  palletGrid: { nx: number; ny: number; nz: number };
  // Shipment details
  totalBoxesNeeded: number;
  totalPalletsNeeded: number;
  boxesPerPalletBalanced: number;
  isLastPalletDifferent: boolean;
  lastPalletBoxes: number;
  balancedPalletWeight: number;
  lastPalletWeight: number;
  partsInLastBox: number;
  isLastBoxDifferent: boolean;
  loadDimensions: Dimensions;
  stabilityScore?: number;
  isStable?: boolean;
  warnings?: string[];
}

export interface Simulation {
  id: string;
  part: Part;
  box: Container;
  quantity: number;
  result: PackingResult;
}

export interface PackedBox extends Dimensions {
  id: string; // box id
  simulationId: string;
  partName: string;
  x: number;
  y: number;
  z: number;
  color: string;
  edgeColor: string;
  name: string;
  isStable?: boolean;
  supportArea?: number; // percentage of bottom area supported
}

export interface PalletLoad {
  boxes: PackedBox[];
  weight: number;
  volumeUtilization: number;
  loadDimensions: Dimensions;
  stabilityScore?: number; // 0 to 1
  isStable?: boolean;
  warnings?: string[];
}

export interface SessionResult {
  pallets: PalletLoad[];
  simulations: Simulation[];
  totalBoxes: number;
  totalWeight: number;
  overallUtilization: number;
}

export type ShippingMethod = 'pallet' | 'courier';
export type CalculationMode = 'full' | 'boxes-only';

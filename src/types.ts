export interface Dimensions {
  length: number;
  width: number;
  height: number;
}

export interface Part extends Dimensions {
  id: string;
  name: string;
  weight: number; // in kg
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
}

export interface PackingResult {
  partsPerCarton: number;
  cartonsPerPallet: number;
  totalPartsPerPallet: number;
  cartonWeight: number;
  palletWeight: number;
  cartonVolumeUtilization: number;
  palletVolumeUtilization: number;
  orientations: {
    carton: string;
    pallet: string;
  };
  // Grid dimensions for visualization
  cartonGrid: { nx: number; ny: number; nz: number };
  palletGrid: { nx: number; ny: number; nz: number };
  // Shipment details
  totalCartonsNeeded: number;
  totalPalletsNeeded: number;
  cartonsPerPalletBalanced: number;
  isLastPalletDifferent: boolean;
  lastPalletCartons: number;
  balancedPalletWeight: number;
  lastPalletWeight: number;
  partsInLastCarton: number;
  isLastCartonDifferent: boolean;
}

export interface Simulation {
  id: string;
  part: Part;
  carton: Container;
  quantity: number;
  result: PackingResult;
}

export interface PackedCarton extends Dimensions {
  id: string; // carton id
  simulationId: string;
  partName: string;
  x: number;
  y: number;
  z: number;
  color: string;
  edgeColor: string;
  name: string;
}

export interface PalletLoad {
  cartons: PackedCarton[];
  weight: number;
  volumeUtilization: number;
  loadDimensions: Dimensions;
}

export interface SessionResult {
  pallets: PalletLoad[];
  simulations: Simulation[];
  totalCartons: number;
  totalWeight: number;
  overallUtilization: number;
}

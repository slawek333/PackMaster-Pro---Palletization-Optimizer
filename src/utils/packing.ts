import { Dimensions, PackingResult, Part, Container, Pallet, Simulation, SessionResult, PackedCarton, PalletLoad } from '../types';

/**
 * Packs multiple simulations into pallets, allowing mixed cartons.
 */
export function packSessionSimulations(simulations: Simulation[], pallet: Pallet): SessionResult {
  if (simulations.length === 0) {
    return { pallets: [], simulations: [], totalCartons: 0, totalWeight: 0, overallUtilization: 0 };
  }

  // 1. Collect all cartons to pack
  let allCartons: { simulationId: string; partName: string; carton: Container; weight: number; color: string; edgeColor: string; name: string }[] = [];
  
  simulations.forEach((sim, simIdx) => {
    const colors = ['#fef3c7', '#dcfce7', '#dbeafe', '#f3e8ff', '#fee2e2'];
    const edgeColors = ['#d97706', '#16a34a', '#2563eb', '#9333ea', '#dc2626'];
    
    const color = colors[simIdx % colors.length];
    const edgeColor = edgeColors[simIdx % edgeColors.length];
    
    for (let i = 0; i < sim.result.totalCartonsNeeded; i++) {
      allCartons.push({
        simulationId: sim.id,
        partName: sim.part.name,
        carton: sim.carton,
        weight: sim.result.cartonWeight,
        color,
        edgeColor,
        name: sim.carton.name
      });
    }
  });

  // Sort by volume descending for better packing
  allCartons.sort((a, b) => (b.carton.length * b.carton.width * b.carton.height) - (a.carton.length * a.carton.width * a.carton.height));

  // 2. Pack into pallets (Greedy Shelf Packing)
  const pallets: PalletLoad[] = [];
  const palletUsableHeight = pallet.maxHeight - pallet.height;
  const palletLength = pallet.length + 20;
  const palletWidth = pallet.width + 20;
  
  let remainingCartons = [...allCartons];
  
  while (remainingCartons.length > 0) {
    const currentPalletCartons: PackedCarton[] = [];
    let currentWeight = 25; // Pallet empty weight
    
    let currentX = 0;
    let currentY = 0;
    let currentZ = 0;
    let maxRowWidth = 0;
    let maxShelfHeight = 0;
    
    let maxLoadX = 0;
    let maxLoadY = 0;
    let maxLoadZ = 0;

    const packedIndices = new Set<number>();
    
    for (let i = 0; i < remainingCartons.length; i++) {
      if (packedIndices.has(i)) continue;
      
      const c = remainingCartons[i];
      const { carton } = c;
      
      // Check weight
      if (currentWeight + c.weight > pallet.maxWeight) continue;
      
      // Try orientations (original and rotated)
      const orientations = [
        { l: carton.length, w: carton.width, h: carton.height },
        { l: carton.width, w: carton.length, h: carton.height }
      ];

      let placed = false;
      for (const orient of orientations) {
        if (currentZ + orient.h <= palletUsableHeight) {
          if (currentY + orient.w <= palletWidth) {
            if (currentX + orient.l <= palletLength) {
              // Fits in current row!
              currentPalletCartons.push({
                ...carton,
                length: orient.l,
                width: orient.w,
                height: orient.h,
                simulationId: c.simulationId,
                partName: c.partName,
                x: currentX,
                y: currentY,
                z: currentZ,
                color: c.color,
                edgeColor: c.edgeColor,
                name: c.name
              });
              currentWeight += c.weight;
              packedIndices.add(i);
              
              maxLoadX = Math.max(maxLoadX, currentX + orient.l);
              maxLoadY = Math.max(maxLoadY, currentY + orient.w);
              maxLoadZ = Math.max(maxLoadZ, currentZ + orient.h);

              currentX += orient.l;
              maxRowWidth = Math.max(maxRowWidth, orient.w);
              maxShelfHeight = Math.max(maxShelfHeight, orient.h);
              placed = true;
              break;
            }
          }
        }
      }

      if (!placed) {
        // Try new row
        if (currentY + maxRowWidth + Math.min(carton.length, carton.width) <= palletWidth) {
          currentX = 0;
          currentY += maxRowWidth;
          maxRowWidth = 0;
          i--; // Retry this carton in the new row
        } else if (currentZ + maxShelfHeight + carton.height <= palletUsableHeight) {
          // Try new shelf
          currentX = 0;
          currentY = 0;
          currentZ += maxShelfHeight;
          maxShelfHeight = 0;
          maxRowWidth = 0;
          i--; // Retry this carton in the new shelf
        }
      }
    }
    
    if (currentPalletCartons.length === 0) {
      break;
    }
    
    pallets.push({
      cartons: currentPalletCartons,
      weight: currentWeight,
      volumeUtilization: 0,
      loadDimensions: {
        length: maxLoadX,
        width: maxLoadY,
        height: maxLoadZ + pallet.height // Total height including pallet
      }
    });
    
    remainingCartons = remainingCartons.filter((_, idx) => !packedIndices.has(idx));
  }
  
  // Calculate utilization
  const palletVolume = pallet.length * pallet.width * palletUsableHeight;
  pallets.forEach(p => {
    const usedVolume = p.cartons.reduce((sum, c) => sum + (c.length * c.width * c.height), 0);
    p.volumeUtilization = usedVolume / palletVolume;
  });

  return {
    pallets,
    simulations,
    totalCartons: allCartons.length,
    totalWeight: pallets.reduce((sum, p) => sum + p.weight, 0),
    overallUtilization: pallets.length > 0 ? pallets.reduce((sum, p) => sum + p.volumeUtilization, 0) / pallets.length : 0
  };
}

/**
 * Calculates how many items of dimensions 'item' can fit into a box of dimensions 'box'.
 * Tries orientations to find the maximum.
 * @param verticalOnly If true, only allows swapping length and width (keeps height constant).
 */
export function calculateMaxFit(item: Dimensions, box: Dimensions, verticalOnly: boolean = false): { count: number; orientation: string; nx: number; ny: number; nz: number } {
  const orientations = verticalOnly 
    ? [
        [item.length, item.width, item.height],
        [item.width, item.length, item.height],
      ]
    : [
        [item.length, item.width, item.height],
        [item.length, item.height, item.width],
        [item.width, item.length, item.height],
        [item.width, item.height, item.length],
        [item.height, item.length, item.width],
        [item.height, item.width, item.length],
      ];

  let maxCount = 0;
  let bestOrientation = '';
  let bestGrid = { nx: 0, ny: 0, nz: 0 };

  orientations.forEach((o) => {
    const nx = Math.floor(box.length / o[0]);
    const ny = Math.floor(box.width / o[1]);
    const nz = Math.floor(box.height / o[2]);
    const count = nx * ny * nz;

    if (count > maxCount) {
      maxCount = count;
      bestOrientation = `${o[0]}x${o[1]}x${o[2]}`;
      bestGrid = { nx, ny, nz };
    }
  });

  return { count: maxCount, orientation: bestOrientation, ...bestGrid };
}

export function optimizePacking(part: Part, carton: Container, pallet: Pallet, totalOrderQuantity: number = 0): PackingResult {
  // 1. Pack parts into carton (Any orientation allowed for parts)
  const cartonFit = calculateMaxFit(part, carton, false);
  
  // Weight check for carton
  let partsPerCarton = cartonFit.count;
  let cartonGrid = { nx: cartonFit.nx, ny: cartonFit.ny, nz: cartonFit.nz };
  const totalPartWeight = partsPerCarton * part.weight;
  if (totalPartWeight + carton.emptyWeight > carton.maxWeight) {
    partsPerCarton = Math.floor((carton.maxWeight - carton.emptyWeight) / part.weight);
  }

  // 2. Pack cartons onto pallet
  const palletUsableHeight = pallet.maxHeight - pallet.height;
  // Allow 10mm overhang on each side (total 20mm extra per dimension)
  const usablePallet: Dimensions = {
    length: pallet.length + 20,
    width: pallet.width + 20,
    height: palletUsableHeight
  };

  // For pallets, we usually only rotate around vertical axis (length/width swap)
  const palletFit = calculateMaxFit(carton, usablePallet, true);
  
  // Weight check for pallet
  let cartonsPerPallet = palletFit.count;
  let palletGrid = { nx: palletFit.nx, ny: palletFit.ny, nz: palletFit.nz };
  const cartonTotalWeight = (partsPerCarton * part.weight) + carton.emptyWeight;
  if (cartonsPerPallet * cartonTotalWeight > pallet.maxWeight) {
    cartonsPerPallet = Math.floor(pallet.maxWeight / cartonTotalWeight);
  }

  const totalPartsPerPallet = partsPerCarton * cartonsPerPallet;
  
  // Utilization
  const partVolume = part.length * part.width * part.height;
  const cartonVolume = carton.length * carton.width * carton.height;
  const palletVolume = pallet.length * pallet.width * palletUsableHeight;

  const cartonVolumeUtilization = partsPerCarton > 0 ? (partsPerCarton * partVolume) / cartonVolume : 0;
  const palletVolumeUtilization = cartonsPerPallet > 0 ? (cartonsPerPallet * cartonVolume) / palletVolume : 0;

  // 3. Shipment calculations
  const totalCartonsNeeded = partsPerCarton > 0 ? Math.ceil(totalOrderQuantity / partsPerCarton) : 0;
  const totalPalletsNeeded = cartonsPerPallet > 0 ? Math.ceil(totalCartonsNeeded / cartonsPerPallet) : 0;
  
  const partsInLastCarton = totalOrderQuantity > 0 && partsPerCarton > 0 ? (totalOrderQuantity % partsPerCarton || partsPerCarton) : 0;
  const isLastCartonDifferent = totalOrderQuantity > 0 && partsPerCarton > 0 && totalOrderQuantity % partsPerCarton !== 0;

  // Balanced distribution
  let cartonsPerPalletBalanced = 0;
  let lastPalletCartons = 0;
  let isLastPalletDifferent = false;
  let balancedPalletWeight = 0;
  let lastPalletWeight = 0;

  if (totalPalletsNeeded > 0) {
    cartonsPerPalletBalanced = Math.ceil(totalCartonsNeeded / totalPalletsNeeded);
    const totalWithBalanced = cartonsPerPalletBalanced * totalPalletsNeeded;
    
    if (totalWithBalanced > totalCartonsNeeded) {
      isLastPalletDifferent = true;
      lastPalletCartons = totalCartonsNeeded - (cartonsPerPalletBalanced * (totalPalletsNeeded - 1));
    } else {
      lastPalletCartons = cartonsPerPalletBalanced;
    }

    const palletEmptyWeight = 25; 
    balancedPalletWeight = (cartonsPerPalletBalanced * cartonTotalWeight) + palletEmptyWeight;
    lastPalletWeight = (lastPalletCartons * cartonTotalWeight) + palletEmptyWeight;
  }

  return {
    partsPerCarton,
    cartonsPerPallet,
    totalPartsPerPallet,
    cartonWeight: cartonTotalWeight,
    palletWeight: (cartonsPerPallet * cartonTotalWeight) + 25,
    cartonVolumeUtilization,
    palletVolumeUtilization,
    orientations: {
      carton: cartonFit.orientation,
      pallet: palletFit.orientation
    },
    cartonGrid,
    palletGrid,
    totalCartonsNeeded,
    totalPalletsNeeded,
    cartonsPerPalletBalanced,
    isLastPalletDifferent,
    lastPalletCartons,
    balancedPalletWeight,
    lastPalletWeight,
    partsInLastCarton,
    isLastCartonDifferent
  };
}

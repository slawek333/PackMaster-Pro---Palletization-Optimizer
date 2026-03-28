import { Dimensions, PackingResult, Part, Container, Pallet, Simulation, SessionResult, PackedBox, PalletLoad } from '../types';

/**
 * Packs multiple simulations into pallets, allowing mixed boxes.
 */
export function packSessionSimulations(simulations: Simulation[], pallet: Pallet): SessionResult {
  if (simulations.length === 0) {
    return { pallets: [], simulations: [], totalBoxes: 0, totalWeight: 0, overallUtilization: 0 };
  }

  // 1. Collect all boxes to pack
  let allBoxes: { simulationId: string; partName: string; box: Container; weight: number; color: string; edgeColor: string; name: string }[] = [];
  
  simulations.forEach((sim, simIdx) => {
    const colors = ['#fef3c7', '#dcfce7', '#dbeafe', '#f3e8ff', '#fee2e2'];
    const edgeColors = ['#d97706', '#16a34a', '#2563eb', '#9333ea', '#dc2626'];
    
    const color = colors[simIdx % colors.length];
    const edgeColor = edgeColors[simIdx % edgeColors.length];
    
    for (let i = 0; i < sim.result.totalBoxesNeeded; i++) {
      allBoxes.push({
        simulationId: sim.id,
        partName: sim.part.name,
        box: sim.box,
        weight: sim.result.boxWeight,
        color,
        edgeColor,
        name: sim.box.name
      });
    }
  });

  // Sort by volume descending for better packing
  allBoxes.sort((a, b) => (b.box.length * b.box.width * b.box.height) - (a.box.length * a.box.width * a.box.height));

  // 2. Pack into pallets (Greedy Shelf Packing)
  const pallets: PalletLoad[] = [];
  const palletUsableHeight = pallet.maxHeight - pallet.height;
  const palletLength = pallet.length + 20;
  const palletWidth = pallet.width + 20;
  
  let remainingBoxes = [...allBoxes];
  
  while (remainingBoxes.length > 0) {
    const currentPalletBoxes: PackedBox[] = [];
    let currentWeight = pallet.emptyWeight || 25; // Pallet empty weight
    
    let currentX = 0;
    let currentY = 0;
    let currentZ = 0;
    let maxRowWidth = 0;
    let maxShelfHeight = 0;
    
    let maxLoadX = 0;
    let maxLoadY = 0;
    let maxLoadZ = 0;

    const packedIndices = new Set<number>();
    
    for (let i = 0; i < remainingBoxes.length; i++) {
      if (packedIndices.has(i)) continue;
      
      const c = remainingBoxes[i];
      const { box } = c;
      
      // Check weight
      if (currentWeight + c.weight > pallet.maxWeight) continue;
      
      // Try orientations (original and rotated)
      const orientations = [
        { l: box.length, w: box.width, h: box.height },
        { l: box.width, w: box.length, h: box.height }
      ];

      let placed = false;
      for (const orient of orientations) {
        if (currentZ + orient.h <= palletUsableHeight) {
          if (currentY + orient.w <= palletWidth) {
            if (currentX + orient.l <= palletLength) {
              // Fits in current row!
              currentPalletBoxes.push({
                ...box,
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
        if (currentY + maxRowWidth + Math.min(box.length, box.width) <= palletWidth) {
          currentX = 0;
          currentY += maxRowWidth;
          maxRowWidth = 0;
          i--; // Retry this box in the new row
        } else if (currentZ + maxShelfHeight + box.height <= palletUsableHeight) {
          // Try new shelf
          currentX = 0;
          currentY = 0;
          currentZ += maxShelfHeight;
          maxShelfHeight = 0;
          maxRowWidth = 0;
          i--; // Retry this box in the new shelf
        }
      }
    }
    
    if (currentPalletBoxes.length === 0) {
      break;
    }
    
    // Center the load on the pallet
    const offsetX = (pallet.length - maxLoadX) / 2;
    const offsetY = (pallet.width - maxLoadY) / 2;
    
    currentPalletBoxes.forEach(box => {
      box.x += offsetX;
      box.y += offsetY;
    });

    pallets.push({
      boxes: currentPalletBoxes,
      weight: currentWeight,
      volumeUtilization: 0,
      loadDimensions: {
        length: Math.max(maxLoadX, pallet.length),
        width: Math.max(maxLoadY, pallet.width),
        height: maxLoadZ + pallet.height // Total height including pallet
      }
    });
    
    remainingBoxes = remainingBoxes.filter((_, idx) => !packedIndices.has(idx));
  }
  
  // Calculate utilization
  const palletVolume = pallet.length * pallet.width * palletUsableHeight;
  pallets.forEach(p => {
    const usedVolume = p.boxes.reduce((sum, c) => sum + (c.length * c.width * c.height), 0);
    p.volumeUtilization = usedVolume / palletVolume;
  });

  return {
    pallets,
    simulations,
    totalBoxes: allBoxes.length,
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

export function suggestBestBox(part: Part, pallet: Pallet): Container {
  const standardDimensions = [
    { l: 600, w: 400, h: 400 },
    { l: 600, w: 400, h: 300 },
    { l: 600, w: 400, h: 200 },
    { l: 400, w: 300, h: 400 },
    { l: 400, w: 300, h: 300 },
    { l: 400, w: 300, h: 200 },
    { l: 400, w: 300, h: 150 },
    { l: 300, w: 200, h: 200 },
    { l: 300, w: 200, h: 150 },
    { l: 800, w: 600, h: 400 },
    { l: 800, w: 600, h: 600 },
  ];

  let bestBox: Container | null = null;
  let maxPartsPerPallet = 0;
  let bestUtilization = 0;

  // 1. Try standard dimensions
  for (const dims of standardDimensions) {
    const testBox: Container = {
      id: 'test',
      name: 'Test',
      length: dims.l,
      width: dims.w,
      height: dims.h,
      maxWeight: 25,
      emptyWeight: 0.5 + (dims.l * dims.w * dims.h) / 100000000,
    };

    const result = optimizePacking(part, testBox, pallet, part.orderQuantity);
    
    // We want to maximize parts per pallet, and then box volume utilization
    if (result.totalPartsPerPallet > maxPartsPerPallet || 
       (result.totalPartsPerPallet === maxPartsPerPallet && result.boxVolumeUtilization > bestUtilization)) {
      maxPartsPerPallet = result.totalPartsPerPallet;
      bestUtilization = result.boxVolumeUtilization;
      bestBox = testBox;
    }
  }

  // 2. If best standard box has < 85% utilization, or no box fits, generate a custom one
  if (!bestBox || bestUtilization < 0.85) {
    let bestCustomBox: Container | null = null;
    let bestCustomPartsPerPallet = 0;
    let bestCustomUtilization = 0;

    const orientations = [
      [part.length, part.width, part.height],
      [part.length, part.height, part.width],
      [part.width, part.length, part.height],
      [part.width, part.height, part.length],
      [part.height, part.length, part.width],
      [part.height, part.width, part.length],
    ];

    const maxPartsByWeight = Math.floor((25 - 0.5) / part.weight);
    const palletUsableHeight = pallet.maxHeight - pallet.height;

    if (maxPartsByWeight > 0) {
      for (const [l, w, h] of orientations) {
        // Try different grid sizes
        for (let nx = 1; nx <= Math.floor((pallet.length + 20) / l); nx++) {
          for (let ny = 1; ny <= Math.floor((pallet.width + 20) / w); ny++) {
            for (let nz = 1; nz <= Math.floor(palletUsableHeight / h); nz++) {
              const count = nx * ny * nz;
              if (count > maxPartsByWeight || count === 0) continue;

              // Add 5mm tolerance to each dimension
              const testBox: Container = {
                id: 'custom',
                name: 'Custom',
                length: nx * l + 5,
                width: ny * w + 5,
                height: nz * h + 5,
                maxWeight: 25,
                emptyWeight: 0.5,
              };

              // Check if this custom box fits on the pallet
              const result = optimizePacking(part, testBox, pallet, part.orderQuantity);
              
              if (result.boxVolumeUtilization >= 0.85) {
                if (result.totalPartsPerPallet > bestCustomPartsPerPallet ||
                   (result.totalPartsPerPallet === bestCustomPartsPerPallet && result.boxVolumeUtilization > bestCustomUtilization)) {
                  bestCustomPartsPerPallet = result.totalPartsPerPallet;
                  bestCustomUtilization = result.boxVolumeUtilization;
                  bestCustomBox = testBox;
                }
              }
            }
          }
        }
      }
    }

    if (bestCustomBox && (bestCustomPartsPerPallet > maxPartsPerPallet || bestCustomUtilization >= 0.85)) {
      bestBox = bestCustomBox;
    }
  }

  if (!bestBox) {
    // Ultimate fallback
    bestBox = {
      id: 'best-choice-' + Math.random().toString(36).substr(2, 5),
      name: 'Best Choice',
      length: part.length + 10,
      width: part.width + 10,
      height: part.height + 10,
      maxWeight: Math.max(25, part.weight + 5),
      emptyWeight: 0.5,
    };
  } else {
    bestBox.id = 'best-choice-' + Math.random().toString(36).substr(2, 5);
    bestBox.name = 'Best Choice';
  }

  return bestBox;
}

export function optimizePacking(part: Part, box: Container, pallet: Pallet, totalOrderQuantity: number = 0): PackingResult {
  // 1. Pack parts into box (Any orientation allowed for parts)
  const boxFit = calculateMaxFit(part, box, false);
  
  // Weight check for box
  let partsPerBox = boxFit.count;
  let boxGrid = { nx: boxFit.nx, ny: boxFit.ny, nz: boxFit.nz };
  const totalPartWeight = partsPerBox * part.weight;
  if (totalPartWeight + box.emptyWeight > box.maxWeight) {
    partsPerBox = Math.floor((box.maxWeight - box.emptyWeight) / part.weight);
  }

  // 2. Pack boxes onto pallet
  const palletUsableHeight = pallet.maxHeight - pallet.height;
  // Allow 10mm overhang on each side (total 20mm extra per dimension)
  const usablePallet: Dimensions = {
    length: pallet.length + 20,
    width: pallet.width + 20,
    height: palletUsableHeight
  };

  // For pallets, we usually only rotate around vertical axis (length/width swap)
  const palletFit = calculateMaxFit(box, usablePallet, true);
  
  // Weight check for pallet
  let boxesPerPallet = palletFit.count;
  let palletGrid = { nx: palletFit.nx, ny: palletFit.ny, nz: palletFit.nz };
  const boxTotalWeight = (partsPerBox * part.weight) + box.emptyWeight;
  if (boxesPerPallet * boxTotalWeight > pallet.maxWeight) {
    boxesPerPallet = Math.floor(pallet.maxWeight / boxTotalWeight);
  }

  const totalPartsPerPallet = partsPerBox * boxesPerPallet;
  
  // Utilization
  const partVolume = part.length * part.width * part.height;
  const boxVolume = box.length * box.width * box.height;
  const palletVolume = pallet.length * pallet.width * palletUsableHeight;

  const boxVolumeUtilization = partsPerBox > 0 ? (partsPerBox * partVolume) / boxVolume : 0;
  const palletVolumeUtilization = boxesPerPallet > 0 ? (boxesPerPallet * boxVolume) / palletVolume : 0;

  // 3. Shipment calculations
  const totalBoxesNeeded = partsPerBox > 0 ? Math.ceil(totalOrderQuantity / partsPerBox) : 0;
  const totalPalletsNeeded = boxesPerPallet > 0 ? Math.ceil(totalBoxesNeeded / boxesPerPallet) : 0;
  
  const partsInLastBox = totalOrderQuantity > 0 && partsPerBox > 0 ? (totalOrderQuantity % partsPerBox || partsPerBox) : 0;
  const isLastBoxDifferent = totalOrderQuantity > 0 && partsPerBox > 0 && totalOrderQuantity % partsPerBox !== 0;

  // Maximized distribution
  let boxesPerPalletBalanced = 0;
  let lastPalletBoxes = 0;
  let isLastPalletDifferent = false;
  let balancedPalletWeight = 0;
  let lastPalletWeight = 0;

  if (totalPalletsNeeded > 0) {
    boxesPerPalletBalanced = boxesPerPallet; // Maximize each pallet
    const remainder = totalBoxesNeeded % boxesPerPallet;
    
    if (remainder !== 0) {
      isLastPalletDifferent = true;
      lastPalletBoxes = remainder;
    } else {
      lastPalletBoxes = boxesPerPallet;
    }

    const palletEmptyWeight = pallet.emptyWeight || 25; 
    balancedPalletWeight = (boxesPerPalletBalanced * boxTotalWeight) + palletEmptyWeight;
    lastPalletWeight = (lastPalletBoxes * boxTotalWeight) + palletEmptyWeight;
  }

  let loadDimensions = { length: 0, width: 0, height: 0 };
  if (boxesPerPallet > 0) {
    const [l, w, h] = palletFit.orientation.split('x').map(Number);
    loadDimensions = {
      length: Math.max(pallet.length, palletGrid.nx * l),
      width: Math.max(pallet.width, palletGrid.ny * w),
      height: pallet.height + (palletGrid.nz * h)
    };
  }

  return {
    partsPerBox,
    boxesPerPallet,
    totalPartsPerPallet,
    boxWeight: boxTotalWeight,
    palletWeight: (boxesPerPallet * boxTotalWeight) + (pallet.emptyWeight || 25),
    boxVolumeUtilization,
    palletVolumeUtilization,
    orientations: {
      box: boxFit.orientation,
      pallet: palletFit.orientation
    },
    boxGrid,
    palletGrid,
    totalBoxesNeeded,
    totalPalletsNeeded,
    boxesPerPalletBalanced,
    isLastPalletDifferent,
    lastPalletBoxes,
    balancedPalletWeight,
    lastPalletWeight,
    partsInLastBox,
    isLastBoxDifferent,
    loadDimensions
  };
}

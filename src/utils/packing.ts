import { Dimensions, PackingResult, Part, Container, Pallet, PackedBox, PalletLoad, PackingLayout } from '../types';

/**
 * Packs multiple simulations into pallets, allowing mixed boxes.
 */
function calculateSupportArea(x: number, y: number, l: number, w: number, z: number, packedBoxes: PackedBox[]): number {
  // Find boxes directly below this one
  const boxesBelow = packedBoxes.filter(b => b.z + b.height === z);
  if (boxesBelow.length === 0) return 0;

  // Calculate intersection area with each box below
  let supportedArea = 0;
  const boxArea = l * w;

  boxesBelow.forEach(b => {
    const interL = Math.max(0, Math.min(x + l, b.x + b.length) - Math.max(x, b.x));
    const interW = Math.max(0, Math.min(y + w, b.y + b.width) - Math.max(y, b.y));
    supportedArea += interL * interW;
  });

  return supportedArea / boxArea;
}

export function evaluatePalletStability(boxes: PackedBox[], pallet: Pallet): { score: number; isStable: boolean; warnings: string[] } {
  const warnings: string[] = [];
  let score = 1.0;

  if (boxes.length === 0) return { score: 1, isStable: true, warnings: [] };

  // 1. Support Check
  let totalSupport = 0;
  boxes.forEach(b => {
    if (b.z === 0) {
      totalSupport += 1.0;
    } else {
      const support = b.supportArea || 0;
      totalSupport += support;
      if (support < 0.8) {
        warnings.push(`Box ${b.name} is partially unsupported (${Math.round(support * 100)}% support)`);
        score -= 0.1;
      }
    }
  });
  const avgSupport = totalSupport / boxes.length;
  if (avgSupport < 0.9) score -= 0.1;

  // 2. Weight Distribution (Center of Gravity)
  let totalWeight = 0;
  let weightedX = 0;
  let weightedY = 0;
  let weightedZ = 0;

  boxes.forEach(b => {
    // We don't have individual box weights here easily, but we can use their volume as a proxy if needed
    // Actually we have weight in the packedBox if we add it, but it's not in the type yet.
    // Let's assume uniform density for now or just use the box volume.
    const weight = b.length * b.width * b.height; 
    totalWeight += weight;
    weightedX += (b.x + b.length / 2) * weight;
    weightedY += (b.y + b.width / 2) * weight;
    weightedZ += (b.z + b.height / 2) * weight;
  });

  const cgX = weightedX / totalWeight;
  const cgY = weightedY / totalWeight;
  const cgZ = weightedZ / totalWeight;

  const palletCenterX = pallet.length / 2;
  const palletCenterY = pallet.width / 2;

  const distFromCenter = Math.sqrt(Math.pow(cgX - palletCenterX, 2) + Math.pow(cgY - palletCenterY, 2));
  if (distFromCenter > Math.min(pallet.length, pallet.width) * 0.15) {
    warnings.push("Load is off-center, risk of tipping");
    score -= 0.2;
  }

  // 3. Overhang Check
  boxes.forEach(b => {
    const overhangX = Math.max(0, b.x + b.length - pallet.length, -b.x);
    const overhangY = Math.max(0, b.y + b.width - pallet.width, -b.y);
    if (overhangX > 20 || overhangY > 20) {
      warnings.push(`Box ${b.name} has excessive overhang`);
      score -= 0.1;
    }
  });

  // 4. Height check
  const maxHeight = boxes.reduce((max, b) => Math.max(max, b.z + b.height), 0);
  if (maxHeight > (pallet.maxHeight - pallet.height) * 0.9) {
    warnings.push("Load is near maximum height limit");
  }

  return {
    score: Math.max(0, score),
    isStable: score >= 0.7,
    warnings: Array.from(new Set(warnings)) // Unique warnings
  };
}

/**
 * Calculates how many items of dimensions 'item' can fit into a box of dimensions 'box'.
 * Tries orientations to find the maximum.
 * @param verticalOnly If true, only allows swapping length and width (keeps height constant).
 */
export function calculateMaxFit(item: Dimensions, box: Dimensions, verticalOnly: boolean = false, maxAllowed?: number): { count: number; maxCapacity: number; orientation: string; nx: number; ny: number; nz: number; layout?: PackingLayout } {
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

  let bestActualCount = 0;
  let bestRequiredHeight = Infinity;
  let bestTotalCount = 0;
  let bestItemsPerLayer = 0;
  
  let bestOrientation = '';
  let bestGrid = { nx: 0, ny: 0, nz: 0 };
  let bestLayout: PackingLayout | undefined;

  const evaluateLayout = (
    totalCount: number, 
    itemsPerLayer: number, 
    l: number, w: number, h: number, 
    grid: {nx: number, ny: number, nz: number}, 
    layout: PackingLayout
  ) => {
    const actualCount = maxAllowed !== undefined ? Math.min(totalCount, maxAllowed) : totalCount;
    if (actualCount === 0) return;

    const requiredNz = Math.ceil(actualCount / itemsPerLayer);
    const requiredHeight = requiredNz * h;

    let isBetter = false;
    if (actualCount > bestActualCount) {
      isBetter = true;
    } else if (actualCount === bestActualCount) {
      // Prioritize higher horizontal density (more items per layer) for better stability/layering
      if (itemsPerLayer > bestItemsPerLayer) {
        isBetter = true;
      } else if (itemsPerLayer === bestItemsPerLayer) {
        if (requiredHeight < bestRequiredHeight) {
          isBetter = true;
        } else if (requiredHeight === bestRequiredHeight && totalCount > bestTotalCount) {
          isBetter = true;
        }
      }
    }

    if (isBetter) {
      bestActualCount = actualCount;
      bestRequiredHeight = requiredHeight;
      bestTotalCount = totalCount;
      bestItemsPerLayer = itemsPerLayer;
      bestOrientation = `${l}x${w}x${h}`;
      bestGrid = { ...grid, nz: requiredNz };
      bestLayout = layout;
    }
  };

  orientations.forEach((o) => {
    const l = o[0];
    const w = o[1];
    const h = o[2];
    
    const nz = Math.floor(box.height / h);
    if (nz === 0) return;

    // 1. Simple Grid
    const nx_grid = Math.floor(box.length / l);
    const ny_grid = Math.floor(box.width / w);
    const itemsPerLayerGrid = nx_grid * ny_grid;
    const gridCount = itemsPerLayerGrid * nz;

    if (gridCount > 0) {
      evaluateLayout(
        gridCount, itemsPerLayerGrid, l, w, h, 
        { nx: nx_grid, ny: ny_grid, nz }, 
        { type: 'grid', nx1: nx_grid, ny1: ny_grid, nx2: 0, ny2: 0, l, w, h }
      );
    }

    // 2. Two-Block Vertical Split
    for (let i = 1; i < nx_grid; i++) {
      const x = i * l;
      const count1 = i * ny_grid;
      const nx2 = Math.floor((box.length - x) / w);
      const ny2 = Math.floor(box.width / l);
      const count2 = nx2 * ny2;
      const itemsPerLayerV = count1 + count2;
      const totalCount = itemsPerLayerV * nz;
      
      if (totalCount > 0) {
        evaluateLayout(
          totalCount, itemsPerLayerV, l, w, h,
          { nx: 0, ny: 0, nz },
          { type: 'two-block-v', x, nx1: i, ny1: ny_grid, nx2, ny2, l, w, h }
        );
      }
    }

    // 3. Two-Block Horizontal Split
    for (let j = 1; j < ny_grid; j++) {
      const y = j * w;
      const count1 = nx_grid * j;
      const nx2 = Math.floor(box.length / w);
      const ny2 = Math.floor((box.width - y) / l);
      const count2 = nx2 * ny2;
      const itemsPerLayerH = count1 + count2;
      const totalCount = itemsPerLayerH * nz;
      
      if (totalCount > 0) {
        evaluateLayout(
          totalCount, itemsPerLayerH, l, w, h,
          { nx: 0, ny: 0, nz },
          { type: 'two-block-h', y, nx1: nx_grid, ny1: j, nx2, ny2, l, w, h }
        );
      }
    }
  });

  return { 
    count: bestActualCount, 
    maxCapacity: bestTotalCount,
    orientation: bestOrientation, 
    ...bestGrid, 
    layout: bestLayout 
  };
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

  const maxPartsByWeight = Math.floor((25 - 0.5) / part.weight);
  let targetPartsPerBox = part.orderQuantity > 0 ? Math.min(maxPartsByWeight, part.orderQuantity) : maxPartsByWeight;
  
  if (part.fixedPartsPerBox !== undefined && part.fixedPartsPerBox > 0) {
    targetPartsPerBox = Math.min(part.fixedPartsPerBox, maxPartsByWeight);
  } else if (part.targetBoxCount !== undefined && part.targetBoxCount > 0 && part.orderQuantity > 0) {
    targetPartsPerBox = Math.ceil(part.orderQuantity / part.targetBoxCount);
    targetPartsPerBox = Math.min(targetPartsPerBox, maxPartsByWeight);
  }

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
    
    let effectiveUtilization = result.boxVolumeUtilization;
    let effectivePartsPerPallet = result.totalPartsPerPallet;

    // If the box is oversized for the order, penalize it
    if (part.orderQuantity > 0 && result.partsPerBox > part.orderQuantity) {
      effectiveUtilization = (part.orderQuantity * part.length * part.width * part.height) / (testBox.length * testBox.width * testBox.height);
      effectivePartsPerPallet = part.orderQuantity * result.boxesPerPallet;
    }

    if (effectivePartsPerPallet > maxPartsPerPallet || 
       (effectivePartsPerPallet === maxPartsPerPallet && effectiveUtilization > bestUtilization)) {
      maxPartsPerPallet = effectivePartsPerPallet;
      bestUtilization = effectiveUtilization;
      bestBox = testBox;
    }
  }

  // 2. If best standard box has < 85% utilization, or no box fits, or it's oversized, generate a custom one
  const isOversized = part.orderQuantity > 0 && bestBox && optimizePacking(part, bestBox, pallet, part.orderQuantity).partsPerBox > part.orderQuantity;
  
  if (!bestBox || bestUtilization < 0.85 || isOversized) {
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

    const palletUsableHeight = pallet.maxHeight - pallet.height;

    if (targetPartsPerBox > 0) {
      // Generate standard modular footprints based on the pallet size
      const modularFootprints: { l: number, w: number }[] = [];
      for (let i = 1; i <= 4; i++) {
        for (let j = 1; j <= 4; j++) {
          modularFootprints.push({
            l: Math.floor(pallet.length / i),
            w: Math.floor(pallet.width / j)
          });
        }
      }

      for (const footprint of modularFootprints) {
        for (const [l, w, h] of orientations) {
          // Simple grid fit for the footprint
          const nx = Math.floor((footprint.l - 5) / l);
          const ny = Math.floor((footprint.w - 5) / w);
          const itemsPerLayer = nx * ny;
          
          if (itemsPerLayer > 0) {
            // Try different layer counts
            for (let nz = 1; nz <= Math.floor(palletUsableHeight / h); nz++) {
              const count = itemsPerLayer * nz;
              if (count > targetPartsPerBox || count === 0) continue;

              const testBox: Container = {
                id: 'custom',
                name: 'Custom',
                length: footprint.l,
                width: footprint.w,
                height: nz * h + 5,
                maxWeight: 25,
                emptyWeight: 0.5,
              };

              const result = optimizePacking(part, testBox, pallet, part.orderQuantity);
              
              let effectiveUtilization = result.boxVolumeUtilization;
              let effectivePartsPerPallet = result.totalPartsPerPallet;

              if (part.orderQuantity > 0 && result.partsPerBox > part.orderQuantity) {
                effectiveUtilization = (part.orderQuantity * part.length * part.width * part.height) / (testBox.length * testBox.width * testBox.height);
                effectivePartsPerPallet = part.orderQuantity * result.boxesPerPallet;
              }

              if (effectiveUtilization >= 0.80 || count === targetPartsPerBox) {
                if (effectivePartsPerPallet > bestCustomPartsPerPallet ||
                   (effectivePartsPerPallet === bestCustomPartsPerPallet && effectiveUtilization > bestCustomUtilization)) {
                  bestCustomPartsPerPallet = effectivePartsPerPallet;
                  bestCustomUtilization = effectiveUtilization;
                  bestCustomBox = testBox;
                }
              }
            }
          }
        }
      }
    }

    if (bestCustomBox && (bestCustomPartsPerPallet > maxPartsPerPallet || bestCustomUtilization >= 0.85 || isOversized)) {
      bestBox = bestCustomBox;
    }
  }

  if (!bestBox) {
    // Ultimate fallback
    const dims = `${part.length + 10}x${part.width + 10}x${part.height + 10}`;
    bestBox = {
      id: 'best-choice-' + Math.random().toString(36).substr(2, 5),
      name: `BC ${dims}`,
      length: part.length + 10,
      width: part.width + 10,
      height: part.height + 10,
      maxWeight: Math.max(25, part.weight + 5),
      emptyWeight: 0.5,
    };
  } else {
    const dims = `${bestBox.length}x${bestBox.width}x${bestBox.height}`;
    bestBox.id = 'best-choice-' + Math.random().toString(36).substr(2, 5);
    bestBox.name = `BC ${dims}`;
  }

  return bestBox;
}

export function optimizePacking(part: Part, box: Container, pallet: Pallet, totalOrderQuantity: number = 0): PackingResult {
  // 1. Determine maximum parts allowed by weight and user limits
  const maxPartsByWeight = Math.floor((box.maxWeight - box.emptyWeight) / part.weight);
  let maxAllowed = maxPartsByWeight;
  
  if (part.fixedPartsPerBox !== undefined && part.fixedPartsPerBox > 0) {
    maxAllowed = Math.min(maxAllowed, part.fixedPartsPerBox);
  } else if (part.targetBoxCount !== undefined && part.targetBoxCount > 0 && totalOrderQuantity > 0) {
    const targetPartsPerBox = Math.ceil(totalOrderQuantity / part.targetBoxCount);
    maxAllowed = Math.min(maxAllowed, targetPartsPerBox);
  }

  // 2. Pack parts into box (Any orientation allowed for parts)
  // Pass maxAllowed to calculateMaxFit so it optimizes layout for this count
  const boxFit = calculateMaxFit(part, box, false, maxAllowed);
  
  let actualPartsPerBox = boxFit.count;
  let maxPartsPerBox = boxFit.maxCapacity;
  let boxGrid = { nx: boxFit.nx, ny: boxFit.ny, nz: boxFit.nz };

  const totalBoxesNeeded = actualPartsPerBox > 0 && totalOrderQuantity > 0 ? Math.ceil(totalOrderQuantity / actualPartsPerBox) : 0;
  
  let partsInLastBox = actualPartsPerBox;
  let isLastBoxDifferent = false;

  if (totalOrderQuantity > 0 && totalBoxesNeeded > 0) {
    const baseQuantity = Math.floor(totalOrderQuantity / totalBoxesNeeded);
    const remainder = totalOrderQuantity % totalBoxesNeeded;
    
    if (remainder === 0) {
      actualPartsPerBox = baseQuantity;
      partsInLastBox = baseQuantity;
    } else {
      actualPartsPerBox = baseQuantity + 1;
      partsInLastBox = totalOrderQuantity % actualPartsPerBox || actualPartsPerBox;
      isLastBoxDifferent = totalOrderQuantity % actualPartsPerBox !== 0;
    }
  } else if (totalOrderQuantity > 0) {
    partsInLastBox = totalOrderQuantity % actualPartsPerBox || actualPartsPerBox;
    isLastBoxDifferent = totalOrderQuantity % actualPartsPerBox !== 0;
  }

  // Recalculate boxFit for the actual parts per box to get the best layout for that specific count
  const finalBoxFit = calculateMaxFit(part, box, false, actualPartsPerBox);
  boxGrid = { nx: finalBoxFit.nx, ny: finalBoxFit.ny, nz: finalBoxFit.nz };
  const boxLayout = finalBoxFit.layout;

  // 2. Pack boxes onto pallet
  const palletUsableHeight = pallet.maxHeight - pallet.height;
  // No overhang allowed
  const usablePallet: Dimensions = {
    length: pallet.length,
    width: pallet.width,
    height: palletUsableHeight
  };

  const boxTotalWeight = (actualPartsPerBox * part.weight) + box.emptyWeight;
  const maxBoxesByWeight = Math.floor((pallet.maxWeight - pallet.emptyWeight) / boxTotalWeight);

  // For pallets, we usually only rotate around vertical axis (length/width swap)
  const palletFit = calculateMaxFit(box, usablePallet, true, maxBoxesByWeight);
  
  let boxesPerPallet = palletFit.count;
  let palletGrid = { nx: palletFit.nx, ny: palletFit.ny, nz: palletFit.nz };

  // Try to add a flat layer if there's space and weight left
  let flatLayerFit: { fit: ReturnType<typeof calculateMaxFit>, box: Dimensions, isLengthUp: boolean } | null = null;
  const remainingWeightBoxes = maxBoxesByWeight - boxesPerPallet;
  const currentHeight = palletFit.layout ? palletFit.nz * palletFit.layout.h : 0;
  const remainingHeight = palletUsableHeight - currentHeight;
  
  if (remainingWeightBoxes > 0 && remainingHeight > 0 && palletFit.layout) {
    const flatUsablePallet = { length: pallet.length, width: pallet.width, height: remainingHeight };
    
    // Box laid flat: height becomes either length or width.
    // Case 1: Length is up (height = length)
    const flatBox1 = { length: box.height, width: box.width, height: box.length };
    // Case 2: Width is up (height = width)
    const flatBox2 = { length: box.length, width: box.height, height: box.width };
    
    // We only want ONE layer, so we restrict height to the flat box height
    const fit1 = flatBox1.height <= remainingHeight ? calculateMaxFit(flatBox1, { ...flatUsablePallet, height: flatBox1.height }, true, remainingWeightBoxes) : { count: 0 };
    const fit2 = flatBox2.height <= remainingHeight ? calculateMaxFit(flatBox2, { ...flatUsablePallet, height: flatBox2.height }, true, remainingWeightBoxes) : { count: 0 };
    
    if (fit1.count > 0 || fit2.count > 0) {
      if (fit1.count > fit2.count) {
        flatLayerFit = { fit: fit1 as any, box: flatBox1, isLengthUp: true };
      } else {
        flatLayerFit = { fit: fit2 as any, box: flatBox2, isLengthUp: false };
      }
      boxesPerPallet += flatLayerFit.fit.count;
    }
  }

  const totalPartsPerPallet = actualPartsPerBox * boxesPerPallet;
  
  // Utilization
  const partVolume = part.length * part.width * part.height;
  const boxVolume = box.length * box.width * box.height;
  const palletVolume = pallet.length * pallet.width * palletUsableHeight;

  const boxVolumeUtilization = (actualPartsPerBox > 0 && boxVolume > 0) ? (actualPartsPerBox * partVolume) / boxVolume : 0;
  const palletVolumeUtilization = (boxesPerPallet > 0 && palletVolume > 0) ? (boxesPerPallet * boxVolume) / palletVolume : 0;

  // Maximized distribution
  let boxesPerPalletBalanced = 0;
  let lastPalletBoxes = 0;
  let isLastPalletDifferent = false;
  let balancedPalletWeight = 0;
  let lastPalletWeight = 0;

  const totalPalletsNeeded = boxesPerPallet > 0 && totalBoxesNeeded > 0 ? Math.ceil(totalBoxesNeeded / boxesPerPallet) : 0;

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
  const boxes: PackedBox[] = [];

  if (boxesPerPallet > 0 && palletFit.layout) {
    const layout = palletFit.layout;
    const { nx1, ny1, nx2, ny2, l, w, h, x, y, type } = layout;
    
    let maxL = 0;
    let maxW = 0;
    
    if (type === 'grid') {
      maxL = nx1 * l;
      maxW = ny1 * w;
    } else if (type === 'two-block-v') {
      maxL = Math.max(nx1 * l, (x || 0) + nx2 * w);
      maxW = Math.max(ny1 * w, ny2 * l);
    } else if (type === 'two-block-h') {
      maxL = Math.max(nx1 * l, nx2 * w);
      maxW = Math.max(ny1 * w, (y || 0) + ny2 * l);
    }

    let totalHeight = pallet.height + (isFinite(palletGrid.nz) ? palletGrid.nz * h : 0);
    if (flatLayerFit && flatLayerFit.fit.layout) {
      totalHeight += flatLayerFit.fit.layout.h;
    }

    loadDimensions = {
      length: Math.max(pallet.length, maxL),
      width: Math.max(pallet.width, maxW),
      height: Math.min(pallet.maxHeight || 2000, totalHeight)
    };

    let count = 0;
    const offsetX = (pallet.length - maxL) / 2;
    const offsetY = (pallet.width - maxW) / 2;

    for (let z = 0; z < palletGrid.nz; z++) {
      // Block 1
      for (let iy = 0; iy < ny1; iy++) {
        for (let ix = 0; ix < nx1; ix++) {
          if (count >= boxesPerPallet) break;
          boxes.push({
            id: box.id,
            partName: part.name,
            length: l,
            width: w,
            height: h,
            x: offsetX + ix * l,
            y: offsetY + iy * w,
            z: z * h,
            color: '#fef3c7',
            edgeColor: '#d97706',
            name: box.name,
            isStable: true,
            supportArea: 1.0
          });
          count++;
        }
      }
      
      // Block 2
      if (type === 'two-block-v') {
        const startX = x || 0;
        for (let iy = 0; iy < ny2; iy++) {
          for (let ix = 0; ix < nx2; ix++) {
            if (count >= boxesPerPallet) break;
            boxes.push({
              id: box.id,
              simulationId: 'single',
              partName: part.name,
              length: w,
              width: l,
              height: h,
              x: offsetX + startX + ix * w,
              y: offsetY + iy * l,
              z: z * h,
              color: '#fef3c7',
              edgeColor: '#d97706',
              name: box.name,
              isStable: true,
              supportArea: 1.0
            });
            count++;
          }
        }
      } else if (type === 'two-block-h') {
        const startY = y || 0;
        for (let iy = 0; iy < ny2; iy++) {
          for (let ix = 0; ix < nx2; ix++) {
            if (count >= boxesPerPallet) break;
            boxes.push({
              id: box.id,
              simulationId: 'single',
              partName: part.name,
              length: w,
              width: l,
              height: h,
              x: offsetX + ix * w,
              y: offsetY + startY + iy * l,
              z: z * h,
              color: '#fef3c7',
              edgeColor: '#d97706',
              name: box.name,
              isStable: true,
              supportArea: 1.0
            });
            count++;
          }
        }
      }
    }

    if (flatLayerFit && flatLayerFit.fit.layout) {
      const flatLayout = flatLayerFit.fit.layout;
      const { nx1, ny1, nx2, ny2, l, w, h, x, y, type } = flatLayout;
      
      let maxLFlat = 0;
      let maxWFlat = 0;
      
      if (type === 'grid') {
        maxLFlat = nx1 * l;
        maxWFlat = ny1 * w;
      } else if (type === 'two-block-v') {
        maxLFlat = Math.max(nx1 * l, (x || 0) + nx2 * w);
        maxWFlat = Math.max(ny1 * w, ny2 * l);
      } else if (type === 'two-block-h') {
        maxLFlat = Math.max(nx1 * l, nx2 * w);
        maxWFlat = Math.max(ny1 * w, (y || 0) + ny2 * l);
      }

      // Update loadDimensions to include flat layer width/length
      loadDimensions.length = Math.max(loadDimensions.length, maxLFlat);
      loadDimensions.width = Math.max(loadDimensions.width, maxWFlat);

      const offsetFlatX = (pallet.length - maxLFlat) / 2;
      const offsetFlatY = (pallet.width - maxWFlat) / 2;
      const startZ = palletGrid.nz * palletFit.layout.h;

      // Block 1
      for (let iy = 0; iy < ny1; iy++) {
        for (let ix = 0; ix < nx1; ix++) {
          if (count >= boxesPerPallet) break;
          boxes.push({
            id: box.id,
            simulationId: 'single',
            partName: part.name,
            length: l,
            width: w,
            height: h,
            x: offsetFlatX + ix * l,
            y: offsetFlatY + iy * w,
            z: startZ,
            color: '#fde68a', // slightly different color for flat layer
            edgeColor: '#d97706',
            name: box.name,
            isStable: true,
            supportArea: 1.0
          });
          count++;
        }
      }
      
      // Block 2
      if (type === 'two-block-v') {
        const startX = x || 0;
        for (let iy = 0; iy < ny2; iy++) {
          for (let ix = 0; ix < nx2; ix++) {
            if (count >= boxesPerPallet) break;
            boxes.push({
              id: box.id,
              simulationId: 'single',
              partName: part.name,
              length: w,
              width: l,
              height: h,
              x: offsetFlatX + startX + ix * w,
              y: offsetFlatY + iy * l,
              z: startZ,
              color: '#fde68a',
              edgeColor: '#d97706',
              name: box.name,
              isStable: true,
              supportArea: 1.0
            });
            count++;
          }
        }
      } else if (type === 'two-block-h') {
        const startY = y || 0;
        for (let iy = 0; iy < ny2; iy++) {
          for (let ix = 0; ix < nx2; ix++) {
            if (count >= boxesPerPallet) break;
            boxes.push({
              id: box.id,
              simulationId: 'single',
              partName: part.name,
              length: w,
              width: l,
              height: h,
              x: offsetFlatX + ix * w,
              y: offsetFlatY + startY + iy * l,
              z: startZ,
              color: '#fde68a',
              edgeColor: '#d97706',
              name: box.name,
              isStable: true,
              supportArea: 1.0
            });
            count++;
          }
        }
      }
    }
  }

  const stability = evaluatePalletStability(boxes, pallet);

  return {
    partsPerBox: actualPartsPerBox,
    maxPartsPerBox: maxPartsPerBox,
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
    layout: boxLayout,
    palletLayout: palletFit.layout,
    boxes,
    totalBoxesNeeded,
    totalPalletsNeeded,
    boxesPerPalletBalanced,
    isLastPalletDifferent,
    lastPalletBoxes,
    balancedPalletWeight,
    lastPalletWeight,
    partsInLastBox,
    isLastBoxDifferent,
    loadDimensions,
    stabilityScore: stability.score,
    isStable: stability.isStable,
    warnings: stability.warnings
  };
}

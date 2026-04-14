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
export function calculateMaxFit(item: Dimensions & { primaryOrientation?: 'length' | 'width' | 'height' }, box: Dimensions, verticalOnly: boolean = false, maxAllowed?: number): { count: number; maxCapacity: number; orientation: string; nx: number; ny: number; nz: number; layout?: PackingLayout } {
  let orientations: number[][];
  
  if (item.primaryOrientation) {
    const all = [
      [item.length, item.width, item.height],
      [item.length, item.height, item.width],
      [item.width, item.length, item.height],
      [item.width, item.height, item.length],
      [item.height, item.length, item.width],
      [item.height, item.width, item.length],
    ];
    
    orientations = all.filter(o => {
      if (item.primaryOrientation === 'length') return o[2] === item.length;
      if (item.primaryOrientation === 'width') return o[2] === item.width;
      if (item.primaryOrientation === 'height') return o[2] === item.height;
      return true;
    });
  } else {
    orientations = verticalOnly 
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
  }

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

export function suggestBestBox(part: Part, pallet: Pallet, shippingMethod: 'pallet' | 'courier' = 'pallet'): Container {
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
  let bestScore = -Infinity;

  const maxPartsByWeight = Math.floor((25 - 0.5) / part.weight);
  let targetPartsPerBox = part.orderQuantity > 0 ? Math.min(maxPartsByWeight, part.orderQuantity) : maxPartsByWeight;
  
  if (part.fixedPartsPerBox !== undefined && part.fixedPartsPerBox > 0) {
    targetPartsPerBox = Math.min(part.fixedPartsPerBox, maxPartsByWeight);
  } else if (part.targetBoxCount !== undefined && part.targetBoxCount > 0 && part.orderQuantity > 0) {
    targetPartsPerBox = Math.ceil(part.orderQuantity / part.targetBoxCount);
    targetPartsPerBox = Math.min(targetPartsPerBox, maxPartsByWeight);
  }

  // Helper to check modularity
  const getModularityScore = (l: number, w: number) => {
    if (shippingMethod !== 'pallet') return 0;
    let score = 0;
    const factorsL = [1, 2, 3, 4].map(f => pallet.length / f);
    const factorsW = [1, 2, 3, 4].map(f => pallet.width / f);
    const isModularL = factorsL.some(f => Math.abs(l - f) < 10);
    const isModularW = factorsW.some(f => Math.abs(w - f) < 10);
    if (isModularL) score += 50;
    if (isModularW) score += 50;
    return score;
  };

  // 1. Try standard dimensions
  for (const dims of standardDimensions) {
    const boxWeight = 0.5 + (dims.l * dims.w * dims.h) / 100000000;
    const testBox: Container = {
      id: 'test',
      name: 'Test',
      length: dims.l,
      width: dims.w,
      height: dims.h,
      maxWeight: 25,
      emptyWeight: boxWeight,
      weight: boxWeight
    };
    const result = optimizePacking(part, testBox, pallet, part.orderQuantity);
    let score = result.boxVolumeUtilization * 100;
    score += getModularityScore(testBox.length, testBox.width);
    score -= Math.abs(result.boxVolumeUtilization - 0.85) * 150;
    if (result.partsPerBox === targetPartsPerBox) score += 50;
    else score -= Math.abs(result.partsPerBox - targetPartsPerBox) * 5;
    
    if (score > bestScore) {
      bestScore = score;
      bestBox = { ...testBox, id: `standard-${Date.now()}`, name: `Standard ${dims.l}x${dims.w}x${dims.h}`, createdAt: Date.now() };
    }
  }

  // 2. Generate custom boxes following the 10mm clearance rule
  const orientations = [
    [part.length, part.width, part.height],
    [part.length, part.height, part.width],
    [part.width, part.length, part.height],
    [part.width, part.height, part.length],
    [part.height, part.length, part.width],
    [part.height, part.width, part.length],
  ];
  const palletUsableHeight = pallet.maxHeight - pallet.height;
  for (const [pl, pw, ph] of orientations) {
    for (let nx = 1; nx <= 15; nx++) {
      for (let ny = 1; ny <= 15; ny++) {
        for (let nz = 1; nz <= 15; nz++) {
          const count = nx * ny * nz;
          if (count > targetPartsPerBox * 1.5 && count > 5) continue;
          const stackL = nx * pl;
          const stackW = ny * pw;
          const stackH = nz * ph;
          let boxL = Math.round(stackL + 20);
          let boxW = Math.round(stackW + 20);
          let boxH = Math.round(stackH + 20);
          if (boxL < 50 || boxW < 50 || boxH < 50) continue;
          if (boxL > 600 || boxW > 600 || boxH > 600) continue;
          if (boxH > palletUsableHeight) continue;
          if (boxL > pallet.length || boxW > pallet.width) continue;
          
          const totalWeight = count * part.weight;
          if (totalWeight > 25) continue;

          const utilization = (stackL * stackW * stackH) / (boxL * boxW * boxH);
          let score = utilization * 100;
          score -= Math.abs(utilization - 0.85) * 200;
          score += getModularityScore(boxL, boxW);
          if (count === targetPartsPerBox) score += 100;
          else score -= Math.abs(count - targetPartsPerBox) * 10;
          
          if (score > bestScore) {
            bestScore = score;
            const boxWeight = 0.5 + (boxL * boxW * boxH) / 100000000;
            bestBox = {
              id: `custom-${Date.now()}`,
              name: `BC ${boxL}x${boxW}x${boxH}`,
              length: boxL,
              width: boxW,
              height: boxH,
              maxWeight: 30,
              emptyWeight: boxWeight,
              weight: boxWeight,
              createdAt: Date.now()
            };
          }
        }
      }
    }
  }
  return bestBox || { id: 'default', name: 'Default Box', length: 600, width: 400, height: 300, maxWeight: 25, emptyWeight: 0.5, weight: 0.5 };
}

export function optimizeMixedShipment(
  items: { part: Part; box: Container; quantity: number }[],
  pallet: Pallet
): PackingResult {
  // 1. Pack each item into its assigned boxes
  const allPackedBoxes: PackedBox[] = [];
  let totalBoxesNeeded = 0;
  let totalPartVolume = 0;
  let totalBoxVolume = 0;

  items.forEach(item => {
    const res = optimizePacking(item.part, item.box, pallet, item.quantity);
    totalBoxesNeeded += res.totalBoxesNeeded;
    totalPartVolume += item.part.length * item.part.width * item.part.height * item.quantity;
    totalBoxVolume += item.box.length * item.box.width * item.box.height * res.totalBoxesNeeded;

    const itemColor = [
      '#fef3c7', '#dbeafe', '#d1fae5', '#ffedd5', '#f3e8ff', '#fee2e2'
    ][items.indexOf(item) % 6];
    const itemEdgeColor = [
      '#d97706', '#2563eb', '#059669', '#ea580c', '#7c3aed', '#dc2626'
    ][items.indexOf(item) % 6];

    // Create box instances for this item
    for (let i = 0; i < res.totalBoxesNeeded; i++) {
      const isLast = i === res.totalBoxesNeeded - 1 && res.isLastBoxDifferent;
      const pCount = isLast ? res.partsInLastBox : res.partsPerBox;
      const bWeight = (pCount * item.part.weight) + (item.box.weight || item.box.emptyWeight);

      allPackedBoxes.push({
        id: item.box.id,
        partName: item.part.name,
        length: item.box.length,
        width: item.box.width,
        height: item.box.height,
        x: 0, y: 0, z: 0,
        color: itemColor,
        edgeColor: itemEdgeColor,
        name: item.box.name,
        weight: bWeight,
        partsCount: pCount,
        isStable: true,
        supportArea: 1.0
      });
    }
  });

  if (allPackedBoxes.length === 0) {
    return optimizePacking(items[0]?.part || { length: 0, width: 0, height: 0, weight: 0, orderQuantity: 0 } as any, items[0]?.box || { length: 0, width: 0, height: 0, maxWeight: 0, emptyWeight: 0 } as any, pallet, 0);
  }

  // 2. Pack all these boxes onto pallets
  // For simplicity in this version, we'll group boxes by type and pack them sequentially
  // A more advanced version would use a 3D bin packing algorithm
  
  const pallets: PackedBox[][] = [[]];
  let currentPalletWeight = pallet.emptyWeight;
  let currentPalletHeight = 0;
  
  // Group boxes by dimensions to use calculateMaxFit for layers
  const boxGroups = new Map<string, PackedBox[]>();
  allPackedBoxes.forEach(b => {
    const key = `${b.length}x${b.width}x${b.height}`;
    if (!boxGroups.has(key)) boxGroups.set(key, []);
    boxGroups.get(key)!.push(b);
  });

  const palletUsableHeight = pallet.maxHeight - pallet.height;

  // Sort box groups by area (length * width) descending for better stability
  const sortedGroups = Array.from(boxGroups.entries()).sort((a, b) => {
    const [al, aw] = a[0].split('x').map(Number);
    const [bl, bw] = b[0].split('x').map(Number);
    return (bl * bw) - (al * aw);
  });

  sortedGroups.forEach(([key, boxes]) => {
    const [bl, bw, bh] = key.split('x').map(Number);
    const boxWeight = boxes[0].weight || 5; // Fallback weight if not set

    // Find the actual weight from the items
    const matchingItem = items.find(it => it.box.length === bl && it.box.width === bw && it.box.height === bh);
    const actualBoxWeight = matchingItem ? (matchingItem.part.weight * (optimizePacking(matchingItem.part, matchingItem.box, pallet, matchingItem.quantity).partsPerBox) + (matchingItem.box.weight || matchingItem.box.emptyWeight)) : boxWeight;

    // Pack these boxes into layers
    const fit = calculateMaxFit({ length: bl, width: bw, height: bh }, { length: pallet.length, width: pallet.width, height: palletUsableHeight }, true);
    const [ol, ow, oh] = fit.orientation.split('x').map(Number);
    const boxesPerLayer = fit.nx * fit.ny;
    
    if (boxesPerLayer === 0) return;

    const maxL = fit.nx * ol;
    const maxW = fit.ny * ow;
    // Use corner alignment (0,0) for better stability and "orderly" look
    const offsetX = 0; 
    const offsetY = 0; 

    let boxesRemaining = boxes.length;
    while (boxesRemaining > 0) {
      let currentPallet = pallets[pallets.length - 1];
      
      // Check if we can add at least one layer to current pallet
      const layerWeight = boxesPerLayer * actualBoxWeight;
      const currentHeight = currentPallet.length > 0 ? Math.max(...currentPallet.map(b => b.z + b.height)) : 0;
      
      if (currentPalletWeight + layerWeight > pallet.maxWeight || currentHeight + oh > palletUsableHeight) {
        // Start new pallet
        pallets.push([]);
        currentPallet = pallets[pallets.length - 1];
        currentPalletWeight = pallet.emptyWeight;
        currentPalletHeight = 0;
      }

      const boxesToPack = Math.min(boxesRemaining, boxesPerLayer);
      const startZ = currentPallet.length > 0 ? Math.max(...currentPallet.map(b => b.z + b.height)) : 0;

      for (let i = 0; i < boxesToPack; i++) {
        const ix = i % fit.nx;
        const iy = Math.floor(i / fit.nx);
        const boxToPlace = boxes[boxes.length - boxesRemaining];
        currentPallet.push({
          ...boxToPlace,
          length: ol,
          width: ow,
          height: oh,
          x: offsetX + ix * ol,
          y: offsetY + iy * ow,
          z: startZ,
          // weight and partsCount are preserved from boxToPlace
        });
        boxesRemaining--;
        currentPalletWeight += boxToPlace.weight || 0;
      }
    }
  });

  const totalPalletsNeeded = pallets.length;
  const firstPalletBoxes = pallets[0];
  const lastPalletBoxes = pallets[pallets.length - 1];
  
  const firstPalletWeight = firstPalletBoxes.reduce((sum, b) => sum + (b.weight || 0), pallet.emptyWeight);
  const finalPalletWeight = lastPalletBoxes.reduce((sum, b) => sum + (b.weight || 0), pallet.emptyWeight);

  // Calculate load dimensions for the first pallet
  const maxHeight = firstPalletBoxes.length > 0 ? Math.max(...firstPalletBoxes.map(b => b.z + b.height)) : 0;
  
  return {
    partsPerBox: 0, // Mixed
    maxPartsPerBox: 0,
    boxesPerPallet: firstPalletBoxes.length,
    totalPartsPerPallet: 0,
    boxWeight: 0,
    palletWeight: firstPalletWeight,
    boxVolumeUtilization: totalBoxVolume > 0 ? totalPartVolume / totalBoxVolume : 0,
    palletVolumeUtilization: totalBoxVolume > 0 ? totalBoxVolume / (pallet.length * pallet.width * palletUsableHeight * totalPalletsNeeded) : 0,
    orientations: { box: 'Mixed', pallet: 'Mixed' },
    boxGrid: { nx: 0, ny: 0, nz: 0 },
    palletGrid: { nx: 1, ny: 1, nz: 1 }, // Fallback for mixed
    totalBoxesNeeded,
    totalPalletsNeeded,
    boxesPerPalletBalanced: firstPalletBoxes.length,
    isLastPalletDifferent: pallets.length > 1,
    lastPalletBoxes: lastPalletBoxes.length,
    balancedPalletWeight: firstPalletWeight,
    lastPalletWeight: finalPalletWeight,
    partsInLastBox: 0,
    isLastBoxDifferent: false,
    loadDimensions: { length: pallet.length, width: pallet.width, height: pallet.height + maxHeight },
    boxes: firstPalletBoxes,
    pallets: pallets
  };
}

export function optimizePacking(part: Part, box: Container, pallet: Pallet, totalOrderQuantity: number = 0): PackingResult {
  // 1. Determine maximum parts allowed by weight and user limits
  const boxW = box.weight || box.emptyWeight;
  const maxPartsByWeight = Math.floor((box.maxWeight - boxW) / part.weight);
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

  const boxTotalWeight = (actualPartsPerBox * part.weight) + (box.weight || box.emptyWeight);
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

import { Dimensions, PackingResult, Part, Container, Pallet, PackedBox, PalletLoad, PackingLayout } from '../types';

/**
 * Professional Palletization and Box Selection Logic
 */

/**
 * Calculates the intersection area of two rectangles.
 */
function getIntersectionArea(
  x1: number, y1: number, l1: number, w1: number,
  x2: number, y2: number, l2: number, w2: number
): number {
  const interL = Math.max(0, Math.min(x1 + l1, x2 + l2) - Math.max(x1, x2));
  const interW = Math.max(0, Math.min(y1 + w1, y2 + w2) - Math.max(y1, y2));
  return interL * interW;
}

/**
 * Checks if a box has 100% support from the layer below or the pallet surface.
 */
function hasFullSupport(
  x: number, y: number, l: number, w: number, z: number,
  placedBoxes: PackedBox[],
  epsilon: number = 0.1
): boolean {
  if (z === 0) return true; // Directly on pallet

  const boxArea = l * w;
  const boxesBelow = placedBoxes.filter(b => Math.abs((b.z + b.height) - z) < epsilon);
  
  let supportedArea = 0;
  boxesBelow.forEach(b => {
    supportedArea += getIntersectionArea(x, y, l, w, b.x, b.y, b.length, b.width);
  });

  // Must be 100% supported (within tiny tolerance)
  return supportedArea >= (boxArea - epsilon);
}

/**
 * Checks for collisions with other boxes in the same space.
 */
function isColliding(
  x: number, y: number, z: number, l: number, w: number, h: number,
  placedBoxes: PackedBox[],
  epsilon: number = 0.1
): boolean {
  for (const b of placedBoxes) {
    const xOverlap = Math.max(0, Math.min(x + l, b.x + b.length) - Math.max(x, b.x));
    const yOverlap = Math.max(0, Math.min(y + w, b.y + b.width) - Math.max(y, b.y));
    const zOverlap = Math.max(0, Math.min(z + h, b.z + b.height) - Math.max(z, b.z));
    
    if (xOverlap > epsilon && yOverlap > epsilon && zOverlap > epsilon) {
      return true;
    }
  }
  return false;
}

/**
 * Evaluates pallet stability and physical validity.
 */
export function evaluatePalletStability(boxes: PackedBox[], pallet: Pallet): { score: number; isStable: boolean; warnings: string[] } {
  const warnings: string[] = [];
  let score = 1.0;

  if (boxes.length === 0) return { score: 1, isStable: true, warnings: [] };

  // 1. Support Check (100% required for professional stability)
  let fullySupportedCount = 0;
  boxes.forEach(b => {
    const supported = hasFullSupport(b.x, b.y, b.length, b.width, b.z, boxes);
    if (supported) {
      fullySupportedCount++;
    } else {
      warnings.push(`Box ${b.name} at z=${b.z} lacks full support`);
      score -= 0.2;
    }
  });

  // 2. Weight Distribution
  let totalWeight = 0;
  let weightedX = 0;
  let weightedY = 0;
  boxes.forEach(b => {
    const weight = b.weight || (b.length * b.width * b.height / 1000000); 
    totalWeight += weight;
    weightedX += (b.x + b.length / 2) * weight;
    weightedY += (b.y + b.width / 2) * weight;
  });

  const cgX = weightedX / totalWeight;
  const cgY = weightedY / totalWeight;
  const palletCenterX = pallet.length / 2;
  const palletCenterY = pallet.width / 2;

  const distFromCenter = Math.sqrt(Math.pow(cgX - palletCenterX, 2) + Math.pow(cgY - palletCenterY, 2));
  if (distFromCenter > Math.min(pallet.length, pallet.width) * 0.2) {
    warnings.push("Load center of gravity is significantly off-center");
    score -= 0.15;
  }

  return {
    score: Math.max(0, score),
    isStable: score >= 0.8 && fullySupportedCount === boxes.length,
    warnings: Array.from(new Set(warnings))
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

    // 4. Mixed Layer Orientation (Last layers in different orientation)
    // Try filling the remaining height with other orientations
    orientations.forEach((o2) => {
      if (o2[0] === l && o2[1] === w && o2[2] === h) return;
      
      const l2 = o2[0];
      const w2 = o2[1];
      const h2 = o2[2];
      
      // Try taking some layers of O and some of O2
      for (let nz1 = 1; nz1 < nz; nz1++) {
        const remainingH = box.height - (nz1 * h);
        const nz2 = Math.floor(remainingH / h2);
        if (nz2 === 0) continue;
        
        const nx2_layer = Math.floor(box.length / l2);
        const ny2_layer = Math.floor(box.width / w2);
        const itemsPerLayer2 = nx2_layer * ny2_layer;
        
        const totalCount = (itemsPerLayerGrid * nz1) + (itemsPerLayer2 * nz2);
        
        if (totalCount > 0) {
          evaluateLayout(
            totalCount, 
            itemsPerLayerGrid, // Use first layer for density reporting
            l, w, h,
            { nx: nx_grid, ny: ny_grid, nz: nz1 + nz2 },
            { 
              type: 'mixed-layer', 
              nx1: nx_grid, ny1: ny_grid, 
              nx2: 0, ny2: 0, 
              l, w, h,
              nz1, nz2, l2, w2, h2, nx2_layer, ny2_layer
            }
          );
        }
      }
    });
  });

  return { 
    count: bestActualCount, 
    maxCapacity: bestTotalCount,
    orientation: bestOrientation, 
    ...bestGrid, 
    layout: bestLayout 
  };
}

/**
 * Pure logic for packing parts into a single box.
 */
function getBoxPackingDetails(part: Part, box: Container, totalOrderQuantity: number = 0) {
  const boxW = box.weight || box.emptyWeight;
  const maxPartsByWeight = Math.floor((box.maxWeight - boxW) / part.weight);
  let maxAllowed = maxPartsByWeight;
  
  if (part.fixedPartsPerBox !== undefined && part.fixedPartsPerBox > 0) {
    maxAllowed = Math.min(maxAllowed, part.fixedPartsPerBox);
  } else if (part.targetBoxCount !== undefined && part.targetBoxCount > 0 && totalOrderQuantity > 0) {
    const targetPartsPerBox = Math.ceil(totalOrderQuantity / part.targetBoxCount);
    maxAllowed = Math.min(maxAllowed, targetPartsPerBox);
  }

  const padding = 20;
  const usableBox = {
    length: Math.max(0, box.length - padding),
    width: Math.max(0, box.width - padding),
    height: Math.max(0, box.height - padding)
  };
  
  const boxFit = calculateMaxFit(part, usableBox, false, maxAllowed);
  
  let actualPartsPerBox = boxFit.count;
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
  }

  const finalBoxFit = calculateMaxFit(part, usableBox, false, actualPartsPerBox);
  const boxTotalWeight = (actualPartsPerBox * part.weight) + (box.weight || box.emptyWeight);
  const partVolume = part.length * part.width * part.height;
  const boxVolume = box.length * box.width * box.height;
  const boxVolumeUtilization = (actualPartsPerBox > 0 && boxVolume > 0) ? (actualPartsPerBox * partVolume) / boxVolume : 0;

  return {
    actualPartsPerBox,
    maxPartsPerBox: boxFit.maxCapacity,
    totalBoxesNeeded,
    partsInLastBox,
    isLastBoxDifferent,
    boxGrid: { nx: finalBoxFit.nx, ny: finalBoxFit.ny, nz: finalBoxFit.nz },
    boxLayout: finalBoxFit.layout,
    boxTotalWeight,
    boxVolumeUtilization,
    boxOrientation: finalBoxFit.orientation
  };
}

/**
 * Pure logic for packing a list of PackedBox onto pallets.
 * Maximizes current pallet utilization before starting a new one.
 */
function palletizeBoxes(allPackedBoxes: PackedBox[], pallet: Pallet): { pallets: PalletLoad[], totalPalletsNeeded: number, palletUsableHeight: number } {
  const palletLoads: PalletLoad[] = [];
  const palletUsableHeight = pallet.maxHeight - pallet.height;

  // Sort boxes for stability: Heavier and larger base area first
  // This helps building a solid base
  const boxesToPack = [...allPackedBoxes].sort((a, b) => {
    const areaA = a.length * a.width;
    const areaB = b.length * b.width;
    if (Math.abs(areaB - areaA) > 100) return areaB - areaA;
    return (b.weight || 0) - (a.weight || 0);
  });

  let remainingBoxes = [...boxesToPack];
  let safetyCounter = 0;
  const maxIterations = remainingBoxes.length * 2 + 10;

  while (remainingBoxes.length > 0 && safetyCounter < maxIterations) {
    safetyCounter++;
    // Start a new pallet if none exists or if we explicitly need to
    if (palletLoads.length === 0) {
      palletLoads.push(createEmptyPalletLoad(pallet));
    }

    let currentPalletLoad = palletLoads[palletLoads.length - 1];
    let boxPlacedOnCurrentPallet = false;

    // Try to place as many boxes as possible on the current pallet
    // We iterate through remaining boxes and try to fit each one
    let i = 0;
    while (i < remainingBoxes.length) {
      const box = remainingBoxes[i];
      const bestPos = findBestPosition(box, currentPalletLoad, pallet, palletUsableHeight, remainingBoxes.length);

      if (bestPos) {
        // Place the box
        const packedBox: PackedBox = {
          ...box,
          x: bestPos.x,
          y: bestPos.y,
          z: bestPos.z,
          length: bestPos.l,
          width: bestPos.w,
          supportArea: 1.0,
          isStable: true
        };
        currentPalletLoad.boxes.push(packedBox);
        currentPalletLoad.weight += (box.weight || 0);
        
        // Update pallet stats
        updatePalletStats(currentPalletLoad, pallet, palletUsableHeight);
        
        remainingBoxes.splice(i, 1);
        boxPlacedOnCurrentPallet = true;
        // Don't increment i, as we removed an element
      } else {
        i++;
      }
    }

    // If we couldn't place ANY box on the current pallet, and we still have boxes,
    // we MUST start a new pallet.
    if (!boxPlacedOnCurrentPallet && remainingBoxes.length > 0) {
      // If the current pallet is empty and we still can't place a box, 
      // it means the box is too big or too heavy for an empty pallet.
      // We must skip it to avoid infinite loop.
      if (currentPalletLoad.boxes.length === 0) {
        console.warn("Box too large or heavy for pallet, skipping:", remainingBoxes[0]);
        remainingBoxes.shift();
      } else {
        palletLoads.push(createEmptyPalletLoad(pallet));
      }
    }
  }

  return { pallets: palletLoads, totalPalletsNeeded: palletLoads.length, palletUsableHeight };
}

function createEmptyPalletLoad(pallet: Pallet): PalletLoad {
  return {
    boxes: [],
    weight: pallet.emptyWeight,
    volumeUtilization: 0,
    floorAreaUtilization: 0,
    layerCount: 0,
    loadDimensions: { length: pallet.length, width: pallet.width, height: pallet.height },
    isStable: true,
    warnings: []
  };
}

function updatePalletStats(load: PalletLoad, pallet: Pallet, usableHeight: number) {
  if (load.boxes.length === 0) return;

  const maxHeight = Math.max(...load.boxes.map(b => b.z + b.height));
  load.loadDimensions.height = pallet.height + maxHeight;
  
  const boxVolume = load.boxes.reduce((sum, b) => sum + (b.length * b.width * b.height), 0);
  const palletVolume = pallet.length * pallet.width * usableHeight;
  load.volumeUtilization = boxVolume / palletVolume;

  // Floor area utilization (base layer)
  const baseBoxes = load.boxes.filter(b => b.z === 0);
  const baseArea = baseBoxes.reduce((sum, b) => sum + (b.length * b.width), 0);
  load.floorAreaUtilization = baseArea / (pallet.length * pallet.width);

  // Layer count
  const uniqueZ = new Set(load.boxes.map(b => b.z));
  load.layerCount = uniqueZ.size;

  const stability = evaluatePalletStability(load.boxes, pallet);
  load.stabilityScore = stability.score;
  load.isStable = stability.isStable;
  load.warnings = stability.warnings;
}

interface Position {
  x: number;
  y: number;
  z: number;
  l: number;
  w: number;
  score: number;
}

 /**
 * Finds the best valid position for a box on the current pallet.
 * Prioritizes: Lower Z, Adjacency, Floor Coverage.
 */
function findBestPosition(box: PackedBox, load: PalletLoad, pallet: Pallet, usableHeight: number, remainingCount: number): Position | null {
  if (load.weight + (box.weight || 0) > pallet.maxWeight) return null;

  const candidates: Position[] = [];
  const orientations = [
    { l: box.length, w: box.width },
    { l: box.width, w: box.length }
  ];

  // Logic to determine if this box should be centered or forced to corners
  // Only center if it's a "remainder" (won't complete a full layer)
  const boxesPerLayer = Math.max(1, Math.floor((pallet.length * pallet.width) / (box.length * box.width)));
  const totalOnPallet = load.boxes.length + remainingCount;
  const fullLayersCount = Math.floor(totalOnPallet / boxesPerLayer);
  const fullLayerBoxes = fullLayersCount * boxesPerLayer;
  const currentIndex = load.boxes.length + 1;
  
  // If this box is part of a full layer, we hug corners/edges. 
  // If it's a remainder box, we center it.
  const shouldCenter = currentIndex > fullLayerBoxes;

  // Candidate Z levels
  const zLevels = Array.from(new Set([0, ...load.boxes.map(b => b.z + b.height)]))
    .filter(z => z + box.height <= usableHeight)
    .sort((a, b) => a - b);

  for (const z of zLevels) {
    // Generate candidate (x, y) coordinates
    const baseCoordsX = [0, ...load.boxes.map(b => b.x), ...load.boxes.map(b => b.x + b.length)];
    const baseCoordsY = [0, ...load.boxes.map(b => b.y), ...load.boxes.map(b => b.y + b.width)];
    
    // Add centered coordinates ONLY if we decided to center OR for upper layers (original intent was stability)
    // But we restrict it based on user request "only if remainder"
    if (z > 0 || shouldCenter) {
      orientations.forEach(orient => {
        baseCoordsX.push((pallet.length - orient.l) / 2);
        baseCoordsY.push((pallet.width - orient.w) / 2);
      });
    }

    const xCoords = Array.from(new Set(baseCoordsX.map(v => Math.max(0, Math.min(pallet.length, v)))))
      .filter(x => x < pallet.length)
      .sort((a, b) => a - b);
    const yCoords = Array.from(new Set(baseCoordsY.map(v => Math.max(0, Math.min(pallet.width, v)))))
      .filter(y => y < pallet.width)
      .sort((a, b) => a - b);

    for (const x of xCoords) {
      for (const y of yCoords) {
        for (const orient of orientations) {
          if (x + orient.l > pallet.length || y + orient.w > pallet.width) continue;
          if (isColliding(x, y, z, orient.l, orient.w, box.height, load.boxes)) continue;
          if (!hasFullSupport(x, y, orient.l, orient.w, z, load.boxes)) continue;

          const score = calculatePositionScore(x, y, z, orient.l, orient.w, box.height, load, pallet, box, shouldCenter);
          candidates.push({ x, y, z, l: orient.l, w: orient.w, score });
        }
      }
    }
    
    if (candidates.length > 0) break; 
  }

  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.score - a.score)[0];
}

function calculatePositionScore(x: number, y: number, z: number, l: number, w: number, h: number, load: PalletLoad, pallet: Pallet, box: PackedBox, shouldCenter: boolean): number {
  let score = 0;

  // 1. Z-layer priority (Lower is strictly better)
  score -= z * 100;

  const centerX = pallet.length / 2;
  const centerY = pallet.width / 2;
  const boxCenterX = x + l / 2;
  const boxCenterY = y + w / 2;
  const distFromCenter = Math.sqrt(Math.pow(boxCenterX - centerX, 2) + Math.pow(boxCenterY - centerY, 2));

  if (z === 0 || !shouldCenter) {
    // NORMAL PACKING: Corner Hugging & Edge Alignment
    // We want to pack tightly from (0,0) to ensure more boxes fit
    const isAtLeft = Math.abs(x) < 2;
    const isAtBottom = Math.abs(y) < 2;
    const isAtRight = Math.abs(x + l - pallet.length) < 2;
    const isAtTop = Math.abs(y + w - pallet.width) < 2;

    if (isAtLeft || isAtRight) score += 500;
    if (isAtBottom || isAtTop) score += 500;
    
    // Huge bonus for corners
    if ((isAtLeft || isAtRight) && (isAtBottom || isAtTop)) {
      score += 1000;
    }

    // Penalize secondary distance from origin to avoid "scattered" base
    score -= (x + y) * 2;
    // Small penalty for being away from center even in corner mode to prefer "central" corners if possible
    score -= distFromCenter * 0.1;
  } else {
    // REMAINDER PACKING: Stability & Centering
    // For boxes that don't make a full layer, centering is essential
    const weightFactor = Math.max(1, (box.weight || 10) / 10);
    score -= distFromCenter * weightFactor * 50; // High centering priority

    // Bonus for touching existing boxes on the same layer
    const epsilon = 1.0;
    load.boxes.forEach(b => {
      if (Math.abs(b.z - z) < epsilon) {
        const touchX = (Math.abs(x - (b.x + b.length)) < epsilon || Math.abs(x + l - b.x) < epsilon) && 
                       (Math.max(y, b.y) < Math.min(y + w, b.y + b.width));
        const touchY = (Math.abs(y - (b.y + b.width)) < epsilon || Math.abs(y + w - b.y) < epsilon) && 
                       (Math.max(x, b.x) < Math.min(x + l, b.x + b.length));
        if (touchX || touchY) score += 200;
      }
    });
  }

  return score;
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

  const maxPartsByWeight = Math.floor((30 - 0.5) / part.weight);
  let targetPartsPerBox = part.orderQuantity > 0 ? Math.min(maxPartsByWeight, part.orderQuantity) : maxPartsByWeight;
  
  if (part.fixedPartsPerBox !== undefined && part.fixedPartsPerBox > 0) {
    targetPartsPerBox = Math.min(part.fixedPartsPerBox, maxPartsByWeight);
  } else if (part.targetBoxCount !== undefined && part.targetBoxCount > 0 && part.orderQuantity > 0) {
    targetPartsPerBox = Math.ceil(part.orderQuantity / part.targetBoxCount);
    targetPartsPerBox = Math.min(targetPartsPerBox, maxPartsByWeight);
  }

  // Professional Box Scoring: Modularity + Utilization + Stability
  const scoreBox = (box: Container, boxFit: any) => {
    const boxVolume = box.length * box.width * box.height;
    const partVolume = part.length * part.width * part.height;
    const boxVolumeUtilization = (boxFit.count * partVolume) / boxVolume;
    
    let score = boxVolumeUtilization * 100;
    
    // Modularity: Footprint compatibility with pallet
    if (shippingMethod === 'pallet') {
      const modL = (pallet.length % box.length < 20 || pallet.length % box.width < 20) ? 30 : 0;
      const modW = (pallet.width % box.width < 20 || pallet.width % box.length < 20) ? 30 : 0;
      score += modL + modW;
      
      // Prefer footprints that are sub-multiples of pallet dimensions
      if (Math.abs(pallet.length / box.length - Math.round(pallet.length / box.length)) < 0.05) score += 20;
      if (Math.abs(pallet.width / box.width - Math.round(pallet.width / box.width)) < 0.05) score += 20;
    }

    // Target fill rate (85% is ideal for protection + efficiency)
    const fillDiff = Math.abs(boxVolumeUtilization - 0.85);
    score -= fillDiff * 300; // Increased penalty for deviation from 85%
    
    // Bonus for being within the "goldilocks" zone (82% - 88%)
    if (boxVolumeUtilization >= 0.82 && boxVolumeUtilization <= 0.88) {
      score += 100;
    }
    
    // Quantity matching
    if (boxFit.count === targetPartsPerBox) score += 50;
    else score -= Math.abs(boxFit.count - targetPartsPerBox) * 10;

    // Stability: Prefer lower height-to-base ratio for boxes
    const baseArea = box.length * box.width;
    const aspect = box.height / Math.sqrt(baseArea);
    if (aspect > 1.5) score -= 20; // Too tall/unstable
    
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
      maxWeight: 30,
      emptyWeight: boxWeight,
      weight: boxWeight
    };
    
    const usableBox = {
      length: Math.max(0, testBox.length - 20),
      width: Math.max(0, testBox.width - 20),
      height: Math.max(0, testBox.height - 20)
    };
    const boxFit = calculateMaxFit(part, usableBox, false, targetPartsPerBox);
    const score = scoreBox(testBox, boxFit);
    
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
    // Try increasing quantities to reach 85% utilization
    for (let nx = 1; nx <= 12; nx++) {
      for (let ny = 1; ny <= 12; ny++) {
        for (let nz = 1; nz <= 12; nz++) {
          const count = nx * ny * nz;
          
          // Don't suggest counts that are way beyond what we need or exceed weight
          if (count > targetPartsPerBox * 1.5 && count > 10) continue;
          
          const stackL = nx * pl;
          const stackW = ny * pw;
          const stackH = nz * ph;
          
          // 10mm clearance on each side = 20mm total padding
          let boxL = Math.round(stackL + 20);
          let boxW = Math.round(stackW + 20);
          let boxH = Math.round(stackH + 20);
          
          if (boxL < 50 || boxW < 50 || boxH < 50) continue;
          if (boxL > 800 || boxW > 800 || boxH > 800) continue;
          if (boxH > palletUsableHeight) continue;
          if (boxL > pallet.length || boxW > pallet.width) continue;
          
          const totalWeight = count * part.weight;
          if (totalWeight > 35) continue;

          // Target fill rate (85% is ideal)
          const boxVol = boxL * boxW * boxH;
          const contentVol = count * part.length * part.width * part.height;
          const fillRate = contentVol / boxVol;
          
          const testBox: Container = {
            id: 'test-custom',
            name: 'Custom',
            length: boxL,
            width: boxW,
            height: boxH,
            maxWeight: 35,
            emptyWeight: 0.5,
            weight: 0.5
          };
          
          const usableBox = {
            length: Math.max(0, boxL - 20),
            width: Math.max(0, boxW - 20),
            height: Math.max(0, boxH - 20)
          };
          const boxFit = calculateMaxFit(part, usableBox, false, targetPartsPerBox);
          let score = scoreBox(testBox, boxFit);
          
          // Target 85% exactly - heavy penalty for deviation
          const fillRateDiff = Math.abs(fillRate - 0.85);
          score -= fillRateDiff * 600; // Even heavier penalty for custom boxes
          
          if (fillRate >= 0.83 && fillRate <= 0.87) {
            score += 150;
          }

          if (score > bestScore) {
            bestScore = score;
            bestBox = {
              ...testBox,
              id: `custom-${Date.now()}`,
              name: `BC ${boxL}x${boxW}x${boxH}`,
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
    const details = getBoxPackingDetails(item.part, item.box, item.quantity);
    totalBoxesNeeded += details.totalBoxesNeeded;
    totalPartVolume += item.part.length * item.part.width * item.part.height * item.quantity;
    totalBoxVolume += item.box.length * item.box.width * item.box.height * details.totalBoxesNeeded;

    const itemColor = ['#fef3c7', '#dbeafe', '#d1fae5', '#ffedd5', '#f3e8ff', '#fee2e2'][items.indexOf(item) % 6];
    const itemEdgeColor = ['#d97706', '#2563eb', '#059669', '#ea580c', '#7c3aed', '#dc2626'][items.indexOf(item) % 6];

    for (let i = 0; i < details.totalBoxesNeeded; i++) {
      const isLast = i === details.totalBoxesNeeded - 1 && details.isLastBoxDifferent;
      const pCount = isLast ? details.partsInLastBox : details.actualPartsPerBox;
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
    // Return empty result
    return {
      partsPerBox: 0, maxPartsPerBox: 0, boxesPerPallet: 0, totalPartsPerPallet: 0,
      boxWeight: 0, palletWeight: pallet.emptyWeight, boxVolumeUtilization: 0, palletVolumeUtilization: 0,
      orientations: { box: 'N/A', pallet: 'N/A' }, boxGrid: { nx: 0, ny: 0, nz: 0 }, palletGrid: { nx: 0, ny: 0, nz: 0 },
      totalBoxesNeeded: 0, totalPalletsNeeded: 0, boxesPerPalletBalanced: 0, isLastPalletDifferent: false,
      lastPalletBoxes: 0, balancedPalletWeight: pallet.emptyWeight, lastPalletWeight: pallet.emptyWeight,
      partsInLastBox: 0, isLastBoxDifferent: false, loadDimensions: { length: pallet.length, width: pallet.width, height: pallet.height },
      boxes: [], pallets: []
    };
  }

  const { pallets, totalPalletsNeeded, palletUsableHeight } = palletizeBoxes(allPackedBoxes, pallet);
  
  if (pallets.length === 0) {
    return {
      partsPerBox: 0, maxPartsPerBox: 0, boxesPerPallet: 0, totalPartsPerPallet: 0,
      boxWeight: 0, palletWeight: pallet.emptyWeight, boxVolumeUtilization: 0, palletVolumeUtilization: 0,
      orientations: { box: 'N/A', pallet: 'N/A' }, boxGrid: { nx: 0, ny: 0, nz: 0 }, palletGrid: { nx: 0, ny: 0, nz: 0 },
      totalBoxesNeeded, totalPalletsNeeded: 0, boxesPerPalletBalanced: 0, isLastPalletDifferent: false,
      lastPalletBoxes: 0, balancedPalletWeight: pallet.emptyWeight, lastPalletWeight: pallet.emptyWeight,
      partsInLastBox: 0, isLastBoxDifferent: false, loadDimensions: { length: pallet.length, width: pallet.width, height: pallet.height },
      boxes: [], pallets: [], stabilityScore: 1, isStable: true, warnings: []
    };
  }

  const firstPallet = pallets[0];
  const lastPallet = pallets[pallets.length - 1];
  
  const firstPalletWeight = firstPallet.weight;
  const finalPalletWeight = lastPallet.weight;
  const maxHeight = firstPallet.loadDimensions.height - pallet.height;
  
  return {
    partsPerBox: 0, maxPartsPerBox: 0, boxesPerPallet: firstPallet.boxes.length, totalPartsPerPallet: 0,
    boxWeight: 0, palletWeight: firstPalletWeight, boxVolumeUtilization: totalBoxVolume > 0 ? totalPartVolume / totalBoxVolume : 0,
    palletVolumeUtilization: firstPallet.volumeUtilization,
    palletFloorAreaUtilization: firstPallet.floorAreaUtilization,
    layerCount: firstPallet.layerCount,
    orientations: { box: 'Mixed', pallet: 'Layered' }, boxGrid: { nx: 0, ny: 0, nz: 0 }, palletGrid: { nx: 1, ny: 1, nz: 1 },
    totalBoxesNeeded, totalPalletsNeeded, boxesPerPalletBalanced: firstPallet.boxes.length, isLastPalletDifferent: pallets.length > 1,
    lastPalletBoxes: lastPallet.boxes.length, balancedPalletWeight: firstPalletWeight, lastPalletWeight: finalPalletWeight,
    partsInLastBox: 0, isLastBoxDifferent: false, loadDimensions: { length: pallet.length, width: pallet.width, height: pallet.height + maxHeight },
    boxes: firstPallet.boxes, pallets: pallets, stabilityScore: firstPallet.stabilityScore, isStable: firstPallet.isStable, warnings: firstPallet.warnings
  };
}

export function optimizePacking(part: Part, box: Container, pallet: Pallet, totalOrderQuantity: number = 0): PackingResult {
  const details = getBoxPackingDetails(part, box, totalOrderQuantity);
  
  const boxInstance: PackedBox = {
    id: box.id, partName: part.name, length: box.length, width: box.width, height: box.height,
    x: 0, y: 0, z: 0, color: '#fef3c7', edgeColor: '#d97706', name: box.name,
    weight: details.boxTotalWeight, partsCount: details.actualPartsPerBox, isStable: true, supportArea: 1.0
  };

  const allBoxesToPack: PackedBox[] = [];
  for (let i = 0; i < details.totalBoxesNeeded; i++) {
    const isLast = i === details.totalBoxesNeeded - 1 && details.isLastBoxDifferent;
    const pCount = isLast ? details.partsInLastBox : details.actualPartsPerBox;
    const bWeight = (pCount * part.weight) + (box.weight || box.emptyWeight);
    allBoxesToPack.push({ ...boxInstance, weight: bWeight, partsCount: pCount });
  }

  const { pallets, totalPalletsNeeded, palletUsableHeight } = palletizeBoxes(allBoxesToPack, pallet);
  
  if (pallets.length === 0) {
    return {
      partsPerBox: details.actualPartsPerBox, maxPartsPerBox: details.maxPartsPerBox, boxesPerPallet: 0,
      totalPartsPerPallet: 0, boxWeight: details.boxTotalWeight, palletWeight: pallet.emptyWeight,
      boxVolumeUtilization: details.boxVolumeUtilization,
      palletVolumeUtilization: 0,
      palletFloorAreaUtilization: 0,
      layerCount: 0,
      orientations: { box: details.boxOrientation, pallet: 'N/A' }, boxGrid: details.boxGrid, palletGrid: { nx: 0, ny: 0, nz: 0 },
      totalBoxesNeeded: details.totalBoxesNeeded, totalPalletsNeeded: 0, boxesPerPalletBalanced: 0,
      isLastPalletDifferent: false, lastPalletBoxes: 0, balancedPalletWeight: pallet.emptyWeight,
      lastPalletWeight: pallet.emptyWeight, partsInLastBox: details.partsInLastBox, isLastBoxDifferent: details.isLastBoxDifferent,
      loadDimensions: { length: pallet.length, width: pallet.width, height: pallet.height },
      boxes: [], pallets: [], stabilityScore: 1, isStable: true, warnings: []
    };
  }

  const firstPallet = pallets[0];
  const lastPallet = pallets[pallets.length - 1];
  
  const firstPalletWeight = firstPallet.weight;
  const finalPalletWeight = lastPallet.weight;
  const maxHeight = firstPallet.loadDimensions.height - pallet.height;

  const totalPartVolume = part.length * part.width * part.height * totalOrderQuantity;
  const totalBoxVolume = box.length * box.width * box.height * details.totalBoxesNeeded;

  return {
    partsPerBox: details.actualPartsPerBox, maxPartsPerBox: details.maxPartsPerBox, boxesPerPallet: firstPallet.boxes.length,
    totalPartsPerPallet: details.actualPartsPerBox * firstPallet.boxes.length, boxWeight: details.boxTotalWeight, palletWeight: firstPalletWeight,
    boxVolumeUtilization: details.boxVolumeUtilization,
    palletVolumeUtilization: firstPallet.volumeUtilization,
    palletFloorAreaUtilization: firstPallet.floorAreaUtilization,
    layerCount: firstPallet.layerCount,
    orientations: { box: details.boxOrientation, pallet: 'Layered' }, boxGrid: details.boxGrid, palletGrid: { nx: 0, ny: 0, nz: 0 },
    totalBoxesNeeded: details.totalBoxesNeeded, totalPalletsNeeded, boxesPerPalletBalanced: firstPallet.boxes.length,
    isLastPalletDifferent: pallets.length > 1, lastPalletBoxes: lastPallet.boxes.length, balancedPalletWeight: firstPalletWeight,
    lastPalletWeight: finalPalletWeight, partsInLastBox: details.partsInLastBox, isLastBoxDifferent: details.isLastBoxDifferent,
    loadDimensions: { length: pallet.length, width: pallet.width, height: pallet.height + maxHeight },
    boxes: firstPallet.boxes, pallets: pallets, stabilityScore: firstPallet.stabilityScore, isStable: firstPallet.isStable, warnings: firstPallet.warnings
  };
}

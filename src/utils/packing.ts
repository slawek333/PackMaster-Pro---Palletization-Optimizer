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
      const isLastBox = i === sim.result.totalBoxesNeeded - 1 && sim.result.isLastBoxDifferent;
      const boxWeight = isLastBox 
        ? (sim.result.partsInLastBox * sim.part.weight) + sim.box.emptyWeight 
        : sim.result.boxWeight;

      allBoxes.push({
        simulationId: sim.id,
        partName: sim.part.name,
        box: sim.box,
        weight: boxWeight,
        color,
        edgeColor,
        name: sim.box.name
      });
    }
  });

  // Sort by weight descending (heavier at bottom) then by volume descending
  allBoxes.sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return (b.box.length * b.box.width * b.box.height) - (a.box.length * a.box.width * a.box.height);
  });

  // 2. Pack into pallets (Layer-based with support check)
  const pallets: PalletLoad[] = [];
  const palletUsableHeight = pallet.maxHeight - pallet.height;
  const palletLength = pallet.length;
  const palletWidth = pallet.width;
  
  let remainingBoxes = [...allBoxes];
  
  while (remainingBoxes.length > 0) {
    const currentPalletBoxes: PackedBox[] = [];
    let currentWeight = pallet.emptyWeight || 25;
    
    // We'll pack layer by layer
    let currentZ = 0;
    let packedIndices = new Set<number>();
    
    while (currentZ < palletUsableHeight && packedIndices.size < remainingBoxes.length) {
      let layerMaxHeight = 0;
      let currentY = 0;
      let layerPacked = false;
      
      while (currentY < palletWidth) {
        let currentX = 0;
        let rowMaxHeight = 0;
        let rowMaxWidth = 0;
        let rowPacked = false;
        
        for (let i = 0; i < remainingBoxes.length; i++) {
          if (packedIndices.has(i)) continue;
          
          const c = remainingBoxes[i];
          const { box } = c;
          
          if (currentWeight + c.weight > pallet.maxWeight) continue;
          
          // Try orientations
          const orientations = [
            { l: box.length, w: box.width, h: box.height },
            { l: box.width, w: box.length, h: box.height }
          ];
          
          let placed = false;
          for (const orient of orientations) {
            if (currentZ + orient.h <= palletUsableHeight &&
                currentY + orient.w <= palletWidth &&
                currentX + orient.l <= palletLength) {
              
              // Check support if not on the floor
              let supportArea = 1.0;
              if (currentZ > 0) {
                supportArea = calculateSupportArea(currentX, currentY, orient.l, orient.w, currentZ, currentPalletBoxes);
              }
              
              // We require at least 70% support for stability
              if (supportArea >= 0.7) {
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
                  name: c.name,
                  isStable: true,
                  supportArea: supportArea
                });
                
                currentWeight += c.weight;
                packedIndices.add(i);
                currentX += orient.l;
                rowMaxHeight = Math.max(rowMaxHeight, orient.h);
                rowMaxWidth = Math.max(rowMaxWidth, orient.w);
                placed = true;
                rowPacked = true;
                layerPacked = true;
                break;
              }
            }
          }
        }
        
        if (!rowPacked) break;
        currentY += rowMaxWidth;
        layerMaxHeight = Math.max(layerMaxHeight, rowMaxHeight);
        rowPacked = false;
      }
      
      if (!layerPacked) break;
      currentZ += layerMaxHeight;
      layerPacked = false;
    }
    
    if (currentPalletBoxes.length === 0) {
      // If we couldn't pack anything but still have boxes, we might have a problem (e.g. box too big)
      // For now, just break to avoid infinite loop
      break;
    }
    
    // Compaction: push boxes towards (0,0) in each layer to eliminate gaps
    const layers = Array.from(new Set(currentPalletBoxes.map(b => b.z))).sort((a, b) => a - b);
    layers.forEach(z => {
      const layerBoxes = currentPalletBoxes.filter(b => b.z === z);
      // Sort by proximity to origin
      layerBoxes.sort((a, b) => (a.y + a.x) - (b.y + b.x));
      
      layerBoxes.forEach(b => {
        // Push in Y
        let bestY = 0;
        currentPalletBoxes.forEach(other => {
          if (other === b) return;
          // Check if they overlap in X and Z
          const overlapX = (b.x < other.x + other.length && b.x + b.length > other.x);
          const overlapZ = (b.z < other.z + other.height && b.z + b.height > other.z);
          if (overlapX && overlapZ) {
            if (other.y + other.width <= b.y) {
              bestY = Math.max(bestY, other.y + other.width);
            }
          }
        });
        b.y = bestY;

        // Push in X
        let bestX = 0;
        currentPalletBoxes.forEach(other => {
          if (other === b) return;
          // Check if they overlap in Y and Z
          const overlapY = (b.y < other.y + other.width && b.y + b.width > other.y);
          const overlapZ = (b.z < other.z + other.height && b.z + b.height > other.z);
          if (overlapY && overlapZ) {
            if (other.x + other.length <= b.x) {
              bestX = Math.max(bestX, other.x + other.length);
            }
          }
        });
        b.x = bestX;
      });
    });

    // Re-calculate load dimensions after compaction
    let maxLoadX = 0;
    let maxLoadY = 0;
    let maxLoadZ = 0;
    currentPalletBoxes.forEach(b => {
      // Re-calculate support area after compaction
      b.supportArea = calculateSupportArea(b.x, b.y, b.length, b.width, b.z, currentPalletBoxes);
      b.isStable = b.z === 0 || b.supportArea >= 0.7;

      maxLoadX = Math.max(maxLoadX, b.x + b.length);
      maxLoadY = Math.max(maxLoadY, b.y + b.width);
      maxLoadZ = Math.max(maxLoadZ, b.z + b.height);
    });
    
    const offsetX = (pallet.length - maxLoadX) / 2;
    const offsetY = (pallet.width - maxLoadY) / 2;
    currentPalletBoxes.forEach(b => {
      b.x += offsetX;
      b.y += offsetY;
    });

    const stability = evaluatePalletStability(currentPalletBoxes, pallet);

    pallets.push({
      boxes: currentPalletBoxes,
      weight: currentWeight,
      volumeUtilization: 0,
      loadDimensions: {
        length: Math.max(maxLoadX, pallet.length),
        width: Math.max(maxLoadY, pallet.width),
        height: maxLoadZ + pallet.height
      },
      stabilityScore: stability.score,
      isStable: stability.isStable,
      warnings: stability.warnings
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

  const maxPartsByWeight = Math.floor((25 - 0.5) / part.weight);
  const targetPartsPerBox = part.orderQuantity > 0 ? Math.min(maxPartsByWeight, part.orderQuantity) : maxPartsByWeight;

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
      for (const [l, w, h] of orientations) {
        // Try different grid sizes
        for (let nx = 1; nx <= Math.floor((pallet.length + 20) / l); nx++) {
          for (let ny = 1; ny <= Math.floor((pallet.width + 20) / w); ny++) {
            for (let nz = 1; nz <= Math.floor(palletUsableHeight / h); nz++) {
              const count = nx * ny * nz;
              if (count > targetPartsPerBox || count === 0) continue;

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
              
              let effectiveUtilization = result.boxVolumeUtilization;
              let effectivePartsPerPallet = result.totalPartsPerPallet;

              if (part.orderQuantity > 0 && result.partsPerBox > part.orderQuantity) {
                effectiveUtilization = (part.orderQuantity * part.length * part.width * part.height) / (testBox.length * testBox.width * testBox.height);
                effectivePartsPerPallet = part.orderQuantity * result.boxesPerPallet;
              }

              if (effectiveUtilization >= 0.85 || count === targetPartsPerBox) {
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
  // 1. Pack parts into box (Any orientation allowed for parts)
  const boxFit = calculateMaxFit(part, box, false);
  
  // Weight check for box
  let maxPartsPerBox = boxFit.count;
  let boxGrid = { nx: boxFit.nx, ny: boxFit.ny, nz: boxFit.nz };
  const totalPartWeight = maxPartsPerBox * part.weight;
  if (totalPartWeight + box.emptyWeight > box.maxWeight) {
    maxPartsPerBox = Math.floor((box.maxWeight - box.emptyWeight) / part.weight);
  }
  if (part.maxPartsPerBox !== undefined && part.maxPartsPerBox > 0 && maxPartsPerBox > part.maxPartsPerBox) {
    maxPartsPerBox = part.maxPartsPerBox;
  }

  const totalBoxesNeeded = maxPartsPerBox > 0 && totalOrderQuantity > 0 ? Math.ceil(totalOrderQuantity / maxPartsPerBox) : 0;
  
  let actualPartsPerBox = maxPartsPerBox;
  let partsInLastBox = maxPartsPerBox;
  let isLastBoxDifferent = false;

  if (totalOrderQuantity > 0 && totalBoxesNeeded > 0) {
    const baseQuantity = Math.floor(totalOrderQuantity / totalBoxesNeeded);
    const remainder = totalOrderQuantity % totalBoxesNeeded;
    
    if (remainder === 0) {
      actualPartsPerBox = baseQuantity;
      partsInLastBox = baseQuantity;
    } else {
      actualPartsPerBox = baseQuantity + 1;
      partsInLastBox = baseQuantity;
      isLastBoxDifferent = true;
    }
  } else if (totalOrderQuantity > 0) {
    partsInLastBox = totalOrderQuantity % maxPartsPerBox || maxPartsPerBox;
    isLastBoxDifferent = totalOrderQuantity % maxPartsPerBox !== 0;
  }

  // 2. Pack boxes onto pallet
  const palletUsableHeight = pallet.maxHeight - pallet.height;
  // No overhang allowed
  const usablePallet: Dimensions = {
    length: pallet.length,
    width: pallet.width,
    height: palletUsableHeight
  };

  // For pallets, we usually only rotate around vertical axis (length/width swap)
  const palletFit = calculateMaxFit(box, usablePallet, true);
  
  // Weight check for pallet
  let boxesPerPallet = palletFit.count;
  let palletGrid = { nx: palletFit.nx, ny: palletFit.ny, nz: palletFit.nz };
  const boxTotalWeight = (actualPartsPerBox * part.weight) + box.emptyWeight;
  if ((boxesPerPallet * boxTotalWeight) + pallet.emptyWeight > pallet.maxWeight) {
    boxesPerPallet = Math.floor((pallet.maxWeight - pallet.emptyWeight) / boxTotalWeight);
  }

  const totalPartsPerPallet = actualPartsPerBox * boxesPerPallet;
  
  // Utilization
  const partVolume = part.length * part.width * part.height;
  const boxVolume = box.length * box.width * box.height;
  const palletVolume = pallet.length * pallet.width * palletUsableHeight;

  const boxVolumeUtilization = actualPartsPerBox > 0 ? (actualPartsPerBox * partVolume) / boxVolume : 0;
  const palletVolumeUtilization = boxesPerPallet > 0 ? (boxesPerPallet * boxVolume) / palletVolume : 0;

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
  if (boxesPerPallet > 0) {
    const [l, w, h] = palletFit.orientation.split('x').map(Number);
    loadDimensions = {
      length: Math.max(pallet.length, palletGrid.nx * l),
      width: Math.max(pallet.width, palletGrid.ny * w),
      height: pallet.height + (palletGrid.nz * h)
    };
  }

  const [boxL, boxW, boxH] = palletFit.orientation.split('x').map(Number);
  const boxes: PackedBox[] = [];
  for (let z = 0; z < palletGrid.nz; z++) {
    for (let y = 0; y < palletGrid.ny; y++) {
      for (let x = 0; x < palletGrid.nx; x++) {
        if (boxes.length < boxesPerPallet) {
          boxes.push({
            id: box.id,
            simulationId: 'single',
            partName: part.name,
            length: boxL,
            width: boxW,
            height: boxH,
            x: x * boxL,
            y: y * boxW,
            z: z * boxH,
            color: '#dbeafe',
            edgeColor: '#2563eb',
            name: box.name,
            isStable: true,
            supportArea: 1.0
          });
        }
      }
    }
  }
  const stability = evaluatePalletStability(boxes, pallet);

  return {
    partsPerBox: actualPartsPerBox,
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
    loadDimensions,
    stabilityScore: stability.score,
    isStable: stability.isStable,
    warnings: stability.warnings
  };
}

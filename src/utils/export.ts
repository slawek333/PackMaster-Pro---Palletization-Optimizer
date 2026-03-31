import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { PackingResult, Part, Container, Pallet, Simulation, SessionResult, PalletLoad } from '../types';

function generateBoxVisualization(part: Part, box: Container, result: PackingResult, isLastBox: boolean): string {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const partsToDraw = isLastBox ? result.partsInLastBox : result.partsPerBox;
  const [partL, partW, partH] = result.orientations.box.split('x').map(Number);
  const { nx, ny, nz } = result.boxGrid;

  // We need to draw 'nz' layers.
  const cols = Math.ceil(Math.sqrt(nz));
  const rows = Math.ceil(nz / cols);

  const padding = 40;
  const availableWidth = (canvas.width - padding * (cols + 1)) / cols;
  const availableHeight = (canvas.height - padding * (rows + 1) - 60) / rows; // 60 for title

  const scale = Math.min(availableWidth / box.length, availableHeight / box.width);

  ctx.fillStyle = '#000000';
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center';
  
  let title = '';
  if (isLastBox) {
    title = `Ostatni karton (${partsToDraw} szt.) - ${part.name}`;
  } else if (result.isLastBoxDifferent) {
    title = `Pierwszy karton (${partsToDraw} szt.) - ${part.name}`;
  } else {
    title = `Wszystkie kartony (${partsToDraw} szt.) - ${part.name}`;
  }
  
  ctx.fillText(title, canvas.width / 2, 40);

  let partsDrawn = 0;

  for (let z = 0; z < nz; z++) {
    const col = z % cols;
    const row = Math.floor(z / cols);

    const startX = padding + col * (availableWidth + padding) + (availableWidth - box.length * scale) / 2;
    const startY = 80 + row * (availableHeight + padding) + (availableHeight - box.width * scale) / 2;

    // Draw box outline
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(startX, startY, box.length * scale, box.width * scale);

    ctx.fillStyle = '#000000';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Warstwa ${z + 1}`, startX + (box.length * scale) / 2, startY - 10);

    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        if (partsDrawn >= partsToDraw) break;

        const partX = startX + x * partL * scale;
        const partY = startY + y * partW * scale;

        ctx.fillStyle = '#dbeafe';
        ctx.fillRect(partX, partY, partL * scale, partW * scale);
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 1;
        ctx.strokeRect(partX, partY, partL * scale, partW * scale);

        // Draw part name
        ctx.fillStyle = '#1e3a8a';
        
        let fontSize = 14;
        ctx.font = `${fontSize}px sans-serif`;
        let textWidth = ctx.measureText(part.name).width;
        while (textWidth > partL * scale - 10 && fontSize > 8) {
          fontSize--;
          ctx.font = `${fontSize}px sans-serif`;
          textWidth = ctx.measureText(part.name).width;
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (fontSize >= 8 && textWidth <= partL * scale - 4) {
           ctx.fillText(part.name, partX + (partL * scale) / 2, partY + (partW * scale) / 2);
        } else {
           ctx.font = '8px sans-serif';
           let truncated = part.name;
           while (ctx.measureText(truncated + '...').width > partL * scale - 4 && truncated.length > 0) {
             truncated = truncated.slice(0, -1);
           }
           if (truncated.length > 0) {
             ctx.fillText(truncated + '...', partX + (partL * scale) / 2, partY + (partW * scale) / 2);
           }
        }

        partsDrawn++;
      }
    }
  }

  return canvas.toDataURL('image/png');
}

export async function exportToExcel(
  part: Part, 
  box: Container, 
  pallet: Pallet, 
  result: PackingResult, 
  totalOrder: number,
  palletImage?: string,
  boxImage?: string,
  simulations?: Simulation[],
  sessionResult?: SessionResult | null,
  shippingMethod: 'pallet' | 'courier' = 'pallet',
  projectNumber?: string
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Packing Report');

  // Title
  worksheet.mergeCells('A1:E1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = shippingMethod === 'courier' ? 'COURIER PACKING REPORT' : 'PALLET PACKING REPORT';
  titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: shippingMethod === 'courier' ? 'FF2563EB' : 'FF059669' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 30;

  worksheet.addRow(['Generated on', new Date().toLocaleString()]);
  worksheet.addRow(['Shipping Method', shippingMethod.toUpperCase()]);
  if (projectNumber) {
    worksheet.addRow(['Project Number', projectNumber]);
  }
  worksheet.addRow([]);

  // Helper to add section headers
  const addSectionHeader = (title: string) => {
    const row = worksheet.addRow([title]);
    row.font = { size: 12, bold: true, color: { argb: 'FF1F2937' } };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    worksheet.mergeCells(`A${row.number}:E${row.number}`);
    return row;
  };

  // Helper to add table headers
  const addTableHeader = (headers: string[]) => {
    const row = worksheet.addRow(headers);
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4B5563' } };
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    return row;
  };

  // Helper to add data row
  const addDataRow = (data: any[]) => {
    const row = worksheet.addRow(data);
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });
    return row;
  };

  const isSession = simulations && simulations.length > 0 && sessionResult;
  const sims = isSession ? simulations : [{ id: '1', part, box, quantity: totalOrder, result }];
  
  let palletsData: PalletLoad[] = [];
  if (shippingMethod === 'pallet') {
    if (isSession && sessionResult) {
      palletsData = sessionResult.pallets;
    } else {
      // Generate pallets data for single simulation
      const fullPallets = result.totalPalletsNeeded - (result.isLastPalletDifferent ? 1 : 0);
      
      // Estimate height of a full pallet
      const boxDims = result.orientations.pallet.split('x').map(Number);
      const estimatedHeight = pallet.height + (boxDims[2] || box.height) * (result.boxesPerPallet / (boxDims[0] ? Math.floor(pallet.length / boxDims[0]) * Math.floor(pallet.width / boxDims[1]) : 1));

      for (let i = 0; i < fullPallets; i++) {
        palletsData.push({
          boxes: Array(result.boxesPerPalletBalanced).fill({ partName: part.name, simulationId: '1' }),
          weight: result.balancedPalletWeight,
          volumeUtilization: result.palletVolumeUtilization,
          loadDimensions: result.loadDimensions
        });
      }
      if (result.isLastPalletDifferent && result.lastPalletBoxes > 0) {
        // Calculate height for the last pallet based on the number of layers
        const [l, w, h] = result.orientations.pallet.split('x').map(Number);
        const boxesPerLayer = result.palletGrid.nx * result.palletGrid.ny;
        const layers = Math.ceil(result.lastPalletBoxes / boxesPerLayer);
        const lastPalletHeight = pallet.height + (layers * h);

        palletsData.push({
          boxes: Array(result.lastPalletBoxes).fill({ partName: part.name, simulationId: '1' }),
          weight: result.lastPalletWeight,
          volumeUtilization: result.palletVolumeUtilization * (result.lastPalletBoxes / result.boxesPerPalletBalanced),
          loadDimensions: { length: result.loadDimensions.length, width: result.loadDimensions.width, height: lastPalletHeight }
        });
      }
    }
  }

  // 1. Boxes to order from supplier
  addSectionHeader('1. BOXES TO ORDER (SUPPLIER)');
  addTableHeader(['Box Name', 'Dimensions (L x W x H) mm', 'Quantity Needed']);
  
  const boxOrders = new Map<string, { dims: string, qty: number }>();
  sims.forEach(sim => {
    const key = `${sim.box.name}-${sim.box.length}x${sim.box.width}x${sim.box.height}`;
    if (!boxOrders.has(key)) {
      boxOrders.set(key, { 
        dims: `${sim.box.length} x ${sim.box.width} x ${sim.box.height}`, 
        qty: 0 
      });
    }
    boxOrders.get(key)!.qty += sim.result.totalBoxesNeeded;
  });

  boxOrders.forEach((data, nameKey) => {
    const name = nameKey.split('-')[0];
    addDataRow([name, data.dims, data.qty]);
  });
  worksheet.addRow([]);

  let sectionCounter = 2;

  // 2. Pallets to order (Only for pallet shipping)
  if (shippingMethod === 'pallet') {
    addSectionHeader(`${sectionCounter}. PALLETS TO ORDER`);
    addTableHeader(['Pallet Type', 'Dimensions (L x W x H) mm', 'Quantity Needed']);
    addDataRow([
      pallet.name, 
      `${pallet.length} x ${pallet.width} x ${pallet.height}`, 
      palletsData.length
    ]);
    worksheet.addRow([]);
    sectionCounter++;
  }

  // 3. Boxes with parts (Dimensions and Weight)
  addSectionHeader(`${sectionCounter}. PACKED BOXES DETAILS`);
  addTableHeader(['Part Name', 'Box Name', 'Dimensions (mm)', 'Gross Weight (kg)', 'Parts per Box', 'Total Boxes']);
  
  let totalBoxesWeight = 0;
  let totalBoxesCount = 0;

  sims.forEach(sim => {
    const fullBoxes = Math.floor(sim.quantity / sim.result.partsPerBox);
    const partsInLast = sim.quantity % sim.result.partsPerBox;
    const lastBoxWeight = partsInLast > 0 ? (partsInLast * sim.part.weight + sim.box.emptyWeight) : 0;
    const simTotalWeight = (fullBoxes * sim.result.boxWeight) + lastBoxWeight;
    
    totalBoxesWeight += simTotalWeight;
    totalBoxesCount += sim.result.totalBoxesNeeded;

    if (fullBoxes > 0) {
      addDataRow([
        sim.part.name,
        sim.box.name,
        `${sim.box.length} x ${sim.box.width} x ${sim.box.height}`,
        sim.result.boxWeight.toFixed(2),
        sim.result.partsPerBox,
        fullBoxes
      ]);
    }
    
    if (partsInLast > 0) {
      addDataRow([
        `${sim.part.name} (Last Box)`,
        sim.box.name,
        `${sim.box.length} x ${sim.box.width} x ${sim.box.height}`,
        lastBoxWeight.toFixed(2),
        partsInLast,
        1
      ]);
    }
  });
  worksheet.addRow([]);
  sectionCounter++;

  // 4. Pallets Details (Grouped) - Only for pallet shipping
  if (shippingMethod === 'pallet') {
    addSectionHeader(`${sectionCounter}. PALLET LOAD DETAILS`);
    addTableHeader(['Pallet(s)', 'Dimensions (L x W x H) mm', 'Gross Weight (kg)', 'Total Boxes', 'Parts & Quantities']);
    
    // Group identical pallets
    const groupedPallets = new Map<string, { count: number, indices: number[], pallet: PalletLoad, partsStr: string }>();
    
    palletsData.forEach((p, index) => {
      const dims = p.loadDimensions ? `${Math.round(p.loadDimensions.length)}x${Math.round(p.loadDimensions.width)}x${Math.round(p.loadDimensions.height)}` : 'N/A';
      const weight = p.weight.toFixed(1);
      const boxCount = p.boxes.length;
      
      // Count parts per pallet
      const partCounts: { [key: string]: number } = {};
      p.boxes.forEach(c => {
        const sim = sims.find(s => s.id === c.simulationId);
        const partsInBox = sim ? sim.result.partsPerBox : result.partsPerBox;
        partCounts[c.partName] = (partCounts[c.partName] || 0) + partsInBox;
      });
      
      const partsStr = Object.entries(partCounts).map(([name, qty]) => `${name} (${qty} pcs)`).sort().join('\n');
      
      const signature = `${dims}-${weight}-${boxCount}-${partsStr}`;
      
      if (!groupedPallets.has(signature)) {
        groupedPallets.set(signature, { count: 0, indices: [], pallet: p, partsStr });
      }
      const group = groupedPallets.get(signature)!;
      group.count++;
      group.indices.push(index + 1);
    });

    Array.from(groupedPallets.values()).forEach(group => {
      let indicesStr = '';
      if (group.indices.length === 1) {
        indicesStr = `Pallet ${group.indices[0]}`;
      } else {
        let consecutive = true;
        for (let i = 1; i < group.indices.length; i++) {
          if (group.indices[i] !== group.indices[i-1] + 1) {
            consecutive = false;
            break;
          }
        }
        if (consecutive) {
          indicesStr = `Pallets ${group.indices[0]}-${group.indices[group.indices.length - 1]}`;
        } else {
          indicesStr = `Pallets ${group.indices.join(', ')}`;
        }
      }
        
      const p = group.pallet;
      const dims = p.loadDimensions ? `${Math.round(p.loadDimensions.length)} x ${Math.round(p.loadDimensions.width)} x ${Math.round(p.loadDimensions.height)}` : 'N/A';

      const row = addDataRow([
        indicesStr,
        dims,
        p.weight.toFixed(2),
        p.boxes.length,
        group.partsStr
      ]);
      row.height = 15 * Math.max(1, group.partsStr.split('\n').length);
    });

    worksheet.addRow([]);
    sectionCounter++;
  }

  // 5. Shipment Summary
  addSectionHeader(`${sectionCounter}. SHIPMENT SUMMARY`);
  if (shippingMethod === 'pallet') {
    const totalShipmentWeight = palletsData.reduce((sum, p) => sum + p.weight, 0);
    addTableHeader(['Total Pallets', 'Total Boxes', 'Total Shipment Weight (kg)']);
    addDataRow([
      palletsData.length,
      totalBoxesCount,
      totalShipmentWeight.toFixed(2)
    ]);
  } else {
    addTableHeader(['Total Boxes', 'Total Shipment Weight (kg)']);
    addDataRow([
      totalBoxesCount,
      totalBoxesWeight.toFixed(2)
    ]);
  }
  worksheet.addRow([]);
  sectionCounter++;

  // Adjust column widths
  worksheet.columns = [
    { width: 25 },
    { width: 30 },
    { width: 20 },
    { width: 20 },
    { width: 35 },
    { width: 15 }
  ];

  // Add Images
  addSectionHeader(`${sectionCounter}. VISUALIZATIONS`);
  let currentRow = worksheet.lastRow!.number + 1;

  if (palletImage && shippingMethod === 'pallet') {
    const imageId = workbook.addImage({
      base64: palletImage,
      extension: 'png',
    });
    worksheet.addImage(imageId, {
      tl: { col: 0, row: currentRow },
      ext: { width: 600, height: 450 }
    });
    currentRow += 25;
  }

  if (boxImage) {
    const imageId = workbook.addImage({
      base64: boxImage,
      extension: 'png',
    });
    worksheet.addImage(imageId, {
      tl: { col: 0, row: currentRow },
      ext: { width: 600, height: 450 }
    });
    currentRow += 25;
  }

  for (const sim of sims) {
    const firstBoxImg = generateBoxVisualization(sim.part, sim.box, sim.result, false);
    if (firstBoxImg) {
      const imageId = workbook.addImage({
        base64: firstBoxImg,
        extension: 'png',
      });
      worksheet.addImage(imageId, {
        tl: { col: 0, row: currentRow },
        ext: { width: 600, height: 450 }
      });
      currentRow += 25;
    }

    if (sim.result.isLastBoxDifferent) {
      const lastBoxImg = generateBoxVisualization(sim.part, sim.box, sim.result, true);
      if (lastBoxImg) {
        const imageId = workbook.addImage({
          base64: lastBoxImg,
          extension: 'png',
        });
        worksheet.addImage(imageId, {
          tl: { col: 0, row: currentRow },
          ext: { width: 600, height: 450 }
        });
        currentRow += 25;
      }
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const prefix = projectNumber ? `${projectNumber}_` : '';
  const fileName = isSession ? `${prefix}Consolidated_${shippingMethod}_Report.xlsx` : `${prefix}${shippingMethod}_Report_${part.name.replace(/\s+/g, '_')}.xlsx`;
  saveAs(blob, fileName);
}

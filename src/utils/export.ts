import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { PackingResult, Part, Container, Pallet, Simulation, SessionResult, PalletLoad } from '../types';

export async function exportToExcel(
  part: Part, 
  box: Container, 
  pallet: Pallet, 
  result: PackingResult, 
  totalOrder: number,
  palletImage?: string,
  boxImage?: string,
  simulations?: Simulation[],
  sessionResult?: SessionResult | null
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Packing Report');

  // Title
  worksheet.mergeCells('A1:E1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'PACKING OPTIMIZATION REPORT';
  titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 30;

  worksheet.addRow(['Generated on', new Date().toLocaleString()]);
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
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6B7280' } };
    return row;
  };

  const isSession = simulations && simulations.length > 0 && sessionResult;
  const sims = isSession ? simulations : [{ id: '1', part, box, quantity: totalOrder, result }];
  
  let palletsData: PalletLoad[] = [];
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

  // 1. Boxes to order from supplier
  addSectionHeader('1. BOXS TO ORDER (SUPPLIER)');
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
    worksheet.addRow([name, data.dims, data.qty]);
  });
  worksheet.addRow([]);

  // 2. Pallets to order
  addSectionHeader('2. PALLETS TO ORDER');
  addTableHeader(['Pallet Type', 'Dimensions (L x W x H) mm', 'Quantity Needed']);
  worksheet.addRow([
    pallet.name, 
    `${pallet.length} x ${pallet.width} x ${pallet.height}`, 
    palletsData.length
  ]);
  worksheet.addRow([]);

  // 3. Boxes with parts (Dimensions and Weight)
  addSectionHeader('3. PACKED BOXS DETAILS');
  addTableHeader(['Part Name', 'Box Name', 'Dimensions (mm)', 'Gross Weight (kg)', 'Parts per Box']);
  sims.forEach(sim => {
    worksheet.addRow([
      sim.part.name,
      sim.box.name,
      `${sim.box.length} x ${sim.box.width} x ${sim.box.height}`,
      sim.result.boxWeight.toFixed(2),
      sim.result.partsPerBox
    ]);
  });
  worksheet.addRow([]);

  // 4. Pallets Details (Grouped)
  addSectionHeader('4. PALLET LOAD DETAILS');
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

    const row = worksheet.addRow([
      indicesStr,
      dims,
      p.weight.toFixed(2),
      p.boxes.length,
      group.partsStr
    ]);
    row.height = 15 * Math.max(1, group.partsStr.split('\n').length);
    row.alignment = { wrapText: true, vertical: 'middle' };
  });

  worksheet.addRow([]);

  // 5. Shipment Summary
  const totalShipmentWeight = palletsData.reduce((sum, p) => sum + p.weight, 0);
  addSectionHeader('5. SHIPMENT SUMMARY');
  addTableHeader(['Total Pallets', 'Total Shipment Weight (kg)']);
  worksheet.addRow([
    palletsData.length,
    totalShipmentWeight.toFixed(2)
  ]);
  worksheet.addRow([]);

  // Adjust column widths
  worksheet.columns = [
    { width: 25 },
    { width: 30 },
    { width: 20 },
    { width: 20 },
    { width: 35 }
  ];

  // Add Images
  if (palletImage || boxImage) {
    addSectionHeader('5. VISUALIZATIONS');
    const startRow = worksheet.lastRow!.number + 1;

    if (palletImage) {
      const imageId = workbook.addImage({
        base64: palletImage,
        extension: 'png',
      });
      worksheet.addImage(imageId, {
        tl: { col: 0, row: startRow },
        ext: { width: 600, height: 450 }
      });
    }

    if (boxImage) {
      const imageId = workbook.addImage({
        base64: boxImage,
        extension: 'png',
      });
      worksheet.addImage(imageId, {
        tl: { col: 0, row: startRow + 25 }, // Place below pallet image
        ext: { width: 600, height: 450 }
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const fileName = isSession ? 'Consolidated_Packing_Report.xlsx' : `Packing_Report_${part.name.replace(/\s+/g, '_')}.xlsx`;
  saveAs(blob, fileName);
}

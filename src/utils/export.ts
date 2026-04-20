import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { PackingResult, Part, Container, Pallet, PalletLoad } from '../types';

export async function downloadImportTemplate() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Parts Import');
  
  worksheet.columns = [
    { header: 'Part Number', key: 'name', width: 20 },
    { header: 'Description', key: 'description', width: 30 },
    { header: 'Length (mm)', key: 'length', width: 15 },
    { header: 'Width (mm)', key: 'width', width: 15 },
    { header: 'Height (mm)', key: 'height', width: 15 },
    { header: 'Weight (kg)', key: 'weight', width: 15 },
    { header: 'Order Quantity', key: 'quantity', width: 15 },
    { header: 'Target Box Count (Optional)', key: 'targetBoxCount', width: 25 },
    { header: 'Fixed Parts Per Box (Optional)', key: 'fixedPartsPerBox', width: 25 }
  ];

  // Add header styling
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4B5563' } };

  worksheet.addRow({
    name: 'Example Part', description: 'Sample description',
    length: 100, width: 50, height: 20, weight: 0.5, quantity: 1000
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, 'DIAM_Import_Template.xlsx');
}

function generateBoxVisualization(part: Part, box: Container, result: PackingResult, isLastBox: boolean): string {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const partsToDraw = isLastBox ? result.partsInLastBox : result.partsPerBox;
  const layout = result.layout;
  const nz = result.boxGrid.nz;

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

  const drawPart = (x: number, y: number, w: number, h: number, name: string) => {
    if (partsDrawn >= partsToDraw) return;

    ctx.fillStyle = '#dbeafe';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    partsDrawn++;
  };

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

    if (layout && layout.type !== 'grid') {
      const { nx1, ny1, nx2, ny2, l, w, h, x, y, type } = layout;
      
      // Block 1
      for (let iy = 0; iy < ny1; iy++) {
        for (let ix = 0; ix < nx1; ix++) {
          drawPart(startX + ix * l * scale, startY + iy * w * scale, l * scale, w * scale, part.name);
        }
      }
      
      // Block 2
      if (type === 'two-block-v') {
        const b2StartX = startX + x! * scale;
        for (let iy = 0; iy < ny2; iy++) {
          for (let ix = 0; ix < nx2; ix++) {
            drawPart(b2StartX + ix * w * scale, startY + iy * l * scale, w * scale, l * scale, part.name);
          }
        }
      } else if (type === 'two-block-h') {
        const b2StartY = startY + y! * scale;
        for (let iy = 0; iy < ny2; iy++) {
          for (let ix = 0; ix < nx2; ix++) {
            drawPart(startX + ix * w * scale, b2StartY + iy * l * scale, w * scale, l * scale, part.name);
          }
        }
      }
    } else {
      const [partL, partW] = result.orientations.box.split('x').map(Number);
      const { nx, ny } = result.boxGrid;
      for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
          drawPart(startX + x * partL * scale, startY + y * partW * scale, partL * scale, partW * scale, part.name);
        }
      }
    }
  }

  return canvas.toDataURL('image/png');
}

export async function exportToExcel(
  items: { part: Part; box: Container; quantity: number; result: PackingResult }[],
  pallet: Pallet,
  shipmentResult: PackingResult,
  palletImages: string[],
  shippingMethod: 'pallet' | 'courier' = 'pallet',
  projectNumber?: string
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Packing Report');

  // Title
  worksheet.mergeCells('A1:F1');
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
    worksheet.mergeCells(`A${row.number}:F${row.number}`);
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

  // 1. BOXES TO ORDER (SUPPLIER)
  addSectionHeader('1. BOXES TO ORDER (SUPPLIER)');
  addTableHeader(['Box Name', 'Dimensions (L x W x H) mm', 'Quantity Needed']);
  
  const boxOrders = new Map<string, { dims: string, qty: number }>();
  items.forEach(item => {
    const key = `${item.box.name}-${item.box.length}x${item.box.width}x${item.box.height}`;
    if (!boxOrders.has(key)) {
      boxOrders.set(key, { 
        dims: `${item.box.length} x ${item.box.width} x ${item.box.height}`, 
        qty: 0 
      });
    }
    boxOrders.get(key)!.qty += item.result.totalBoxesNeeded;
  });

  boxOrders.forEach((data, nameKey) => {
    const name = nameKey.split('-')[0];
    addDataRow([name, data.dims, data.qty]);
  });
  worksheet.addRow([]);

  let sectionCounter = 2;

  // 2. PALLETS TO ORDER
  if (shippingMethod === 'pallet') {
    addSectionHeader(`${sectionCounter}. PALLETS TO ORDER`);
    addTableHeader(['Pallet Type', 'Dimensions (L x W x H) mm', 'Quantity Needed']);
    const palletNameWithDesc = pallet.name + (pallet.description ? `\n(${pallet.description})` : '');
    addDataRow([
      palletNameWithDesc, 
      `${pallet.length} x ${pallet.width} x ${pallet.height}`, 
      shipmentResult.totalPalletsNeeded
    ]);
    worksheet.addRow([]);
    sectionCounter++;
  }

  // 3. PACKED BOXES DETAILS
  addSectionHeader(`${sectionCounter}. PACKED BOXES DETAILS`);
  addTableHeader(['Part Name', 'Box Name', 'Dimensions (mm)', 'Gross Weight (kg)', 'Parts per Box', 'Total Boxes']);
  
  let totalBoxesWeight = 0;
  let totalBoxesCount = 0;

  items.forEach(item => {
    const fullBoxes = Math.floor(item.quantity / item.result.partsPerBox);
    const partsInLast = item.quantity % item.result.partsPerBox;
    const lastBoxWeight = partsInLast > 0 ? (partsInLast * item.part.weight + item.box.emptyWeight) : 0;
    const itemTotalWeight = (fullBoxes * item.result.boxWeight) + lastBoxWeight;
    
    totalBoxesWeight += itemTotalWeight;
    totalBoxesCount += item.result.totalBoxesNeeded;

    const partNameWithDesc = item.part.name + (item.part.description ? `\n(${item.part.description})` : '');
    if (fullBoxes > 0) {
      addDataRow([
        partNameWithDesc,
        item.box.name,
        `${item.box.length} x ${item.box.width} x ${item.box.height}`,
        item.result.boxWeight.toFixed(2),
        item.result.partsPerBox,
        fullBoxes
      ]);
    }
    
    if (partsInLast > 0) {
      addDataRow([
        `${partNameWithDesc} (Last Box)`,
        item.box.name,
        `${item.box.length} x ${item.box.width} x ${item.box.height}`,
        lastBoxWeight.toFixed(2),
        partsInLast,
        1
      ]);
    }
  });
  worksheet.addRow([]);
  sectionCounter++;

  // 4. PALLET LOAD DETAILS
  if (shippingMethod === 'pallet' && shipmentResult.pallets) {
    addSectionHeader(`${sectionCounter}. PALLET LOAD DETAILS`);
    addTableHeader(['Pallet(s)', 'Dimensions (L x W x H) mm', 'Gross Weight (kg)', 'Total Boxes', 'Parts & Quantities']);
    
    // Group identical pallets
    const groupedPallets = new Map<string, { count: number, indices: number[], weight: number, boxes: number, partsStr: string, dims: string }>();
    
    shipmentResult.pallets.forEach((p, index) => {
      const totalHeight = p.loadDimensions.height;
      const dims = `${pallet.length} x ${pallet.width} x ${Math.round(totalHeight)}`;
      
      const palletWeight = p.weight;
      const weightStr = palletWeight.toFixed(1);
      const boxCount = p.boxes.length;
      
      // Count parts per pallet
      const partCounts: { [key: string]: number } = {};
      p.boxes.forEach(b => {
        // We need to know how many parts are in this box. 
        // We can find the item by partName
        const item = items.find(it => it.part.name === b.partName);
        if (item) {
          // If it's a full box, it's item.result.partsPerBox. 
          // But wait, optimizeMixedShipment doesn't distinguish between full and last boxes easily.
          // Let's assume for now it's the standard partsPerBox or we could have stored it in PackedBox.
          // For simplicity, let's just use the name and box count.
          partCounts[b.partName] = (partCounts[b.partName] || 0) + 1; // This is box count, not parts count
        }
      });
      
      const partsStr = Object.entries(partCounts).map(([name, count]) => `${name}: ${count} boxes`).sort().join('\n');
      const signature = `${dims}-${weightStr}-${boxCount}-${partsStr}`;
      
      if (!groupedPallets.has(signature)) {
        groupedPallets.set(signature, { count: 0, indices: [], weight: palletWeight, boxes: boxCount, partsStr, dims });
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

      const row = addDataRow([
        indicesStr,
        group.dims,
        group.weight.toFixed(2),
        group.boxes,
        group.partsStr
      ]);
      row.height = 15 * Math.max(1, group.partsStr.split('\n').length);
    });

    worksheet.addRow([]);
    sectionCounter++;
  }

  // 5. SHIPMENT SUMMARY
  addSectionHeader(`${sectionCounter}. SHIPMENT SUMMARY`);
  if (shippingMethod === 'pallet') {
    const totalShipmentWeight = shipmentResult.pallets?.reduce((sum, p) => sum + p.weight, 0) || 0;
    addTableHeader(['Total Pallets', 'Total Boxes', 'Total Shipment Weight (kg)']);
    addDataRow([
      shipmentResult.totalPalletsNeeded,
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

  // Add ALL pallet images
  if (palletImages && palletImages.length > 0 && shippingMethod === 'pallet') {
    palletImages.forEach((img, idx) => {
      try {
        const imageId = workbook.addImage({
          base64: img,
          extension: 'png',
        });
        worksheet.addRow([`Pallet ${idx + 1} Visualization`]);
        currentRow++;
        worksheet.addImage(imageId, {
          tl: { col: 0, row: currentRow },
          ext: { width: 600, height: 450 }
        });
        currentRow += 25;
      } catch (e) {
        console.error(`Error adding pallet ${idx + 1} image to Excel:`, e);
      }
    });
  }

  // Add 2D Box Schematics
  for (const item of items) {
    const firstBoxImg = generateBoxVisualization(item.part, item.box, item.result, false);
    if (firstBoxImg) {
      try {
        const imageId = workbook.addImage({
          base64: firstBoxImg,
          extension: 'png',
        });
        worksheet.addRow([`Box Packing Schematic: ${item.part.name}`]);
        currentRow++;
        worksheet.addImage(imageId, {
          tl: { col: 0, row: currentRow },
          ext: { width: 600, height: 450 }
        });
        currentRow += 25;
      } catch (e) {
        console.error("Error adding box schematic to Excel:", e);
      }
    }

    if (item.result.isLastBoxDifferent) {
      const lastBoxImg = generateBoxVisualization(item.part, item.box, item.result, true);
      if (lastBoxImg) {
        try {
          const imageId = workbook.addImage({
            base64: lastBoxImg,
            extension: 'png',
          });
          worksheet.addRow([`Last Box Packing Schematic: ${item.part.name}`]);
          currentRow++;
          worksheet.addImage(imageId, {
            tl: { col: 0, row: currentRow },
            ext: { width: 600, height: 450 }
          });
          currentRow += 25;
        } catch (e) {
          console.error("Error adding last box schematic to Excel:", e);
        }
      }
    }
  }

  // Set Page Setup for A4 Printing
  worksheet.pageSetup = {
    paperSize: 9, // A4
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }
  };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const prefix = projectNumber ? `${projectNumber}_` : '';
  const firstPartName = items[0]?.part.name || 'Shipment';
  const fileName = `${prefix}${shippingMethod}_Report_${firstPartName.replace(/\s+/g, '_')}.xlsx`;
  saveAs(blob, fileName);
}

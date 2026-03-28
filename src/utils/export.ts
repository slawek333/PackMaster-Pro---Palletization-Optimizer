import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { PackingResult, Part, Container, Pallet, Simulation, SessionResult } from '../types';

export async function exportToExcel(
  part: Part, 
  carton: Container, 
  pallet: Pallet, 
  result: PackingResult, 
  totalOrder: number,
  palletImage?: string,
  cartonImage?: string,
  simulations?: Simulation[],
  sessionResult?: SessionResult | null
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Packing Report');

  // Title
  worksheet.mergeCells('A1:D1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'PackMaster Pro - Packing Report';
  titleCell.font = { size: 16, bold: true };
  titleCell.alignment = { horizontal: 'center' };

  worksheet.addRow(['Generated on', new Date().toLocaleString()]);
  worksheet.addRow([]);

  const isSession = simulations && simulations.length > 0 && sessionResult;

  if (isSession) {
    // Session Summary
    worksheet.addRow(['SESSION SUMMARY']).font = { bold: true };
    worksheet.addRow(['Total Simulations', simulations.length]);
    worksheet.addRow(['Total Pallets (Mixed)', sessionResult.pallets.length]);
    worksheet.addRow(['Total Cartons', sessionResult.totalCartons]);
    worksheet.addRow(['Total Session Weight (kg)', sessionResult.totalWeight.toFixed(1)]);
    worksheet.addRow(['Overall Volume Utilization', `${(sessionResult.overallUtilization * 100).toFixed(1)}%`]);
    worksheet.addRow([]);

    // Simulations Table
    worksheet.addRow(['SIMULATIONS DETAIL']).font = { bold: true };
    const headerRow = worksheet.addRow(['#', 'Part Name', 'Carton Name', 'Carton Dimensions (mm)', 'Quantity', 'Cartons Needed', 'Parts/Carton', 'Carton Weight (kg)']);
    headerRow.font = { bold: true };
    simulations.forEach((sim, idx) => {
      worksheet.addRow([
        idx + 1,
        sim.part.name,
        sim.carton.name,
        `${sim.carton.length}x${sim.carton.width}x${sim.carton.height}`,
        sim.quantity,
        sim.result.totalCartonsNeeded,
        sim.result.partsPerCarton,
        sim.result.cartonWeight.toFixed(2)
      ]);
    });
    worksheet.addRow([]);

    // Pallet Details
    worksheet.addRow(['PALLET LOADING DETAIL']).font = { bold: true };
    sessionResult.pallets.forEach((p, idx) => {
      worksheet.addRow([
        `Pallet #${idx + 1}`, 
        `Weight: ${p.weight.toFixed(1)} kg`, 
        `Dimensions: ${Math.round(p.loadDimensions.length)}x${Math.round(p.loadDimensions.width)}x${Math.round(p.loadDimensions.height)} mm`,
        `Utilization: ${(p.volumeUtilization * 100).toFixed(1)}%`
      ]);
      const pHeader = worksheet.addRow(['', 'Carton Name', 'Simulation ID', 'Position (X,Y,Z)', 'Dimensions (mm)']);
      pHeader.font = { italic: true };
      p.cartons.forEach(c => {
        worksheet.addRow(['', c.name, c.simulationId, `X:${c.x} Y:${c.y} Z:${c.z}`, `${c.length}x${c.width}x${c.height}`]);
      });
      worksheet.addRow([]);
    });
  } else {
    // Single Simulation Report
    const addSection = (title: string, data: [string, any][]) => {
      const row = worksheet.addRow([title]);
      row.font = { bold: true };
      data.forEach(([label, value]) => {
        worksheet.addRow([label, value]);
      });
      worksheet.addRow([]);
    };

    addSection('Input Data', [
      ['Part Name', part.name],
      ['Part Dimensions (mm)', `${part.length} x ${part.width} x ${part.height}`],
      ['Part Weight (kg)', part.weight],
      ['Total Order Quantity', totalOrder],
    ]);

    addSection('Carton Data', [
      ['Carton Name', carton.name],
      ['Carton Dimensions (mm)', `${carton.length} x ${carton.width} x ${carton.height}`],
      ['Carton Max Weight (kg)', carton.maxWeight],
      ['Carton Empty Weight (kg)', carton.emptyWeight],
    ]);

    addSection('Pallet Data', [
      ['Pallet Name', pallet.name],
      ['Pallet Dimensions (mm)', `${pallet.length} x ${pallet.width}`],
      ['Pallet Max Height (mm)', pallet.maxHeight],
      ['Pallet Max Weight (kg)', pallet.maxWeight],
    ]);

    addSection('Optimization Results', [
      ['Parts per Carton', result.partsPerCarton],
      ['Cartons per Pallet (Max)', result.cartonsPerPallet],
      ['Total Parts per Full Pallet', result.totalPartsPerPallet],
      ['Total Carton Weight (kg)', result.cartonWeight.toFixed(2)],
      ['Full Pallet Weight (kg)', result.palletWeight.toFixed(2)],
      ['Carton Volume Utilization', `${(result.cartonVolumeUtilization * 100).toFixed(1)}%`],
      ['Pallet Volume Utilization', `${(result.palletVolumeUtilization * 100).toFixed(1)}%`],
      ['Best Part Orientation', result.orientations.carton],
      ['Best Carton Orientation', result.orientations.pallet],
    ]);

    addSection('Shipment Summary', [
      ['Total Cartons to Order', result.totalCartonsNeeded],
      ['Parts per Full Carton', result.partsPerCarton],
      ['Parts in Last Carton', result.isLastCartonDifferent ? result.partsInLastCarton : 'N/A (All full)'],
      ['Total Pallets Needed', result.totalPalletsNeeded],
      ['Cartons per Full Pallet', result.cartonsPerPalletBalanced],
      ['Cartons on Last Pallet', result.isLastCartonDifferent ? result.lastPalletCartons : 'N/A (All same)'],
    ]);
  }

  // Add Images
  if (palletImage || cartonImage) {
    worksheet.addRow(['VISUALIZATIONS']).font = { bold: true };
    const startRow = worksheet.lastRow!.number + 1;

    if (palletImage) {
      const imageId = workbook.addImage({
        base64: palletImage,
        extension: 'png',
      });
      worksheet.addImage(imageId, {
        tl: { col: 0, row: startRow },
        ext: { width: 400, height: 300 }
      });
    }

    if (cartonImage) {
      const imageId = workbook.addImage({
        base64: cartonImage,
        extension: 'png',
      });
      worksheet.addImage(imageId, {
        tl: { col: 2, row: startRow },
        ext: { width: 400, height: 300 }
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const fileName = isSession ? 'Consolidated_Packing_Report.xlsx' : `Packing_Report_${part.name.replace(/\s+/g, '_')}.xlsx`;
  saveAs(blob, fileName);
}

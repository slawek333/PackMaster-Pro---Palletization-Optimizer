import { PackingResult, Part, Container, Pallet, PalletLoad } from '../types';
import { saveAs } from 'file-saver';

export function generateEML(
  part: Part,
  box: Container,
  pallet: Pallet,
  result: PackingResult,
  shippingMethod: 'pallet' | 'courier',
  projectNumber?: string,
  deliveryAddress?: string,
  palletImage?: string,
  boxImage?: string,
  lastBoxImage?: string,
  lastPalletImage?: string
): string {
  const subject = `Packing Report - ${projectNumber || 'DIAM'}`;
  const date = new Date().toUTCString();
  
  const sims = [{ id: '1', part, box, quantity: part.orderQuantity, result }];
  
  let palletsData: PalletLoad[] = [];
  if (shippingMethod === 'pallet') {
    const fullPallets = result.totalPalletsNeeded - (result.isLastPalletDifferent ? 1 : 0);
    for (let i = 0; i < fullPallets; i++) {
      palletsData.push({
        boxes: Array(result.boxesPerPalletBalanced).fill({ partName: part.name }),
        weight: result.balancedPalletWeight,
        volumeUtilization: result.palletVolumeUtilization,
        loadDimensions: result.loadDimensions
      });
    }
    if (result.isLastPalletDifferent && result.lastPalletBoxes > 0) {
      const [l, w, h] = result.orientations.pallet.split('x').map(Number);
      const boxesPerLayer = result.palletGrid.nz > 0 ? Math.max(1, result.boxesPerPallet / result.palletGrid.nz) : 1;
      const layers = Math.ceil(result.lastPalletBoxes / boxesPerLayer);
      const lastPalletHeight = pallet.height + (layers * h);

      palletsData.push({
        boxes: Array(result.lastPalletBoxes).fill({ partName: part.name }),
        weight: result.lastPalletWeight,
        volumeUtilization: result.palletVolumeUtilization * (result.lastPalletBoxes / result.boxesPerPalletBalanced),
        loadDimensions: { length: result.loadDimensions.length, width: result.loadDimensions.width, height: lastPalletHeight }
      });
    }
  }

  let htmlBody = `
    <html>
      <head>
        <style>
          body { font-family: sans-serif; color: #333; line-height: 1.6; }
          .header { background: #18181b; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { padding: 20px; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th { background: #f3f4f6; text-align: left; padding: 12px; border: 1px solid #e5e7eb; font-size: 14px; }
          td { padding: 12px; border: 1px solid #e5e7eb; font-size: 14px; }
          .section-title { font-weight: bold; font-size: 18px; margin-top: 30px; color: #111827; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
          .summary-box { background: #f0fdf4; border: 1px solid #bbf7d0; padding: 15px; border-radius: 8px; margin-top: 20px; }
          .footer { font-size: 12px; color: #6b7280; margin-top: 40px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 style="margin:0">DIAM Packing Report</h1>
          <p style="margin:5px 0 0 0; opacity: 0.8;">Logistics & Optimization Details</p>
        </div>
        <div class="content">
          <p><strong>Generated on:</strong> ${new Date().toLocaleString()}</p>
          <p><strong>Shipping Method:</strong> ${shippingMethod.toUpperCase()}</p>
          ${projectNumber ? `<p><strong>Project Number:</strong> ${projectNumber}</p>` : ''}
          ${deliveryAddress ? `<p><strong>Delivery Address:</strong> ${deliveryAddress}</p>` : ''}

          <div class="section-title">1. BOXES TO ORDER (SUPPLIER)</div>
          <table>
            <thead>
              <tr>
                <th>Box Name</th>
                <th>Dimensions (L x W x H) mm</th>
                <th>Quantity Needed</th>
              </tr>
            </thead>
            <tbody>
  `;

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
    htmlBody += `
      <tr>
        <td>${nameKey.split('-')[0]}</td>
        <td>${data.dims}</td>
        <td><strong>${data.qty}</strong></td>
      </tr>
    `;
  });

  htmlBody += `
            </tbody>
          </table>
  `;

  let sectionCounter = 2;

  if (shippingMethod === 'pallet') {
    htmlBody += `
          <div class="section-title">${sectionCounter}. PALLETS TO ORDER</div>
          <table>
            <thead>
              <tr>
                <th>Pallet Type</th>
                <th>Dimensions (L x W x H) mm</th>
                <th>Quantity Needed</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${pallet.name}${pallet.description ? `<br/><small>(${pallet.description})</small>` : ''}</td>
                <td>${pallet.length} x ${pallet.width} x ${pallet.height}</td>
                <td><strong>${palletsData.length}</strong></td>
              </tr>
            </tbody>
          </table>
    `;
    sectionCounter++;
  }

  htmlBody += `
          <div class="section-title">${sectionCounter}. PACKED BOXES DETAILS</div>
          <table>
            <thead>
              <tr>
                <th>Part Name</th>
                <th>Box Name</th>
                <th>Dimensions (mm)</th>
                <th>Gross Weight (kg)</th>
                <th>Parts per Box</th>
                <th>Total Boxes</th>
              </tr>
            </thead>
            <tbody>
  `;

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
      htmlBody += `
        <tr>
          <td>${sim.part.name}${sim.part.description ? `<br/><small>(${sim.part.description})</small>` : ''}</td>
          <td>${sim.box.name}</td>
          <td>${sim.box.length} x ${sim.box.width} x ${sim.box.height}</td>
          <td>${sim.result.boxWeight.toFixed(2)}</td>
          <td>${sim.result.partsPerBox}</td>
          <td>${fullBoxes}</td>
        </tr>
      `;
    }
    
    if (partsInLast > 0) {
      htmlBody += `
        <tr>
          <td>${sim.part.name} (Last Box)${sim.part.description ? `<br/><small>(${sim.part.description})</small>` : ''}</td>
          <td>${sim.box.name}</td>
          <td>${sim.box.length} x ${sim.box.width} x ${sim.box.height}</td>
          <td>${lastBoxWeight.toFixed(2)}</td>
          <td>${partsInLast}</td>
          <td>1</td>
        </tr>
      `;
    }
  });

  htmlBody += `
            </tbody>
          </table>
  `;
  sectionCounter++;

  if (shippingMethod === 'pallet') {
    htmlBody += `
          <div class="section-title">${sectionCounter}. PALLET LOAD DETAILS</div>
          <table>
            <thead>
              <tr>
                <th>Pallet(s)</th>
                <th>Dimensions (L x W x H) mm</th>
                <th>Gross Weight (kg)</th>
                <th>Total Boxes</th>
                <th>Parts & Quantities</th>
              </tr>
            </thead>
            <tbody>
    `;

    const groupedPallets = new Map<string, { count: number, indices: number[], pallet: PalletLoad, partsStr: string }>();
    
    palletsData.forEach((p, index) => {
      const dims = p.loadDimensions ? `${Math.round(p.loadDimensions.length)}x${Math.round(p.loadDimensions.width)}x${Math.round(p.loadDimensions.height)}` : 'N/A';
      const weight = p.weight.toFixed(1);
      const boxCount = p.boxes.length;
      
      const partCounts: { [key: string]: number } = {};
      p.boxes.forEach(c => {
        const partsInBox = result.partsPerBox;
        partCounts[c.partName] = (partCounts[c.partName] || 0) + partsInBox;
      });
      
      const partsStr = Object.entries(partCounts).map(([name, qty]) => `${name} (${qty} pcs)`).sort().join('<br/>');
      
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
      const count = group.indices.length;
      if (count === 1) {
        indicesStr = `Pallet ${group.indices[0]} (1x)`;
      } else {
        let consecutive = true;
        for (let i = 1; i < count; i++) {
          if (group.indices[i] !== group.indices[i-1] + 1) {
            consecutive = false;
            break;
          }
        }
        if (consecutive) {
          indicesStr = `Pallets ${group.indices[0]}-${group.indices[count - 1]} (${count}x)`;
        } else {
          indicesStr = `Pallets ${group.indices.join(', ')} (${count}x)`;
        }
      }
        
      const p = group.pallet;
      const dims = p.loadDimensions ? `${Math.round(p.loadDimensions.length)} x ${Math.round(p.loadDimensions.width)} x ${Math.round(p.loadDimensions.height)}` : 'N/A';

      htmlBody += `
        <tr>
          <td>${indicesStr}</td>
          <td>${dims}</td>
          <td>${p.weight.toFixed(2)}</td>
          <td>${p.boxes.length}</td>
          <td>${group.partsStr}</td>
        </tr>
      `;
    });

    htmlBody += `
            </tbody>
          </table>
    `;
    sectionCounter++;
  }

  htmlBody += `
          <div class="summary-box">
            <h3 style="margin-top:0; color: #166534;">${sectionCounter}. SHIPMENT SUMMARY</h3>
            <table>
              <thead>
                <tr>
                  ${shippingMethod === 'pallet' ? `<th>Total Pallets</th>` : ''}
                  <th>Total Boxes</th>
                  <th>Total Shipment Weight (kg)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  ${shippingMethod === 'pallet' ? `<td><strong>${palletsData.length}</strong></td>` : ''}
                  <td><strong>${totalBoxesCount}</strong></td>
                  <td><strong>${(shippingMethod === 'pallet' ? palletsData.reduce((sum, p) => sum + p.weight, 0) : totalBoxesWeight).toFixed(2)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

          ${(palletImage || boxImage || lastBoxImage || lastPalletImage) ? `
          <div class="section-title">${sectionCounter + 1}. VISUALIZATIONS</div>
          <div style="margin-top: 20px;">
            ${boxImage ? `<div style="margin-bottom: 20px;"><p style="font-weight: bold; margin-bottom: 5px; color: #374151;">Box Packing Scheme</p><img src="${boxImage}" style="max-width: 100%; height: auto; border: 1px solid #e5e7eb; border-radius: 8px;" alt="Box Visualization" /></div>` : ''}
            ${lastBoxImage ? `<div style="margin-bottom: 20px;"><p style="font-weight: bold; margin-bottom: 5px; color: #374151;">Last Box Packing Scheme (Partial)</p><img src="${lastBoxImage}" style="max-width: 100%; height: auto; border: 1px solid #e5e7eb; border-radius: 8px;" alt="Last Box Visualization" /></div>` : ''}
            
            ${palletImage && shippingMethod === 'pallet' ? `<div style="margin-bottom: 20px;"><p style="font-weight: bold; margin-bottom: 5px; color: #374151;">Pallet Layout (${palletsData.length > 0 ? palletsData.filter(p => p.boxes.length === palletsData[0].boxes.length).length : 1}x)</p><img src="${palletImage}" style="max-width: 100%; height: auto; border: 1px solid #e5e7eb; border-radius: 8px;" alt="Pallet Visualization" /></div>` : ''}
            ${lastPalletImage && shippingMethod === 'pallet' ? `<div style="margin-bottom: 20px;"><p style="font-weight: bold; margin-bottom: 5px; color: #374151;">Last Pallet Layout (${palletsData.length > 0 ? palletsData.length - palletsData.filter(p => p.boxes.length === palletsData[0].boxes.length).length : 0}x)</p><img src="${lastPalletImage}" style="max-width: 100%; height: auto; border: 1px solid #e5e7eb; border-radius: 8px;" alt="Last Pallet Visualization" /></div>` : ''}
          </div>
          ` : ''}

          <div class="footer">
            DIAM Palletizer - Professional Logistics Optimization System
          </div>
        </div>
      </body>
    </html>
  `;

  const eml = [
    `To: `,
    `Subject: ${subject}`,
    `Date: ${date}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset="utf-8"`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    htmlBody
  ].join('\r\n');
  
  return eml;
}

export function sendEmailReport(
  part: Part,
  box: Container,
  pallet: Pallet,
  result: PackingResult,
  shippingMethod: 'pallet' | 'courier',
  projectNumber?: string,
  deliveryAddress?: string,
  palletImage?: string,
  boxImage?: string,
  lastBoxImage?: string,
  lastPalletImage?: string
) {
  const emlContent = generateEML(part, box, pallet, result, shippingMethod, projectNumber, deliveryAddress, palletImage, boxImage, lastBoxImage, lastPalletImage);
  const blob = new Blob([emlContent], { type: 'message/rfc822' });
  const fileName = `Packing_Report_${projectNumber || 'DIAM'}.eml`;
  saveAs(blob, fileName);
  
  // Removed window.location.href mailto to avoid ERR_BLOCKED_BY_RESPONSE in iframe
}

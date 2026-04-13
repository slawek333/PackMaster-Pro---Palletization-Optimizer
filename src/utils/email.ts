import { PackingResult, Part, Container, Pallet, PalletLoad } from '../types';
import { saveAs } from 'file-saver';

export function generateEML(
  items: { part: Part; box: Container; quantity: number; result: PackingResult }[],
  pallet: Pallet,
  shipmentResult: PackingResult,
  shippingMethod: 'pallet' | 'courier',
  projectNumber?: string,
  deliveryAddress?: string,
  palletImage?: string
): string {
  const subject = `Packing Report - ${projectNumber || 'DIAM'}`;
  const date = new Date().toUTCString();
  
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
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 15px;">
              <div style="background: white; padding: 5px; border-radius: 6px; display: flex; align-items: center; justify-content: center;">
                <svg width="40" height="40" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M 5 15 L 95 35 L 30 95 L 5 15 Z" fill="black" />
                  <path d="M 5 15 Q 45 35 50 45" stroke="white" stroke-width="4" fill="none" stroke-linecap="round" />
                  <path d="M 95 35 Q 55 40 50 45" stroke="white" stroke-width="4" fill="none" stroke-linecap="round" />
                  <path d="M 30 95 Q 40 65 50 45" stroke="white" stroke-width="4" fill="none" stroke-linecap="round" />
                </svg>
              </div>
              <div>
                <h1 style="margin:0; font-size: 28px; letter-spacing: 2px;">DIAM Packing Report</h1>
                <p style="margin:2px 0 0 0; opacity: 0.8; font-size: 12px;">Logistics & Optimization Details</p>
              </div>
            </div>
            ${projectNumber ? `
            <div style="text-align: right;">
              <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.7;">Project No.</div>
              <div style="font-size: 24px; font-weight: bold;">${projectNumber}</div>
            </div>
            ` : ''}
          </div>
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
                <td><strong>${shipmentResult.totalPalletsNeeded}</strong></td>
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

  items.forEach(item => {
    const fullBoxes = Math.floor(item.quantity / item.result.partsPerBox);
    const partsInLast = item.quantity % item.result.partsPerBox;
    const lastBoxWeight = partsInLast > 0 ? (partsInLast * item.part.weight + item.box.emptyWeight) : 0;
    const itemTotalWeight = (fullBoxes * item.result.boxWeight) + lastBoxWeight;
    
    totalBoxesWeight += itemTotalWeight;
    totalBoxesCount += item.result.totalBoxesNeeded;

    if (fullBoxes > 0) {
      htmlBody += `
        <tr>
          <td>${item.part.name}${item.part.description ? `<br/><small>(${item.part.description})</small>` : ''}</td>
          <td>${item.box.name}</td>
          <td>${item.box.length} x ${item.box.width} x ${item.box.height}</td>
          <td>${item.result.boxWeight.toFixed(2)}</td>
          <td>${item.result.partsPerBox}</td>
          <td>${fullBoxes}</td>
        </tr>
      `;
    }
    
    if (partsInLast > 0) {
      htmlBody += `
        <tr>
          <td>${item.part.name} (Last Box)${item.part.description ? `<br/><small>(${item.part.description})</small>` : ''}</td>
          <td>${item.box.name}</td>
          <td>${item.box.length} x ${item.box.width} x ${item.box.height}</td>
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

  if (shippingMethod === 'pallet' && shipmentResult.pallets) {
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

    const groupedPallets = new Map<string, { count: number, indices: number[], weight: number, boxes: number, partsStr: string, dims: string }>();
    
    shipmentResult.pallets.forEach((p, index) => {
      const maxHeight = p.length > 0 ? Math.max(...p.map(b => b.z + b.height)) : 0;
      const totalHeight = pallet.height + maxHeight;
      const dims = `${pallet.length} x ${pallet.width} x ${Math.round(totalHeight)}`;
      
      const palletWeight = p.reduce((sum, b) => sum + (b.weight || 0), pallet.emptyWeight);
      const weightStr = palletWeight.toFixed(1);
      const boxCount = p.length;
      
      const partCounts: { [key: string]: number } = {};
      p.forEach(b => {
        partCounts[b.partName] = (partCounts[b.partName] || 0) + 1;
      });
      
      const partsStr = Object.entries(partCounts).map(([name, count]) => `${name}: ${count} boxes`).sort().join('<br/>');
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
        
      htmlBody += `
        <tr>
          <td>${indicesStr}</td>
          <td>${group.dims}</td>
          <td>${group.weight.toFixed(2)}</td>
          <td>${group.boxes}</td>
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
                  ${shippingMethod === 'pallet' ? `<td><strong>${shipmentResult.totalPalletsNeeded}</strong></td>` : ''}
                  <td><strong>${totalBoxesCount}</strong></td>
                  <td><strong>${(shippingMethod === 'pallet' ? (shipmentResult.pallets?.reduce((sum, p) => sum + p.reduce((s, b) => s + (b.weight || 0), pallet.emptyWeight), 0) || 0) : totalBoxesWeight).toFixed(2)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

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
  items: { part: Part; box: Container; quantity: number; result: PackingResult }[],
  pallet: Pallet,
  shipmentResult: PackingResult,
  shippingMethod: 'pallet' | 'courier',
  projectNumber?: string,
  deliveryAddress?: string,
  palletImage?: string
) {
  const emlContent = generateEML(items, pallet, shipmentResult, shippingMethod, projectNumber, deliveryAddress, palletImage);
  const blob = new Blob([emlContent], { type: 'message/rfc822' });
  const fileName = `Packing_Report_${projectNumber || 'DIAM'}.eml`;
  saveAs(blob, fileName);
}

import React from 'react';
import { 
  ClipboardList, 
  Package, 
  Box, 
  Weight, 
  AlertTriangle, 
  CheckCircle2, 
  Truck, 
  LayoutGrid, 
  Layers, 
  Info,
  Maximize2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { PackingResult, Container, Pallet, Part } from '../types';

export const GeneralSummary = ({ 
  result, 
  currentBox,
  currentPallet,
  currentPart,
  shippingMethod = 'pallet',
  calculationMode = 'full'
}: { 
  result: PackingResult, 
  currentBox: Container,
  currentPallet: Pallet,
  currentPart: Part,
  shippingMethod?: 'pallet' | 'courier',
  calculationMode?: 'full' | 'boxes-only'
}) => {
  // Stability info
  const isStable = result.isStable ?? true;
  const allWarnings = result.warnings ?? [];

  // Calculate box requirements
  const fullBoxes = Math.floor(currentPart.orderQuantity / result.partsPerBox);
  const partsInLast = currentPart.orderQuantity % result.partsPerBox;
  const lastBoxWeight = partsInLast > 0 ? (partsInLast * currentPart.weight + currentBox.emptyWeight) : 0;
  const totalBoxesWeight = (fullBoxes * result.boxWeight) + lastBoxWeight;

  const isCourier = shippingMethod === 'courier';
  const totalShipmentWeight = isCourier 
    ? totalBoxesWeight 
    : (result.totalPalletsNeeded > 0 
        ? (result.totalPalletsNeeded - 1) * result.balancedPalletWeight + result.lastPalletWeight 
        : 0);

  return (
    <div className={cn(
      "border border-zinc-200 rounded-[2.5rem] p-10 shadow-2xl shadow-zinc-200/40 mb-8 transition-all duration-500 overflow-hidden relative bg-white",
    )}>
      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-zinc-50 to-transparent rounded-full -mr-48 -mt-48 blur-3xl pointer-events-none opacity-50"></div>
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12 relative">
        <div className="flex items-center gap-6">
          <div className={cn(
            "w-16 h-16 rounded-2xl flex items-center justify-center shadow-xl shadow-zinc-200 tilted-icon-container bg-zinc-900 text-white"
          )}>
            <ClipboardList size={32} />
          </div>
          <div>
            <h2 className="font-black text-4xl text-zinc-900 tracking-tight leading-none">Shipment Report</h2>
            <p className="text-[11px] font-black text-zinc-400 uppercase tracking-[0.3em] mt-2">Optimization Results</p>
          </div>
        </div>
        <div className="flex gap-3">
          <span className={cn(
            "px-6 py-2.5 text-[11px] font-black rounded-full uppercase border tracking-widest flex items-center gap-2 shadow-sm",
            isCourier ? "bg-blue-50 text-blue-700 border-blue-100" : "bg-emerald-50 text-emerald-700 border-emerald-100"
          )}>
            {isCourier ? <Truck size={16} /> : <Layers size={16} />}
            {shippingMethod}
          </span>
          <span className="px-6 py-2.5 bg-zinc-50 text-zinc-600 text-[11px] font-black rounded-full uppercase border border-zinc-100 tracking-widest shadow-sm">
            {calculationMode.replace('-', ' ')}
          </span>
        </div>
      </div>

      {/* Stability Status - Only show if not boxes-only */}
      {calculationMode === 'full' && (
        <div className={cn(
          "mb-12 p-8 rounded-[2rem] border flex items-start gap-6 transition-all shadow-sm",
          isStable 
            ? "bg-emerald-50/40 border-emerald-100 text-emerald-900" 
            : "bg-amber-50/40 border-amber-100 text-amber-900"
        )}>
          <div className={cn(
            "w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-md",
            isStable ? "bg-white text-emerald-600 border border-emerald-100" : "bg-white text-amber-600 border border-amber-100"
          )}>
            {isStable ? <CheckCircle2 size={28} /> : <AlertTriangle size={28} />}
          </div>
          <div className="flex-1">
            <div className="font-black text-xl flex items-center gap-2 tracking-tight">
              Pallet Stability: {isStable ? 'Optimal' : 'Attention Required'}
              {isStable && <span className="text-[10px] bg-emerald-500 text-white px-3 py-1 rounded-full uppercase tracking-widest ml-3">Verified</span>}
            </div>
            {allWarnings.length > 0 ? (
              <ul className="mt-4 space-y-2.5">
                {allWarnings.map((warning, idx) => (
                  <li key={idx} className="text-sm font-black text-amber-700/90 flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                    {warning}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm font-black text-emerald-700/80 mt-2">All boxes are perfectly balanced and supported across all layers.</p>
            )}
          </div>
        </div>
      )}

      {/* Packing Optimization Info */}
      <div className="flex flex-wrap gap-3 mb-12">
        <div className="flex items-center gap-3 px-6 py-3 bg-zinc-50 text-zinc-700 rounded-2xl text-[12px] font-black border border-zinc-100 shadow-sm">
          <Maximize2 size={16} className="text-zinc-400" />
          ORIENTATION: {result.orientations.box}
        </div>

        <div className="flex items-center gap-3 px-6 py-3 bg-zinc-50 text-zinc-700 rounded-2xl text-[12px] font-black border border-zinc-100 shadow-sm">
          <Layers size={16} className="text-zinc-400" />
          LAYERED PACKING: ACTIVE
        </div>
        
        <div className="flex items-center gap-3 px-6 py-3 bg-zinc-50 text-zinc-700 rounded-2xl text-[12px] font-black border border-zinc-100 shadow-sm">
          <LayoutGrid size={16} className="text-zinc-400" />
          GRID OPTIMIZATION: ENABLED
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
        <div className="bg-zinc-50/50 rounded-[2rem] p-10 border border-zinc-100 transition-all hover:shadow-xl group relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <Box size={100} />
          </div>
          <div className="flex items-center gap-4 mb-8">
            <div className="p-3 bg-white text-zinc-900 rounded-2xl shadow-md border border-zinc-100 tilted-icon-container">
              <Box size={24} />
            </div>
            <span className="text-[11px] font-black text-zinc-400 uppercase tracking-[0.25em]">Total Boxes</span>
          </div>
          <div className="text-6xl font-black text-zinc-900 tracking-tighter">
            {result.totalBoxesNeeded}
          </div>
          <div className="mt-4 text-[11px] font-black text-zinc-400 uppercase tracking-widest">Master Boxes to Order</div>
        </div>

        <div className="bg-zinc-50/50 rounded-[2rem] p-10 border border-zinc-100 transition-all hover:shadow-xl group relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <Weight size={100} />
          </div>
          <div className="flex items-center gap-4 mb-8">
            <div className="p-3 bg-white text-zinc-900 rounded-2xl shadow-md border border-zinc-100 tilted-icon-container">
              <Weight size={24} />
            </div>
            <span className="text-[11px] font-black text-zinc-400 uppercase tracking-[0.25em]">Total Weight</span>
          </div>
          <div className="text-6xl font-black text-zinc-900 tracking-tighter">
            {totalShipmentWeight.toFixed(1)} <span className="text-2xl text-zinc-400 ml-1">kg</span>
          </div>
          <div className="mt-4 text-[11px] font-black text-zinc-400 uppercase tracking-widest">Gross Shipment Weight</div>
        </div>

        <div className="bg-zinc-50/50 rounded-[2rem] p-10 border border-zinc-100 transition-all hover:shadow-xl group relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <LayoutGrid size={100} />
          </div>
          <div className="flex items-center gap-4 mb-8">
            <div className="p-3 bg-white text-zinc-900 rounded-2xl shadow-md border border-zinc-100 tilted-icon-container">
              <LayoutGrid size={24} />
            </div>
            <span className="text-[11px] font-black text-zinc-400 uppercase tracking-[0.25em]">Utilization</span>
          </div>
          <div className="text-6xl font-black text-zinc-900 tracking-tighter">
            {((isCourier ? result.boxVolumeUtilization : result.palletVolumeUtilization) * 100).toFixed(1)} <span className="text-2xl text-zinc-400 ml-1">%</span>
          </div>
          <div className="mt-4 text-[11px] font-black text-zinc-400 uppercase tracking-widest">Volume Efficiency</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Pallets Info - Only show if not boxes-only */}
        {calculationMode === 'full' && (
          <div className="space-y-4">
            <h3 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-2">
              <Layers size={16} className="text-emerald-500" />
              Pallets ({result.totalPalletsNeeded})
            </h3>
            <div className="bg-zinc-50/30 rounded-2xl p-5 space-y-3 border border-zinc-100">
              <>
                {(!result.isLastPalletDifferent || result.totalPalletsNeeded > 1) && (
                  <div className="flex justify-between items-center text-sm bg-white p-3 rounded-xl border border-zinc-50 shadow-sm">
                    <div>
                      <span className="text-zinc-900 font-black tracking-tight">
                        {currentPallet.name} ({result.isLastPalletDifferent ? result.totalPalletsNeeded - 1 : result.totalPalletsNeeded})
                      </span>
                      <div className="text-[10px] text-zinc-500 font-black uppercase tracking-tighter">{currentPallet.length}x{currentPallet.width} mm</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-zinc-900 text-base">{result.balancedPalletWeight.toFixed(1)} kg</div>
                    </div>
                  </div>
                )}
                {result.isLastPalletDifferent && (
                  <div className="flex justify-between items-center text-sm bg-white p-3 rounded-xl border border-zinc-50 shadow-sm">
                    <div>
                      <span className="text-zinc-900 font-black tracking-tight">
                        {currentPallet.name} {result.totalPalletsNeeded === 1 ? '(1)' : '(Last)'}
                      </span>
                      <div className="text-[10px] text-zinc-500 font-black uppercase tracking-tighter">{currentPallet.length}x{currentPallet.width} mm</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-zinc-900 text-base">{result.lastPalletWeight.toFixed(1)} kg</div>
                    </div>
                  </div>
                )}
              </>
              <div className="pt-4 mt-4 border-t border-zinc-200 flex justify-between items-center">
                <span className="text-zinc-400 text-[10px] font-black uppercase tracking-widest">Total Pallet Weight</span>
                <span className="text-2xl font-black text-zinc-900 tracking-tighter">
                  {totalShipmentWeight.toFixed(1)} <span className="text-sm text-zinc-400">kg</span>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Boxes Info */}
        <div className={cn("space-y-4", calculationMode === 'boxes-only' && "md:col-span-2")}>
          <h3 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-2">
            <Box size={16} className="text-blue-500" />
            Packed Boxes Details
          </h3>
          <div className="bg-zinc-50/30 rounded-2xl p-5 space-y-3 border border-zinc-100">
            <div className="flex justify-between items-center text-sm p-4 bg-white rounded-xl border border-zinc-50 shadow-sm">
              <div>
                <div className="font-black text-zinc-900 tracking-tight text-base">{currentBox.name}</div>
                <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mt-0.5">{currentBox.length}x{currentBox.width}x{currentBox.height} mm</div>
                <div className="text-[10px] mt-2 flex gap-2">
                  <span className="bg-zinc-100 px-2 py-0.5 rounded-full font-black text-zinc-600">Weight: {result.totalBoxesNeeded === 1 && partsInLast > 0 ? lastBoxWeight.toFixed(1) : result.boxWeight.toFixed(1)} kg</span>
                  {result.totalBoxesNeeded > 1 && partsInLast > 0 && <span className="bg-amber-100 px-2 py-0.5 rounded-full font-black text-amber-700">Last: {lastBoxWeight.toFixed(1)} kg</span>}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Quantity</div>
                <div className="text-3xl font-black text-zinc-900 tracking-tighter">{result.totalBoxesNeeded} <span className="text-xs font-normal text-zinc-400">pcs</span></div>
                <div className="text-[10px] font-black text-zinc-500 mt-1">{totalBoxesWeight.toFixed(1)} kg total</div>
              </div>
            </div>
            <div className="pt-4 mt-4 border-t border-zinc-200 flex justify-between items-center">
              <div>
                <span className="text-zinc-900 font-black tracking-tight">Shipment Summary</span>
                <div className="text-[10px] text-zinc-400 font-black uppercase tracking-widest mt-0.5">All packages</div>
              </div>
              <div className="text-right">
                <span className="text-3xl font-black text-zinc-900 tracking-tighter">
                  {result.totalBoxesNeeded} <span className="text-sm font-normal text-zinc-400">BOXES</span>
                </span>
                <div className="text-[10px] font-black text-zinc-500 mt-1 uppercase tracking-widest">
                  Total: {totalBoxesWeight.toFixed(1)} kg
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

};

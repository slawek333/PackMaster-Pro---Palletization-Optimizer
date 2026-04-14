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
  currentSingleResult,
  currentBox,
  currentPallet,
  currentPart,
  shippingMethod = 'pallet',
  calculationMode = 'full'
}: { 
  result: PackingResult, 
  currentSingleResult?: PackingResult,
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
  const isMixed = !!result.pallets;
  const displayResult = isMixed && currentSingleResult ? currentSingleResult : result;
  
  const partsPerBox = displayResult.partsPerBox || 1;
  const fullBoxes = isMixed ? 0 : Math.floor(currentPart.orderQuantity / partsPerBox);
  const partsInLast = isMixed ? 0 : currentPart.orderQuantity % partsPerBox;
  const lastBoxWeight = partsInLast > 0 ? (partsInLast * currentPart.weight + currentBox.emptyWeight) : 0;
  const totalBoxesWeight = isMixed ? result.palletWeight - currentPallet.emptyWeight : (fullBoxes * result.boxWeight) + lastBoxWeight;

  const isCourier = shippingMethod === 'courier';
  const totalShipmentWeight = isMixed 
    ? result.palletWeight * result.totalPalletsNeeded // Simplified for mixed
    : (isCourier 
        ? totalBoxesWeight 
        : (result.totalPalletsNeeded > 0 
            ? (result.totalPalletsNeeded - 1) * result.balancedPalletWeight + result.lastPalletWeight 
            : 0));

  return (
    <div className={cn(
      "border border-zinc-200 rounded-[2rem] p-8 shadow-2xl shadow-zinc-200/50 mb-8 transition-all duration-500 overflow-hidden relative bg-white/80 backdrop-blur-xl",
    )}>
      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-indigo-50/50 to-transparent rounded-full -mr-48 -mt-48 blur-3xl pointer-events-none opacity-60"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-emerald-50/50 to-transparent rounded-full -ml-48 -mb-48 blur-3xl pointer-events-none opacity-60"></div>
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 relative">
        <div className="flex items-center gap-5">
          <div className={cn(
            "w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl shadow-zinc-200 tilted-icon-container bg-zinc-900 text-white"
          )}>
            <ClipboardList size={28} />
          </div>
          <div>
            <h2 className="font-black text-3xl text-zinc-900 tracking-tight leading-none">
              {isMixed ? 'Mixed Shipment Report' : 'Shipment Report'}
            </h2>
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.4em] mt-2">Logistics Intelligence</p>
          </div>
        </div>
        <div className="flex gap-3">
          <span className={cn(
            "px-5 py-2 text-[10px] font-black rounded-xl uppercase border tracking-[0.15em] flex items-center gap-2 shadow-sm transition-all",
            isCourier ? "bg-blue-50 text-blue-700 border-blue-100" : "bg-emerald-50 text-emerald-700 border-emerald-100"
          )}>
            {isCourier ? <Truck size={14} /> : <Layers size={14} />}
            {shippingMethod}
          </span>
          <span className="px-5 py-2 bg-zinc-50 text-zinc-600 text-[10px] font-black rounded-xl uppercase border border-zinc-100 tracking-[0.15em] shadow-sm">
            {isMixed ? 'MIXED ITEMS' : calculationMode.replace('-', ' ')}
          </span>
        </div>
      </div>

      {/* Stability Status - Only show if not boxes-only */}
      {(calculationMode === 'full' || isMixed) && (
        <div className={cn(
          "mb-10 p-6 rounded-[1.5rem] border flex items-start gap-5 transition-all shadow-md",
          isStable 
            ? "bg-emerald-50/50 border-emerald-100 text-emerald-900" 
            : "bg-amber-50/50 border-amber-100 text-amber-900"
        )}>
          <div className={cn(
            "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg",
            isStable ? "bg-white text-emerald-600 border border-emerald-100" : "bg-white text-amber-600 border border-amber-100"
          )}>
            {isStable ? <CheckCircle2 size={24} /> : <AlertTriangle size={24} />}
          </div>
          <div className="flex-1">
            <div className="font-black text-xl flex items-center gap-3 tracking-tight">
              Pallet Stability: {isStable ? 'Optimal' : 'Attention Required'}
              {isStable && <span className="text-[10px] bg-emerald-600 text-white px-3 py-1 rounded-full uppercase tracking-widest ml-2 font-black">Verified</span>}
            </div>
            {allWarnings.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {allWarnings.map((warning, idx) => (
                  <li key={idx} className="text-sm font-bold text-amber-700/90 flex items-center gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                    {warning}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm font-bold text-emerald-700/80 mt-2">All boxes are perfectly balanced and supported across all layers.</p>
            )}
          </div>
        </div>
      )}

      {/* Packing Optimization Info */}
      <div className="flex flex-wrap gap-2 mb-8">
        {!isMixed && (
          <div className="flex items-center gap-2 px-4 py-2 bg-zinc-50 text-zinc-700 rounded-xl text-[10px] font-bold border border-zinc-100 shadow-sm">
            <Maximize2 size={14} className="text-zinc-400" />
            ORIENTATION: {result.orientations.box}
          </div>
        )}

        <div className="flex items-center gap-2 px-4 py-2 bg-zinc-50 text-zinc-700 rounded-xl text-[10px] font-bold border border-zinc-100 shadow-sm">
          <Layers size={14} className="text-zinc-400" />
          {isMixed ? 'MIXED PACKING: ACTIVE' : 'LAYERED PACKING: ACTIVE'}
        </div>
        
        <div className="flex items-center gap-2 px-4 py-2 bg-zinc-50 text-zinc-700 rounded-xl text-[10px] font-bold border border-zinc-100 shadow-sm">
          <LayoutGrid size={14} className="text-zinc-400" />
          GRID OPTIMIZATION: ENABLED
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-zinc-50/50 rounded-[1.25rem] p-6 border border-zinc-100 transition-all hover:shadow-lg group relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Box size={60} />
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-white text-zinc-900 rounded-xl shadow-sm border border-zinc-100 tilted-icon-container">
              <Box size={18} />
            </div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em]">Total Boxes</span>
          </div>
          <div className="text-4xl font-bold text-zinc-900 tracking-tighter">
            {result.totalBoxesNeeded}
          </div>
          <div className="mt-2 text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Master Boxes to Order</div>
        </div>

        <div className="bg-zinc-50/50 rounded-[1.25rem] p-6 border border-zinc-100 transition-all hover:shadow-lg group relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Weight size={60} />
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-white text-zinc-900 rounded-xl shadow-sm border border-zinc-100 tilted-icon-container">
              <Weight size={18} />
            </div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em]">Total Weight</span>
          </div>
          <div className="text-4xl font-bold text-zinc-900 tracking-tighter">
            {totalShipmentWeight.toFixed(1)} <span className="text-xl text-zinc-400 ml-1">kg</span>
          </div>
          <div className="mt-2 text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Gross Shipment Weight</div>
        </div>

        <div className="bg-zinc-50/50 rounded-[1.25rem] p-6 border border-zinc-100 transition-all hover:shadow-lg group relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <LayoutGrid size={60} />
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-white text-zinc-900 rounded-xl shadow-sm border border-zinc-100 tilted-icon-container">
              <LayoutGrid size={18} />
            </div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em]">Utilization</span>
          </div>
          <div className="text-4xl font-bold text-zinc-900 tracking-tighter">
            {((isCourier ? result.boxVolumeUtilization : result.palletVolumeUtilization) * 100).toFixed(1)} <span className="text-xl text-zinc-400 ml-1">%</span>
          </div>
          <div className="mt-2 text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Volume Efficiency</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pallets Info - Only show if not boxes-only */}
        {(calculationMode === 'full' || isMixed) && (
          <div className="space-y-3">
            <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-2">
              <Layers size={14} className="text-emerald-500" />
              Pallets ({result.totalPalletsNeeded})
            </h3>
            <div className="bg-zinc-50/30 rounded-xl p-4 space-y-2 border border-zinc-100">
              <>
                {(!result.isLastPalletDifferent || result.totalPalletsNeeded > 1) && (
                  <div className="flex justify-between items-center text-xs bg-white p-3.5 rounded-xl border border-zinc-100 shadow-sm hover:shadow-md transition-all">
                    <div>
                      <span className="text-zinc-900 font-black tracking-tight text-sm">
                        {currentPallet.name} ({result.isLastPalletDifferent ? result.totalPalletsNeeded - 1 : result.totalPalletsNeeded})
                      </span>
                      <div className="text-[10px] text-zinc-500 font-black uppercase tracking-widest mt-0.5">
                        Dims: {currentPallet.length}x{currentPallet.width} mm | Total Height: {result.loadDimensions.height} mm
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-zinc-900 text-base">{(isMixed ? result.palletWeight : result.balancedPalletWeight).toFixed(1)} kg</div>
                    </div>
                  </div>
                )}
                {result.isLastPalletDifferent && (
                  <div className="flex justify-between items-center text-xs bg-white p-3.5 rounded-xl border border-zinc-100 shadow-sm hover:shadow-md transition-all">
                    <div>
                      <span className="text-zinc-900 font-black tracking-tight text-sm">
                        {currentPallet.name} {result.totalPalletsNeeded === 1 ? '(1)' : '(Last)'}
                      </span>
                      <div className="text-[10px] text-zinc-500 font-black uppercase tracking-widest mt-0.5">
                        Dims: {currentPallet.length}x{currentPallet.width} mm | Total Height: {result.loadDimensions.height} mm
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-zinc-900 text-base">{(isMixed ? result.lastPalletWeight : result.lastPalletWeight).toFixed(1)} kg</div>
                    </div>
                  </div>
                )}
              </>
              <div className="pt-3 mt-3 border-t border-zinc-200 flex justify-between items-center">
                <span className="text-zinc-400 text-[9px] font-bold uppercase tracking-widest">Total Pallet Weight</span>
                <span className="text-xl font-bold text-zinc-900 tracking-tighter">
                  {totalShipmentWeight.toFixed(1)} <span className="text-xs text-zinc-400">kg</span>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Boxes Info */}
        <div className={cn("space-y-3", (calculationMode === 'boxes-only' || (isMixed && !isCourier)) && "md:col-span-2")}>
          <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-2">
            <Box size={14} className="text-blue-500" />
            {isMixed ? 'Shipment Details' : 'Packed Boxes Details'}
          </h3>
          <div className="bg-zinc-50/30 rounded-xl p-4 space-y-2 border border-zinc-100">
            {isMixed && currentSingleResult && (
              <div className="mb-4 pb-4 border-b border-zinc-200">
                <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Current Selection Packing</div>
                <div className="flex justify-between items-center text-xs p-3 bg-white rounded-lg border border-zinc-50 shadow-sm">
                  <div>
                    <div className="font-bold text-zinc-900 tracking-tight text-sm">{currentBox.name}</div>
                    <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">{currentBox.length}x{currentBox.width}x{currentBox.height} mm</div>
                    <div className="text-[9px] mt-1.5 flex gap-1.5">
                      <span className="bg-blue-50 px-1.5 py-0.5 rounded-full font-bold text-blue-700">Parts per Box: {currentSingleResult.partsPerBox}</span>
                      <span className="bg-zinc-100 px-1.5 py-0.5 rounded-full font-bold text-zinc-600">Weight: {currentSingleResult.boxWeight.toFixed(1)} kg</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5">Efficiency</div>
                    <div className="text-xl font-bold text-zinc-900 tracking-tighter">{(currentSingleResult.boxVolumeUtilization * 100).toFixed(1)}%</div>
                  </div>
                </div>
              </div>
            )}
            {!isMixed ? (
              <div className="flex justify-between items-center text-xs p-3 bg-white rounded-lg border border-zinc-50 shadow-sm">
                <div>
                  <div className="font-bold text-zinc-900 tracking-tight text-sm">{currentBox.name}</div>
                  <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">{currentBox.length}x{currentBox.width}x{currentBox.height} mm</div>
                  <div className="text-[9px] mt-1.5 flex gap-1.5">
                    <span className="bg-zinc-100 px-1.5 py-0.5 rounded-full font-bold text-zinc-600">Weight: {result.totalBoxesNeeded === 1 && partsInLast > 0 ? lastBoxWeight.toFixed(1) : result.boxWeight.toFixed(1)} kg</span>
                    {result.totalBoxesNeeded > 1 && partsInLast > 0 && <span className="bg-amber-100 px-1.5 py-0.5 rounded-full font-bold text-amber-700">Last: {lastBoxWeight.toFixed(1)} kg</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5">Quantity</div>
                  <div className="text-2xl font-bold text-zinc-900 tracking-tighter">{result.totalBoxesNeeded} <span className="text-[10px] font-normal text-zinc-400">pcs</span></div>
                  <div className="text-[9px] font-bold text-zinc-500 mt-0.5">{totalBoxesWeight.toFixed(1)} kg total</div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-zinc-500 italic p-4 text-center">
                Mixed shipment contains multiple part and box types.
              </div>
            )}
            <div className="pt-3 mt-3 border-t border-zinc-200 flex justify-between items-center">
              <div>
                <span className="text-zinc-900 font-bold tracking-tight">Shipment Summary</span>
                <div className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest mt-0.5">All packages</div>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-zinc-900 tracking-tighter">
                  {result.totalBoxesNeeded} <span className="text-xs font-normal text-zinc-400">BOXES</span>
                </span>
                <div className="text-[9px] font-bold text-zinc-500 mt-0.5 uppercase tracking-widest">
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

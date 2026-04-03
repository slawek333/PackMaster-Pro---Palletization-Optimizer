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
import { PackingResult, SessionResult, Simulation, Container, Pallet, Part, ShippingMethod, CalculationMode } from '../types';

export const GeneralSummary = ({ 
  result, 
  sessionResult, 
  simulations,
  currentBox,
  currentPallet,
  currentPart,
  shippingMethod = 'pallet',
  calculationMode = 'full'
}: { 
  result: PackingResult, 
  sessionResult?: SessionResult | null,
  simulations: Simulation[],
  currentBox: Container,
  currentPallet: Pallet,
  currentPart: Part,
  shippingMethod?: 'pallet' | 'courier',
  calculationMode?: 'full' | 'boxes-only'
}) => {
  const isSession = !!sessionResult && simulations.length > 0;

  // Stability info
  const isStable = isSession 
    ? sessionResult.pallets.every(p => p.isStable ?? true)
    : (result.isStable ?? true);
  
  const allWarnings = isSession
    ? Array.from(new Set(sessionResult.pallets.flatMap(p => p.warnings ?? [])))
    : (result.warnings ?? []);

  // Calculate box requirements
  const boxRequirements = new Map<string, { count: number, length: number, width: number, height: number, boxWeight: number, totalWeight: number, isLastDifferent?: boolean, lastBoxWeight?: number }>();
  
  if (isSession) {
    simulations.forEach(sim => {
      const key = `${sim.box.name}-${sim.box.length}x${sim.box.width}x${sim.box.height}`;
      const existing = boxRequirements.get(key) || { count: 0, length: sim.box.length, width: sim.box.width, height: sim.box.height, boxWeight: sim.result.boxWeight, totalWeight: 0 };
      
      const fullBoxes = Math.floor(sim.quantity / sim.result.partsPerBox);
      const partsInLast = sim.quantity % sim.result.partsPerBox;
      const lastBoxWeight = partsInLast > 0 ? (partsInLast * sim.part.weight + sim.box.emptyWeight) : 0;
      const simTotalWeight = (fullBoxes * sim.result.boxWeight) + lastBoxWeight;

      boxRequirements.set(key, { 
        ...existing, 
        count: existing.count + sim.result.totalBoxesNeeded,
        totalWeight: existing.totalWeight + simTotalWeight,
        isLastDifferent: existing.count > 0 ? existing.isLastDifferent : partsInLast > 0,
        lastBoxWeight: existing.count > 0 ? existing.lastBoxWeight : lastBoxWeight
      });
    });
  } else {
    const key = `${currentBox.name}-${currentBox.length}x${currentBox.width}x${currentBox.height}`;
    const fullBoxes = Math.floor(currentPart.orderQuantity / result.partsPerBox);
    const partsInLast = currentPart.orderQuantity % result.partsPerBox;
    const lastBoxWeight = partsInLast > 0 ? (partsInLast * currentPart.weight + currentBox.emptyWeight) : 0;
    const totalWeight = (fullBoxes * result.boxWeight) + lastBoxWeight;

    boxRequirements.set(key, { 
      count: result.totalBoxesNeeded, 
      length: currentBox.length,
      width: currentBox.width, 
      height: currentBox.height,
      boxWeight: result.boxWeight,
      totalWeight: totalWeight,
      isLastDifferent: partsInLast > 0,
      lastBoxWeight: lastBoxWeight
    });
  }

  const totalBoxesWeight = Array.from(boxRequirements.values()).reduce((sum, r) => sum + r.totalWeight, 0);

  const isCourier = shippingMethod === 'courier';

  return (
    <div className={cn(
      "border border-zinc-200 rounded-[2rem] p-8 shadow-xl shadow-zinc-200/40 mb-8 transition-all duration-500 overflow-hidden relative bg-white",
    )}>
      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-zinc-50 to-transparent rounded-full -mr-48 -mt-48 blur-3xl pointer-events-none opacity-50"></div>
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 relative">
        <div className="flex items-center gap-5">
          <div className={cn(
            "w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg tilted-icon-container",
            isCourier ? "bg-zinc-900 text-white shadow-zinc-200" : "bg-zinc-900 text-white shadow-zinc-200"
          )}>
            <ClipboardList size={28} />
          </div>
          <div>
            <h2 className="font-black text-3xl text-zinc-900 tracking-tight">Shipment Report</h2>
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mt-1">Optimization Results</p>
          </div>
        </div>
        <div className="flex gap-2">
          <span className={cn(
            "px-5 py-2 text-[10px] font-black rounded-full uppercase border tracking-widest flex items-center gap-2",
            isCourier ? "bg-blue-50 text-blue-700 border-blue-100" : "bg-emerald-50 text-emerald-700 border-emerald-100"
          )}>
            {isCourier ? <Truck size={14} /> : <Layers size={14} />}
            {shippingMethod}
          </span>
          <span className="px-5 py-2 bg-zinc-50 text-zinc-600 text-[10px] font-black rounded-full uppercase border border-zinc-100 tracking-widest">
            {calculationMode.replace('-', ' ')}
          </span>
        </div>
      </div>

      {/* Stability Status - Only show if not boxes-only */}
      {calculationMode === 'full' && (
        <div className={cn(
          "mb-10 p-6 rounded-[1.5rem] border flex items-start gap-5 transition-all shadow-sm",
          isStable 
            ? "bg-emerald-50/30 border-emerald-100 text-emerald-900" 
            : "bg-amber-50/30 border-amber-100 text-amber-900"
        )}>
          <div className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
            isStable ? "bg-white text-emerald-600 border border-emerald-100" : "bg-white text-amber-600 border border-amber-100"
          )}>
            {isStable ? <CheckCircle2 size={24} /> : <AlertTriangle size={24} />}
          </div>
          <div className="flex-1">
            <div className="font-black text-lg flex items-center gap-2 tracking-tight">
              Pallet Stability: {isStable ? 'Optimal' : 'Attention Required'}
              {isStable && <span className="text-[9px] bg-emerald-500 text-white px-2 py-0.5 rounded-full uppercase tracking-widest ml-2">Verified</span>}
            </div>
            {allWarnings.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {allWarnings.map((warning, idx) => (
                  <li key={idx} className="text-sm font-semibold text-amber-700/90 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                    {warning}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm font-semibold text-emerald-700/80 mt-1">All boxes are perfectly balanced and supported across all layers.</p>
            )}
          </div>
        </div>
      )}

      {/* Packing Optimization Info */}
      <div className="flex flex-wrap gap-2 mb-10">
        <div className="flex items-center gap-2.5 px-5 py-2.5 bg-zinc-50 text-zinc-700 rounded-2xl text-[11px] font-black border border-zinc-100 shadow-sm">
          <Maximize2 size={14} className="text-zinc-400" />
          ORIENTATION: {result.orientations.box}
        </div>

        <div className="flex items-center gap-2.5 px-5 py-2.5 bg-zinc-50 text-zinc-700 rounded-2xl text-[11px] font-black border border-zinc-100 shadow-sm">
          <Layers size={14} className="text-zinc-400" />
          LAYERED PACKING: ACTIVE
        </div>
        
        <div className="flex items-center gap-2.5 px-5 py-2.5 bg-zinc-50 text-zinc-700 rounded-2xl text-[11px] font-black border border-zinc-100 shadow-sm">
          <LayoutGrid size={14} className="text-zinc-400" />
          GRID OPTIMIZATION: ENABLED
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-zinc-50/50 rounded-[1.5rem] p-8 border border-zinc-100 transition-all hover:shadow-lg group relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Box size={80} />
          </div>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-white text-zinc-900 rounded-xl shadow-sm border border-zinc-100 tilted-icon-container">
              <Box size={22} />
            </div>
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Total Boxes</span>
          </div>
          <div className="text-5xl font-black text-zinc-900 tracking-tighter">
            {isSession ? sessionResult.totalBoxes : result.totalBoxesNeeded}
          </div>
          <div className="mt-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Master Boxes to Order</div>
        </div>

        <div className="bg-zinc-50/50 rounded-[1.5rem] p-8 border border-zinc-100 transition-all hover:shadow-lg group relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Weight size={80} />
          </div>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-white text-zinc-900 rounded-xl shadow-sm border border-zinc-100 tilted-icon-container">
              <Weight size={22} />
            </div>
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Total Weight</span>
          </div>
          <div className="text-5xl font-black text-zinc-900 tracking-tighter">
            {(isSession 
              ? sessionResult.totalWeight 
              : (isCourier 
                  ? totalBoxesWeight 
                  : (result.totalPalletsNeeded > 0 
                      ? (result.totalPalletsNeeded - 1) * result.balancedPalletWeight + result.lastPalletWeight 
                      : 0))
            ).toFixed(1)} <span className="text-xl text-zinc-400 ml-1">kg</span>
          </div>
          <div className="mt-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Gross Shipment Weight</div>
        </div>

        <div className="bg-zinc-50/50 rounded-[1.5rem] p-8 border border-zinc-100 transition-all hover:shadow-lg group relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <LayoutGrid size={80} />
          </div>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-white text-zinc-900 rounded-xl shadow-sm border border-zinc-100 tilted-icon-container">
              <LayoutGrid size={22} />
            </div>
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Utilization</span>
          </div>
          <div className="text-5xl font-black text-zinc-900 tracking-tighter">
            {((isSession ? sessionResult.overallUtilization : (isCourier ? result.boxVolumeUtilization : result.palletVolumeUtilization)) * 100).toFixed(1)} <span className="text-xl text-zinc-400 ml-1">%</span>
          </div>
          <div className="mt-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Volume Efficiency</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Pallets Info - Only show if not boxes-only */}
        {calculationMode === 'full' && (
          <div className="space-y-4">
            <h3 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-2">
              <Layers size={16} className="text-emerald-500" />
              Pallets ({isSession ? sessionResult.pallets.length : result.totalPalletsNeeded})
            </h3>
            <div className="bg-zinc-50/30 rounded-2xl p-5 space-y-3 border border-zinc-100">
              {isSession ? (
                sessionResult.pallets.map((p, i) => (
                  <div key={i} className="flex justify-between items-center text-sm bg-white p-3 rounded-xl border border-zinc-50 shadow-sm">
                    <div>
                      <span className="text-zinc-900 font-black tracking-tight">Pallet {i + 1}</span>
                      <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-tighter">{currentPallet.name} • {currentPallet.length}x{currentPallet.width} mm</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-zinc-900 text-base">{p.weight.toFixed(1)} kg</div>
                    </div>
                  </div>
                ))
              ) : (
                <>
                  {(!result.isLastPalletDifferent || result.totalPalletsNeeded > 1) && (
                    <div className="flex justify-between items-center text-sm bg-white p-3 rounded-xl border border-zinc-50 shadow-sm">
                      <div>
                        <span className="text-zinc-900 font-black tracking-tight">
                          {currentPallet.name} ({result.isLastPalletDifferent ? result.totalPalletsNeeded - 1 : result.totalPalletsNeeded})
                        </span>
                        <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-tighter">{currentPallet.length}x{currentPallet.width} mm</div>
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
                        <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-tighter">{currentPallet.length}x{currentPallet.width} mm</div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-zinc-900 text-base">{result.lastPalletWeight.toFixed(1)} kg</div>
                      </div>
                    </div>
                  )}
                </>
              )}
              <div className="pt-4 mt-4 border-t border-zinc-200 flex justify-between items-center">
                <span className="text-zinc-400 text-[10px] font-black uppercase tracking-widest">Total Pallet Weight</span>
                <span className="text-2xl font-black text-zinc-900 tracking-tighter">
                  {isSession ? sessionResult.totalWeight.toFixed(1) : ((result.isLastPalletDifferent ? result.totalPalletsNeeded - 1 : result.totalPalletsNeeded) * result.balancedPalletWeight + (result.isLastPalletDifferent ? result.lastPalletWeight : 0)).toFixed(1)} <span className="text-sm text-zinc-400">kg</span>
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
            {Array.from(boxRequirements.entries()).map(([key, req], i) => (
              <div key={i} className="flex justify-between items-center text-sm p-4 bg-white rounded-xl border border-zinc-50 shadow-sm">
                <div>
                  <div className="font-black text-zinc-900 tracking-tight text-base">{key.split('-')[0]}</div>
                  <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mt-0.5">{req.length}x{req.width}x{req.height} mm</div>
                  <div className="text-[10px] mt-2 flex gap-2">
                    <span className="bg-zinc-100 px-2 py-0.5 rounded-full font-bold text-zinc-600">Weight: {req.count === 1 && req.isLastDifferent ? req.lastBoxWeight?.toFixed(1) : req.boxWeight.toFixed(1)} kg</span>
                    {req.count > 1 && req.isLastDifferent && <span className="bg-amber-100 px-2 py-0.5 rounded-full font-bold text-amber-700">Last: {req.lastBoxWeight?.toFixed(1)} kg</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Quantity</div>
                  <div className="text-3xl font-black text-zinc-900 tracking-tighter">{req.count} <span className="text-xs font-normal text-zinc-400">pcs</span></div>
                  <div className="text-[10px] font-black text-zinc-500 mt-1">{req.totalWeight.toFixed(1)} kg total</div>
                </div>
              </div>
            ))}
            <div className="pt-4 mt-4 border-t border-zinc-200 flex justify-between items-center">
              <div>
                <span className="text-zinc-900 font-black tracking-tight">Shipment Summary</span>
                <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-0.5">All packages</div>
              </div>
              <div className="text-right">
                <span className="text-3xl font-black text-zinc-900 tracking-tighter">
                  {isSession ? sessionResult.totalBoxes : result.totalBoxesNeeded} <span className="text-sm font-normal text-zinc-400">BOXES</span>
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

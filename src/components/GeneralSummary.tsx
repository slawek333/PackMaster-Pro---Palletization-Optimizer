import React from 'react';
import { 
  ClipboardList, 
  Package, 
  Box as BoxIcon, 
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
      "border-2 rounded-[2.5rem] p-8 shadow-2xl shadow-zinc-200/50 mb-8 transition-all duration-500 overflow-hidden relative",
      isCourier 
        ? "bg-gradient-to-br from-blue-50 via-white to-blue-50/50 border-blue-100" 
        : "bg-gradient-to-br from-emerald-50 via-white to-emerald-50/50 border-emerald-100"
    )}>
      <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-zinc-100/20 to-transparent rounded-full -mr-32 -mt-32 blur-3xl pointer-events-none"></div>
      
      <div className="flex items-center justify-between mb-8 relative">
        <div className="flex items-center gap-4">
          <div className={cn(
            "w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg",
            isCourier ? "bg-blue-600 text-white shadow-blue-200" : "bg-emerald-600 text-white shadow-emerald-200"
          )}>
            <ClipboardList size={24} />
          </div>
          <div>
            <h2 className="font-black text-2xl text-zinc-900 tracking-tight">Loading Summary</h2>
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Shipment Overview</p>
          </div>
        </div>
        <div className="flex gap-3">
          <span className={cn(
            "px-4 py-1.5 text-[11px] font-black rounded-xl uppercase border-2 tracking-widest",
            isCourier ? "bg-blue-100/50 text-blue-700 border-blue-200" : "bg-emerald-100/50 text-emerald-700 border-emerald-200"
          )}>
            {shippingMethod}
          </span>
          <span className="px-4 py-1.5 bg-zinc-100/50 text-zinc-600 text-[11px] font-black rounded-xl uppercase border-2 border-zinc-200 tracking-widest">
            {calculationMode.replace('-', ' ')}
          </span>
        </div>
      </div>

      {/* Stability Status - Only show if not boxes-only */}
      {calculationMode === 'full' && (
        <div className={cn(
          "mb-8 p-6 rounded-3xl border-2 flex items-start gap-5 transition-all shadow-sm",
          isStable 
            ? "bg-emerald-50/50 border-emerald-100 text-emerald-900" 
            : "bg-amber-50/50 border-amber-100 text-amber-900"
        )}>
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-md",
            isStable ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
          )}>
            {isStable ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
          </div>
          <div className="flex-1">
            <div className="font-black text-base flex items-center gap-2">
              Pallet Stability: {isStable ? 'Optimal' : 'Attention Required'}
              {isStable && <span className="text-[10px] bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-full uppercase tracking-tighter">Verified</span>}
            </div>
            {allWarnings.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {allWarnings.map((warning, idx) => (
                  <li key={idx} className="text-sm font-medium text-amber-700/80 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    {warning}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm font-medium text-emerald-700/80 mt-1">All boxes are perfectly balanced and supported across all layers.</p>
            )}
          </div>
        </div>
      )}

      {/* Packing Optimization Info */}
      <div className="flex flex-wrap gap-3 mb-8">
        <div className="flex items-center gap-2 px-4 py-2 bg-white text-blue-700 rounded-2xl text-xs font-black border-2 border-blue-50 shadow-sm hover:shadow-md transition-shadow">
          <div className="p-1 bg-blue-50 rounded-lg">
            <Maximize2 size={14} />
          </div>
          Optimal Orientation: {result.orientations.box}
        </div>

        <div className="flex items-center gap-2 px-4 py-2 bg-white text-indigo-700 rounded-2xl text-xs font-black border-2 border-indigo-50 shadow-sm hover:shadow-md transition-shadow">
          <div className="p-1 bg-indigo-50 rounded-lg">
            <Layers size={14} />
          </div>
          Layered Packing: Active
        </div>
        
        <div className="flex items-center gap-2 px-4 py-2 bg-white text-emerald-700 rounded-2xl text-xs font-black border-2 border-emerald-50 shadow-sm hover:shadow-md transition-shadow">
          <div className="p-1 bg-emerald-50 rounded-lg">
            <LayoutGrid size={14} />
          </div>
          Grid Optimization: Enabled
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className={cn(
          "bg-white rounded-3xl p-6 border-2 transition-all hover:shadow-xl group",
          isCourier ? "border-blue-50 hover:border-blue-200" : "border-emerald-50 hover:border-emerald-200"
        )}>
          <div className="flex items-center gap-3 mb-4">
            <div className={cn(
              "p-2.5 rounded-xl group-hover:scale-110 transition-transform",
              isCourier ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600"
            )}>
              <Package size={20} />
            </div>
            <span className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">Total Boxes</span>
          </div>
          <div className="text-3xl font-black text-zinc-900 tracking-tight">
            {isSession ? sessionResult.totalBoxes : result.totalBoxesNeeded}
          </div>
          <div className="mt-2 text-[10px] font-bold text-zinc-400 uppercase">Master Boxes to Order</div>
        </div>

        <div className="bg-white rounded-3xl p-6 border-2 border-zinc-50 hover:border-zinc-200 transition-all hover:shadow-xl group">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-zinc-50 text-zinc-600 rounded-xl group-hover:scale-110 transition-transform">
              <Weight size={20} />
            </div>
            <span className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">Total Weight</span>
          </div>
          <div className="text-3xl font-black text-zinc-900 tracking-tight">
            {(isSession ? sessionResult.totalWeight : (isCourier ? result.boxWeight * result.totalBoxesNeeded : result.palletWeight)).toFixed(1)} <span className="text-lg text-zinc-400">kg</span>
          </div>
          <div className="mt-2 text-[10px] font-bold text-zinc-400 uppercase">Gross Shipment Weight</div>
        </div>

        <div className="bg-white rounded-3xl p-6 border-2 border-purple-50 hover:border-purple-200 transition-all hover:shadow-xl group">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl group-hover:scale-110 transition-transform">
              <LayoutGrid size={20} />
            </div>
            <span className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">Utilization</span>
          </div>
          <div className="text-3xl font-black text-zinc-900 tracking-tight">
            {((isSession ? sessionResult.overallUtilization : (isCourier ? result.boxVolumeUtilization : result.palletVolumeUtilization)) * 100).toFixed(1)} <span className="text-lg text-zinc-400">%</span>
          </div>
          <div className="mt-2 text-[10px] font-bold text-zinc-400 uppercase">Volume Efficiency</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pallets Info - Only show if not boxes-only */}
        {calculationMode === 'full' && (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-emerald-900 flex items-center gap-1.5">
              <Package size={16} />
              Pallets ({isSession ? sessionResult.pallets.length : result.totalPalletsNeeded})
            </h3>
            <div className="bg-white/60 rounded-xl p-3 space-y-2 border border-emerald-100">
              {isSession ? (
                sessionResult.pallets.map((p, i) => (
                  <div key={i} className="flex justify-between items-center text-sm">
                    <div>
                      <span className="text-emerald-700 font-medium">Pallet {i + 1} ({currentPallet.name})</span>
                      <div className="text-[10px] text-emerald-600">{currentPallet.length}x{currentPallet.width}x{currentPallet.height} mm</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-emerald-900">{p.weight.toFixed(1)} kg</div>
                    </div>
                  </div>
                ))
              ) : (
                <>
                  {(!result.isLastPalletDifferent || result.totalPalletsNeeded > 1) && (
                    <div className="flex justify-between items-center text-sm">
                      <div>
                        <span className="text-emerald-700 font-medium">
                          {currentPallet.name} ({result.isLastPalletDifferent ? result.totalPalletsNeeded - 1 : result.totalPalletsNeeded})
                        </span>
                        <div className="text-[10px] text-emerald-600">{currentPallet.length}x{currentPallet.width}x{currentPallet.height} mm</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-emerald-900">{result.balancedPalletWeight.toFixed(1)} kg</div>
                      </div>
                    </div>
                  )}
                  {result.isLastPalletDifferent && (
                    <div className="flex justify-between items-center text-sm">
                      <div>
                        <span className="text-emerald-700 font-medium">
                          {currentPallet.name} {result.totalPalletsNeeded === 1 ? '(1)' : '(Last)'}
                        </span>
                        <div className="text-[10px] text-emerald-600">{currentPallet.length}x{currentPallet.width}x{currentPallet.height} mm</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-emerald-900">{result.lastPalletWeight.toFixed(1)} kg</div>
                      </div>
                    </div>
                  )}
                </>
              )}
              <div className="pt-2 mt-2 border-t border-emerald-200/50 flex justify-between items-center">
                <span className="text-emerald-800 font-bold">Total Weight</span>
                <span className="text-lg font-black text-emerald-900">
                  {isSession ? sessionResult.totalWeight.toFixed(1) : ((result.isLastPalletDifferent ? result.totalPalletsNeeded - 1 : result.totalPalletsNeeded) * result.balancedPalletWeight + (result.isLastPalletDifferent ? result.lastPalletWeight : 0)).toFixed(1)} kg
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Boxes Info */}
        <div className={cn("space-y-3", calculationMode === 'boxes-only' && "md:col-span-2")}>
          <h3 className={cn(
            "text-sm font-bold flex items-center gap-1.5",
            isCourier ? "text-blue-900" : "text-emerald-900"
          )}>
            <BoxIcon size={16} />
            3. PACKED BOXES DETAILS
          </h3>
          <div className={cn(
            "bg-white/60 rounded-xl p-3 space-y-2 border",
            isCourier ? "border-blue-100" : "border-emerald-100"
          )}>
            {Array.from(boxRequirements.entries()).map(([key, req], i) => (
              <div key={i} className={cn(
                "flex justify-between items-center text-sm p-2 bg-white/40 rounded-lg border",
                isCourier ? "border-blue-50/50" : "border-emerald-50/50"
              )}>
                <div>
                  <div className={cn("font-bold", isCourier ? "text-blue-700" : "text-emerald-700")}>{key.split('-')[0]}</div>
                  <div className={cn("text-[10px] font-mono", isCourier ? "text-blue-600" : "text-emerald-600")}>{req.length}x{req.width}x{req.height} mm</div>
                  <div className={cn("text-[10px] mt-1", isCourier ? "text-blue-600" : "text-emerald-600")}>
                    <span className={cn("px-1 rounded", isCourier ? "bg-blue-100" : "bg-emerald-100")}>Weight: {req.count === 1 && req.isLastDifferent ? req.lastBoxWeight?.toFixed(1) : req.boxWeight.toFixed(1)} kg/box</span>
                    {req.count > 1 && req.isLastDifferent && <span className="ml-2 bg-amber-100 px-1 rounded">Last box: {req.lastBoxWeight?.toFixed(1)} kg</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className={cn("text-xs uppercase font-bold mb-1", isCourier ? "text-blue-600" : "text-emerald-600")}>Quantity</div>
                  <div className={cn("text-xl font-black", isCourier ? "text-blue-900" : "text-emerald-900")}>{req.count} <span className="text-xs font-normal">pcs</span></div>
                  <div className={cn("text-[10px] font-medium mt-1", isCourier ? "text-blue-600" : "text-emerald-600")}>{req.totalWeight.toFixed(1)} kg total</div>
                </div>
              </div>
            ))}
            <div className={cn(
              "pt-3 mt-3 border-t flex justify-between items-center",
              isCourier ? "border-blue-200" : "border-emerald-200"
            )}>
              <div>
                <span className={cn("font-bold", isCourier ? "text-blue-800" : "text-emerald-800")}>Total Shipment Summary</span>
                <div className={cn("text-[10px]", isCourier ? "text-blue-600" : "text-emerald-600")}>Sum of all packages to be sent</div>
              </div>
              <div className="text-right">
                <span className={cn("text-2xl font-black", isCourier ? "text-blue-900" : "text-emerald-900")}>
                  {isSession ? sessionResult.totalBoxes : result.totalBoxesNeeded} <span className="text-sm font-normal">BOXES</span>
                </span>
                <div className={cn(
                  "text-xs font-bold",
                  isCourier ? "text-blue-700" : "text-emerald-700"
                )}>
                  Total Weight: {totalBoxesWeight.toFixed(1)} kg
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

};

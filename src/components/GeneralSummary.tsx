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
  Info 
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
      "border rounded-2xl p-5 shadow-sm mb-6 transition-colors duration-300",
      isCourier 
        ? "bg-blue-50 border-blue-200" 
        : "bg-emerald-50 border-emerald-200"
    )}>
      <div className="flex items-center justify-between mb-4">
        <div className={cn(
          "flex items-center gap-2",
          isCourier ? "text-blue-800" : "text-emerald-800"
        )}>
          <ClipboardList size={20} />
          <h2 className="font-bold text-lg">Loading Summary</h2>
        </div>
        <div className="flex gap-2">
          <span className={cn(
            "px-2 py-1 text-[10px] font-bold rounded uppercase border",
            isCourier ? "bg-blue-100 text-blue-700 border-blue-200" : "bg-emerald-100 text-emerald-700 border-emerald-200"
          )}>
            {shippingMethod}
          </span>
          <span className="px-2 py-1 bg-zinc-100 text-zinc-700 text-[10px] font-bold rounded uppercase border border-zinc-200">
            {calculationMode.replace('-', ' ')}
          </span>
        </div>
      </div>

      {/* Stability Status - Only show if not boxes-only */}
      {calculationMode === 'full' && (
        <div className={`mb-6 p-4 rounded-xl border flex items-start gap-3 ${isStable ? 'bg-emerald-100/50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
          {isStable ? (
            <CheckCircle2 className="text-emerald-600 mt-0.5" size={18} />
          ) : (
            <AlertTriangle className="text-amber-600 mt-0.5" size={18} />
          )}
          <div>
            <div className={`font-bold text-sm ${isStable ? 'text-emerald-800' : 'text-amber-800'}`}>
              Pallet Stability: {isStable ? 'Stable' : 'Unstable'}
            </div>
            {allWarnings.length > 0 ? (
              <ul className="mt-1 space-y-1">
                {allWarnings.map((warning, idx) => (
                  <li key={idx} className="text-xs text-amber-700 flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-amber-400" />
                    {warning}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-emerald-700 mt-0.5">All boxes are properly supported and balanced.</p>
            )}
          </div>
        </div>
      )}

      {/* Moved Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className={cn(
          "bg-white/60 rounded-xl p-4 border",
          isCourier ? "border-blue-100" : "border-emerald-100"
        )}>
          <div className={cn(
            "text-xs font-bold uppercase mb-1",
            isCourier ? "text-blue-700" : "text-emerald-700"
          )}>
            {isSession ? 'Total Boxes' : 'Parts per Box'}
          </div>
          <div className={cn(
            "text-2xl font-bold",
            isCourier ? "text-blue-900" : "text-emerald-900"
          )}>
            {isSession ? sessionResult.totalBoxes : result.partsPerBox}
          </div>
          <div className={cn(
            "text-xs mt-1",
            isCourier ? "text-blue-600" : "text-emerald-600"
          )}>
            {isSession ? 'Across all simulations' : `Utilization: ${(result.boxVolumeUtilization * 100).toFixed(1)}%`}
          </div>
        </div>
        <div className={cn(
          "bg-white/60 rounded-xl p-4 border",
          isCourier ? "border-blue-100" : "border-emerald-100"
        )}>
          <div className={cn(
            "text-xs font-bold uppercase mb-1",
            isCourier ? "text-blue-700" : "text-emerald-700"
          )}>
            {calculationMode === 'full' ? (isSession ? 'Total Pallets' : 'Boxes per Pallet') : 'Total Weight'}
          </div>
          <div className={cn(
            "text-2xl font-bold",
            isCourier ? "text-blue-900" : "text-emerald-900"
          )}>
            {calculationMode === 'full' 
              ? (isSession ? sessionResult.pallets.length : Math.min(result.totalBoxesNeeded, result.boxesPerPallet))
              : totalBoxesWeight.toFixed(1)
            }
            {calculationMode === 'full' && !isSession && <span className="text-sm opacity-50 font-normal ml-2">/ {result.boxesPerPallet} max</span>}
            {calculationMode === 'boxes-only' && <span className="text-sm opacity-50 font-normal ml-1">kg</span>}
          </div>
          <div className={cn(
            "text-xs mt-1",
            isCourier ? "text-blue-600" : "text-emerald-600"
          )}>
            {calculationMode === 'full' ? (
              <>Utilization: <span className="font-semibold">
                {((isSession ? sessionResult.overallUtilization : result.palletVolumeUtilization) * 100).toFixed(1)}%
              </span></>
            ) : (
              'Sum of all box weights'
            )}
          </div>
        </div>
        <div className={cn(
          "bg-white/60 rounded-xl p-4 border",
          isCourier ? "border-blue-100" : "border-emerald-100"
        )}>
          <div className={cn(
            "text-xs font-bold uppercase mb-1",
            isCourier ? "text-blue-700" : "text-emerald-700"
          )}>
            {isSession ? 'Total Weight' : (isCourier ? 'Total parts' : 'Total Parts / Pallet')}
          </div>
          <div className={cn(
            "text-2xl font-bold",
            isCourier ? "text-blue-900" : "text-emerald-900"
          )}>
            {isSession 
              ? (calculationMode === 'full' ? sessionResult.totalWeight.toFixed(0) : totalBoxesWeight.toFixed(0)) 
              : (calculationMode === 'full' ? result.totalPartsPerPallet : currentPart.orderQuantity)
            }
            {isSession && <span className="text-sm opacity-50 font-normal ml-1">kg</span>}
          </div>
          <div className={cn(
            "text-xs mt-1",
            isCourier ? "text-blue-600" : "text-emerald-600"
          )}>
            {isSession ? 'Gross shipment weight' : (calculationMode === 'full' ? `Total Weight: ${result.palletWeight.toFixed(1)} kg` : 'Total order quantity')}
          </div>
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

import React from 'react';
import { ClipboardList, Package, Box as BoxIcon, Weight } from 'lucide-react';
import { PackingResult, SessionResult, Simulation, Container, Pallet } from '../types';

export const GeneralSummary = ({ 
  result, 
  sessionResult, 
  simulations,
  currentBox,
  currentPallet
}: { 
  result: PackingResult, 
  sessionResult?: SessionResult | null,
  simulations: Simulation[],
  currentBox: Container,
  currentPallet: Pallet
}) => {
  const isSession = !!sessionResult && simulations.length > 0;

  // Calculate box requirements
  const boxRequirements = new Map<string, { count: number, length: number, width: number, height: number, boxWeight: number, totalWeight: number }>();
  
  if (isSession) {
    simulations.forEach(sim => {
      const key = `${sim.box.name}-${sim.box.length}x${sim.box.width}x${sim.box.height}`;
      const existing = boxRequirements.get(key) || { count: 0, length: sim.box.length, width: sim.box.width, height: sim.box.height, boxWeight: sim.result.boxWeight, totalWeight: 0 };
      boxRequirements.set(key, { 
        ...existing, 
        count: existing.count + sim.result.totalBoxesNeeded,
        totalWeight: existing.totalWeight + (sim.result.totalBoxesNeeded * sim.result.boxWeight)
      });
    });
  } else {
    const key = `${currentBox.name}-${currentBox.length}x${currentBox.width}x${currentBox.height}`;
    boxRequirements.set(key, { 
      count: result.totalBoxesNeeded, 
      length: currentBox.length,
      width: currentBox.width, 
      height: currentBox.height,
      boxWeight: result.boxWeight,
      totalWeight: result.totalBoxesNeeded * result.boxWeight
    });
  }

  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 shadow-sm mb-6">
      <div className="flex items-center gap-2 mb-4 text-emerald-800">
        <ClipboardList size={20} />
        <h2 className="font-bold text-lg">Loading Summary</h2>
      </div>

      {/* Moved Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white/60 rounded-xl p-4 border border-emerald-100">
          <div className="text-xs font-bold text-emerald-700 uppercase mb-1">
            {isSession ? 'Total Boxes' : 'Parts per Box'}
          </div>
          <div className="text-2xl font-bold text-emerald-900">
            {isSession ? sessionResult.totalBoxes : result.partsPerBox}
          </div>
          <div className="text-xs text-emerald-600 mt-1">
            {isSession ? 'Across all simulations' : `Utilization: ${(result.boxVolumeUtilization * 100).toFixed(1)}%`}
          </div>
        </div>
        <div className="bg-white/60 rounded-xl p-4 border border-emerald-100">
          <div className="text-xs font-bold text-emerald-700 uppercase mb-1">
            {isSession ? 'Total Pallets' : 'Boxes per Pallet'}
          </div>
          <div className="text-2xl font-bold text-emerald-900">
            {isSession ? sessionResult.pallets.length : Math.min(result.totalBoxesNeeded, result.boxesPerPallet)}
            {!isSession && <span className="text-sm text-emerald-600/70 font-normal ml-2">/ {result.boxesPerPallet} max</span>}
          </div>
          <div className="text-xs text-emerald-600 mt-1">
            Utilization: <span className="font-semibold">
              {((isSession ? sessionResult.overallUtilization : result.palletVolumeUtilization) * 100).toFixed(1)}%
            </span>
          </div>
        </div>
        <div className="bg-white/60 rounded-xl p-4 border border-emerald-100">
          <div className="text-xs font-bold text-emerald-700 uppercase mb-1">
            {isSession ? 'Total Weight' : 'Total Parts / Pallet'}
          </div>
          <div className="text-2xl font-bold text-emerald-900">
            {isSession ? sessionResult.totalWeight.toFixed(0) : result.totalPartsPerPallet}
            {isSession && <span className="text-sm text-emerald-600/70 font-normal ml-1">kg</span>}
          </div>
          <div className="text-xs text-emerald-600 mt-1">
            {isSession ? 'Gross shipment weight' : `Total Weight: ${result.palletWeight.toFixed(1)} kg`}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pallets Info */}
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
                <div className="flex justify-between items-center text-sm">
                  <div>
                    <span className="text-emerald-700 font-medium">{currentPallet.name} ({result.isLastPalletDifferent ? result.totalPalletsNeeded - 1 : result.totalPalletsNeeded})</span>
                    <div className="text-[10px] text-emerald-600">{currentPallet.length}x{currentPallet.width}x{currentPallet.height} mm</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-emerald-900">{result.balancedPalletWeight.toFixed(1)} kg</div>
                  </div>
                </div>
                {result.isLastPalletDifferent && (
                  <div className="flex justify-between items-center text-sm">
                    <div>
                      <span className="text-emerald-700 font-medium">{currentPallet.name} (Last)</span>
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

        {/* Boxes Info */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-emerald-900 flex items-center gap-1.5">
            <BoxIcon size={16} />
            Boxes
          </h3>
          <div className="bg-white/60 rounded-xl p-3 space-y-2 border border-emerald-100">
            {Array.from(boxRequirements.entries()).map(([key, req], i) => (
              <div key={i} className="flex justify-between items-center text-sm">
                <div>
                  <div className="text-emerald-700 font-medium">{key.split('-')[0]}</div>
                  <div className="text-[10px] text-emerald-600">{req.length}x{req.width}x{req.height} mm</div>
                  <div className="text-[10px] text-emerald-600">Loaded weight: {req.boxWeight.toFixed(1)} kg/box</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-emerald-900">{req.count} pcs</div>
                  <div className="text-[10px] text-emerald-600 font-medium">{req.totalWeight.toFixed(1)} kg total</div>
                </div>
              </div>
            ))}
            <div className="pt-2 mt-2 border-t border-emerald-200/50 flex justify-between items-center">
              <span className="text-emerald-800 font-bold">Total Boxes</span>
              <span className="text-lg font-black text-emerald-900">
                {isSession ? sessionResult.totalBoxes : result.totalBoxesNeeded} pcs
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

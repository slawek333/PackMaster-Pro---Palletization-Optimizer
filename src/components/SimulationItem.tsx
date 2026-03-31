import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Trash2, Package, Box as BoxIcon, Edit2 } from 'lucide-react';
import { Simulation } from '../types';

export const SimulationItem = ({ sim, idx, onRemove, onEdit }: { sim: Simulation, idx: number, onRemove: (id: string) => void, onEdit?: (sim: Simulation) => void }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden transition-all duration-200">
      <div 
        className="p-3 flex items-center justify-between cursor-pointer hover:bg-zinc-50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-500 font-bold text-xs">
            {idx + 1}
          </div>
          <div>
            <div className="text-sm font-bold text-zinc-900">{sim.part.name}</div>
            <div className="text-[11px] text-zinc-500 font-medium">
              {sim.quantity} parts • {sim.result.totalBoxesNeeded} boxes
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onEdit && (
            <button 
              onClick={(e) => { e.stopPropagation(); onEdit(sim); }}
              className="p-1.5 text-zinc-400 hover:text-blue-500 hover:bg-blue-50 rounded-md transition-colors"
              title="Edit Simulation"
            >
              <Edit2 size={14} />
            </button>
          )}
          <button 
            onClick={(e) => { e.stopPropagation(); onRemove(sim.id); }}
            className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
            title="Remove Simulation"
          >
            <Trash2 size={14} />
          </button>
          <div className="text-zinc-400">
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
      </div>
      
      {isExpanded && (
        <div className="px-3 pb-3 pt-1 border-t border-zinc-100 bg-zinc-50/50">
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="bg-white p-2 rounded-lg border border-zinc-100">
              <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
                <Package size={12} />
                <span className="text-[10px] font-bold uppercase">Part Details</span>
              </div>
              <div className="text-xs font-medium text-zinc-900">{sim.part.length}x{sim.part.width}x{sim.part.height} mm</div>
              <div className="text-xs text-zinc-500">{sim.part.weight} kg / part</div>
            </div>
            <div className="bg-white p-2 rounded-lg border border-zinc-100">
              <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
                <BoxIcon size={12} />
                <span className="text-[10px] font-bold uppercase">Box Details</span>
              </div>
              <div className="text-xs font-medium text-zinc-900">{sim.box.name}</div>
              <div className="text-[10px] text-zinc-500">{sim.box.length}x{sim.box.width}x{sim.box.height} mm</div>
            </div>
          </div>
          <div className="mt-2 bg-white p-2 rounded-lg border border-zinc-100">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-bold uppercase text-zinc-500">Packing Efficiency</span>
              <span className="text-xs font-bold text-emerald-600">{(sim.result.boxVolumeUtilization * 100).toFixed(1)}%</span>
            </div>
            <div className="text-xs text-zinc-600">
              <span className="font-semibold text-zinc-900">{sim.result.partsPerBox}</span> parts per box
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

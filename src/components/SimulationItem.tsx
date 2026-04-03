import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Trash2, Package, Box, Edit2 } from 'lucide-react';
import { Simulation } from '../types';

export const SimulationItem = ({ sim, idx, onRemove, onEdit }: { sim: Simulation, idx: number, onRemove: (id: string) => void, onEdit?: (sim: Simulation) => void }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden transition-all duration-200 shadow-sm hover:shadow-md">
      <div 
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-zinc-50/50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center text-white font-black text-xs shadow-sm tilted-icon-container">
            {idx + 1}
          </div>
          <div>
            <div className="text-sm font-bold text-zinc-900 tracking-tight">{sim.part.name}</div>
            <div className="text-[11px] text-zinc-500 font-semibold uppercase tracking-wider">
              {sim.quantity} parts • {sim.result.totalBoxesNeeded} boxes
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {onEdit && (
            <button 
              onClick={(e) => { e.stopPropagation(); onEdit(sim); }}
              className="p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-all"
              title="Edit Simulation"
            >
              <Edit2 size={14} />
            </button>
          )}
          <button 
            onClick={(e) => { e.stopPropagation(); onRemove(sim.id); }}
            className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
            title="Remove Simulation"
          >
            <Trash2 size={14} />
          </button>
          <div className="text-zinc-300 ml-1">
            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </div>
      </div>
      
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-zinc-100 bg-zinc-50/30">
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div className="bg-white p-3 rounded-xl border border-zinc-100 shadow-sm">
              <div className="flex items-center gap-2 text-zinc-400 mb-2">
                <Package size={14} />
                <span className="text-[10px] font-black uppercase tracking-widest">Part Details</span>
              </div>
              <div className="text-xs font-bold text-zinc-900">{sim.part.length}x{sim.part.width}x{sim.part.height} mm</div>
              <div className="text-[11px] text-zinc-500 mt-0.5">{sim.part.weight} kg / unit</div>
            </div>
            <div className="bg-white p-3 rounded-xl border border-zinc-100 shadow-sm">
              <div className="flex items-center gap-2 text-zinc-400 mb-2">
                <Box size={14} />
                <span className="text-[10px] font-black uppercase tracking-widest">Box Details</span>
              </div>
              <div className="text-xs font-bold text-zinc-900 truncate">{sim.box.name}</div>
              <div className="text-[11px] text-zinc-500 mt-0.5">{sim.box.length}x{sim.box.width}x{sim.box.height} mm</div>
            </div>
          </div>
          <div className="mt-3 bg-white p-3 rounded-xl border border-zinc-100 shadow-sm">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Efficiency</span>
              <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{(sim.result.boxVolumeUtilization * 100).toFixed(1)}%</span>
            </div>
            <div className="text-xs text-zinc-600 font-medium">
              <span className="font-black text-zinc-900">{sim.result.partsPerBox}</span> parts per master box
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

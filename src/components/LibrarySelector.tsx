import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Trash2, Calendar, Ruler, Weight, Tag, Check, Edit2 } from 'lucide-react';
import { cn } from '../lib/utils';

export type SortOption = 'date' | 'name' | 'dimensions' | 'weight';

interface LibrarySelectorProps {
  items: any[];
  selectedId: string;
  selectedIds?: string[];
  onSelect: (id: string) => void;
  onMultiSelect?: (ids: string[]) => void;
  onDelete: (id: string) => void;
  onEdit?: (id: string) => void;
  itemType: 'part' | 'box';
  colorTheme: 'blue' | 'orange';
}

export const LibrarySelector: React.FC<LibrarySelectorProps> = ({ 
  items, 
  selectedId, 
  selectedIds = [], 
  onSelect, 
  onMultiSelect, 
  onDelete, 
  onEdit, 
  itemType, 
  colorTheme 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const isMultiSelectEnabled = !!onMultiSelect;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      let valA, valB;
      if (sortBy === 'name') {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (sortBy === 'dimensions') {
        valA = a.length * a.width * a.height;
        valB = b.length * b.width * b.height;
      } else if (sortBy === 'weight') {
        valA = a.weight ?? a.emptyWeight ?? 0;
        valB = b.weight ?? b.emptyWeight ?? 0;
      } else {
        valA = a.createdAt || 0;
        valB = b.createdAt || 0;
      }

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [items, sortBy, sortAsc]);

  const selectedItem = items.find(i => i.id === selectedId);

  const themeClasses = colorTheme === 'blue' 
    ? {
        border: 'border-blue-200',
        bgHover: 'hover:bg-blue-50',
        text: 'text-blue-600',
        bgActive: 'bg-blue-100',
        ring: 'focus:ring-blue-500',
        icon: 'text-blue-500'
      }
    : {
        border: 'border-orange-200',
        bgHover: 'hover:bg-orange-50',
        text: 'text-orange-600',
        bgActive: 'bg-orange-100',
        ring: 'focus:ring-orange-500',
        icon: 'text-orange-500'
      };

  const handleSort = (option: SortOption) => {
    if (sortBy === option) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(option);
      setSortAsc(true);
    }
  };

  const SortButton = ({ option, icon: Icon, label }: { option: SortOption, icon: any, label: string }) => {
    const isActive = sortBy === option;
    return (
      <button
        onClick={(e) => { e.stopPropagation(); handleSort(option); }}
        className={cn(
          "flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap",
          isActive ? cn(themeClasses.bgActive, themeClasses.text) : "text-zinc-500 hover:bg-zinc-100"
        )}
      >
        <Icon size={14} className={isActive ? themeClasses.icon : "text-zinc-400"} />
        {label}
        {isActive && (
          <span className="ml-0.5 font-black">
            {sortAsc ? '↑' : '↓'}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="relative w-full" ref={ref}>
      <div 
        onClick={() => setIsOpen(!isOpen)} 
        className={cn(
          "flex items-center justify-between px-4 py-3 bg-white border rounded-xl cursor-pointer transition-all shadow-sm",
          themeClasses.border,
          isOpen ? "ring-2 shadow-md " + themeClasses.ring : "hover:shadow-md hover:border-zinc-300"
        )}
      >
        <div className="flex flex-col">
          <span className="text-sm font-bold text-zinc-900">{selectedItem?.name || 'Select item...'}</span>
          {selectedItem && (
            <span className="text-[10px] font-semibold text-zinc-500 mt-0.5">
              {selectedItem.length}x{selectedItem.width}x{selectedItem.height}mm • {selectedItem.weight ?? selectedItem.emptyWeight}kg
            </span>
          )}
        </div>
        <ChevronDown size={18} className={cn("text-zinc-400 transition-transform duration-300", isOpen && "rotate-180")} />
      </div>

      {isOpen && (
        <div className="absolute z-50 top-full left-0 right-0 mt-2 bg-white border border-zinc-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-2 border-b border-zinc-100 bg-zinc-50/80 flex gap-1 overflow-x-auto custom-scrollbar">
            <SortButton option="date" icon={Calendar} label="Date" />
            <SortButton option="name" icon={Tag} label="Name" />
            <SortButton option="dimensions" icon={Ruler} label="Size" />
            <SortButton option="weight" icon={Weight} label="Weight" />
          </div>
          
          <div className="max-h-64 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {sortedItems.map(item => {
              const isChecked = selectedIds.includes(item.id);
              return (
                <div 
                  key={item.id} 
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-xl cursor-pointer transition-all",
                    selectedId === item.id ? themeClasses.bgActive : themeClasses.bgHover
                  )}
                  onClick={() => { onSelect(item.id); setIsOpen(false); }}
                >
                  {onMultiSelect && (
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        const nextIds = isChecked 
                          ? selectedIds.filter(id => id !== item.id)
                          : [...selectedIds, item.id];
                        onMultiSelect(nextIds);
                      }}
                      className={cn(
                        "w-5 h-5 flex-shrink-0 rounded-md border flex items-center justify-center transition-all",
                        isChecked ? "bg-zinc-900 border-zinc-900 text-white" : "border-zinc-300 bg-white hover:border-zinc-400"
                      )}
                    >
                      {isChecked && <Check size={12} strokeWidth={4} />}
                    </div>
                  )}
                  <div className="flex-1 flex flex-col min-w-0">
                    <span className={cn("text-sm font-bold truncate", selectedId === item.id ? themeClasses.text : "text-zinc-900")}>
                      {item.name}
                    </span>
                    <span className={cn("text-[10px] font-semibold mt-0.5", selectedId === item.id ? themeClasses.text : "text-zinc-500")}>
                      {item.length}x{item.width}x{item.height}mm • {item.weight ?? item.emptyWeight}kg
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {onEdit && (
                      <button 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          onEdit(item.id); 
                          setIsOpen(false);
                        }}
                        className="p-1.5 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        title="Edit Details"
                      >
                        <Edit2 size={14} />
                      </button>
                    )}
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        onDelete(item.id); 
                        if (selectedId === item.id) setIsOpen(false);
                      }}
                      className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

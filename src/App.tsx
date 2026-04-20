/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Package, 
  Box, 
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Truck, 
  Download, 
  Mail,
  RotateCcw, 
  Maximize2, 
  Weight, 
  ChevronRight,
  ChevronLeft,
  Info,
  Layers,
  LayoutGrid,
  Plus,
  Trash2,
  Edit2,
  Check,
  Archive,
  Palette,
  Settings,
  Zap,
  ShieldCheck,
  Eye,
  Camera,
  Move
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Edges, Center, Environment, ContactShadows, Bounds, useBounds, Text, Html, TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Part, Container, Pallet, PackingResult, PackedBox, PalletLoad, ShipmentItem } from './types';
import { GeneralSummary } from './components/GeneralSummary';
import { optimizePacking, suggestBestBox, optimizeMixedShipment } from './utils/packing';
import { exportToExcel, downloadImportTemplate } from './utils/export';
import { sendEmailReport } from './utils/email';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { LibrarySelector } from './components/LibrarySelector';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const STANDARD_PALLETS: Pallet[] = [
  { id: 'euro', name: 'Euro Pallet (EPAL)', description: 'Standard European pallet', length: 1200, width: 800, height: 150, maxWeight: 1500, maxHeight: 2000, emptyWeight: 25 },
  { id: 'half', name: 'Half Pallet', description: 'Smaller pallet for retail', length: 800, width: 600, height: 150, maxWeight: 500, maxHeight: 2000, emptyWeight: 10 },
  { id: 'ind', name: 'Industrial Pallet', description: 'Heavy duty industrial pallet', length: 1200, width: 1000, height: 150, maxWeight: 1500, maxHeight: 2000, emptyWeight: 30 },
  { id: 'custom', name: 'Custom Pallet', description: 'User-defined dimensions', length: 1200, width: 800, height: 150, maxWeight: 1500, maxHeight: 2000, emptyWeight: 25 },
];

const INITIAL_PARTS: Part[] = [
  { id: 'p1', name: 'New Part', description: 'Enter part description...', length: 100, width: 100, height: 100, weight: 1.0, orderQuantity: 100, createdAt: Date.now() },
];

const INITIAL_BOXS: Container[] = [
  { id: 'c1', name: 'Master Box K3', length: 600, width: 400, height: 400, maxWeight: 25, emptyWeight: 0.8, createdAt: Date.now() },
  { id: 'c2', name: 'Large Box XL', length: 800, width: 600, height: 500, maxWeight: 40, emptyWeight: 1.5, createdAt: Date.now() - 1000 },
];

interface Box3DProps {
  width: number;
  height: number;
  depth: number;
  color: string;
  borderColor: string;
  className?: string;
  label?: string;
}

const Box3D = ({ width, height, depth, color, borderColor, className, label }: Box3DProps) => {
  return null; // Deprecated in favor of Three.js
};

interface MeshBoxProps {
  position: [number, number, number];
  args: [number, number, number];
  color: string;
  edgeColor: string;
  opacity?: number;
  onClick?: () => void;
  isSelected?: boolean;
  isStable?: boolean;
  tooltipData?: {
    name: string;
    partsCount?: number;
    partName?: string;
    weight?: number;
  };
}

const MeshBox = ({ position, args, color, edgeColor, opacity = 1, onClick, isSelected, isStable = true, tooltipData }: MeshBoxProps) => {
  const [hovered, setHovered] = useState(false);
  
  const finalColor = !isStable ? "#ef4444" : (isSelected ? "#fbbf24" : color);
  const finalEdgeColor = !isStable ? "#b91c1c" : (isSelected ? "#f59e0b" : edgeColor);

  return (
    <group position={position}>
      <mesh 
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
          setHovered(true);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'auto';
          setHovered(false);
        }}
      >
        <boxGeometry args={args} />
        <meshStandardMaterial 
          color={finalColor} 
          transparent={opacity < 1 || isSelected || !isStable} 
          opacity={!isStable ? 0.8 : (isSelected ? 0.9 : opacity)} 
          metalness={isSelected ? 0.5 : 0.1}
          roughness={isSelected ? 0.2 : 0.8}
        />
        <Edges color={finalEdgeColor} threshold={15} />
      </mesh>
      {hovered && tooltipData && (
        <Html distanceFactor={10} position={[0, args[1]/2 + 0.1, 0]} center zIndexRange={[100, 0]}>
          <div className="bg-zinc-900 text-white text-[10px] px-2 py-1.5 rounded shadow-lg whitespace-nowrap pointer-events-none flex flex-col gap-0.5">
            <div className="font-bold text-amber-400">{tooltipData.name}</div>
            {tooltipData.partName && <div>Part: {tooltipData.partName}</div>}
            {tooltipData.partsCount !== undefined && <div>Qty: {tooltipData.partsCount} pcs</div>}
            {tooltipData.weight !== undefined && <div>Weight: {tooltipData.weight.toFixed(2)} kg</div>}
          </div>
        </Html>
      )}
    </group>
  );
};

const PalletMesh = ({ pallet }: { pallet: Pallet }) => {
  const scale = 0.01; // mm to meters for Three.js
  const w = pallet.length * scale;
  const d = pallet.width * scale;
  const h = pallet.height * scale;

  const woodColor = "#e1c699"; // Realistic light wood color
  const edgeColor = "#b08d55";

  // EPAL proportions (144mm total height)
  const tTop = h * (22 / 144);
  const tStringer = h * (22 / 144);
  const tBlock = h * (78 / 144);
  const tBottom = h * (22 / 144);

  // Widths (800mm total depth)
  const boardWide = d * (145 / 800);
  const boardNarrow = d * (100 / 800);
  const gap = d * (41.25 / 800);

  // Stringer widths (1200mm total length)
  const stringerW = w * (145 / 1200);

  const yTop = -tTop / 2;
  const yStringer = -tTop - tStringer / 2;
  const yBlock = -tTop - tStringer - tBlock / 2;
  const yBottom = -tTop - tStringer - tBlock - tBottom / 2;

  const xLeft = -w / 2 + stringerW / 2;
  const xCenter = 0;
  const xRight = w / 2 - stringerW / 2;
  const xPositions = [xLeft, xCenter, xRight];

  const zFront = -d / 2 + boardWide / 2;
  const zMiddle = 0;
  const zBack = d / 2 - boardWide / 2;
  const zPositions = [zFront, zMiddle, zBack];

  const zTopPositions = [
    -d / 2 + boardWide / 2,
    -d / 2 + boardWide + gap + boardNarrow / 2,
    0,
    d / 2 - boardWide - gap - boardNarrow / 2,
    d / 2 - boardWide / 2
  ];
  const zTopWidths = [boardWide, boardNarrow, boardWide, boardNarrow, boardWide];

  return (
    <group position={[0, 0, 0]}>
      {/* Bottom boards (3) - running along length (X) */}
      {zPositions.map((z, i) => (
        <MeshBox key={`bottom-${i}`} position={[0, yBottom, z]} args={[Math.max(0.001, w), Math.max(0.001, tBottom), Math.max(0.001, boardWide)]} color={woodColor} edgeColor={edgeColor} />
      ))}

      {/* Blocks (9) */}
      {xPositions.map((x, i) => (
        zPositions.map((z, j) => (
          <MeshBox key={`block-${i}-${j}`} position={[x, yBlock, z]} args={[Math.max(0.001, stringerW), Math.max(0.001, tBlock), Math.max(0.001, boardWide)]} color={woodColor} edgeColor={edgeColor} />
        ))
      ))}

      {/* Stringer boards (3) - running along width (Z) */}
      {xPositions.map((x, i) => (
        <MeshBox key={`stringer-${i}`} position={[x, yStringer, 0]} args={[Math.max(0.001, stringerW), Math.max(0.001, tStringer), Math.max(0.001, d)]} color={woodColor} edgeColor={edgeColor} />
      ))}

      {/* Top boards (5) - running along length (X) */}
      {zTopPositions.map((z, i) => (
        <MeshBox key={`top-${i}`} position={[0, yTop, z]} args={[Math.max(0.001, w), Math.max(0.001, tTop), Math.max(0.001, zTopWidths[i])]} color={woodColor} edgeColor={edgeColor} />
      ))}
    </group>
  );
};

const NumberInput = ({ value, onChange, className, min, max, step }: any) => {
  const [localValue, setLocalValue] = useState(value === 0 ? '' : value.toString());
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (value !== prevValueRef.current) {
      const numLocal = Number(localValue);
      if (value !== numLocal && !(Number.isNaN(value) && Number.isNaN(numLocal))) {
        setLocalValue(value === 0 ? '' : value.toString());
      }
      prevValueRef.current = value;
    }
  }, [value, localValue]);

  const numVal = Number(localValue);
  const isInvalid = 
    localValue === '' || 
    isNaN(numVal) || 
    (min !== undefined && numVal < min) || 
    (max !== undefined && numVal > max);

  let errorMsg = "";
  if (isInvalid) {
    if (localValue === '' || isNaN(numVal)) errorMsg = ""; // Removed "Required"
    else if (min !== undefined && numVal < min) errorMsg = `Min: ${min}`;
    else if (max !== undefined && numVal > max) errorMsg = `Max: ${max}`;
  }

  return (
    <>
      <input
        type="number"
        value={localValue}
        onChange={e => {
          setLocalValue(e.target.value);
          const val = e.target.value;
          const num = Number(val);
          const invalid = 
            val === '' || 
            isNaN(num) || 
            (min !== undefined && num < min) || 
            (max !== undefined && num > max);
          
          if (!invalid) {
            onChange({ target: { value: val } });
          }
        }}
        className={cn(className, isInvalid && "border-red-500 focus:border-red-500 focus:ring-red-500 bg-red-50")}
        min={min}
        max={max}
        step={step}
      />
      {isInvalid && (
        <span className="block text-[10px] text-red-500 mt-1 font-medium leading-none">
          {errorMsg}
        </span>
      )}
    </>
  );
};

const CameraController = ({ viewMode, result, selectedId }: { viewMode: string, result: any, selectedId: string | number | null }) => {
  const { controls } = useThree();
  const bounds = useBounds();
  
  useEffect(() => {
    if (!controls) return;
    
    // Always refresh bounds when viewMode or result changes
    bounds.refresh().clip();
    bounds.fit();
  }, [viewMode, result, bounds, controls, selectedId]);

  return null;
};

const CanvasCapture = ({ onCapture }: { onCapture: (dataUrl: string) => void }) => {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    // Wait for a frame to render and ensure preserveDrawingBuffer is respected
    const timer = setTimeout(() => {
      gl.render(scene, camera);
      onCapture(gl.domElement.toDataURL('image/png'));
    }, 1000); // Give it a full second to ensure everything is rendered and positioned
    return () => clearTimeout(timer);
  }, [gl, scene, camera, onCapture]);
  return null;
};

const PackingCanvas = React.memo(({ 
  viewMode, 
  part, 
  box, 
  pallet, 
  result,
  selectedPalletIndex,
  onCapture,
  isLastBox,
  onResultChange
}: { 
  viewMode: 'pallet' | 'box', 
  part: Part, 
  box: Container, 
  pallet: Pallet, 
  result: PackingResult,
  selectedPalletIndex: number | null,
  onCapture?: (img: string) => void,
  isLastBox?: boolean,
  onResultChange?: (newResult: PackingResult) => void
}) => {
  if (!result || !box || !part || !pallet) return null;
  if (box.length <= 0 || box.width <= 0 || box.height <= 0) return null;

  const scale = 0.01;
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const orbitControlsRef = useRef<any>(null);

  const currentPart = part;
  const currentBox = box;
  const currentResult = result;

  const handleBoxMove = (globalId: string, newPosition: [number, number, number]) => {
    if (!onResultChange) return;

    const [palletIdxStr, boxIdxStr] = globalId.replace('p', '').split('-c');
    const pIdx = parseInt(palletIdxStr);
    const bIdx = parseInt(boxIdxStr);

    if (isNaN(pIdx) || isNaN(bIdx)) return;

    const newResult = { ...result };
    if (newResult.pallets && newResult.pallets[pIdx]) {
      const targetBox = newResult.pallets[pIdx].boxes[bIdx];
      // Convert back from Three.js scale to mm
      // Center back to corner: x_corner = x_center - length/2
      targetBox.x = (newPosition[0] - (targetBox.length * scale / 2)) / scale;
      targetBox.z = (newPosition[1] - (targetBox.height * scale / 2)) / scale;
      targetBox.y = (newPosition[2] - (targetBox.width * scale / 2)) / scale;
      
      onResultChange(newResult);
    }
  };

  const handleCameraView = (type: 'top' | 'front' | 'side' | 'perspective') => {
    if (!orbitControlsRef.current) return;
    
    const controls = orbitControlsRef.current;
    orbitControlsRef.current.reset();
    
    const dist = 25;
    switch (type) {
      case 'top':
        controls.object.position.set(0, dist, 0);
        break;
      case 'front': // X-axis view
        controls.object.position.set(0, 0, dist);
        break;
      case 'side': // Z-axis view
        controls.object.position.set(dist, 0, 0);
        break;
      case 'perspective':
        controls.object.position.set(18, 15, 18);
        break;
    }
    controls.update();
  };

  return (
    <div className="w-full h-full min-h-[700px] flex-1 cursor-move bg-zinc-50/50 relative overflow-hidden">
      {/* 3D Overlay Controls */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <div className="flex bg-white/90 backdrop-blur p-1 rounded-xl shadow-lg border border-zinc-200">
          <button 
            onClick={() => setIsEditMode(false)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
              !isEditMode ? "bg-zinc-900 text-white" : "text-zinc-400 hover:text-zinc-600"
            )}
          >
            <RotateCcw size={12} />
            Orbit
          </button>
          <button 
            onClick={() => setIsEditMode(true)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
              isEditMode ? "bg-amber-500 text-white" : "text-zinc-400 hover:text-zinc-600"
            )}
          >
            <Move size={12} />
            Edit
          </button>
        </div>

        <div className="flex bg-white/90 backdrop-blur p-1 rounded-xl shadow-lg border border-zinc-200">
          <button onClick={() => handleCameraView('top')} className="p-2 text-zinc-500 hover:text-zinc-900" title="Top View"><Layers size={14} /></button>
          <button onClick={() => handleCameraView('front')} className="p-2 text-zinc-500 hover:text-zinc-900" title="Front View"><ArrowDown size={14} /></button>
          <button onClick={() => handleCameraView('side')} className="p-2 text-zinc-500 hover:text-zinc-900" title="Side View"><ArrowRight size={14} /></button>
          <button onClick={() => handleCameraView('perspective')} className="p-2 text-zinc-500 hover:text-zinc-900" title="Perspective"><Maximize2 size={14} /></button>
        </div>
      </div>

      <Canvas 
        shadows 
        dpr={[1, 2]} 
        camera={{ position: [18, 15, 18], fov: 30 }} 
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
        gl={{ preserveDrawingBuffer: true }}
      >
        {onCapture && <CanvasCapture onCapture={onCapture} />}
        <OrbitControls 
          ref={orbitControlsRef}
          makeDefault 
          minPolarAngle={0} 
          maxPolarAngle={Math.PI / 2} 
          enableDamping 
          dampingFactor={0.05} 
          enabled={!isEditMode}
        />
        
        <ambientLight intensity={0.9} />
        <pointLight position={[10, 10, 10]} intensity={1.5} castShadow />
        <spotLight position={[-10, 10, -10]} intensity={0.5} />
        
        <Bounds fit clip observe margin={1.05}>
          <CameraController viewMode={viewMode} result={currentResult} selectedId={selectedId} />
          <Center top>
            {viewMode === 'pallet' ? (
              <group onClick={() => setSelectedId(null)}>
                {/* Single Simulation View */}
                {(() => {
                    const palletsCount = result.totalPalletsNeeded || 0;
                    if (palletsCount === 0) return null;

                    const palletsPerRow = Math.ceil(Math.sqrt(palletsCount));
                    const spacing = 400 * scale;
                    
                    return Array.from({ length: palletsCount })
                      .map((_, idx) => idx)
                      .filter(idx => selectedPalletIndex === null || selectedPalletIndex === idx)
                      .map((palletIdx, renderIdx) => {
                        const row = selectedPalletIndex === null ? Math.floor(palletIdx / palletsPerRow) : 0;
                        const col = selectedPalletIndex === null ? palletIdx % palletsPerRow : 0;
                        const offsetX = col * (pallet.length * scale + spacing);
                        const offsetZ = row * (pallet.width * scale + spacing);
                      
                      const isLast = palletIdx === palletsCount - 1;
                      const countOnThisPallet = isLast ? result.lastPalletBoxes : result.boxesPerPalletBalanced;
                      const boxesToRender = result.pallets && result.pallets[palletIdx] ? result.pallets[palletIdx].boxes : (result.boxes?.slice(0, countOnThisPallet) || []);

                    return (
                      <group key={palletIdx} position={[offsetX, 0, offsetZ]}>
                        <PalletMesh pallet={pallet} />
                        <group position={[-pallet.length * scale / 2, 0, -pallet.width * scale / 2]}>
                          {boxesToRender.map((c, i) => {
                            const globalId = `p${palletIdx}-c${i}`;
                            const position: [number, number, number] = [
                              c.x * scale + c.length * scale / 2, 
                              c.z * scale + c.height * scale / 2, 
                              c.y * scale + c.width * scale / 2
                            ];
                            
                            const isSelected = selectedId === globalId;

                            return (
                              <group key={globalId}>
                                <MeshBox 
                                  position={position}
                                  args={[c.length * scale - 0.0005, c.height * scale - 0.0005, c.width * scale - 0.0005]}
                                  color={c.color || "#fef3c7"}
                                  edgeColor={c.edgeColor || "#d97706"}
                                  onClick={() => setSelectedId(globalId)}
                                  isSelected={isSelected}
                                  isStable={c.isStable !== false && result.isStable !== false}
                                  tooltipData={{
                                    name: `${c.length}x${c.width}x${c.height} mm`,
                                    partName: c.partName,
                                    partsCount: c.partsCount,
                                    weight: c.weight
                                  }}
                                />
                                {isEditMode && isSelected && (
                                  <TransformControls 
                                    position={position} 
                                    mode="translate"
                                    onMouseUp={(e: any) => {
                                      // On mouse up, update the actual position in state
                                      // TransformControls children[0] is the gizmo, but we want the position of the target
                                      const target = e.target.object;
                                      if (target) {
                                        handleBoxMove(globalId, [target.position.x, target.position.y, target.position.z]);
                                      }
                                    }}
                                  />
                                )}
                              </group>
                            );
                          })}
                        </group>
                      </group>
                    );
                  });
                })()}
              </group>
            ) : (
              <group onClick={() => setSelectedId(null)}>
                {/* Box Shell */}
                <mesh position={[0, currentBox.height * scale / 2, 0]}>
                  <boxGeometry args={[currentBox.length * scale, currentBox.height * scale, currentBox.width * scale]} />
                  <meshStandardMaterial color="#fdba74" transparent opacity={0.1} side={THREE.DoubleSide} />
                  <Edges color="#f97316" />
                </mesh>

                {/* Parts */}
                {(() => {
                  const layout = currentResult.layout;
                  const partsToRender = isLastBox ? currentResult.partsInLastBox : Math.min(currentResult.partsPerBox, currentPart.orderQuantity);
                  const s = scale;

                  if (layout && layout.type !== 'grid') {
                    const { nx1, ny1, nx2, ny2, l, w, h, x, y, type, nz1, nz2, l2, w2, h2, nx2_layer, ny2_layer } = layout;
                    const pw = l * s;
                    const pd = w * s;
                    const ph = h * s;
                    const pw2_rot = w * s;
                    const pd2_rot = l * s;
                    
                    let maxL = 0;
                    let maxW = 0;
                    
                    const boxes = [];
                    let count = 0;

                    if (type === 'mixed-layer') {
                      maxL = Math.max(nx1 * l, (nx2_layer || 0) * (l2 || 0));
                      maxW = Math.max(ny1 * w, (ny2_layer || 0) * (w2 || 0));

                      // Block 1 (First layers)
                      for (let z = 0; z < (nz1 || 0); z++) {
                        for (let iy = 0; iy < ny1; iy++) {
                          for (let ix = 0; ix < nx1; ix++) {
                            if (count >= partsToRender) break;
                            const currentCount = count;
                            boxes.push(
                              <MeshBox 
                                key={`z${z}-l1-${ix}-${iy}`}
                                position={[ix * pw + pw/2, z * ph + ph/2, iy * pd + pd/2]}
                                args={[Math.max(0.001, pw - 0.005), Math.max(0.001, ph - 0.005), Math.max(0.001, pd - 0.005)]}
                                color="#93c5fd"
                                edgeColor="#3b82f6"
                                onClick={() => setSelectedId(currentCount)}
                                isSelected={selectedId === currentCount}
                              />
                            );
                            count++;
                          }
                        }
                      }

                      // Block 2 (Remaining layers)
                      const pw2 = (l2 || 0) * s;
                      const pd2 = (w2 || 0) * s;
                      const ph2 = (h2 || 0) * s;
                      const startZ = (nz1 || 0) * ph;

                      for (let z = 0; z < (nz2 || 0); z++) {
                        for (let iy = 0; iy < (ny2_layer || 0); iy++) {
                          for (let ix = 0; ix < (nx2_layer || 0); ix++) {
                            if (count >= partsToRender) break;
                            const currentCount = count;
                            boxes.push(
                              <MeshBox 
                                key={`z${z}-l2-${ix}-${iy}`}
                                position={[ix * pw2 + pw2/2, startZ + z * ph2 + ph2/2, iy * pd2 + pd2/2]}
                                args={[Math.max(0.001, pw2 - 0.005), Math.max(0.001, ph2 - 0.005), Math.max(0.001, pd2 - 0.005)]}
                                color="#60a5fa"
                                edgeColor="#2563eb"
                                onClick={() => setSelectedId(currentCount)}
                                isSelected={selectedId === currentCount}
                              />
                            );
                            count++;
                          }
                        }
                      }
                    } else {
                      if (type === 'two-block-v') {
                        maxL = Math.max(nx1 * l, (x || 0) + nx2 * w);
                        maxW = Math.max(ny1 * w, ny2 * l);
                      } else if (type === 'two-block-h') {
                        maxL = Math.max(nx1 * l, nx2 * w);
                        maxW = Math.max(ny1 * w, (y || 0) + ny2 * l);
                      }
                      
                      const nz = currentResult.boxGrid.nz;
                      
                      for (let z = 0; z < nz; z++) {
                        // Block 1
                        for (let iy = 0; iy < ny1; iy++) {
                          for (let ix = 0; ix < nx1; ix++) {
                            if (count >= partsToRender) break;
                            const currentCount = count;
                            boxes.push(
                              <MeshBox 
                                key={`z${z}-b1-${ix}-${iy}`}
                                position={[ix * pw + pw/2, z * ph + ph/2, iy * pd + pd/2]}
                                args={[Math.max(0.001, pw - 0.005), Math.max(0.001, ph - 0.005), Math.max(0.001, pd - 0.005)]}
                                color="#93c5fd"
                                edgeColor="#3b82f6"
                                onClick={() => setSelectedId(currentCount)}
                                isSelected={selectedId === currentCount}
                              />
                            );
                            count++;
                          }
                        }
                        
                        // Block 2
                        if (type === 'two-block-v') {
                          const startX = x! * s;
                          for (let iy = 0; iy < ny2; iy++) {
                            for (let ix = 0; ix < nx2; ix++) {
                              if (count >= partsToRender) break;
                              const currentCount = count;
                              boxes.push(
                                <MeshBox 
                                  key={`z${z}-b2-${ix}-${iy}`}
                                  position={[startX + ix * pw2_rot + pw2_rot/2, z * ph + ph/2, iy * pd2_rot + pd2_rot/2]}
                                  args={[Math.max(0.001, pw2_rot - 0.005), Math.max(0.001, ph - 0.005), Math.max(0.001, pd2_rot - 0.005)]}
                                  color="#93c5fd"
                                  edgeColor="#3b82f6"
                                  onClick={() => setSelectedId(currentCount)}
                                  isSelected={selectedId === currentCount}
                                />
                              );
                              count++;
                            }
                          }
                        } else if (type === 'two-block-h') {
                          const startY = y! * s;
                          for (let iy = 0; iy < ny2; iy++) {
                            for (let ix = 0; ix < nx2; ix++) {
                              if (count >= partsToRender) break;
                              const currentCount = count;
                              boxes.push(
                                <MeshBox 
                                  key={`z${z}-b2-${ix}-${iy}`}
                                  position={[ix * pw2_rot + pw2_rot/2, z * ph + ph/2, startY + iy * pd2_rot + pd2_rot/2]}
                                  args={[Math.max(0.001, pw2_rot - 0.005), Math.max(0.001, ph - 0.005), Math.max(0.001, pd2_rot - 0.005)]}
                                  color="#93c5fd"
                                  edgeColor="#3b82f6"
                                  onClick={() => setSelectedId(currentCount)}
                                  isSelected={selectedId === currentCount}
                                />
                              );
                              count++;
                            }
                          }
                        }
                      }
                    }
                    
                    return (
                      <group position={[-maxL * s / 2, 0, -maxW * s / 2]}>
                        {boxes}
                      </group>
                    );
                  } else {
                    const orientationStr = currentResult.orientations.box || '0x0x0';
                    const parts = orientationStr.split('x');
                    const [l, w, h] = parts.length === 3 ? parts.map(Number) : [0, 0, 0];
                    
                    if (l <= 0 || w <= 0 || h <= 0) return null;

                    const pw = l * s;
                    const pd = w * s;
                    const ph = h * s;
                    const nx = currentResult.boxGrid.nx;
                    const ny = currentResult.boxGrid.ny;

                    return (
                      <group position={[-(nx * pw) / 2, 0, -(ny * pd) / 2]}>
                        {Array.from({ length: partsToRender }).map((_, i) => {
                          const ix = i % nx;
                          const iy = Math.floor(i / nx) % ny;
                          const iz = Math.floor(i / (nx * ny));
                          
                          return (
                            <MeshBox 
                              key={i}
                              position={[ix * pw + pw/2, iz * ph + ph/2, iy * pd + pd/2]}
                              args={[Math.max(0.001, pw - 0.005), Math.max(0.001, ph - 0.005), Math.max(0.001, pd - 0.005)]}
                              color="#93c5fd"
                              edgeColor="#3b82f6"
                              onClick={() => setSelectedId(i)}
                              isSelected={selectedId === i}
                            />
                          );
                        })}
                      </group>
                    );
                  }
                })()}
              </group>
            )}
          </Center>
        </Bounds>
        
        <ContactShadows 
          position={[0, 0, 0]} 
          opacity={0.3} 
          scale={25} 
          blur={2.5} 
          far={5} 
        />
        
        <Environment preset="city" />
      </Canvas>

      {/* Selection Overlay */}
      <AnimatePresence>
        {selectedId !== null && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-64 glass-panel p-4 z-10 shadow-xl border-l-4 border-l-amber-500"
          >
            <div className="flex justify-between items-start mb-2">
              <h4 className="font-bold text-sm text-zinc-900">
                {viewMode === 'pallet' ? `Box ${selectedId}` : `Part #${Number(selectedId) + 1}`}
              </h4>
              <button onClick={() => setSelectedId(null)} className="text-zinc-400 hover:text-zinc-600">
                <Trash2 size={14} />
              </button>
            </div>
            <div className="space-y-1 text-xs">
              {(() => {
                let clickedBox: PackedBox | undefined;
                if (viewMode === 'pallet' && typeof selectedId === 'string') {
                  const [pIdxStr, cIdxStr] = selectedId.split('-');
                  const pIdx = parseInt(pIdxStr.replace('p', ''));
                  const cIdx = parseInt(cIdxStr.replace('c', ''));
                  if (result.pallets && result.pallets[pIdx]) {
                    clickedBox = result.pallets[pIdx][cIdx];
                  }
                }

                return (
                  <>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Position:</span>
                      <span className="font-mono text-zinc-700">
                        {(() => {
                          const nx = viewMode === 'pallet' ? result.palletGrid.nx : result.boxGrid.nx;
                          const ny = viewMode === 'pallet' ? result.palletGrid.ny : result.boxGrid.ny;
                          
                          let id = 0;
                          if (typeof selectedId === 'string' && selectedId.includes('-c')) {
                            id = parseInt(selectedId.split('-c')[1]);
                          } else {
                            id = Number(selectedId);
                          }

                          const x = (id % nx) + 1;
                          const y = (Math.floor(id / nx) % ny) + 1;
                          const z = Math.floor(id / (nx * ny)) + 1;
                          return `X:${x} Y:${y} Z:${z}`;
                        })()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Type:</span>
                      <span className="font-medium text-zinc-700">
                        {clickedBox ? clickedBox.name : (viewMode === 'pallet' ? box.name : part.name)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Dimensions:</span>
                      <span className="font-medium text-zinc-700">
                        {clickedBox ? `${clickedBox.length}x${clickedBox.width}x${clickedBox.height}` : (viewMode === 'pallet' ? result.orientations.pallet : result.orientations.box)} mm
                      </span>
                    </div>
                    {clickedBox && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Part inside:</span>
                          <span className="font-medium text-zinc-700">{clickedBox.partName}</span>
                        </div>
                        {clickedBox.partsCount !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Quantity:</span>
                            <span className="font-medium text-zinc-700">{clickedBox.partsCount} pcs</span>
                          </div>
                        )}
                        {clickedBox.weight !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Weight:</span>
                            <span className="font-medium text-zinc-700">{clickedBox.weight.toFixed(2)} kg</span>
                          </div>
                        )}
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default function App() {
  const [parts, setParts] = useState<Part[]>(INITIAL_PARTS);
  const [boxes, setBoxes] = useState<Container[]>(INITIAL_BOXS);
  const [selectedPartId, setSelectedPartId] = useState<string>(INITIAL_PARTS[0].id);
  const [selectedBoxId, setSelectedBoxId] = useState<string>(INITIAL_BOXS[0].id);
  const [selectedPartIds, setSelectedPartIds] = useState<string[]>([]);
  const [pallet, setPallet] = useState<Pallet>(STANDARD_PALLETS[0]);
  const [viewMode, setViewMode] = useState<'pallet' | 'box'>('pallet');
  const [shippingMethod, setShippingMethod] = useState<'pallet' | 'courier'>('pallet');
  const [calculationMode, setCalculationMode] = useState<'full' | 'boxes-only'>('full');
  const [selectedPalletIndex, setSelectedPalletIndex] = useState<number | null>(null);

  useEffect(() => {
    setSelectedPalletIndex(null);
  }, [viewMode]);

  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [projectNumber, setProjectNumber] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [shipmentItems, setShipmentItems] = useState<ShipmentItem[]>([]);

  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const [reviewQueue, setReviewQueue] = useState<Part[]>([]);
  const [currentReviewIndex, setCurrentReviewIndex] = useState(-1);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [showFinalConfirmation, setShowFinalConfirmation] = useState(false);
  const [isImportSession, setIsImportSession] = useState(false);

  const startReviewProcess = (queue: Part[], isImport = false) => {
    setIsImportSession(isImport);
    setReviewQueue(queue);
    setCurrentReviewIndex(0);
    setIsReviewMode(true);
    
    if (queue.length > 0) {
      const firstPart = queue[0];
      setSelectedPartId(firstPart.id);
      
      setParts(prev => {
        if (prev.some(p => p.id === firstPart.id)) return prev;
        return [...prev, firstPart];
      });

      const existingItem = shipmentItems.find(item => item.partId === firstPart.id);
      if (existingItem) {
        setSelectedBoxId(existingItem.boxId);
      } else {
        const suggested = suggestBestBox(firstPart, pallet, shippingMethod);
        const boxId = `rev-box-${firstPart.id}`;
        
        setBoxes(prev => {
          if (prev.some(b => b.id === boxId)) return prev;
          return [...prev, { ...suggested, id: boxId }];
        });
        setSelectedBoxId(boxId);
      }
    }
  };

  const nextReviewStep = () => {
    if (currentReviewIndex < reviewQueue.length - 1) {
      const nextIndex = currentReviewIndex + 1;
      const nextPart = reviewQueue[nextIndex];
      
      // Look for already assigned box for this part if it exists in the shipment
      const existingItem = shipmentItems.find(item => item.partId === nextPart.id);
      
      if (existingItem) {
        setSelectedBoxId(existingItem.boxId);
      } else {
        const suggested = suggestBestBox(nextPart, pallet, shippingMethod);
        const boxId = `rev-box-${nextPart.id}`;
        
        setBoxes(prev => {
          if (prev.some(b => b.id === boxId)) return prev;
          return [...prev, { ...suggested, id: boxId }];
        });
        setSelectedBoxId(boxId);
      }
      
      setCurrentReviewIndex(nextIndex);
      setSelectedPartId(nextPart.id);
    } else {
      setIsReviewMode(false);
      if (isImportSession) {
        setShowFinalConfirmation(true);
      } else {
        setEditingItemId(null);
      }
    }
  };

  const previousReviewStep = () => {
    if (currentReviewIndex > 0) {
      const prevIndex = currentReviewIndex - 1;
      const prevPart = reviewQueue[prevIndex];
      
      const existingItem = shipmentItems.find(item => item.partId === prevPart.id);
      if (existingItem) {
        setSelectedBoxId(existingItem.boxId);
      }
      
      setCurrentReviewIndex(prevIndex);
      setSelectedPartId(prevPart.id);
    }
  };

  const confirmReviewItem = () => {
    const currentPart = reviewQueue[currentReviewIndex];
    const currentBox = boxes.find(b => b.id === selectedBoxId);
    if (!currentPart || !currentBox) return;

    // During import session, we want to ensure each part from the queue is in shipmentItems
    // If it's already there (user went back and confirmed again), update it.
    const existingIndex = shipmentItems.findIndex(item => item.partId === currentPart.id);

    if (existingIndex > -1) {
      setShipmentItems(prev => {
        const next = [...prev];
        next[existingIndex] = {
          ...next[existingIndex],
          boxId: currentBox.id,
          quantity: currentPart.orderQuantity
        };
        return next;
      });
    } else {
      setShipmentItems(prev => [
        ...prev,
        {
          id: Math.random().toString(36).substr(2, 9),
          partId: currentPart.id,
          boxId: currentBox.id,
          quantity: currentPart.orderQuantity
        }
      ]);
    }

    // Reset editing item if we were specifically editing one
    if (editingItemId) setEditingItemId(null);

    nextReviewStep();
  };

  const suggestBestBoxesForShipment = () => {
    setIsSuggestingBest(true);
    try {
      const newBoxesToAdd: Container[] = [];
      const updatedShipmentItems = shipmentItems.map(item => {
        const p = parts.find(x => x.id === item.partId);
        if (!p) return item;
        
        const bestBox = suggestBestBox(p, pallet, shippingMethod);
        
        // Check existing boxes
        const existingBox = boxes.find(b => 
          b.length === bestBox.length && 
          b.width === bestBox.width && 
          b.height === bestBox.height
        );
        
        if (existingBox) {
          return { ...item, boxId: existingBox.id };
        }
        
        // Check boxes we're about to add
        const pendingBox = newBoxesToAdd.find(b => 
          b.length === bestBox.length && 
          b.width === bestBox.width && 
          b.height === bestBox.height
        );
        
        if (pendingBox) {
          return { ...item, boxId: pendingBox.id };
        }

        const newBox: Container = {
          ...bestBox,
          id: Math.random().toString(36).substr(2, 9),
          createdAt: Date.now()
        };
        newBoxesToAdd.push(newBox);
        return { ...item, boxId: newBox.id };
      });

      if (newBoxesToAdd.length > 0) {
        setBoxes(prev => [...prev, ...newBoxesToAdd]);
      }
      setShipmentItems(updatedShipmentItems);
    } catch (error) {
      console.error("Error suggesting boxes for shipment:", error);
    } finally {
      setIsSuggestingBest(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingFile(true);
    setUploadProgress(0);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const buffer = evt.target?.result as ArrayBuffer;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const worksheet = workbook.worksheets[0];
        
        const rows: any[] = [];
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return;
          rows.push(row);
        });

        const totalRows = rows.length;
        let processedCount = 0;
        const chunkSize = 5; // Process 5 parts at a time to keep UI responsive

        const allExtractedParts: Part[] = [];
        const processChunk = async (startIndex: number) => {
          const endIndex = Math.min(startIndex + chunkSize, totalRows);
          const chunkParts: Part[] = [];

          for (let i = startIndex; i < endIndex; i++) {
            const row = rows[i];
            const rowNumber = i + 2;
            
            const name = row.getCell(1).value?.toString() || `Part ${rowNumber}`;
            const description = row.getCell(2).value?.toString() || '';
            const length = Number(row.getCell(3).value) || 100;
            const width = Number(row.getCell(4).value) || 100;
            const height = Number(row.getCell(5).value) || 100;
            const weight = Number(row.getCell(6).value) || 1;
            const quantity = Number(row.getCell(7).value) || 1;
            const targetBoxCount = Number(row.getCell(8).value) || undefined;
            const fixedPartsPerBox = Number(row.getCell(9).value) || undefined;

            const part: Part = {
              id: Math.random().toString(36).substr(2, 9),
              name, description, length, width, height, weight, orderQuantity: quantity,
              targetBoxCount, fixedPartsPerBox, createdAt: Date.now()
            };

            chunkParts.push(part);
            allExtractedParts.push(part);
          }

          // Add parts to state immediately but in chunks
          setParts(prev => [...prev, ...chunkParts]);
          setReviewQueue(prev => [...prev, ...chunkParts]);

          processedCount += (endIndex - startIndex);
          setUploadProgress(Math.round((processedCount / totalRows) * 100));

          if (processedCount < totalRows) {
            // Yield to main thread
            setTimeout(() => processChunk(endIndex), 10);
          } else {
            setIsProcessingFile(false);
            setCalculationMode('full');
            // Clear current shipment to only include items from the file
            setShipmentItems([]); 
            if (allExtractedParts.length > 0) {
              // Now we can start review process with everything ready in state
              startReviewProcess(allExtractedParts, true);
            }
          }
        };

        setReviewQueue([]); // Reset queue for new upload
        processChunk(0);
      } catch (error) {
        console.error("Error processing file:", error);
        setIsProcessingFile(false);
      }
      
      // Reset file input
      e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  const part = useMemo(() => parts.find(p => p.id === selectedPartId) || parts[0], [parts, selectedPartId]);
  const box = useMemo(() => boxes.find(c => c.id === selectedBoxId) || boxes[0], [boxes, selectedBoxId]);

  const currentSingleResult = useMemo(() => optimizePacking(part, box, pallet, part.orderQuantity), [part, box, pallet, part.orderQuantity]);

  const [isCalculatingResult, setIsCalculatingResult] = useState(false);
  const [result, setResult] = useState<PackingResult>(currentSingleResult);

  useEffect(() => {
    setIsCalculatingResult(true);
    const timer = setTimeout(() => {
      if (shipmentItems.length > 0) {
        const items = shipmentItems.map(item => ({
          part: parts.find(p => p.id === item.partId)!,
          box: boxes.find(b => b.id === item.boxId)!,
          quantity: item.quantity
        })).filter(item => item.part && item.box);
        
        if (items.length > 0) {
          const mixedResult = optimizeMixedShipment(items, pallet);
          setResult(mixedResult);
          setIsCalculatingResult(false);
          return;
        }
      }
      setResult(currentSingleResult);
      setIsCalculatingResult(false);
    }, 100); // Reduced debounce to 100ms for snappier feel
    
    return () => clearTimeout(timer);
  }, [currentSingleResult, shipmentItems, parts, boxes, pallet]);

  const handlePartChange = (updates: Partial<Part>) => {
    const newParts = parts.map(p => p.id === selectedPartId ? { ...p, ...updates } : p);
    setParts(newParts);
    
    // Auto-suggest box when dimensions, quantity, or packing constraints change
    if (
      updates.length !== undefined || 
      updates.width !== undefined || 
      updates.height !== undefined || 
      updates.orderQuantity !== undefined ||
      updates.targetBoxCount !== undefined ||
      updates.fixedPartsPerBox !== undefined
    ) {
      const updatedPart = newParts.find(p => p.id === selectedPartId)!;
      const suggestedBox = suggestBestBox(updatedPart, pallet);
      
      // Update the currently selected box with the suggested dimensions
      setBoxes(prev => prev.map(b => b.id === selectedBoxId ? { ...b, ...suggestedBox, id: b.id } : b));
    }
  };

  const handleExport = async (type: 'excel' | 'email') => {
    setIsOptimizing(true);
    try {
      setExportType(type);
      if (type === 'email') {
        setExportStep('final');
      } else {
        setExportStep('pallet');
      }
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsOptimizing(false);
    }
  };

  const [exportStep, setExportStep] = useState<'idle' | 'pallet' | 'box' | 'lastBox' | 'final'>('idle');
  const [exportType, setExportType] = useState<'excel' | 'email' | null>(null);
  const [palletImages, setPalletImages] = useState<string[]>([]);
  const [currentPalletCaptureIndex, setCurrentPalletCaptureIndex] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSuggestingBest, setIsSuggestingBest] = useState(false);
  const [isOptimizingPallet, setIsOptimizingPallet] = useState(false);

  const handleSuggestBestBox = () => {
    setIsSuggestingBest(true);
    try {
      const bestBox = suggestBestBox(part, pallet, shippingMethod);
      const newBox: Container = {
        ...bestBox,
        id: Math.random().toString(36).substr(2, 9),
        createdAt: Date.now()
      };
      setBoxes([...boxes, newBox]);
      setSelectedBoxId(newBox.id);
    } catch (error) {
      console.error("Error suggesting best box:", error);
    } finally {
      setIsSuggestingBest(false);
    }
  };

  useEffect(() => {
    if (exportStep === 'final') {
      if (exportType === 'excel') {
        const itemsToExport = shipmentItems.length > 0 
          ? shipmentItems.map(item => ({
              part: parts.find(p => p.id === item.partId)!,
              box: boxes.find(b => b.id === item.boxId)!,
              quantity: item.quantity,
              result: optimizePacking(
                parts.find(p => p.id === item.partId)!,
                boxes.find(b => b.id === item.boxId)!,
                pallet,
                item.quantity
              )
            })).filter(item => item.part && item.box)
          : [{ part, box, quantity: part.orderQuantity, result: currentSingleResult }];

        exportToExcel(itemsToExport, pallet, result, palletImages, shippingMethod, projectNumber);
      } else if (exportType === 'email') {
        const itemsToExport = shipmentItems.length > 0 
          ? shipmentItems.map(item => ({
              part: parts.find(p => p.id === item.partId)!,
              box: boxes.find(b => b.id === item.boxId)!,
              quantity: item.quantity,
              result: optimizePacking(
                parts.find(p => p.id === item.partId)!,
                boxes.find(b => b.id === item.boxId)!,
                pallet,
                item.quantity
              )
            })).filter(item => item.part && item.box)
          : [{ part, box, quantity: part.orderQuantity, result: currentSingleResult }];

        sendEmailReport(itemsToExport, pallet, result, shippingMethod, projectNumber, deliveryAddress, palletImages[0]);
      }
      setExportStep('idle');
      setExportType(null);
      setPalletImages([]);
      setCurrentPalletCaptureIndex(0);
    }
  }, [exportStep, exportType, palletImages, part, box, pallet, result, shippingMethod, projectNumber, deliveryAddress, shipmentItems, parts, boxes, currentSingleResult]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type === 'number') {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
        }
      }
    };
    
    const handleWheel = (e: WheelEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type === 'number') {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
    };
  }, []);

  const handleReset = () => {
    setParts(INITIAL_PARTS);
    setBoxes(INITIAL_BOXS);
    setSelectedPartId(INITIAL_PARTS[0].id);
    setSelectedBoxId(INITIAL_BOXS[0].id);
    setPallet(STANDARD_PALLETS[0]);
    setShipmentItems([]);
    setProjectNumber('');
    setDeliveryAddress('');
  };

  const saveProject = () => {
    const projectData = {
      parts,
      boxes,
      pallet,
      shipmentItems,
      projectNumber,
      deliveryAddress
    };
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    saveAs(blob, `DIAM_Project_${projectNumber || 'Export'}.json`);
  };

  const loadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target?.result as string);
        if (data.parts && data.boxes && data.pallet) {
          setParts(data.parts);
          setBoxes(data.boxes);
          setPallet(data.pallet);
          setShipmentItems(data.shipmentItems || []);
          setProjectNumber(data.projectNumber || '');
          setDeliveryAddress(data.deliveryAddress || '');
          if (data.parts.length > 0) setSelectedPartId(data.parts[0].id);
          if (data.boxes.length > 0) setSelectedBoxId(data.boxes[0].id);
        } else {
          alert('Invalid project file format.');
        }
      } catch (err) {
        alert('Error parsing project file.');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const addPart = () => {
    const newPart: Part = {
      id: Math.random().toString(36).substr(2, 9),
      name: 'New Part',
      description: 'Part description...',
      length: 100,
      width: 100,
      height: 100,
      weight: 1.0,
      orderQuantity: 100,
      createdAt: Date.now()
    };
    setParts([...parts, newPart]);
    setSelectedPartId(newPart.id);
  };

  const addBox = () => {
    const newBox: Container = {
      id: Math.random().toString(36).substr(2, 9),
      name: 'New Box',
      length: 500,
      width: 400,
      height: 300,
      maxWeight: 20,
      emptyWeight: 0.5,
      createdAt: Date.now()
    };
    setBoxes([...boxes, newBox]);
    setSelectedBoxId(newBox.id);
  };

  const addToShipment = () => {
    const currentPart = parts.find(p => p.id === selectedPartId);
    if (!currentPart) return;
    
    // Trigger review process for this single item
    startReviewProcess([currentPart]);
  };

  const editShipmentItem = (item: ShipmentItem) => {
    setSelectedPartId(item.partId);
    setSelectedBoxId(item.boxId);
    setEditingItemId(item.id);
    
    // Update the part's order quantity to match the item
    const newParts = parts.map(p => p.id === item.partId ? { ...p, orderQuantity: item.quantity } : p);
    setParts(newParts);
  };

  const removeFromShipment = (id: string) => {
    setShipmentItems(shipmentItems.filter(item => item.id !== id));
    if (editingItemId === id) setEditingItemId(null);
  };

  const deletePart = (id: string) => {
    if (parts.length <= 1) return;
    const newParts = parts.filter(p => p.id !== id);
    setParts(newParts);
    if (selectedPartId === id) setSelectedPartId(newParts[0].id);
    setSelectedPartIds(prev => prev.filter(tid => tid !== id));
  };

  const applyBulkPartChanges = (changes: Partial<Part>) => {
    setParts(prev => prev.map(p => 
      selectedPartIds.includes(p.id) ? { ...p, ...changes } : p
    ));
  };

  const deleteBox = (id: string) => {
    if (boxes.length <= 1) return;
    const newBoxes = boxes.filter(c => c.id !== id);
    setBoxes(newBoxes);
    if (selectedBoxId === id) setSelectedBoxId(newBoxes[0].id);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-100/40 via-zinc-100 to-orange-100/40">
      <AnimatePresence>
        {isProcessingFile && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-zinc-900/80 backdrop-blur-md flex items-center justify-center p-6"
          >
            <div className="max-w-md w-full bg-white rounded-[2.5rem] p-10 shadow-2xl text-center">
              <div className="w-20 h-20 bg-zinc-900 text-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl tilted-icon-container">
                <Zap size={40} className="animate-pulse" />
              </div>
              <h2 className="text-3xl font-black text-zinc-900 tracking-tight mb-2">Processing Shipment</h2>
              <p className="text-zinc-500 font-medium mb-8">Optimizing box selection and palletization for your imported parts...</p>
              
              <div className="relative h-4 bg-zinc-100 rounded-full overflow-hidden mb-4 border border-zinc-200 shadow-inner">
                <motion.div 
                  className="absolute inset-y-0 left-0 bg-zinc-900"
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                  transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
                />
              </div>
              <div className="flex justify-between items-center text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                <span>Optimization Progress</span>
                <span className="text-zinc-900">{uploadProgress}%</span>
              </div>
            </div>
          </motion.div>
        )}
        {isReviewMode && reviewQueue.length > 0 && currentReviewIndex >= 0 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-zinc-900/60 backdrop-blur-md flex items-center justify-center p-4 md:p-10"
          >
            <div className="max-w-6xl w-full h-full max-h-[90vh] bg-white rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden">
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-zinc-900 text-white rounded-2xl flex items-center justify-center shadow-lg tilted-icon-container">
                    <Package size={24} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-zinc-900 tracking-tight leading-none mb-1">Packing Approval</h2>
                    <p className="text-zinc-500 font-bold text-[10px] uppercase tracking-widest">Part {currentReviewIndex + 1} of {reviewQueue.length}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                   <div className="hidden md:flex gap-1 h-1.5 w-48 bg-zinc-100 rounded-full overflow-hidden">
                      {reviewQueue.map((_, idx) => (
                        <div key={idx} className={cn("flex-1 transition-all duration-500", idx <= currentReviewIndex ? "bg-zinc-900" : "bg-zinc-200")} />
                      ))}
                   </div>
                   <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{Math.round(((currentReviewIndex + 1) / reviewQueue.length) * 100)}%</div>
                </div>
              </div>
              
              <div className="flex-1 flex flex-col md:flex-row min-h-0">
                <div className="flex-1 bg-zinc-50 relative min-h-[300px] md:min-h-0 border-r border-zinc-100">
                  <PackingCanvas 
                    viewMode="box"
                    part={reviewQueue[currentReviewIndex]}
                    box={boxes.find(b => b.id === selectedBoxId) || boxes[0]}
                    pallet={pallet}
                    result={optimizePacking(reviewQueue[currentReviewIndex], boxes.find(b => b.id === selectedBoxId) || boxes[0], pallet, reviewQueue[currentReviewIndex].orderQuantity)}
                    selectedPalletIndex={0}
                  />
                  <div className="absolute bottom-4 left-4 flex flex-col gap-2">
                    <div className="bg-white/95 backdrop-blur px-3 py-2 rounded-xl text-[10px] font-bold text-zinc-600 border border-zinc-200 shadow-sm flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <Maximize2 size={12} className="text-zinc-400" />
                        <span>3D Preview (10mm Padding Enforced)</span>
                      </div>
                      <div className="flex items-center gap-2 text-emerald-600 border-t border-zinc-100 pt-1.5">
                        <ShieldCheck size={12} />
                        <span>85% Volume Target Active</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="w-full md:w-96 p-6 overflow-y-auto space-y-8 bg-white">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-black text-xs text-zinc-900 uppercase tracking-widest flex items-center gap-2">
                        <div className="w-5 h-5 bg-zinc-100 text-zinc-900 rounded-lg flex items-center justify-center text-[9px]">01</div>
                        Verify Quantity
                      </h3>
                      <span className="px-2 py-0.5 bg-zinc-100 rounded text-[9px] font-bold text-zinc-500 uppercase">Input Required</span>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Part Name</label>
                        <div className="font-mono text-[11px] font-bold p-3 bg-zinc-50 rounded-2xl border border-zinc-200 text-zinc-600">
                          {reviewQueue[currentReviewIndex].name}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Order Qty</label>
                          <div className="relative group">
                            <input 
                              type="number" 
                              value={reviewQueue[currentReviewIndex].orderQuantity}
                              onChange={(e) => {
                                 const val = parseInt(e.target.value) || 0;
                                 setReviewQueue(prev => prev.map((p, i) => i === currentReviewIndex ? { ...p, orderQuantity: val } : p));
                                 setParts(prev => prev.map(p => p.id === reviewQueue[currentReviewIndex].id ? { ...p, orderQuantity: val } : p));
                              }}
                              className="input-field !py-3 !text-sm text-center"
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold text-zinc-300">PCS</div>
                          </div>
                        </div>
                        <div className="space-y-2 text-right">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mr-1">Unit Wt</label>
                          <div className="font-mono text-sm font-black p-3 bg-zinc-50 rounded-2xl border border-zinc-200 text-zinc-400 flex items-center justify-end gap-2">
                            {reviewQueue[currentReviewIndex].weight} <span className="text-[10px]">KG</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="h-px bg-zinc-100" />

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-black text-xs text-zinc-900 uppercase tracking-widest flex items-center gap-2">
                        <div className="w-5 h-5 bg-zinc-100 text-zinc-900 rounded-lg flex items-center justify-center text-[9px]">02</div>
                        Select Box
                      </h3>
                      <button 
                        onClick={() => {
                          const rp = reviewQueue[currentReviewIndex];
                          const suggested = suggestBestBox(rp, pallet, shippingMethod);
                          const newBox = { ...suggested, id: `rev-box-new-${Date.now()}` };
                          setBoxes(prev => [...prev, newBox]);
                          setSelectedBoxId(newBox.id);
                        }}
                        className="text-[9px] font-black text-blue-600 uppercase hover:underline"
                      >
                        Auto-Suggest
                      </button>
                    </div>
                    
                    <div className="space-y-4">
                      <LibrarySelector
                        items={boxes}
                        selectedId={selectedBoxId}
                        onSelect={setSelectedBoxId}
                        onDelete={deleteBox}
                        onEdit={(id) => {
                          setSelectedBoxId(id);
                          setEditingItemId(id);
                        }}
                        itemType="box"
                        colorTheme="orange"
                      />
                      
                      {(() => {
                        const rb = boxes.find(b => b.id === selectedBoxId);
                        if (!rb) return null;
                        
                        return (
                          <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-zinc-400 uppercase">Length (L)</label>
                              <input 
                                type="number" 
                                value={rb.length}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  setBoxes(prev => prev.map(b => b.id === selectedBoxId ? { ...b, length: val } : b));
                                }}
                                className="input-field !py-2 !text-[11px] text-center"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-zinc-400 uppercase">Width (W)</label>
                              <input 
                                type="number" 
                                value={rb.width}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  setBoxes(prev => prev.map(b => b.id === selectedBoxId ? { ...b, width: val } : b));
                                }}
                                className="input-field !py-2 !text-[11px] text-center"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-zinc-400 uppercase">Height (H)</label>
                              <input 
                                type="number" 
                                value={rb.height}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  setBoxes(prev => prev.map(b => b.id === selectedBoxId ? { ...b, height: val } : b));
                                }}
                                className="input-field !py-2 !text-[11px] text-center"
                              />
                            </div>
                          </div>
                        );
                      })()}
                      
                      {(() => {
                        const rp = reviewQueue[currentReviewIndex];
                        const rb = boxes.find(b => b.id === selectedBoxId);
                        if (!rp || !rb) return null;
                        const res = optimizePacking(rp, rb, pallet, rp.orderQuantity);
                        const progress = Math.min(100, res.boxVolumeUtilization * 100);
                        const isGood = progress >= 80 && progress <= 95;
                        
                        return (
                          <div className={cn(
                            "p-5 rounded-3xl border transition-all duration-500",
                            isGood ? "bg-emerald-50 border-emerald-100" : "bg-amber-50 border-amber-100"
                          )}>
                            <div className="flex justify-between items-end mb-3">
                               <div>
                                 <div className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1">Efficiency</div>
                                 <div className={cn("text-2xl font-black tracking-tighter leading-none", isGood ? "text-emerald-600" : "text-amber-600")}>
                                   {progress.toFixed(1)}%
                                 </div>
                               </div>
                               <div className="text-right">
                                 <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Fill Rate</div>
                                 <div className="text-[9px] font-medium text-zinc-400 tracking-tight">Target: 85%</div>
                               </div>
                            </div>
                            <div className="h-2 w-full bg-white/50 rounded-full overflow-hidden mb-3 border border-zinc-100">
                               <motion.div 
                                 className={cn("h-full", isGood ? "bg-emerald-500" : "bg-amber-500")}
                                 initial={{ width: 0 }}
                                 animate={{ width: `${progress}%` }}
                               />
                            </div>
                            <p className={cn("text-[10px] font-bold leading-relaxed", isGood ? "text-emerald-700/70" : "text-amber-700/70")}>
                               {isGood 
                                 ? "High utilization detected. This configuration is efficient and approved." 
                                 : "Low fill rate detected (< 85%). Consider a smaller box for better material efficiency."}
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-zinc-100 flex items-center justify-between bg-zinc-50/50">
                <button 
                  onClick={() => {
                    setIsReviewMode(false);
                    setReviewQueue([]);
                    // If we were editing an existing item, we should probably keep it unchanged
                    setEditingItemId(null);
                  }}
                  className="px-6 py-3 text-zinc-400 hover:text-red-500 font-bold uppercase tracking-widest text-[10px] transition-colors"
                >
                  Cancel Review
                </button>
                <div className="flex items-center gap-3">
                  {currentReviewIndex > 0 && (
                    <button 
                      onClick={previousReviewStep}
                      className="px-6 py-4 bg-white text-zinc-600 border border-zinc-200 rounded-2xl font-bold uppercase tracking-widest text-[10px] hover:bg-zinc-50 transition-all flex items-center gap-2"
                    >
                      <ChevronLeft size={16} />
                      Previous
                    </button>
                  )}
                  <button 
                    onClick={confirmReviewItem}
                    className="px-10 py-4 bg-zinc-900 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[11px] shadow-xl shadow-zinc-300 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-3"
                  >
                    {currentReviewIndex === reviewQueue.length - 1 ? (
                      <>
                        <Check size={16} />
                        Finish & Finalize
                      </>
                    ) : (
                      <>
                        Confirm & Next
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
        {showFinalConfirmation && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-zinc-900/40 backdrop-blur-md flex items-center justify-center p-6"
          >
            <div className="max-w-md w-full bg-white rounded-[2.5rem] p-12 shadow-2xl text-center border border-white/20">
              <div className="w-24 h-24 bg-emerald-600 text-white rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-emerald-200 tilted-icon-container">
                <Check size={48} strokeWidth={3} />
              </div>
              <h2 className="text-3xl font-black text-zinc-900 tracking-tight mb-3">Review Complete</h2>
              <p className="text-zinc-500 font-medium mb-10 leading-relaxed">Your shipment items have been successfully configured and approved. Would you like to add another part manually?</p>
              
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => {
                    setShowFinalConfirmation(false);
                    setCalculationMode('full');
                    setViewMode('pallet');
                    // Optimization will trigger via effect
                  }}
                  className="w-full py-5 bg-zinc-900 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[11px] hover:bg-zinc-800 transition-all shadow-xl shadow-zinc-200"
                >
                  Start Palletization
                </button>
                <button 
                  onClick={() => {
                    setShowFinalConfirmation(false);
                    setEditingItemId(null);
                    // Open "Add Item" mode (which is just the default UI)
                  }}
                  className="w-full py-5 bg-zinc-100 text-zinc-600 rounded-2xl font-bold uppercase tracking-widest text-[10px] hover:bg-zinc-200 transition-colors"
                >
                  Add More Manually
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Header */}
      <header className="h-16 bg-white/80 text-zinc-900 flex items-center px-6 sticky top-0 z-50 border-b border-zinc-200 shadow-sm backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-zinc-900 to-zinc-600 rounded-lg blur opacity-10 group-hover:opacity-20 transition duration-1000 group-hover:duration-200"></div>
            <svg width="32" height="32" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="relative">
              <path d="M 5 15 L 95 35 L 30 95 L 5 15 Z" fill="black" />
              <path d="M 5 15 Q 45 35 50 45" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" />
              <path d="M 95 35 Q 55 40 50 45" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" />
              <path d="M 30 95 Q 40 65 50 45" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" />
            </svg>
          </div>
          <div className="flex flex-col justify-center">
            <h1 className="font-inter font-thin text-[32px] tracking-[0.2em] text-zinc-900 leading-none">DIAM</h1>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button 
            onClick={saveProject}
            className="text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold"
            title="Save Project"
          >
            <Download size={14} className="tilted-icon-container" />
            Save
          </button>
          <label 
            className="cursor-pointer text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold"
            title="Load Project"
          >
            <input type="file" accept=".json" className="hidden" onChange={loadProject} />
            <ArrowUpRight size={14} className="tilted-icon-container" />
            Load
          </label>
          <button 
            onClick={handleReset}
            className="text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold"
          >
            <RotateCcw size={14} className="text-zinc-400 tilted-icon-container" />
            Reset
          </button>
          <div className="h-6 w-[1px] bg-zinc-200 mx-1"></div>
          <button 
            onClick={() => handleExport('excel')}
            className="bg-white hover:bg-zinc-50 text-zinc-900 border border-zinc-200 px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
          >
            <Download size={16} className="tilted-icon-container" />
            Excel Report
          </button>
          <button 
            onClick={() => handleExport('email')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-blue-200 active:scale-95"
          >
            <Mail size={16} className="tilted-icon-container" />
            Send Email
          </button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 max-w-[1600px] mx-auto w-full">
        {/* Left Column: Inputs */}
        <div className="lg:col-span-4 space-y-4">
          {/* Project & Shipping Settings */}
          <section className="glass-panel p-4 bg-gradient-to-br from-white to-zinc-50/80">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 bg-zinc-900 text-white rounded-xl flex items-center justify-center shadow-md shadow-zinc-200 tilted-icon-container">
                  <Archive size={20} />
                </div>
                <div>
                  <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-[0.2em] mb-0.5">Step 1</div>
                  <h2 className="font-bold text-lg text-zinc-900 tracking-tight leading-none">Project Settings</h2>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1">
                  <label className="label-text ml-1">Project Number</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400 group-focus-within:text-zinc-900 transition-colors">
                      <Info size={14} />
                    </div>
                    <input
                      type="text"
                      value={projectNumber}
                      onChange={(e) => setProjectNumber(e.target.value)}
                      placeholder="e.g. PRJ-123"
                      className="input-field !pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="label-text ml-1">Delivery Address</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400 group-focus-within:text-zinc-900 transition-colors">
                      <Truck size={14} />
                    </div>
                    <input
                      type="text"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="e.g. 123 Logistics Way, City"
                      className="input-field !pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="label-text ml-1">Shipping Method</label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 rounded-xl border border-zinc-200 shadow-inner">
                    <button 
                      onClick={() => {
                        setShippingMethod('pallet');
                        setCalculationMode('full');
                        setViewMode('pallet');
                      }}
                      className={cn(
                        "flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-bold transition-all",
                        shippingMethod === 'pallet' 
                          ? "bg-white text-emerald-600 shadow-sm border border-emerald-100" 
                          : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50"
                      )}
                    >
                      <Layers size={14} />
                      PALLET
                    </button>
                    <button 
                      onClick={() => {
                        setShippingMethod('courier');
                        setCalculationMode('boxes-only');
                        setViewMode('box');
                      }}
                      className={cn(
                        "flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-bold transition-all",
                        shippingMethod === 'courier' 
                          ? "bg-white text-blue-600 shadow-sm border border-blue-100" 
                          : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50"
                      )}
                    >
                      <Truck size={14} />
                      COURIER
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Part Library */}
          <section className="glass-panel p-4 bg-gradient-to-br from-blue-50/90 to-indigo-50/40">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-md shadow-blue-200 tilted-icon-container">
                  <Package size={20} />
                </div>
                <div>
                  <div className="text-[9px] font-bold text-blue-400 uppercase tracking-[0.2em] mb-0.5">Step 2</div>
                  <h2 className="font-bold text-lg text-blue-900 tracking-tight leading-none">Part Library</h2>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={downloadImportTemplate}
                  className="w-8 h-8 flex items-center justify-center bg-white hover:bg-blue-50 rounded-lg text-blue-600 transition-all shadow-sm border border-blue-100 active:scale-95"
                  title="Download Excel Template"
                >
                  <Download size={14} />
                </button>
                <label className="w-8 h-8 flex items-center justify-center bg-white hover:bg-blue-50 rounded-lg text-blue-600 transition-all shadow-sm border border-blue-100 active:scale-95 cursor-pointer" title="Import from Excel">
                  <input type="file" accept=".xlsx" className="hidden" onChange={handleFileUpload} />
                  <ArrowUpRight size={14} />
                </label>
                <button 
                  onClick={addPart}
                  className="w-8 h-8 flex items-center justify-center bg-white hover:bg-blue-50 rounded-lg text-blue-600 transition-all shadow-sm border border-blue-100 active:scale-95"
                  title="Add New Part"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
            
            <div className="flex flex-col gap-2 mb-4">
              <LibrarySelector
                items={parts}
                selectedId={selectedPartId}
                selectedIds={selectedPartIds}
                onSelect={setSelectedPartId}
                onMultiSelect={setSelectedPartIds}
                onDelete={deletePart}
                onEdit={(id) => {
                  setSelectedPartId(id);
                  setEditingItemId(id);
                }}
                itemType="part"
                colorTheme="blue"
              />

              <AnimatePresence>
                {selectedPartIds.length > 1 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-4 bg-white border border-blue-100 rounded-2xl shadow-xl shadow-blue-900/5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-blue-600 text-white rounded-lg flex items-center justify-center">
                            <Layers size={12} />
                          </div>
                          <span className="text-[10px] font-black text-blue-900 uppercase tracking-widest">Bulk Edit {selectedPartIds.length} Parts</span>
                        </div>
                        <button 
                          onClick={() => setSelectedPartIds([])}
                          className="text-[10px] font-bold text-zinc-400 hover:text-zinc-600 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-zinc-500 uppercase px-1">Unit Weight (kg)</label>
                          <input 
                            type="number"
                            step="0.1"
                            placeholder="Set weight..."
                            className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 placeholder:text-zinc-400 focus:ring-2 focus:ring-blue-500 outline-none"
                            onBlur={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && val > 0) applyBulkPartChanges({ weight: val });
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-zinc-500 uppercase px-1">Order Qty</label>
                          <input 
                            type="number"
                            placeholder="Set qty..."
                            className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 placeholder:text-zinc-400 focus:ring-2 focus:ring-blue-500 outline-none"
                            onBlur={(e) => {
                              const val = parseInt(e.target.value);
                              if (!isNaN(val) && val > 0) applyBulkPartChanges({ orderQuantity: val });
                            }}
                          />
                        </div>
                      </div>
                      <div className="text-[9px] text-zinc-400 italic text-center">Changes are applied immediately after you finish typing.</div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="space-y-3 pt-3 border-t border-zinc-100">
              {editingItemId && parts.some(p => p.id === editingItemId) && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between px-3 py-2 bg-blue-100/50 text-blue-700 rounded-xl text-[10px] font-bold mb-3 border border-blue-200"
                >
                  <div className="flex items-center gap-2">
                    <Edit2 size={12} />
                    <span>EDITING MASTER PART RECORD</span>
                  </div>
                  <button 
                    onClick={() => setEditingItemId(null)}
                    className="hover:bg-blue-200 p-1 rounded-md transition-colors"
                  >
                    <RotateCcw size={12} />
                  </button>
                </motion.div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label-text">Part Name</label>
                  <input 
                    type="text" 
                    value={part.name} 
                    onChange={e => handlePartChange({ name: e.target.value })}
                    className="input-field"
                    placeholder="e.g. Engine Component"
                  />
                </div>
                <div>
                  <label className="label-text">Description</label>
                  <input 
                    type="text" 
                    value={part.description || ''} 
                    onChange={e => handlePartChange({ description: e.target.value })}
                    className="input-field"
                    placeholder="Enter part description..."
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="label-text">Length (mm)</label>
                  <NumberInput 
                    value={part.length} 
                    onChange={e => handlePartChange({ length: Number(e.target.value) })}
                    className="input-field"
                    min={0.1}
                    max={10000}
                  />
                </div>
                <div>
                  <label className="label-text">Width (mm)</label>
                  <NumberInput 
                    value={part.width} 
                    onChange={e => handlePartChange({ width: Number(e.target.value) })}
                    className="input-field"
                    min={0.1}
                    max={10000}
                  />
                </div>
                <div>
                  <label className="label-text">Height (mm)</label>
                  <NumberInput 
                    value={part.height} 
                    onChange={e => handlePartChange({ height: Number(e.target.value) })}
                    className="input-field"
                    min={0.1}
                    max={10000}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label-text">Unit Weight (kg)</label>
                  <div className="relative">
                    <NumberInput 
                      value={part.weight} 
                      onChange={e => handlePartChange({ weight: Number(e.target.value) })}
                      className="input-field pr-8"
                      min={0.01}
                      max={10000}
                    />
                    <div className="absolute right-2.5 top-[17px] -translate-y-1/2 text-zinc-400">
                      <Weight size={12} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label-text">Total Order Qty</label>
                  <NumberInput 
                    value={part.orderQuantity} 
                    onChange={e => handlePartChange({ orderQuantity: Number(e.target.value) })}
                    className="input-field"
                    min={1}
                    max={1000000}
                  />
                </div>
                <div>
                  <label className="label-text">Number of Boxes (Optional)</label>
                  <NumberInput 
                    value={part.targetBoxCount || 0} 
                    onChange={e => {
                      const val = Number(e.target.value);
                      handlePartChange({ 
                        targetBoxCount: val > 0 ? val : undefined,
                        fixedPartsPerBox: undefined // Clear the other one
                      });
                    }}
                    className="input-field"
                    min={0}
                    max={1000000}
                    placeholder="Auto"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <div>
                  <label className="label-text">Parts per Box (Optional)</label>
                  <NumberInput 
                    value={part.fixedPartsPerBox || 0} 
                    onChange={e => {
                      const val = Number(e.target.value);
                      handlePartChange({ 
                        fixedPartsPerBox: val > 0 ? val : undefined,
                        targetBoxCount: undefined // Clear the other one
                      });
                    }}
                    className="input-field"
                    min={0}
                    max={1000000}
                    placeholder="Auto"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Box Library */}
          <section className="glass-panel p-4 bg-gradient-to-br from-orange-50/90 to-amber-50/40">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-600 text-white rounded-xl flex items-center justify-center shadow-md shadow-orange-200 tilted-icon-container">
                  <Box size={20} />
                </div>
                <div>
                  <div className="text-[9px] font-bold text-orange-400 uppercase tracking-[0.2em] mb-0.5">Step 3</div>
                  <h2 className="font-bold text-lg text-orange-900 tracking-tight leading-none">Box Library</h2>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleSuggestBestBox}
                  disabled={isSuggestingBest}
                  className="px-3 py-2 bg-white hover:bg-orange-50 text-orange-600 text-[10px] font-bold rounded-lg transition-all shadow-sm border border-orange-100 flex items-center gap-1.5 disabled:opacity-70 active:scale-95"
                  title="Suggest the best box based on part dimensions"
                >
                  {isSuggestingBest ? (
                    <RotateCcw size={14} className="animate-spin" />
                  ) : (
                    <Zap size={14} />
                  )}
                  SUGGEST BEST
                </button>
                <button 
                  onClick={() => {
                    const currentPart = parts.find(p => p.id === selectedPartId);
                    if (currentPart) startReviewProcess([currentPart]);
                  }}
                  className="px-3 py-2 bg-white hover:bg-zinc-50 text-zinc-600 text-[10px] font-bold rounded-lg transition-all shadow-sm border border-zinc-200 flex items-center gap-1.5 active:scale-95"
                  title="Preview packing configuration in wizard"
                >
                  <Eye size={14} />
                  PREVIEW
                </button>
                <button 
                  onClick={addBox}
                  className="w-8 h-8 flex items-center justify-center bg-white hover:bg-orange-50 rounded-lg text-orange-500 transition-all shadow-sm border border-orange-100 active:scale-95"
                  title="Add New Box"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <LibrarySelector
                items={boxes}
                selectedId={selectedBoxId}
                onSelect={setSelectedBoxId}
                onDelete={deleteBox}
                onEdit={(id) => {
                   setSelectedBoxId(id);
                   setEditingItemId(id);
                }}
                itemType="box"
                colorTheme="orange"
              />
            </div>

            <div className="space-y-3 pt-3 border-t border-blue-200/50">
              {editingItemId && boxes.some(b => b.id === editingItemId) && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between px-3 py-2 bg-orange-100/50 text-orange-700 rounded-xl text-[10px] font-bold mb-3 border border-orange-200"
                >
                  <div className="flex items-center gap-2">
                    <Edit2 size={12} />
                    <span>EDITING MASTER BOX RECORD</span>
                  </div>
                  <button 
                    onClick={() => setEditingItemId(null)}
                    className="hover:bg-orange-200 p-1 rounded-md transition-colors"
                  >
                    <RotateCcw size={12} />
                  </button>
                </motion.div>
              )}
              <div>
                <label className="label-text">Box Name</label>
                <input 
                  type="text" 
                  value={box.name} 
                  onChange={e => {
                    const newBoxes = boxes.map(c => c.id === selectedBoxId ? {...c, name: e.target.value} : c);
                    setBoxes(newBoxes);
                  }}
                  className="input-field"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="label-text">Length (mm)</label>
                  <NumberInput 
                    value={box.length} 
                    onChange={e => {
                      const val = Number(e.target.value);
                      const newBoxes = boxes.map(c => {
                        if (c.id === selectedBoxId) {
                          const newName = c.name.startsWith('BC ') ? `BC ${val}x${c.width}x${c.height}` : c.name;
                          return {...c, length: val, name: newName};
                        }
                        return c;
                      });
                      setBoxes(newBoxes);
                    }}
                    className="input-field"
                    min={0.1}
                    max={10000}
                  />
                </div>
                <div>
                  <label className="label-text">Width (mm)</label>
                  <NumberInput 
                    value={box.width} 
                    onChange={e => {
                      const val = Number(e.target.value);
                      const newBoxes = boxes.map(c => {
                        if (c.id === selectedBoxId) {
                          const newName = c.name.startsWith('BC ') ? `BC ${c.length}x${val}x${c.height}` : c.name;
                          return {...c, width: val, name: newName};
                        }
                        return c;
                      });
                      setBoxes(newBoxes);
                    }}
                    className="input-field"
                    min={0.1}
                    max={10000}
                  />
                </div>
                <div>
                  <label className="label-text">Height (mm)</label>
                  <NumberInput 
                    value={box.height} 
                    onChange={e => {
                      const val = Number(e.target.value);
                      const newBoxes = boxes.map(c => {
                        if (c.id === selectedBoxId) {
                          const newName = c.name.startsWith('BC ') ? `BC ${c.length}x${c.width}x${val}` : c.name;
                          return {...c, height: val, name: newName};
                        }
                        return c;
                      });
                      setBoxes(newBoxes);
                    }}
                    className="input-field"
                    min={0.1}
                    max={10000}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label-text">Max Weight (kg)</label>
                  <NumberInput 
                    value={box.maxWeight} 
                    onChange={e => {
                      const newBoxes = boxes.map(c => c.id === selectedBoxId ? {...c, maxWeight: Number(e.target.value)} : c);
                      setBoxes(newBoxes);
                    }}
                    className="input-field"
                    min={0.1}
                    max={10000}
                  />
                </div>
                <div>
                  <label className="label-text">Box Weight (kg)</label>
                  <NumberInput 
                    value={box.weight || box.emptyWeight || 0} 
                    onChange={e => {
                      const val = Number(e.target.value);
                      const newBoxes = boxes.map(c => c.id === selectedBoxId ? {...c, weight: val, emptyWeight: val} : c);
                      setBoxes(newBoxes);
                    }}
                    className="input-field"
                    min={0}
                    max={100}
                    step={0.1}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Shipment Items List */}
          <section className="glass-panel p-4 bg-gradient-to-br from-zinc-50 to-zinc-100">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-zinc-800 text-white rounded-xl flex items-center justify-center shadow-md tilted-icon-container">
                  <LayoutGrid size={20} />
                </div>
                <div>
                  <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-0.5">Step 4</div>
                  <h2 className="font-bold text-lg text-zinc-900 tracking-tight leading-none">Shipment Items</h2>
                </div>
                {shipmentItems.length > 0 && (
                  <button 
                    onClick={() => {
                      if (window.confirm('Are you sure you want to clear all items from the shipment?')) {
                        setShipmentItems([]);
                        setEditingItemId(null);
                      }
                    }}
                    className="ml-2 p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    title="Clear all items"
                  >
                    <RotateCcw size={14} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={suggestBestBoxesForShipment}
                  disabled={shipmentItems.length === 0 || isSuggestingBest}
                  className="px-2 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-700 text-[9px] font-bold rounded-lg transition-all border border-amber-200 flex items-center gap-1 active:scale-95 disabled:opacity-50"
                  title="Suggest best boxes for all items in shipment"
                >
                  {isSuggestingBest ? <RotateCcw size={12} className="animate-spin" /> : <Zap size={12} />}
                  SUGGEST ALL
                </button>
                {editingItemId && (
                  <button 
                    onClick={() => setEditingItemId(null)}
                    className="px-3 py-1.5 bg-zinc-200 text-zinc-600 text-[10px] font-bold rounded-lg hover:bg-zinc-300 transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                  >
                    <RotateCcw size={14} />
                    CANCEL
                  </button>
                )}
                <button 
                  onClick={addToShipment}
                  className={cn(
                    "px-3 py-1.5 text-white text-[10px] font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-sm active:scale-95",
                    editingItemId ? "bg-amber-600 hover:bg-amber-700" : "bg-zinc-900 hover:bg-zinc-800"
                  )}
                >
                  {editingItemId ? <Edit2 size={14} /> : <Plus size={14} />}
                  {editingItemId ? 'UPDATE ITEM' : 'ADD CURRENT'}
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
              {shipmentItems.length === 0 ? (
                <div className="text-center py-6 border-2 border-dashed border-zinc-200 rounded-xl">
                  <p className="text-xs text-zinc-400 font-medium">No items in shipment yet.</p>
                  <p className="text-[10px] text-zinc-300 mt-1">Add current part & box selection above.</p>
                </div>
              ) : (
                shipmentItems.map((item) => {
                  const p = parts.find(x => x.id === item.partId);
                  const b = boxes.find(x => x.id === item.boxId);
                  if (!p || !b) return null;
                  const isEditing = editingItemId === item.id;
                  return (
                    <div key={item.id} className={cn(
                      "flex items-center justify-between p-3 border rounded-xl shadow-sm group transition-all",
                      isEditing ? "bg-amber-50 border-amber-200" : "bg-white border-zinc-200 hover:border-zinc-300"
                    )}>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-zinc-900">{p.name}</span>
                        <span className="text-[10px] text-zinc-500 font-medium">
                          {item.quantity} pcs • {b.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => editShipmentItem(item)}
                          className="p-1.5 text-zinc-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                          title="Edit item"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          onClick={() => removeFromShipment(item.id)}
                          className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                          title="Remove item"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Pallet Configuration - Only show if not in courier mode */}
          {shippingMethod === 'pallet' && (
            <section className="glass-panel p-4 bg-gradient-to-br from-emerald-50/90 to-teal-50/40">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center shadow-md shadow-emerald-200 tilted-icon-container">
                  <Layers size={20} />
                </div>
                <div>
                  <div className="text-[9px] font-bold text-emerald-500 uppercase tracking-[0.2em] mb-0.5">Step 5</div>
                  <h2 className="font-bold text-lg text-emerald-900 tracking-tight leading-none">Pallet Setup</h2>
                </div>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label-text">Pallet Name</label>
                    <input 
                      type="text" 
                      value={pallet.name} 
                      onChange={e => setPallet({...pallet, name: e.target.value})}
                      className="input-field"
                      placeholder="e.g. Euro Pallet"
                    />
                  </div>
                  <div>
                    <label className="label-text">Description</label>
                    <input 
                      type="text" 
                      value={pallet.description || ''} 
                      onChange={e => setPallet({...pallet, description: e.target.value})}
                      className="input-field"
                      placeholder="Enter pallet description..."
                    />
                  </div>
                </div>
                <div>
                  <label className="label-text">Standard Type</label>
                  <select
                    value={pallet.id}
                    onChange={(e) => {
                      const selected = STANDARD_PALLETS.find(p => p.id === e.target.value);
                      if (selected) setPallet(selected);
                    }}
                    className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-emerald-500 outline-none text-zinc-900"
                  >
                    {STANDARD_PALLETS.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.length}x{p.width}mm)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label-text">Max Height (mm)</label>
                    <NumberInput 
                      value={pallet.maxHeight} 
                      onChange={e => setPallet({...pallet, maxHeight: Number(e.target.value)})}
                      className="input-field"
                      min={10}
                      max={10000}
                    />
                  </div>
                  <div>
                    <label className="label-text">Max Weight (kg)</label>
                    <NumberInput 
                      value={pallet.maxWeight} 
                      onChange={e => setPallet({...pallet, maxWeight: Number(e.target.value)})}
                      className="input-field"
                      min={10}
                      max={10000}
                    />
                  </div>
                </div>
                {pallet.id === 'custom' && (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="label-text">Length (mm)</label>
                        <NumberInput 
                          value={pallet.length} 
                          onChange={e => setPallet({...pallet, length: Number(e.target.value)})}
                          className="input-field"
                          min={100}
                          max={10000}
                        />
                      </div>
                      <div>
                        <label className="label-text">Width (mm)</label>
                        <NumberInput 
                          value={pallet.width} 
                          onChange={e => setPallet({...pallet, width: Number(e.target.value)})}
                          className="input-field"
                          min={100}
                          max={10000}
                        />
                      </div>
                      <div>
                        <label className="label-text">Height (mm)</label>
                        <NumberInput 
                          value={pallet.height} 
                          onChange={e => setPallet({...pallet, height: Number(e.target.value)})}
                          className="input-field"
                          min={10}
                          max={10000}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="label-text">Empty Pallet Weight (kg)</label>
                      <NumberInput 
                        value={pallet.emptyWeight} 
                        onChange={e => setPallet({...pallet, emptyWeight: Number(e.target.value)})}
                        className="input-field"
                        min={1}
                        max={10000}
                      />
                    </div>
                  </>
                )}
              </div>
            </section>
          )}

          {/* Shipment Planning */}
          <section className="glass-panel p-4 bg-gradient-to-br from-zinc-800 to-zinc-900 text-white">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-white text-black rounded-xl flex items-center justify-center shadow-lg tilted-icon-container">
                <Settings size={20} />
              </div>
              <div>
                <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-[0.2em] mb-0.5">Step 6</div>
                <h2 className="font-bold text-lg text-white tracking-tight leading-none">Shipment Summary</h2>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="p-3 bg-zinc-800/50 rounded-xl border border-zinc-700/50 space-y-2">
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-400">Shipping Method:</span>
                  <span className={cn(
                    "font-bold uppercase tracking-widest",
                    shippingMethod === 'pallet' ? "text-emerald-400" : "text-blue-400"
                  )}>
                    {shippingMethod}
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-400">Total Boxes to Order:</span>
                  <span className="font-bold text-white">{result.totalBoxesNeeded}</span>
                </div>
                {shippingMethod === 'pallet' && calculationMode === 'full' && (
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-400">Total Pallets Needed:</span>
                    <span className="font-bold text-emerald-400">{result.totalPalletsNeeded}</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2">
                <button 
                  onClick={() => {
                    setCalculationMode('full');
                    // Force a re-calculation by slightly updating state if needed, 
                    // but useMemo should handle it. Let's show a success feedback.
                    const btn = document.activeElement as HTMLButtonElement;
                    if (btn) {
                      const originalText = btn.innerHTML;
                      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check"><polyline points="20 6 9 17 4 12"></polyline></svg> OPTIMIZED';
                      btn.classList.add('from-emerald-500', 'to-teal-500');
                      setTimeout(() => {
                        btn.innerHTML = originalText;
                        btn.classList.remove('from-emerald-500', 'to-teal-500');
                      }, 2000);
                    }
                  }}
                  disabled={shipmentItems.length === 0}
                  className="py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-[10px] font-bold rounded-xl transition-all shadow-md shadow-emerald-900/20 flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95"
                >
                  <Layers size={14} />
                  OPTIMIZE PALLETIZATION
                </button>
              </div>

              <button 
                onClick={() => handleExport('excel')}
                className={cn(
                  "w-full py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg",
                  shippingMethod === 'courier'
                    ? "bg-blue-600 text-white shadow-blue-900/20 hover:bg-blue-500"
                    : "bg-emerald-600 text-white shadow-emerald-900/20 hover:bg-emerald-500"
                )}
              >
                <Download size={16} />
                GENERATE REPORT
              </button>
            </div>
          </section>
        </div>

        {/* Right Column: Results & Visualization */}
        <div className="lg:col-span-8 space-y-6">
          <GeneralSummary 
            result={useMemo(() => {
              if (selectedPalletIndex === null || !result.pallets) return result;
              const selectedPallet = result.pallets[selectedPalletIndex];
              if (!selectedPallet) return result;
              
              const selectedPalletBoxes = selectedPallet.boxes;
              const palletWeight = selectedPallet.weight;
              const maxH = selectedPallet.loadDimensions.height - pallet.height;
              
              return {
                ...result,
                boxes: selectedPalletBoxes,
                palletWeight,
                boxesPerPalletBalanced: selectedPalletBoxes.length,
                loadDimensions: { ...result.loadDimensions, height: pallet.height + maxH },
                totalPalletsNeeded: 1, // Focus on this one
                isLastPalletDifferent: false,
                isStable: selectedPallet.isStable,
                stabilityScore: selectedPallet.stabilityScore,
                warnings: selectedPallet.warnings
              };
            }, [result, selectedPalletIndex, pallet])} 
            currentSingleResult={currentSingleResult}
            currentBox={box}
            currentPallet={pallet}
            currentPart={part}
            shippingMethod={shippingMethod}
            calculationMode={calculationMode}
          />

          {/* Visualization Area */}
          <div className="glass-panel overflow-hidden flex flex-col min-h-[700px]">
            <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <LayoutGrid size={18} className="text-zinc-500" />
                  <h3 className="font-semibold text-sm">Packing Visualization</h3>
                </div>
                <div className="flex bg-zinc-200/50 p-1 rounded-lg">
                  {shippingMethod === 'pallet' && (
                    <button 
                      onClick={() => setViewMode('pallet')}
                      className={cn(
                        "px-3 py-1 text-[10px] font-bold uppercase rounded-md transition-all",
                        viewMode === 'pallet' ? "bg-white text-emerald-600 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                      )}
                    >
                      Pallet View
                    </button>
                  )}
                  <button 
                    onClick={() => setViewMode('box')}
                    className={cn(
                      "px-3 py-1 text-[10px] font-bold uppercase rounded-md transition-all",
                      viewMode === 'box' ? "bg-white text-blue-600 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                    )}
                  >
                    Box View
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <span className="px-2 py-1 bg-zinc-200 rounded text-[10px] font-bold text-zinc-600 uppercase">Metric Units</span>
                <span className="px-2 py-1 bg-emerald-100 rounded text-[10px] font-bold text-emerald-700 uppercase">Optimized</span>
              </div>
            </div>
            
            <div className="flex-1 flex flex-col bg-zinc-100/30 relative overflow-hidden">
              <AnimatePresence mode="wait">
                {isCalculatingResult && result.boxes?.length === 0 ? (
                  <motion.div 
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-20 bg-white/60 backdrop-blur-sm flex items-center justify-center"
                  >
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 border-4 border-zinc-900 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-[10px] font-black text-zinc-900 uppercase tracking-widest">Recalculating...</span>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
              {/* Navigation Controls */}
              <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 max-w-[200px]">
                {viewMode === 'pallet' && result.totalPalletsNeeded > 1 && (
                  <div className="bg-white/80 backdrop-blur-md p-2 rounded-xl border border-zinc-200 shadow-sm space-y-2">
                    <div className="text-[9px] font-bold text-zinc-400 uppercase px-1">Pallet Selection</div>
                    <div className="flex flex-wrap gap-1">
                      <button
                        onClick={() => setSelectedPalletIndex(null)}
                        className={cn(
                          "px-2 py-1 rounded text-[9px] font-bold transition-all",
                          selectedPalletIndex === null ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                        )}
                      >
                        ALL
                      </button>
                      {Array.from({ length: result.totalPalletsNeeded }).map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedPalletIndex(idx)}
                          className={cn(
                            "px-2 py-1 rounded text-[9px] font-bold transition-all",
                            selectedPalletIndex === idx ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                          )}
                        >
                          P{idx + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <PackingCanvas 
                viewMode={viewMode}
                part={part}
                box={box}
                pallet={pallet}
                result={viewMode === 'box' ? currentSingleResult : result}
                selectedPalletIndex={selectedPalletIndex}
                onResultChange={(newRes) => {
                  if (viewMode === 'pallet') setResult({ ...newRes });
                }}
              />

              {/* Hidden Capture Canvases */}
              {exportStep !== 'idle' && (
                <div className="fixed inset-0 z-[100] bg-white/90 backdrop-blur-md flex flex-col items-center justify-center">
                  <div className="text-center space-y-4">
                    <RotateCcw size={48} className="mx-auto text-emerald-600 animate-spin" />
                    <h2 className="text-xl font-bold text-zinc-900">Generating Excel Report...</h2>
                    <p className="text-zinc-500">Capturing 3D visualizations for the report</p>
                    <div className="text-sm font-mono text-zinc-400">Step: {exportStep}</div>
                  </div>
                  
                  <div className="opacity-0 pointer-events-none absolute h-0 w-0 overflow-hidden">
                    {exportStep === 'pallet' && (
                      <div className="w-[800px] h-[600px]">
                        <PackingCanvas 
                          viewMode="pallet"
                          part={part}
                          box={box}
                          pallet={pallet}
                          result={result}
                          selectedPalletIndex={currentPalletCaptureIndex}
                          onCapture={(img) => {
                            setPalletImages(prev => [...prev, img]);
                            if (currentPalletCaptureIndex < (result.totalPalletsNeeded || 1) - 1) {
                              setCurrentPalletCaptureIndex(prev => prev + 1);
                            } else {
                              setExportStep('final');
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Legend / Info Overlay */}
              <div className="absolute bottom-4 left-4 right-4 bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-white/50 flex justify-between items-center shadow-lg pointer-events-none">
                <div className="flex gap-6">
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold text-zinc-400 uppercase">
                      {viewMode === 'pallet' ? 'Container' : 'Master Box'}
                    </div>
                    <div className="flex items-center gap-2 text-xs font-medium text-zinc-700">
                      <div className={cn(
                        "w-3 h-3 rounded-sm border",
                        viewMode === 'pallet' ? "bg-amber-800 border-amber-900" : "bg-orange-100 border-orange-400"
                      )} />
                      <span>{viewMode === 'pallet' ? pallet.name : box.name}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold text-zinc-400 uppercase">
                      {viewMode === 'pallet' ? 'Content' : 'Item'}
                    </div>
                    <div className="flex items-center gap-2 text-xs font-medium text-zinc-700">
                      <div className={cn(
                        "w-3 h-3 rounded-sm border",
                        viewMode === 'pallet' ? "bg-orange-200 border-orange-400" : "bg-blue-400 border-blue-600"
                      )} />
                      <span>{viewMode === 'pallet' ? box.name : part.name}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold text-zinc-400 uppercase">Grid Layout (X,Y,Z)</div>
                  <div className="text-sm font-mono font-bold text-emerald-600">
                    {viewMode === 'pallet' 
                      ? `${result.palletGrid.nx} × ${result.palletGrid.ny} × ${result.palletGrid.nz}`
                      : `${result.boxGrid.nx} × ${result.boxGrid.ny} × ${result.boxGrid.nz}`
                    }
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Breakdown Removed */}
        </div>
      </main>

      {/* Footer */}
      <footer className="p-6 text-center text-zinc-400 text-xs border-t border-zinc-100 bg-white">
        <p>© 2026 <span className="font-inter font-thin">DIAM</span> Palletizer - Advanced Logistics Optimization Engine</p>
        <p className="mt-1 italic">All calculations are based on rectangular bounding boxes and standard metric units.</p>
      </footer>
    </div>
  );
}

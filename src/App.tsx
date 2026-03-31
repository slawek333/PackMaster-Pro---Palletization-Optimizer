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
  RefreshCw, 
  Maximize2, 
  Weight, 
  ChevronRight,
  Info,
  Layers,
  LayoutGrid,
  Plus,
  Trash2,
  Check,
  Sparkles,
  Cpu,
  Archive,
  Palette
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Edges, Center, Environment, ContactShadows, Bounds, useBounds, Text } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';
import { Part, Container, Pallet, PackingResult, Simulation, SessionResult, PackedBox, PalletLoad } from './types';
import { SimulationItem } from './components/SimulationItem';
import { GeneralSummary } from './components/GeneralSummary';
import { optimizePacking, packSessionSimulations } from './utils/packing';
import { exportToExcel } from './utils/export';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GoogleGenAI } from '@google/genai';
import { getOptimalBoxSuggestion, type AISuggestion } from './services/geminiService';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const STANDARD_PALLETS: Pallet[] = [
  { id: 'euro', name: 'Euro Pallet (EPAL)', length: 1200, width: 800, height: 150, maxWeight: 1500, maxHeight: 2000, emptyWeight: 25 },
  { id: 'half', name: 'Half Pallet', length: 800, width: 600, height: 150, maxWeight: 500, maxHeight: 2000, emptyWeight: 10 },
  { id: 'ind', name: 'Industrial Pallet', length: 1200, width: 1000, height: 150, maxWeight: 1500, maxHeight: 2000, emptyWeight: 30 },
  { id: 'custom', name: 'Custom Pallet', length: 1200, width: 800, height: 150, maxWeight: 1500, maxHeight: 2000, emptyWeight: 25 },
];

const INITIAL_PARTS: Part[] = [
  { id: 'p1', name: 'Engine Component A', length: 120, width: 80, height: 60, weight: 1.2, orderQuantity: 1000 },
  { id: 'p2', name: 'Brake Pad Set', length: 200, width: 150, height: 50, weight: 2.5, orderQuantity: 500 },
];

const INITIAL_BOXS: Container[] = [
  { id: 'c1', name: 'Master Box K3', length: 600, width: 400, height: 400, maxWeight: 25, emptyWeight: 0.8 },
  { id: 'c2', name: 'Large Box XL', length: 800, width: 600, height: 500, maxWeight: 40, emptyWeight: 1.5 },
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
  label?: string;
  onClick?: () => void;
  isSelected?: boolean;
  isStable?: boolean;
}

const MeshBox = ({ position, args, color, edgeColor, opacity = 1, label, onClick, isSelected, isStable = true }: MeshBoxProps) => {
  const fontSize = Math.min(args[1] * 0.5, 0.4); // Scale font size based on height, max 0.4
  
  const finalColor = !isStable ? "#ef4444" : (isSelected ? "#fbbf24" : color);
  const finalEdgeColor = !isStable ? "#b91c1c" : (isSelected ? "#f59e0b" : edgeColor);

  return (
    <group position={position}>
      <mesh 
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = 'auto')}
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
      {label && (
        <group>
          {/* Top */}
          <Text
            position={[0, args[1] / 2 + 0.001, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={fontSize}
            color="black"
            anchorX="center"
            anchorY="middle"
          >
            {label}
          </Text>
          {/* Front (+Z) */}
          <Text
            position={[0, 0, args[2] / 2 + 0.001]}
            rotation={[0, 0, 0]}
            fontSize={fontSize}
            color="black"
            anchorX="center"
            anchorY="middle"
          >
            {label}
          </Text>
          {/* Back (-Z) */}
          <Text
            position={[0, 0, -args[2] / 2 - 0.001]}
            rotation={[0, Math.PI, 0]}
            fontSize={fontSize}
            color="black"
            anchorX="center"
            anchorY="middle"
          >
            {label}
          </Text>
          {/* Right (+X) */}
          <Text
            position={[args[0] / 2 + 0.001, 0, 0]}
            rotation={[0, Math.PI / 2, 0]}
            fontSize={fontSize}
            color="black"
            anchorX="center"
            anchorY="middle"
          >
            {label}
          </Text>
          {/* Left (-X) */}
          <Text
            position={[-args[0] / 2 - 0.001, 0, 0]}
            rotation={[0, -Math.PI / 2, 0]}
            fontSize={fontSize}
            color="black"
            anchorX="center"
            anchorY="middle"
          >
            {label}
          </Text>
        </group>
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
        <MeshBox key={`bottom-${i}`} position={[0, yBottom, z]} args={[w, tBottom, boardWide]} color={woodColor} edgeColor={edgeColor} />
      ))}

      {/* Blocks (9) */}
      {xPositions.map((x, i) => (
        zPositions.map((z, j) => (
          <MeshBox key={`block-${i}-${j}`} position={[x, yBlock, z]} args={[stringerW, tBlock, boardWide]} color={woodColor} edgeColor={edgeColor} />
        ))
      ))}

      {/* Stringer boards (3) - running along width (Z) */}
      {xPositions.map((x, i) => (
        <MeshBox key={`stringer-${i}`} position={[x, yStringer, 0]} args={[stringerW, tStringer, d]} color={woodColor} edgeColor={edgeColor} />
      ))}

      {/* Top boards (5) - running along length (X) */}
      {zTopPositions.map((z, i) => (
        <MeshBox key={`top-${i}`} position={[0, yTop, z]} args={[w, tTop, zTopWidths[i]]} color={woodColor} edgeColor={edgeColor} />
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
    if (localValue === '' || isNaN(numVal)) errorMsg = "Required";
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
  sessionResult,
  selectedPalletIndex,
  selectedSimulationId,
  onCapture
}: { 
  viewMode: 'pallet' | 'box', 
  part: Part, 
  box: Container, 
  pallet: Pallet, 
  result: PackingResult,
  sessionResult?: SessionResult,
  selectedPalletIndex: number | null,
  selectedSimulationId: string | null,
  onCapture?: (img: string) => void
}) => {
  const scale = 0.01;
  const [selectedId, setSelectedId] = useState<string | number | null>(null);

  // Find the simulation for box view
  const activeSim = useMemo(() => {
    if (sessionResult && selectedSimulationId) {
      return sessionResult.simulations.find(s => s.id === selectedSimulationId);
    }
    return null;
  }, [sessionResult, selectedSimulationId]);

  const currentPart = activeSim ? activeSim.part : part;
  const currentBox = activeSim ? activeSim.box : box;
  const currentResult = activeSim ? activeSim.result : result;

  return (
    <div className="w-full h-full min-h-[700px] flex-1 cursor-move bg-zinc-50/50 relative">
      <Canvas 
        shadows 
        dpr={[1, 2]} 
        camera={{ position: [10, 10, 10], fov: 30 }} 
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
        gl={{ preserveDrawingBuffer: true }}
      >
        {onCapture && <CanvasCapture onCapture={onCapture} />}
        <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 2} enableDamping dampingFactor={0.05} />
        
        <ambientLight intensity={0.9} />
        <pointLight position={[10, 10, 10]} intensity={1.5} castShadow />
        <spotLight position={[-10, 10, -10]} intensity={0.5} />
        
        <Bounds fit clip observe margin={1.05}>
          <CameraController viewMode={viewMode} result={currentResult} selectedId={selectedId} />
          <Center top>
            {viewMode === 'pallet' ? (
              <group onClick={() => setSelectedId(null)}>
                {sessionResult ? (
                  // Session View (Multiple Pallets)
                  (() => {
                    const palletsToShow = selectedPalletIndex !== null 
                      ? [sessionResult.pallets[selectedPalletIndex]] 
                      : sessionResult.pallets;

                    const palletsPerRow = Math.ceil(Math.sqrt(palletsToShow.length));
                    const spacing = 600 * scale;
                    
                    return palletsToShow.map((pLoad, idx) => {
                      const palletIdx = selectedPalletIndex !== null ? selectedPalletIndex : idx;
                      const row = Math.floor(idx / palletsPerRow);
                      const col = idx % palletsPerRow;
                      const offsetX = col * (pallet.length * scale + spacing);
                      const offsetZ = row * (pallet.width * scale + spacing);
                      
                      return (
                        <group key={palletIdx} position={[offsetX, 0, offsetZ]}>
                          <PalletMesh pallet={pallet} />
                          <group position={[-pallet.length * scale / 2, 0, -pallet.width * scale / 2]}>
                            {pLoad.boxes.map((c, i) => (
                              <MeshBox 
                                key={i}
                                position={[c.x * scale + c.length * scale / 2, c.z * scale + c.height * scale / 2, c.y * scale + c.width * scale / 2]}
                                args={[c.length * scale - 0.0005, c.height * scale - 0.0005, c.width * scale - 0.0005]}
                                color={c.color}
                                edgeColor={c.edgeColor}
                                label={c.partName.substring(0, 8)}
                                onClick={() => setSelectedId(`p${palletIdx}-c${i}`)}
                                isSelected={selectedId === `p${palletIdx}-c${i}`}
                                isStable={c.isStable}
                              />
                            ))}
                          </group>
                        </group>
                      );
                    });
                  })()
                ) : (
                  // Single Simulation View
                  (() => {
                    const palletsPerRow = Math.ceil(Math.sqrt(result.totalPalletsNeeded));
                    const spacing = 400 * scale;
                    
                    return Array.from({ length: result.totalPalletsNeeded }).map((_, palletIdx) => {
                      const row = Math.floor(palletIdx / palletsPerRow);
                      const col = palletIdx % palletsPerRow;
                      const offsetX = col * (pallet.length * scale + spacing);
                      const offsetZ = row * (pallet.width * scale + spacing);
                      
                      const isLast = palletIdx === result.totalPalletsNeeded - 1;
                      const countOnThisPallet = isLast ? result.lastPalletBoxes : result.boxesPerPalletBalanced;
                      
                      const [l, w, h] = result.orientations.pallet.split('x').map(Number);
                      const cw = l * scale;
                      const cd = w * scale;
                      const ch = h * scale;
                      const nx = result.palletGrid.nx;
                      const ny = result.palletGrid.ny;

                      // Calculate actual footprint for centering
                      const actualNx = Math.min(nx, countOnThisPallet);
                      const actualNy = Math.min(ny, Math.ceil(countOnThisPallet / nx));

                      return (
                        <group key={palletIdx} position={[offsetX, 0, offsetZ]}>
                          <PalletMesh pallet={pallet} />
                          <group position={[-(actualNx * cw) / 2, 0, -(actualNy * cd) / 2]}>
                            {Array.from({ length: countOnThisPallet }).map((_, i) => {
                              const ix = i % nx;
                              const iy = Math.floor(i / nx) % ny;
                              const iz = Math.floor(i / (nx * ny));
                              const globalId = `p${palletIdx}-c${i}`;
                              
                              return (
                                <MeshBox 
                                  key={i}
                                  position={[ix * cw + cw/2, iz * ch + ch/2, iy * cd + cd/2]}
                                  args={[cw - 0.0005, ch - 0.0005, cd - 0.0005]}
                                  color="#fef3c7"
                                  edgeColor="#d97706"
                                  label={part.name.substring(0, 8)}
                                  onClick={() => setSelectedId(globalId)}
                                  isSelected={selectedId === globalId}
                                  isStable={result.isStable}
                                />
                              );
                            })}
                          </group>
                        </group>
                      );
                    });
                  })()
                )}
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
                  const [l, w, h] = currentResult.orientations.box.split('x').map(Number);
                  const pw = l * scale;
                  const pd = w * scale;
                  const ph = h * scale;
                  const nx = currentResult.boxGrid.nx;
                  const ny = currentResult.boxGrid.ny;

                  const partsToRender = Math.min(currentResult.partsPerBox, currentPart.orderQuantity);

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
                            args={[pw - 0.005, ph - 0.005, pd - 0.005]}
                            color="#93c5fd"
                            edgeColor="#3b82f6"
                            onClick={() => setSelectedId(i)}
                            isSelected={selectedId === i}
                          />
                        );
                      })}
                    </group>
                  );
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
        <gridHelper args={[60, 60, '#f1f5f9', '#f8fafc']} position={[0, -0.01, 0]} />
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
                  {viewMode === 'pallet' ? box.name : part.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Dimensions:</span>
                <span className="font-medium text-zinc-700">
                  {viewMode === 'pallet' ? result.orientations.pallet : result.orientations.box} mm
                </span>
              </div>
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
  const [pallet, setPallet] = useState<Pallet>(STANDARD_PALLETS[0]);
  const [viewMode, setViewMode] = useState<'pallet' | 'box'>('pallet');
  const [shippingMethod, setShippingMethod] = useState<'pallet' | 'courier'>('pallet');
  const [calculationMode, setCalculationMode] = useState<'full' | 'boxes-only'>('full');
  const [selectedPalletIndex, setSelectedPalletIndex] = useState<number | null>(null);
  const [selectedSimulationId, setSelectedSimulationId] = useState<string | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [projectNumber, setProjectNumber] = useState('');

  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);

  const part = useMemo(() => parts.find(p => p.id === selectedPartId) || parts[0], [parts, selectedPartId]);
  const box = useMemo(() => boxes.find(c => c.id === selectedBoxId) || boxes[0], [boxes, selectedBoxId]);

  const result = useMemo(() => optimizePacking(part, box, pallet, part.orderQuantity), [part, box, pallet, part.orderQuantity]);

  const addSimulationToSession = () => {
    const newSim: Simulation = {
      id: Math.random().toString(36).substr(2, 9),
      part,
      box,
      quantity: part.orderQuantity,
      result
    };
    const newSims = [...simulations, newSim];
    setSimulations(newSims);
    const newSessionResult = packSessionSimulations(newSims, pallet);
    setSessionResult(newSessionResult);
    if (!selectedSimulationId) setSelectedSimulationId(newSim.id);
  };

  const removeSimulation = (id: string) => {
    const newSims = simulations.filter(s => s.id !== id);
    setSimulations(newSims);
    if (newSims.length > 0) {
      setSessionResult(packSessionSimulations(newSims, pallet));
      if (selectedSimulationId === id) {
        setSelectedSimulationId(newSims[0].id);
      }
    } else {
      setSessionResult(null);
      setSelectedSimulationId(null);
    }
  };

  const editSimulation = (sim: Simulation) => {
    // Update the part and box lists if they don't exist, or just update their values
    setParts(prev => {
      const exists = prev.find(p => p.id === sim.part.id);
      if (exists) {
        return prev.map(p => p.id === sim.part.id ? sim.part : p);
      }
      return [...prev, sim.part];
    });
    setBoxes(prev => {
      const exists = prev.find(b => b.id === sim.box.id);
      if (exists) {
        return prev.map(b => b.id === sim.box.id ? sim.box : b);
      }
      return [...prev, sim.box];
    });
    
    setSelectedPartId(sim.part.id);
    setSelectedBoxId(sim.box.id);
    
    // Remove it from the session so it can be re-added
    removeSimulation(sim.id);
  };

  const handleExport = async () => {
    setIsOptimizing(true);
    try {
      // We'll use a temporary hidden container to render both views and capture them
      // For now, let's just capture the current view if possible, 
      // but the user wants BOTH. So we'll trigger a multi-step capture.
      
      // I'll implement a more robust way: 
      // 1. Create a hidden canvas for each view
      // 2. Capture them
      // 3. Export
      
      // Since I can't easily "render to string" or "render to buffer" without a visible canvas in some browsers,
      // I'll use a state-based approach where we briefly show a "Generating Report" overlay.
      setExportStep('pallet');
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsOptimizing(false);
    }
  };

  const [exportStep, setExportStep] = useState<'idle' | 'pallet' | 'box' | 'final'>('idle');
  const [palletImage, setPalletImage] = useState<string | undefined>();
  const [boxImage, setBoxImage] = useState<string | undefined>();
  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSuggestingAI, setIsSuggestingAI] = useState(false);
  const [aiSuggestionModal, setAiSuggestionModal] = useState<AISuggestion | null>(null);

  const handleAISuggestion = async () => {
    setIsSuggestingAI(true);
    try {
      const suggestion = await getOptimalBoxSuggestion(part, part.orderQuantity, shippingMethod, shippingMethod === 'pallet' ? pallet : undefined);
      
      const newBox: Container = {
        id: Math.random().toString(36).substr(2, 9),
        name: suggestion.boxName,
        length: suggestion.length,
        width: suggestion.width,
        height: suggestion.height,
        maxWeight: 30, // Default max weight for courier/general
        emptyWeight: 0.5 // Default empty weight
      };
      
      setBoxes([...boxes, newBox]);
      setSelectedBoxId(newBox.id);
      setAiSuggestionModal(suggestion);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to get AI suggestion');
    } finally {
      setIsSuggestingAI(false);
    }
  };

  const generateAIInsights = async () => {
    if (!result && !sessionResult) return;
    
    setIsAnalyzing(true);
    setAiInsights(null);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      let promptData = '';
      if (sessionResult) {
        promptData = `
          Total Pallets Needed: ${sessionResult.pallets.length}
          Total Weight: ${sessionResult.totalWeight.toFixed(1)} kg
          Overall Volume Utilization: ${(sessionResult.overallUtilization * 100).toFixed(1)}%
          Total Boxes Packed: ${sessionResult.totalBoxes}
        `;
      } else if (result) {
        const totalShipmentWeight = ((result.isLastPalletDifferent ? result.totalPalletsNeeded - 1 : result.totalPalletsNeeded) * result.balancedPalletWeight + (result.isLastPalletDifferent ? result.lastPalletWeight : 0)).toFixed(1);
        promptData = `
          Part: ${part.name} (${part.length}x${part.width}x${part.height}mm, ${part.weight}kg)
          Box: ${box.name} (${box.length}x${box.width}x${box.height}mm)
          Parts per Box: ${result.partsPerBox}
          Box Volume Utilization: ${(result.boxVolumeUtilization * 100).toFixed(1)}%
          Total Pallets Needed: ${result.totalPalletsNeeded}
          Boxes per Full Pallet: ${result.boxesPerPallet}
          Total Shipment Weight: ${totalShipmentWeight} kg
          Pallet Volume Utilization: ${(result.palletVolumeUtilization * 100).toFixed(1)}%
        `;
      }

      const prompt = `You are an expert logistics and supply chain AI assistant for DIAM Palletizer.
      Please analyze the following palletization and packing data and provide a short, professional summary (max 3-4 sentences).
      Highlight any efficiencies, potential cost savings, or optimization tips.
      
      Data:
      ${promptData}
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      setAiInsights(response.text || "No insights generated.");
    } catch (error) {
      console.error("AI Analysis failed:", error);
      setAiInsights("Failed to generate AI insights. Please try again later.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    if (exportStep === 'final' && palletImage && boxImage) {
      exportToExcel(part, box, pallet, result, part.orderQuantity, palletImage, boxImage, simulations, sessionResult, shippingMethod, projectNumber);
      setExportStep('idle');
      setPalletImage(undefined);
      setBoxImage(undefined);
    }
  }, [exportStep, palletImage, boxImage, part, box, pallet, result, simulations, sessionResult, shippingMethod, projectNumber]);

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
  };

  const addPart = () => {
    const newPart: Part = {
      id: Math.random().toString(36).substr(2, 9),
      name: 'New Part',
      length: 100,
      width: 100,
      height: 100,
      weight: 1.0,
      orderQuantity: 100
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
      emptyWeight: 0.5
    };
    setBoxes([...boxes, newBox]);
    setSelectedBoxId(newBox.id);
  };

  const deletePart = (id: string) => {
    if (parts.length <= 1) return;
    const newParts = parts.filter(p => p.id !== id);
    setParts(newParts);
    if (selectedPartId === id) setSelectedPartId(newParts[0].id);
  };

  const deleteBox = (id: string) => {
    if (boxes.length <= 1) return;
    const newBoxes = boxes.filter(c => c.id !== id);
    setBoxes(newBoxes);
    if (selectedBoxId === id) setSelectedBoxId(newBoxes[0].id);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="h-16 bg-zinc-950 text-white flex items-center px-6 sticky top-0 z-50 border-b border-zinc-800 shadow-sm">
        <div className="flex items-center gap-3">
          <svg width="36" height="36" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M 12 12 Q 55 10 95 42 Q 75 80 28 92 Q 10 55 12 12 Z" fill="white" />
            <path d="M 48 46 Q 35 25 12 12" stroke="black" strokeWidth="5" fill="none" strokeLinecap="round" />
            <path d="M 48 46 Q 70 35 95 42" stroke="black" strokeWidth="5" fill="none" strokeLinecap="round" />
            <path d="M 48 46 Q 35 70 28 92" stroke="black" strokeWidth="5" fill="none" strokeLinecap="round" />
          </svg>
          <h1 className="font-light text-2xl tracking-[0.2em] mt-1 bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">DIAM</h1>
        </div>

        <div className="ml-12 flex items-center gap-6">
          <div className="hidden md:flex items-center gap-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Project No.</label>
            <input
              type="text"
              value={projectNumber}
              onChange={(e) => setProjectNumber(e.target.value)}
              placeholder="e.g. PRJ-123"
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 w-32 transition-all"
            />
          </div>

          <div className="hidden md:flex bg-zinc-900 p-1 rounded-xl border border-zinc-800 shadow-inner">
            <button 
              onClick={() => {
                setShippingMethod('pallet');
                setCalculationMode('full');
                setViewMode('pallet');
              }}
            className={cn(
              "px-5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 transition-all duration-300",
              shippingMethod === 'pallet' 
                ? "bg-emerald-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)] scale-105" 
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            <Layers size={14} />
            Pallet Shipping
          </button>
          <button 
            onClick={() => {
              setShippingMethod('courier');
              setCalculationMode('boxes-only');
              setViewMode('box');
            }}
            className={cn(
              "px-5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 transition-all duration-300",
              shippingMethod === 'courier' 
                ? "bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)] scale-105" 
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            <Truck size={14} />
            Courier Shipping
          </button>
        </div>
        </div>

        <div className="ml-auto flex items-center gap-4">
          <button 
            onClick={handleReset}
            className="text-zinc-400 hover:text-white transition-colors flex items-center gap-1 text-sm font-medium"
          >
            <RefreshCw size={14} />
            Reset
          </button>
          <button 
            onClick={handleExport}
            className="bg-white hover:bg-zinc-200 text-black px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all shadow-sm active:scale-95"
          >
            <Download size={16} />
            Export Report
          </button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 max-w-[1600px] mx-auto w-full">
        {/* Left Column: Inputs */}
        <div className="lg:col-span-4 space-y-6">
          {/* Part Library */}
          <section className="glass-panel p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-50 text-blue-600 rounded-md">
                  <Cpu size={18} />
                </div>
                <h2 className="font-semibold text-zinc-900">Part Library</h2>
              </div>
              <button 
                onClick={addPart}
                className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-500 transition-colors"
                title="Add New Part"
              >
                <Plus size={18} />
              </button>
            </div>
            
            <div className="space-y-3 mb-6 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
              {parts.map(p => (
                <div 
                  key={p.id}
                  className={cn(
                    "group flex items-center justify-between p-2 rounded-lg border transition-all cursor-pointer",
                    selectedPartId === p.id 
                      ? "border-blue-500 bg-blue-50/50" 
                      : "border-zinc-100 hover:border-zinc-200"
                  )}
                  onClick={() => setSelectedPartId(p.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-4 h-4 rounded-full border flex items-center justify-center",
                      selectedPartId === p.id ? "border-blue-500 bg-blue-500" : "border-zinc-300"
                    )}>
                      {selectedPartId === p.id && <Check size={10} className="text-white" />}
                    </div>
                    <span className="text-sm font-medium text-zinc-700">{p.name}</span>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); deletePart(p.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-red-500 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="space-y-4 pt-4 border-t border-zinc-100">
              <div>
                <label className="label-text">Part Name</label>
                <input 
                  type="text" 
                  value={part.name} 
                  onChange={e => {
                    const newParts = parts.map(p => p.id === selectedPartId ? {...p, name: e.target.value} : p);
                    setParts(newParts);
                  }}
                  className="input-field"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label-text">Length (mm)</label>
                  <NumberInput 
                    value={part.length} 
                    onChange={e => {
                      const newParts = parts.map(p => p.id === selectedPartId ? {...p, length: Number(e.target.value)} : p);
                      setParts(newParts);
                    }}
                    className="input-field"
                    min={0.1}
                    max={10000}
                  />
                </div>
                <div>
                  <label className="label-text">Width (mm)</label>
                  <NumberInput 
                    value={part.width} 
                    onChange={e => {
                      const newParts = parts.map(p => p.id === selectedPartId ? {...p, width: Number(e.target.value)} : p);
                      setParts(newParts);
                    }}
                    className="input-field"
                    min={0.1}
                    max={10000}
                  />
                </div>
                <div>
                  <label className="label-text">Height (mm)</label>
                  <NumberInput 
                    value={part.height} 
                    onChange={e => {
                      const newParts = parts.map(p => p.id === selectedPartId ? {...p, height: Number(e.target.value)} : p);
                      setParts(newParts);
                    }}
                    className="input-field"
                    min={0.1}
                    max={10000}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label-text">Unit Weight (kg)</label>
                  <div className="relative">
                    <NumberInput 
                      value={part.weight} 
                      onChange={e => {
                        const newParts = parts.map(p => p.id === selectedPartId ? {...p, weight: Number(e.target.value)} : p);
                        setParts(newParts);
                      }}
                      className="input-field pr-10"
                      min={0.01}
                      max={10000}
                    />
                    <div className="absolute right-3 top-[19px] -translate-y-1/2 text-zinc-400">
                      <Weight size={14} />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="label-text">Total Order Qty</label>
                  <NumberInput 
                    value={part.orderQuantity} 
                    onChange={e => {
                      const newParts = parts.map(p => p.id === selectedPartId ? {...p, orderQuantity: Number(e.target.value)} : p);
                      setParts(newParts);
                    }}
                    className="input-field"
                    min={1}
                    max={1000000}
                  />
                </div>
                <div>
                  <label className="label-text">Max Qty in Box (Optional)</label>
                  <NumberInput 
                    value={part.maxPartsPerBox || 0} 
                    onChange={e => {
                      const val = Number(e.target.value);
                      const newParts = parts.map(p => p.id === selectedPartId ? {...p, maxPartsPerBox: val > 0 ? val : undefined} : p);
                      setParts(newParts);
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
          <section className="glass-panel p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-orange-50 text-orange-600 rounded-md">
                  <Archive size={18} />
                </div>
                <h2 className="font-semibold text-zinc-900">Box Library</h2>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleAISuggestion}
                  disabled={isSuggestingAI}
                  className="px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-700 text-xs font-medium rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50"
                  title="Use AI to suggest the optimal box dimensions"
                >
                  {isSuggestingAI ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  AI Optimize Box
                </button>
                <button 
                  onClick={addBox}
                  className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-500 transition-colors"
                  title="Add New Box"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>

            <div className="space-y-3 mb-6 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
              {boxes.map(c => (
                <div 
                  key={c.id}
                  className={cn(
                    "group flex items-center justify-between p-2 rounded-lg border transition-all cursor-pointer",
                    selectedBoxId === c.id 
                      ? "border-orange-500 bg-orange-50/50" 
                      : "border-zinc-100 hover:border-zinc-200"
                  )}
                  onClick={() => setSelectedBoxId(c.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-4 h-4 rounded-full border flex items-center justify-center",
                      selectedBoxId === c.id ? "border-orange-500 bg-orange-500" : "border-zinc-300"
                    )}>
                      {selectedBoxId === c.id && <Check size={10} className="text-white" />}
                    </div>
                    <span className="text-sm font-medium text-zinc-700">{c.name}</span>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); deleteBox(c.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-red-500 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="space-y-4 pt-4 border-t border-zinc-100">
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
              <div className="grid grid-cols-3 gap-3">
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
              <div className="grid grid-cols-2 gap-3">
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
                  <label className="label-text">Empty Weight (kg)</label>
                  <NumberInput 
                    value={box.emptyWeight} 
                    onChange={e => {
                      const newBoxes = boxes.map(c => c.id === selectedBoxId ? {...c, emptyWeight: Number(e.target.value)} : c);
                      setBoxes(newBoxes);
                    }}
                    className="input-field"
                    min={0}
                    max={10000}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Pallet Configuration - Only show if not in courier mode */}
          {shippingMethod === 'pallet' && (
            <section className="glass-panel p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 bg-purple-50 text-purple-600 rounded-md">
                  <Palette size={18} />
                </div>
                <h2 className="font-semibold text-zinc-900">Pallet Setup</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="label-text">Pallet Name</label>
                  <input 
                    type="text" 
                    value={pallet.name} 
                    onChange={e => setPallet({...pallet, name: e.target.value})}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="label-text">Standard Type</label>
                  <div className="grid grid-cols-1 gap-2">
                    {STANDARD_PALLETS.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setPallet(p)}
                        className={cn(
                          "text-left px-3 py-2 rounded-lg border text-sm transition-all",
                          pallet.id === p.id 
                            ? "border-emerald-500 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-500" 
                            : "border-zinc-200 hover:border-zinc-300 text-zinc-600"
                        )}
                      >
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs opacity-70">{p.length} x {p.width} mm</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
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
          <section className="glass-panel p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-md">
                <Truck size={18} />
              </div>
              <h2 className="font-semibold text-zinc-900">Shipment Summary</h2>
            </div>
            
            <div className="space-y-4">
              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-100 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Shipping Method:</span>
                  <span className={cn(
                    "font-bold uppercase",
                    shippingMethod === 'pallet' ? "text-emerald-600" : "text-blue-600"
                  )}>
                    {shippingMethod}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Total Boxes to Order:</span>
                  <span className="font-bold text-zinc-900">{result.totalBoxesNeeded}</span>
                </div>
                {shippingMethod === 'pallet' && calculationMode === 'full' && (
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">Total Pallets Needed:</span>
                    <span className="font-bold text-emerald-600">{result.totalPalletsNeeded}</span>
                  </div>
                )}
              </div>
              <button 
                onClick={addSimulationToSession}
                className={cn(
                  "w-full py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-95",
                  shippingMethod === 'courier'
                    ? "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                    : "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                )}
              >
                <Plus size={16} />
                Add to Session
              </button>
            </div>
          </section>

          {/* Active Session */}
          {simulations.length > 0 && (
            <section className="glass-panel p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-blue-50 text-blue-600 rounded-md">
                    <LayoutGrid size={18} />
                  </div>
                  <h2 className="font-semibold text-zinc-900">Active Session</h2>
                </div>
                <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  {simulations.length} Simulations
                </span>
              </div>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {simulations.map((sim, idx) => (
                  <SimulationItem key={sim.id} sim={sim} idx={idx} onRemove={removeSimulation} onEdit={editSimulation} />
                ))}
              </div>
              {sessionResult && (
                <div className="mt-4 pt-4 border-t border-zinc-100 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">Total Pallets (Mixed):</span>
                    <span className="font-bold text-emerald-600">{sessionResult.pallets.length}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">Total Session Weight:</span>
                    <span className="font-bold text-zinc-900">{sessionResult.totalWeight.toFixed(1)} kg</span>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        {/* Right Column: Results & Visualization */}
        <div className="lg:col-span-8 space-y-6">
          <GeneralSummary 
            result={result} 
            sessionResult={sessionResult} 
            simulations={simulations} 
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
              {/* Navigation Controls */}
              <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 max-w-[200px]">
                {viewMode === 'pallet' && sessionResult && (
                  <div className="bg-white/80 backdrop-blur-md p-2 rounded-xl border border-zinc-200 shadow-sm space-y-2">
                    <div className="text-[10px] font-bold text-zinc-400 uppercase px-1">Pallet Selection</div>
                    <div className="flex flex-wrap gap-1">
                      <button
                        onClick={() => setSelectedPalletIndex(null)}
                        className={cn(
                          "px-2 py-1 rounded text-[10px] font-bold transition-all",
                          selectedPalletIndex === null ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                        )}
                      >
                        ALL
                      </button>
                      {sessionResult.pallets.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedPalletIndex(idx)}
                          className={cn(
                            "px-2 py-1 rounded text-[10px] font-bold transition-all",
                            selectedPalletIndex === idx ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                          )}
                        >
                          P{idx + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {viewMode === 'box' && sessionResult && (
                  <div className="bg-white/80 backdrop-blur-md p-2 rounded-xl border border-zinc-200 shadow-sm space-y-2">
                    <div className="text-[10px] font-bold text-zinc-400 uppercase px-1">Simulation Selection</div>
                    <div className="flex flex-col gap-1 max-h-[150px] overflow-y-auto custom-scrollbar">
                      {sessionResult.simulations.map((sim) => (
                        <button
                          key={sim.id}
                          onClick={() => setSelectedSimulationId(sim.id)}
                          className={cn(
                            "px-2 py-1 rounded text-[10px] font-bold text-left truncate transition-all",
                            selectedSimulationId === sim.id ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                          )}
                        >
                          {sim.part.name}
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
                result={result}
                sessionResult={sessionResult || undefined}
                selectedPalletIndex={selectedPalletIndex}
                selectedSimulationId={selectedSimulationId}
              />

              {/* Hidden Capture Canvases */}
              {exportStep !== 'idle' && (
                <div className="fixed inset-0 z-[100] bg-white/90 backdrop-blur-md flex flex-col items-center justify-center">
                  <div className="text-center space-y-4">
                    <RefreshCw size={48} className="mx-auto text-emerald-600 animate-spin" />
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
                          selectedPalletIndex={null}
                          selectedSimulationId={null}
                          onCapture={(img) => {
                            setPalletImage(img);
                            setExportStep('box');
                          }}
                        />
                      </div>
                    )}
                    {exportStep === 'box' && (
                      <div className="w-[800px] h-[600px]">
                        <PackingCanvas 
                          viewMode="box"
                          part={part}
                          box={box}
                          pallet={pallet}
                          result={result}
                          selectedPalletIndex={null}
                          selectedSimulationId={null}
                          onCapture={(img) => {
                            setBoxImage(img);
                            setExportStep('final');
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

          {/* Detailed Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="glass-panel p-5">
              <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                <Info size={14} className="text-blue-500" />
                Box Efficiency
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Gross Weight</span>
                  <span className="font-medium">{result.boxWeight.toFixed(2)} kg</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Net Weight (Parts)</span>
                  <span className="font-medium">{(result.partsPerBox * part.weight).toFixed(2)} kg</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Volume Used</span>
                  <span className="font-medium">{(result.boxVolumeUtilization * 100).toFixed(1)}%</span>
                </div>
                <div className="w-full bg-zinc-100 h-2 rounded-full overflow-hidden mt-2">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${result.boxVolumeUtilization * 100}%` }}
                    className="h-full bg-blue-500"
                  />
                </div>
              </div>
            </section>

            {shippingMethod === 'pallet' && (
              <section className="glass-panel p-5">
                <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                  <Info size={14} className="text-purple-500" />
                  Pallet Efficiency
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Total Weight (Full)</span>
                    <span className="font-medium">{result.palletWeight.toFixed(1)} kg</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Total Shipment Weight</span>
                    <span className="font-medium text-emerald-600">
                      {((result.isLastPalletDifferent ? result.totalPalletsNeeded - 1 : result.totalPalletsNeeded) * result.balancedPalletWeight + (result.isLastPalletDifferent ? result.lastPalletWeight : 0)).toFixed(1)} kg
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Load Dimensions</span>
                    <span className="font-medium">{Math.round(result.loadDimensions.length)} x {Math.round(result.loadDimensions.width)} x {Math.round(result.loadDimensions.height)} mm</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Weight Capacity Used</span>
                    <span className="font-medium">{((result.palletWeight / pallet.maxWeight) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Volume Used</span>
                    <span className="font-medium">{(result.palletVolumeUtilization * 100).toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-zinc-100 h-2 rounded-full overflow-hidden mt-2">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${result.palletVolumeUtilization * 100}%` }}
                      className="h-full bg-purple-500"
                    />
                  </div>
                </div>
              </section>
            )}

            {shippingMethod === 'pallet' && (
              <section className="glass-panel p-5 md:col-span-2">
                <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                  <Truck size={14} className="text-emerald-500" />
                  Pallet Distribution
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    {(!result.isLastPalletDifferent || result.totalPalletsNeeded > 1) && (
                      <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                        <div>
                          <div className="text-[10px] font-bold text-emerald-600 uppercase">Standard Pallets</div>
                          <div className="text-2xl font-bold text-emerald-900">
                            {result.isLastPalletDifferent ? result.totalPalletsNeeded - 1 : result.totalPalletsNeeded}
                          </div>
                          <div className="text-[10px] text-emerald-700 font-medium mt-1">
                            Weight: <span className="font-bold">{result.balancedPalletWeight.toFixed(1)} kg</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] font-bold text-emerald-600 uppercase">Boxes / Pallet</div>
                          <div className="text-2xl font-bold text-emerald-900">{result.boxesPerPalletBalanced}</div>
                        </div>
                      </div>
                    )}
                    
                    {result.isLastPalletDifferent && (
                      <div className="flex items-center justify-between p-4 bg-amber-50 rounded-xl border border-amber-100">
                        <div>
                          <div className="text-[10px] font-bold text-amber-600 uppercase">{result.totalPalletsNeeded === 1 ? 'Pallet' : 'Last Pallet'}</div>
                          <div className="text-2xl font-bold text-amber-900">1</div>
                          <div className="text-[10px] text-amber-700 font-medium mt-1">
                            Weight: <span className="font-bold">{result.lastPalletWeight.toFixed(1)} kg</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] font-bold text-amber-600 uppercase">Boxes / Pallet</div>
                          <div className="text-2xl font-bold text-amber-900">{result.lastPalletBoxes}</div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-col justify-center space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <div className="w-2 h-2 rounded-full bg-emerald-600" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-zinc-600 leading-relaxed">
                          Wysyłka zostanie podzielona na <span className="font-bold text-zinc-900">{result.totalPalletsNeeded}</span> palet.
                        </p>
                        {result.totalPalletsNeeded > 1 && (
                          <p className="text-[10px] text-zinc-500 italic">
                            {result.isLastPalletDifferent 
                              ? `Pełna paleta: ${result.boxesPerPalletBalanced} boxów. Ostatnia paleta: ${result.lastPalletBoxes} boxów.`
                              : `Każda paleta zawiera ${result.boxesPerPalletBalanced} boxów.`
                            }
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <div className="w-2 h-2 rounded-full bg-blue-600" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-zinc-600 leading-relaxed">
                          Należy zamówić łącznie <span className="font-bold text-zinc-900">{result.totalBoxesNeeded}</span> kartonów typu <span className="italic">{box.name}</span>.
                        </p>
                        <p className="text-[10px] text-zinc-500 italic">
                          {result.isLastBoxDifferent
                            ? `Pełny karton: ${result.partsPerBox} szt. Ostatni karton: ${result.partsInLastBox} szt.`
                            : `Każdy karton zawiera ${result.partsPerBox} sztuk części.`
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-6 text-center text-zinc-400 text-xs border-t border-zinc-100 bg-white">
        <p>© 2026 DIAM Palletizer - Advanced Logistics Optimization Engine</p>
        <p className="mt-1 italic">All calculations are based on rectangular bounding boxes and standard metric units.</p>
      </footer>

      {/* AI Suggestion Modal */}
      <AnimatePresence>
        {aiSuggestionModal && (
          <motion.div 
            key="ai-suggestion-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={() => setAiSuggestionModal(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white flex items-center gap-3">
                <Sparkles size={24} className="text-purple-200" />
                <div>
                  <h2 className="text-xl font-bold">AI Box Suggestion</h2>
                  <p className="text-purple-200 text-sm">Optimized for {shippingMethod === 'pallet' ? 'Pallet' : 'Courier'} Shipping</p>
                </div>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100">
                    <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Suggested Name</div>
                    <div className="text-lg font-semibold text-zinc-900">{aiSuggestionModal.boxName}</div>
                  </div>
                  <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100">
                    <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Dimensions (mm)</div>
                    <div className="text-lg font-semibold text-zinc-900">
                      {aiSuggestionModal.length} <span className="text-zinc-400 text-sm">L</span> × {aiSuggestionModal.width} <span className="text-zinc-400 text-sm">W</span> × {aiSuggestionModal.height} <span className="text-zinc-400 text-sm">H</span>
                    </div>
                  </div>
                </div>
                
                <div>
                  <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Explanation & Strategy</div>
                  <div className="bg-purple-50 p-5 rounded-xl border border-purple-100 text-purple-900 text-sm leading-relaxed whitespace-pre-wrap">
                    {aiSuggestionModal.explanation}
                  </div>
                </div>
                
                <div className="flex justify-end pt-4 border-t border-zinc-100">
                  <button 
                    onClick={() => setAiSuggestionModal(null)}
                    className="px-6 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white font-medium rounded-xl transition-colors"
                  >
                    Apply & Close
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

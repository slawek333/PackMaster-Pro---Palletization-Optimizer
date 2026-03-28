/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
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
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Edges, Center, Environment, ContactShadows, Bounds, useBounds, Text } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';
import { Part, Container, Pallet, PackingResult, Simulation, SessionResult, PackedCarton, PalletLoad } from './types';
import { optimizePacking, packSessionSimulations } from './utils/packing';
import { exportToExcel } from './utils/export';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const STANDARD_PALLETS: Pallet[] = [
  { id: 'euro', name: 'Euro Pallet (EPAL)', length: 1200, width: 800, height: 150, maxWeight: 1500, maxHeight: 2000 },
  { id: 'ind', name: 'Industrial Pallet', length: 1200, width: 1000, height: 150, maxWeight: 1500, maxHeight: 2000 },
  { id: 'us', name: 'US Standard', length: 1219, width: 1016, height: 150, maxWeight: 1500, maxHeight: 2000 },
];

const INITIAL_PARTS: Part[] = [
  { id: 'p1', name: 'Engine Component A', length: 120, width: 80, height: 60, weight: 1.2 },
  { id: 'p2', name: 'Brake Pad Set', length: 200, width: 150, height: 50, weight: 2.5 },
];

const INITIAL_CARTONS: Container[] = [
  { id: 'c1', name: 'Master Carton K3', length: 600, width: 400, height: 400, maxWeight: 25, emptyWeight: 0.8 },
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
}

const MeshBox = ({ position, args, color, edgeColor, opacity = 1, label, onClick, isSelected }: MeshBoxProps) => {
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
          color={isSelected ? "#fbbf24" : color} 
          transparent={opacity < 1 || isSelected} 
          opacity={isSelected ? 0.9 : opacity} 
          metalness={isSelected ? 0.5 : 0.1}
          roughness={isSelected ? 0.2 : 0.8}
        />
        <Edges color={isSelected ? "#f59e0b" : edgeColor} threshold={15} />
      </mesh>
      {label && (
        <Text
          position={[0, args[1] / 2 + 0.01, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.05}
          color="black"
          anchorX="center"
          anchorY="middle"
        >
          {label}
        </Text>
      )}
    </group>
  );
};

const PalletMesh = ({ pallet }: { pallet: Pallet }) => {
  const scale = 0.01; // mm to meters for Three.js
  const w = pallet.length * scale;
  const d = pallet.width * scale;
  const h = pallet.height * scale;

  return (
    <group position={[0, -h/2, 0]}>
      {/* Main base */}
      <MeshBox 
        position={[0, 0, 0]} 
        args={[w, h, d]} 
        color="#78350f" 
        edgeColor="#451a03" 
      />
      {/* Slats (visual only) */}
      {Array.from({ length: 5 }).map((_, i) => (
        <MeshBox 
          key={i}
          position={[0, h/2 + 0.01, (i - 2) * (d/5)]}
          args={[w, 0.01, d/10]}
          color="#92400e"
          edgeColor="#451a03"
        />
      ))}
    </group>
  );
};

const CameraController = ({ targetView, viewMode, result, selectedId }: { targetView: string, viewMode: string, result: any, selectedId: string | number | null }) => {
  const { camera, controls } = useThree();
  const bounds = useBounds();
  
  useEffect(() => {
    if (!controls) return;
    
    // Always refresh bounds when view, viewMode or result changes
    bounds.refresh().clip();

    const positions: Record<string, [number, number, number]> = {
      perspective: [10, 10, 10],
      top: [0, 15, 0],
      front: [0, 0, 15],
      side: [15, 0, 0],
    };

    const targetPos = positions[targetView] || positions.perspective;
    
    // Use bounds.fit() for perspective to get a tight framing
    if (targetView === 'perspective') {
      if (selectedId !== null) {
        // If an item is selected, we could zoom to it, but for now let's just fit the whole thing
        // to keep context. Or we could fit the selection.
        // bounds.to({ position: [0,0,0], size: [1,1,1] }).fit();
        bounds.fit();
      } else {
        bounds.fit();
      }
    } else {
      // For orthogonal-like views, we animate position but keep it tight
      gsap.to(camera.position, {
        x: targetPos[0],
        y: targetPos[1],
        z: targetPos[2],
        duration: 0.6,
        ease: 'power3.out',
        onUpdate: () => {
          camera.lookAt(0, 0, 0);
        }
      });
    }

    // @ts-ignore
    gsap.to(controls.target, {
      x: 0,
      y: 0,
      z: 0,
      duration: 0.6,
      ease: 'power3.out',
    });
  }, [targetView, viewMode, result, bounds, controls, camera, selectedId]);

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

const PackingCanvas = ({ 
  viewMode, 
  targetView,
  part, 
  carton, 
  pallet, 
  result,
  sessionResult,
  selectedPalletIndex,
  selectedSimulationId,
  onCapture
}: { 
  viewMode: 'pallet' | 'carton', 
  targetView: string,
  part: Part, 
  carton: Container, 
  pallet: Pallet, 
  result: PackingResult,
  sessionResult?: SessionResult,
  selectedPalletIndex: number | null,
  selectedSimulationId: string | null,
  onCapture?: (img: string) => void
}) => {
  const scale = 0.01;
  const [selectedId, setSelectedId] = useState<string | number | null>(null);

  // Find the simulation for carton view
  const activeSim = useMemo(() => {
    if (sessionResult && selectedSimulationId) {
      return sessionResult.simulations.find(s => s.id === selectedSimulationId);
    }
    return null;
  }, [sessionResult, selectedSimulationId]);

  const currentPart = activeSim ? activeSim.part : part;
  const currentCarton = activeSim ? activeSim.carton : carton;
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
        <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 1.75} enableDamping dampingFactor={0.05} />
        
        <ambientLight intensity={0.9} />
        <pointLight position={[10, 10, 10]} intensity={1.5} castShadow />
        <spotLight position={[-10, 10, -10]} intensity={0.5} />
        
        <Bounds fit clip observe margin={1.05}>
          <CameraController targetView={targetView} viewMode={viewMode} result={currentResult} selectedId={selectedId} />
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
                            {pLoad.cartons.map((c, i) => (
                              <MeshBox 
                                key={i}
                                position={[c.x * scale + c.length * scale / 2, c.z * scale + c.height * scale / 2, c.y * scale + c.width * scale / 2]}
                                args={[c.length * scale - 0.01, c.height * scale - 0.01, c.width * scale - 0.01]}
                                color={c.color}
                                edgeColor={c.edgeColor}
                                label={c.partName.substring(0, 8)}
                                onClick={() => setSelectedId(`p${palletIdx}-c${i}`)}
                                isSelected={selectedId === `p${palletIdx}-c${i}`}
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
                      const countOnThisPallet = isLast ? result.lastPalletCartons : result.cartonsPerPalletBalanced;
                      
                      const [l, w, h] = result.orientations.pallet.split('x').map(Number);
                      const cw = l * scale;
                      const cd = w * scale;
                      const ch = h * scale;
                      const nx = result.palletGrid.nx;
                      const ny = result.palletGrid.ny;

                      return (
                        <group key={palletIdx} position={[offsetX, 0, offsetZ]}>
                          <PalletMesh pallet={pallet} />
                          <group position={[-(nx * cw) / 2, 0, -(ny * cd) / 2]}>
                            {Array.from({ length: countOnThisPallet }).map((_, i) => {
                              const ix = i % nx;
                              const iy = Math.floor(i / nx) % ny;
                              const iz = Math.floor(i / (nx * ny));
                              const globalId = `p${palletIdx}-c${i}`;
                              
                              return (
                                <MeshBox 
                                  key={i}
                                  position={[ix * cw + cw/2, iz * ch + ch/2, iy * cd + cd/2]}
                                  args={[cw - 0.01, ch - 0.01, cd - 0.01]}
                                  color="#fef3c7"
                                  edgeColor="#d97706"
                                  label={part.name.substring(0, 8)}
                                  onClick={() => setSelectedId(globalId)}
                                  isSelected={selectedId === globalId}
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
                {/* Carton Shell */}
                <mesh position={[0, currentCarton.height * scale / 2, 0]}>
                  <boxGeometry args={[currentCarton.length * scale, currentCarton.height * scale, currentCarton.width * scale]} />
                  <meshStandardMaterial color="#fdba74" transparent opacity={0.1} side={THREE.DoubleSide} />
                  <Edges color="#f97316" />
                </mesh>

                {/* Parts */}
                {(() => {
                  const [l, w, h] = currentResult.orientations.carton.split('x').map(Number);
                  const pw = l * scale;
                  const pd = w * scale;
                  const ph = h * scale;
                  const nx = currentResult.cartonGrid.nx;
                  const ny = currentResult.cartonGrid.ny;

                  return (
                    <group position={[-(nx * pw) / 2, 0, -(ny * pd) / 2]}>
                      {Array.from({ length: currentResult.partsPerCarton }).map((_, i) => {
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
                {viewMode === 'pallet' ? `Carton ${selectedId}` : `Part #${Number(selectedId) + 1}`}
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
                    const nx = viewMode === 'pallet' ? result.palletGrid.nx : result.cartonGrid.nx;
                    const ny = viewMode === 'pallet' ? result.palletGrid.ny : result.cartonGrid.ny;
                    
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
                  {viewMode === 'pallet' ? carton.name : part.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Dimensions:</span>
                <span className="font-medium text-zinc-700">
                  {viewMode === 'pallet' ? result.orientations.pallet : result.orientations.carton} mm
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none">
        <div className="bg-black/60 backdrop-blur-md text-white px-3 py-1 rounded-full text-[10px] font-medium flex items-center gap-2">
          <RefreshCw size={10} className="animate-spin-slow" />
          Drag to rotate • Scroll to zoom • Click to select
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [parts, setParts] = useState<Part[]>(INITIAL_PARTS);
  const [cartons, setCartons] = useState<Container[]>(INITIAL_CARTONS);
  const [selectedPartId, setSelectedPartId] = useState<string>(INITIAL_PARTS[0].id);
  const [selectedCartonId, setSelectedCartonId] = useState<string>(INITIAL_CARTONS[0].id);
  const [pallet, setPallet] = useState<Pallet>(STANDARD_PALLETS[0]);
  const [totalOrder, setTotalOrder] = useState<number>(1000);
  const [viewMode, setViewMode] = useState<'pallet' | 'carton'>('pallet');
  const [targetView, setTargetView] = useState<string>('perspective');
  const [selectedPalletIndex, setSelectedPalletIndex] = useState<number | null>(null);
  const [selectedSimulationId, setSelectedSimulationId] = useState<string | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);

  const part = useMemo(() => parts.find(p => p.id === selectedPartId) || parts[0], [parts, selectedPartId]);
  const carton = useMemo(() => cartons.find(c => c.id === selectedCartonId) || cartons[0], [cartons, selectedCartonId]);

  const result = useMemo(() => optimizePacking(part, carton, pallet, totalOrder), [part, carton, pallet, totalOrder]);

  const addSimulationToSession = () => {
    const newSim: Simulation = {
      id: Math.random().toString(36).substr(2, 9),
      part,
      carton,
      quantity: totalOrder,
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

  const [exportStep, setExportStep] = useState<'idle' | 'pallet' | 'carton' | 'final'>('idle');
  const [palletImage, setPalletImage] = useState<string | undefined>();
  const [cartonImage, setCartonImage] = useState<string | undefined>();

  useEffect(() => {
    if (exportStep === 'final' && palletImage && cartonImage) {
      exportToExcel(part, carton, pallet, result, totalOrder, palletImage, cartonImage, simulations, sessionResult);
      setExportStep('idle');
      setPalletImage(undefined);
      setCartonImage(undefined);
    }
  }, [exportStep, palletImage, cartonImage, part, carton, pallet, result, totalOrder, simulations, sessionResult]);

  const handleReset = () => {
    setParts(INITIAL_PARTS);
    setCartons(INITIAL_CARTONS);
    setSelectedPartId(INITIAL_PARTS[0].id);
    setSelectedCartonId(INITIAL_CARTONS[0].id);
    setPallet(STANDARD_PALLETS[0]);
    setTotalOrder(1000);
  };

  const addPart = () => {
    const newPart: Part = {
      id: Math.random().toString(36).substr(2, 9),
      name: 'New Part',
      length: 100,
      width: 100,
      height: 100,
      weight: 1.0
    };
    setParts([...parts, newPart]);
    setSelectedPartId(newPart.id);
  };

  const addCarton = () => {
    const newCarton: Container = {
      id: Math.random().toString(36).substr(2, 9),
      name: 'New Carton',
      length: 500,
      width: 400,
      height: 300,
      maxWeight: 20,
      emptyWeight: 0.5
    };
    setCartons([...cartons, newCarton]);
    setSelectedCartonId(newCarton.id);
  };

  const deletePart = (id: string) => {
    if (parts.length <= 1) return;
    const newParts = parts.filter(p => p.id !== id);
    setParts(newParts);
    if (selectedPartId === id) setSelectedPartId(newParts[0].id);
  };

  const deleteCarton = (id: string) => {
    if (cartons.length <= 1) return;
    const newCartons = cartons.filter(c => c.id !== id);
    setCartons(newCartons);
    if (selectedCartonId === id) setSelectedCartonId(newCartons[0].id);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-zinc-200 bg-white flex items-center px-6 sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white">
            <Package size={20} />
          </div>
          <h1 className="font-bold text-lg tracking-tight">PackMaster <span className="text-emerald-600">Pro</span></h1>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <button 
            onClick={handleReset}
            className="text-zinc-500 hover:text-zinc-900 transition-colors flex items-center gap-1 text-sm font-medium"
          >
            <RefreshCw size={14} />
            Reset
          </button>
          <button 
            onClick={handleExport}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all shadow-sm active:scale-95"
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
                  <Box size={18} />
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
                  <input 
                    type="number" 
                    value={part.length} 
                    onChange={e => {
                      const newParts = parts.map(p => p.id === selectedPartId ? {...p, length: Number(e.target.value)} : p);
                      setParts(newParts);
                    }}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="label-text">Width (mm)</label>
                  <input 
                    type="number" 
                    value={part.width} 
                    onChange={e => {
                      const newParts = parts.map(p => p.id === selectedPartId ? {...p, width: Number(e.target.value)} : p);
                      setParts(newParts);
                    }}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="label-text">Height (mm)</label>
                  <input 
                    type="number" 
                    value={part.height} 
                    onChange={e => {
                      const newParts = parts.map(p => p.id === selectedPartId ? {...p, height: Number(e.target.value)} : p);
                      setParts(newParts);
                    }}
                    className="input-field"
                  />
                </div>
              </div>
              <div>
                <label className="label-text">Unit Weight (kg)</label>
                <div className="relative">
                  <input 
                    type="number" 
                    value={part.weight} 
                    onChange={e => {
                      const newParts = parts.map(p => p.id === selectedPartId ? {...p, weight: Number(e.target.value)} : p);
                      setParts(newParts);
                    }}
                    className="input-field pr-10"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400">
                    <Weight size={14} />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Carton Library */}
          <section className="glass-panel p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-orange-50 text-orange-600 rounded-md">
                  <Layers size={18} />
                </div>
                <h2 className="font-semibold text-zinc-900">Carton Library</h2>
              </div>
              <button 
                onClick={addCarton}
                className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-500 transition-colors"
                title="Add New Carton"
              >
                <Plus size={18} />
              </button>
            </div>

            <div className="space-y-3 mb-6 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
              {cartons.map(c => (
                <div 
                  key={c.id}
                  className={cn(
                    "group flex items-center justify-between p-2 rounded-lg border transition-all cursor-pointer",
                    selectedCartonId === c.id 
                      ? "border-orange-500 bg-orange-50/50" 
                      : "border-zinc-100 hover:border-zinc-200"
                  )}
                  onClick={() => setSelectedCartonId(c.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-4 h-4 rounded-full border flex items-center justify-center",
                      selectedCartonId === c.id ? "border-orange-500 bg-orange-500" : "border-zinc-300"
                    )}>
                      {selectedCartonId === c.id && <Check size={10} className="text-white" />}
                    </div>
                    <span className="text-sm font-medium text-zinc-700">{c.name}</span>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); deleteCarton(c.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-red-500 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="space-y-4 pt-4 border-t border-zinc-100">
              <div>
                <label className="label-text">Carton Name</label>
                <input 
                  type="text" 
                  value={carton.name} 
                  onChange={e => {
                    const newCartons = cartons.map(c => c.id === selectedCartonId ? {...c, name: e.target.value} : c);
                    setCartons(newCartons);
                  }}
                  className="input-field"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label-text">Length (mm)</label>
                  <input 
                    type="number" 
                    value={carton.length} 
                    onChange={e => {
                      const newCartons = cartons.map(c => c.id === selectedCartonId ? {...c, length: Number(e.target.value)} : c);
                      setCartons(newCartons);
                    }}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="label-text">Width (mm)</label>
                  <input 
                    type="number" 
                    value={carton.width} 
                    onChange={e => {
                      const newCartons = cartons.map(c => c.id === selectedCartonId ? {...c, width: Number(e.target.value)} : c);
                      setCartons(newCartons);
                    }}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="label-text">Height (mm)</label>
                  <input 
                    type="number" 
                    value={carton.height} 
                    onChange={e => {
                      const newCartons = cartons.map(c => c.id === selectedCartonId ? {...c, height: Number(e.target.value)} : c);
                      setCartons(newCartons);
                    }}
                    className="input-field"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-text">Max Weight (kg)</label>
                  <input 
                    type="number" 
                    value={carton.maxWeight} 
                    onChange={e => {
                      const newCartons = cartons.map(c => c.id === selectedCartonId ? {...c, maxWeight: Number(e.target.value)} : c);
                      setCartons(newCartons);
                    }}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="label-text">Empty Weight (kg)</label>
                  <input 
                    type="number" 
                    value={carton.emptyWeight} 
                    onChange={e => {
                      const newCartons = cartons.map(c => c.id === selectedCartonId ? {...c, emptyWeight: Number(e.target.value)} : c);
                      setCartons(newCartons);
                    }}
                    className="input-field"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Pallet Configuration */}
          <section className="glass-panel p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 bg-purple-50 text-purple-600 rounded-md">
                <Truck size={18} />
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
                  <input 
                    type="number" 
                    value={pallet.maxHeight} 
                    onChange={e => setPallet({...pallet, maxHeight: Number(e.target.value)})}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="label-text">Max Weight (kg)</label>
                  <input 
                    type="number" 
                    value={pallet.maxWeight} 
                    onChange={e => setPallet({...pallet, maxWeight: Number(e.target.value)})}
                    className="input-field"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Shipment Planning */}
          <section className="glass-panel p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-md">
                <LayoutGrid size={18} />
              </div>
              <h2 className="font-semibold text-zinc-900">Shipment Planning</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label-text">Total Order Quantity (Parts)</label>
                <input 
                  type="number" 
                  value={totalOrder} 
                  onChange={e => setTotalOrder(Number(e.target.value))}
                  className="input-field"
                  min="1"
                />
              </div>
              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-100 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Total Cartons to Order:</span>
                  <span className="font-bold text-zinc-900">{result.totalCartonsNeeded}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Total Pallets Needed:</span>
                  <span className="font-bold text-emerald-600">{result.totalPalletsNeeded}</span>
                </div>
              </div>
              <button 
                onClick={addSimulationToSession}
                className="w-full py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-sm font-bold flex items-center justify-center gap-2 hover:bg-emerald-100 transition-colors"
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
                  <div key={sim.id} className="p-3 bg-white border border-zinc-100 rounded-xl flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-zinc-50 flex items-center justify-center text-zinc-400 font-bold text-xs">
                        {idx + 1}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-zinc-900">{sim.part.name}</div>
                        <div className="text-[10px] text-zinc-500">{sim.result.totalCartonsNeeded} cartons • {sim.quantity} parts</div>
                      </div>
                    </div>
                    <button 
                      onClick={() => removeSimulation(sim.id)}
                      className="p-1.5 text-zinc-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
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
          {/* Top Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-panel p-5 border-l-4 border-l-blue-500"
            >
              <div className="text-xs font-bold text-zinc-400 uppercase mb-1">
                {sessionResult ? 'Total Cartons' : 'Parts per Carton'}
              </div>
              <div className="text-3xl font-bold text-zinc-900">
                {sessionResult ? sessionResult.totalCartons : result.partsPerCarton}
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                {sessionResult ? 'Across all simulations' : `Utilization: ${(result.cartonVolumeUtilization * 100).toFixed(1)}%`}
              </div>
            </motion.div>
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass-panel p-5 border-l-4 border-l-orange-500"
            >
              <div className="text-xs font-bold text-zinc-400 uppercase mb-1">
                {sessionResult ? 'Total Pallets' : 'Cartons per Pallet'}
              </div>
              <div className="text-3xl font-bold text-zinc-900">
                {sessionResult ? sessionResult.pallets.length : Math.min(result.totalCartonsNeeded, result.cartonsPerPallet)}
                {!sessionResult && <span className="text-sm text-zinc-400 font-normal ml-2">/ {result.cartonsPerPallet} max</span>}
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                Utilization: <span className="font-semibold text-emerald-600">
                  {((sessionResult ? sessionResult.overallUtilization : result.palletVolumeUtilization) * 100).toFixed(1)}%
                </span>
              </div>
            </motion.div>
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="glass-panel p-5 border-l-4 border-l-emerald-500"
            >
              <div className="text-xs font-bold text-zinc-400 uppercase mb-1">
                {sessionResult ? 'Total Weight' : 'Total Parts / Pallet'}
              </div>
              <div className="text-3xl font-bold text-zinc-900">
                {sessionResult ? sessionResult.totalWeight.toFixed(0) : result.totalPartsPerPallet}
                {sessionResult && <span className="text-sm text-zinc-400 font-normal ml-1">kg</span>}
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                {sessionResult ? 'Gross shipment weight' : `Total Weight: ${result.palletWeight.toFixed(1)} kg`}
              </div>
            </motion.div>
          </div>

          {/* Visualization Area */}
          <div className="glass-panel overflow-hidden flex flex-col min-h-[700px]">
            <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <LayoutGrid size={18} className="text-zinc-500" />
                  <h3 className="font-semibold text-sm">Packing Visualization</h3>
                </div>
                <div className="flex bg-zinc-200/50 p-1 rounded-lg">
                  <button 
                    onClick={() => setViewMode('pallet')}
                    className={cn(
                      "px-3 py-1 text-[10px] font-bold uppercase rounded-md transition-all",
                      viewMode === 'pallet' ? "bg-white text-emerald-600 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                    )}
                  >
                    Pallet View
                  </button>
                  <button 
                    onClick={() => setViewMode('carton')}
                    className={cn(
                      "px-3 py-1 text-[10px] font-bold uppercase rounded-md transition-all",
                      viewMode === 'carton' ? "bg-white text-blue-600 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                    )}
                  >
                    Carton View
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

                {viewMode === 'carton' && sessionResult && (
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
                targetView={targetView}
                part={part}
                carton={carton}
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
                          targetView="perspective"
                          part={part}
                          carton={carton}
                          pallet={pallet}
                          result={result}
                          selectedPalletIndex={null}
                          selectedSimulationId={null}
                          onCapture={(img) => {
                            setPalletImage(img);
                            setExportStep('carton');
                          }}
                        />
                      </div>
                    )}
                    {exportStep === 'carton' && (
                      <div className="w-[800px] h-[600px]">
                        <PackingCanvas 
                          viewMode="carton"
                          targetView="perspective"
                          part={part}
                          carton={carton}
                          pallet={pallet}
                          result={result}
                          selectedPalletIndex={null}
                          selectedSimulationId={null}
                          onCapture={(img) => {
                            setCartonImage(img);
                            setExportStep('final');
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* View Controls */}
              <div className="absolute top-4 right-4 flex flex-col gap-2">
                {[
                  { id: 'perspective', label: '3D View', icon: Box },
                  { id: 'top', label: 'Top View', icon: ArrowDown },
                  { id: 'front', label: 'Front View', icon: ArrowRight },
                  { id: 'side', label: 'Side View', icon: ArrowUpRight },
                ].map((view) => (
                  <button
                    key={view.id}
                    onClick={() => setTargetView(view.id)}
                    className={cn(
                      "p-2 rounded-xl border transition-all duration-300 flex items-center gap-2 group",
                      targetView === view.id 
                        ? "bg-emerald-600 border-emerald-700 text-white shadow-lg" 
                        : "bg-white/80 backdrop-blur-md border-zinc-200 text-zinc-600 hover:bg-white"
                    )}
                  >
                    <view.icon className="w-4 h-4" />
                    <span className={cn(
                      "text-[10px] font-bold uppercase tracking-wider overflow-hidden transition-all duration-300",
                      targetView === view.id ? "w-20 opacity-100" : "w-0 opacity-0 group-hover:w-20 group-hover:opacity-100"
                    )}>
                      {view.label}
                    </span>
                  </button>
                ))}
              </div>

              {/* Legend / Info Overlay */}
              <div className="absolute bottom-4 left-4 right-4 bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-white/50 flex justify-between items-center shadow-lg pointer-events-none">
                <div className="flex gap-6">
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold text-zinc-400 uppercase">
                      {viewMode === 'pallet' ? 'Container' : 'Master Carton'}
                    </div>
                    <div className="flex items-center gap-2 text-xs font-medium text-zinc-700">
                      <div className={cn(
                        "w-3 h-3 rounded-sm border",
                        viewMode === 'pallet' ? "bg-amber-800 border-amber-900" : "bg-orange-100 border-orange-400"
                      )} />
                      <span>{viewMode === 'pallet' ? pallet.name : carton.name}</span>
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
                      <span>{viewMode === 'pallet' ? carton.name : part.name}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold text-zinc-400 uppercase">Grid Layout (X,Y,Z)</div>
                  <div className="text-sm font-mono font-bold text-emerald-600">
                    {viewMode === 'pallet' 
                      ? `${result.palletGrid.nx} × ${result.palletGrid.ny} × ${result.palletGrid.nz}`
                      : `${result.cartonGrid.nx} × ${result.cartonGrid.ny} × ${result.cartonGrid.nz}`
                    }
                  </div>
                </div>
              </div>

              {/* Interaction Hint */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/10 backdrop-blur-sm rounded-full text-[10px] text-zinc-500 font-medium pointer-events-none">
                Drag to rotate • Scroll to zoom
              </div>
            </div>
          </div>

          {/* Detailed Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="glass-panel p-5">
              <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                <Info size={14} className="text-blue-500" />
                Carton Efficiency
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Gross Weight</span>
                  <span className="font-medium">{result.cartonWeight.toFixed(2)} kg</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Net Weight (Parts)</span>
                  <span className="font-medium">{(result.partsPerCarton * part.weight).toFixed(2)} kg</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Volume Used</span>
                  <span className="font-medium">{(result.cartonVolumeUtilization * 100).toFixed(1)}%</span>
                </div>
                <div className="w-full bg-zinc-100 h-2 rounded-full overflow-hidden mt-2">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${result.cartonVolumeUtilization * 100}%` }}
                    className="h-full bg-blue-500"
                  />
                </div>
              </div>
            </section>

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

            <section className="glass-panel p-5 md:col-span-2">
              <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                <Truck size={14} className="text-emerald-500" />
                Balanced Distribution per Pallet
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
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
                      <div className="text-[10px] font-bold text-emerald-600 uppercase">Cartons / Pallet</div>
                      <div className="text-2xl font-bold text-emerald-900">{result.cartonsPerPalletBalanced}</div>
                    </div>
                  </div>
                  
                  {result.isLastPalletDifferent && (
                    <div className="flex items-center justify-between p-4 bg-amber-50 rounded-xl border border-amber-100">
                      <div>
                        <div className="text-[10px] font-bold text-amber-600 uppercase">Last Pallet</div>
                        <div className="text-2xl font-bold text-amber-900">1</div>
                        <div className="text-[10px] text-amber-700 font-medium mt-1">
                          Weight: <span className="font-bold">{result.lastPalletWeight.toFixed(1)} kg</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-bold text-amber-600 uppercase">Cartons / Pallet</div>
                        <div className="text-2xl font-bold text-amber-900">{result.lastPalletCartons}</div>
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
                            ? `Pełna paleta: ${result.cartonsPerPalletBalanced} kartonów. Ostatnia paleta: ${result.lastPalletCartons} kartonów.`
                            : `Każda paleta zawiera ${result.cartonsPerPalletBalanced} kartonów.`
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
                        Należy zamówić łącznie <span className="font-bold text-zinc-900">{result.totalCartonsNeeded}</span> kartonów typu <span className="italic">{carton.name}</span>.
                      </p>
                      <p className="text-[10px] text-zinc-500 italic">
                        {result.isLastCartonDifferent
                          ? `Pełny karton: ${result.partsPerCarton} szt. Ostatni karton: ${result.partsInLastCarton} szt.`
                          : `Każdy karton zawiera ${result.partsPerCarton} sztuk części.`
                        }
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-6 text-center text-zinc-400 text-xs border-t border-zinc-100 bg-white">
        <p>© 2026 PackMaster Pro - Advanced Logistics Optimization Engine</p>
        <p className="mt-1 italic">All calculations are based on rectangular bounding boxes and standard metric units.</p>
      </footer>
    </div>
  );
}

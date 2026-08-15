import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ApplyEdits } from '../wailsjs/go/main/App';
import { backend } from '../wailsjs/go/models';
import { useRenderScene } from './RenderScene';
import './Editor.css';

import {
  FaceInfo,
  getVoxelInfo,
  setupKeyboardHotkeys,
  useEditorVisuals,
  useEditorInteraction
} from './editor/EditorLogic';

import {
  EditorPalette,
  EditorTools,
  EditorHistory,
  EditorControls
} from './editor/EditorUI';

interface EditorProps {
  objContent: string;
  mtlContent: string;
  isIsometric: boolean;
  palette: string[];
  onDone: (newObj: string, newMtl: string, count: number, newPalette: string[]) => void;
  onCancel: () => void;
}

export default function Editor({ objContent, mtlContent, isIsometric, palette, onDone, onCancel }: EditorProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isRenderMode, setIsRenderMode] = useState(false);
  const [localIsIsometric, setLocalIsIsometric] = useState(isIsometric);

  const [paletteColors, setPaletteColors] = useState<string[]>(palette || []);
  const [selectedColor, setSelectedColor] = useState<string | null>((palette && palette.length > 0) ? palette[0] : null);
  const [activeTool, setActiveTool] = useState<'none' | 'brush' | 'eraser'>('none');
  const [edits, setEdits] = useState<backend.EditAction[]>([]);
  const [isApplying, setIsApplying] = useState(false);

  const activeToolRef = useRef(activeTool);
  const selectedColorRef = useRef(selectedColor);
  const isRenderModeRef = useRef(isRenderMode);

  const pointerDownPosRef = useRef({ x: 0, y: 0 });
  const depthScaleRef = useRef(1);

  const voxelMapRef = useRef(new Map<string, { center: THREE.Vector3; faces: FaceInfo[] }>());
  const paintedVoxelsRef = useRef(new Map<string, THREE.Mesh>());

  const { sceneRef, cameraRef, rendererRef, loadedObjectGroupRef } = useRenderScene({
    mountRef,
    objContent,
    mtlContent,
    isRenderMode,
    isIsometric: localIsIsometric,
    isEditorMode: true,
    onObjectLoaded: (group: THREE.Group, box: THREE.Box3) => {
      const obj = group.children[0] as THREE.Group;

      let calcDepth = 1;
      obj.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh || calcDepth !== 1) return;

        const mesh = child as THREE.Mesh;
        const posAttr = mesh.geometry.attributes.position;
        for (let i = 0; i < posAttr.count; i += 3) {
          const a = new THREE.Vector3().fromBufferAttribute(posAttr, i);
          const b = new THREE.Vector3().fromBufferAttribute(posAttr, i + 1);
          const c = new THREE.Vector3().fromBufferAttribute(posAttr, i + 2);
          const zMin = Math.min(a.z, b.z, c.z);
          const zMax = Math.max(a.z, b.z, c.z);
          const dz = zMax - zMin;
          if (dz > 0.01) {
            calcDepth = dz;
            break;
          }
        }
      });
      if (calcDepth < 0.01) calcDepth = 1;
      depthScaleRef.current = calcDepth;

      const vMap = new Map<string, { center: THREE.Vector3; faces: FaceInfo[] }>();

      obj.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return;

        const mesh = child as THREE.Mesh;
        const index = mesh.geometry.index;
        const posAttr = mesh.geometry.attributes.position;
        const count = index ? index.count : posAttr.count;

        for (let i = 0; i < count; i += 3) {
          const aIdx = index ? index.getX(i) : i;
          const bIdx = index ? index.getX(i + 1) : i + 1;
          const cIdx = index ? index.getX(i + 2) : i + 2;

          const { key, center, a, b, c } = getVoxelInfo(mesh, aIdx, bIdx, cIdx, calcDepth);

          if (!vMap.has(key)) vMap.set(key, { center, faces: [] });
          vMap.get(key)!.faces.push({ mesh, aIdx, bIdx, cIdx, origA: a, origB: b, origC: c });
        }
      });
      voxelMapRef.current = vMap;
      setEdits(e => [...e]);
    }
  });

  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { selectedColorRef.current = selectedColor; }, [selectedColor]);
  useEffect(() => { isRenderModeRef.current = isRenderMode; }, [isRenderMode]);

  setupKeyboardHotkeys(setActiveTool);

  useEditorVisuals(
    edits,
    loadedObjectGroupRef,
    voxelMapRef,
    paintedVoxelsRef,
    depthScaleRef,
    isRenderModeRef
  );

  useEditorInteraction(
    rendererRef,
    cameraRef,
    loadedObjectGroupRef,
    activeToolRef,
    selectedColorRef,
    pointerDownPosRef,
    voxelMapRef,
    depthScaleRef,
    setEdits
  );

  const handleApply = () => {
    setIsApplying(true);
    ApplyEdits(edits)
      .then(result => onDone(result.objContent, result.mtlContent, result.voxelCount, paletteColors))
      .catch(e => {
        console.error(e);
        alert("Failed to apply edits: " + String(e));
      })
      .finally(() => setIsApplying(false));
  };

  return (
    <div className="app-container-editor">
      {isApplying && (
        <div className="applying-overlay">
          <h2>Applying Edits...</h2>
        </div>
      )}

      <div className={`editor-workspace ${activeTool === 'brush' ? 'cursor-brush' : activeTool === 'eraser' ? 'cursor-eraser' : ''}`}>
        <div ref={mountRef} className="editor-canvas-container" />

        <EditorPalette
          paletteColors={paletteColors}
          selectedColor={selectedColor}
          activeTool={activeTool}
          onSelectColor={(color) => {
            setSelectedColor(color);
            setActiveTool('brush');
          }}
        />

        <EditorTools
          activeTool={activeTool}
          onToggleBrush={() => setActiveTool(activeTool === 'brush' ? 'none' : 'brush')}
          onToggleEraser={() => setActiveTool(activeTool === 'eraser' ? 'none' : 'eraser')}
        />

        {/* Top Right: View Controls */}
        <div className="panel-container panel-container-small" style={{ position: 'absolute', top: '1rem', right: '1rem', display: 'flex', gap: '0.5rem' }}>
          <button
            className={`tool-btn ${localIsIsometric ? 'tool-btn-active tool-btn-brush' : ''}`}
            onClick={() => setLocalIsIsometric(!localIsIsometric)}
            title="Toggle Isometric View"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
          </button>
        </div>

        <div className="bottom-right-controls">
          <EditorHistory
            canUndo={edits.length > 0}
            onUndo={() => setEdits(prev => prev.slice(0, -1))}
            onReset={() => setEdits([])}
          />
          <EditorControls
            onCancel={onCancel}
            onDone={handleApply}
          />
        </div>
      </div>

      <div className="footer-text">
        made with ♥ by GazPrash
      </div>
    </div>
  );
}

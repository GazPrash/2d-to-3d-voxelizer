import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ApplyEdits } from '../wailsjs/go/main/App';
import { backend } from '../wailsjs/go/models';
import { useRenderScene } from './RenderScene';
import './Editor.css';

interface EditorProps {
  objContent: string;
  mtlContent: string;
  isIsometric: boolean;
  palette: string[];
  onDone: (newObj: string, newMtl: string, count: number, newPalette: string[]) => void;
  onCancel: () => void;
}

type FaceInfo = {
  mesh: THREE.Mesh;
  aIdx: number;
  bIdx: number;
  cIdx: number;
  origA: THREE.Vector3;
  origB: THREE.Vector3;
  origC: THREE.Vector3;
};

const getVoxelInfo = (mesh: THREE.Mesh, aIdx: number, bIdx: number, cIdx: number, depthScale: number) => {
  const posAttr = mesh.geometry.attributes.position;
  const a = new THREE.Vector3().fromBufferAttribute(posAttr, aIdx);
  const b = new THREE.Vector3().fromBufferAttribute(posAttr, bIdx);
  const c = new THREE.Vector3().fromBufferAttribute(posAttr, cIdx);

  const faceCenter = new THREE.Vector3().addVectors(a, b).add(c).divideScalar(3);

  const cb = new THREE.Vector3().subVectors(c, b);
  const ab = new THREE.Vector3().subVectors(a, b);
  const normal = cb.cross(ab).normalize();

  let nx = Math.abs(normal.x) > 0.5 ? Math.sign(normal.x) : 0;
  let ny = Math.abs(normal.y) > 0.5 ? Math.sign(normal.y) : 0;
  let nz = Math.abs(normal.z) > 0.5 ? Math.sign(normal.z) : 0;

  const voxelSize = new THREE.Vector3(1, 1, depthScale);
  const voxelCenter = faceCenter.clone().sub(new THREE.Vector3(nx, ny, nz).multiply(voxelSize).divideScalar(2));

  const vx = Math.round(voxelCenter.x);
  const vy = Math.round(voxelCenter.y);
  const vz = Math.round(voxelCenter.z / depthScale);

  const key = `${vx},${vy},${vz}`;
  const center = new THREE.Vector3(vx, vy, vz * depthScale);

  return { key, center, a, b, c };
};

export default function Editor({ objContent, mtlContent, isIsometric, palette, onDone, onCancel }: EditorProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isRenderMode, setIsRenderMode] = useState(false);
  const [localIsIsometric, setLocalIsIsometric] = useState(isIsometric);

  const [paletteColors, setPaletteColors] = useState<string[]>(palette || []);
  const [selectedColor, setSelectedColor] = useState<string | null>((palette && palette.length > 0) ? palette[0] : null);
  const [activeTool, setActiveTool] = useState<'none' | 'brush' | 'eraser'>('none');
  const [edits, setEdits] = useState<backend.EditAction[]>([]);

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

  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  useEffect(() => {
    selectedColorRef.current = selectedColor;
  }, [selectedColor]);

  useEffect(() => {
    isRenderModeRef.current = isRenderMode;
  }, [isRenderMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveTool('none');
      } else if (e.key.toLowerCase() === 'b') {
        setActiveTool('brush');
      } else if (e.key.toLowerCase() === 'e') {
        setActiveTool('eraser');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // applies visual edits when edits array changes via user
  useEffect(() => {
    if (!loadedObjectGroupRef.current) return;
    const loadedGroup = loadedObjectGroupRef.current;

    voxelMapRef.current.forEach((vData) => {
      for (const f of vData.faces) {
        const posAttr = f.mesh.geometry.attributes.position;
        posAttr.setXYZ(f.aIdx, f.origA.x, f.origA.y, f.origA.z);
        posAttr.setXYZ(f.bIdx, f.origB.x, f.origB.y, f.origB.z);
        posAttr.setXYZ(f.cIdx, f.origC.x, f.origC.y, f.origC.z);
        posAttr.needsUpdate = true;
      }
    });

    paintedVoxelsRef.current.forEach((mesh) => {
      if (mesh.parent) {
        mesh.parent.remove(mesh);
      }
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => m.dispose());
      } else {
        mesh.material.dispose();
      }
    });
    paintedVoxelsRef.current.clear();

    const voxelState = new Map<string, backend.EditAction>();
    for (const edit of edits) {
      voxelState.set(edit.id, edit);
    }

    voxelState.forEach((edit, key) => {
      const vData = voxelMapRef.current.get(key);
      if (!vData) return;

      for (const f of vData.faces) {
        const posAttr = f.mesh.geometry.attributes.position;
        posAttr.setXYZ(f.aIdx, 0, 0, 0);
        posAttr.setXYZ(f.bIdx, 0, 0, 0);
        posAttr.setXYZ(f.cIdx, 0, 0, 0);
        posAttr.needsUpdate = true;
      }

      if (edit.type !== 'paint' || !edit.color) return;

      const geom = new THREE.BoxGeometry(1, 1, depthScaleRef.current);
      
      const mat = isRenderModeRef.current
        ? new THREE.MeshStandardMaterial({ color: edit.color, roughness: 0.7, metalness: 0.1 })
        : new THREE.MeshPhongMaterial({ color: edit.color });

      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.copy(vData.center);
      mesh.userData = { voxelKey: key };
      
      if (isRenderModeRef.current) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      
      const objGroup = loadedGroup.children[0];
      if (objGroup) {
        objGroup.add(mesh);
      }
      
      paintedVoxelsRef.current.set(key, mesh);
    });
  }, [edits]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    const handlePointerDown = (e: PointerEvent) => {
      pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
    };
    
    const handlePointerUp = (e: PointerEvent) => {
      const dx = e.clientX - pointerDownPosRef.current.x;
      const dy = e.clientY - pointerDownPosRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 5) return; // Dragged, not a click

      if (activeToolRef.current === 'none') return;
      if (activeToolRef.current === 'brush' && !selectedColorRef.current) return;

      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect || !cameraRef.current || !loadedObjectGroupRef.current) return;

      const mouse = new THREE.Vector2();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersects = raycaster.intersectObject(loadedObjectGroupRef.current, true);

      if (intersects.length === 0) return;

      const intersect = intersects[0];
      let key = '';

      if (intersect.object.userData.voxelKey) {
        key = intersect.object.userData.voxelKey;
      } else {
        const mesh = intersect.object as THREE.Mesh;
        const face = intersect.face;
        if (!face) return;

        const index = mesh.geometry.index;
        const aIdx = index ? index.getX(face.a) : face.a;
        const bIdx = index ? index.getX(face.b) : face.b;
        const cIdx = index ? index.getX(face.c) : face.c;

        const info = getVoxelInfo(mesh, aIdx, bIdx, cIdx, depthScaleRef.current);
        key = info.key;
      }

      if (!key || !voxelMapRef.current.has(key)) return;

      const parts = key.split(',');
      const newEdit = backend.EditAction.createFrom({
        type: activeToolRef.current === 'brush' ? 'paint' : 'erase',
        id: key,
        x: parseInt(parts[0]),
        y: parseInt(parts[1]),
        z: parseInt(parts[2]),
        color: activeToolRef.current === 'brush' ? (selectedColorRef.current || "") : ""
      });
      setEdits(prev => [...prev, newEdit]);
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);

    return () => {
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
    };
  }, [rendererRef.current]);

  const [isApplying, setIsApplying] = useState(false);

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

        {/* Top Left: Palette */}
        <div className="panel-container palette-panel">
          <div 
            className="palette-grid"
            style={{
              gridTemplateColumns: `repeat(${paletteColors.length > 30 ? 6 : paletteColors.length > 16 ? 5 : 4}, 1fr)`
            }}
          >
            {paletteColors.map(color => (
              <div
                key={color}
                className={`palette-color ${selectedColor === color && activeTool === 'brush' ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedColor(color);
                  setActiveTool('brush');
                }}
                title={color}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        {/* Bottom Left: Tools */}
        <div className="panel-container panel-container-small tools-panel">
          <button
            className={`tool-btn tool-btn-brush ${activeTool === 'brush' ? 'tool-btn-active' : ''}`}
            onClick={() => setActiveTool(activeTool === 'brush' ? 'none' : 'brush')}
            title="Brush Tool"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
            </svg>
          </button>
          <button
            className={`tool-btn tool-btn-eraser ${activeTool === 'eraser' ? 'tool-btn-active' : ''}`}
            onClick={() => setActiveTool(activeTool === 'eraser' ? 'none' : 'eraser')}
            title="Eraser Tool"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"></path>
              <path d="M22 21H7"></path>
              <path d="m5 11 9 9"></path>
            </svg>
          </button>
        </div>

        {/* Top Right: View Controls */}
        <div className="panel-container panel-container-small" style={{ position: 'absolute', top: '1rem', right: '1rem', display: 'flex', gap: '0.5rem' }}>
          <button
            className={`tool-btn ${localIsIsometric ? 'tool-btn-active tool-btn-brush' : ''}`}
            onClick={() => setLocalIsIsometric(!localIsIsometric)}
            title="Toggle Isometric View"
            style={{ width: 'auto', padding: '0 0.5rem', fontWeight: 'bold', fontSize: '0.75rem' }}
          >
            ISO
          </button>
        </div>

        {/* Bottom Right: History Controls & Actions */}
        <div className="bottom-right-controls">
          {edits.length > 0 && (
            <div className="panel-container panel-container-small history-panel">
              <button
                className="tool-btn"
                onClick={() => setEdits(prev => prev.slice(0, -1))}
                title="Undo"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7v6h6"></path>
                  <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path>
                </svg>
              </button>
              <button
                className="tool-btn tool-btn-danger"
                onClick={() => setEdits([])}
                title="Reset All"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18"></path>
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          )}

          <div className="panel-container panel-container-small actions-panel">
            <button
              className="btn-small-rounded btn-cancel"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              className="btn-small-rounded btn-done"
              onClick={handleApply}
            >
              Done
            </button>
          </div>
        </div>
      </div>

      <div className="footer-text">
        made with ♥ by GazPrash
      </div>
    </div>
  );
}

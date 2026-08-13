import React, { useEffect } from 'react';
import * as THREE from 'three';
import { backend } from '../../wailsjs/go/models';

export type FaceInfo = {
  mesh: THREE.Mesh;
  aIdx: number;
  bIdx: number;
  cIdx: number;
  origA: THREE.Vector3;
  origB: THREE.Vector3;
  origC: THREE.Vector3;
};

export const getVoxelInfo = (mesh: THREE.Mesh, aIdx: number, bIdx: number, cIdx: number, depthScale: number) => {
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

export function setupKeyboardHotkeys(setActiveTool: React.Dispatch<React.SetStateAction<'none' | 'brush' | 'eraser'>>) {
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
  }, [setActiveTool]);
}

export function useEditorVisuals(
  edits: backend.EditAction[],
  loadedObjectGroupRef: React.MutableRefObject<THREE.Group | null>,
  voxelMapRef: React.MutableRefObject<Map<string, { center: THREE.Vector3; faces: FaceInfo[] }>>,
  paintedVoxelsRef: React.MutableRefObject<Map<string, THREE.Mesh>>,
  depthScaleRef: React.MutableRefObject<number>,
  isRenderModeRef: React.MutableRefObject<boolean>
) {
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
  }, [edits, loadedObjectGroupRef, voxelMapRef, paintedVoxelsRef, depthScaleRef, isRenderModeRef]);
}

export function useEditorInteraction(
  rendererRef: React.MutableRefObject<THREE.WebGLRenderer | null>,
  cameraRef: React.MutableRefObject<THREE.Camera | null>,
  loadedObjectGroupRef: React.MutableRefObject<THREE.Group | null>,
  activeToolRef: React.MutableRefObject<'none' | 'brush' | 'eraser'>,
  selectedColorRef: React.MutableRefObject<string | null>,
  pointerDownPosRef: React.MutableRefObject<{ x: number; y: number }>,
  voxelMapRef: React.MutableRefObject<Map<string, { center: THREE.Vector3; faces: FaceInfo[] }>>,
  depthScaleRef: React.MutableRefObject<number>,
  setEdits: React.Dispatch<React.SetStateAction<backend.EditAction[]>>
) {
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
  }, [rendererRef, cameraRef, loadedObjectGroupRef, activeToolRef, selectedColorRef, pointerDownPosRef, voxelMapRef, depthScaleRef, setEdits]);
}

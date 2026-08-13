import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

interface UseRenderSceneProps {
  mountRef: React.RefObject<HTMLDivElement>;
  objContent: string;
  mtlContent: string;
  isRenderMode: boolean;
  isIsometric: boolean;
  isEditorMode?: boolean;
  onObjectLoaded?: (obj: THREE.Group, box: THREE.Box3) => void;
}

export function useRenderScene({
  mountRef,
  objContent,
  mtlContent,
  isRenderMode,
  isIsometric,
  isEditorMode = false,
  onObjectLoaded
}: UseRenderSceneProps) {
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const loadedObjectGroupRef = useRef<THREE.Group | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = isRenderMode ? new THREE.Color(0xfdecd2) : new THREE.Color(0xcccccc);

    const aspect = width / height;
    let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
    
    if (isIsometric) {
      const frustumSize = 10;
      camera = new THREE.OrthographicCamera(frustumSize * aspect / -2, frustumSize * aspect / 2, frustumSize / 2, frustumSize / -2, 0.1, 1000);
      camera.position.set(10, 10, 10);
    } else {
      camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
      camera.position.set(0, 2, 5);
    }
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    rendererRef.current = renderer;
    mountRef.current.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);

    const backLight = new THREE.DirectionalLight(0xffffff, 0.8);
    backLight.position.set(-10, 10, -10);
    scene.add(backLight);

    if (isRenderMode) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      directionalLight.castShadow = true;
      directionalLight.shadow.mapSize.width = 2048;
      directionalLight.shadow.mapSize.height = 2048;
      directionalLight.shadow.camera.near = 0.5;
      directionalLight.shadow.camera.far = 50;
      directionalLight.shadow.camera.left = -10;
      directionalLight.shadow.camera.right = 10;
      directionalLight.shadow.camera.top = 10;
      directionalLight.shadow.camera.bottom = -10;
      directionalLight.shadow.bias = -0.0005;

      const planeGeometry = new THREE.PlaneGeometry(100, 100);
      
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext('2d');
      if (context) {
        context.fillStyle = '#f5f5dc'; 
        context.fillRect(0, 0, 512, 512);
        context.fillStyle = '#e6e6cc'; 
        context.fillRect(0, 0, 256, 256);
        context.fillRect(256, 256, 256, 256);
      }
      const checkerTexture = new THREE.CanvasTexture(canvas);
      checkerTexture.wrapS = THREE.RepeatWrapping;
      checkerTexture.wrapT = THREE.RepeatWrapping;
      checkerTexture.repeat.set(50, 50); 

      const planeMaterial = new THREE.MeshStandardMaterial({ 
        map: checkerTexture,
        roughness: 0.9,
        metalness: 0.1
      });
      const plane = new THREE.Mesh(planeGeometry, planeMaterial);
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = -1.5;
      plane.receiveShadow = true;
      scene.add(plane);
    } else {
      const gridHelper = new THREE.GridHelper(10, 20, 0x909090, 0x909090);
      (gridHelper.material as THREE.LineBasicMaterial).transparent = true;
      (gridHelper.material as THREE.LineBasicMaterial).opacity = 0.4;
      gridHelper.position.y = -1.5;
      scene.add(gridHelper);
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.ROTATE,
      RIGHT: THREE.MOUSE.PAN
    };
    controlsRef.current = controls;

    if (isEditorMode) {
      controls.rotateSpeed = 0.6; // slow down orbit
      controls.panSpeed = 2.0;    // speed up pan
      controls.zoomSpeed = 2.0;   // speed up zoom
    }

    const mtlBlob = new Blob([mtlContent], { type: 'text/plain' });
    const mtlUrl = URL.createObjectURL(mtlBlob);

    const blob = new Blob([objContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const mtlLoader = new MTLLoader();
    const objLoader = new OBJLoader();

    mtlLoader.load(mtlUrl, (materials) => {
      materials.preload();
      objLoader.setMaterials(materials);

      objLoader.load(url, (obj) => {
        const geometries: THREE.BufferGeometry[] = [];

        obj.updateMatrixWorld(true);

        obj.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            const geom = mesh.geometry.clone();

            const posAttr = geom.getAttribute('position');
            const colors = new Float32Array(posAttr.count * 3);

            if (Array.isArray(mesh.material) && geom.groups && geom.groups.length > 0) {
              for (const group of geom.groups) {
                const matIndex = group.materialIndex || 0;
                const color = (mesh.material[matIndex] as any).color || new THREE.Color(1, 1, 1);
                for (let i = group.start; i < group.start + group.count; i++) {
                  colors[i * 3] = color.r;
                  colors[i * 3 + 1] = color.g;
                  colors[i * 3 + 2] = color.b;
                }
              }
            } else {
              let color = new THREE.Color(1, 1, 1);
              if (Array.isArray(mesh.material)) {
                if (mesh.material.length > 0) color = (mesh.material[0] as any).color || color;
              } else {
                color = (mesh.material as any).color || color;
              }
              for (let i = 0; i < posAttr.count; i++) {
                colors[i * 3] = color.r;
                colors[i * 3 + 1] = color.g;
                colors[i * 3 + 2] = color.b;
              }
            }

            geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            geom.applyMatrix4(mesh.matrixWorld);
            geometries.push(geom);
          }
        });

        if (geometries.length > 0) {
          const mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries, false);
          
          let material: THREE.Material;
          if (isRenderMode && !isEditorMode) {
            material = new THREE.MeshStandardMaterial({
              vertexColors: true,
              roughness: 0.7,
              metalness: 0.1,
            });
          } else {
            material = new THREE.MeshPhongMaterial({
              vertexColors: true,
            });
          }

          const mergedMesh = new THREE.Mesh(mergedGeometry, material);
          if (isRenderMode && !isEditorMode) {
            mergedMesh.castShadow = true;
            mergedMesh.receiveShadow = true;
          }
          
          obj.clear();
          obj.add(mergedMesh);
        }

        const box = new THREE.Box3().setFromObject(obj);
        const center = box.getCenter(new THREE.Vector3());
        
        obj.position.set(-center.x, -center.y, -center.z);



        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 3 / (maxDim || 1); 

        const group = new THREE.Group();
        group.add(obj);
        group.scale.set(scale, scale, scale);
        
        loadedObjectGroupRef.current = group;
        scene.add(group);
        
        if (onObjectLoaded) {
          onObjectLoaded(group, box);
        }

        URL.revokeObjectURL(url);
        URL.revokeObjectURL(mtlUrl);
      });
    });

    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current || !cameraRef.current) return;
      const newWidth = mountRef.current.clientWidth;
      const newHeight = mountRef.current.clientHeight;
      const newAspect = newWidth / newHeight;

      if (cameraRef.current instanceof THREE.PerspectiveCamera) {
        cameraRef.current.aspect = newAspect;
        cameraRef.current.updateProjectionMatrix();
      } else if (cameraRef.current instanceof THREE.OrthographicCamera) {
        cameraRef.current.left = -10 * newAspect;
        cameraRef.current.right = 10 * newAspect;
        cameraRef.current.updateProjectionMatrix();
      }
      rendererRef.current.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
      scene.clear();
    };
  }, [objContent, mtlContent, isRenderMode, isIsometric, isEditorMode]);

  return { sceneRef, cameraRef, rendererRef, loadedObjectGroupRef, controlsRef };
}

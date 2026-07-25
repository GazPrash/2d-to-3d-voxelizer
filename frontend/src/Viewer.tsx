import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SaveModel } from '../wailsjs/go/main/App';

interface ViewerProps {
  objContent: string;
  mtlContent: string;
  onBack: () => void;
  onGenerateAgain: () => void;
}

export default function Viewer({ objContent, mtlContent, onBack, onGenerateAgain }: ViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isRenderMode, setIsRenderMode] = useState(false);
  const [isIsometric, setIsIsometric] = useState(false);

  const handleSave = async () => {
    const [savedPath, err] = await SaveModel(objContent, mtlContent).then(v => [v, null] as const).catch(e => [null, e] as const);

    if (err) {
      console.error('Failed to save model:', err);
      return;
    }

    if (savedPath) {
      console.log('Saved successfully to:', savedPath);
    }
  };

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    scene.background = isRenderMode ? new THREE.Color(0xfdecd2) : new THREE.Color(0xf0f4f8);

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
    if (isIsometric) {
      const aspect = width / height;
      const frustumSize = 10;
      camera = new THREE.OrthographicCamera(frustumSize * aspect / -2, frustumSize * aspect / 2, frustumSize / 2, frustumSize / -2, 0.1, 1000);
      camera.position.set(10, 10, 10);
    } else {
      camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
      camera.position.set(0, 2, 5);
    }
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
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
      const gridHelper = new THREE.GridHelper(10, 20, 0xaaaaaa, 0xe0e0e0);
      gridHelper.position.y = -1.5;
      scene.add(gridHelper);
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const mtlBlob = new Blob([mtlContent], { type: 'text/plain' });
    const mtlUrl = URL.createObjectURL(mtlBlob);

    const blob = new Blob([objContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const mtlLoader = new MTLLoader();
    const objLoader = new OBJLoader();
    
    let loadedObjectGroup: THREE.Group | null = null;
    
    mtlLoader.load(mtlUrl, (materials) => {
      materials.preload();
      objLoader.setMaterials(materials);

      objLoader.load(url, (obj) => {
        const box = new THREE.Box3().setFromObject(obj);
        const center = box.getCenter(new THREE.Vector3());
        
        obj.position.set(-center.x, -center.y, -center.z);

        obj.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            if (isRenderMode) {
              if (Array.isArray(mesh.material)) {
                mesh.material = mesh.material.map((m: any) => new THREE.MeshStandardMaterial({
                  color: m.color || 0xffffff,
                  roughness: 0.7,
                  metalness: 0.1,
                }));
              } else {
                const oldMat = mesh.material as any;
                mesh.material = new THREE.MeshStandardMaterial({
                  color: oldMat.color || 0xffffff,
                  roughness: 0.7,
                  metalness: 0.1,
                });
              }
              mesh.castShadow = true;
              mesh.receiveShadow = true;
            }
          }
        });

        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 3 / (maxDim || 1); 

        loadedObjectGroup = new THREE.Group();
        loadedObjectGroup.add(obj);
        loadedObjectGroup.scale.set(scale, scale, scale);
        
        scene.add(loadedObjectGroup);
        
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
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      renderer.setSize(w, h);

      if (isIsometric) {
        const orthoCamera = camera as THREE.OrthographicCamera;
        const aspect = w / h;
        const frustumSize = 10;
        orthoCamera.left = frustumSize * aspect / -2;
        orthoCamera.right = frustumSize * aspect / 2;
        orthoCamera.top = frustumSize / 2;
        orthoCamera.bottom = frustumSize / -2;
        orthoCamera.updateProjectionMatrix();
      } else {
        const perspCamera = camera as THREE.PerspectiveCamera;
        perspCamera.aspect = w / h;
        perspCamera.updateProjectionMatrix();
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }

      // objHelper library has it's nuances and sometimes it may leave return more than one mesh while loading, so this is just a brute force method
      // to ensure that all the meshes and their materials are cleaned up
      scene.traverse((object) => {
        if ((object as THREE.Mesh).isMesh) {
          const mesh = object as THREE.Mesh;
          if (mesh.geometry) {
            mesh.geometry.dispose();
          }
          if (mesh.material) {
            if (Array.isArray(mesh.material)) {
              mesh.material.forEach(material => material.dispose());
            } else {
              mesh.material.dispose();
            }
          }
        }
      });

      renderer.dispose();
      scene.clear();
    };
  }, [objContent, isRenderMode, isIsometric]);

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.5rem', padding: '2rem' }}>
      <div style={{
        position: 'relative',
        width: '100%', 
        maxWidth: '56.25rem', 
        height: '65vh', 
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        backgroundColor: '#ffffff', 
        border: '1px solid #d1d5db',
      }}>
        <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
        
        {/* Floating Options inside Viewer */}
        <div style={{
          position: 'absolute',
          top: '1rem',
          right: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}>
          <button
            onClick={() => setIsRenderMode(!isRenderMode)}
            title="Toggle Render Mode"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              backgroundColor: isRenderMode ? '#f1f5f9' : '#ffffff',
              boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: isRenderMode ? '#eab308' : '#64748b',
              transition: 'all 0.2s ease'
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4"></circle>
              <path d="M12 2v2"></path>
              <path d="M12 20v2"></path>
              <path d="m4.93 4.93 1.41 1.41"></path>
              <path d="m17.66 17.66 1.41 1.41"></path>
              <path d="M2 12h2"></path>
              <path d="M20 12h2"></path>
              <path d="m6.34 17.66-1.41 1.41"></path>
              <path d="m19.07 4.93-1.41 1.41"></path>
            </svg>
          </button>

          <button
            onClick={() => setIsIsometric(!isIsometric)}
            title="Toggle Isometric View"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              backgroundColor: isIsometric ? '#f1f5f9' : '#ffffff',
              boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: isIsometric ? '#3b82f6' : '#64748b',
              transition: 'all 0.2s ease'
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
          </button>
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: '56.25rem', display: 'flex', justifyContent: 'center', gap: '1rem', alignItems: 'center' }}>
        <button className="btn-small-rounded" onClick={onBack} style={{ cursor: 'pointer' }}>
          ← Back to Generator
        </button>

        <button 
          className="btn-small-rounded btn-sage" 
          onClick={onGenerateAgain} 
          style={{ cursor: 'pointer' }}
        >
          Generate Again?
        </button>

        <button 
          className="btn-small-rounded btn-save" 
          onClick={handleSave} 
          style={{ cursor: 'pointer' }}
        >
          Save Model As
        </button>
      </div>

      <div style={{ position: 'absolute', bottom: '1rem', fontSize: '0.75rem', color: '#1e293b' }}>
        made with ♥  by GazPrash
      </div>
    </div>
  );
}

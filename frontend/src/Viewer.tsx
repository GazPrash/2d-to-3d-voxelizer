import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SaveModel } from '../wailsjs/go/main/App';

interface ViewerProps {
  objContent: string;
  onBack: () => void;
  onGenerateAgain: () => void;
}

export default function Viewer({ objContent, onBack, onGenerateAgain }: ViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  const handleSave = async () => {
    try {
      const savedPath = await SaveModel(objContent);
      if (savedPath) {
        console.log('Saved successfully to:', savedPath);
      }
    } catch (err) {
      console.error('Failed to save model:', err);
    }
  };

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f4f8); 

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 2, 5);
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

    const gridHelper = new THREE.GridHelper(10, 20, 0xaaaaaa, 0xe0e0e0);
    gridHelper.position.y = -1.5;
    scene.add(gridHelper);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const blob = new Blob([objContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const loader = new OBJLoader();
    
    let loadedObjectGroup: THREE.Group | null = null;
    
    loader.load(url, (obj) => {
      const box = new THREE.Box3().setFromObject(obj);
      const center = box.getCenter(new THREE.Vector3());
      
      obj.position.set(-center.x, -center.y, -center.z);

      obj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => { m.vertexColors = true; });
          } else {
            mesh.material.vertexColors = true;
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
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
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
  }, [objContent]);

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.5rem', padding: '2rem' }}>
      <div style={{
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
      </div>

      <div style={{ width: '100%', maxWidth: '56.25rem', display: 'flex', justifyContent: 'center', gap: '1rem', alignItems: 'center' }}>
        <button className="btn-small-rounded btn-accent" onClick={onBack} style={{ cursor: 'pointer' }}>
          ← Back to Generator
        </button>

        <button 
          className="btn-small-rounded btn-generate" 
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

      <div style={{ position: 'absolute', bottom: '1rem', fontSize: '0.75rem', color: '#94a3b8' }}>
        made with ♥  by GazPrash
      </div>
    </div>
  );
}

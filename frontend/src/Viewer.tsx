import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SaveModel, GetEditorModel, ClearEditorModel } from '../wailsjs/go/main/App';
import Editor from './Editor';
import { useRenderScene } from './RenderScene';

interface ViewerProps {
  objContent: string;
  mtlContent: string;
  voxelCount: number;
  palette?: string[];
  onBack: () => void;
  onGenerateAgain: () => void;
}

const MAX_EDITABLE_VOXELS = 50000;

function ViewerScene({ objContent, mtlContent, isRenderMode, isIsometric }: any) {
  const mountRef = useRef<HTMLDivElement>(null);
  useRenderScene({
    mountRef,
    objContent,
    mtlContent,
    isRenderMode,
    isIsometric
  });
  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
}

export default function Viewer({ objContent, mtlContent, voxelCount, palette, onBack, onGenerateAgain }: ViewerProps) {
  const [isRenderMode, setIsRenderMode] = useState(false);
  const [isIsometric, setIsIsometric] = useState(false);

  const [viewerMode, setViewerMode] = useState<'view' | 'edit'>('view');
  const [isLoading, setIsLoading] = useState(false);

  const [editorObj, setEditorObj] = useState('');
  const [editorMtl, setEditorMtl] = useState('');

  const [currentObj, setCurrentObj] = useState(objContent);
  const [currentMtl, setCurrentMtl] = useState(mtlContent);
  const [currentCount, setCurrentCount] = useState(voxelCount);
  const [currentPalette, setCurrentPalette] = useState<string[]>(palette || []);

  useEffect(() => {
    setCurrentObj(objContent);
    setCurrentMtl(mtlContent);
    setCurrentCount(voxelCount);
    setCurrentPalette(palette || []);
  }, [objContent, mtlContent, voxelCount, palette]);

  const handleEditModeClick = async () => {
    if (currentCount > MAX_EDITABLE_VOXELS) {
      alert(`Editing is not supported for voxel models of this size (over ${MAX_EDITABLE_VOXELS.toLocaleString()} voxels).`);
      return;
    }

    setIsLoading(true);
    try {
      const result = await GetEditorModel();
      setEditorObj(result.objContent);
      setEditorMtl(result.mtlContent);
      setViewerMode('edit');
    } catch (e) {
      alert("Failed to load editor model: " + String(e));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const [savedPath, err] = await SaveModel(currentObj, currentMtl).then(v => [v, null] as const).catch(e => [null, e] as const);
      if (err) {
        console.error('Failed to save model:', err);
      } else if (savedPath) {
        console.log('Saved successfully to:', savedPath);
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (viewerMode === 'edit') {
    return (
      <Editor
        objContent={editorObj}
        mtlContent={editorMtl}
        isIsometric={isIsometric}
        palette={currentPalette}
        onDone={async (newObj, newMtl, newCount, newPalette) => {
          setCurrentObj(newObj);
          setCurrentMtl(newMtl);
          if (newPalette) setCurrentPalette(newPalette);
          setViewerMode('view');
        }}
        onCancel={async () => {
          setViewerMode('view');
        }}
      />
    );
  }

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.5rem', padding: '2rem' }}>

      {isLoading && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(255,255,255,0.8)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <h2>Loading Editor Mode...</h2>
        </div>
      )}

      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: '75rem',
        height: '75vh',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        backgroundColor: '#A0A0A0',
        border: '1px solid #d1d5db',
      }}>
        <ViewerScene objContent={currentObj} mtlContent={currentMtl} isRenderMode={isRenderMode} isIsometric={isIsometric} />

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
            className={`icon-btn ${isRenderMode ? 'active active-yellow' : ''}`}
            onClick={() => setIsRenderMode(!isRenderMode)}
            title="Toggle Render Mode"
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
            className={`icon-btn ${isIsometric ? 'active' : ''}`}
            onClick={() => setIsIsometric(!isIsometric)}
            title="Toggle Isometric View"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
          </button>
        </div>

        {/* Edit Button */}
        <div style={{ position: 'absolute', top: '1rem', left: '1rem', zIndex: 10 }}>
          <button
            className="btn-small-rounded btn-edit"
            onClick={handleEditModeClick}
            disabled={currentCount > MAX_EDITABLE_VOXELS}
            title={currentCount > MAX_EDITABLE_VOXELS ? 'Model too large to edit' : 'Edit Model'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            Edit Model {currentCount > MAX_EDITABLE_VOXELS && '(Too Large)'}
          </button>
        </div>

      </div>

      <div style={{ width: '100%', maxWidth: '75rem', display: 'flex', justifyContent: 'center', gap: '1rem', alignItems: 'center' }}>
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
        made with ♥ by GazPrash
      </div>
    </div>
  );
}

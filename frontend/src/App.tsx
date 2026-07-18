import { useState, useEffect, DragEvent, ChangeEvent } from 'react';
import './App.css';
import { ProcessImage, CancelProcessing, FreeMemory, ReadLocalFileBase64, SelectImage } from '../wailsjs/go/main/App';
import Viewer from './Viewer';



function App() {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewState, setViewState] = useState<'main' | 'loading' | 'viewer'>('main');
  const [objContent, setObjContent] = useState<string>('');
  const [mode, setMode] = useState('auto'); // auto, single, dual, quad
  const [repeated, setRepeated] = useState(false);
  const [shape, setShape] = useState('rounded'); // rounded, flat
  const [biasedScalingEnabled, setBiasedScalingEnabled] = useState(false);
  const [biasedScaleTop, setBiasedScaleTop] = useState(1.0);
  const [biasedScaleMiddle, setBiasedScaleMiddle] = useState(1.0);
  const [biasedScaleBottom, setBiasedScaleBottom] = useState(1.0);
  const [depthScale, setDepthScale] = useState(0.4);
  const [flatDepth, setFlatDepth] = useState(5.0);
  const [voxelScale, setVoxelScale] = useState(1.0);
  const [showCancel, setShowCancel] = useState(false);

  useEffect(() => {
    let timer: any;
    if (viewState === 'loading') {
      setShowCancel(false);
      timer = setTimeout(() => {
        setShowCancel(true);
      }, 20000);
    } else {
      setShowCancel(false);
    }
    return () => clearTimeout(timer);
  }, [viewState]);

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleFileSelection = (selectedFile: File) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    const validExtensions = ['.jpg', '.jpeg', '.png'];
    const isValid = validTypes.includes(selectedFile.type) ||
      validExtensions.some(ext => selectedFile.name.toLowerCase().endsWith(ext));

    if (isValid) {
      setFile(selectedFile);
      setFilePath((selectedFile as any).path || null);
      setError(null);
    } else {
      setError('Invalid file type. Please upload a PNG or JPG.');
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelection(e.target.files[0]);
    }
  };

  const openFileDialog = async () => {
    const [selectedPath, err] = await SelectImage().then(v => [v, null] as const).catch(e => [null, e] as const);

    if (err) {
      console.error("SelectImage error:", err);
      return;
    }

    if (selectedPath) {
      setFilePath(selectedPath);
      const fileName = selectedPath.split(/[/\\]/).pop() || 'Selected Image';
      const fakeFile = new File([], fileName, { type: 'image/png' });
      setFile(fakeFile);
      setError(null);
    }
  };

  const handleGenerate = async () => {
    if (!file) return;

    setViewState('loading');
    setError(null);

    const settings = {
      mode: mode,
      repeated: repeated,
      shape: shape,
      biasedScalingEnabled: biasedScalingEnabled,
      biasedScaleTop: biasedScaleTop,
      biasedScaleMiddle: biasedScaleMiddle,
      biasedScaleBottom: biasedScaleBottom,
      depthScale: depthScale,
      flatDepth: flatDepth,
      linearity: true,
      voxelScale: voxelScale
    };

    if (!filePath) {
      setError('Could not determine the file path. Please use the + Upload Image button instead of drag & drop.');
      setFile(null);
      setFilePath(null);
      setViewState('main');
      return;
    }

    const [base64String, readErr] = await ReadLocalFileBase64(filePath).then(v => [v, null] as const).catch(e => [null, e] as const);

    if (readErr) {
      console.error("Read file error:", readErr);
      setError('Failed to generate model (file might be locked). Try again.');
      setViewState('main');
      return;
    }

    if (!base64String) return;

    const [objStr, processErr] = await ProcessImage(base64String, settings).then(v => [v, null] as const).catch(e => [null, e] as const);

    if (processErr) {
      console.error("Generation error:", processErr);
      setError('Failed to generate model. Try again.');
      setViewState('main');
      return;
    }

    if (objStr) {
      setObjContent(objStr);
      setViewState('viewer');
    }
  };

  if (viewState === 'loading') {
    return (
      <div className="app-container" style={{ position: 'relative' }}>
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.8rem' }}>
          <div className="loader"></div>
          <h2 style={{ color: '#334155', margin: 0, fontSize: '0.9rem', fontWeight: 'normal' }}>Generating 3D Model...</h2>
        </div>
        {showCancel && (
          <button
            className="btn-small-rounded btn-save"
            onClick={() => {
              CancelProcessing();
              setViewState('main');
            }}
          >
            Cancel Generation
          </button>
        )}
        </div>
      </div>
    );
  }

  if (viewState === 'viewer') {
    return <Viewer objContent={objContent} onBack={() => {
      setObjContent('');
      setViewState('main');
      FreeMemory();
    }} onGenerateAgain={handleGenerate} />;
  }

  return (
    <div className="app-container" style={{ position: 'relative' }}>
      <div className="content-wrapper" style={{ position: 'relative', zIndex: 1 }}>
        {/* DROP ZONE */}
        <div
          className={`drop-zone ${isDragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {file ? (
            <div className="file-info">
              <p className="file-name">{file.name}</p>
              <button className="btn" onClick={() => {
                setFile(null);
                setFilePath(null);
              }}>Clear</button>
            </div>
          ) : (
            <div className="upload-prompt">
              <p>Drag and drop an image here</p>
              <p>or</p>
              <button className="btn upload-btn" onClick={openFileDialog}>+ Upload Image</button>
              {error && <p className="error-text">{error}</p>}
            </div>
          )}
        </div>

        {/* SETTINGS PANEL */}
        <div className="settings-panel">

          <div className="settings-section">
            {/* Mode Selection */}
            <div className="setting-group full-width">
              <label>Mode</label>
              <div className="segmented-control">
                {[
                  { id: 'auto', label: 'Auto' },
                  { id: 'single', label: 'Single' },
                  { id: 'dual', label: 'Dual' },
                  { id: 'quad', label: 'Quad' },
                  { id: 'six-sided', label: '6-Sided' }
                ].map((m) => (
                  <button
                    key={m.id}
                    className={`segment-btn ${mode === m.id ? 'active' : ''}`}
                    onClick={() => {
                      const newMode = m.id;
                      setMode(newMode);
                      if (newMode === 'quad' || newMode === 'six-sided') {
                        setShape('flat');
                        setDepthScale(1.0); // force 1:1 depth scaling for quad/6-sided modes
                      }
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <p className="help-text">
                {mode === 'auto' && 'Automatically determines sprite format.'}
                {mode === 'single' && 'Generates a model based on the front sprite.'}
                {mode === 'dual' && 'Generates a model based on a 2x1 sprite sheet (Front, Back).'}
                {mode === 'quad' && 'Maps a 4x1 sprite sheet (Left, Front, Right, Back) to the model.'}
                {mode === 'six-sided' && 'Maps a 6x1 sprite sheet (Left, Front, Right, Back, Top, Right) to the model.'}
              </p>
            </div>

            {mode === 'single' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '-0.5rem' }}>
                <input
                  type="checkbox"
                  id="repeated-texture-checkbox"
                  className="custom-checkbox"
                  checked={repeated}
                  onChange={(e) => setRepeated(e.target.checked)}
                  style={{ cursor: 'pointer', margin: 0 }}
                />
                <label htmlFor="repeated-texture-checkbox" style={{ fontSize: '0.85rem', color: '#475569', margin: 0, cursor: 'pointer' }}>
                  Use repeated texture <span style={{ opacity: 0.6, fontSize: '0.75rem', marginLeft: '6px' }}>(Display on all 4 sides)</span>
                </label>
              </div>
            )}
          </div>

          <div className="settings-section">
            <div className="setting-row">
              {/* LEFT COLUMN: Shape & Depth */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', flex: 1 }}>
                <div className="setting-group">
                  <label>Depth Shape</label>
                  <div className="segmented-control">
                    {['Rounded', 'Flat'].map((s) => (
                      <button
                        key={s}
                        className={`segment-btn ${shape === s.toLowerCase() ? 'active' : ''}`}
                        onClick={() => {
                          const newShape = s.toLowerCase();
                          setShape(newShape);
                          if (newShape === 'flat') {
                            setDepthScale(1.0); // set default 1:1 scale for flat shapes
                          } else if (newShape === 'rounded') {
                            setDepthScale(0.4); // restore default depth scale
                          }
                        }}
                        disabled={mode === 'quad' || mode === 'six-sided'}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {shape !== 'flat' && (
                  <div className="setting-group">
                    <label>Depth Scale: {depthScale.toFixed(2)}</label>
                    <input
                      type="range"
                      className="range-slider"
                      min="0.1" max="2.0" step="0.1"
                      value={depthScale}
                      onChange={(e) => setDepthScale(parseFloat(e.target.value))}
                    />
                    <p className="help-text">Multiplier for the 3D depth</p>
                  </div>
                )}

                {shape === 'flat' && (
                  <div className="setting-group">
                    <label>Flat Depth: {flatDepth.toFixed(1)}</label>
                    <input
                      type="range"
                      className="range-slider"
                      min="1" max="25" step="1"
                      value={flatDepth}
                      onChange={(e) => setFlatDepth(parseFloat(e.target.value))}
                      disabled={mode === 'quad' || mode === 'six-sided'}
                    />
                    <p className="help-text">Base depth if shape is 'flat'</p>
                  </div>
                )}
              </div>

              {/* RIGHT COLUMN: Biased Scaling */}
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, borderLeft: '1px solid #f1f5f9', paddingLeft: '1.5rem' }}>
                <div className="setting-group" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flex: 'none' }}>
                  <label style={{ margin: 0 }}>Biased Scaling</label>
                  <label className="switch-wrapper" style={{ transform: 'scale(0.8)' }}>
                    <input
                      type="checkbox"
                      checked={biasedScalingEnabled}
                      onChange={(e) => setBiasedScalingEnabled(e.target.checked)}
                      disabled={shape !== 'rounded'}
                    />
                    <span className="switch-slider"></span>
                  </label>
                </div>

                <div style={{ display: 'flex', flexDirection: 'row', gap: '0.6rem' }}>
                  {/* Sliders */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1 }}>
                    <div className="setting-group small-ui">
                      <label>Top Scale: {biasedScaleTop.toFixed(2)}</label>
                      <input type="range" className="range-slider small-slider" min="0.0" max="3.0" step="0.1"
                        value={biasedScaleTop} onChange={(e) => setBiasedScaleTop(parseFloat(e.target.value))}
                        disabled={!biasedScalingEnabled || shape !== 'rounded'} />
                    </div>
                    <div className="setting-group small-ui">
                      <label>Mid Scale: {biasedScaleMiddle.toFixed(2)}</label>
                      <input type="range" className="range-slider small-slider" min="0.0" max="3.0" step="0.1"
                        value={biasedScaleMiddle} onChange={(e) => setBiasedScaleMiddle(parseFloat(e.target.value))}
                        disabled={!biasedScalingEnabled || shape !== 'rounded'} />
                    </div>
                    <div className="setting-group small-ui">
                      <label>Bot Scale: {biasedScaleBottom.toFixed(2)}</label>
                      <input type="range" className="range-slider small-slider" min="0.0" max="3.0" step="0.1"
                        value={biasedScaleBottom} onChange={(e) => setBiasedScaleBottom(parseFloat(e.target.value))}
                        disabled={!biasedScalingEnabled || shape !== 'rounded'} />
                    </div>
                  </div>

                  {/* Info Text */}
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                    <p className="help-text" style={{ lineHeight: '1.5', margin: 0, opacity: (biasedScalingEnabled && shape === 'rounded') ? 1 : 0.4, fontSize: '0.75rem', textAlign: 'right' }}>
                      Fine-tune the depth multipliers for different sections of your 3D model.
                      Choose whether the top, middle or bottom needs to be thicker than the other.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="settings-section">
            {/* Voxel Size */}
            <div className="setting-group full-width">
              <label>Voxel Size</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                <button
                  className="btn-small-rounded"
                  style={{ padding: '2px 8px', fontSize: '0.9rem', minWidth: '24px' }}
                  onClick={() => setVoxelScale(Math.max(1.0, voxelScale - 0.25))}
                >-</button>
                <span style={{ fontSize: '0.8rem', fontWeight: 'bold', minWidth: '36px', textAlign: 'center', color: '#334155' }}>
                  {voxelScale.toFixed(2)}x
                </span>
                <button
                  className="btn-small-rounded"
                  style={{ padding: '2px 8px', fontSize: '0.9rem', minWidth: '24px' }}
                  onClick={() => setVoxelScale(Math.min(3.0, voxelScale + 0.25))}
                >+</button>
              </div>
              <p className="help-text" style={{ marginTop: '4px' }}>Global voxel scaling factor (1.0x to 3.0x)</p>
            </div>
          </div>

          <div className="bottom-actions">
            <button
              className="btn-small-rounded"
              onClick={() => {
                setMode('auto');
                setRepeated(false);
                setShape('rounded');
                setBiasedScalingEnabled(false);
                setBiasedScaleTop(1.0);
                setBiasedScaleMiddle(1.0);
                setBiasedScaleBottom(1.0);
                setDepthScale(0.4);
                setFlatDepth(5.0);
                setVoxelScale(1.0);
              }}
            >
              Reset Settings
            </button>

            <button
              className="btn-small-rounded btn-sage"
              disabled={!file}
              onClick={() => handleGenerate()}
            >
              Generate 3D Model
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

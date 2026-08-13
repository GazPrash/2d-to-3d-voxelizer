import React from 'react';

type EditorPaletteProps = {
  paletteColors: string[];
  selectedColor: string | null;
  activeTool: 'none' | 'brush' | 'eraser';
  onSelectColor: (color: string) => void;
};

export const EditorPalette: React.FC<EditorPaletteProps> = ({ paletteColors, selectedColor, activeTool, onSelectColor }) => (
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
          onClick={() => onSelectColor(color)}
          title={color}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  </div>
);

type EditorToolsProps = {
  activeTool: 'none' | 'brush' | 'eraser';
  onToggleBrush: () => void;
  onToggleEraser: () => void;
};

export const EditorTools: React.FC<EditorToolsProps> = ({ activeTool, onToggleBrush, onToggleEraser }) => (
  <div className="panel-container panel-container-small tools-panel">
    <button
      className={`tool-btn tool-btn-brush ${activeTool === 'brush' ? 'tool-btn-active' : ''}`}
      onClick={onToggleBrush}
      title="Brush Tool"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
      </svg>
    </button>
    <button
      className={`tool-btn tool-btn-eraser ${activeTool === 'eraser' ? 'tool-btn-active' : ''}`}
      onClick={onToggleEraser}
      title="Eraser Tool"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"></path>
        <path d="M22 21H7"></path>
        <path d="m5 11 9 9"></path>
      </svg>
    </button>
  </div>
);

type EditorHistoryProps = {
  canUndo: boolean;
  onUndo: () => void;
  onReset: () => void;
};

export const EditorHistory: React.FC<EditorHistoryProps> = ({ canUndo, onUndo, onReset }) => {
  if (!canUndo) return null;
  return (
    <div className="panel-container panel-container-small history-panel">
      <button
        className="tool-btn"
        onClick={onUndo}
        title="Undo"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7v6h6"></path>
          <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path>
        </svg>
      </button>
      <button
        className="tool-btn tool-btn-danger"
        onClick={onReset}
        title="Reset All"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18"></path>
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
        </svg>
      </button>
    </div>
  );
};

type EditorControlsProps = {
  onCancel: () => void;
  onDone: () => void;
};

export const EditorControls: React.FC<EditorControlsProps> = ({ onCancel, onDone }) => (
  <div className="panel-container panel-container-small actions-panel">
    <button
      className="btn-small-rounded btn-cancel"
      onClick={onCancel}
    >
      Cancel
    </button>
    <button
      className="btn-small-rounded btn-done"
      onClick={onDone}
    >
      Done
    </button>
  </div>
);

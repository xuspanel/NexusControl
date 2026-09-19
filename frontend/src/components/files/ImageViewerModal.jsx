import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  Download,
  Image as ImageIcon,
  AlertCircle
} from 'lucide-react';

export default function ImageViewerModal({
  filePath,
  token,
  onClose,
  onShowToast
}) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fileSize, setFileSize] = useState(0);

  // Zoom & Pan state
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const touchDistanceRef = useRef(null);

  const fileName = filePath ? filePath.split('/').pop() : '';

  // 1. Authenticated fetch & Blob URL creation
  useEffect(() => {
    if (!filePath || !token) return;
    setIsLoading(true);
    setError(null);
    let currentUrl = null;

    fetch(`/api/files/download?path=${encodeURIComponent(filePath)}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (res) => {
        if (!res.ok) {
          let msg = `Failed to load image (HTTP ${res.status})`;
          try {
            const data = await res.json();
            if (data?.error) msg = data.error;
          } catch {}
          throw new Error(msg);
        }
        const blob = await res.blob();
        setFileSize(blob.size);
        currentUrl = URL.createObjectURL(blob);
        setBlobUrl(currentUrl);
      })
      .catch((err) => {
        console.error('Image load error:', err);
        setError(err.message);
      })
      .finally(() => {
        setIsLoading(false);
      });

    return () => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [filePath, token]);

  // 2. Global ESC Key Handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Zoom helpers
  const handleZoomIn = () => setScale((s) => Math.min(s + 0.25, 5));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.25, 0.25));
  const handleResetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
  };
  const handleRotate = () => setRotation((r) => (r + 90) % 360);

  // Mouse wheel zoom
  const handleWheel = (e) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setScale((s) => Math.min(s + 0.15, 5));
    } else {
      setScale((s) => Math.max(s - 0.15, 0.25));
    }
  };

  // Mouse drag handlers
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Mobile Touch handlers (Pan + Pinch Zoom)
  const getDistance = (touch1, touch2) => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      dragStartRef.current = { x: touch.clientX - position.x, y: touch.clientY - position.y };
      setIsDragging(true);
      touchDistanceRef.current = null;
    } else if (e.touches.length === 2) {
      setIsDragging(false);
      touchDistanceRef.current = getDistance(e.touches[0], e.touches[1]);
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 1 && isDragging) {
      const touch = e.touches[0];
      setPosition({
        x: touch.clientX - dragStartRef.current.x,
        y: touch.clientY - dragStartRef.current.y
      });
    } else if (e.touches.length === 2 && touchDistanceRef.current) {
      const newDist = getDistance(e.touches[0], e.touches[1]);
      const diff = newDist - touchDistanceRef.current;
      touchDistanceRef.current = newDist;
      setScale((s) => Math.min(Math.max(s + diff * 0.008, 0.25), 5));
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    touchDistanceRef.current = null;
  };

  // Download image file
  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    onShowToast?.(`Downloading ${fileName}`, 'success');
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/85 backdrop-blur-md flex flex-col select-none animate-in fade-in duration-150 h-[100dvh] max-h-[100dvh]">
      {/* Header Bar */}
      <div className="bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 px-3 sm:px-4 py-2 flex items-center justify-between gap-2 z-10 shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <ImageIcon className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
          <span className="text-xs font-mono font-semibold text-zinc-900 dark:text-zinc-200 truncate" title={fileName}>
            {fileName}
          </span>
          {fileSize > 0 && (
            <span className="text-[10px] sm:text-[11px] font-mono text-zinc-500 shrink-0">
              ({formatBytes(fileSize)})
            </span>
          )}
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleZoomOut}
            title="Zoom Out"
            className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-[11px] font-mono text-zinc-700 dark:text-zinc-400 min-w-[38px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            title="Zoom In"
            className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleResetZoom}
            title="Reset Zoom & Position"
            className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleRotate}
            title="Rotate 90°"
            className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 mx-0.5" />

          <button
            onClick={handleDownload}
            title="Download Image"
            className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            title="Close (Esc)"
            className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Viewport */}
      <div
        className="flex-1 relative overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing touch-pan-x touch-pan-y"
        style={{ touchAction: 'pinch-zoom' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {isLoading && (
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono">
            <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <span>Loading image preview...</span>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center p-6 text-center text-red-400 space-y-2">
            <AlertCircle className="w-8 h-8" />
            <span className="font-mono text-xs">{error}</span>
          </div>
        )}

        {blobUrl && !isLoading && !error && (
          <img
            src={blobUrl}
            alt={fileName}
            draggable={false}
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
              transition: isDragging ? 'none' : 'transform 0.15s ease-out'
            }}
            className="max-h-[85vh] max-w-full object-contain select-none shadow-2xl rounded pointer-events-none"
          />
        )}
      </div>

      {/* Footer info */}
      <div className="bg-white/95 dark:bg-zinc-950/90 border-t border-zinc-200 dark:border-zinc-800 px-4 py-1.5 flex items-center justify-between text-[10px] sm:text-[11px] font-mono text-zinc-500 z-10 shrink-0">
        <span className="truncate max-w-[50%]">{filePath}</span>
        <span>Pinch/Scroll to Zoom • Drag to Pan</span>
      </div>
    </div>
  );
}

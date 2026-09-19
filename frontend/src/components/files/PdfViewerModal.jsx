import React, { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  FileText,
  AlertCircle
} from 'lucide-react';

// Configure pdf.js worker
try {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
} catch (e) {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

export default function PdfViewerModal({
  filePath,
  token,
  onClose,
  onShowToast
}) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [containerWidth, setContainerWidth] = useState(window.innerWidth > 600 ? 550 : window.innerWidth - 32);

  const fileName = filePath ? filePath.split('/').pop() : 'Document.pdf';

  // Resize listener to auto-adjust PDF page width to viewport on mobile
  useEffect(() => {
    const handleResize = () => {
      setContainerWidth(window.innerWidth > 600 ? 550 : window.innerWidth - 32);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
          let msg = `Failed to load PDF (HTTP ${res.status})`;
          try {
            const data = await res.json();
            if (data?.error) msg = data.error;
          } catch {}
          throw new Error(msg);
        }
        const blob = await res.blob();
        currentUrl = URL.createObjectURL(blob);
        setBlobUrl(currentUrl);
      })
      .catch((err) => {
        console.error('PDF load error:', err);
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

  // 2. Global ESC Key Listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        setPageNumber((p) => Math.min(p + 1, numPages || p));
      }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        setPageNumber((p) => Math.max(p - 1, 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, numPages]);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setPageNumber(1);
    setIsLoading(false);
  };

  const onDocumentLoadError = (err) => {
    console.error('PDF render error:', err);
    setError(err.message || 'Failed to parse PDF document');
    setIsLoading(false);
  };

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.2, 3.0));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.2, 0.5));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);

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

  return (
    <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/85 backdrop-blur-md flex flex-col select-none animate-in fade-in duration-150 h-[100dvh] max-h-[100dvh]">
      {/* Header Bar */}
      <div className="bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 px-3 sm:px-4 py-2 flex items-center justify-between gap-2 z-10 shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileText className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
          <span className="text-xs font-mono font-semibold text-zinc-900 dark:text-zinc-200 truncate" title={fileName}>
            {fileName}
          </span>
          {numPages && (
            <span className="text-[10px] sm:text-[11px] font-mono text-zinc-500 shrink-0">
              ({numPages} {numPages === 1 ? 'page' : 'pages'})
            </span>
          )}
        </div>

        {/* Page navigation & Controls */}
        <div className="flex items-center gap-1 shrink-0">
          {numPages && (
            <div className="flex items-center bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md p-0.5 text-xs font-mono">
              <button
                disabled={pageNumber <= 1}
                onClick={() => setPageNumber((p) => Math.max(p - 1, 1))}
                className="p-1.5 sm:p-1 min-w-[32px] min-h-[32px] flex items-center justify-center hover:text-zinc-900 dark:hover:text-white disabled:opacity-30 rounded"
                title="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 text-[11px] text-zinc-700 dark:text-zinc-300">
                {pageNumber} / {numPages}
              </span>
              <button
                disabled={pageNumber >= numPages}
                onClick={() => setPageNumber((p) => Math.min(p + 1, numPages))}
                className="p-1.5 sm:p-1 min-w-[32px] min-h-[32px] flex items-center justify-center hover:text-zinc-900 dark:hover:text-white disabled:opacity-30 rounded"
                title="Next Page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-0.5">
            <button
              onClick={handleZoomOut}
              title="Zoom Out"
              className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="hidden sm:inline text-[11px] font-mono text-zinc-700 dark:text-zinc-400 min-w-[36px] text-center">
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
              onClick={handleRotate}
              title="Rotate 90°"
              className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          </div>

          <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 mx-0.5" />

          <button
            onClick={handleDownload}
            title="Download PDF"
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

      {/* Main Document Body */}
      <div
        className="flex-1 overflow-auto p-3 sm:p-6 flex justify-center items-start bg-zinc-100 dark:bg-zinc-900/60 touch-pan-x touch-pan-y"
        style={{ touchAction: 'pinch-zoom' }}
      >
        {isLoading && (
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono py-20">
            <div className="w-5 h-5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
            <span>Rendering PDF document...</span>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center p-8 text-center text-red-500 dark:text-red-400 space-y-2">
            <AlertCircle className="w-8 h-8" />
            <span className="font-mono text-xs">{error}</span>
          </div>
        )}

        {blobUrl && !error && (
          <div className="shadow-2xl rounded overflow-hidden border border-zinc-300 dark:border-zinc-800 bg-white max-w-full">
            <Document
              file={blobUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading=""
            >
              <Page
                pageNumber={pageNumber}
                scale={scale}
                width={containerWidth}
                rotate={rotation}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </Document>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-white/95 dark:bg-zinc-950/95 border-t border-zinc-200 dark:border-zinc-800 px-4 py-1.5 flex items-center justify-between text-[10px] sm:text-[11px] font-mono text-zinc-500 shrink-0">
        <span className="truncate max-w-[50%]">{filePath}</span>
        <span>Swipe / Arrow Keys: Pages • Pinch to Zoom</span>
      </div>
    </div>
  );
}

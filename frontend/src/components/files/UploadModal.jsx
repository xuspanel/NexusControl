import React, { useState, useRef } from 'react';
import { UploadCloud, X, Play, Pause, Trash2, CheckCircle, AlertCircle } from 'lucide-react';

const CHUNK_SIZE = 1024 * 1024; // 1 MB per chunk

export default function UploadModal({
  targetDir,
  token,
  onClose,
  onSuccess,
  onShowToast
}) {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('idle'); // idle | uploading | paused | completed | error
  const [errorMsg, setErrorMsg] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef(null);
  const isPausedRef = useRef(false);
  const isCancelledRef = useRef(false);
  const currentChunkRef = useRef(0);
  const fileIdRef = useRef('');

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setProgress(0);
    setStatus('idle');
    setErrorMsg('');
    fileIdRef.current = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    currentChunkRef.current = 0;
  };

  const uploadChunk = async (chunkIndex, totalChunks) => {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const blob = file.slice(start, end);

    const formData = new FormData();
    formData.append('uploadId', fileIdRef.current);
    formData.append('fileId', fileIdRef.current);
    formData.append('chunkIndex', chunkIndex);
    formData.append('chunk', blob);

    const res = await fetch('/api/files/upload/chunk', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });

    if (!res.ok) {
      let errorText = `Chunk ${chunkIndex} failed (HTTP ${res.status})`;
      try {
        const data = await res.json();
        if (data?.error) errorText = data.error;
      } catch {}
      throw new Error(errorText);
    }
  };

  const startUpload = async () => {
    if (!file) return;
    setStatus('uploading');
    isPausedRef.current = false;
    isCancelledRef.current = false;

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    try {
      for (let i = currentChunkRef.current; i < totalChunks; i++) {
        if (isCancelledRef.current) {
          setStatus('idle');
          setProgress(0);
          return;
        }

        if (isPausedRef.current) {
          currentChunkRef.current = i;
          setStatus('paused');
          return;
        }

        await uploadChunk(i, totalChunks);
        currentChunkRef.current = i + 1;
        setProgress(Math.round(((i + 1) / totalChunks) * 100));
      }

      // Complete upload
      const res = await fetch('/api/files/upload/complete', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          targetDir,
          fileName: file.name,
          uploadId: fileIdRef.current,
          fileId: fileIdRef.current,
          totalChunks
        })
      });

      if (!res.ok) {
        let errorText = `Failed to assemble uploaded chunks (HTTP ${res.status})`;
        try {
          const data = await res.json();
          if (data?.error) errorText = data.error;
        } catch {}
        throw new Error(errorText);
      }

      setStatus('completed');
      onShowToast?.(`Uploaded ${file.name} successfully`, 'success');
      onSuccess?.();
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message);
      onShowToast?.(`Upload failed: ${err.message}`, 'error');
    }
  };

  const pauseUpload = () => {
    isPausedRef.current = true;
    setStatus('paused');
  };

  const resumeUpload = () => {
    isPausedRef.current = false;
    startUpload();
  };

  const cancelUpload = () => {
    isCancelledRef.current = true;
    isPausedRef.current = false;
    setStatus('idle');
    setProgress(0);
    currentChunkRef.current = 0;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-100">
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl max-w-lg w-full p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Upload Files</h3>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-xs text-zinc-700 dark:text-zinc-400 font-mono truncate bg-zinc-100 dark:bg-zinc-900/60 p-2 rounded border border-zinc-200 dark:border-zinc-800">
          Destination: {targetDir}
        </div>

        {/* Drop zone */}
        {!file ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              if (e.dataTransfer.files?.[0]) {
                handleFileSelect(e.dataTransfer.files[0]);
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors ${
              isDragOver
                ? 'border-emerald-500 bg-emerald-500/10'
                : 'border-zinc-300 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/40'
            }`}
          >
            <UploadCloud className="w-10 h-10 text-zinc-400 dark:text-zinc-500 mb-2" />
            <span className="text-xs text-zinc-800 dark:text-zinc-300 font-medium">
              Click or drag file here to upload
            </span>
            <span className="text-[11px] text-zinc-500 mt-1 font-mono">
              Supports chunked uploads with pause/resume
            </span>
            <input
              ref={fileInputRef}
              type="file"
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              className="hidden"
            />
          </div>
        ) : (
          <div className="space-y-3 bg-zinc-50 dark:bg-zinc-900/40 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-900 dark:text-zinc-200 truncate max-w-[280px]">
                {file.name}
              </span>
              <span className="text-zinc-500 font-mono">
                {(file.size / (1024 * 1024)).toFixed(2)} MB
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  status === 'completed'
                    ? 'bg-emerald-500'
                    : status === 'error'
                    ? 'bg-red-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-zinc-600 dark:text-zinc-400 capitalize">Status: {status}</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">{progress}%</span>
            </div>

            {errorMsg && (
              <div className="flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center justify-end gap-2 pt-2">
              {status === 'idle' && (
                <button
                  onClick={startUpload}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Start Upload</span>
                </button>
              )}

              {status === 'uploading' && (
                <button
                  onClick={pauseUpload}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-medium"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause</span>
                </button>
              )}

              {status === 'paused' && (
                <button
                  onClick={resumeUpload}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Resume</span>
                </button>
              )}

              {status !== 'completed' && (
                <button
                  onClick={cancelUpload}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-transparent rounded text-xs font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Cancel</span>
                </button>
              )}

              {status === 'completed' && (
                <button
                  onClick={onClose}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Done</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

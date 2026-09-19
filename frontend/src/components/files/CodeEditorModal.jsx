import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import {
  Save,
  X,
  FileCode,
  AlertCircle,
  WrapText,
  Check,
  AlignLeft
} from 'lucide-react';
import { useTheme } from '../../context/ThemeProvider';

function getMonacoLanguage(filePath) {
  if (!filePath) return 'plaintext';
  const fileName = filePath.split('/').pop().toLowerCase();
  if (fileName === 'dockerfile' || fileName.startsWith('dockerfile.')) return 'dockerfile';
  if (fileName.startsWith('.env')) return 'ini';

  const ext = fileName.split('.').pop().toLowerCase();
  const map = {
    js: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    mts: 'typescript',
    cts: 'typescript',
    tsx: 'typescript',
    json: 'json',
    jsonc: 'json',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'scss',
    less: 'less',
    py: 'python',
    pyw: 'python',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    ksh: 'shell',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'ini',
    conf: 'ini',
    ini: 'ini',
    cfg: 'ini',
    sql: 'sql',
    md: 'markdown',
    markdown: 'markdown',
    xml: 'xml',
    svg: 'xml',
    dockerfile: 'dockerfile',
    rs: 'rust',
    go: 'go',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    hpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    java: 'java',
    php: 'php',
    rb: 'ruby',
    lua: 'lua'
  };
  return map[ext] || 'plaintext';
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function CodeEditorModal({
  filePath,
  token,
  onClose,
  onShowToast
}) {
  const { resolvedTheme } = useTheme();
  const [currentContent, setCurrentContent] = useState('');
  const [initialContent, setInitialContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [isWrapped, setIsWrapped] = useState(true);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const editorRef = useRef(null);
  const isDirty = currentContent !== initialContent;

  // Track latest content and save function via refs to prevent stale closures
  const currentContentRef = useRef(currentContent);
  useEffect(() => {
    currentContentRef.current = currentContent;
  }, [currentContent]);

  useEffect(() => {
    if (!filePath || !token) return;
    setIsLoading(true);
    setError(null);

    fetch(`/api/files/read?path=${encodeURIComponent(filePath)}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (res) => {
        if (!res.ok) {
          let msg = `HTTP ${res.status}`;
          try {
            const data = await res.json();
            if (data?.error) msg = data.error;
          } catch {}
          throw new Error(msg);
        }
        const text = await res.text();
        setCurrentContent(text);
        setInitialContent(text);
      })
      .catch((err) => {
        console.error('Failed to load file for editing:', err);
        setError(err.message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [filePath, token]);

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;

    // Track cursor position
    editor.onDidChangeCursorPosition((e) => {
      setCursorPos({
        line: e.position.lineNumber,
        col: e.position.column
      });
    });

    // Bind Ctrl+S shortcut inside Monaco
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSave();
    });
  };

  const handleSave = async () => {
    const contentToSave = currentContentRef.current;
    if (contentToSave === undefined) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/files/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          path: filePath,
          content: contentToSave
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save file');

      // Sync initialContent to currentContent on successful save
      setInitialContent(contentToSave);
      onShowToast?.(`File saved: ${filePath.split('/').pop()}`, 'success');
    } catch (err) {
      console.error('Save failed:', err);
      onShowToast?.(`Save failed: ${err.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (isDirty) {
      if (confirm('You have unsaved changes. Discard them?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  // Keyboard shortcut listener for global escape and Ctrl+S
  const handleCloseRef = useRef(handleClose);
  handleCloseRef.current = handleClose;
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveRef.current?.();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCloseRef.current?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const totalBytes = new Blob([currentContent]).size;
  const totalLines = currentContent.split('\n').length;
  const detectedLang = getMonacoLanguage(filePath);
  const shortFileName = filePath ? filePath.split('/').pop() : '';

  return (
    <div className="fixed inset-0 z-50 bg-black/70 dark:bg-black/80 backdrop-blur-sm flex flex-col select-none animate-in fade-in duration-150 font-sans h-[100dvh] max-h-[100dvh] w-full">
      {/* Editor Header */}
      <div className="bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 px-3 sm:px-4 py-2 flex items-center justify-between gap-2 shrink-0 transition-colors">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileCode className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span
            className="text-xs font-mono font-semibold text-zinc-900 dark:text-zinc-200 truncate"
            title={filePath}
          >
            {isMobile ? shortFileName : filePath}
          </span>
          {isDirty && (
            <span className="text-amber-600 dark:text-amber-400 text-[10px] sm:text-xs font-mono px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded shrink-0">
              Modified
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Word Wrap Toggle */}
          <button
            onClick={() => setIsWrapped(!isWrapped)}
            title={`Word Wrap: ${isWrapped ? 'ON' : 'OFF'}`}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-mono border transition-colors min-h-[36px] sm:min-h-0 ${
              isWrapped
                ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-200 border-zinc-300 dark:border-zinc-700'
                : 'bg-zinc-50 dark:bg-zinc-900/60 text-zinc-500 border-zinc-200 dark:border-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-300'
            }`}
          >
            <WrapText className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Wrap: {isWrapped ? 'ON' : 'OFF'}</span>
          </button>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white font-medium rounded text-xs transition-colors shadow-sm min-h-[36px] sm:min-h-0 active:scale-95"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving...' : isMobile ? 'Save' : 'Save (Ctrl+S)'}</span>
          </button>

          {/* Close Button */}
          <button
            onClick={handleClose}
            title="Close (Esc)"
            className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Editor Body */}
      <div className="flex-1 relative bg-white dark:bg-[#1e1e1e] overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-zinc-950/80 z-10 text-zinc-600 dark:text-zinc-400 text-xs font-mono space-x-2">
            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span>Loading file buffer...</span>
          </div>
        )}

        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-rose-500 dark:text-rose-400 space-y-2">
            <AlertCircle className="w-8 h-8" />
            <span className="font-mono text-xs">{error}</span>
          </div>
        ) : (
          <Editor
            height="100%"
            language={detectedLang}
            value={currentContent}
            theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
            onChange={(val) => setCurrentContent(val || '')}
            onMount={handleEditorDidMount}
            options={{
              fontSize: isMobile ? 12 : 13,
              tabSize: 2,
              minimap: { enabled: !isMobile },
              scrollBeyondLastLine: false,
              wordWrap: isWrapped ? 'on' : 'off',
              autoIndent: 'advanced',
              formatOnPaste: true,
              matchBrackets: 'always',
              automaticLayout: true
            }}
          />
        )}
      </div>

      {/* Custom Editor Status Bar (Footer) */}
      <div className="bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 px-3 sm:px-4 py-1.5 flex items-center justify-between text-[10px] sm:text-[11px] font-mono text-zinc-500 dark:text-zinc-400 shrink-0 transition-colors">
        <div className="flex items-center gap-2 sm:gap-3 truncate">
          <span className="text-zinc-700 dark:text-zinc-400 truncate">{detectedLang}</span>
          <span>•</span>
          <span>{formatBytes(totalBytes)}</span>
          <span className="hidden sm:inline">•</span>
          <span className="hidden sm:inline">{totalLines} lines</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <span className="text-zinc-800 dark:text-zinc-300 font-semibold">
            Ln {cursorPos.line}, Col {cursorPos.col}
          </span>
          <span className="hidden sm:inline">•</span>
          <span className="hidden sm:inline">UTF-8</span>
        </div>
      </div>
    </div>
  );
}

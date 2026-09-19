import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, FolderPlus, FilePlus, UploadCloud } from 'lucide-react';
import FileSidebar from './FileSidebar';
import FileTopBar from './FileTopBar';
import FileTable from './FileTable';
import FileStatusBar from './FileStatusBar';
import FileContextMenu from './FileContextMenu';
import CodeEditorModal from './CodeEditorModal';
import HexViewerModal from './HexViewerModal';
import ImageViewerModal from './ImageViewerModal';
import PdfViewerModal from './PdfViewerModal';
import ChmodModal from './ChmodModal';
import ConflictModal from './ConflictModal';
import UploadModal from './UploadModal';
import TaskPopover from './TaskPopover';
import TrashModal from './TrashModal';
import KeyboardShortcutsModal from './KeyboardShortcutsModal';
import { isImageFile, isPdfFile, isArchiveFile } from './fileIcons';

export default function FileManager({ token, onShowToast }) {
  // Navigation & Directory State
  const [currentPath, setCurrentPath] = useState('/root');
  const [history, setHistory] = useState(['/root']);
  const [historyIndex, setHistoryIndex] = useState(0);

  // File Listing State
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showHidden, setShowHidden] = useState(true);
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [isRecursiveSearch, setIsRecursiveSearch] = useState(false);
  const [isContentSearch, setIsContentSearch] = useState(false);

  // Selection & Clipboard
  const [selectedPaths, setSelectedPaths] = useState(new Set());
  const [clipboard, setClipboard] = useState({ mode: null, items: [] });

  // Context Menu State
  const [contextMenu, setContextMenu] = useState(null); // { x, y, targetItem }

  // Modals State
  const [activeEditorFile, setActiveEditorFile] = useState(null);
  const [activeHexFile, setActiveHexFile] = useState(null);
  const [activeImageFile, setActiveImageFile] = useState(null);
  const [activePdfFile, setActivePdfFile] = useState(null);
  const [chmodTargetItem, setChmodTargetItem] = useState(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [isTasksOpen, setIsTasksOpen] = useState(false);
  const [isKeyboardGuideOpen, setIsKeyboardGuideOpen] = useState(false);
  const [activeTasks, setActiveTasks] = useState([]);
  const [trashCount, setTrashCount] = useState(0);

  // Conflict Modal State
  const [conflictState, setConflictState] = useState(null); // { conflicts, actionType, sources, destDir }

  // Prompt Modal (Simple custom dialog for Create/Rename)
  const [promptModal, setPromptModal] = useState(null); // { title, placeholder, initialValue, onSubmit }

  // Mobile Drawer & FAB State
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);

  // Fetch file list
  const fetchDirectory = useCallback(async (dirPath) => {
    if (!token) return;
    setIsLoading(true);
    try {
      let url = `/api/files/list?path=${encodeURIComponent(dirPath)}&showHidden=${showHidden}&sortBy=${sortBy}&sortOrder=${sortOrder}`;
      if (searchQuery.trim()) {
        url = `/api/files/search?path=${encodeURIComponent(dirPath)}&query=${encodeURIComponent(searchQuery)}&recursive=${isRecursiveSearch}&content=${isContentSearch}`;
      }

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to list directory');

      const newItems = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
      setItems(newItems);

      // Reconcile selections: preserve existing selections that still exist
      setSelectedPaths((prev) => {
        if (prev.size === 0) return prev;
        const validPaths = new Set(newItems.map((i) => i.path));
        const next = new Set();
        for (const p of prev) {
          if (validPaths.has(p)) next.add(p);
        }
        return next;
      });
    } catch (err) {
      onShowToast?.(`Error: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [token, showHidden, sortBy, sortOrder, searchQuery, isRecursiveSearch, isContentSearch, onShowToast]);

  // Load directory on path or filter change
  useEffect(() => {
    fetchDirectory(currentPath);
  }, [currentPath, showHidden, sortBy, sortOrder, searchQuery, isRecursiveSearch, isContentSearch, fetchDirectory]);

  // Reset selections ONLY when navigating to a different folder path
  useEffect(() => {
    setSelectedPaths(new Set());
  }, [currentPath]);

  // Periodic poll for background tasks & trash count
  useEffect(() => {
    if (!token) return;

    const poll = async () => {
      try {
        const [tasksRes, trashRes] = await Promise.all([
          fetch('/api/files/tasks', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/files/trash', { headers: { Authorization: `Bearer ${token}` } })
        ]);

        if (tasksRes.ok) {
          const tasksData = await tasksRes.json();
          if (Array.isArray(tasksData)) setActiveTasks(tasksData);
        }

        if (trashRes.ok) {
          const trashData = await trashRes.json();
          if (Array.isArray(trashData)) setTrashCount(trashData.length);
        }
      } catch {}
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [token]);

  // Navigation handlers
  const navigateTo = (newPath) => {
    if (newPath === currentPath) return;
    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push(newPath);
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
    setCurrentPath(newPath);
  };

  const handleGoBack = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setCurrentPath(history[newIndex]);
    }
  };

  const handleGoForward = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setCurrentPath(history[newIndex]);
    }
  };

  const handleGoUp = () => {
    if (currentPath === '/') return;
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
    navigateTo(parent);
  };

  // Selection handlers
  const handleToggleSelect = (path, { shiftKey, ctrlKey, index } = {}) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (ctrlKey) {
        if (next.has(path)) next.delete(path);
        else next.add(path);
      } else {
        next.clear();
        next.add(path);
      }
      return next;
    });
  };

  const handleSelectAll = (selectAll) => {
    if (selectAll) {
      setSelectedPaths(new Set(items.map((i) => i.path)));
    } else {
      setSelectedPaths(new Set());
    }
  };

  // Smart Open item (double click or enter)
  const handleOpenItem = (item) => {
    if (!item) return;
    if (item.isDirectory) {
      navigateTo(item.path);
    } else if (isImageFile(item.name)) {
      setActiveImageFile(item.path);
    } else if (isPdfFile(item.name)) {
      setActivePdfFile(item.path);
    } else if (isArchiveFile(item.name)) {
      handleExtract(item);
    } else {
      // Default: Code / Text / Config editor
      setActiveEditorFile(item.path);
    }
  };

  // Download item using authenticated fetch & blob
  const handleDownload = async (item) => {
    if (!item || !item.path) return;
    try {
      onShowToast?.(`Preparing download for ${item.name}...`, 'info');
      const res = await fetch(`/api/files/download?path=${encodeURIComponent(item.path)}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) {
        let errText = `Download failed (HTTP ${res.status})`;
        try {
          const errData = await res.json();
          if (errData?.error) errText = errData.error;
        } catch {}
        throw new Error(errText);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.name || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onShowToast?.(`Downloaded ${item.name}`, 'success');
    } catch (err) {
      console.error('Download error:', err);
      onShowToast?.(`Download error: ${err.message}`, 'error');
    }
  };

  // Duplicate item
  const handleDuplicate = async (item) => {
    try {
      const res = await fetch('/api/files/duplicate', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: item.path })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Duplicate failed');
      onShowToast?.(`Duplicated ${item.name}`, 'success');
      fetchDirectory(currentPath);
    } catch (err) {
      onShowToast?.(`Duplicate error: ${err.message}`, 'error');
    }
  };

  // Copy / Cut / Paste
  const handleCopy = (target = null) => {
    let itemsToCopy = [];
    if (Array.isArray(target)) {
      itemsToCopy = target;
    } else if (target && typeof target === 'object' && target.path) {
      itemsToCopy = [target.path];
    } else if (selectedPaths.size > 0) {
      itemsToCopy = Array.from(selectedPaths);
    }
    if (itemsToCopy.length === 0) return;
    setClipboard({ mode: 'copy', items: itemsToCopy });
    onShowToast?.(`Copied ${itemsToCopy.length} item${itemsToCopy.length > 1 ? 's' : ''} to clipboard`, 'info');
  };

  const handleCut = (target = null) => {
    let itemsToCut = [];
    if (Array.isArray(target)) {
      itemsToCut = target;
    } else if (target && typeof target === 'object' && target.path) {
      itemsToCut = [target.path];
    } else if (selectedPaths.size > 0) {
      itemsToCut = Array.from(selectedPaths);
    }
    if (itemsToCut.length === 0) return;
    setClipboard({ mode: 'cut', items: itemsToCut });
    onShowToast?.(`Cut ${itemsToCut.length} item${itemsToCut.length > 1 ? 's' : ''} to clipboard`, 'info');
  };

  const handlePaste = async (destFolder = null) => {
    if (!clipboard.mode || !clipboard.items || clipboard.items.length === 0) return;

    const targetDir = destFolder || currentPath;
    const isCut = clipboard.mode === 'cut';
    const endpoint = isCut ? '/api/files/move' : '/api/files/copy';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sources: clipboard.items,
          destinationDir: targetDir
        })
      });

      const data = await res.json();

      if (res.status === 409) {
        // Conflict detected! Open ConflictModal
        setConflictState({
          conflicts: data.conflicts,
          actionType: clipboard.mode,
          sources: clipboard.items,
          destDir: targetDir
        });
        return;
      }

      if (!res.ok) throw new Error(data.error || 'Paste operation failed');

      onShowToast?.(`${isCut ? 'Moved' : 'Copied'} ${clipboard.items.length} item${clipboard.items.length > 1 ? 's' : ''}`, 'success');
      if (isCut) setClipboard({ mode: null, items: [] });
      fetchDirectory(currentPath);
    } catch (err) {
      onShowToast?.(`Paste error: ${err.message}`, 'error');
    }
  };

  const handleResolveConflict = async (resolution) => {
    if (!conflictState) return;
    const { actionType, sources, destDir } = conflictState;
    const isCut = actionType === 'cut';
    const endpoint = isCut ? '/api/files/move' : '/api/files/copy';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sources,
          destinationDir: destDir,
          resolution
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Resolved paste failed');

      onShowToast?.(`Completed with ${resolution}`, 'success');
      if (isCut) setClipboard({ mode: null, items: [] });
      setConflictState(null);
      fetchDirectory(currentPath);
    } catch (err) {
      onShowToast?.(`Conflict resolution error: ${err.message}`, 'error');
    }
  };

  // Delete to Trash (POST /api/files/trash)
  const handleTrash = async (target = null) => {
    let paths = [];
    if (Array.isArray(target)) {
      paths = target;
    } else if (target && typeof target === 'object' && target.path) {
      paths = [target.path];
    } else if (selectedPaths.size > 0) {
      paths = Array.from(selectedPaths);
    }
    if (paths.length === 0) return;

    try {
      const res = await fetch('/api/files/trash', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ paths })
      });

      if (!res.ok) {
        let errText = `Trash failed (HTTP ${res.status})`;
        try {
          const data = await res.json();
          if (data?.error) errText = data.error;
        } catch {}
        throw new Error(errText);
      }

      onShowToast?.(`Moved ${paths.length} item${paths.length > 1 ? 's' : ''} to Trash`, 'info');
      setSelectedPaths(new Set());
      fetchDirectory(currentPath);
    } catch (err) {
      onShowToast?.(`Delete error: ${err.message}`, 'error');
    }
  };

  // Permanent Delete (DELETE /api/files)
  const handlePermanentDelete = async (target = null) => {
    let paths = [];
    if (Array.isArray(target)) {
      paths = target;
    } else if (target && typeof target === 'object' && target.path) {
      paths = [target.path];
    } else if (selectedPaths.size > 0) {
      paths = Array.from(selectedPaths);
    }
    if (paths.length === 0) return;
    if (!window.confirm(`Permanently delete ${paths.length} item${paths.length > 1 ? 's' : ''}? This cannot be restored!`)) return;

    try {
      const res = await fetch('/api/files', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ paths })
      });

      if (!res.ok) {
        let errText = `Permanent delete failed (HTTP ${res.status})`;
        try {
          const data = await res.json();
          if (data?.error) errText = data.error;
        } catch {}
        throw new Error(errText);
      }

      onShowToast?.(`Permanently deleted ${paths.length} item${paths.length > 1 ? 's' : ''}`, 'info');
      setSelectedPaths(new Set());
      fetchDirectory(currentPath);
    } catch (err) {
      onShowToast?.(`Delete error: ${err.message}`, 'error');
    }
  };

  // Create Folder Dialog
  const handleCreateFolder = () => {
    setPromptModal({
      title: 'Create New Directory',
      placeholder: 'folder-name',
      initialValue: '',
      onSubmit: async (name) => {
        try {
          const res = await fetch('/api/files/mkdir', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ path: currentPath, name })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Mkdir failed');
          onShowToast?.(`Created folder '${name}'`, 'success');
          fetchDirectory(currentPath);
        } catch (err) {
          onShowToast?.(`Mkdir error: ${err.message}`, 'error');
        }
      }
    });
  };

  // Create File Dialog
  const handleCreateFile = () => {
    setPromptModal({
      title: 'Create New File',
      placeholder: 'file.txt',
      initialValue: '',
      onSubmit: async (name) => {
        try {
          const res = await fetch('/api/files/create', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ path: currentPath, name })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Create file failed');
          onShowToast?.(`Created file '${name}'`, 'success');
          fetchDirectory(currentPath);
        } catch (err) {
          onShowToast?.(`Create error: ${err.message}`, 'error');
        }
      }
    });
  };

  // Rename Dialog
  const handleRename = (item) => {
    setPromptModal({
      title: `Rename ${item.name}`,
      placeholder: item.name,
      initialValue: item.name,
      onSubmit: async (newName) => {
        try {
          const res = await fetch('/api/files/rename', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ oldPath: item.path, newName })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Rename failed');
          onShowToast?.(`Renamed to '${newName}'`, 'success');
          fetchDirectory(currentPath);
        } catch (err) {
          onShowToast?.(`Rename error: ${err.message}`, 'error');
        }
      }
    });
  };

  // Archive / Compress
  const handleArchive = async () => {
    const selected = Array.from(selectedPaths);
    if (selected.length === 0) return;

    const baseTarget = selected.length === 1 ? selected[0] : `${currentPath}/archive`;
    const targetFile = `${baseTarget}.tar.gz`;

    try {
      const res = await fetch('/api/files/archive', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sources: selected,
          targetFile,
          format: 'tar.gz'
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Archive creation failed');

      onShowToast?.('Archive background job started', 'info');
      setIsTasksOpen(true);
      fetchDirectory(currentPath);
    } catch (err) {
      onShowToast?.(`Archive error: ${err.message}`, 'error');
    }
  };

  // Extract Archive
  const handleExtract = async (item) => {
    if (!item || !item.path) return;
    if (!window.confirm(`Extract "${item.name}" into ${currentPath}?`)) return;

    try {
      const res = await fetch('/api/files/extract', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          archivePath: item.path,
          archiveFile: item.path,
          targetDir: currentPath,
          destinationDir: currentPath
        })
      });

      if (!res.ok) {
        let errText = `Extraction failed (HTTP ${res.status})`;
        try {
          const data = await res.json();
          if (data?.error) errText = data.error;
        } catch {}
        throw new Error(errText);
      }

      onShowToast?.(`Extraction started for ${item.name}`, 'info');
      setIsTasksOpen(true);
      fetchDirectory(currentPath);
    } catch (err) {
      onShowToast?.(`Extract error: ${err.message}`, 'error');
    }
  };

  // Context menu trigger
  const handleContextMenu = (e, item) => {
    if (item && !selectedPaths.has(item.path)) {
      setSelectedPaths(new Set([item.path]));
    }
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      targetItem: item
    });
  };

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Do not intercept hotkeys if inside an input or modal editor
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (activeEditorFile || activeHexFile || chmodTargetItem || isUploadOpen || promptModal) return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        handleCopy();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
        e.preventDefault();
        handleCut();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        handlePaste();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        handleSelectAll(true);
      } else if (e.key === 'Delete') {
        e.preventDefault();
        if (e.shiftKey) {
          handlePermanentDelete();
        } else {
          handleTrash();
        }
      } else if (e.key === 'F2') {
        e.preventDefault();
        const selected = Array.from(selectedPaths);
        if (selected.length === 1) {
          const item = items.find((i) => i.path === selected[0]);
          if (item) handleRename(item);
        }
      } else if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setIsKeyboardGuideOpen(true);
      } else if (e.key === 'Escape') {
        setSelectedPaths(new Set());
        setContextMenu(null);
        setIsKeyboardGuideOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedPaths,
    clipboard,
    items,
    activeEditorFile,
    activeHexFile,
    chmodTargetItem,
    isUploadOpen,
    promptModal,
    isKeyboardGuideOpen
  ]);

  const selectedItemsList = items.filter((i) => selectedPaths.has(i.path));
  const activeTasksCount = activeTasks.filter((t) => t.status === 'running').length;

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] min-h-[580px] bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-xl overflow-hidden shadow-2xl">
      {/* Top Action Bar */}
      <FileTopBar
        currentPath={currentPath}
        canGoBack={historyIndex > 0}
        canGoForward={historyIndex < history.length - 1}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
        onGoUp={handleGoUp}
        onNavigate={navigateTo}
        onRefresh={() => fetchDirectory(currentPath)}
        onOpenKeyboardGuide={() => setIsKeyboardGuideOpen(true)}
        onCreateFolder={handleCreateFolder}
        onCreateFile={handleCreateFile}
        onUpload={() => setIsUploadOpen(true)}
        showHidden={showHidden}
        onToggleHidden={() => setShowHidden(!showHidden)}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isRecursiveSearch={isRecursiveSearch}
        onToggleRecursiveSearch={() => setIsRecursiveSearch(!isRecursiveSearch)}
        isContentSearch={isContentSearch}
        onToggleContentSearch={() => setIsContentSearch(!isContentSearch)}
        isLoading={isLoading}
        onToggleSidebar={() => setIsMobileSidebarOpen((v) => !v)}
      />

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Desktop Left Sidebar (Fixed on left for md and above) */}
        <div className="hidden md:flex h-full shrink-0">
          <FileSidebar
            currentPath={currentPath}
            onNavigate={navigateTo}
            onOpenTrash={() => setIsTrashOpen(true)}
            trashCount={trashCount}
            token={token}
          />
        </div>

        {/* Mobile Off-Canvas Sidebar Drawer (< md) */}
        {isMobileSidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex animate-in fade-in duration-150">
            {/* Backdrop blur overlay */}
            <div
              className="fixed inset-0 bg-black/40 dark:bg-black/75 backdrop-blur-sm"
              onClick={() => setIsMobileSidebarOpen(false)}
            />
            {/* Slide-in drawer container */}
            <div className="relative z-10 w-72 max-w-[85vw] h-full shadow-2xl animate-in slide-in-from-left duration-200">
              <FileSidebar
                currentPath={currentPath}
                onNavigate={(p) => {
                  navigateTo(p);
                  setIsMobileSidebarOpen(false);
                }}
                onOpenTrash={() => {
                  setIsTrashOpen(true);
                  setIsMobileSidebarOpen(false);
                }}
                trashCount={trashCount}
                token={token}
                onClose={() => setIsMobileSidebarOpen(false)}
              />
            </div>
          </div>
        )}

        {/* File Table / Grid */}
        <FileTable
          items={items}
          viewMode={viewMode}
          selectedPaths={selectedPaths}
          onToggleSelect={handleToggleSelect}
          onSelectAll={handleSelectAll}
          onOpenItem={handleOpenItem}
          onContextMenu={handleContextMenu}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={(col) => {
            if (sortBy === col) {
              setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
            } else {
              setSortBy(col);
              setSortOrder('asc');
            }
          }}
          clipboard={clipboard}
        />

        {/* Mobile Floating Action Button (FAB) Speed-Dial */}
        <div className="md:hidden">
          {/* Backdrop for open speed dial */}
          {isFabOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
              onClick={() => setIsFabOpen(false)}
            />
          )}

          {/* Speed Dial Menu Items */}
          {isFabOpen && (
            <div className="fixed bottom-24 right-6 z-50 flex flex-col items-end gap-3 animate-in slide-in-from-bottom-4 duration-150 select-none">
              <button
                type="button"
                onClick={() => {
                  setIsFabOpen(false);
                  handleCreateFolder();
                }}
                className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 text-zinc-800 dark:text-zinc-100 rounded-full shadow-2xl text-xs font-medium active:scale-95 transition-transform min-h-[44px]"
              >
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">New Folder</span>
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <FolderPlus className="w-4 h-4" />
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsFabOpen(false);
                  handleCreateFile();
                }}
                className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 text-zinc-800 dark:text-zinc-100 rounded-full shadow-2xl text-xs font-medium active:scale-95 transition-transform min-h-[44px]"
              >
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">New File</span>
                <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-500 dark:text-blue-400 flex items-center justify-center">
                  <FilePlus className="w-4 h-4" />
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsFabOpen(false);
                  setIsUploadOpen(true);
                }}
                className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 text-zinc-800 dark:text-zinc-100 rounded-full shadow-2xl text-xs font-medium active:scale-95 transition-transform min-h-[44px]"
              >
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">Upload Files</span>
                <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-500 dark:text-purple-400 flex items-center justify-center">
                  <UploadCloud className="w-4 h-4" />
                </div>
              </button>
            </div>
          )}

          {/* Primary Floating Action Trigger */}
          <button
            type="button"
            onClick={() => setIsFabOpen((v) => !v)}
            className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-[0_4px_25px_rgba(16,185,129,0.45)] transition-all duration-200 active:scale-95 ${
              isFabOpen
                ? 'bg-zinc-800 text-zinc-200 border border-zinc-700 rotate-45'
                : 'bg-emerald-500 text-black rotate-0 hover:bg-emerald-400'
            }`}
            aria-label="Create or Upload"
            title="Create or Upload"
          >
            <Plus className="w-7 h-7 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* Bottom Status Bar */}
      <FileStatusBar
        totalItems={items.length}
        selectedItems={selectedItemsList}
        activeTasksCount={activeTasksCount}
        onOpenTasks={() => setIsTasksOpen(true)}
        onOpenKeyboardGuide={() => setIsKeyboardGuideOpen(true)}
        clipboard={clipboard}
      />

      {/* Global Right-Click Context Menu */}
      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          targetItem={contextMenu.targetItem}
          selectedItems={selectedItemsList}
          clipboard={clipboard}
          onClose={() => setContextMenu(null)}
          onOpenItem={handleOpenItem}
          onEditItem={(it) => setActiveEditorFile(it.path)}
          onViewHex={(it) => setActiveHexFile(it.path)}
          onDownload={handleDownload}
          onCopy={(target) => handleCopy(target)}
          onCut={(target) => handleCut(target)}
          onPaste={(destFolder) => handlePaste(destFolder)}
          onDuplicate={handleDuplicate}
          onRename={handleRename}
          onChmod={(it) => setChmodTargetItem(it)}
          onArchive={handleArchive}
          onExtract={handleExtract}
          onTrash={(target) => handleTrash(target)}
          onPermanentDelete={(target) => handlePermanentDelete(target)}
          onCreateFolder={handleCreateFolder}
          onCreateFile={handleCreateFile}
          onRefresh={() => fetchDirectory(currentPath)}
        />
      )}

      {/* Monaco Code Editor Modal */}
      {activeEditorFile && (
        <CodeEditorModal
          filePath={activeEditorFile}
          token={token}
          onClose={() => {
            setActiveEditorFile(null);
            fetchDirectory(currentPath);
          }}
          onShowToast={onShowToast}
        />
      )}

      {/* Hex Dump Viewer Modal */}
      {activeHexFile && (
        <HexViewerModal
          filePath={activeHexFile}
          token={token}
          onClose={() => setActiveHexFile(null)}
        />
      )}

      {/* Responsive Image Previewer Modal */}
      {activeImageFile && (
        <ImageViewerModal
          filePath={activeImageFile}
          token={token}
          onClose={() => setActiveImageFile(null)}
          onShowToast={onShowToast}
        />
      )}

      {/* Universal PDF Viewer Modal */}
      {activePdfFile && (
        <PdfViewerModal
          filePath={activePdfFile}
          token={token}
          onClose={() => setActivePdfFile(null)}
          onShowToast={onShowToast}
        />
      )}

      {/* Chmod Permissions Modal */}
      {chmodTargetItem && (
        <ChmodModal
          item={chmodTargetItem}
          token={token}
          onClose={() => setChmodTargetItem(null)}
          onSuccess={() => fetchDirectory(currentPath)}
          onShowToast={onShowToast}
        />
      )}

      {/* Conflict Resolution Modal */}
      {conflictState && (
        <ConflictModal
          conflicts={conflictState.conflicts}
          actionType={conflictState.actionType}
          onResolve={handleResolveConflict}
          onClose={() => setConflictState(null)}
        />
      )}

      {/* Chunked Upload Modal */}
      {isUploadOpen && (
        <UploadModal
          targetDir={currentPath}
          token={token}
          onClose={() => setIsUploadOpen(false)}
          onSuccess={() => fetchDirectory(currentPath)}
          onShowToast={onShowToast}
        />
      )}

      {/* Recycle Bin Modal */}
      <TrashModal
        token={token}
        isOpen={isTrashOpen}
        onClose={() => setIsTrashOpen(false)}
        onTrashUpdated={() => fetchDirectory(currentPath)}
        onShowToast={onShowToast}
      />

      {/* Background Tasks Monitor */}
      <TaskPopover
        tasks={activeTasks}
        isOpen={isTasksOpen}
        onClose={() => setIsTasksOpen(false)}
      />

      {/* Simple Prompt Dialog for Folder / File / Rename */}
      {promptModal && (
        <div className="fixed inset-0 z-50 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const val = e.target.elements.val.value.trim();
              if (val) promptModal.onSubmit(val);
              setPromptModal(null);
            }}
            className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl max-w-sm w-full p-5 space-y-4 shadow-2xl"
          >
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{promptModal.title}</h3>
            <input
              name="val"
              defaultValue={promptModal.initialValue}
              placeholder={promptModal.placeholder}
              autoFocus
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 font-mono outline-none focus:border-emerald-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPromptModal(null)}
                className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 rounded text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium"
              >
                Confirm
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Keyboard Shortcuts Guide Modal */}
      <KeyboardShortcutsModal
        isOpen={isKeyboardGuideOpen}
        onClose={() => setIsKeyboardGuideOpen(false)}
      />
    </div>
  );
}

import React, { useState } from 'react';
import {
  Menu,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  FolderPlus,
  FilePlus,
  UploadCloud,
  RefreshCw,
  Eye,
  EyeOff,
  LayoutGrid,
  List,
  Search,
  X,
  FileSearch,
  FolderTree,
  Keyboard
} from 'lucide-react';

export default function FileTopBar({
  currentPath,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  onGoUp,
  onNavigate,
  onRefresh,
  onOpenKeyboardGuide,
  onCreateFolder,
  onCreateFile,
  onUpload,
  showHidden,
  onToggleHidden,
  viewMode,
  onChangeViewMode,
  searchQuery,
  onSearchChange,
  isRecursiveSearch,
  onToggleRecursiveSearch,
  isContentSearch,
  onToggleContentSearch,
  isLoading,
  onToggleSidebar
}) {
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [manualPath, setManualPath] = useState(currentPath);

  const handleBreadcrumbClick = (index, segments) => {
    if (index === -1) {
      onNavigate('/');
      return;
    }
    const newPath = '/' + segments.slice(0, index + 1).join('/');
    onNavigate(newPath);
  };

  const handlePathSubmit = (e) => {
    e.preventDefault();
    setIsEditingPath(false);
    if (manualPath.trim()) {
      onNavigate(manualPath.trim());
    }
  };

  const pathSegments = currentPath === '/' ? [] : currentPath.split('/').filter(Boolean);

  return (
    <header className="bg-white/95 dark:bg-zinc-950/90 border-b border-zinc-200 dark:border-zinc-800/80 px-2.5 sm:px-4 py-2 sm:py-2.5 flex flex-col gap-2 select-none">
      {/* Top Bar: Navigation & Quick Actions */}
      <div className="flex items-center justify-between gap-2">
        {/* Mobile Hamburger Drawer Trigger */}
        <button
          type="button"
          onClick={onToggleSidebar}
          className="md:hidden p-2 min-w-[44px] min-h-[44px] flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900/90 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 rounded-lg shrink-0 transition-colors active:scale-95"
          title="Open Navigation Menu"
          aria-label="Open Navigation Menu"
        >
          <Menu className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
        </button>

        {/* Navigation Controls & Breadcrumbs */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-900/80 rounded-md border border-zinc-200 dark:border-zinc-800 p-0.5 text-zinc-500 dark:text-zinc-400 shrink-0">
            <button
              onClick={onGoBack}
              disabled={!canGoBack}
              title="Back"
              className="p-2 sm:p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800/60 rounded disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              onClick={onGoForward}
              disabled={!canGoForward}
              title="Forward"
              className="p-2 sm:p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800/60 rounded disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={onGoUp}
              disabled={currentPath === '/'}
              title="Parent Directory"
              className="p-2 sm:p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800/60 rounded disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>

          {/* Breadcrumbs / Path Input */}
          <div className="flex-1 min-w-0 bg-zinc-100/90 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-md px-2.5 sm:px-3 py-1.5 flex items-center font-mono text-xs text-zinc-800 dark:text-zinc-300 overflow-hidden min-h-[40px]">
            {isEditingPath ? (
              <form onSubmit={handlePathSubmit} className="flex-1 flex items-center">
                <input
                  type="text"
                  value={manualPath}
                  onChange={(e) => setManualPath(e.target.value)}
                  onBlur={() => setIsEditingPath(false)}
                  autoFocus
                  className="w-full bg-transparent text-emerald-600 dark:text-emerald-400 outline-none font-mono text-xs"
                />
              </form>
            ) : (
              <div
                onDoubleClick={() => {
                  setManualPath(currentPath);
                  setIsEditingPath(true);
                }}
                className="flex items-center gap-1 overflow-x-auto whitespace-nowrap no-scrollbar touch-pan-x cursor-text w-full py-0.5"
                title="Double click or tap to edit path"
              >
                <button
                  onClick={() => handleBreadcrumbClick(-1, [])}
                  className="hover:text-emerald-600 dark:hover:text-emerald-400 text-zinc-500 dark:text-zinc-400 hover:underline px-1 py-0.5 rounded"
                >
                  /
                </button>
                {pathSegments.map((segment, idx) => (
                  <React.Fragment key={idx}>
                    <span className="text-zinc-400 dark:text-zinc-600">/</span>
                    <button
                      onClick={() => handleBreadcrumbClick(idx, pathSegments)}
                      className={`hover:text-emerald-600 dark:hover:text-emerald-400 px-1 py-0.5 rounded transition-colors ${
                        idx === pathSegments.length - 1
                          ? 'text-zinc-900 dark:text-zinc-100 font-semibold'
                          : 'text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      {segment}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Desktop-Only Action Buttons (Hidden on mobile where FAB is used) */}
          <button
            onClick={onCreateFolder}
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800 rounded-md text-xs font-medium transition-colors"
            title="New Folder"
          >
            <FolderPlus className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Folder</span>
          </button>
          <button
            onClick={onCreateFile}
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800 rounded-md text-xs font-medium transition-colors"
            title="New File"
          >
            <FilePlus className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
            <span>File</span>
          </button>
          <button
            onClick={onUpload}
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-md text-xs shadow-sm transition-colors"
            title="Upload Files"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Upload</span>
          </button>

          <div className="hidden md:block h-4 w-px bg-zinc-200 dark:bg-zinc-800 mx-0.5" />

          {/* Toggle Hidden Files */}
          <button
            onClick={onToggleHidden}
            title={showHidden ? 'Hide hidden files' : 'Show hidden files'}
            className={`p-2 sm:p-1.5 min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 flex items-center justify-center rounded-md border text-xs transition-colors ${
              showHidden
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                : 'bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            {showHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>

          {/* View Mode Toggle (List / Grid) */}
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-900 rounded-md border border-zinc-200 dark:border-zinc-800 p-0.5">
            <button
              onClick={() => onChangeViewMode('list')}
              title="List View"
              className={`p-1.5 sm:p-1 min-w-[34px] min-h-[34px] sm:min-w-0 sm:min-h-0 flex items-center justify-center rounded ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => onChangeViewMode('grid')}
              title="Grid View"
              className={`p-1.5 sm:p-1 min-w-[34px] min-h-[34px] sm:min-w-0 sm:min-h-0 flex items-center justify-center rounded ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            title="Refresh"
            disabled={isLoading}
            className="p-2 sm:p-1.5 min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-md transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-600 dark:text-emerald-400' : ''}`} />
          </button>

          {/* Keyboard Guide (Desktop) */}
          <button
            onClick={onOpenKeyboardGuide}
            title="Keyboard Shortcuts Guide"
            className="hidden sm:flex items-center justify-center p-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 rounded-md transition-colors"
          >
            <Keyboard className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 sm:gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
          <input
            type="text"
            placeholder={
              isContentSearch
                ? 'Grep file content in folder...'
                : isRecursiveSearch
                ? 'Search files recursively...'
                : 'Filter current folder...'
            }
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-zinc-100/80 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80 rounded-md pl-8 pr-8 py-1.5 text-xs text-zinc-900 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 min-h-[38px] sm:min-h-0"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Search Modifiers */}
        <div className="flex items-center gap-1 shrink-0 overflow-x-auto no-scrollbar">
          <button
            onClick={onToggleRecursiveSearch}
            title={isRecursiveSearch ? 'Recursive search active' : 'Enable recursive search'}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-mono border transition-colors min-h-[36px] sm:min-h-0 ${
              isRecursiveSearch
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                : 'bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
            }`}
          >
            <FolderTree className="w-3 h-3" />
            <span>Recursive</span>
          </button>
          <button
            onClick={onToggleContentSearch}
            title={isContentSearch ? 'Content grep active' : 'Enable content grep'}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-mono border transition-colors min-h-[36px] sm:min-h-0 ${
              isContentSearch
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                : 'bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
            }`}
          >
            <FileSearch className="w-3 h-3" />
            <span>Grep</span>
          </button>
        </div>
      </div>
    </header>
  );
}

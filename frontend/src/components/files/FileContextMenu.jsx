import React, { useEffect, useRef, useState } from 'react';
import {
  FileText,
  Folder,
  Code,
  Binary,
  Download,
  Copy,
  Scissors,
  Clipboard,
  Trash2,
  AlertTriangle,
  FileSpreadsheet,
  Archive,
  RefreshCw,
  FolderPlus,
  FilePlus,
  ShieldAlert,
  Files,
  Image as ImageIcon,
  Eye,
  X
} from 'lucide-react';
import { getFileIcon, isImageFile, isPdfFile } from './fileIcons';

export default function FileContextMenu({
  x,
  y,
  targetItem,
  selectedItems = [],
  clipboard,
  onClose,
  onOpenItem,
  onEditItem,
  onViewHex,
  onDownload,
  onCopy,
  onCut,
  onPaste,
  onDuplicate,
  onRename,
  onChmod,
  onArchive,
  onExtract,
  onTrash,
  onPermanentDelete,
  onCreateFolder,
  onCreateFile,
  onRefresh
}) {
  const menuRef = useRef(null);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const isArchive =
    targetItem?.name &&
    /\.(zip|tar|tar\.gz|tgz|tar\.bz2|tbz2|tar\.xz|txz)$/i.test(targetItem.name);
  const isMultiple = selectedItems.length > 1;
  const clipboardCount = (clipboard?.items || clipboard?.files || []).length;
  const clipboardAction = clipboard?.mode === 'cut' ? 'Move' : 'Paste';

  // Desktop positioning
  const style = !isMobile
    ? {
        left: Math.min(x, window.innerWidth - 230),
        top: Math.min(y, window.innerHeight - 380)
      }
    : undefined;

  // Render Action Content (shared between Desktop popup and Mobile Bottom Sheet)
  const renderActions = () => (
    <div className="flex flex-col space-y-0.5">
      {targetItem ? (
        <>
          {/* Target Header */}
          <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800/80 mb-1 flex items-center justify-between gap-2 text-zinc-500 dark:text-zinc-400 font-mono text-xs">
            <div className="flex items-center gap-2 truncate min-w-0">
              {getFileIcon(targetItem, targetItem.isDirectory, isMobile ? 'w-5 h-5' : 'w-4 h-4')}
              <span className="truncate font-sans font-medium text-zinc-900 dark:text-zinc-200">
                {isMultiple ? `${selectedItems.length} items selected` : targetItem.name}
              </span>
            </div>
            {isMobile && (
              <button
                type="button"
                onClick={onClose}
                className="p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Primary View / Open Actions */}
          {!isMultiple && (
            <>
              <button
                onClick={() => {
                  onClose();
                  onOpenItem(targetItem);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 sm:py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors text-left rounded-lg sm:rounded ${
                  isMobile ? 'min-h-[44px] text-sm' : 'text-xs'
                }`}
              >
                {targetItem.isDirectory ? (
                  <>
                    <Folder className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Open Folder</span>
                  </>
                ) : isImageFile(targetItem.name) ? (
                  <>
                    <ImageIcon className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                    <span>Preview Image</span>
                  </>
                ) : isPdfFile(targetItem.name) ? (
                  <>
                    <FileText className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                    <span>View PDF</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4 text-zinc-400 shrink-0" />
                    <span>Open</span>
                  </>
                )}
              </button>

              {!targetItem.isDirectory && (
                <>
                  <button
                    onClick={() => {
                      onClose();
                      onEditItem(targetItem);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 sm:py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors text-left rounded-lg sm:rounded ${
                      isMobile ? 'min-h-[44px] text-sm' : 'text-xs'
                    }`}
                  >
                    <Code className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Edit with Monaco</span>
                  </button>
                  <button
                    onClick={() => {
                      onClose();
                      onViewHex(targetItem);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 sm:py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors text-left rounded-lg sm:rounded ${
                      isMobile ? 'min-h-[44px] text-sm' : 'text-xs'
                    }`}
                  >
                    <Binary className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <span>View Hex Dump</span>
                  </button>
                  <button
                    onClick={() => {
                      onClose();
                      onDownload(targetItem);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 sm:py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors text-left rounded-lg sm:rounded ${
                      isMobile ? 'min-h-[44px] text-sm' : 'text-xs'
                    }`}
                  >
                    <Download className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                    <span>Download File</span>
                  </button>
                </>
              )}

              {targetItem.isDirectory && clipboardCount > 0 && (
                <button
                  onClick={() => {
                    onClose();
                    onPaste(targetItem.path);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 sm:py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 hover:text-zinc-900 dark:hover:text-white transition-colors text-left text-emerald-600 dark:text-emerald-400 font-medium rounded-lg sm:rounded ${
                    isMobile ? 'min-h-[44px] text-sm' : 'text-xs'
                  }`}
                >
                  <Clipboard className="w-4 h-4 shrink-0" />
                  <span>
                    {clipboardAction} into folder ({clipboardCount})
                  </span>
                </button>
              )}

              {isArchive && (
                <button
                  onClick={() => {
                    onClose();
                    onExtract(targetItem);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 sm:py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 hover:text-zinc-900 dark:hover:text-white transition-colors text-left text-amber-600 dark:text-amber-400 rounded-lg sm:rounded ${
                    isMobile ? 'min-h-[44px] text-sm' : 'text-xs'
                  }`}
                >
                  <Archive className="w-4 h-4 shrink-0" />
                  <span>Extract Archive</span>
                </button>
              )}

              <div className="my-1 border-t border-zinc-200 dark:border-zinc-800/80" />
            </>
          )}

          {/* Edit Operations */}
          <button
            onClick={() => {
              onClose();
              onCopy(isMultiple ? null : targetItem);
            }}
            className={`w-full flex items-center justify-between px-3 py-2.5 sm:py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors text-left rounded-lg sm:rounded ${
              isMobile ? 'min-h-[44px] text-sm' : 'text-xs'
            }`}
          >
            <div className="flex items-center gap-3">
              <Copy className="w-4 h-4 text-zinc-400 shrink-0" />
              <span>Copy</span>
            </div>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono hidden sm:inline">Ctrl+C</span>
          </button>

          <button
            onClick={() => {
              onClose();
              onCut(isMultiple ? null : targetItem);
            }}
            className={`w-full flex items-center justify-between px-3 py-2.5 sm:py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors text-left rounded-lg sm:rounded ${
              isMobile ? 'min-h-[44px] text-sm' : 'text-xs'
            }`}
          >
            <div className="flex items-center gap-3">
              <Scissors className="w-4 h-4 text-zinc-400 shrink-0" />
              <span>Cut</span>
            </div>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono hidden sm:inline">Ctrl+X</span>
          </button>

          {!isMultiple && (
            <>
              <button
                onClick={() => {
                  onClose();
                  onDuplicate(targetItem);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 sm:py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors text-left rounded-lg sm:rounded ${
                  isMobile ? 'min-h-[44px] text-sm' : 'text-xs'
                }`}
              >
                <Files className="w-4 h-4 text-zinc-400 shrink-0" />
                <span>Duplicate</span>
              </button>
              <button
                onClick={() => {
                  onClose();
                  onRename(targetItem);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 sm:py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors text-left rounded-lg sm:rounded ${
                  isMobile ? 'min-h-[44px] text-sm' : 'text-xs'
                }`}
              >
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-4 h-4 text-zinc-400 shrink-0" />
                  <span>Rename</span>
                </div>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono hidden sm:inline">F2</span>
              </button>
              <button
                onClick={() => {
                  onClose();
                  onChmod(targetItem);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 sm:py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors text-left rounded-lg sm:rounded ${
                  isMobile ? 'min-h-[44px] text-sm' : 'text-xs'
                }`}
              >
                <ShieldAlert className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                <span>Permissions (chmod)</span>
              </button>
            </>
          )}

          <button
            onClick={() => {
              onClose();
              onArchive();
            }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 sm:py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors text-left rounded-lg sm:rounded ${
              isMobile ? 'min-h-[44px] text-sm' : 'text-xs'
            }`}
          >
            <Archive className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Compress to Archive</span>
          </button>

          <div className="my-1 border-t border-zinc-200 dark:border-zinc-800/80" />

          {/* Delete actions */}
          <button
            onClick={() => {
              onClose();
              onTrash(isMultiple ? null : targetItem);
            }}
            className={`w-full flex items-center justify-between px-3 py-2.5 sm:py-1.5 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors text-left text-zinc-700 dark:text-zinc-300 rounded-lg sm:rounded ${
              isMobile ? 'min-h-[44px] text-sm' : 'text-xs'
            }`}
          >
            <div className="flex items-center gap-3">
              <Trash2 className="w-4 h-4 text-zinc-400 group-hover:text-red-500 shrink-0" />
              <span>Move to Trash</span>
            </div>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono hidden sm:inline">Del</span>
          </button>
          <button
            onClick={() => {
              onClose();
              onPermanentDelete(isMultiple ? null : targetItem);
            }}
            className={`w-full flex items-center justify-between px-3 py-2.5 sm:py-1.5 hover:bg-red-500/20 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors text-left rounded-lg sm:rounded ${
              isMobile ? 'min-h-[44px] text-sm' : 'text-xs'
            }`}
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Delete Permanently</span>
            </div>
            <span className="text-[10px] text-red-500/60 font-mono hidden sm:inline">Shift+Del</span>
          </button>
        </>
      ) : (
        /* Empty space context menu */
        <>
          <button
            onClick={() => {
              onClose();
              onCreateFolder();
            }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 sm:py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors text-left rounded-lg sm:rounded ${
              isMobile ? 'min-h-[44px] text-sm' : 'text-xs'
            }`}
          >
            <FolderPlus className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>New Folder</span>
          </button>
          <button
            onClick={() => {
              onClose();
              onCreateFile();
            }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 sm:py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors text-left rounded-lg sm:rounded ${
              isMobile ? 'min-h-[44px] text-sm' : 'text-xs'
            }`}
          >
            <FilePlus className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>New File</span>
          </button>

          {clipboardCount > 0 && (
            <button
              onClick={() => {
                onClose();
                onPaste();
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 sm:py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 hover:text-zinc-900 dark:hover:text-white transition-colors text-left text-emerald-600 dark:text-emerald-400 font-medium rounded-lg sm:rounded ${
                isMobile ? 'min-h-[44px] text-sm' : 'text-xs'
              }`}
            >
              <div className="flex items-center gap-3">
                <Clipboard className="w-4 h-4 shrink-0" />
                <span>
                  {clipboardAction} ({clipboardCount} item{clipboardCount > 1 ? 's' : ''})
                </span>
              </div>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono hidden sm:inline">Ctrl+V</span>
            </button>
          )}

          <div className="my-1 border-t border-zinc-200 dark:border-zinc-800/80" />

          <button
            onClick={() => {
              onClose();
              onRefresh();
            }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 sm:py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors text-left rounded-lg sm:rounded ${
              isMobile ? 'min-h-[44px] text-sm' : 'text-xs'
            }`}
          >
            <RefreshCw className="w-4 h-4 text-zinc-400 shrink-0" />
            <span>Refresh Folder</span>
          </button>
        </>
      )}
    </div>
  );

  // Mobile Bottom Sheet Mode
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 bg-black/40 dark:bg-black/75 backdrop-blur-sm flex flex-col justify-end p-0 animate-in fade-in duration-150 select-none">
        <div
          ref={menuRef}
          className="w-full max-h-[85vh] bg-white dark:bg-[#0e1217] border-t border-zinc-200 dark:border-zinc-800 rounded-t-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200"
        >
          {/* Top Pull Handle Indicator */}
          <div className="pt-3 pb-1 flex justify-center cursor-grab">
            <div className="w-12 h-1.5 bg-zinc-300 dark:bg-zinc-700 rounded-full" />
          </div>

          {/* Scrollable Action List */}
          <div className="overflow-y-auto px-3 py-2 space-y-1">{renderActions()}</div>

          {/* Bottom Cancel Button */}
          <div className="p-3 border-t border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/80 dark:bg-zinc-950/60 pb-safe">
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 active:bg-zinc-300 dark:active:bg-zinc-800/80 text-zinc-800 dark:text-zinc-300 font-medium rounded-xl text-sm min-h-[48px] flex items-center justify-center border border-zinc-300 dark:border-zinc-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Desktop Floating Cursor Menu
  return (
    <div
      ref={menuRef}
      style={style}
      className="fixed z-50 w-60 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-2xl py-1.5 text-xs text-zinc-800 dark:text-zinc-200 select-none animate-in fade-in zoom-in-95 duration-100 font-sans"
    >
      {renderActions()}
    </div>
  );
}

import React from 'react';
import {
  Folder,
  FolderOpen,
  FileText,
  Code,
  Terminal,
  Braces,
  Image,
  Archive,
  FileSpreadsheet,
  Film,
  Music,
  Binary,
  Database,
  File
} from 'lucide-react';

export function getFileExtension(filename = '') {
  if (typeof filename !== 'string') return '';
  const parts = filename.split('.');
  if (parts.length <= 1) return '';
  // Check for multi-part extensions like .tar.gz
  if (parts.length > 2) {
    const doubleExt = parts.slice(-2).join('.').toLowerCase();
    if (['tar.gz', 'tar.bz2', 'tar.xz'].includes(doubleExt)) {
      return doubleExt;
    }
  }
  return parts.pop().toLowerCase();
}

export function isImageFile(filename = '') {
  const ext = getFileExtension(filename);
  return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif'].includes(ext);
}

export function isPdfFile(filename = '') {
  const ext = getFileExtension(filename);
  return ext === 'pdf';
}

export function isArchiveFile(filename = '') {
  const ext = getFileExtension(filename);
  return ['zip', 'tar', 'gz', 'tar.gz', 'tgz', 'bz2', 'tar.bz2', 'xz', 'tar.xz', 'rar', '7z', 'iso'].includes(ext);
}

export function isCodeOrTextFile(filename = '') {
  const ext = getFileExtension(filename);
  const codeExts = [
    'js', 'jsx', 'mjs', 'cjs',
    'ts', 'tsx', 'mts', 'cts',
    'py', 'pyw',
    'sh', 'bash', 'zsh', 'ksh',
    'json', 'jsonc',
    'yml', 'yaml', 'toml', 'xml',
    'html', 'htm', 'css', 'scss', 'sass', 'less',
    'sql',
    'md', 'markdown',
    'dockerfile', 'conf', 'ini', 'env', 'cfg',
    'rs', 'go', 'c', 'h', 'cpp', 'hpp', 'java', 'php', 'rb', 'lua',
    'txt', 'log', 'csv', 'tsv'
  ];
  return codeExts.includes(ext) || filename.toLowerCase().startsWith('dockerfile');
}

/**
 * Returns a styled Lucide icon element based on filename and directory state.
 * @param {string|object} filenameOrItem 
 * @param {boolean} [isDirectory]
 * @param {string} [className]
 */
export function getFileIcon(filenameOrItem, isDirectory = false, className = 'w-4 h-4') {
  let name = '';
  let isDir = isDirectory;
  let isExec = false;

  if (typeof filenameOrItem === 'object' && filenameOrItem !== null) {
    name = filenameOrItem.name || filenameOrItem.path || '';
    if (filenameOrItem.isDirectory !== undefined) isDir = filenameOrItem.isDirectory;
    if (filenameOrItem.permissions && filenameOrItem.permissions.includes('x')) isExec = true;
  } else if (typeof filenameOrItem === 'string') {
    name = filenameOrItem;
  }

  if (isDir) {
    return <Folder className={`${className} text-emerald-400 fill-emerald-400/20 flex-shrink-0`} />;
  }

  const ext = getFileExtension(name);

  // 1. Code / Scripts
  if (['js', 'jsx', 'ts', 'tsx', 'vue', 'svelte'].includes(ext)) {
    return <Code className={`${className} text-amber-400 flex-shrink-0`} />;
  }
  if (['py', 'pyw'].includes(ext)) {
    return <Code className={`${className} text-blue-400 flex-shrink-0`} />;
  }
  if (['sh', 'bash', 'zsh', 'ksh'].includes(ext) || (isExec && !ext)) {
    return <Terminal className={`${className} text-emerald-400 flex-shrink-0`} />;
  }
  if (['json', 'jsonc', 'yml', 'yaml', 'toml', 'xml'].includes(ext)) {
    return <Braces className={`${className} text-teal-400 flex-shrink-0`} />;
  }
  if (['html', 'htm', 'css', 'scss', 'sass', 'less'].includes(ext)) {
    return <Code className={`${className} text-orange-400 flex-shrink-0`} />;
  }
  if (['sql', 'db', 'sqlite', 'sqlite3'].includes(ext)) {
    return <Database className={`${className} text-indigo-400 flex-shrink-0`} />;
  }
  if (['rs', 'go', 'c', 'h', 'cpp', 'hpp', 'java', 'php', 'rb', 'lua'].includes(ext)) {
    return <Code className={`${className} text-cyan-400 flex-shrink-0`} />;
  }

  // 2. Images
  if (isImageFile(name)) {
    return <Image className={`${className} text-purple-400 flex-shrink-0`} />;
  }

  // 3. Archives
  if (isArchiveFile(name)) {
    return <Archive className={`${className} text-amber-500 flex-shrink-0`} />;
  }

  // 4. Documents & Spreadsheets
  if (ext === 'pdf') {
    return <FileText className={`${className} text-rose-400 flex-shrink-0`} />;
  }
  if (['csv', 'tsv', 'xls', 'xlsx'].includes(ext)) {
    return <FileSpreadsheet className={`${className} text-emerald-500 flex-shrink-0`} />;
  }
  if (['md', 'markdown', 'txt', 'log', 'conf', 'ini', 'env', 'cfg'].includes(ext)) {
    return <FileText className={`${className} text-zinc-300 flex-shrink-0`} />;
  }

  // 5. Media (Audio / Video)
  if (['mp4', 'mkv', 'webm', 'mov', 'avi'].includes(ext)) {
    return <Film className={`${className} text-fuchsia-400 flex-shrink-0`} />;
  }
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(ext)) {
    return <Music className={`${className} text-green-400 flex-shrink-0`} />;
  }

  // 6. Binary / Executable
  if (['bin', 'so', 'dll', 'exe', 'elf', 'o'].includes(ext)) {
    return <Binary className={`${className} text-rose-300 flex-shrink-0`} />;
  }

  // 7. Default Generic File
  return <File className={`${className} text-zinc-400 flex-shrink-0`} />;
}

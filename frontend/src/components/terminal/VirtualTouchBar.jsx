import React, { useState } from 'react';
import {
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Slash,
  Minus,
  Hash,
  Terminal as TermIcon
} from 'lucide-react';

export default function VirtualTouchBar({ onSendInput, onFocusTerminal }) {
  const [ctrlActive, setCtrlActive] = useState(false);
  const [altActive, setAltActive] = useState(false);

  const triggerHaptic = () => {
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(10);
    }
  };

  const handleKey = (data) => {
    triggerHaptic();
    let payload = data;

    if (ctrlActive) {
      if (typeof data === 'string' && data.length === 1) {
        const charCode = data.toUpperCase().charCodeAt(0);
        if (charCode >= 64 && charCode <= 95) {
          payload = String.fromCharCode(charCode - 64);
        }
      }
      setCtrlActive(false);
    } else if (altActive) {
      payload = '\x1B' + data;
      setAltActive(false);
    }

    if (onSendInput) {
      onSendInput(payload);
    }
    if (onFocusTerminal) {
      onFocusTerminal();
    }
  };

  const toggleCtrl = () => {
    triggerHaptic();
    setCtrlActive((prev) => !prev);
  };

  const toggleAlt = () => {
    triggerHaptic();
    setAltActive((prev) => !prev);
  };

  const buttons = [
    { label: 'ESC', action: () => handleKey('\x1B'), highlight: false },
    { label: 'TAB', action: () => handleKey('\x09'), highlight: false },
    {
      label: 'CTRL',
      action: toggleCtrl,
      isActive: ctrlActive,
      isToggle: true
    },
    {
      label: 'ALT',
      action: toggleAlt,
      isActive: altActive,
      isToggle: true
    },
    { label: '^C', action: () => handleKey('\x03'), title: 'Interrupt (Ctrl+C)', highlight: true, color: 'text-amber-400 hover:text-amber-300' },
    { label: '^D', action: () => handleKey('\x04'), title: 'EOF / Logout (Ctrl+D)' },
    { label: '^Z', action: () => handleKey('\x1A'), title: 'Suspend (Ctrl+Z)' },
    { label: '^L', action: () => handleKey('\x0C'), title: 'Clear Screen (Ctrl+L)' },
    { label: '↑', icon: ArrowUp, action: () => handleKey('\x1B[A'), title: 'History Prev' },
    { label: '↓', icon: ArrowDown, action: () => handleKey('\x1B[B'), title: 'History Next' },
    { label: '←', icon: ArrowLeft, action: () => handleKey('\x1B[D'), title: 'Cursor Left' },
    { label: '→', icon: ArrowRight, action: () => handleKey('\x1B[C'), title: 'Cursor Right' },
    { label: '|', action: () => handleKey('|'), title: 'Pipe' },
    { label: '/', action: () => handleKey('/'), title: 'Slash' },
    { label: '-', action: () => handleKey('-'), title: 'Dash' },
    { label: '~', action: () => handleKey('~'), title: 'Home' },
    { label: '>', action: () => handleKey('>'), title: 'Redirect' },
    { label: '$', action: () => handleKey('$'), title: 'Env Var' },
    { label: '&', action: () => handleKey('&'), title: 'Background' },
    { label: ';', action: () => handleKey(';'), title: 'Sequence' },
    {
      label: 'ENTER',
      icon: CornerDownLeft,
      action: () => handleKey('\r'),
      highlight: true,
      color: 'bg-emerald-600/30 text-emerald-300 border-emerald-500/40 hover:bg-emerald-600/50'
    }
  ];

  return (
    <div className="w-full bg-zinc-100 dark:bg-[#0d1117] border-t border-zinc-200 dark:border-zinc-800/80 px-2 py-1.5 flex items-center gap-1.5 overflow-x-auto select-none no-scrollbar shadow-inner transition-colors">
      <div className="flex items-center gap-1 text-[10px] font-mono text-zinc-500 dark:text-zinc-400 px-1 shrink-0">
        <TermIcon className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
        <span className="hidden sm:inline">TOUCH</span>
      </div>

      <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-800 shrink-0 mx-0.5" />

      {buttons.map((btn, idx) => {
        const Icon = btn.icon;
        const isToggled = btn.isActive;

        let btnClass = `shrink-0 px-2.5 py-1 text-xs font-mono rounded transition-all duration-150 flex items-center justify-center gap-1 border active:scale-95 `;

        if (btn.isToggle) {
          btnClass += isToggled
            ? 'bg-emerald-500 text-black font-bold border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
            : 'bg-white hover:bg-zinc-200 dark:bg-zinc-800/90 dark:hover:bg-zinc-700/80 text-zinc-800 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700/60';
        } else if (btn.color) {
          btnClass += `bg-white dark:bg-zinc-800/90 border-zinc-300 dark:border-zinc-700/60 ${btn.color}`;
        } else {
          btnClass += 'bg-white hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700/90 text-zinc-800 dark:text-zinc-200 border-zinc-300 dark:border-zinc-700/60 hover:text-zinc-950 dark:hover:text-white';
        }

        return (
          <button
            key={idx}
            type="button"
            onClick={btn.action}
            title={btn.title || btn.label}
            className={btnClass}
          >
            {Icon && <Icon className="w-3 h-3" />}
            {btn.label && <span>{btn.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

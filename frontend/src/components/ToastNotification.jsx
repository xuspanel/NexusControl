import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export default function ToastNotification({ toast, onClose }) {
  if (!toast) return null;

  const isSuccess = toast.type === 'success';
  const isError = toast.type === 'error';

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-5 duration-200">
      <div className={`flex items-center space-x-3 px-4 py-3 rounded-lg shadow-2xl border text-xs font-mono ${
        isSuccess
          ? 'bg-zinc-900 border-emerald-500/30 text-emerald-300'
          : isError
          ? 'bg-zinc-900 border-rose-500/30 text-rose-300'
          : 'bg-zinc-900 border-sky-500/30 text-sky-300'
      }`}>
        {isSuccess && <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
        {isError && <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />}
        {!isSuccess && !isError && <Info className="w-4 h-4 text-sky-400 flex-shrink-0" />}
        
        <span>{toast.message}</span>

        <button 
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300 p-0.5 ml-2"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Folder, Loader2 } from 'lucide-react';

export default function PathAutocomplete({
  value = '',
  onChange,
  token,
  placeholder = '/var/www/...',
  disabled = false,
  autoFocus = false,
  className = '',
  onEnterSubmit
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const itemRefs = useRef([]);

  // Fetch directory suggestions from backend
  const fetchSuggestions = useCallback(
    async (query) => {
      if (!token) return;
      setIsLoading(true);
      try {
        const res = await fetch(`/api/files/autocomplete?query=${encodeURIComponent(query || '/')}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setSuggestions(data);
            setIsOpen(data.length > 0);
            setSelectedIndex(-1);
          }
        }
      } catch {
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    },
    [token]
  );

  // Debounced input change handler
  const handleInputChange = (e) => {
    const newVal = e.target.value;
    onChange?.(newVal);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchSuggestions(newVal);
    }, 200);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  // Scroll active item into view
  useEffect(() => {
    if (selectedIndex >= 0 && itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex].scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      });
    }
  }, [selectedIndex]);

  // Handle suggestion selection
  const handleSelectSuggestion = (path) => {
    // Add trailing slash for directories to ease further navigation
    const formatted = path.endsWith('/') ? path : `${path}/`;
    onChange?.(formatted);
    inputRef.current?.focus();
    // Re-fetch child directories immediately
    fetchSuggestions(formatted);
  };

  // Keyboard navigation inside dropdown
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen && suggestions.length > 0) {
        setIsOpen(true);
        setSelectedIndex(0);
      } else if (suggestions.length > 0) {
        setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isOpen && suggestions.length > 0) {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
      }
    } else if (e.key === 'Enter') {
      if (isOpen && selectedIndex >= 0 && suggestions[selectedIndex]) {
        e.preventDefault();
        handleSelectSuggestion(suggestions[selectedIndex]);
      } else if (onEnterSubmit) {
        // Dropdown closed or no item selected: allow form submission
        onEnterSubmit(e);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    } else if (e.key === 'Tab') {
      if (isOpen && suggestions.length > 0) {
        e.preventDefault();
        const target = selectedIndex >= 0 ? suggestions[selectedIndex] : suggestions[0];
        handleSelectSuggestion(target);
      }
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <div className="relative flex items-center">
        <Folder className="absolute left-3 w-4 h-4 text-zinc-400 dark:text-zinc-500 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={() => {
            if (value) fetchSuggestions(value);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          className="w-full pl-9 pr-9 py-2 text-xs font-mono rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors"
        />
        {isLoading && (
          <div className="absolute right-3">
            <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
          </div>
        )}
      </div>

      {/* Floating Suggestions Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-lg shadow-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 py-1 font-mono text-xs divide-y divide-zinc-100 dark:divide-zinc-800/40">
          {suggestions.map((dirPath, idx) => {
            const isHighlighted = idx === selectedIndex;
            return (
              <li
                key={dirPath}
                ref={(el) => (itemRefs.current[idx] = el)}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent input blur
                  handleSelectSuggestion(dirPath);
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`px-3 py-2 flex items-center gap-2 cursor-pointer transition-colors ${
                  isHighlighted
                    ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 font-medium'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                }`}
              >
                <Folder className="w-3.5 h-3.5 shrink-0 text-blue-500/80" />
                <span className="truncate">{dirPath}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

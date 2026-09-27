import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Table,
  ArrowLeft,
  RefreshCw,
  Search,
  Filter,
  Download,
  Trash2,
  Plus,
  Key,
  Check,
  X,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Layers,
  FileCode,
  FileSpreadsheet,
  CheckSquare,
  Square,
  ShieldAlert,
  Database
} from 'lucide-react';

export default function TableDataGrid({ token, dbName, tableName, schema = 'public', onBack, onShowToast }) {
  const [activeTab, setActiveTab] = useState('data'); // 'data' | 'config'
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Data view state
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [pageLimit, setPageLimit] = useState(50);
  const [pageOffset, setPageOffset] = useState(0);
  const [orderBy, setOrderBy] = useState(null);
  const [orderDir, setOrderDir] = useState('ASC');

  // Schema config state
  const [columnsConfig, setColumnsConfig] = useState([]);
  const [primaryKeyCols, setPrimaryKeyCols] = useState([]);

  // Selection & Inline editing
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [editingCell, setEditingCell] = useState(null); // { rowIndex, colName, originalVal }
  const [editValue, setEditValue] = useState('');
  const [isSavingCell, setIsSavingCell] = useState(false);
  const [savedCellPulse, setSavedCellPulse] = useState(null); // 'rowIndex-colName'

  // Delete modal
  const [isDeletingRows, setIsDeletingRows] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Quick filter
  const [filterText, setFilterText] = useState('');

  const authHeaders = useMemo(() => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }), [token]);

  // 1. Fetch table columns configuration (schema)
  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/postgres/databases/${encodeURIComponent(dbName)}/tables/${encodeURIComponent(tableName)}/config?schema=${encodeURIComponent(schema)}`,
        { headers: authHeaders }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        setColumnsConfig(data.columns || []);
        const pks = data.columns.filter(c => c.is_primary_key).map(c => c.column_name);
        setPrimaryKeyCols(pks);
      }
    } catch (err) {
      console.error('[TableDataGrid] Failed to fetch table schema:', err);
    }
  }, [dbName, tableName, schema, authHeaders]);

  // 2. Fetch table rows (data)
  const fetchData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      let url = `/api/postgres/databases/${encodeURIComponent(dbName)}/tables/${encodeURIComponent(tableName)}/data?schema=${encodeURIComponent(schema)}&limit=${pageLimit}&offset=${pageOffset}`;
      if (orderBy) {
        url += `&orderBy=${encodeURIComponent(orderBy)}&orderDir=${orderDir}`;
      }

      const res = await fetch(url, { headers: authHeaders });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch table data');
      }

      setRows(data.rows || []);
      setColumns(data.columns || []);
      setTotalRows(data.total || 0);
      setSelectedRows(new Set());
    } catch (err) {
      console.error('[TableDataGrid] Data fetch error:', err);
      setError(err.message || 'Error loading table data');
      if (isManual && onShowToast) {
        onShowToast(err.message || 'Error refreshing table', 'error');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dbName, tableName, schema, pageLimit, pageOffset, orderBy, orderDir, authHeaders, onShowToast]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  // Handle column header sort
  const handleSort = (col) => {
    if (orderBy === col) {
      if (orderDir === 'ASC') {
        setOrderDir('DESC');
      } else {
        setOrderBy(null);
        setOrderDir('ASC');
      }
    } else {
      setOrderBy(col);
      setOrderDir('ASC');
    }
    setPageOffset(0);
  };

  // Start inline cell edit
  const startEditing = (rowIndex, colName, currentVal) => {
    setEditingCell({ rowIndex, colName, originalVal: currentVal });
    setEditValue(currentVal === null || currentVal === undefined ? '' : String(currentVal));
  };

  // Commit inline cell edit
  const saveCellEdit = async () => {
    if (!editingCell) return;
    const { rowIndex, colName, originalVal } = editingCell;

    if (String(originalVal) === editValue) {
      setEditingCell(null);
      return;
    }

    setIsSavingCell(true);
    const targetRow = rows[rowIndex];

    // Build primaryKeys object dynamically
    const primaryKeys = {};
    if (primaryKeyCols.length > 0) {
      for (const pk of primaryKeyCols) {
        primaryKeys[pk] = targetRow[pk];
      }
    } else {
      // Fallback: use all existing column values to target the exact row
      for (const col of columns) {
        primaryKeys[col] = targetRow[col];
      }
    }

    try {
      const res = await fetch(
        `/api/postgres/databases/${encodeURIComponent(dbName)}/tables/${encodeURIComponent(tableName)}/data`,
        {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify({
            schema,
            primaryKeys,
            updates: { [colName]: editValue === '' ? null : editValue }
          })
        }
      );

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save cell update');
      }

      // Update row in state
      setRows(prev => {
        const next = [...prev];
        next[rowIndex] = { ...next[rowIndex], [colName]: editValue === '' ? null : editValue };
        return next;
      });

      setSavedCellPulse(`${rowIndex}-${colName}`);
      setTimeout(() => setSavedCellPulse(null), 2000);
      setEditingCell(null);

      if (onShowToast) {
        onShowToast(`Updated "${colName}" in row #${rowIndex + 1}`, 'success');
      }
    } catch (err) {
      console.error('[TableDataGrid] Update error:', err);
      if (onShowToast) {
        onShowToast(err.message || 'Cell update rejected by database', 'error');
      }
    } finally {
      setIsSavingCell(false);
    }
  };

  // Handle bulk delete of selected rows
  const handleDeleteSelected = async () => {
    if (selectedRows.size === 0) return;
    setIsDeletingRows(true);

    try {
      let deletedCount = 0;
      for (const idx of selectedRows) {
        const row = rows[idx];
        if (!row) continue;

        const primaryKeys = {};
        if (primaryKeyCols.length > 0) {
          for (const pk of primaryKeyCols) {
            primaryKeys[pk] = row[pk];
          }
        } else {
          for (const col of columns) {
            primaryKeys[col] = row[col];
          }
        }

        const res = await fetch(
          `/api/postgres/databases/${encodeURIComponent(dbName)}/tables/${encodeURIComponent(tableName)}/data`,
          {
            method: 'DELETE',
            headers: authHeaders,
            body: JSON.stringify({ schema, primaryKeys })
          }
        );
        if (res.ok) deletedCount++;
      }

      if (onShowToast) {
        onShowToast(`Deleted ${deletedCount} row(s) successfully`, 'success');
      }

      setShowDeleteModal(false);
      setSelectedRows(new Set());
      fetchData(false);
    } catch (err) {
      console.error('[TableDataGrid] Bulk delete error:', err);
      if (onShowToast) {
        onShowToast(err.message || 'Failed to delete rows', 'error');
      }
    } finally {
      setIsDeletingRows(false);
    }
  };

  // Client-side export CSV
  const exportAsCsv = () => {
    if (!rows.length) return;
    const header = columns.map(c => `"${c.replace(/"/g, '""')}"`).join(',');
    const csvRows = rows.map(r =>
      columns.map(c => {
        const val = r[c];
        if (val === null || val === undefined) return '""';
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(',')
    );
    const csvContent = [header, ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${dbName}_${tableName}_page_${Math.floor(pageOffset / pageLimit) + 1}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Client-side export JSON
  const exportAsJson = () => {
    if (!rows.length) return;
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${dbName}_${tableName}_page_${Math.floor(pageOffset / pageLimit) + 1}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered rows in current page
  const displayedRows = useMemo(() => {
    if (!filterText.trim()) return rows;
    const q = filterText.toLowerCase();
    return rows.filter(r =>
      Object.values(r).some(v => v !== null && v !== undefined && String(v).toLowerCase().includes(q))
    );
  }, [rows, filterText]);

  const currentPage = Math.floor(pageOffset / pageLimit) + 1;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageLimit));
  const isAllSelected = displayedRows.length > 0 && selectedRows.size === displayedRows.length;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(displayedRows.map((_, i) => i)));
    }
  };

  const toggleSelectRow = (index) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* 1. Header Toolbar & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition-colors cursor-pointer"
            title="Return to Database Overview"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-500">
              <span>{dbName}</span>
              <span>/</span>
              <span>{schema}</span>
              <span>/</span>
              <span className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                <Table className="w-3.5 h-3.5 text-cyan-500" />
                {tableName}
              </span>
            </div>
            <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
              {totalRows.toLocaleString()} row(s) total • {columns.length} columns
              {primaryKeyCols.length > 0 && ` • PK: (${primaryKeyCols.join(', ')})`}
            </div>
          </div>
        </div>

        {/* View Toggle & Actions */}
        <div className="flex items-center gap-2">
          {/* Sub-view switcher */}
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <button
              onClick={() => setActiveTab('data')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'data'
                  ? 'bg-white dark:bg-zinc-800 text-cyan-600 dark:text-cyan-400 shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>Data View</span>
            </button>
            <button
              onClick={() => setActiveTab('config')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'config'
                  ? 'bg-white dark:bg-zinc-800 text-cyan-600 dark:text-cyan-400 shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Schema ({columnsConfig.length})</span>
            </button>
          </div>

          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition-colors cursor-pointer"
            title="Refresh rows"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. Main View Content */}
      {activeTab === 'data' ? (
        <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-xs space-y-0">
          {/* Action Toolbar */}
          <div className="p-3 sm:p-4 border-b border-zinc-200/80 dark:border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 bg-zinc-50/50 dark:bg-zinc-900/30">
            {/* Quick in-page filter */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Filter loaded rows..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            {/* Bulk actions & exports */}
            <div className="flex items-center gap-2 self-end sm:self-auto">
              {selectedRows.size > 0 && (
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500 hover:text-white transition-all cursor-pointer animate-in fade-in"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Selected ({selectedRows.size})</span>
                </button>
              )}

              <div className="flex items-center gap-1 border border-zinc-200 dark:border-zinc-800 rounded-xl p-0.5 bg-white dark:bg-zinc-900">
                <button
                  onClick={exportAsCsv}
                  disabled={rows.length === 0}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40"
                  title="Export current page as CSV"
                >
                  <FileSpreadsheet className="w-3 h-3 text-emerald-500" />
                  <span>CSV</span>
                </button>
                <button
                  onClick={exportAsJson}
                  disabled={rows.length === 0}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40"
                  title="Export current page as JSON"
                >
                  <FileCode className="w-3 h-3 text-cyan-500" />
                  <span>JSON</span>
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Data Table with Inline Cell Editing */}
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto select-none">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead className="sticky top-0 z-10 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 text-[11px]">
                <tr>
                  <th className="py-2.5 px-3 w-10 text-center">
                    <button onClick={toggleSelectAll} className="cursor-pointer">
                      {isAllSelected ? (
                        <CheckSquare className="w-4 h-4 text-cyan-500" />
                      ) : (
                        <Square className="w-4 h-4 text-zinc-400" />
                      )}
                    </button>
                  </th>
                  <th className="py-2.5 px-2 w-12 text-zinc-400 font-semibold text-center">#</th>
                  {columns.map(col => {
                    const isPk = primaryKeyCols.includes(col);
                    const isSorted = orderBy === col;
                    return (
                      <th
                        key={col}
                        onClick={() => handleSort(col)}
                        className="py-2.5 px-3 font-semibold hover:bg-zinc-200/60 dark:hover:bg-zinc-800/80 cursor-pointer transition-colors whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5">
                          {isPk && <Key className="w-3 h-3 text-amber-500" title="Primary Key" />}
                          <span className={isPk ? 'text-amber-500 font-bold' : ''}>{col}</span>
                          {isSorted ? (
                            orderDir === 'ASC' ? (
                              <ArrowUp className="w-3 h-3 text-cyan-500" />
                            ) : (
                              <ArrowDown className="w-3 h-3 text-cyan-500" />
                            )
                          ) : (
                            <ArrowUpDown className="w-2.5 h-2.5 opacity-30 group-hover:opacity-100" />
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                {loading ? (
                  <tr>
                    <td colSpan={columns.length + 2} className="py-12 text-center text-zinc-400">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-cyan-500" />
                        <span>Fetching records...</span>
                      </div>
                    </td>
                  </tr>
                ) : displayedRows.length > 0 ? (
                  displayedRows.map((row, rowIndex) => {
                    const isSelected = selectedRows.has(rowIndex);
                    return (
                      <tr
                        key={rowIndex}
                        className={`transition-colors ${
                          isSelected
                            ? 'bg-cyan-500/10'
                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/40'
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-2 px-3 text-center">
                          <button onClick={() => toggleSelectRow(rowIndex)} className="cursor-pointer">
                            {isSelected ? (
                              <CheckSquare className="w-3.5 h-3.5 text-cyan-500" />
                            ) : (
                              <Square className="w-3.5 h-3.5 text-zinc-400" />
                            )}
                          </button>
                        </td>

                        {/* Row Index */}
                        <td className="py-2 px-2 text-center text-[10px] text-zinc-400 font-sans">
                          {pageOffset + rowIndex + 1}
                        </td>

                        {/* Dynamic Columns */}
                        {columns.map(col => {
                          const val = row[col];
                          const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.colName === col;
                          const cellId = `${rowIndex}-${col}`;
                          const isPulse = savedCellPulse === cellId;

                          return (
                            <td
                              key={col}
                              onDoubleClick={() => startEditing(rowIndex, col, val)}
                              className={`py-2 px-3 whitespace-nowrap transition-colors relative ${
                                isPulse ? 'bg-emerald-500/20 text-emerald-400 font-bold' : ''
                              }`}
                              title="Double click to edit cell"
                            >
                              {isEditing ? (
                                <div className="flex items-center gap-1 min-w-[120px]">
                                  <input
                                    type="text"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveCellEdit();
                                      if (e.key === 'Escape') setEditingCell(null);
                                    }}
                                    autoFocus
                                    className="w-full px-2 py-0.5 rounded text-xs bg-white dark:bg-black border border-cyan-500 text-zinc-900 dark:text-zinc-100 font-mono focus:outline-none shadow-xs"
                                  />
                                  <button
                                    onClick={saveCellEdit}
                                    disabled={isSavingCell}
                                    className="p-1 text-emerald-500 hover:text-emerald-400 cursor-pointer"
                                  >
                                    {isSavingCell ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                  </button>
                                  <button
                                    onClick={() => setEditingCell(null)}
                                    className="p-1 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <div className="cursor-text group-hover:text-zinc-200">
                                  {val === null || val === undefined ? (
                                    <span className="text-zinc-400 italic text-[10px]">NULL</span>
                                  ) : typeof val === 'object' ? (
                                    <span className="text-purple-400">{JSON.stringify(val)}</span>
                                  ) : typeof val === 'boolean' ? (
                                    <span className={val ? 'text-emerald-400' : 'text-rose-400'}>
                                      {String(val)}
                                    </span>
                                  ) : (
                                    <span className="text-zinc-800 dark:text-zinc-200">{String(val)}</span>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={columns.length + 2} className="py-12 text-center text-zinc-500 font-sans">
                      {filterText ? `No rows matching filter "${filterText}".` : 'Table contains zero records.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="p-3 sm:p-4 border-t border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-zinc-500 bg-zinc-50/50 dark:bg-zinc-900/30">
            <div className="flex items-center gap-3">
              <span>Rows per page:</span>
              <select
                value={pageLimit}
                onChange={(e) => {
                  setPageLimit(Number(e.target.value));
                  setPageOffset(0);
                }}
                className="px-2 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-mono text-xs focus:outline-none"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
              </select>
              <span>
                Showing {totalRows === 0 ? 0 : pageOffset + 1} - {Math.min(pageOffset + pageLimit, totalRows)} of {totalRows.toLocaleString()}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPageOffset(0)}
                disabled={pageOffset === 0}
                className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
                title="First Page"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setPageOffset(prev => Math.max(0, prev - pageLimit))}
                disabled={pageOffset === 0}
                className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
                title="Previous Page"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <span className="px-3 py-1 font-bold text-zinc-700 dark:text-zinc-300">
                Page {currentPage} of {totalPages}
              </span>

              <button
                onClick={() => setPageOffset(prev => prev + pageLimit)}
                disabled={pageOffset + pageLimit >= totalRows}
                className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
                title="Next Page"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setPageOffset((totalPages - 1) * pageLimit)}
                disabled={pageOffset + pageLimit >= totalRows}
                className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
                title="Last Page"
              >
                <ChevronsRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Config View (Schema Introspection) */
        <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-xs">
          <div className="p-4 border-b border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-cyan-500" />
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Table Schema & Column Definitions
              </h3>
            </div>
            <span className="text-xs font-mono text-zinc-500">{columnsConfig.length} columns defined</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-900/40 text-zinc-500 dark:text-zinc-400 text-[11px]">
                  <th className="py-2.5 px-4 font-semibold">#</th>
                  <th className="py-2.5 px-4 font-semibold">Column Name</th>
                  <th className="py-2.5 px-4 font-semibold">Data Type</th>
                  <th className="py-2.5 px-4 font-semibold">Nullable</th>
                  <th className="py-2.5 px-4 font-semibold">Default</th>
                  <th className="py-2.5 px-4 font-semibold">Key Constraint</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                {columnsConfig.map((col, idx) => (
                  <tr key={col.column_name} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30">
                    <td className="py-2.5 px-4 text-zinc-400 font-sans">{idx + 1}</td>
                    <td className="py-2.5 px-4 font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                      {col.is_primary_key && <Key className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                      <span>{col.column_name}</span>
                    </td>
                    <td className="py-2.5 px-4 text-cyan-600 dark:text-cyan-400">
                      {col.data_type}
                      {col.character_maximum_length && `(${col.character_maximum_length})`}
                    </td>
                    <td className="py-2.5 px-4">
                      {col.is_nullable === 'YES' ? (
                        <span className="text-emerald-500">NULL</span>
                      ) : (
                        <span className="text-zinc-400 font-semibold">NOT NULL</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-zinc-500 truncate max-w-xs">
                      {col.column_default || <span className="italic opacity-50">None</span>}
                    </td>
                    <td className="py-2.5 px-4">
                      {col.is_primary_key ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                          <Key className="w-2.5 h-2.5" />
                          PRIMARY KEY
                        </span>
                      ) : (
                        <span className="text-zinc-500 text-[11px]">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete Rows Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#16161a] border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  Delete {selectedRows.size} Selected Row(s)?
                </h3>
                <p className="text-xs text-zinc-500">
                  Target Table: <code className="text-zinc-300 font-mono">{tableName}</code>
                </p>
              </div>
            </div>

            <p className="text-xs text-zinc-500 leading-relaxed">
              This will execute a DELETE statement utilizing the row's primary keys. This action cannot be reversed.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeletingRows}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={isDeletingRows}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeletingRows ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

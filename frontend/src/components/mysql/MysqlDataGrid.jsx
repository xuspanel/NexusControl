import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Table,
  ArrowLeft,
  RefreshCw,
  Search,
  Filter,
  Download,
  Upload,
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
  Database,
  RotateCcw,
  Copy,
  Edit3,
  MessageSquare,
  Sparkles,
  Zap,
  Save,
  HelpCircle
} from 'lucide-react';

const COMMON_MYSQL_TYPES = [
  "int",
  "bigint",
  "tinyint",
  "smallint",
  "mediumint",
  "decimal(10,2)",
  "float",
  "double",
  "varchar(255)",
  "varchar(100)",
  "varchar(50)",
  "char(36)",
  "text",
  "mediumtext",
  "longtext",
  "datetime",
  "timestamp",
  "date",
  "time",
  "json",
  "boolean",
  "blob",
  "enum"
];

export default function MysqlDataGrid({ token, dbName, tableName: initialTableName, schema = 'public', onBack, onShowToast }) {
  const [currentTableName, setCurrentTableName] = useState(initialTableName);
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
  const originalSchemaRef = useRef([]);
  const [schemaDraft, setSchemaDraft] = useState([]);
  const [isSavingSchema, setIsSavingSchema] = useState(false);

  // Selection & Inline editing
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [editingCell, setEditingCell] = useState(null); // { rowIndex, colName, originalVal }
  const [editValue, setEditValue] = useState('');
  const [isSavingCell, setIsSavingCell] = useState(false);
  const [savedCellPulse, setSavedCellPulse] = useState(null); // 'rowIndex-colName'

  // Add Row inline state
  const [isAddingRow, setIsAddingRow] = useState(false);
  const [newRowData, setNewRowData] = useState({});
  const [isSubmittingNewRow, setIsSubmittingNewRow] = useState(false);

  // Modals state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeletingRows, setIsDeletingRows] = useState(false);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importFormat, setImportFormat] = useState('csv'); // 'csv' | 'sql'
  const [importContent, setImportContent] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState('');

  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateInput, setDuplicateInput] = useState('');
  const [isDuplicating, setIsDuplicating] = useState(false);

  const [showTruncateModal, setShowTruncateModal] = useState(false);
  const [confirmTruncateCheck, setConfirmTruncateCheck] = useState(false);
  const [isTruncating, setIsTruncating] = useState(false);

  const [showCommentModal, setShowCommentModal] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [isSavingComment, setIsSavingComment] = useState(false);

  const [isOptimizing, setIsOptimizing] = useState(false);

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
        `/api/mysql/databases/${encodeURIComponent(dbName)}/tables/${encodeURIComponent(currentTableName)}/config?schema=${encodeURIComponent(schema)}`,
        { headers: authHeaders }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        const cols = data.columns || [];
        setColumnsConfig(cols);
        originalSchemaRef.current = JSON.parse(JSON.stringify(cols));

        // Initialize schema draft
        setSchemaDraft(cols.map((c, i) => ({
          id: `col-${i}-${c.column_name}`,
          name: c.column_name,
          originalName: c.column_name,
          type: c.data_type + (c.character_maximum_length ? `(${c.character_maximum_length})` : ''),
          originalType: c.data_type + (c.character_maximum_length ? `(${c.character_maximum_length})` : ''),
          isNullable: c.is_nullable === 'YES',
          originalNullable: c.is_nullable === 'YES',
          defaultValue: c.column_default || '',
          originalDefault: c.column_default || '',
          isPrimaryKey: Boolean(c.is_primary_key),
          comment: c.comment || '',
          originalComment: c.comment || '',
          isDeleted: false,
          isNew: false
        })));

        const pks = cols.filter(c => c.is_primary_key).map(c => c.column_name);
        setPrimaryKeyCols(pks);
      }
    } catch (err) {
      console.error('[MysqlDataGrid] Failed to fetch table schema:', err);
    }
  }, [dbName, currentTableName, schema, authHeaders]);

  // 2. Fetch table rows (data)
  const fetchData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      let url = `/api/mysql/databases/${encodeURIComponent(dbName)}/tables/${encodeURIComponent(currentTableName)}/data?schema=${encodeURIComponent(schema)}&limit=${pageLimit}&offset=${pageOffset}`;
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
      console.error('[MysqlDataGrid] Data fetch error:', err);
      setError(err.message || 'Error loading table data');
      if (isManual && onShowToast) {
        onShowToast(err.message || 'Error refreshing table', 'error');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dbName, currentTableName, schema, pageLimit, pageOffset, orderBy, orderDir, authHeaders, onShowToast]);

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
      for (const col of columns) {
        primaryKeys[col] = targetRow[col];
      }
    }

    try {
      const res = await fetch(
        `/api/mysql/databases/${encodeURIComponent(dbName)}/tables/${encodeURIComponent(currentTableName)}/data`,
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
      console.error('[MysqlDataGrid] Update error:', err);
      if (onShowToast) {
        onShowToast(err.message || 'Cell update rejected by database', 'error');
      }
    } finally {
      setIsSavingCell(false);
    }
  };

  // Add new row submit
  const handleSaveNewRow = async () => {
    setIsSubmittingNewRow(true);
    try {
      const res = await fetch(
        `/api/mysql/databases/${encodeURIComponent(dbName)}/tables/${encodeURIComponent(currentTableName)}/data/row`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ schema, row: newRowData })
        }
      );

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to insert row');
      }

      if (onShowToast) {
        onShowToast('New row created successfully', 'success');
      }

      setIsAddingRow(false);
      setNewRowData({});
      fetchData(false);
    } catch (err) {
      if (onShowToast) {
        onShowToast(err.message || 'Error inserting row', 'error');
      }
    } finally {
      setIsSubmittingNewRow(false);
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
          `/api/mysql/databases/${encodeURIComponent(dbName)}/tables/${encodeURIComponent(currentTableName)}/data`,
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
      console.error('[MysqlDataGrid] Bulk delete error:', err);
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
    link.setAttribute('download', `${dbName}_${currentTableName}_page_${Math.floor(pageOffset / pageLimit) + 1}.csv`);
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
    link.setAttribute('download', `${dbName}_${currentTableName}_page_${Math.floor(pageOffset / pageLimit) + 1}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export SQL INSERT dump from backend
  const exportAsSql = async () => {
    try {
      const res = await fetch(
        `/api/mysql/databases/${encodeURIComponent(dbName)}/tables/${encodeURIComponent(currentTableName)}/export/sql?schema=${encodeURIComponent(schema)}`,
        { headers: authHeaders }
      );
      if (!res.ok) throw new Error('Failed to generate SQL export');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `${currentTableName}_export.sql`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      if (onShowToast) onShowToast(`Exported "${currentTableName}" SQL dump`, 'success');
    } catch (err) {
      if (onShowToast) onShowToast(err.message, 'error');
    }
  };

  // Import data handler (CSV or SQL)
  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (!importContent.trim()) return;

    setIsImporting(true);
    setImportError('');

    try {
      const res = await fetch(
        `/api/mysql/databases/${encodeURIComponent(dbName)}/tables/${encodeURIComponent(currentTableName)}/import`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            schema,
            format: importFormat,
            content: importContent
          })
        }
      );

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Import failed');
      }

      if (onShowToast) {
        const msg = data.count ? `Imported ${data.count} records successfully` : 'Import executed successfully';
        onShowToast(msg, 'success');
      }

      setShowImportModal(false);
      setImportContent('');
      fetchData(false);
    } catch (err) {
      setImportError(err.message || 'Import error');
    } finally {
      setIsImporting(false);
    }
  };

  // Handle file drop/upload for Import
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith('.sql')) {
      setImportFormat('sql');
    } else if (file.name.endsWith('.csv')) {
      setImportFormat('csv');
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setImportContent(event.target?.result || '');
    };
    reader.readAsText(file);
  };

  // Table Maintenance Operations
  const handleRenameTable = async (e) => {
    e.preventDefault();
    if (!renameInput.trim()) return;
    setIsRenaming(true);

    try {
      const res = await fetch(
        `/api/mysql/databases/${encodeURIComponent(dbName)}/tables/${encodeURIComponent(currentTableName)}/rename`,
        {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify({ schema, newName: renameInput.trim() })
        }
      );

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to rename table');

      if (onShowToast) onShowToast(`Table renamed to "${data.newName}"`, 'success');
      setCurrentTableName(data.newName);
      setShowRenameModal(false);
      fetchConfig();
      fetchData(false);
    } catch (err) {
      if (onShowToast) onShowToast(err.message, 'error');
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDuplicateTable = async (e) => {
    e.preventDefault();
    if (!duplicateInput.trim()) return;
    setIsDuplicating(true);

    try {
      const res = await fetch(
        `/api/mysql/databases/${encodeURIComponent(dbName)}/tables/${encodeURIComponent(currentTableName)}/duplicate`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ schema, newName: duplicateInput.trim() })
        }
      );

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to duplicate table');

      if (onShowToast) onShowToast(`Table duplicated as "${data.tableName}"`, 'success');
      setShowDuplicateModal(false);
    } catch (err) {
      if (onShowToast) onShowToast(err.message, 'error');
    } finally {
      setIsDuplicating(false);
    }
  };

  const handleTruncateTable = async () => {
    if (!confirmTruncateCheck) return;
    setIsTruncating(true);

    try {
      const res = await fetch(
        `/api/mysql/databases/${encodeURIComponent(dbName)}/tables/${encodeURIComponent(currentTableName)}/truncate`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ schema })
        }
      );

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to truncate table');

      if (onShowToast) onShowToast(`Table "${currentTableName}" emptied successfully`, 'success');
      setShowTruncateModal(false);
      setConfirmTruncateCheck(false);
      fetchData(false);
    } catch (err) {
      if (onShowToast) onShowToast(err.message, 'error');
    } finally {
      setIsTruncating(false);
    }
  };

  const handleOptimizeTable = async () => {
    setIsOptimizing(true);
    try {
      const res = await fetch(
        `/api/mysql/databases/${encodeURIComponent(dbName)}/tables/${encodeURIComponent(currentTableName)}/optimize`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ schema })
        }
      );

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to optimize table');

      if (onShowToast) onShowToast(`OPTIMIZE TABLE completed on "${currentTableName}"`, 'success');
    } catch (err) {
      if (onShowToast) onShowToast(err.message, 'error');
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleSaveComment = async (e) => {
    e.preventDefault();
    setIsSavingComment(true);

    try {
      const res = await fetch(
        `/api/mysql/databases/${encodeURIComponent(dbName)}/tables/${encodeURIComponent(currentTableName)}/comment`,
        {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify({ schema, comment: commentInput.trim() })
        }
      );

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update comment');

      if (onShowToast) onShowToast('Table comment saved', 'success');
      setShowCommentModal(false);
    } catch (err) {
      if (onShowToast) onShowToast(err.message, 'error');
    } finally {
      setIsSavingComment(false);
    }
  };

  // Schema Builder Mutations (Draft Operations)
  const handleAddDraftColumn = () => {
    setSchemaDraft(prev => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        name: `column_${prev.length + 1}`,
        originalName: null,
        type: 'varchar(255)',
        originalType: null,
        isNullable: true,
        originalNullable: true,
        defaultValue: '',
        originalDefault: '',
        isPrimaryKey: false,
        comment: '',
        originalComment: '',
        isDeleted: false,
        isNew: true
      }
    ]);
  };

  const handleToggleDeleteColumn = (index) => {
    setSchemaDraft(prev => {
      const next = [...prev];
      const col = next[index];
      if (col.isNew) {
        // Discard unsaved new column directly
        return next.filter((_, i) => i !== index);
      }
      next[index] = { ...col, isDeleted: !col.isDeleted };
      return next;
    });
  };

  const handleMoveColumn = (index, direction) => {
    setSchemaDraft(prev => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next;
    });
  };

  const updateDraftColumn = (index, field, value) => {
    setSchemaDraft(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  // Save Schema Batch Changes
  const handleSaveSchemaChanges = async () => {
    setIsSavingSchema(true);

    try {
      const activeColumns = schemaDraft.filter(c => !c.isDeleted);
      const originalNames = originalSchemaRef.current.map(c => c.column_name);
      const currentActiveNames = activeColumns.filter(c => !c.isNew).map(c => c.originalName);

      // Check if physical sequence was altered
      const orderChanged = originalNames.some((origName, idx) => {
        const currentAtIdx = currentActiveNames[idx];
        return currentAtIdx !== undefined && currentAtIdx !== origName;
      });

      let reorder = orderChanged || schemaDraft.some(c => c.isNew);
      let payload = { schema, operations: [], reorder: false, newColumns: [] };

      if (reorder) {
        // Table recreation required to update physical column order
        payload.reorder = true;
        payload.newColumns = activeColumns.map(c => ({
          name: c.name,
          type: c.type,
          isNullable: c.isNullable,
          defaultValue: c.defaultValue,
          isPrimaryKey: c.isPrimaryKey,
          comment: c.comment
        }));
      } else {
        // Compile discrete operations
        const ops = [];

        // 1. Drops
        for (const col of schemaDraft) {
          if (col.isDeleted && !col.isNew) {
            ops.push({ type: 'drop_column', column: col.originalName });
          }
        }

        // 2. Alters & Comments
        for (const col of activeColumns) {
          if (!col.isNew) {
            const hasRenamed = col.name !== col.originalName;
            const hasTypeChanged = col.type !== col.originalType;
            const hasNullChanged = col.isNullable !== col.originalNullable;
            const hasDefaultChanged = col.defaultValue !== col.originalDefault;
            const hasCommentChanged = col.comment !== col.originalComment;

            if (hasRenamed || hasTypeChanged || hasNullChanged || hasDefaultChanged || hasCommentChanged) {
              ops.push({
                type: 'alter_column',
                column: col.originalName,
                newName: hasRenamed ? col.name : undefined,
                dataType: hasTypeChanged ? col.type : undefined,
                isNullable: hasNullChanged ? col.isNullable : undefined,
                defaultValue: hasDefaultChanged ? col.defaultValue : undefined,
                comment: hasCommentChanged ? col.comment : undefined
              });
            }
          }
        }

        payload.operations = ops;
      }

      const res = await fetch(
        `/api/mysql/databases/${encodeURIComponent(dbName)}/tables/${encodeURIComponent(currentTableName)}/schema/batch`,
        {
          method: 'PATCH',
          headers: authHeaders,
          body: JSON.stringify(payload)
        }
      );

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to apply schema changes');
      }

      if (onShowToast) {
        onShowToast('Schema modifications committed successfully', 'success');
      }

      await fetchConfig();
      await fetchData(false);
    } catch (err) {
      console.error('[MysqlDataGrid] Schema batch save error:', err);
      if (onShowToast) {
        onShowToast(err.message || 'Schema modification failed', 'error');
      }
    } finally {
      setIsSavingSchema(false);
    }
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
                {currentTableName}
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
              <span>Schema Builder ({schemaDraft.filter(c => !c.isDeleted).length})</span>
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

            {/* Bulk actions & Add Row & Import & Exports */}
            <div className="flex items-center gap-2 self-end sm:self-auto">
              {/* Add Row Button */}
              <button
                onClick={() => {
                  setIsAddingRow(true);
                  const initialDraft = {};
                  columns.forEach(c => { initialDraft[c] = ''; });
                  setNewRowData(initialDraft);
                }}
                disabled={isAddingRow}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-xs hover:shadow-cyan-600/25 transition-all cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Row</span>
              </button>

              {/* Import Button */}
              <button
                onClick={() => {
                  setImportError('');
                  setShowImportModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                title="Import CSV or SQL"
              >
                <Upload className="w-3.5 h-3.5 text-blue-500" />
                <span>Import</span>
              </button>

              {selectedRows.size > 0 && (
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500 hover:text-white transition-all cursor-pointer animate-in fade-in"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete ({selectedRows.size})</span>
                </button>
              )}

              {/* Export Dropdown Group */}
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
                <button
                  onClick={exportAsSql}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1 transition-colors cursor-pointer"
                  title="Export table data as SQL INSERT dump"
                >
                  <Database className="w-3 h-3 text-amber-500" />
                  <span>SQL</span>
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
                {/* 1. Add Row Inline Input Bar */}
                {isAddingRow && (
                  <tr className="bg-cyan-500/10 border-b-2 border-cyan-500 animate-in fade-in">
                    <td className="py-2 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={handleSaveNewRow}
                          disabled={isSubmittingNewRow}
                          className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
                          title="Save Row"
                        >
                          {isSubmittingNewRow ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => setIsAddingRow(false)}
                          disabled={isSubmittingNewRow}
                          className="p-1 rounded bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 text-zinc-600 dark:text-zinc-300 transition-colors cursor-pointer"
                          title="Cancel"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center text-[10px] text-cyan-600 font-bold font-sans">
                      NEW
                    </td>
                    {columns.map(col => (
                      <td key={col} className="py-1 px-2">
                        <input
                          type="text"
                          placeholder={primaryKeyCols.includes(col) ? 'auto / id' : `val...`}
                          value={newRowData[col] || ''}
                          onChange={(e) => setNewRowData(prev => ({ ...prev, [col]: e.target.value }))}
                          className="w-full px-2 py-1 rounded text-xs bg-white dark:bg-zinc-900 border border-cyan-500/50 text-zinc-900 dark:text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        />
                      </td>
                    ))}
                  </tr>
                )}

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
                            >
                              {isEditing ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveCellEdit();
                                      else if (e.key === 'Escape') setEditingCell(null);
                                    }}
                                    autoFocus
                                    disabled={isSavingCell}
                                    className="px-2 py-0.5 rounded text-xs bg-white dark:bg-zinc-900 border border-cyan-500 text-zinc-900 dark:text-zinc-100 font-mono focus:outline-none min-w-[120px]"
                                  />
                                  <button
                                    onClick={saveCellEdit}
                                    disabled={isSavingCell}
                                    className="p-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer"
                                  >
                                    {isSavingCell ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Check className="w-3 h-3" />
                                    )}
                                  </button>
                                  <button
                                    onClick={() => setEditingCell(null)}
                                    className="p-1 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 cursor-pointer"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <span
                                  className={`cursor-pointer hover:underline ${
                                    val === null || val === undefined
                                      ? 'text-zinc-400 italic font-sans text-[11px]'
                                      : 'text-zinc-800 dark:text-zinc-200'
                                  }`}
                                  title="Double-click to inline edit cell"
                                >
                                  {val === null || val === undefined ? 'NULL' : String(val)}
                                </span>
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
        /* Config View: The Interactive Schema Builder */
        <div className="space-y-4">
          {/* Table Operations Action Bar */}
          <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-zinc-500 mr-1">Maintenance:</span>
              
              <button
                onClick={() => {
                  setRenameInput(currentTableName);
                  setShowRenameModal(true);
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 text-cyan-500" />
                <span>Rename Table</span>
              </button>

              <button
                onClick={() => {
                  setDuplicateInput(`${currentTableName}_copy`);
                  setShowDuplicateModal(true);
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-blue-500" />
                <span>Duplicate (Copy)</span>
              </button>

              <button
                onClick={() => {
                  setCommentInput('');
                  setShowCommentModal(true);
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5 text-purple-500" />
                <span>Table Comment</span>
              </button>

              <button
                onClick={handleOptimizeTable}
                disabled={isOptimizing}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isOptimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-500" />}
                <span>Optimize Table</span>
              </button>

              <button
                onClick={() => {
                  setConfirmTruncateCheck(false);
                  setShowTruncateModal(true);
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Empty (Truncate)</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveSchemaChanges}
                disabled={isSavingSchema}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-600/25 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSavingSchema ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Save Schema Changes</span>
              </button>
            </div>
          </div>

          {/* Interactive Column Grid Builder */}
          <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-xs">
            <div className="p-4 border-b border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-cyan-500" />
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  Interactive Schema Builder & Column Order
                </h3>
              </div>
              <div className="text-xs text-zinc-500">
                <span>Batch modifications with instant Undo. Physical sequence reordering supported.</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-900/40 text-zinc-500 dark:text-zinc-400 text-[11px]">
                    <th className="py-2.5 px-3 w-14 text-center">Order</th>
                    <th className="py-2.5 px-4 font-semibold">Column Name</th>
                    <th className="py-2.5 px-4 font-semibold">Data Type</th>
                    <th className="py-2.5 px-4 font-semibold text-center">Nullable</th>
                    <th className="py-2.5 px-4 font-semibold">Default Value</th>
                    <th className="py-2.5 px-4 font-semibold">Comment</th>
                    <th className="py-2.5 px-3 w-16 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                  {schemaDraft.map((col, idx) => {
                    const isDeleted = col.isDeleted;
                    return (
                      <tr
                        key={col.id || idx}
                        className={`transition-colors ${
                          isDeleted
                            ? 'bg-rose-500/10 text-rose-500 line-through opacity-60'
                            : col.isNew
                            ? 'bg-emerald-500/5'
                            : 'hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30'
                        }`}
                      >
                        {/* Order Reorder Arrows */}
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleMoveColumn(idx, -1)}
                              disabled={idx === 0 || isDeleted}
                              className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-20 cursor-pointer"
                              title="Move column up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleMoveColumn(idx, 1)}
                              disabled={idx === schemaDraft.length - 1 || isDeleted}
                              className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-20 cursor-pointer"
                              title="Move column down"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>

                        {/* Name Input */}
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-1.5">
                            {col.isPrimaryKey && <Key className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                            <input
                              type="text"
                              disabled={isDeleted}
                              value={col.name}
                              onChange={(e) => updateDraftColumn(idx, 'name', e.target.value)}
                              className="px-2.5 py-1 rounded-lg text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-bold focus:outline-none focus:border-cyan-500 w-full min-w-[120px]"
                            />
                          </div>
                        </td>

                        {/* Data Type Select */}
                        <td className="py-2.5 px-4">
                          <select
                            disabled={isDeleted}
                            value={col.type}
                            onChange={(e) => updateDraftColumn(idx, 'type', e.target.value)}
                            className="px-2.5 py-1 rounded-lg text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-cyan-600 dark:text-cyan-400 font-mono focus:outline-none focus:border-cyan-500"
                          >
                            {!COMMON_MYSQL_TYPES.includes(col.type) && (
                              <option value={col.type}>{col.type}</option>
                            )}
                            {COMMON_MYSQL_TYPES.map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </td>

                        {/* Nullable Checkbox */}
                        <td className="py-2.5 px-4 text-center">
                          <input
                            type="checkbox"
                            disabled={isDeleted || col.isPrimaryKey}
                            checked={col.isNullable}
                            onChange={(e) => updateDraftColumn(idx, 'isNullable', e.target.checked)}
                            className="w-4 h-4 rounded text-cyan-600 focus:ring-0 cursor-pointer"
                          />
                        </td>

                        {/* Default Value */}
                        <td className="py-2.5 px-4">
                          <input
                            type="text"
                            disabled={isDeleted}
                            placeholder="NULL or 'value'"
                            value={col.defaultValue || ''}
                            onChange={(e) => updateDraftColumn(idx, 'defaultValue', e.target.value)}
                            className="px-2.5 py-1 rounded-lg text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-mono focus:outline-none focus:border-cyan-500 w-full min-w-[120px]"
                          />
                        </td>

                        {/* Comment */}
                        <td className="py-2.5 px-4">
                          <input
                            type="text"
                            disabled={isDeleted}
                            placeholder="Optional comment..."
                            value={col.comment || ''}
                            onChange={(e) => updateDraftColumn(idx, 'comment', e.target.value)}
                            className="px-2.5 py-1 rounded-lg text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 font-mono focus:outline-none focus:border-cyan-500 w-full min-w-[140px]"
                          />
                        </td>

                        {/* Inline Delete & Undo */}
                        <td className="py-2.5 px-3 text-center">
                          <button
                            onClick={() => handleToggleDeleteColumn(idx)}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              isDeleted
                                ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500 hover:text-white'
                                : 'text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10'
                            }`}
                            title={isDeleted ? 'Undo delete' : 'Drop column on save'}
                          >
                            {isDeleted ? <RotateCcw className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Bottom Add Column Button */}
            <div className="p-3 border-t border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30 flex items-center justify-between">
              <button
                onClick={handleAddDraftColumn}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-cyan-500 text-cyan-600 dark:text-cyan-400 shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Column</span>
              </button>
              <div className="text-[11px] text-zinc-500">
                Click "Save Schema Changes" above to execute migrations.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: Import CSV / SQL */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#16161a] border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                  <Upload className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    Import Data into "{currentTableName}"
                  </h3>
                  <p className="text-[11px] text-zinc-500">Batch transaction execution</p>
                </div>
              </div>
              <button onClick={() => setShowImportModal(false)} className="text-zinc-400 hover:text-zinc-200 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleImportSubmit} className="space-y-4">
              {/* Format selection */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Format:</label>
                <div className="flex items-center bg-zinc-100 dark:bg-zinc-900 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setImportFormat('csv')}
                    className={`px-3 py-1 rounded text-xs font-mono font-medium transition-all ${
                      importFormat === 'csv' ? 'bg-white dark:bg-zinc-800 text-cyan-500 shadow-xs' : 'text-zinc-500'
                    }`}
                  >
                    CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportFormat('sql')}
                    className={`px-3 py-1 rounded text-xs font-mono font-medium transition-all ${
                      importFormat === 'sql' ? 'bg-white dark:bg-zinc-800 text-cyan-500 shadow-xs' : 'text-zinc-500'
                    }`}
                  >
                    SQL Script
                  </button>
                </div>
              </div>

              {/* File upload picker */}
              <div className="space-y-1">
                <label className="text-[11px] text-zinc-500 font-semibold">Upload File (.csv / .sql):</label>
                <input
                  type="file"
                  accept=".csv,.sql,.txt"
                  onChange={handleFileUpload}
                  className="w-full text-xs text-zinc-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-zinc-100 dark:file:bg-zinc-800 file:text-cyan-600 dark:file:text-cyan-400 hover:file:bg-zinc-200 cursor-pointer"
                />
              </div>

              {/* Text Area Content */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Or Paste {importFormat.toUpperCase()} Content:
                </label>
                <textarea
                  rows={8}
                  placeholder={importFormat === 'csv' ? "email,bio\nuser@domain.com,Engineer" : "INSERT INTO ..."}
                  value={importContent}
                  onChange={(e) => setImportContent(e.target.value)}
                  required
                  className="w-full p-3 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              {importError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isImporting || !importContent.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/25 transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  <span>{isImporting ? 'Importing...' : 'Execute Import'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Rename Table */}
      {showRenameModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#16161a] border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Rename Table</h3>
            <form onSubmit={handleRenameTable} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">New Table Name</label>
                <input
                  type="text"
                  value={renameInput}
                  onChange={(e) => setRenameInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  autoFocus
                  required
                  className="w-full mt-1.5 px-3.5 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowRenameModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRenaming || !renameInput.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white"
                >
                  {isRenaming ? 'Renaming...' : 'Confirm Rename'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Duplicate Table */}
      {showDuplicateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#16161a] border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Duplicate Table (Structure & Data)</h3>
            <form onSubmit={handleDuplicateTable} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Duplicate Table Name</label>
                <input
                  type="text"
                  value={duplicateInput}
                  onChange={(e) => setDuplicateInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  autoFocus
                  required
                  className="w-full mt-1.5 px-3.5 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowDuplicateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDuplicating || !duplicateInput.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white"
                >
                  {isDuplicating ? 'Duplicating...' : 'Duplicate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Truncate Table Extreme Confirmation */}
      {showTruncateModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#16161a] border border-rose-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-500 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-rose-600 dark:text-rose-400">
                  TRUNCATE TABLE "{currentTableName}"?
                </h3>
                <p className="text-[11px] text-zinc-400">Extreme Data Wipe Safeguard</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-500 space-y-1">
              <p className="font-semibold">⚠️ Irrevocable Purge:</p>
              <p className="text-[11px] opacity-90">
                This will delete every single row ({totalRows.toLocaleString()} rows) in table <code className="font-mono">{currentTableName}</code> and reset the auto-increment identity counter back to 1.
              </p>
            </div>

            <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={confirmTruncateCheck}
                onChange={(e) => setConfirmTruncateCheck(e.target.checked)}
                className="w-4 h-4 rounded text-rose-600 focus:ring-0 cursor-pointer"
              />
              <span>I confirm I want to wipe all records and restart identity</span>
            </label>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowTruncateModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleTruncateTable}
                disabled={isTruncating || !confirmTruncateCheck}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/30 disabled:opacity-40"
              >
                {isTruncating ? 'Truncating...' : 'Confirm Truncate Table'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: Table Comment */}
      {showCommentModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#16161a] border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Table Comment</h3>
            <form onSubmit={handleSaveComment} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Comment Description</label>
                <textarea
                  rows={4}
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  placeholder="Describe the purpose of this table..."
                  className="w-full mt-1.5 p-3 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-mono focus:outline-none focus:border-purple-500"
                />
              </div>
              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowCommentModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingComment}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white"
                >
                  {isSavingComment ? 'Saving...' : 'Save Comment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: Delete Selected Rows */}
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
                  Target Table: <code className="text-zinc-300 font-mono">{currentTableName}</code>
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

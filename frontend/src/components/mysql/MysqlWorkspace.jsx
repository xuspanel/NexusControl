import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Database,
  ArrowLeft,
  RefreshCw,
  Table,
  Plus,
  Trash2,
  HardDrive,
  Users,
  Settings,
  Terminal,
  Search,
  Download,
  Key,
  ShieldCheck,
  Zap,
  Network,
  Lock,
  Layers,
  FileCode,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Edit3,
  ExternalLink,
  ChevronRight,
  Eye,
  X
} from 'lucide-react';
import MysqlDataGrid from './MysqlDataGrid';
import MysqlTerminal from './MysqlTerminal';
import MysqlSearch from './MysqlSearch';

export default function MysqlWorkspace({ token, dbName, onBack, onShowToast }) {
  // Navigation states: 'overview' | 'table'
  const [currentView, setCurrentView] = useState('overview');
  const [selectedTable, setSelectedTable] = useState(null);
  const [selectedSchema, setSelectedSchema] = useState('public');

  // Sub-tabs: 'tables' | 'triggers' | 'relations' | 'privileges' | 'config' | 'search' | 'terminal' | 'export'
  const [activeTab, setActiveTab] = useState('tables');

  // Database metadata
  const [config, setConfig] = useState(null);
  const [tables, setTables] = useState([]);
  const [triggers, setTriggers] = useState([]);
  const [relations, setRelations] = useState([]);
  const [privileges, setPrivileges] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Modals state
  const [isEditConfigModalOpen, setIsEditConfigModalOpen] = useState(false);
  const [editOwner, setEditOwner] = useState('');
  const [editLimit, setEditLimit] = useState('-1');
  const [editComment, setEditComment] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);

  // Create Table Modal
  const [isCreateTableModalOpen, setIsCreateTableModalOpen] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newTableCols, setNewTableCols] = useState([
    { name: 'id', type: 'int auto_increment', primaryKey: true, nullable: false },
    { name: 'created_at', type: 'timestamp', primaryKey: false, nullable: false, defaultValue: 'CURRENT_TIMESTAMP' }
  ]);
  const [creatingTable, setCreatingTable] = useState(false);

  // Create View Modal
  const [isCreateViewModalOpen, setIsCreateViewModalOpen] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [newViewQuery, setNewViewQuery] = useState('');
  const [creatingView, setCreatingView] = useState(false);

  const authHeaders = useMemo(() => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }), [token]);

  // Load database metadata
  const loadDatabaseDetails = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      // 1. Config
      const configRes = await fetch(`/api/mysql/databases/${encodeURIComponent(dbName)}/config`, { headers: authHeaders });
      const configData = await configRes.json();
      if (configRes.ok && configData.success) {
        setConfig(configData.config);
        setEditOwner(configData.config.owner || '');
        setEditLimit(String(configData.config.connection_limit ?? -1));
        setEditComment(configData.config.comment || '');
      }

      // 2. Tables & Views
      const tablesRes = await fetch(`/api/mysql/databases/${encodeURIComponent(dbName)}/tables`, { headers: authHeaders });
      const tablesData = await tablesRes.json();
      if (tablesRes.ok && tablesData.success) {
        setTables(tablesData.tables || []);
      }

      // 3. Triggers
      const trigRes = await fetch(`/api/mysql/databases/${encodeURIComponent(dbName)}/triggers`, { headers: authHeaders });
      const trigData = await trigRes.json();
      if (trigRes.ok && trigData.success) {
        setTriggers(trigData.triggers || []);
      }

      // 4. Relations
      const relRes = await fetch(`/api/mysql/databases/${encodeURIComponent(dbName)}/relations`, { headers: authHeaders });
      const relData = await relRes.json();
      if (relRes.ok && relData.success) {
        setRelations(relData.relations || []);
      }

      // 5. Privileges
      const privRes = await fetch(`/api/mysql/databases/${encodeURIComponent(dbName)}/privileges`, { headers: authHeaders });
      const privData = await privRes.json();
      if (privRes.ok && privData.success) {
        setPrivileges(privData.privileges || []);
      }

      if (isManual && onShowToast) {
        onShowToast(`Database "${dbName}" refreshed`, 'info');
      }
    } catch (err) {
      console.error('[MysqlWorkspace] Fetch error:', err);
      setError(err.message || 'Error loading database details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dbName, authHeaders, onShowToast]);

  useEffect(() => {
    loadDatabaseDetails(false);
  }, [loadDatabaseDetails]);

  // Handle Save Database Config
  const handleSaveConfig = async (e) => {
    e.preventDefault();
    setSavingConfig(true);

    try {
      const res = await fetch(`/api/mysql/databases/${encodeURIComponent(dbName)}/config`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          owner: editOwner.trim(),
          connectionLimit: parseInt(editLimit, 10),
          comment: editComment.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update database settings');
      }

      setConfig(data.config);
      setIsEditConfigModalOpen(false);
      if (onShowToast) {
        onShowToast('Database settings updated successfully', 'success');
      }
    } catch (err) {
      if (onShowToast) {
        onShowToast(err.message || 'Error saving settings', 'error');
      }
    } finally {
      setSavingConfig(false);
    }
  };

  // Handle Create Table
  const handleCreateTable = async (e) => {
    e.preventDefault();
    if (!newTableName.trim()) return;
    setCreatingTable(true);

    try {
      const res = await fetch(`/api/mysql/databases/${encodeURIComponent(dbName)}/tables/create`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          tableName: newTableName.trim(),
          schema: 'public',
          columns: newTableCols
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create table');
      }

      setIsCreateTableModalOpen(false);
      setNewTableName('');
      if (onShowToast) {
        onShowToast(`Table "${data.table.name}" created successfully`, 'success');
      }
      loadDatabaseDetails(false);
    } catch (err) {
      if (onShowToast) {
        onShowToast(err.message || 'Failed to create table', 'error');
      }
    } finally {
      setCreatingTable(false);
    }
  };

  // Handle Create View
  const handleCreateView = async (e) => {
    e.preventDefault();
    if (!newViewName.trim() || !newViewQuery.trim()) return;
    setCreatingView(true);

    try {
      const res = await fetch(`/api/mysql/databases/${encodeURIComponent(dbName)}/views/create`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          viewName: newViewName.trim(),
          schema: 'public',
          query: newViewQuery.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create view');
      }

      setIsCreateViewModalOpen(false);
      setNewViewName('');
      setNewViewQuery('');
      if (onShowToast) {
        onShowToast(`View "${data.view.name}" created successfully`, 'success');
      }
      loadDatabaseDetails(false);
    } catch (err) {
      if (onShowToast) {
        onShowToast(err.message || 'Failed to create view', 'error');
      }
    } finally {
      setCreatingView(false);
    }
  };

  // Open table view
  const openTable = (tableName, schemaName = 'public') => {
    setSelectedTable(tableName);
    setSelectedSchema(schemaName);
    setCurrentView('table');
  };

  // If in table view, render TableDataGrid
  if (currentView === 'table' && selectedTable) {
    return (
      <MysqlDataGrid
        token={token}
        dbName={dbName}
        tableName={selectedTable}
        schema={selectedSchema}
        onBack={() => {
          setCurrentView('overview');
          fetchMetadata(false);
        }}
        onShowToast={onShowToast}
      />
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 1. Header Toolbar & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition-colors cursor-pointer"
            title="Back to Database Cluster List"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-zinc-400">MySQL / MariaDB</span>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
              <h1 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Database className="w-4 h-4 text-cyan-500" />
                {dbName}
              </h1>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {config?.comment || 'MySQL / MariaDB database catalog, schema introspection & data manager'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadDatabaseDetails(true)}
            disabled={refreshing}
            className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition-colors cursor-pointer"
            title="Refresh database metadata"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setIsEditConfigModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>

          <button
            onClick={() => setActiveTab('terminal')}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-600/20 transition-all cursor-pointer"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>SQL Console</span>
          </button>
        </div>
      </div>

      {/* 2. Database Overview Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-3 shadow-xs">
          <span className="text-[11px] font-mono text-zinc-500">Owner</span>
          <div className="text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100 truncate mt-0.5">
            {config?.owner || 'root'}
          </div>
        </div>
        <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-3 shadow-xs">
          <span className="text-[11px] font-mono text-zinc-500">Size on Disk</span>
          <div className="text-sm font-bold font-mono text-emerald-500 mt-0.5">
            {config?.size || '0 kB'}
          </div>
        </div>
        <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-3 shadow-xs">
          <span className="text-[11px] font-mono text-zinc-500">Connections</span>
          <div className="text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-0.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {config?.active_connections || 0} active
          </div>
        </div>
        <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-3 shadow-xs">
          <span className="text-[11px] font-mono text-zinc-500">Conn Limit</span>
          <div className="text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-0.5">
            {config?.connection_limit === -1 ? 'Unlimited' : config?.connection_limit}
          </div>
        </div>
        <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-3 shadow-xs">
          <span className="text-[11px] font-mono text-zinc-500">Encoding</span>
          <div className="text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-0.5">
            {config?.charset || 'UTF8'}
          </div>
        </div>
        <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-3 shadow-xs">
          <span className="text-[11px] font-mono text-zinc-500">Tables & Views</span>
          <div className="text-sm font-bold font-mono text-cyan-500 mt-0.5">
            {tables.length}
          </div>
        </div>
      </div>

      {/* 3. Navigation Tabs Bar */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800 pb-px text-xs font-semibold">
        <button
          onClick={() => setActiveTab('tables')}
          className={`px-4 py-2.5 border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'tables'
              ? 'border-cyan-500 text-cyan-500'
              : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
          }`}
        >
          <Table className="w-3.5 h-3.5" />
          <span>Tables & Views ({tables.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('triggers')}
          className={`px-4 py-2.5 border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'triggers'
              ? 'border-cyan-500 text-cyan-500'
              : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Triggers ({triggers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('relations')}
          className={`px-4 py-2.5 border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'relations'
              ? 'border-cyan-500 text-cyan-500'
              : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
          }`}
        >
          <Network className="w-3.5 h-3.5" />
          <span>Foreign Keys ({relations.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('privileges')}
          className={`px-4 py-2.5 border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'privileges'
              ? 'border-cyan-500 text-cyan-500'
              : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Privileges ({privileges.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('search')}
          className={`px-4 py-2.5 border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'search'
              ? 'border-cyan-500 text-cyan-500'
              : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          <span>Global Search</span>
        </button>

        <button
          onClick={() => setActiveTab('terminal')}
          className={`px-4 py-2.5 border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'terminal'
              ? 'border-cyan-500 text-cyan-500'
              : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>SQL Terminal</span>
        </button>

        <button
          onClick={() => setActiveTab('export')}
          className={`px-4 py-2.5 border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'export'
              ? 'border-cyan-500 text-cyan-500'
              : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
          }`}
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export (mysqldump)</span>
        </button>
      </div>

      {/* 4. Tab Content */}
      {activeTab === 'tables' && (
        <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-xs space-y-0">
          {/* Tables Toolbar */}
          <div className="p-4 border-b border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between">
            <span className="text-xs font-mono text-zinc-500">
              {tables.length} table(s) and view(s) in catalog
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsCreateViewModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New View</span>
              </button>
              <button
                onClick={() => setIsCreateTableModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-xs transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Table</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-900/40 text-zinc-500 dark:text-zinc-400 text-[11px]">
                  <th className="py-3 px-4 font-semibold">Table / View Name</th>
                  <th className="py-3 px-4 font-semibold">Type</th>
                  <th className="py-3 px-4 font-semibold">Owner</th>
                  <th className="py-3 px-4 font-semibold">Estimated Rows</th>
                  <th className="py-3 px-4 font-semibold">Total Size</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                {tables.length > 0 ? (
                  tables.map(tbl => (
                    <tr
                      key={`${tbl.schema}.${tbl.name}`}
                      className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40 transition-colors group"
                    >
                      <td className="py-3.5 px-4 font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-500 flex items-center justify-center shrink-0">
                          {tbl.type === 'view' ? <FileCode className="w-3.5 h-3.5" /> : <Table className="w-3.5 h-3.5" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-zinc-400 font-normal">{tbl.schema}.</span>
                            <span>{tbl.name}</span>
                          </div>
                          {tbl.comment && <div className="text-[10px] text-zinc-500 font-sans">{tbl.comment}</div>}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                          {tbl.type}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-zinc-500">{tbl.owner}</td>

                      <td className="py-3.5 px-4 text-zinc-900 dark:text-zinc-100 font-medium">
                        {parseInt(tbl.row_count, 10).toLocaleString()}
                      </td>

                      <td className="py-3.5 px-4 text-emerald-500 font-medium">{tbl.total_size}</td>

                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => openTable(tbl.name, tbl.schema)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-500/10 text-cyan-500 hover:bg-cyan-500 hover:text-white transition-all cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Browse Data</span>
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-zinc-500 font-sans">
                      No tables or views found in this database. Click "New Table" to provision your first schema.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'triggers' && (
        <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-xs">
          <div className="p-4 border-b border-zinc-200/80 dark:border-zinc-800/80 text-xs font-mono text-zinc-500">
            {triggers.length} trigger(s) configured
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-900/40 text-zinc-500 dark:text-zinc-400 text-[11px]">
                  <th className="py-2.5 px-4 font-semibold">Trigger Name</th>
                  <th className="py-2.5 px-4 font-semibold">Target Table</th>
                  <th className="py-2.5 px-4 font-semibold">Timing</th>
                  <th className="py-2.5 px-4 font-semibold">Event</th>
                  <th className="py-2.5 px-4 font-semibold">Procedure</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                {triggers.length > 0 ? (
                  triggers.map(trig => (
                    <tr key={trig.trigger_name} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30">
                      <td className="py-3 px-4 font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <Zap className="w-3.5 h-3.5 text-amber-500" />
                        <span>{trig.trigger_name}</span>
                      </td>
                      <td className="py-3 px-4 text-cyan-500">{trig.schema_name}.{trig.table_name}</td>
                      <td className="py-3 px-4 font-bold">{trig.timing}</td>
                      <td className="py-3 px-4 text-purple-400">{trig.event}</td>
                      <td className="py-3 px-4 text-zinc-400">{trig.function_name || 'custom'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-zinc-500 font-sans">
                      No triggers configured in this database.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'relations' && (
        <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-xs">
          <div className="p-4 border-b border-zinc-200/80 dark:border-zinc-800/80 text-xs font-mono text-zinc-500">
            {relations.length} foreign key relation(s)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-900/40 text-zinc-500 dark:text-zinc-400 text-[11px]">
                  <th className="py-2.5 px-4 font-semibold">Constraint</th>
                  <th className="py-2.5 px-4 font-semibold">Source Column</th>
                  <th className="py-2.5 px-4 font-semibold">Foreign Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                {relations.length > 0 ? (
                  relations.map((rel, idx) => (
                    <tr key={idx} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30">
                      <td className="py-3 px-4 font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <Network className="w-3.5 h-3.5 text-cyan-500" />
                        <span>{rel.constraint_name}</span>
                      </td>
                      <td className="py-3 px-4 text-amber-500">
                        {rel.table_name}.{rel.column_name}
                      </td>
                      <td className="py-3 px-4 text-emerald-500 font-bold">
                        → {rel.foreign_table_name}.{rel.foreign_column_name}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-zinc-500 font-sans">
                      No foreign key constraints defined in user tables.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'privileges' && (
        <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-xs">
          <div className="p-4 border-b border-zinc-200/80 dark:border-zinc-800/80 text-xs font-mono text-zinc-500">
            {privileges.length} table privilege grant(s)
          </div>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="sticky top-0 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 text-[11px]">
                  <th className="py-2.5 px-4 font-semibold">Grantee</th>
                  <th className="py-2.5 px-4 font-semibold">Table</th>
                  <th className="py-2.5 px-4 font-semibold">Privilege</th>
                  <th className="py-2.5 px-4 font-semibold">Grantable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                {privileges.length > 0 ? (
                  privileges.map((p, idx) => (
                    <tr key={idx} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30">
                      <td className="py-2.5 px-4 font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <Lock className="w-3 h-3 text-cyan-500" />
                        <span>{p.grantee}</span>
                      </td>
                      <td className="py-2.5 px-4 text-zinc-400">{p.table_name}</td>
                      <td className="py-2.5 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-emerald-500">
                          {p.privilege_type}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-zinc-500">{p.is_grantable}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-zinc-500 font-sans">
                      No explicit table privileges recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'search' && (
        <MysqlSearch
          token={token}
          dbName={dbName}
          onSelectTable={(table, schema) => openTable(table, schema)}
          onShowToast={onShowToast}
        />
      )}

      {activeTab === 'terminal' && (
        <MysqlTerminal
          token={token}
          dbName={dbName}
          onShowToast={onShowToast}
        />
      )}

      {activeTab === 'export' && (
        <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-6 shadow-xs max-w-2xl space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center">
              <Download className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Native Database Export (mysqldump)
              </h3>
              <p className="text-xs text-zinc-500">
                Pipes native <code className="text-cyan-500 font-mono">mysqldump</code> directly to browser download without buffering
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <a
              href={`/api/mysql/databases/${encodeURIComponent(dbName)}/dump?type=full`}
              download
              className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-cyan-500 bg-zinc-50 dark:bg-zinc-900/60 text-left transition-all group flex flex-col justify-between space-y-2 cursor-pointer"
            >
              <div>
                <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100 group-hover:text-cyan-500">
                  Full Dump (.sql)
                </span>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Complete DDL schemas and all data rows.
                </p>
              </div>
              <span className="text-[11px] font-bold text-cyan-600 dark:text-cyan-400 flex items-center gap-1">
                <Download className="w-3.5 h-3.5" />
                Download
              </span>
            </a>

            <a
              href={`/api/mysql/databases/${encodeURIComponent(dbName)}/dump?type=schema`}
              download
              className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-cyan-500 bg-zinc-50 dark:bg-zinc-900/60 text-left transition-all group flex flex-col justify-between space-y-2 cursor-pointer"
            >
              <div>
                <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100 group-hover:text-cyan-500">
                  Schema Only (.sql)
                </span>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Table structures, views, triggers, and indices without row data.
                </p>
              </div>
              <span className="text-[11px] font-bold text-cyan-600 dark:text-cyan-400 flex items-center gap-1">
                <Download className="w-3.5 h-3.5" />
                Download
              </span>
            </a>

            <a
              href={`/api/mysql/databases/${encodeURIComponent(dbName)}/dump?type=data`}
              download
              className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-cyan-500 bg-zinc-50 dark:bg-zinc-900/60 text-left transition-all group flex flex-col justify-between space-y-2 cursor-pointer"
            >
              <div>
                <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100 group-hover:text-cyan-500">
                  Data Only (.sql)
                </span>
                <p className="text-[11px] text-zinc-500 mt-1">
                  INSERT statements without table creation DDL.
                </p>
              </div>
              <span className="text-[11px] font-bold text-cyan-600 dark:text-cyan-400 flex items-center gap-1">
                <Download className="w-3.5 h-3.5" />
                Download
              </span>
            </a>
          </div>
        </div>
      )}

      {/* Modal: Edit Settings / Config */}
      {isEditConfigModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#16161a] border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Settings className="w-4 h-4 text-cyan-500" />
                <span>Database Configuration: {dbName}</span>
              </h3>
              <button onClick={() => setIsEditConfigModalOpen(false)} className="text-zinc-400 hover:text-zinc-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Database Owner</label>
                <input
                  type="text"
                  value={editOwner}
                  onChange={(e) => setEditOwner(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Connection Limit (-1 for unlimited)</label>
                <input
                  type="number"
                  value={editLimit}
                  onChange={(e) => setEditLimit(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Catalog Description / Comment</label>
                <textarea
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                  rows={3}
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none"
                  placeholder="Primary microservice datastore..."
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditConfigModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5"
                >
                  {savingConfig ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>Save Configuration</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Table */}
      {isCreateTableModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#16161a] border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Plus className="w-4 h-4 text-cyan-500" />
                <span>Create Table in {dbName}</span>
              </h3>
              <button onClick={() => setIsCreateTableModalOpen(false)} className="text-zinc-400 hover:text-zinc-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTable} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Table Name</label>
                <input
                  type="text"
                  placeholder="e.g. orders"
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  required
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none"
                />
              </div>

              {/* Column Builder */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Columns</label>
                  <button
                    type="button"
                    onClick={() => setNewTableCols([...newTableCols, { name: '', type: 'text', primaryKey: false, nullable: true }])}
                    className="text-xs font-bold text-cyan-500 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Column</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {newTableCols.map((col, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono">
                      <input
                        type="text"
                        placeholder="col_name"
                        value={col.name}
                        onChange={(e) => {
                          const updated = [...newTableCols];
                          updated[idx].name = e.target.value;
                          setNewTableCols(updated);
                        }}
                        required
                        className="w-28 px-2 py-1 rounded bg-white dark:bg-black border border-zinc-300 dark:border-zinc-700 focus:outline-none"
                      />
                      <select
                        value={col.type}
                        onChange={(e) => {
                          const updated = [...newTableCols];
                          updated[idx].type = e.target.value;
                          setNewTableCols(updated);
                        }}
                        className="px-2 py-1 rounded bg-white dark:bg-black border border-zinc-300 dark:border-zinc-700 focus:outline-none"
                      >
                        <option value="serial">SERIAL</option>
                        <option value="integer">INTEGER</option>
                        <option value="bigint">BIGINT</option>
                        <option value="varchar(255)">VARCHAR(255)</option>
                        <option value="text">TEXT</option>
                        <option value="boolean">BOOLEAN</option>
                        <option value="timestamp">TIMESTAMP</option>
                        <option value="jsonb">JSONB</option>
                        <option value="uuid">UUID</option>
                      </select>
                      <label className="flex items-center gap-1 text-[11px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={col.primaryKey}
                          onChange={(e) => {
                            const updated = [...newTableCols];
                            updated[idx].primaryKey = e.target.checked;
                            setNewTableCols(updated);
                          }}
                        />
                        <span>PK</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setNewTableCols(newTableCols.filter((_, i) => i !== idx))}
                        className="text-zinc-400 hover:text-rose-500 ml-auto p-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateTableModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingTable}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5"
                >
                  {creatingTable ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>Generate & Create Table</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create View */}
      {isCreateViewModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#16161a] border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Plus className="w-4 h-4 text-cyan-500" />
                <span>Create SQL View</span>
              </h3>
              <button onClick={() => setIsCreateViewModalOpen(false)} className="text-zinc-400 hover:text-zinc-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateView} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">View Name</label>
                <input
                  type="text"
                  placeholder="e.g. active_users_view"
                  value={newViewName}
                  onChange={(e) => setNewViewName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  required
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">SQL SELECT Query</label>
                <textarea
                  rows={4}
                  placeholder="SELECT id, email FROM users WHERE active = true"
                  value={newViewQuery}
                  onChange={(e) => setNewViewQuery(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateViewModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingView}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5"
                >
                  {creatingView ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>Create View</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Archive,
  Plus,
  RotateCw,
  Download,
  RotateCcw,
  Trash2,
  Calendar,
  Clock,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  FileArchive,
  Play,
  ToggleLeft,
  ToggleRight,
  ShieldAlert,
  Search,
  Folder,
  Layers,
  Sparkles,
  Info,
  X,
  Cloud,
  Lock,
  Database,
  ShieldCheck
} from 'lucide-react';

function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatDate(timestamp) {
  if (!timestamp) return 'Never';
  const d = new Date(timestamp);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

const PRESET_PATHS = [
  { label: 'Web Roots (/var/www)', path: '/var/www' },
  { label: 'Nginx Config (/etc/nginx)', path: '/etc/nginx' },
  { label: 'Docker Demo Data (/opt/nexus-demo-data)', path: '/opt/nexus-demo-data' },
  { label: 'NexusControl (/opt/NexusControl)', path: '/opt/NexusControl' }
];

const CRON_PRESETS = [
  { label: 'Daily at Midnight (00:00 UTC)', value: '0 0 * * *' },
  { label: 'Every 12 Hours', value: '0 */12 * * *' },
  { label: 'Every 6 Hours', value: '0 */6 * * *' },
  { label: 'Weekly on Sunday at Midnight', value: '0 0 * * 0' },
  { label: 'Hourly', value: '0 * * * *' }
];

export default function BackupsView({ token, onShowToast }) {
  const [activeSubTab, setActiveSubTab] = useState('archives'); // 'archives' | 'jobs'
  const [backups, setBackups] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [stats, setStats] = useState(null);
  const [databases, setDatabases] = useState({ mysql: false, postgres: false });
  const [s3Config, setS3Config] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isJobModalOpen, setIsJobModalOpen] = useState(false);
  const [isS3ModalOpen, setIsS3ModalOpen] = useState(false);
  const [restoreModalData, setRestoreModalData] = useState(null);
  const [deleteConfirmData, setDeleteConfirmData] = useState(null);

  // Manual snapshot form
  const [snapName, setSnapName] = useState('');
  const [snapPaths, setSnapPaths] = useState(['/var/www']);
  const [customPathInput, setCustomPathInput] = useState('');
  const [submittingSnap, setSubmittingSnap] = useState(false);

  // Job wizard form
  const [jobName, setJobName] = useState('');
  const [jobSchedule, setJobSchedule] = useState('0 0 * * *');
  const [jobCustomSchedule, setJobCustomSchedule] = useState('');
  const [isCustomSchedule, setIsCustomSchedule] = useState(false);
  const [jobPaths, setJobPaths] = useState(['/var/www']);
  const [jobCustomPathInput, setJobCustomPathInput] = useState('');
  const [jobRetention, setJobRetention] = useState(7);
  const [submittingJob, setSubmittingJob] = useState(false);

  // S3 Cloud Configuration Form
  const [s3Form, setS3Form] = useState({
    provider: 'r2',
    endpoint: '',
    region: 'auto',
    bucket: '',
    accessKey: '',
    secretKey: '',
    active: false
  });
  const [testingS3, setTestingS3] = useState(false);
  const [savingS3, setSavingS3] = useState(false);
  const [s3TestStatus, setS3TestStatus] = useState(null);

  // Google Drive Cloud Configuration Form
  const [gdriveConfig, setGdriveConfig] = useState(null);
  const [cloudTab, setCloudTab] = useState('s3'); // 's3' | 'gdrive'
  const [gdriveForm, setGdriveForm] = useState({
    clientId: '',
    clientSecret: '',
    refreshToken: '',
    folderId: '',
    active: false
  });
  const [testingGdrive, setTestingGdrive] = useState(false);
  const [savingGdrive, setSavingGdrive] = useState(false);
  const [gdriveTestStatus, setGdriveTestStatus] = useState(null);

  // Restore form
  const [restoreDestPath, setRestoreDestPath] = useState('/');
  const [restoreConfirmationText, setRestoreConfirmationText] = useState('');
  const [restoring, setRestoring] = useState(false);

  // Fetch all backups, jobs, databases, and S3 status
  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setRefreshing(true);

    try {
      const [backupsRes, jobsRes, dbsRes, s3Res, gdriveRes] = await Promise.all([
        fetch('/api/backups', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/backups/jobs', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/backups/detect-dbs', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/backups/s3', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/backups/gdrive', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (backupsRes.ok) {
        const data = await backupsRes.json();
        setBackups(data.backups || []);
        setStats(data.stats || null);
      }

      if (jobsRes.ok) {
        const data = await jobsRes.json();
        setJobs(data.jobs || []);
      }

      if (dbsRes.ok) {
        const data = await dbsRes.json();
        setDatabases(data.databases || { mysql: false, postgres: false });
      }

      if (s3Res.ok) {
        const data = await s3Res.json();
        setS3Config(data.config || null);
        if (data.config) {
          setS3Form({
            provider: data.config.provider || 'r2',
            endpoint: data.config.endpoint || '',
            region: data.config.region || 'auto',
            bucket: data.config.bucket || '',
            accessKey: data.config.accessKey || '',
            secretKey: data.config.secretKey || '',
            active: Boolean(data.config.active)
          });
        }
      }

      if (gdriveRes.ok) {
        const data = await gdriveRes.json();
        setGdriveConfig(data.config || null);
        if (data.config) {
          setGdriveForm({
            clientId: data.config.clientId || '',
            clientSecret: data.config.clientSecret || '',
            refreshToken: data.config.refreshToken || '',
            folderId: data.config.folderId || '',
            active: Boolean(data.config.active)
          });
        }
      }
    } catch (err) {
      onShowToast?.('Failed to load backup data: ' + err.message, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, onShowToast]);

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  // Create Manual Snapshot
  const handleCreateSnapshot = async (e) => {
    e.preventDefault();
    if (!snapName.trim()) {
      onShowToast?.('Please specify a backup name.', 'error');
      return;
    }
    if (snapPaths.length === 0) {
      onShowToast?.('At least one target path is required.', 'error');
      return;
    }

    setSubmittingSnap(true);
    try {
      const res = await fetch('/api/backups/manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: snapName.trim(),
          targetPaths: snapPaths
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Backup creation failed');

      onShowToast?.(`Encrypted snapshot '${data.backup.filename}' created!`, 'success');
      setIsCreateModalOpen(false);
      setSnapName('');
      setSnapPaths(['/var/www']);
      fetchData();
    } catch (err) {
      onShowToast?.(err.message, 'error');
    } finally {
      setSubmittingSnap(false);
    }
  };

  // Create Scheduled Job
  const handleCreateJob = async (e) => {
    e.preventDefault();
    if (!jobName.trim()) {
      onShowToast?.('Job name is required.', 'error');
      return;
    }
    const scheduleToUse = isCustomSchedule ? jobCustomSchedule.trim() : jobSchedule;
    if (!scheduleToUse) {
      onShowToast?.('Cron schedule is required.', 'error');
      return;
    }
    if (jobPaths.length === 0) {
      onShowToast?.('At least one target path is required.', 'error');
      return;
    }

    setSubmittingJob(true);
    try {
      const res = await fetch('/api/backups/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: jobName.trim(),
          cronSchedule: scheduleToUse,
          targetPaths: jobPaths,
          retentionLimit: parseInt(jobRetention, 10) || 7
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Job registration failed');

      onShowToast?.(`Scheduled job '${data.job.name}' registered successfully!`, 'success');
      setIsJobModalOpen(false);
      setJobName('');
      setJobPaths(['/var/www']);
      setJobRetention(7);
      fetchData();
    } catch (err) {
      onShowToast?.(err.message, 'error');
    } finally {
      setSubmittingJob(false);
    }
  };

  // Save S3 Cloud Configuration
  const handleSaveS3Config = async (e) => {
    e.preventDefault();
    setSavingS3(true);
    setS3TestStatus(null);

    try {
      const res = await fetch('/api/backups/s3', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(s3Form)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save S3 configuration');

      setS3Config(data.config);
      onShowToast?.('Off-site S3 cloud configuration updated.', 'success');
      setIsS3ModalOpen(false);
      fetchData();
    } catch (err) {
      onShowToast?.(err.message, 'error');
    } finally {
      setSavingS3(false);
    }
  };

  // Test S3 Connection
  const handleTestS3Connection = async () => {
    setTestingS3(true);
    setS3TestStatus(null);

    try {
      const res = await fetch('/api/backups/s3/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(s3Form)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Connection test failed');

      setS3TestStatus({ success: true, message: data.message || 'Connected successfully!' });
    } catch (err) {
      setS3TestStatus({ success: false, message: err.message });
    } finally {
      setTestingS3(false);
    }
  };

  // Save Google Drive Cloud Configuration
  const handleSaveGDriveConfig = async (e) => {
    e.preventDefault();
    setSavingGdrive(true);
    setGdriveTestStatus(null);

    try {
      const res = await fetch('/api/backups/gdrive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(gdriveForm)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save Google Drive configuration');

      setGdriveConfig(data.config);
      onShowToast?.('Google Drive replication configuration updated.', 'success');
      setIsS3ModalOpen(false);
      fetchData();
    } catch (err) {
      onShowToast?.(err.message, 'error');
    } finally {
      setSavingGdrive(false);
    }
  };

  // Test Google Drive Connection
  const handleTestGDriveConnection = async () => {
    setTestingGdrive(true);
    setGdriveTestStatus(null);

    try {
      const res = await fetch('/api/backups/gdrive/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(gdriveForm)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Connection test failed');

      setGdriveTestStatus({ success: true, message: data.message || 'Connected successfully!' });
    } catch (err) {
      setGdriveTestStatus({ success: false, message: err.message });
    } finally {
      setTestingGdrive(false);
    }
  };

  // Delete Backup
  const handleDeleteBackup = async (filename) => {
    try {
      const res = await fetch(`/api/backups/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete backup');
      }

      onShowToast?.(`Archive '${filename}' deleted.`, 'success');
      setDeleteConfirmData(null);
      fetchData();
    } catch (err) {
      onShowToast?.(err.message, 'error');
    }
  };

  // Download Archive using Fetch blob stream
  const handleDownloadArchive = async (filename) => {
    onShowToast?.(`Downloading ${filename}...`, 'info');
    try {
      const res = await fetch(`/api/backups/${encodeURIComponent(filename)}/download`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Server returned error while downloading archive.');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      onShowToast?.(`Download completed: ${filename}`, 'success');
    } catch (err) {
      onShowToast?.(`Download failed: ${err.message}`, 'error');
    }
  };

  // Restore Archive
  const handleRestoreArchive = async () => {
    if (!restoreModalData) return;
    if (restoreConfirmationText.trim() !== 'RESTORE') {
      onShowToast?.("You must type 'RESTORE' to confirm.", 'error');
      return;
    }
    if (!restoreDestPath.trim()) {
      onShowToast?.('Destination path is required.', 'error');
      return;
    }

    setRestoring(true);
    try {
      const res = await fetch(`/api/backups/${encodeURIComponent(restoreModalData.filename)}/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ destinationPath: restoreDestPath.trim() })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Restoration failed');

      onShowToast?.(`Archive '${restoreModalData.filename}' successfully restored to ${restoreDestPath}!`, 'success');
      setRestoreModalData(null);
      setRestoreConfirmationText('');
    } catch (err) {
      onShowToast?.(err.message, 'error');
    } finally {
      setRestoring(false);
    }
  };

  // Toggle Job Active State
  const handleToggleJob = async (job) => {
    try {
      const res = await fetch(`/api/backups/jobs/${job.id}/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ isActive: !job.isActive })
      });

      if (!res.ok) throw new Error('Failed to toggle job state');
      onShowToast?.(`Job '${job.name}' ${!job.isActive ? 'resumed' : 'paused'}.`, 'info');
      fetchData();
    } catch (err) {
      onShowToast?.(err.message, 'error');
    }
  };

  // Trigger Job Now
  const handleRunJobNow = async (job) => {
    onShowToast?.(`Triggering backup job '${job.name}'...`, 'info');
    try {
      const res = await fetch(`/api/backups/jobs/${job.id}/run`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to trigger backup');

      onShowToast?.(`Backup created for '${job.name}': ${data.backup?.filename}`, 'success');
      fetchData();
    } catch (err) {
      onShowToast?.(err.message, 'error');
    }
  };

  // Delete Job
  const handleDeleteJob = async (jobId, jobTitle) => {
    if (!confirm(`Are you sure you want to delete scheduled job '${jobTitle}'?`)) return;
    try {
      const res = await fetch(`/api/backups/jobs/${jobId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to delete job');
      onShowToast?.(`Scheduled job '${jobTitle}' deleted.`, 'success');
      fetchData();
    } catch (err) {
      onShowToast?.(err.message, 'error');
    }
  };

  // Filtered backups
  const filteredBackups = useMemo(() => {
    return backups.filter(b => {
      const query = searchQuery.toLowerCase().trim();
      if (!query) return true;
      return (
        b.name?.toLowerCase().includes(query) ||
        b.filename?.toLowerCase().includes(query) ||
        b.paths?.some(p => p.toLowerCase().includes(query))
      );
    });
  }, [backups, searchQuery]);

  return (
    <div className="space-y-6">
      {/* 1. Header & Storage Metrics Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-5 shadow-xs transition-colors">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                  Automated Backup & Snapshot Engine
                </h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  AES-256-GCM + zstd
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                Storage: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{stats?.repository || '/opt/nexus_backups'}</span> • Root-Only (0700)
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Cloud Storage Button */}
          <button
            onClick={() => setIsS3ModalOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
              s3Config?.active || gdriveConfig?.active
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400'
                : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
            title="Configure Cloud Storage & Off-Site Replication"
          >
            <Cloud className="w-4 h-4" />
            <span>Cloud Sync</span>
            {(s3Config?.active || gdriveConfig?.active) && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => fetchData(false)}
            disabled={refreshing}
            className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            title="Refresh Backups"
          >
            <RotateCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-emerald-500' : ''}`} />
          </button>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Create Snapshot</span>
          </button>
        </div>
      </div>

      {/* Storage Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Total Archives</span>
            <FileArchive className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
              {stats?.backupCount ?? backups.length}
            </span>
            <span className="text-xs text-zinc-400">snapshots</span>
          </div>
        </div>

        <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Storage Consumed</span>
            <div className="flex items-center gap-1 text-emerald-500">
              <Lock className="w-3.5 h-3.5" />
              <HardDrive className="w-4 h-4 text-blue-500" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
              {formatBytes(stats?.totalSizeBytes || 0)}
            </span>
            <span className="text-xs text-zinc-400">AES encrypted</span>
          </div>
        </div>

        <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Replication & Profiles</span>
            <Cloud className="w-4 h-4 text-blue-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
              {jobs.length}
            </span>
            <span className="text-xs text-zinc-400">
              jobs {s3Config?.active && gdriveConfig?.active ? '• S3 & GDrive Active' : s3Config?.active ? '• S3 Active' : gdriveConfig?.active ? '• GDrive Active' : '• Local only'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Sub-Tabs Bar */}
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveSubTab('archives')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeSubTab === 'archives'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Available Archives</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
              {backups.length}
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('jobs')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeSubTab === 'jobs'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Scheduled Jobs</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
              {jobs.length}
            </span>
          </button>
        </div>

        {activeSubTab === 'jobs' && (
          <button
            onClick={() => setIsJobModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Backup Job</span>
          </button>
        )}
      </div>

      {/* 3. Tab Content */}
      {activeSubTab === 'archives' ? (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="relative max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search archives by name, path or filename..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
            />
          </div>

          {/* Archives Table */}
          <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-xs">
            {loading ? (
              <div className="py-16 text-center text-xs font-mono text-zinc-500 flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <span>Loading backup archives...</span>
              </div>
            ) : filteredBackups.length === 0 ? (
              <div className="py-16 text-center">
                <FileArchive className="w-10 h-10 mx-auto text-zinc-300 dark:text-zinc-700 mb-3" />
                <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">No backup archives found</h3>
                <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                  Create your first snapshot protected with native AES-256-GCM streaming encryption and Zstandard compression.
                </p>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Snapshot Now</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 font-mono">
                    <tr>
                      <th className="py-3 px-4">Archive & Filename</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Size & Security</th>
                      <th className="py-3 px-4">Cloud Sync</th>
                      <th className="py-3 px-4">Created Date</th>
                      <th className="py-3 px-4">Target Paths</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/60 font-mono">
                    {filteredBackups.map((b) => (
                      <tr key={b.id || b.filename} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/20 transition-colors">
                        <td className="py-3 px-4 font-sans">
                          <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                            <FileArchive className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span>{b.name}</span>
                          </div>
                          <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 block truncate max-w-xs">
                            {b.filename}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                              b.type === 'auto'
                                ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                                : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                            }`}
                          >
                            {b.type}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 font-semibold text-zinc-700 dark:text-zinc-300">
                            {b.isEncrypted && (
                              <Lock className="w-3.5 h-3.5 text-emerald-500 shrink-0" title="AES-256-GCM Encrypted" />
                            )}
                            <span>{formatBytes(b.sizeBytes)}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            {s3Config?.active && (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                                title={`Replicated to S3 (${s3Config.provider?.toUpperCase() || 'S3'})`}
                              >
                                <Cloud className="w-3 h-3" />
                                S3/R2
                              </span>
                            )}
                            {gdriveConfig?.active && (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                                title="Replicated to Google Drive"
                              >
                                <HardDrive className="w-3 h-3" />
                                GDrive
                              </span>
                            )}
                            {!s3Config?.active && !gdriveConfig?.active && (
                              <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                                Local Only
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-zinc-500 dark:text-zinc-400">
                          {formatDate(b.createdAt)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {b.paths?.map((p, idx) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 truncate"
                                title={p}
                              >
                                {p}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Restore Button */}
                            <button
                              onClick={() => {
                                setRestoreModalData(b);
                                setRestoreDestPath('/');
                                setRestoreConfirmationText('');
                              }}
                              className="p-1.5 rounded-lg border border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors"
                              title="Restore Archive"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>

                            {/* Download Stream */}
                            <button
                              onClick={() => handleDownloadArchive(b.filename)}
                              className="p-1.5 rounded-lg border border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 transition-colors"
                              title="Download Encrypted Archive"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete Button */}
                            <button
                              onClick={() => setDeleteConfirmData(b)}
                              className="p-1.5 rounded-lg border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors"
                              title="Delete Archive"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Scheduled Jobs Tab */
        <div className="space-y-4">
          <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-xs">
            {jobs.length === 0 ? (
              <div className="py-16 text-center">
                <Clock className="w-10 h-10 mx-auto text-zinc-300 dark:text-zinc-700 mb-3" />
                <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">No scheduled jobs configured</h3>
                <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                  Automate recurring system snapshots with custom cron intervals and active retention enforcement.
                </p>
                <button
                  onClick={() => setIsJobModalOpen(true)}
                  className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Configure First Job</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 font-mono">
                    <tr>
                      <th className="py-3 px-4">Job Name</th>
                      <th className="py-3 px-4">Cron Schedule</th>
                      <th className="py-3 px-4">Target Paths</th>
                      <th className="py-3 px-4">Retention Limit</th>
                      <th className="py-3 px-4">Last Run</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/60 font-mono">
                    {jobs.map((job) => (
                      <tr key={job.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/20 transition-colors">
                        <td className="py-3 px-4 font-sans font-semibold text-zinc-900 dark:text-zinc-100">
                          {job.name}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-100 dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 border border-zinc-200 dark:border-zinc-700">
                            {job.cronSchedule}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {job.targetPaths?.map((p, idx) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 truncate"
                              >
                                {p}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-zinc-700 dark:text-zinc-300">
                          Keep last <span className="font-bold text-emerald-600 dark:text-emerald-400">{job.retentionLimit}</span>
                        </td>
                        <td className="py-3 px-4 text-zinc-500 dark:text-zinc-400">
                          {formatDate(job.lastRun)}
                        </td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => handleToggleJob(job)}
                            className="flex items-center gap-1 text-xs font-semibold"
                          >
                            {job.isActive ? (
                              <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                <ToggleRight className="w-5 h-5" /> Active
                              </span>
                            ) : (
                              <span className="text-zinc-400 flex items-center gap-1">
                                <ToggleLeft className="w-5 h-5" /> Paused
                              </span>
                            )}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleRunJobNow(job)}
                              className="p-1.5 rounded-lg border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                              title="Run Backup Now"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                            </button>

                            <button
                              onClick={() => handleDeleteJob(job.id, job.name)}
                              className="p-1.5 rounded-lg border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors"
                              title="Delete Job"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. MODAL: Create Manual Snapshot */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 w-full max-w-lg rounded-2xl shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Archive className="w-5 h-5 text-emerald-500" />
                <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                  Create Encrypted Zstandard Snapshot
                </h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSnapshot} className="p-6 space-y-4">
              {/* Smart Database Detection Badges */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Database Auto-Discovery
                </label>
                <div className="space-y-1.5">
                  {databases.postgres && (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-semibold">
                      <span className="text-base">🐘</span>
                      <span>PostgreSQL Engine Detected (Will be hot-dumped into snapshot)</span>
                    </div>
                  )}
                  {databases.mysql && (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-semibold">
                      <span className="text-base">🐬</span>
                      <span>MySQL / MariaDB Detected (Will be hot-dumped into snapshot)</span>
                    </div>
                  )}
                  {!databases.postgres && !databases.mysql && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800/60 text-zinc-500 text-[11px]">
                      <Database className="w-3.5 h-3.5 text-zinc-400" />
                      <span>No local database engines detected (filesystem snapshot only)</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Snapshot Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. manual_production_snap"
                  value={snapName}
                  onChange={(e) => setSnapName(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Target Directories / Files
                </label>

                {/* Path preset quick chips */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {PRESET_PATHS.map((preset) => {
                    const isSelected = snapPaths.includes(preset.path);
                    return (
                      <button
                        type="button"
                        key={preset.path}
                        onClick={() => {
                          if (isSelected) {
                            setSnapPaths(snapPaths.filter(p => p !== preset.path));
                          } else {
                            setSnapPaths([...snapPaths, preset.path]);
                          }
                        }}
                        className={`px-2 py-1 rounded text-[11px] font-mono border transition-colors ${
                          isSelected
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                            : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        {isSelected ? '✓ ' : '+ '} {preset.label}
                      </button>
                    );
                  })}
                </div>

                {/* Custom path input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="/path/to/backup"
                    value={customPathInput}
                    onChange={(e) => setCustomPathInput(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customPathInput.trim() && !snapPaths.includes(customPathInput.trim())) {
                        setSnapPaths([...snapPaths, customPathInput.trim()]);
                        setCustomPathInput('');
                      }
                    }}
                    className="px-3 py-2 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-semibold hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors"
                  >
                    Add
                  </button>
                </div>

                {/* Selected paths list */}
                <div className="space-y-1 mt-2">
                  {snapPaths.map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900/80 text-xs font-mono">
                      <span className="truncate text-zinc-700 dark:text-zinc-300">{p}</span>
                      <button
                        type="button"
                        onClick={() => setSnapPaths(snapPaths.filter((_, i) => i !== idx))}
                        className="text-red-500 hover:text-red-600 p-1"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-start gap-2">
                <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Encrypted stream using <strong>AES-256-GCM</strong> and compressed with <strong>Zstandard</strong>. Protected with authenticated 28-byte cryptographic verification.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={submittingSnap}
                  className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingSnap}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {submittingSnap && <RotateCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{submittingSnap ? 'Encrypting & Streaming...' : 'Start Encrypted Snapshot'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. MODAL: Add Scheduled Job */}
      {isJobModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 w-full max-w-lg rounded-2xl shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-500" />
                <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                  New Scheduled Backup Job
                </h3>
              </div>
              <button
                onClick={() => setIsJobModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateJob} className="p-6 space-y-4">
              {/* Smart Database Detection Badges */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Database Auto-Discovery
                </label>
                <div className="space-y-1.5">
                  {databases.postgres && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-semibold">
                      <span>🐘 PostgreSQL active (will be automatically dumped)</span>
                    </div>
                  )}
                  {databases.mysql && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-semibold">
                      <span>🐬 MySQL/MariaDB active (will be automatically dumped)</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Job Profile Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Nightly Production Backup"
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Cron Schedule */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Schedule Preset
                </label>
                <select
                  value={isCustomSchedule ? 'custom' : jobSchedule}
                  onChange={(e) => {
                    if (e.target.value === 'custom') {
                      setIsCustomSchedule(true);
                    } else {
                      setIsCustomSchedule(false);
                      setJobSchedule(e.target.value);
                    }
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  {CRON_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label} ({p.value})
                    </option>
                  ))}
                  <option value="custom">Custom Cron Expression...</option>
                </select>

                {isCustomSchedule && (
                  <input
                    type="text"
                    placeholder="e.g. 0 2 * * *"
                    value={jobCustomSchedule}
                    onChange={(e) => setJobCustomSchedule(e.target.value)}
                    required
                    className="w-full mt-2 px-3 py-2 text-xs font-mono rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                )}
              </div>

              {/* Retention Limit Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                    Retention Limit: Keep last {jobRetention} snapshots
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono">1 to 30</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="30"
                  value={jobRetention}
                  onChange={(e) => setJobRetention(Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
                <p className="text-[10px] text-zinc-500">
                  Older snapshots exceeding this count will be automatically purged from disk and database.
                </p>
              </div>

              {/* Target Paths */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Target Directories
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {PRESET_PATHS.map((preset) => {
                    const isSelected = jobPaths.includes(preset.path);
                    return (
                      <button
                        type="button"
                        key={preset.path}
                        onClick={() => {
                          if (isSelected) {
                            setJobPaths(jobPaths.filter(p => p !== preset.path));
                          } else {
                            setJobPaths([...jobPaths, preset.path]);
                          }
                        }}
                        className={`px-2 py-1 rounded text-[11px] font-mono border transition-colors ${
                          isSelected
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                            : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        {isSelected ? '✓ ' : '+ '} {preset.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="/custom/target/path"
                    value={jobCustomPathInput}
                    onChange={(e) => setJobCustomPathInput(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (jobCustomPathInput.trim() && !jobPaths.includes(jobCustomPathInput.trim())) {
                        setJobPaths([...jobPaths, jobCustomPathInput.trim()]);
                        setJobCustomPathInput('');
                      }
                    }}
                    className="px-3 py-2 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-semibold hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors"
                  >
                    Add
                  </button>
                </div>

                <div className="space-y-1 mt-2">
                  {jobPaths.map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900/80 text-xs font-mono">
                      <span className="truncate text-zinc-700 dark:text-zinc-300">{p}</span>
                      <button
                        type="button"
                        onClick={() => setJobPaths(jobPaths.filter((_, i) => i !== idx))}
                        className="text-red-500 hover:text-red-600 p-1"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsJobModalOpen(false)}
                  disabled={submittingJob}
                  className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingJob}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {submittingJob && <RotateCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{submittingJob ? 'Saving Job...' : 'Save Job Profile'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. MODAL: Cloud Storage & Replication Configuration */}
      {isS3ModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 w-full max-w-lg rounded-2xl shadow-xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cloud className="w-5 h-5 text-blue-500" />
                <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                  Cloud Replication & Off-Site Storage
                </h3>
              </div>
              <button
                onClick={() => setIsS3ModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Provider Tabs Switcher */}
            <div className="flex border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 p-1.5 gap-1.5">
              <button
                type="button"
                onClick={() => setCloudTab('s3')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition-all ${
                  cloudTab === 's3'
                    ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>Amazon S3 / R2</span>
                {s3Config?.active && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setCloudTab('gdrive')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition-all ${
                  cloudTab === 'gdrive'
                    ? 'bg-white dark:bg-zinc-800 text-amber-600 dark:text-amber-400 shadow-xs'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span>Google Drive</span>
                {gdriveConfig?.active && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                )}
              </button>
            </div>

            {/* TAB 1: S3 / R2 FORM */}
            {cloudTab === 's3' && (
              <form onSubmit={handleSaveS3Config} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Cloud Storage Provider
                  </label>
                  <select
                    value={s3Form.provider}
                    onChange={(e) => {
                      const prov = e.target.value;
                      let endpoint = s3Form.endpoint;
                      let region = s3Form.region;
                      if (prov === 'r2') {
                        region = 'auto';
                      } else if (prov === 'aws') {
                        endpoint = '';
                        region = 'us-east-1';
                      } else if (prov === 'minio') {
                        endpoint = 'http://127.0.0.1:9000';
                        region = 'us-east-1';
                      }
                      setS3Form({ ...s3Form, provider: prov, endpoint, region });
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="r2">Cloudflare R2 (Zero Egress)</option>
                    <option value="aws">Amazon Web Services (AWS S3)</option>
                    <option value="minio">MinIO (Self-Hosted Object Storage)</option>
                    <option value="do">DigitalOcean Spaces</option>
                    <option value="custom">Custom S3-Compatible Endpoint</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Bucket Name
                    </label>
                    <input
                      type="text"
                      placeholder="my-vps-backups"
                      value={s3Form.bucket}
                      onChange={(e) => setS3Form({ ...s3Form, bucket: e.target.value })}
                      required
                      className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Region
                    </label>
                    <input
                      type="text"
                      placeholder="auto or us-east-1"
                      value={s3Form.region}
                      onChange={(e) => setS3Form({ ...s3Form, region: e.target.value })}
                      required
                      className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Custom Endpoint URL (Optional for AWS S3)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. https://<account_id>.r2.cloudflarestorage.com"
                    value={s3Form.endpoint}
                    onChange={(e) => setS3Form({ ...s3Form, endpoint: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Access Key ID
                  </label>
                  <input
                    type="text"
                    placeholder="AKIAIOSFODNN7EXAMPLE"
                    value={s3Form.accessKey}
                    onChange={(e) => setS3Form({ ...s3Form, accessKey: e.target.value })}
                    required
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Secret Access Key
                  </label>
                  <input
                    type="password"
                    placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                    value={s3Form.secretKey}
                    onChange={(e) => setS3Form({ ...s3Form, secretKey: e.target.value })}
                    required={!s3Config?.configured}
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Enable Toggle */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <div>
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 block">
                      Enable S3 Replication
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      Automatically upload snapshots to S3 immediately after local creation.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setS3Form({ ...s3Form, active: !s3Form.active })}
                    className="text-2xl"
                  >
                    {s3Form.active ? (
                      <ToggleRight className="w-8 h-8 text-emerald-500" />
                    ) : (
                      <ToggleLeft className="w-8 h-8 text-zinc-400" />
                    )}
                  </button>
                </div>

                {/* S3 Test Status Alert */}
                {s3TestStatus && (
                  <div
                    className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                      s3TestStatus.success
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                        : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
                    }`}
                  >
                    {s3TestStatus.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                    <span className="truncate">{s3TestStatus.message}</span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={handleTestS3Connection}
                    disabled={testingS3 || !s3Form.bucket || !s3Form.accessKey}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                  >
                    {testingS3 ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />}
                    <span>{testingS3 ? 'Testing...' : 'Test S3 Connection'}</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsS3ModalOpen(false)}
                      disabled={savingS3}
                      className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingS3}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      {savingS3 && <RotateCw className="w-3.5 h-3.5 animate-spin" />}
                      <span>{savingS3 ? 'Saving...' : 'Save Configuration'}</span>
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* TAB 2: GOOGLE DRIVE FORM */}
            {cloudTab === 'gdrive' && (
              <form onSubmit={handleSaveGDriveConfig} className="p-6 space-y-4">
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">Zero-Memory Resumable Upload</span>
                    <span>Directly streams multi-GB snapshots using native Node streams with no external dependencies.</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Google OAuth2 Client ID
                  </label>
                  <input
                    type="text"
                    placeholder="123456789-abc.apps.googleusercontent.com"
                    value={gdriveForm.clientId}
                    onChange={(e) => setGdriveForm({ ...gdriveForm, clientId: e.target.value })}
                    required
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Google OAuth2 Client Secret
                  </label>
                  <input
                    type="password"
                    placeholder="GOCSPX-xxxxxxxxxxxxxxxxxxxx"
                    value={gdriveForm.clientSecret}
                    onChange={(e) => setGdriveForm({ ...gdriveForm, clientSecret: e.target.value })}
                    required={!gdriveConfig?.configured}
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Google OAuth2 Refresh Token
                  </label>
                  <input
                    type="password"
                    placeholder="1//04xxxxxxxxxxxxxxxxxxxxxxx"
                    value={gdriveForm.refreshToken}
                    onChange={(e) => setGdriveForm({ ...gdriveForm, refreshToken: e.target.value })}
                    required={!gdriveConfig?.configured}
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Target Folder ID (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="1B2c3D4e5F... (leave empty for Drive Root)"
                    value={gdriveForm.folderId}
                    onChange={(e) => setGdriveForm({ ...gdriveForm, folderId: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                {/* Enable Toggle */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <div>
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 block">
                      Enable Google Drive Replication
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      Stream snapshots to Google Drive immediately after local creation.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGdriveForm({ ...gdriveForm, active: !gdriveForm.active })}
                    className="text-2xl"
                  >
                    {gdriveForm.active ? (
                      <ToggleRight className="w-8 h-8 text-emerald-500" />
                    ) : (
                      <ToggleLeft className="w-8 h-8 text-zinc-400" />
                    )}
                  </button>
                </div>

                {/* GDrive Test Status Alert */}
                {gdriveTestStatus && (
                  <div
                    className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                      gdriveTestStatus.success
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                        : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
                    }`}
                  >
                    {gdriveTestStatus.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                    <span className="truncate">{gdriveTestStatus.message}</span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={handleTestGDriveConnection}
                    disabled={testingGdrive || !gdriveForm.clientId}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                  >
                    {testingGdrive ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />}
                    <span>{testingGdrive ? 'Testing...' : 'Test GDrive Connection'}</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsS3ModalOpen(false)}
                      disabled={savingGdrive}
                      className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingGdrive}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      {savingGdrive && <RotateCw className="w-3.5 h-3.5 animate-spin" />}
                      <span>{savingGdrive ? 'Saving...' : 'Save Configuration'}</span>
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 7. MODAL: Scary Red Restore Gate */}
      {restoreModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#18181b] border-2 border-red-500/50 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-red-500/10 border-b border-red-500/20 flex items-center gap-3 text-red-600 dark:text-red-400">
              <ShieldAlert className="w-6 h-6 shrink-0" />
              <div>
                <h3 className="font-bold text-sm text-red-600 dark:text-red-400">
                  CONFIRM FULL SYSTEM RESTORATION
                </h3>
                <p className="text-[11px] text-red-500/90 font-mono">
                  AES-256-GCM Streaming Decryption & Atomic Staging
                </p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs space-y-1">
                <p className="font-bold">⚠️ Warning: High Consequence Operation</p>
                <p>
                  Restoring this archive will decrypt and extract the contents into the target directory. Existing files matching the archive structure will be overwritten.
                </p>
              </div>

              <div className="text-xs space-y-2 bg-zinc-50 dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 font-mono">
                <div>
                  <span className="text-zinc-500">Archive: </span>
                  <span className="font-bold text-zinc-900 dark:text-zinc-100">{restoreModalData.filename}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Size: </span>
                  <span className="text-zinc-700 dark:text-zinc-300">{formatBytes(restoreModalData.sizeBytes)}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Target Destination Directory
                </label>
                <input
                  type="text"
                  value={restoreDestPath}
                  onChange={(e) => setRestoreDestPath(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
                <p className="text-[10px] text-zinc-400">
                  Leave as <code>/</code> if paths inside archive are already absolute.
                </p>
              </div>

              <div className="space-y-1.5 pt-2">
                <label className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  Type <span className="font-bold text-red-500">RESTORE</span> to confirm:
                </label>
                <input
                  type="text"
                  placeholder="RESTORE"
                  value={restoreConfirmationText}
                  onChange={(e) => setRestoreConfirmationText(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono font-bold tracking-widest rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-red-300 dark:border-red-900 text-red-600 dark:text-red-400 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setRestoreModalData(null)}
                  disabled={restoring}
                  className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRestoreArchive}
                  disabled={restoring || restoreConfirmationText.trim() !== 'RESTORE'}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                >
                  {restoring && <RotateCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{restoring ? 'Decrypting & Restoring...' : 'CONFIRM & RESTORE'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. MODAL: Delete Archive Confirmation */}
      {deleteConfirmData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 w-full max-w-md rounded-2xl shadow-xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <Trash2 className="w-6 h-6 shrink-0" />
              <div>
                <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                  Delete Backup Archive
                </h3>
                <p className="text-xs text-zinc-500">
                  This action is permanent and cannot be undone.
                </p>
              </div>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-300 font-mono bg-zinc-50 dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 truncate">
              {deleteConfirmData.filename}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmData(null)}
                className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteBackup(deleteConfirmData.filename)}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors"
              >
                Delete Archive
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

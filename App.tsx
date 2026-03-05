import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  Upload, FolderOpen, Library, HelpCircle, AlertTriangle,
  RefreshCw, Settings as SettingsIcon, Sparkles, LayoutDashboard,
  ShieldCheck, Zap, Layers, FileText, FolderTree, Undo2, Database, FolderSearch
} from 'lucide-react';
import { FileItem, ProcessingState, AppSettings } from './types';
import { extractTextFromPDF } from './services/pdfService';
import { analyzePaper } from './services/llmService';
import PaperCard from './components/PaperCard';
import ScriptGenerator from './components/ScriptGenerator';
import UserGuide from './components/UserGuide';
import SettingsPanel from './components/SettingsPanel';
import {
  applyOrganization,
  getLibraryOverview,
  isDesktopRuntime,
  previewLastRollback,
  rollbackLastOrganization,
  selectDirectory,
  DesktopOrganizeResult,
  DesktopRollbackPreview,
  DesktopRollbackResult,
  DesktopLibraryOverview,
} from './services/desktopService';

const LIBRARY_ROOT_KEY = 'localscholar_library_root';
const ORGANIZE_BATCH_SIZE = 20;

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to serialize PDF payload.'));
        return;
      }
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
};

const getFilePath = (file: File): string | undefined => {
  const maybePath = (file as File & { path?: string }).path;
  return typeof maybePath === 'string' && maybePath.length > 0 ? maybePath : undefined;
};

const App: React.FC = () => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const [isOrganizing, setIsOrganizing] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [isPreviewingRollback, setIsPreviewingRollback] = useState(false);
  const [organizeProgress, setOrganizeProgress] = useState<string>('');
  const [organizeResult, setOrganizeResult] = useState<DesktopOrganizeResult | null>(null);
  const [rollbackResult, setRollbackResult] = useState<DesktopRollbackResult | null>(null);
  const [rollbackPreview, setRollbackPreview] = useState<DesktopRollbackPreview | null>(null);
  const [libraryOverview, setLibraryOverview] = useState<DesktopLibraryOverview | null>(null);
  const [libraryError, setLibraryError] = useState<string>('');

  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const isDesktop = useMemo(() => isDesktopRuntime(), []);

  const [libraryRoot, setLibraryRoot] = useState<string>(() => {
    try {
      return localStorage.getItem(LIBRARY_ROOT_KEY) || '';
    } catch {
      return '';
    }
  });

  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('localscholar_settings');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { provider: 'google', apiKey: '', baseUrl: '', model: 'gemini-3-flash-preview', apiVersion: '2024-02-15-preview' };
  });

  useEffect(() => {
    localStorage.setItem('localscholar_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(LIBRARY_ROOT_KEY, libraryRoot);
  }, [libraryRoot]);

  useEffect(() => {
    if (!folderInputRef.current) return;
    folderInputRef.current.setAttribute('webkitdirectory', '');
    folderInputRef.current.setAttribute('directory', '');
  }, []);

  const refreshOverview = useCallback(async () => {
    if (!isDesktop || !libraryRoot.trim()) {
      setLibraryOverview(null);
      return;
    }
    try {
      const overview = await getLibraryOverview(libraryRoot.trim());
      setLibraryOverview(overview);
      setLibraryError('');
    } catch (error: any) {
      setLibraryError(error.message || 'Failed to load desktop library state.');
    }
  }, [isDesktop, libraryRoot]);

  useEffect(() => {
    refreshOverview();
  }, [refreshOverview]);

  const [categories, setCategories] = useState<string[]>(['Artificial Intelligence', 'Computer Science', 'Physics', 'Biology']);

  const handleFiles = useCallback(async (uploadedFiles: FileList | null) => {
    if (!uploadedFiles) return;
    const newFiles: FileItem[] = Array.from(uploadedFiles)
      .filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
      .map(f => ({
        id: Math.random().toString(36).substr(2, 9),
        file: f,
        originalName: f.name,
        sourcePath: getFilePath(f),
        relativePath: (f as File & { webkitRelativePath?: string }).webkitRelativePath || '',
        state: ProcessingState.QUEUED
      }));
    setFiles(prev => [...prev, ...newFiles]);
    setIsPaused(false);
  }, []);

  useEffect(() => {
    const processNext = async () => {
      if (isPaused) return;
      const active = files.filter(f => f.state === ProcessingState.READING || f.state === ProcessingState.ANALYZING).length;
      if (active < 2) {
        const next = files.find(f => f.state === ProcessingState.QUEUED);
        if (next) await processItem(next);
      }
    };
    processNext();
  }, [files, isPaused]);

  const processItem = async (item: FileItem) => {
    updateFileState(item.id, ProcessingState.READING);
    try {
      const text = await extractTextFromPDF(item.file, 1000000);
      updateFileState(item.id, ProcessingState.ANALYZING);
      const meta = await analyzePaper(text, categories, settings);
      if (meta.category && !categories.includes(meta.category)) {
        setCategories(prev => [...prev, meta.category]);
      }
      updateFileState(item.id, ProcessingState.COMPLETED, { metadata: meta });
    } catch (error: any) {
      console.error(error);
      const isQuota = error.message?.includes('429');
      if (isQuota) setIsPaused(true);
      updateFileState(item.id, ProcessingState.ERROR, { error: error.message || '分析链路异常' });
    }
  };

  const updateFileState = (id: string, state: ProcessingState, updates: Partial<FileItem> = {}) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, state, ...updates } : f));
  };

  const stats = useMemo(() => {
    const completed = files.filter(f => f.state === ProcessingState.COMPLETED).length;
    const errors = files.filter(f => f.state === ProcessingState.ERROR).length;
    const processing = files.filter(f => f.state === ProcessingState.ANALYZING || f.state === ProcessingState.READING).length;
    return { completed, errors, processing, total: files.length };
  }, [files]);

  const completedItems = useMemo(
    () => files.filter(f => f.state === ProcessingState.COMPLETED && f.metadata),
    [files]
  );

  const renamedDetails = useMemo(
    () => (organizeResult?.details || []).filter(d => d.autoRenamedFrom),
    [organizeResult]
  );

  const skippedDetails = useMemo(
    () => (organizeResult?.details || []).filter(d => d.status === 'skipped'),
    [organizeResult]
  );

  const handleFolderImport = () => {
    folderInputRef.current?.click();
  };

  const handlePickLibraryRoot = async () => {
    if (!isDesktop) {
      setLibraryError('Native directory picker requires Tauri desktop runtime.');
      return;
    }
    try {
      const selected = await selectDirectory('Select LocalScholar Library Root');
      if (selected) {
        setLibraryRoot(selected);
      }
    } catch (error: any) {
      setLibraryError(error.message || 'Failed to open native directory selector.');
    }
  };

  const handleOrganize = async () => {
    if (!isDesktop) {
      setLibraryError('One-click local organization requires Tauri desktop runtime.');
      return;
    }
    if (!libraryRoot.trim()) {
      setLibraryError('Please set the Library root path first.');
      return;
    }
    if (completedItems.length === 0) {
      setLibraryError('No completed PDF metadata available for organization.');
      return;
    }

    setIsOrganizing(true);
    setOrganizeProgress('');
    setLibraryError('');
    setOrganizeResult(null);
    setRollbackPreview(null);
    setRollbackResult(null);

    try {
      let operationId: string | undefined;
      let aggregate: DesktopOrganizeResult | null = null;

      for (let start = 0; start < completedItems.length; start += ORGANIZE_BATCH_SIZE) {
        const chunk = completedItems.slice(start, start + ORGANIZE_BATCH_SIZE);
        setOrganizeProgress(`整理中：${Math.min(start + chunk.length, completedItems.length)}/${completedItems.length}`);

        const entries = await Promise.all(chunk.map(async (item) => ({
          fileName: item.originalName,
          suggestedFilename: item.metadata?.suggestedFilename || item.originalName,
          category: item.metadata?.category || 'Uncategorized',
          journal: item.metadata?.journal || 'Unknown',
          year: item.metadata?.year || 'Unknown',
          sourcePath: item.sourcePath,
          fileBase64: item.sourcePath ? undefined : await fileToBase64(item.file),
        })));

        const chunkResult = await applyOrganization(libraryRoot.trim(), entries, operationId);
        operationId = chunkResult.operationId;

        if (!aggregate) {
          aggregate = { ...chunkResult, details: [...chunkResult.details] };
        } else {
          aggregate.organizedCount += chunkResult.organizedCount;
          aggregate.skippedCount += chunkResult.skippedCount;
          aggregate.renamedCount += chunkResult.renamedCount;
          aggregate.details.push(...chunkResult.details);
          aggregate.branches = chunkResult.branches;
          aggregate.totalManagedFiles = chunkResult.totalManagedFiles;
          aggregate.operationId = chunkResult.operationId;
        }
      }

      if (aggregate) {
        setOrganizeResult(aggregate);
      }
      await refreshOverview();
    } catch (error: any) {
      setLibraryError(error.message || 'Failed to organize files in library.');
    } finally {
      setOrganizeProgress('');
      setIsOrganizing(false);
    }
  };

  const handlePreviewRollback = async () => {
    if (!isDesktop) {
      setLibraryError('Rollback preview requires Tauri desktop runtime.');
      return;
    }
    if (!libraryRoot.trim()) {
      setLibraryError('Please set the Library root path first.');
      return;
    }

    setIsPreviewingRollback(true);
    setLibraryError('');
    setRollbackResult(null);
    try {
      const preview = await previewLastRollback(libraryRoot.trim());
      setRollbackPreview(preview);
    } catch (error: any) {
      setLibraryError(error.message || 'Failed to preview rollback operation.');
    } finally {
      setIsPreviewingRollback(false);
    }
  };

  const handleRollback = async () => {
    if (!isDesktop) {
      setLibraryError('Rollback requires Tauri desktop runtime.');
      return;
    }
    if (!libraryRoot.trim()) {
      setLibraryError('Please set the Library root path first.');
      return;
    }

    setIsRollingBack(true);
    setLibraryError('');
    setRollbackPreview(null);
    try {
      const result = await rollbackLastOrganization(libraryRoot.trim());
      setRollbackResult(result);
      await refreshOverview();
    } catch (error: any) {
      setLibraryError(error.message || 'Failed to rollback last organization operation.');
    } finally {
      setIsRollingBack(false);
    }
  };

  return (
    <div className="min-h-screen">
      <SettingsPanel isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} settings={settings} onSave={setSettings} />
      <UserGuide isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />

      <div className="max-w-7xl mx-auto px-6 py-10 space-y-10">

        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Library className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
                LocalScholar
                <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 text-[10px] font-bold uppercase tracking-widest border border-indigo-500/20">Beta</span>
              </h1>
              <p className="text-slate-500 text-xs font-medium">科研文献自动化治理中心</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-3 rounded-xl glass-card hover:bg-white/5 transition-all text-slate-400 hover:text-white"
            >
              <SettingsIcon className="w-5 h-5" />
            </button>
            <button
              onClick={() => setIsGuideOpen(true)}
              className="px-5 py-2.5 rounded-xl btn-primary text-white text-sm font-bold flex items-center gap-2 shadow-xl shadow-indigo-600/10"
            >
              <HelpCircle className="w-4 h-4" /> 使用指南
            </button>
          </div>
        </nav>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: '待理文献', val: stats.total, icon: FileText, color: 'text-blue-400' },
            { label: '整理完成', val: stats.completed, icon: Zap, color: 'text-emerald-400' },
            { label: '分析中', val: stats.processing, icon: RefreshCw, color: 'text-indigo-400', spin: stats.processing > 0 },
            { label: '异常项', val: stats.errors, icon: AlertTriangle, color: 'text-rose-400' },
          ].map((item, i) => (
            <div key={i} className="glass-card rounded-2xl p-4 flex items-center gap-4 group">
              <div className={`p-3 rounded-xl glass-inset ${item.color}`}>
                <item.icon className={`w-5 h-5 ${item.spin ? 'animate-spin' : ''}`} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{item.label}</p>
                <p className="text-xl font-extrabold text-white">{item.val}</p>
              </div>
            </div>
          ))}
        </section>

        <main className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          <div className="lg:col-span-4 space-y-6">
            <div
              className={`
                relative h-80 rounded-3xl border-2 border-dashed transition-all duration-500 flex flex-col items-center justify-center gap-4 cursor-pointer overflow-hidden
                ${isDragging ? 'border-indigo-400 bg-indigo-500/10 scale-95' : 'border-white/10 glass-card hover:border-white/20'}
              `}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => document.getElementById('drop-input')?.click()}
            >
              <input id="drop-input" type="file" multiple accept=".pdf" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
              <input
                ref={folderInputRef}
                type="file"
                className="hidden"
                multiple
                accept=".pdf"
                onChange={(e) => handleFiles(e.target.files)}
              />

              <div className="w-20 h-20 rounded-full bg-slate-900 flex items-center justify-center border border-white/5 relative z-10 shadow-inner shadow-white/5">
                <Upload className="w-8 h-8 text-indigo-400" />
              </div>

              <div className="text-center z-10 px-8">
                <h3 className="text-lg font-bold text-white">批量拖入 PDF</h3>
                <p className="text-slate-500 text-xs mt-2 leading-relaxed font-medium">
                  由 {settings.provider === 'ollama' ? '本地 Ollama' : '云端 AI'} 提供语义分析支持
                </p>
              </div>

              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleFolderImport(); }}
                className="z-10 px-4 py-2 rounded-xl bg-indigo-600/80 hover:bg-indigo-600 text-white text-xs font-bold transition-all"
              >
                选择文献目录自动发现 PDF
              </button>

              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500/20 blur-[100px] pointer-events-none rounded-full" />
            </div>

            <div className="glass-card rounded-3xl p-6 space-y-5">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-indigo-400" /> 本地 Library 管理
              </h4>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest px-1">Library 根目录路径</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={libraryRoot}
                    onChange={(e) => setLibraryRoot(e.target.value)}
                    placeholder={isDesktop ? '例如: D:\\LocalScholarLibrary 或 /data/LocalScholarLibrary' : '桌面模式下填写本地绝对路径'}
                    className="flex-1 bg-black/20 border border-white/5 rounded-xl px-4 py-3 text-sm text-indigo-300 font-semibold focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  />
                  <button
                    onClick={handlePickLibraryRoot}
                    disabled={!isDesktop}
                    className="px-3 py-3 rounded-xl bg-indigo-600/70 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition-all flex items-center gap-1"
                  >
                    <FolderSearch className="w-3.5 h-3.5" /> 选择
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={handleOrganize}
                  disabled={!isDesktop || isOrganizing || completedItems.length === 0}
                  className="px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition-all flex items-center justify-center gap-2"
                >
                  {isOrganizing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />} 一键整理
                </button>
                <button
                  onClick={handlePreviewRollback}
                  disabled={!isDesktop || isPreviewingRollback || !libraryOverview?.pendingRollbackOperations}
                  className="px-4 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition-all flex items-center justify-center gap-2"
                >
                  {isPreviewingRollback ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />} 预览回滚
                </button>
                <button
                  onClick={handleRollback}
                  disabled={!isDesktop || isRollingBack || !libraryOverview?.pendingRollbackOperations}
                  className="px-4 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition-all flex items-center justify-center gap-2"
                >
                  {isRollingBack ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />} 回滚上次
                </button>
              </div>

              <div className="text-[10px] text-slate-500 leading-relaxed space-y-1">
                <p>运行环境：<span className={isDesktop ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>{isDesktop ? 'Tauri Desktop' : 'Web (只支持脚本导出)'}</span></p>
                <p>策略：源文件只读复制处理，Library 内冲突默认 `auto_rename`。</p>
                {organizeProgress && <p className="text-indigo-300 font-bold">{organizeProgress}</p>}
              </div>

              {libraryError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[10px] text-rose-300 font-medium">
                  {libraryError}
                </div>
              )}
            </div>

            <div className="glass-card rounded-3xl p-6 space-y-6">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" /> 核心优势
              </h4>
              <div className="space-y-4">
                {[
                  { icon: ShieldCheck, title: '隐私至上', desc: '本地解析，仅发送摘要分析' },
                  { icon: Zap, title: '深度索引', desc: '自动识别 DOI、年份与顶级期刊' },
                  { icon: Layers, title: '结构化整理', desc: '生成分类目录，告别命名混乱' }
                ].map((feat, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="shrink-0 w-8 h-8 rounded-lg glass-inset flex items-center justify-center">
                      <feat.icon className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">{feat.title}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5 leading-normal">{feat.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 space-y-8">
            {files.length === 0 ? (
              <div className="glass-card rounded-3xl h-[500px] flex flex-col items-center justify-center text-center p-12 border-dashed border-white/5">
                <div className="w-24 h-24 rounded-3xl glass-inset flex items-center justify-center mb-6 opacity-40">
                  <FolderOpen className="w-10 h-10 text-indigo-400" />
                </div>
                <h3 className="text-xl font-bold text-slate-300">准备好开始了吗？</h3>
                <p className="text-slate-500 text-sm mt-3 max-w-sm font-medium">
                  将您的 Arxiv 论文、会议报告或学术期刊拖入左侧区域，我们将为您自动整理命名。
                </p>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <LayoutDashboard className="w-5 h-5 text-indigo-400" />
                    <h2 className="text-xl font-bold text-white tracking-tight">处理队列</h2>
                  </div>
                  <button
                    onClick={() => setFiles([])}
                    className="text-[10px] font-bold text-slate-500 hover:text-rose-400 uppercase tracking-widest transition-colors"
                  >
                    重置列表
                  </button>
                </div>

                <div className="grid gap-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                  {files.map(file => (
                    <PaperCard key={file.id} item={file} onRetry={() => updateFileState(file.id, ProcessingState.QUEUED)} />
                  ))}
                </div>

                {libraryOverview && (
                  <div className="glass-card rounded-2xl p-5 border border-indigo-500/10">
                    <p className="text-xs font-bold text-indigo-300">Library 已管理文件：{libraryOverview.managedFiles}</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      分支数量：{libraryOverview.branches.length} | 可回滚操作：{libraryOverview.pendingRollbackOperations}
                    </p>
                  </div>
                )}

                {organizeResult && (
                  <div className="glass-card rounded-2xl p-5 border border-emerald-500/10 space-y-3">
                    <p className="text-xs font-bold text-emerald-300">
                      整理完成：成功 {organizeResult.organizedCount}，跳过 {organizeResult.skippedCount}，自动重命名 {organizeResult.renamedCount}
                    </p>
                    <p className="text-[11px] text-slate-400">Operation ID: {organizeResult.operationId}</p>
                    {renamedDetails.length > 0 && (
                      <div className="text-[11px] text-amber-300/80 space-y-1">
                        {renamedDetails.slice(0, 6).map((d, i) => (
                          <p key={`${d.originalName}-${i}`}>
                            auto_rename: {d.autoRenamedFrom} {'->'} {d.destinationPath?.split(/[\\/]/).pop()}
                          </p>
                        ))}
                        {renamedDetails.length > 6 && <p>...以及另外 {renamedDetails.length - 6} 条重命名记录</p>}
                      </div>
                    )}
                    {skippedDetails.length > 0 && (
                      <div className="text-[11px] text-rose-300/80 space-y-1">
                        {skippedDetails.slice(0, 6).map((d, i) => (
                          <p key={`skip-${d.originalName}-${i}`}>
                            skipped: {d.originalName} ({d.message})
                          </p>
                        ))}
                        {skippedDetails.length > 6 && <p>...以及另外 {skippedDetails.length - 6} 条跳过记录</p>}
                      </div>
                    )}
                  </div>
                )}

                {rollbackPreview && (
                  <div className="glass-card rounded-2xl p-5 border border-slate-500/20 space-y-2">
                    <p className="text-xs font-bold text-slate-200">
                      回滚预览：{rollbackPreview.totalItems} 项，缺失 {rollbackPreview.missingItems} 项
                    </p>
                    {rollbackPreview.operationId && (
                      <p className="text-[11px] text-slate-400">Operation ID: {rollbackPreview.operationId}</p>
                    )}
                    <div className="text-[11px] text-slate-400 space-y-1">
                      {rollbackPreview.preview.slice(0, 5).map((item, idx) => (
                        <p key={`${item.destinationPath}-${idx}`}>
                          {item.exists ? '[OK]' : '[Missing]'} {item.destinationPath.split(/[\\/]/).pop()} {'->'} rollback/
                        </p>
                      ))}
                      {rollbackPreview.preview.length > 5 && (
                        <p>...还有 {rollbackPreview.preview.length - 5} 条可回滚记录</p>
                      )}
                    </div>
                  </div>
                )}

                {rollbackResult && (
                  <div className="glass-card rounded-2xl p-5 border border-amber-500/10">
                    <p className="text-xs font-bold text-amber-300">回滚结果：恢复 {rollbackResult.restoredCount} 个文件</p>
                    {rollbackResult.operationId && (
                      <p className="text-[11px] text-slate-400 mt-1">Operation ID: {rollbackResult.operationId}</p>
                    )}
                  </div>
                )}

                {stats.completed > 0 && (
                  <ScriptGenerator files={files} />
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;

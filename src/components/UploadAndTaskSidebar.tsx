import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Cpu,
  Download,
  FileCode2,
  FileText,
  FlaskConical,
  Folder,
  FolderGit2,
  FolderOpen,
  Github,
  Laptop,
  Lock,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import type {
  AIProviderId,
  AIProviderInfo,
  RepoFile,
  SampleRepositoryPreset,
  ValidationReport,
} from '../types/repopilot';

interface UploadAndTaskSidebarProps {
  sampleRepos: SampleRepositoryPreset[];
  activeRepoId: string;
  onSelectSampleRepo: (repoId: string) => void;
  onSyncLocalWorkspace?: (subdir?: string) => Promise<void>;
  isSyncingLocalWorkspace?: boolean;
  onDownloadVsCodeExtension?: () => Promise<void>;
  activeWorkspaceRoot?: string;
  onUploadZipFile: (file: File) => void;
  onImportGitHubRepo: (params: {
    repoUrl: string;
    branch?: string;
    githubToken?: string;
  }) => Promise<void>;
  isImportingGitHub?: boolean;
  onTriggerMaliciousZipTest: () => void;
  validationReport: ValidationReport | null;
  isValidatingZip: boolean;
  files: RepoFile[];
  selectedFilePath: string;
  onSelectFile: (path: string) => void;
  modifiedPaths: Set<string>;
  dirtyPaths: Set<string>;
  providers: AIProviderInfo[];
  selectedProviderId: AIProviderId;
  onSelectProviderId: (id: AIProviderId) => void;
  customModel: string;
  onChangeCustomModel: (model: string) => void;
  taskDescription: string;
  onChangeTaskDescription: (val: string) => void;
  suggestedTasks: string[];
  onAnalyzeTask: () => void;
  isAnalyzing: boolean;
}

interface TreeDirectoryNode {
  name: string;
  fullPath: string;
  directories: Map<string, TreeDirectoryNode>;
  files: RepoFile[];
}

function buildDirectoryTree(files: RepoFile[]): TreeDirectoryNode {
  const root: TreeDirectoryNode = {
    name: '',
    fullPath: '',
    directories: new Map(),
    files: [],
  };

  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    let current = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const dirName = parts[i];
      const dirPath = parts.slice(0, i + 1).join('/');
      if (!current.directories.has(dirName)) {
        current.directories.set(dirName, {
          name: dirName,
          fullPath: dirPath,
          directories: new Map(),
          files: [],
        });
      }
      current = current.directories.get(dirName)!;
    }
    current.files.push(file);
  }

  return root;
}

export const UploadAndTaskSidebar: React.FC<UploadAndTaskSidebarProps> = ({
  sampleRepos,
  activeRepoId,
  onSelectSampleRepo,
  onSyncLocalWorkspace,
  isSyncingLocalWorkspace = false,
  onDownloadVsCodeExtension,
  activeWorkspaceRoot,
  onUploadZipFile,
  onImportGitHubRepo,
  isImportingGitHub = false,
  onTriggerMaliciousZipTest,
  validationReport,
  isValidatingZip,
  files,
  selectedFilePath,
  onSelectFile,
  modifiedPaths,
  dirtyPaths,
  providers,
  selectedProviderId,
  onSelectProviderId,
  customModel,
  onChangeCustomModel,
  taskDescription,
  onChangeTaskDescription,
  suggestedTasks,
  onAnalyzeTask,
  isAnalyzing,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());
  const [showFallbackIngestion, setShowFallbackIngestion] =
    useState<boolean>(false);
  const [showGitHubModal, setShowGitHubModal] = useState<boolean>(false);
  const [githubUrl, setGithubUrl] = useState<string>('');
  const [githubBranch, setGithubBranch] = useState<string>('');
  const [githubToken, setGithubToken] = useState<string>('');
  const [showCompanionInfo, setShowCompanionInfo] = useState<boolean>(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadZipFile(file);
      e.target.value = '';
    }
  };

  const toggleDirectory = (dirPath: string) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  };

  const selectedProvider =
    providers.find((p) => p.id === selectedProviderId) || providers[0];

  const filteredFilesAndSnippets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return {
        files,
        contentMatches: new Map<string, { lineNum: number; preview: string }>(),
      };
    }

    const matched: RepoFile[] = [];
    const contentMatches = new Map<
      string,
      { lineNum: number; preview: string }
    >();

    for (const f of files) {
      const pathMatch = f.path.toLowerCase().includes(q);
      const lines = f.content.split('\n');
      let foundLine = -1;
      let foundPreview = '';

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(q)) {
          foundLine = i + 1;
          foundPreview = lines[i].trim().slice(0, 60);
          break;
        }
      }

      if (pathMatch || foundLine !== -1) {
        matched.push(f);
        if (foundLine !== -1) {
          contentMatches.set(f.path, {
            lineNum: foundLine,
            preview: foundPreview,
          });
        }
      }
    }

    return { files: matched, contentMatches };
  }, [files, searchQuery]);

  const treeRoot = useMemo(
    () => buildDirectoryTree(filteredFilesAndSnippets.files),
    [filteredFilesAndSnippets.files]
  );

  const renderTreeNode = (
    node: TreeDirectoryNode,
    depth = 0
  ): React.ReactNode => {
    const dirEntries = Array.from(node.directories.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    const fileEntries = [...node.files].sort((a, b) =>
      a.path.localeCompare(b.path)
    );

    return (
      <>
        {dirEntries.map((dir) => {
          const isCollapsed = collapsedDirs.has(dir.fullPath);
          return (
            <div key={`dir-${dir.fullPath}`} className="flex flex-col">
              <button
                type="button"
                onClick={() => toggleDirectory(dir.fullPath)}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                className="w-full py-1 pr-2 text-left flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800/50 hover:text-slate-100 rounded transition-colors cursor-pointer"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                )}
                {isCollapsed ? (
                  <Folder className="w-3.5 h-3.5 text-sky-400/80 shrink-0" />
                ) : (
                  <FolderOpen className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                )}
                <span className="font-mono text-xs truncate">{dir.name}</span>
              </button>
              {!isCollapsed && renderTreeNode(dir, depth + 1)}
            </div>
          );
        })}

        {fileEntries.map((file) => {
          const fileName = file.path.split('/').pop() || file.path;
          const isSelected = selectedFilePath === file.path;
          const isModified = modifiedPaths.has(file.path);
          const isDirty = dirtyPaths.has(file.path);
          const matchSnippet = filteredFilesAndSnippets.contentMatches.get(
            file.path
          );

          return (
            <button
              key={file.path}
              type="button"
              onClick={() => onSelectFile(file.path)}
              style={{ paddingLeft: `${depth * 12 + 20}px` }}
              className={`w-full py-1.5 pr-2 text-left flex flex-col gap-0.5 rounded transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-sky-500/15 text-sky-200 border-l-2 border-sky-400'
                  : 'text-slate-300 hover:bg-slate-800/40 hover:text-slate-100'
              }`}
            >
              <div className="w-full flex items-center justify-between gap-2 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  {file.isTestFile ? (
                    <FlaskConical className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  ) : [
                      'python',
                      'typescript',
                      'javascript',
                      'go',
                      'rust',
                      'java',
                    ].includes(file.language) ? (
                    <FileCode2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  ) : (
                    <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )}
                  <span className="font-mono text-xs truncate">{fileName}</span>
                  {isDirty && (
                    <span
                      title="Unsaved editor changes"
                      className="text-amber-400 font-bold text-xs leading-none"
                    >
                      ●
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-mono tabular-nums">
                  {isModified && (
                    <span className="px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      M
                    </span>
                  )}
                  <span className="text-slate-500">{file.sizeBytes}B</span>
                </div>
              </div>

              {matchSnippet && (
                <div className="text-[10px] font-mono text-amber-300/90 truncate pl-5">
                  L{matchSnippet.lineNum}: {matchSnippet.preview}
                </div>
              )}
            </button>
          );
        })}
      </>
    );
  };

  const handleGitHubSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubUrl.trim()) return;
    await onImportGitHubRepo({
      repoUrl: githubUrl.trim(),
      branch: githubBranch.trim() || undefined,
      githubToken: githubToken.trim() || undefined,
    });
    setGithubToken('');
  };

  return (
    <aside
      aria-label="Repository Explorer and Workspace Sidebar"
      className="w-full lg:w-[350px] shrink-0 h-full min-h-0 border-b lg:border-b-0 lg:border-r border-slate-800/90 bg-[#0E131F] flex flex-col overflow-hidden"
    >
      {/* Independent Scroll Container for Left Sidebar */}
      <div
        data-testid="left-sidebar-scroll"
        className="flex-1 min-h-0 overflow-y-auto p-3.5 flex flex-col gap-3.5"
      >
        {/* Section 1: Primary Mode — Local VS Code Workspace Agent */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Laptop className="w-3.5 h-3.5 text-sky-400" />
              <span>Local VS Code Workspace</span>
            </h2>
            <span className="text-[10px] text-emerald-300 font-mono bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded">
              Primary Mode
            </span>
          </div>

          {/* Primary Local Workspace Card (No ZIP Upload Required) */}
          <div className="rounded-lg border border-sky-500/30 bg-sky-950/15 p-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-semibold text-sky-200 truncate">
                Root: {activeWorkspaceRoot || '/app/applet'}
              </span>
              <button
                type="button"
                onClick={() => setShowCompanionInfo((v) => !v)}
                className="text-[10px] font-mono text-sky-300 hover:underline shrink-0 cursor-pointer"
              >
                {showCompanionInfo ? 'Hide VS Code Setup' : 'VS Code Setup'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {onSyncLocalWorkspace && (
                <button
                  type="button"
                  onClick={() => onSyncLocalWorkspace()}
                  disabled={isSyncingLocalWorkspace}
                  className="flex items-center justify-center gap-1.5 rounded-md bg-sky-500 px-2 py-1.5 text-[11px] font-semibold text-slate-950 hover:bg-sky-400 transition-colors cursor-pointer disabled:opacity-50"
                  title="Inspect open local project directory directly without ZIP upload"
                >
                  <RefreshCw
                    className={`w-3 h-3 shrink-0 ${
                      isSyncingLocalWorkspace ? 'animate-spin' : ''
                    }`}
                  />
                  <span>
                    {isSyncingLocalWorkspace
                      ? 'Syncing...'
                      : 'Open Local Project'}
                  </span>
                </button>
              )}

              {onSyncLocalWorkspace && (
                <button
                  type="button"
                  onClick={() => onSyncLocalWorkspace('vscode-extension')}
                  disabled={isSyncingLocalWorkspace}
                  className="flex items-center justify-center gap-1.5 rounded-md border border-indigo-500/40 bg-indigo-500/15 px-2 py-1.5 text-[11px] font-medium text-indigo-200 hover:bg-indigo-500/25 transition-colors cursor-pointer disabled:opacity-50"
                  title="Load the /vscode-extension TypeScript source files into the editor"
                >
                  <Laptop className="w-3 h-3 text-indigo-300 shrink-0" />
                  <span>Inspect Extension</span>
                </button>
              )}
            </div>

            {/* Privacy Notice Banner */}
            <div className="flex items-start gap-1.5 text-[10px] text-slate-300 leading-snug pt-1 border-t border-slate-800/80">
              <Lock className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-100">Privacy Notice:</strong> Only
                relevant code excerpts (secrets redacted) are sent to your AI
                provider; your full repository is never uploaded.
              </span>
            </div>
          </div>

          {/* Expandable VS Code Extension Setup & Download Card */}
          {showCompanionInfo && (
            <div className="rounded-lg border border-indigo-500/30 bg-[#0B0F17] p-2.5 text-[11px] text-slate-300 flex flex-col gap-2 leading-relaxed">
              <div className="font-semibold text-indigo-200 flex items-center justify-between">
                <span>VS Code Extension (`vscode-extension/`)</span>
                {onDownloadVsCodeExtension && (
                  <button
                    type="button"
                    onClick={() => onDownloadVsCodeExtension()}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-500 text-slate-950 font-semibold text-[10px] hover:bg-indigo-400 cursor-pointer"
                  >
                    <Download className="w-2.5 h-2.5" />
                    <span>Download Extension</span>
                  </button>
                )}
              </div>
              <p className="text-slate-400">
                Run in VS Code Extension Development Host (`F5`):
              </p>
              <div className="font-mono text-[10px] bg-[#070A10] border border-slate-800 rounded p-2 text-indigo-200">
                <div>$ cd vscode-extension &amp;&amp; npm install</div>
                <div>$ npm run compile &amp;&amp; code .</div>
                <div># Press F5 in VS Code to launch Extension Host</div>
              </div>
            </div>
          )}

          {/* Active Workspace / Sample Preset Selector */}
          <div className="flex flex-col gap-1">
            <label htmlFor="sample-repo-select" className="sr-only">
              Active Workspace Target
            </label>
            <select
              id="sample-repo-select"
              value={activeRepoId}
              onChange={(e) => onSelectSampleRepo(e.target.value)}
              className="w-full rounded-lg border border-slate-700/90 bg-[#0B0F17] px-2.5 py-1.5 text-xs text-slate-100 focus:border-sky-400 focus:outline-none"
            >
              {sampleRepos.map((repo) => (
                <option key={repo.id} value={repo.id}>
                  Workspace Preset: {repo.name} — {repo.tagline}
                </option>
              ))}
              {!sampleRepos.some((r) => r.id === activeRepoId) && (
                <option value={activeRepoId}>
                  Local / Active: {validationReport?.archiveName || activeRepoId}
                </option>
              )}
            </select>
          </div>

          {/* Optional Fallback Toggle (ZIP Upload & GitHub URL) */}
          <div className="flex items-center justify-between pt-0.5">
            <button
              type="button"
              onClick={() => setShowFallbackIngestion((v) => !v)}
              className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
            >
              {showFallbackIngestion ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              <span>Optional Fallback: ZIP Upload or GitHub URL</span>
            </button>
          </div>

          {showFallbackIngestion && (
            <div className="flex flex-col gap-2 pt-1">
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,application/zip"
                  onChange={handleFileChange}
                  className="hidden"
                  id="repo-zip-upload-input"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isValidatingZip}
                  className="flex items-center justify-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/70 px-2 py-1.5 text-[11px] font-medium text-slate-100 hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
                >
                  <Upload className="w-3 h-3 text-sky-400 shrink-0" />
                  <span>
                    {isValidatingZip ? 'Scanning...' : 'Upload .zip (Fallback)'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowGitHubModal((v) => !v)}
                  className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    showGitHubModal
                      ? 'border-sky-500/50 bg-sky-500/15 text-sky-200'
                      : 'border-slate-700 bg-slate-800/70 text-slate-100 hover:bg-slate-800'
                  }`}
                >
                  <Github className="w-3 h-3 text-sky-400 shrink-0" />
                  <span>GitHub URL</span>
                </button>
              </div>

              {showGitHubModal && (
                <form
                  onSubmit={handleGitHubSubmit}
                  className="rounded-lg border border-sky-500/30 bg-[#0B0F17] p-2.5 flex flex-col gap-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sky-200">
                      Import GitHub Repository
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Public or Private
                    </span>
                  </div>
                  <input
                    type="text"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    placeholder="https://github.com/owner/repo"
                    aria-label="GitHub Repository URL"
                    className="w-full rounded border border-slate-700 bg-[#0E131F] px-2.5 py-1.5 text-xs text-slate-100 focus:border-sky-400 focus:outline-none"
                  />
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      value={githubBranch}
                      onChange={(e) => setGithubBranch(e.target.value)}
                      placeholder="Branch (optional)"
                      aria-label="GitHub Branch"
                      className="w-full rounded border border-slate-700 bg-[#0E131F] px-2 py-1 text-[11px] text-slate-100 focus:border-sky-400 focus:outline-none"
                    />
                    <input
                      type="password"
                      value={githubToken}
                      onChange={(e) => setGithubToken(e.target.value)}
                      placeholder="PAT token (if private)"
                      aria-label="GitHub Personal Access Token"
                      className="w-full rounded border border-slate-700 bg-[#0E131F] px-2 py-1 text-[11px] text-slate-100 focus:border-sky-400 focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isImportingGitHub || !githubUrl.trim()}
                    className="w-full rounded bg-sky-500 py-1.5 text-xs font-semibold text-slate-950 hover:bg-sky-400 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isImportingGitHub
                      ? 'Fetching & Scanning GitHub Repo...'
                      : 'Import & Validate Repository'}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Compact Security Validation Badge */}
          {validationReport && (
            <div
              className={`rounded-lg border px-2.5 py-2 text-[11px] flex flex-col gap-1 ${
                validationReport.valid
                  ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-200'
                  : 'border-rose-500/40 bg-rose-950/25 text-rose-200'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-semibold">
                  {validationReport.valid ? (
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  )}
                  <span>
                    {validationReport.valid
                      ? 'Workspace Security Verified'
                      : 'Security Gate Rejected'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onTriggerMaliciousZipTest}
                  className="text-[10px] font-mono text-amber-300 hover:text-amber-200 px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 cursor-pointer"
                >
                  Test Reject Gate
                </button>
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span>
                  Path Check: PASS · Secrets:{' '}
                  {validationReport.checksSummary.secretScanPassed
                    ? 'REDACTED/PASS'
                    : 'BLOCK'}
                </span>
                <span>
                  {validationReport.acceptedFilesCount}/
                  {validationReport.totalFilesInspected} files
                </span>
              </div>
            </div>
          )}
        </section>

        {/* Section 2: Nested Repository File Tree & Search */}
        <section className="rounded-lg border border-slate-800 bg-[#0B0F17] flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between gap-2 bg-[#0E131F]">
            <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <FolderGit2 className="w-3.5 h-3.5 text-sky-400" />
              <span>
                Explorer Tree ({filteredFilesAndSnippets.files.length}/
                {files.length})
              </span>
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              Click to open tab
            </span>
          </div>

          <div className="p-2 border-b border-slate-800/80 bg-[#0B0F17]">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search filenames or file contents..."
                aria-label="Search filenames or file contents"
                className="w-full rounded border border-slate-800 bg-[#0E131F] pl-8 pr-2.5 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
              />
            </div>
          </div>

          <div
            data-testid="repo-tree-scroll"
            className="max-h-56 overflow-y-auto p-1.5 flex flex-col gap-0.5"
          >
            {filteredFilesAndSnippets.files.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-500">
                No matching files or code snippets found.
              </div>
            ) : (
              renderTreeNode(treeRoot, 0)
            )}
          </div>
        </section>

        {/* Section 3: Configurable AI Provider & Model */}
        <section className="rounded-lg border border-slate-800 bg-[#0B0F17] p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="provider-select"
              className="text-xs font-semibold text-slate-200 flex items-center gap-1.5"
            >
              <Cpu className="w-3.5 h-3.5 text-sky-400" />
              <span>AI Provider &amp; Model</span>
            </label>
            <span className="text-[10px] font-mono text-slate-400">
              {selectedProvider?.envVarName}:{' '}
              {selectedProvider?.configuredOnServer ? 'Active' : 'Fallback'}
            </span>
          </div>

          <select
            id="provider-select"
            value={selectedProviderId}
            onChange={(e) => onSelectProviderId(e.target.value as AIProviderId)}
            className="w-full rounded border border-slate-700/90 bg-[#0E131F] px-2.5 py-1.5 text-xs text-slate-100 focus:border-sky-400 focus:outline-none"
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.vendor})
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1.5">
            <label
              htmlFor="model-input"
              className="text-[11px] text-slate-400 shrink-0"
            >
              Model:
            </label>
            <input
              id="model-input"
              type="text"
              value={customModel}
              onChange={(e) => onChangeCustomModel(e.target.value)}
              placeholder={selectedProvider?.defaultModel}
              className="w-full rounded border border-slate-800 bg-[#0E131F] px-2 py-1 text-xs font-mono text-sky-300 focus:border-sky-400 focus:outline-none"
            />
          </div>
        </section>

        {/* Section 4: Task Prompt & Preset Scenarios */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="task-description-input"
              className="text-xs font-semibold text-slate-200"
            >
              Engineering Task Prompt
            </label>
            <span className="text-[10px] text-slate-400 font-mono">
              Synced with Chat
            </span>
          </div>

          <textarea
            id="task-description-input"
            rows={3}
            value={taskDescription}
            onChange={(e) => onChangeTaskDescription(e.target.value)}
            placeholder="Describe the bug, failing test, or feature to implement..."
            className="w-full rounded-lg border border-slate-700/90 bg-[#0B0F17] p-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none leading-relaxed"
          />

          {suggestedTasks.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-medium text-slate-400">
                Sample Task Presets:
              </span>
              <div className="flex flex-col gap-1 max-h-28 overflow-y-auto pr-1">
                {suggestedTasks.map((st, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onChangeTaskDescription(st)}
                    className={`text-left text-[11px] leading-snug px-2 py-1 rounded border transition-colors cursor-pointer ${
                      taskDescription === st
                        ? 'border-sky-500/40 bg-sky-500/10 text-sky-200'
                        : 'border-slate-800/90 bg-[#0B0F17] text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={onAnalyzeTask}
            disabled={isAnalyzing || !taskDescription.trim()}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>
              {isAnalyzing
                ? 'Inspecting & Generating Patch...'
                : 'Analyze & Generate Plan + Patch'}
            </span>
          </button>
        </section>
      </div>
    </aside>
  );
};

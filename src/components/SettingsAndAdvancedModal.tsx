import React, { useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Download,
  FolderGit2,
  FolderUp,
  Github,
  Laptop,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Upload,
  X,
} from 'lucide-react';
import type {
  AIProviderId,
  AIProviderInfo,
  ProposedPatchBundle,
  RepoFile,
  SampleRepositoryPreset,
  SandboxExecutionMode,
  SandboxRunResponse,
  UploadLimitsConfig,
  ValidationReport,
} from '../types/repopilot';
import { ArchitectureDocsView } from './ArchitectureDocsView';
import { DiagnosticsPanelView } from './DiagnosticsPanelView';
import { SandboxConsoleView } from './SandboxConsoleView';

export type SettingsTabId = 'general' | 'vscode' | 'sandbox' | 'diagnostics';

interface SettingsAndAdvancedModalProps {
  isOpen: boolean;
  activeTab: SettingsTabId;
  onChangeTab: (tab: SettingsTabId) => void;
  onClose: () => void;
  providers: AIProviderInfo[];
  selectedProviderId: AIProviderId;
  onSelectProviderId: (id: AIProviderId) => void;
  customModel: string;
  onChangeCustomModel: (model: string) => void;
  contextTokenBudget: number;
  onChangeContextTokenBudget: (budget: number) => void;
  uploadLimits: UploadLimitsConfig;
  onChangeUploadLimits: (limits: UploadLimitsConfig) => void;
  isolatedSandboxAvailable: boolean;
  sandboxMode: SandboxExecutionMode;
  onChangeSandboxMode: (mode: SandboxExecutionMode) => void;
  patchBundle: ProposedPatchBundle | null;
  sandboxRunResult: SandboxRunResponse | null;
  isRunningSandbox: boolean;
  onRunSandboxTests: () => void;
  onApproveAndRun: () => void;
  onDownloadPatchFile: () => void;
  onDownloadPatchedZip: () => void;
  onDownloadVsCodeExtension: () => Promise<void>;
  onInspectExtensionInEditor: () => Promise<void>;
  files: RepoFile[];
  taskDescription: string;
  validationReport: ValidationReport | null;
  onTriggerMaliciousZipTest: () => void;
}

export const SettingsAndAdvancedModal: React.FC<
  SettingsAndAdvancedModalProps
> = ({
  isOpen,
  activeTab,
  onChangeTab,
  onClose,
  providers,
  selectedProviderId,
  onSelectProviderId,
  customModel,
  onChangeCustomModel,
  contextTokenBudget,
  onChangeContextTokenBudget,
  uploadLimits,
  onChangeUploadLimits,
  isolatedSandboxAvailable,
  sandboxMode,
  onChangeSandboxMode,
  patchBundle,
  sandboxRunResult,
  isRunningSandbox,
  onRunSandboxTests,
  onApproveAndRun,
  onDownloadPatchFile,
  onDownloadPatchedZip,
  onDownloadVsCodeExtension,
  onInspectExtensionInEditor,
  files,
  taskDescription,
  validationReport,
  onTriggerMaliciousZipTest,
}) => {
  if (!isOpen) return null;

  const selectedProvider =
    providers.find((p) => p.id === selectedProviderId) || providers[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings and Advanced Inspector"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="w-full max-w-4xl max-h-[88vh] rounded-2xl border border-neutral-800 bg-[#141416] text-neutral-100 flex flex-col overflow-hidden shadow-2xl">
        {/* Modal Header */}
        <div className="shrink-0 px-5 py-4 border-b border-neutral-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-semibold text-neutral-100">
              Settings &amp; Advanced
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="shrink-0 px-5 py-2.5 border-b border-neutral-800 bg-[#18181B] flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onChangeTab('general')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'general'
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Models &amp; Upload Limits</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeTab('vscode')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'vscode'
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>VS Code Extension &amp; Security</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeTab('sandbox')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'sandbox'
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Sandbox &amp; Test Logs</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeTab('diagnostics')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'diagnostics'
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Agent Diagnostics</span>
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
          {activeTab === 'general' && (
            <div className="flex flex-col gap-5">
              {/* 1. AI Model & Provider Configuration */}
              <div className="rounded-xl border border-neutral-800 bg-[#18181B] p-4 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-100">
                      AI Model &amp; Provider Configuration
                    </h3>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      Select the server-side AI provider. API keys are read strictly from server environment variables and are never exposed in frontend code.
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1.5 shrink-0 ${
                      selectedProvider.configuredOnServer
                        ? 'bg-emerald-950/60 border border-emerald-500/30 text-emerald-300'
                        : 'bg-amber-950/60 border border-amber-500/30 text-amber-300'
                    }`}
                  >
                    {selectedProvider.configuredOnServer ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Credentials Active</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Missing {selectedProvider.envVarName}</span>
                      </>
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="provider-select"
                      className="text-xs font-medium text-neutral-300"
                    >
                      Provider
                    </label>
                    <select
                      id="provider-select"
                      value={selectedProviderId}
                      onChange={(e) =>
                        onSelectProviderId(e.target.value as AIProviderId)
                      }
                      className="rounded-lg border border-neutral-700 bg-[#111113] px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-neutral-500"
                    >
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (
                          {p.configuredOnServer
                            ? 'Configured'
                            : `Requires ${p.envVarName}`}
                          )
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="model-input"
                      className="text-xs font-medium text-neutral-300"
                    >
                      Model Identifier
                    </label>
                    <input
                      id="model-input"
                      type="text"
                      value={customModel}
                      onChange={(e) => onChangeCustomModel(e.target.value)}
                      className="rounded-lg border border-neutral-700 bg-[#111113] px-3 py-2 font-mono text-xs text-neutral-100 focus:outline-none focus:border-neutral-500"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-800 text-xs text-neutral-400">
                  <span>
                    Endpoint:{' '}
                    <code className="font-mono text-neutral-300">
                      {selectedProvider.endpointUrl}
                    </code>
                  </span>
                  <span>
                    Server Env Var:{' '}
                    <code className="font-mono text-neutral-300">
                      {selectedProvider.envVarName}
                    </code>
                  </span>
                </div>
              </div>

              {/* 2. Configurable Upload Validation Limits */}
              <div className="rounded-xl border border-neutral-800 bg-[#18181B] p-4 flex flex-col gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-100">
                    Configurable Upload Validation Limits
                  </h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Enforced by the backend upload validator for both ZIP archives and multi-file uploads. Path traversal (`..`), `.env` files, private keys, and secrets are always blocked or excluded.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="limit-file-count"
                      className="font-medium text-neutral-300"
                    >
                      Max File Count
                    </label>
                    <input
                      id="limit-file-count"
                      type="number"
                      min={5}
                      max={500}
                      value={uploadLimits.maxFileCount}
                      onChange={(e) =>
                        onChangeUploadLimits({
                          ...uploadLimits,
                          maxFileCount: Math.max(
                            5,
                            Math.min(500, Number(e.target.value) || 120)
                          ),
                        })
                      }
                      className="rounded-lg border border-neutral-700 bg-[#111113] px-3 py-2 font-mono text-xs text-neutral-100"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="limit-file-kb"
                      className="font-medium text-neutral-300"
                    >
                      Max Per-File Size (KB)
                    </label>
                    <input
                      id="limit-file-kb"
                      type="number"
                      min={16}
                      max={2048}
                      value={Math.round(uploadLimits.maxFileBytes / 1024)}
                      onChange={(e) =>
                        onChangeUploadLimits({
                          ...uploadLimits,
                          maxFileBytes:
                            Math.max(
                              16,
                              Math.min(2048, Number(e.target.value) || 256)
                            ) * 1024,
                        })
                      }
                      className="rounded-lg border border-neutral-700 bg-[#111113] px-3 py-2 font-mono text-xs text-neutral-100"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="limit-archive-kb"
                      className="font-medium text-neutral-300"
                    >
                      Max Total Project Size (KB)
                    </label>
                    <input
                      id="limit-archive-kb"
                      type="number"
                      min={256}
                      max={10240}
                      value={Math.round(uploadLimits.maxArchiveBytes / 1024)}
                      onChange={(e) =>
                        onChangeUploadLimits({
                          ...uploadLimits,
                          maxArchiveBytes:
                            Math.max(
                              256,
                              Math.min(10240, Number(e.target.value) || 4096)
                            ) * 1024,
                        })
                      }
                      className="rounded-lg border border-neutral-700 bg-[#111113] px-3 py-2 font-mono text-xs text-neutral-100"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Context Token Budget */}
              <div className="rounded-xl border border-neutral-800 bg-[#18181B] p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-100">
                      Context Token Budget (Chunking &amp; Retrieval)
                    </h3>
                    <p className="text-xs text-neutral-400">
                      For large uploaded projects, RepoPilot AI ranks and chunks relevant files within this token budget instead of sending every file in one request.
                    </p>
                  </div>
                  <span className="font-mono text-xs text-neutral-200 tabular-nums shrink-0">
                    {contextTokenBudget} tokens
                  </span>
                </div>
                <input
                  type="range"
                  min={2000}
                  max={16000}
                  step={1000}
                  value={contextTokenBudget}
                  onChange={(e) =>
                    onChangeContextTokenBudget(Number(e.target.value))
                  }
                  aria-label="Context Token Budget"
                  className="w-full"
                />
              </div>

              {/* 4. Validation Report Summary */}
              {validationReport && (
                <div className="rounded-xl border border-neutral-800 bg-[#18181B] p-4 flex flex-col gap-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-neutral-200">
                      Upload Security Report ({validationReport.archiveName})
                    </span>
                    <button
                      type="button"
                      onClick={onTriggerMaliciousZipTest}
                      className="text-neutral-400 hover:text-white underline cursor-pointer"
                    >
                      Run Exploit Rejection Test
                    </button>
                  </div>
                  <div className="text-neutral-400">
                    {validationReport.acceptedFilesCount} safe files accepted ·{' '}
                    {(validationReport.totalSizeBytes / 1024).toFixed(1)} KB total ·
                    Path traversal, zip-bomb ratio, secret scan, and size limits enforced.
                  </div>
                  {validationReport.excludedFiles &&
                    validationReport.excludedFiles.length > 0 && (
                      <div className="pt-2 border-t border-neutral-800 flex flex-col gap-1">
                        <span className="font-medium text-amber-300">
                          Excluded from AI Context ({validationReport.excludedFiles.length}):
                        </span>
                        <div className="max-h-28 overflow-y-auto space-y-1 font-mono text-[11px] text-neutral-400">
                          {validationReport.excludedFiles.map((ex, i) => (
                            <div key={i}>
                              • {ex.path} — {ex.detail}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'vscode' && (
            <ArchitectureDocsView
              providers={providers}
              isolatedSandboxAvailable={isolatedSandboxAvailable}
              onDownloadVsCodeExtension={onDownloadVsCodeExtension}
              onInspectExtensionInEditor={async () => {
                await onInspectExtensionInEditor();
                onClose();
              }}
            />
          )}

          {activeTab === 'sandbox' && (
            <SandboxConsoleView
              patchBundle={patchBundle}
              sandboxMode={sandboxMode}
              onChangeSandboxMode={onChangeSandboxMode}
              isolatedSandboxAvailable={isolatedSandboxAvailable}
              sandboxRunResult={sandboxRunResult}
              isRunningSandbox={isRunningSandbox}
              onRunSandboxTests={onRunSandboxTests}
              onApproveAndRun={onApproveAndRun}
              onDownloadPatchFile={onDownloadPatchFile}
              onDownloadPatchedZip={onDownloadPatchedZip}
            />
          )}

          {activeTab === 'diagnostics' && (
            <DiagnosticsPanelView
              files={files}
              taskDescription={taskDescription}
              contextTokenBudget={contextTokenBudget}
              onChangeContextTokenBudget={onChangeContextTokenBudget}
              patchBundle={patchBundle}
              sandboxRunResult={sandboxRunResult}
            />
          )}
        </div>
      </div>
    </div>
  );
};

interface WorkspacePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProjectName: string;
  activeRepoId: string;
  isWorkspaceConnected: boolean;
  onToggleWorkspaceConnected: (connected: boolean) => void;
  onSyncLocalWorkspace: (subdir?: string) => Promise<void>;
  isSyncingLocalWorkspace: boolean;
  onDownloadVsCodeExtension: () => Promise<void>;
  sampleRepos: SampleRepositoryPreset[];
  onSelectSampleRepo: (repoId: string) => void;
  onUploadZipFile: (file: File) => void;
  onUploadFilesOrZip?: (files: FileList | File[]) => void;
  onImportGitHubRepo: (params: {
    repoUrl: string;
    branch?: string;
    githubToken?: string;
  }) => Promise<void>;
  isImportingGitHub: boolean;
}

export const WorkspacePickerModal: React.FC<WorkspacePickerModalProps> = ({
  isOpen,
  onClose,
  activeProjectName,
  activeRepoId,
  isWorkspaceConnected,
  onToggleWorkspaceConnected,
  onSyncLocalWorkspace,
  isSyncingLocalWorkspace,
  onDownloadVsCodeExtension,
  sampleRepos,
  onSelectSampleRepo,
  onUploadZipFile,
  onUploadFilesOrZip,
  onImportGitHubRepo,
  isImportingGitHub,
}) => {
  const [githubUrl, setGithubUrl] = useState<string>('');
  const [githubBranch, setGithubBranch] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Upload or Switch Project"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-[#141416] text-neutral-100 flex flex-col overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderUp className="w-4 h-4 text-neutral-300" />
            <h2 className="text-base font-semibold">
              Upload or Switch Code Project
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close workspace dialog"
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4 text-xs max-h-[80vh] overflow-y-auto">
          {/* 1. Primary Upload Project Section (ZIP or Multiple Individual Source Files) */}
          <div className="rounded-xl border border-neutral-700 bg-[#18181B] p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-neutral-100">
                Upload ZIP Archive or Individual Source Files
              </span>
              <span className="font-mono text-[11px] text-neutral-400">
                Active: {activeProjectName}
              </span>
            </div>
            <p className="text-neutral-400 leading-relaxed">
              Select a <code className="font-mono text-neutral-300">.zip</code> project archive or multiple individual source files (<code className="font-mono text-neutral-300">.py</code>, <code className="font-mono text-neutral-300">.ts</code>, <code className="font-mono text-neutral-300">.js</code>, <code className="font-mono text-neutral-300">.go</code>, <code className="font-mono text-neutral-300">.rs</code>, <code className="font-mono text-neutral-300">.java</code>, etc.). Secrets, <code className="font-mono text-neutral-300">.env</code> files, and build folders are excluded automatically.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2 rounded-lg bg-neutral-100 text-neutral-900 hover:bg-white font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Choose ZIP or Source Files</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".zip,.py,.pyi,.ts,.tsx,.js,.jsx,.mjs,.cjs,.java,.c,.h,.cpp,.cc,.hpp,.cs,.go,.rs,.php,.rb,.swift,.kt,.sql,.html,.css,.scss,.json,.yaml,.yml,.toml,.cfg,.ini,.xml,.md,.txt,.sh"
                onChange={(e) => {
                  const selected = e.target.files;
                  if (selected && selected.length > 0) {
                    onToggleWorkspaceConnected(true);
                    if (onUploadFilesOrZip) {
                      onUploadFilesOrZip(selected);
                    } else {
                      onUploadZipFile(selected[0]);
                    }
                    onClose();
                  }
                }}
                className="hidden"
              />
            </div>
          </div>

          {/* 2. Sample Code Projects */}
          <div className="flex flex-col gap-2">
            <span className="font-medium text-neutral-300">
              Sample Projects for Quick Testing
            </span>
            <div className="grid grid-cols-1 gap-1.5">
              {sampleRepos.map((repo) => (
                <button
                  key={repo.id}
                  type="button"
                  onClick={() => {
                    onToggleWorkspaceConnected(true);
                    onSelectSampleRepo(repo.id);
                    onClose();
                  }}
                  className={`px-3 py-2.5 rounded-xl border text-left flex items-center justify-between transition-colors cursor-pointer ${
                    activeRepoId === repo.id && isWorkspaceConnected
                      ? 'border-neutral-600 bg-neutral-800/90 text-white'
                      : 'border-neutral-800 bg-[#18181B] text-neutral-300 hover:border-neutral-700'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <FolderGit2 className="w-4 h-4 text-neutral-400 shrink-0" />
                    <span className="font-medium truncate">{repo.name}</span>
                  </span>
                  <span className="text-[11px] font-mono text-neutral-400 shrink-0">
                    {repo.files.length} files
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 3. GitHub Repository Import */}
          <div className="rounded-xl border border-neutral-800 bg-[#18181B] p-3.5 flex flex-col gap-2.5">
            <span className="font-medium text-neutral-200 flex items-center gap-1.5">
              <Github className="w-3.5 h-3.5" />
              <span>Import Public GitHub Repository</span>
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="flex-1 rounded-lg border border-neutral-700 bg-[#111113] px-2.5 py-1.5 text-xs text-neutral-100"
              />
              <input
                type="text"
                value={githubBranch}
                onChange={(e) => setGithubBranch(e.target.value)}
                placeholder="Branch"
                className="w-24 rounded-lg border border-neutral-700 bg-[#111113] px-2.5 py-1.5 text-xs text-neutral-100"
              />
              <button
                type="button"
                disabled={!githubUrl.trim() || isImportingGitHub}
                onClick={async () => {
                  onToggleWorkspaceConnected(true);
                  await onImportGitHubRepo({
                    repoUrl: githubUrl.trim(),
                    branch: githubBranch.trim() || undefined,
                  });
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-900 font-semibold cursor-pointer disabled:opacity-50"
              >
                Import
              </button>
            </div>
          </div>

          {/* 4. Local Workspace & VS Code Extension */}
          <div className="rounded-xl border border-neutral-800 bg-[#18181B] p-3.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Laptop className="w-4 h-4 text-neutral-400 shrink-0" />
              <span className="text-neutral-300">
                Local Workspace / VS Code Extension
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isSyncingLocalWorkspace}
                onClick={async () => {
                  onToggleWorkspaceConnected(true);
                  await onSyncLocalWorkspace();
                  onClose();
                }}
                className="px-2.5 py-1.5 rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw
                  className={`w-3 h-3 ${
                    isSyncingLocalWorkspace ? 'animate-spin' : ''
                  }`}
                />
                <span>Sync Local</span>
              </button>
              <button
                type="button"
                onClick={onDownloadVsCodeExtension}
                className="px-2.5 py-1.5 rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3 h-3" />
                <span>VS Code Ext</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

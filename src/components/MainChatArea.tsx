import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUp,
  Bug,
  Check,
  CheckCircle2,
  ChevronDown,
  Code2,
  Copy,
  Download,
  FileArchive,
  FileCode2,
  FolderUp,
  GitPullRequest,
  HelpCircle,
  Loader2,
  PanelLeftOpen,
  Play,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import type {
  BugReportItem,
  ChatMessageItem,
  CodeSelectionContext,
  ProposedPatchBundle,
  QuickAgentActionType,
  RepoFile,
  SandboxRunResponse,
  ValidationReport,
  VerificationStatus,
} from '../types/repopilot';
import { renderHighlightedLine } from '../utils/syntaxHighlighter';

interface MainChatAreaProps {
  isSidebarOpen: boolean;
  onOpenSidebar: () => void;
  activeProjectName: string;
  activeModelName: string;
  isProviderConfigured: boolean;
  activeProviderEnvVar: string;
  isWorkspaceConnected: boolean;
  onOpenWorkspaceModal: () => void;
  onOpenSettings: (
    initialTab?: 'general' | 'vscode' | 'sandbox' | 'diagnostics'
  ) => void;
  messages: ChatMessageItem[];
  taskDescription: string;
  onChangeTaskDescription: (val: string) => void;
  onSendMessage: (prompt: string, actionType?: QuickAgentActionType) => void;
  onTriggerQuickAction: (action: QuickAgentActionType) => void;
  isAnalyzing: boolean;
  isRunningSandbox: boolean;
  isUploadingProject: boolean;
  uploadStatusMessage: string | null;
  onDismissUploadStatus: () => void;
  onUploadFilesOrZip: (files: FileList | File[]) => void;
  validationReport: ValidationReport | null;
  patchBundle: ProposedPatchBundle | null;
  sandboxRunResult: SandboxRunResponse | null;
  onApprovePatch: () => void;
  onRejectPatch: () => void;
  onRevertApproval: () => void;
  onRunTests: () => void;
  onApproveAndRunTests: () => void;
  onDownloadPatchFile: () => void;
  onDownloadCorrectedZip: () => void;
  onDownloadIndividualFile: (
    filePath: string,
    preferCorrected?: boolean
  ) => void;
  onSubmitClarification: (text: string) => void;
  errorBanner: string | null;
  onDismissError: () => void;
  // File Drawer props
  isFileViewerOpen: boolean;
  onCloseFileViewer: () => void;
  activeFile: RepoFile | undefined;
  filesCount: number;
  selectedFilePath: string;
  onSelectFile: (path: string) => void;
  selectionContext: CodeSelectionContext | null;
  onChangeSelectionContext: (sel: CodeSelectionContext | null) => void;
  viewingStagedCopy: boolean;
  onToggleViewingStagedCopy: (staged: boolean) => void;
}

const UPLOAD_ACCEPT_TYPES =
  '.zip,.py,.pyi,.ts,.tsx,.js,.jsx,.mjs,.cjs,.java,.c,.h,.cpp,.cc,.hpp,.cs,.go,.rs,.php,.rb,.swift,.kt,.sql,.html,.css,.scss,.json,.yaml,.yml,.toml,.cfg,.ini,.xml,.md,.txt,.sh';

function formatVerificationLabel(
  status?: VerificationStatus,
  sandboxRunResult?: SandboxRunResponse | null
): {
  label: 'Verified' | 'Failed' | 'Not Verified';
  tone: 'emerald' | 'rose' | 'neutral';
} {
  const effective = sandboxRunResult?.verificationStatus || status;
  if (
    effective === 'VERIFIED' &&
    sandboxRunResult &&
    !sandboxRunResult.isSimulated &&
    sandboxRunResult.testOutcome === 'TESTS_PASSED'
  ) {
    return { label: 'Verified', tone: 'emerald' };
  }
  if (
    effective === 'FAILED' ||
    sandboxRunResult?.testOutcome === 'TESTS_FAILED'
  ) {
    return { label: 'Failed', tone: 'rose' };
  }
  return { label: 'Not Verified', tone: 'neutral' };
}

function getSeverityStyle(severity: BugReportItem['severity']): string {
  switch (severity) {
    case 'critical':
      return 'bg-rose-950/70 border-rose-500/40 text-rose-300';
    case 'high':
      return 'bg-amber-950/70 border-amber-500/40 text-amber-300';
    case 'medium':
      return 'bg-sky-950/70 border-sky-500/40 text-sky-300';
    default:
      return 'bg-neutral-800 border-neutral-700 text-neutral-300';
  }
}

/**
 * Renders markdown-like text and fenced code blocks with syntax highlighting and a Copy button.
 */
const RichMessageContent: React.FC<{ content: string }> = ({ content }) => {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const segments = React.useMemo(() => {
    const regex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    const parts: Array<
      | { type: 'text'; text: string }
      | { type: 'code'; language: string; code: string }
    > = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          text: content.slice(lastIndex, match.index),
        });
      }
      parts.push({
        type: 'code',
        language: match[1] || 'python',
        code: match[2].replace(/\n$/, ''),
      });
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < content.length) {
      parts.push({
        type: 'text',
        text: content.slice(lastIndex),
      });
    }

    return parts;
  }, [content]);

  const handleCopy = (code: string, idx: number) => {
    void navigator.clipboard?.writeText(code);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1800);
  };

  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed text-neutral-200">
      {segments.map((seg, idx) => {
        if (seg.type === 'text') {
          return (
            <div key={idx} className="whitespace-pre-wrap">
              {seg.text.trim()}
            </div>
          );
        }

        const codeLines = seg.code.split('\n');
        return (
          <div
            key={idx}
            className="rounded-xl border border-neutral-800 bg-[#111113] overflow-hidden my-1"
          >
            <div className="px-3.5 py-2 bg-[#18181B] border-b border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
              <span className="font-mono">{seg.language || 'code'}</span>
              <button
                type="button"
                onClick={() => handleCopy(seg.code, idx)}
                className="flex items-center gap-1.5 text-neutral-300 hover:text-white transition-colors cursor-pointer"
              >
                {copiedIdx === idx ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy code</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-3.5 overflow-x-auto font-mono text-xs leading-relaxed text-neutral-200">
              {codeLines.map((line, lineIdx) => (
                <div key={lineIdx} className="table-row">
                  <span className="table-cell pr-4 select-none text-neutral-600 text-right tabular-nums">
                    {lineIdx + 1}
                  </span>
                  <span className="table-cell">
                    {renderHighlightedLine(
                      line,
                      (seg.language as any) || 'python'
                    )}
                  </span>
                </div>
              ))}
            </pre>
          </div>
        );
      })}
    </div>
  );
};

export const MainChatArea: React.FC<MainChatAreaProps> = ({
  isSidebarOpen,
  onOpenSidebar,
  activeProjectName,
  activeModelName,
  isProviderConfigured,
  activeProviderEnvVar,
  isWorkspaceConnected,
  onOpenWorkspaceModal,
  onOpenSettings,
  messages,
  taskDescription,
  onChangeTaskDescription,
  onSendMessage,
  onTriggerQuickAction,
  isAnalyzing,
  isRunningSandbox,
  isUploadingProject,
  uploadStatusMessage,
  onDismissUploadStatus,
  onUploadFilesOrZip,
  validationReport,
  patchBundle,
  sandboxRunResult,
  onApprovePatch,
  onRejectPatch,
  onRevertApproval,
  onRunTests,
  onApproveAndRunTests,
  onDownloadPatchFile,
  onDownloadCorrectedZip,
  onDownloadIndividualFile,
  onSubmitClarification,
  errorBanner,
  onDismissError,
  isFileViewerOpen,
  onCloseFileViewer,
  activeFile,
  filesCount,
  selectedFilePath,
  onSelectFile,
  selectionContext,
  onChangeSelectionContext,
  viewingStagedCopy,
  onToggleViewingStagedCopy,
}) => {
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const welcomeFileInputRef = useRef<HTMLInputElement | null>(null);
  const composerFileInputRef = useRef<HTMLInputElement | null>(null);

  const [composerInput, setComposerInput] = useState<string>('');
  const [showDiffReview, setShowDiffReview] = useState<boolean>(true);
  const [showTechnicalDetails, setShowTechnicalDetails] =
    useState<boolean>(false);
  const [showTestLogs, setShowTestLogs] = useState<boolean>(false);
  const [clarificationReply, setClarificationReply] = useState<string>('');
  const [copiedFileContent, setCopiedFileContent] = useState<boolean>(false);
  const [progressStepIndex, setProgressStepIndex] = useState<number>(0);
  const [isDraggingOverWindow, setIsDraggingOverWindow] =
    useState<boolean>(false);

  const progressSteps = [
    'Inspecting files',
    'Planning changes',
    'Editing code',
    'Running tests',
    'Reviewing results',
  ];

  useEffect(() => {
    if (!isAnalyzing && !isRunningSandbox) {
      setProgressStepIndex(0);
      return;
    }
    if (isRunningSandbox) {
      setProgressStepIndex(3);
      return;
    }
    setProgressStepIndex(0);
    const interval = setInterval(() => {
      setProgressStepIndex((prev) => (prev < 2 ? prev + 1 : prev));
    }, 650);
    return () => clearInterval(interval);
  }, [isAnalyzing, isRunningSandbox]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [
    messages.length,
    isAnalyzing,
    isRunningSandbox,
    showDiffReview,
    showTestLogs,
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const promptToSend = composerInput.trim() || taskDescription.trim();
    if (!promptToSend || isAnalyzing) return;
    onChangeTaskDescription(promptToSend);
    onSendMessage(promptToSend, 'custom');
    setComposerInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const promptToSend = composerInput.trim();
      if (!promptToSend || isAnalyzing) return;
      onChangeTaskDescription(promptToSend);
      onSendMessage(promptToSend, 'custom');
      setComposerInput('');
    }
  };

  const handleSuggestedPrompt = (
    label: 'Fix a bug' | 'Explain this code' | 'Build a feature'
  ) => {
    if (label === 'Fix a bug') {
      const prompt =
        taskDescription.trim() ||
        `Find and fix the bugs in ${selectedFilePath} with minimal changes.`;
      onChangeTaskDescription(prompt);
      onSendMessage(prompt, 'fix-bug');
    } else if (label === 'Explain this code') {
      onTriggerQuickAction('explain-code');
    } else {
      const prompt = `Implement a small, well-tested feature improvement in ${selectedFilePath}.`;
      onChangeTaskDescription(prompt);
      onSendMessage(prompt, 'implement-feature');
    }
  };

  const handleCopyActiveFile = () => {
    if (!activeFile) return;
    void navigator.clipboard?.writeText(activeFile.content);
    setCopiedFileContent(true);
    setTimeout(() => setCopiedFileContent(false), 1800);
  };

  const handleFilePickerSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (selected && selected.length > 0) {
      onUploadFilesOrZip(selected);
      e.target.value = '';
    }
  };

  const handleWindowDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverWindow(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUploadFilesOrZip(e.dataTransfer.files);
    }
  };

  const verificationBadge = formatVerificationLabel(
    patchBundle?.verificationStatus,
    sandboxRunResult
  );

  const isApproved = patchBundle?.approvalStatus === 'approved_staged';
  const isRejected = patchBundle?.approvalStatus === 'rejected';
  const identifiedBugs =
    patchBundle?.plan.identifiedBugs ||
    patchBundle?.structuredOutput?.identified_bugs ||
    [];
  const excludedFiles = validationReport?.excludedFiles || [];

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOverWindow(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) {
          setIsDraggingOverWindow(false);
        }
      }}
      onDrop={handleWindowDrop}
      className="flex-1 min-w-0 min-h-0 h-full flex flex-col bg-[#0D0D0F] text-neutral-100 overflow-hidden relative"
    >
      {/* Full-Window Drag-and-Drop Overlay */}
      {isDraggingOverWindow && (
        <div className="absolute inset-0 z-40 bg-black/75 backdrop-blur-xs border-2 border-dashed border-emerald-400/70 m-3 rounded-2xl flex flex-col items-center justify-center gap-3 pointer-events-none">
          <div className="w-12 h-12 rounded-2xl bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-300">
            <FolderUp className="w-6 h-6" />
          </div>
          <p className="text-base font-semibold text-neutral-100">
            Drop ZIP archive or multiple source files to upload
          </p>
          <p className="text-xs text-neutral-400">
            Path traversal, secrets, .env files, and binaries are automatically filtered
          </p>
        </div>
      )}

      {/* Minimal Top Bar */}
      <header className="shrink-0 h-14 px-4 sm:px-6 border-b border-neutral-800/60 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {!isSidebarOpen && (
            <button
              type="button"
              onClick={onOpenSidebar}
              aria-label="Open sidebar"
              title="Open sidebar"
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/70 transition-colors cursor-pointer"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => onOpenSettings('general')}
            className="flex items-center gap-2 text-sm font-medium text-neutral-200 hover:text-white transition-colors truncate cursor-pointer"
          >
            <span>RepoPilot AI</span>
            <span className="text-neutral-600">·</span>
            <span className="text-xs text-neutral-400 font-normal truncate">
              {activeModelName}
            </span>
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isProviderConfigured ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
              title={
                isProviderConfigured
                  ? 'Server AI provider credentials configured'
                  : `Missing server ${activeProviderEnvVar}`
              }
            />
            <ChevronDown className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {filesCount > 0 && (
            <button
              type="button"
              onClick={onDownloadCorrectedZip}
              data-testid="header-download-zip-btn"
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-neutral-800 bg-[#141416] text-neutral-300 hover:text-white hover:border-neutral-700 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Download project ZIP archive (with approved fixes applied)"
            >
              <FileArchive className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">
                {isApproved ? 'Download Corrected ZIP' : 'Download Project ZIP'}
              </span>
            </button>
          )}

          {activeFile && (
            <button
              type="button"
              onClick={() => {
                if (isFileViewerOpen) onCloseFileViewer();
                else onSelectFile(activeFile.path);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 cursor-pointer ${
                isFileViewerOpen
                  ? 'border-neutral-600 bg-neutral-800 text-white'
                  : 'border-neutral-800 bg-[#141416] text-neutral-300 hover:text-white hover:border-neutral-700'
              }`}
            >
              <FileCode2 className="w-3.5 h-3.5 text-neutral-400" />
              <span className="font-mono text-[11px] truncate max-w-[140px]">
                {activeFile.path}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onOpenSettings('diagnostics')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-neutral-800 bg-[#141416] text-neutral-300 hover:text-white hover:border-neutral-700 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-neutral-400" />
            <span>Advanced</span>
          </button>
        </div>
      </header>

      {/* Main Content Split: Chat Stream + Optional Clean File Viewer Drawer */}
      <div className="flex-1 min-h-0 min-w-0 flex overflow-hidden">
        {/* Scrollable Chat Conversation Area */}
        <main
          ref={chatScrollRef}
          data-testid="main-chat-scroll"
          className="flex-1 min-h-0 min-w-0 overflow-y-auto px-4 sm:px-6 py-6 flex flex-col"
        >
          <div className="w-full max-w-3xl mx-auto flex-1 flex flex-col">
            {/* Error Banner */}
            {errorBanner && (
              <div
                role="alert"
                data-testid="error-banner"
                className="mb-4 rounded-xl border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-xs text-rose-200 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{errorBanner}</span>
                </div>
                <button
                  type="button"
                  onClick={onDismissError}
                  className="text-xs font-medium text-rose-300 hover:text-white cursor-pointer shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Upload Success & Excluded Files Notification */}
            {uploadStatusMessage && (
              <div
                role="status"
                data-testid="upload-status-banner"
                className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-4 py-3 text-xs text-emerald-200 flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="font-medium">{uploadStatusMessage}</span>
                  </div>
                  <button
                    type="button"
                    onClick={onDismissUploadStatus}
                    className="text-xs text-emerald-300 hover:text-white cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
                {excludedFiles.length > 0 && (
                  <div className="text-[11px] text-amber-300/90 pl-6">
                    Automatically excluded {excludedFiles.length} file(s) from AI context for safety (
                    {excludedFiles
                      .slice(0, 3)
                      .map((e) => e.path)
                      .join(', ')}
                    {excludedFiles.length > 3
                      ? `, +${excludedFiles.length - 3} more`
                      : ''}
                    ).
                  </div>
                )}
              </div>
            )}

            {/* Missing AI Provider Credentials Notice */}
            {!isProviderConfigured && (
              <div
                data-testid="missing-credentials-notice"
                className="mb-4 rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    <strong>AI Provider Not Configured:</strong> Server environment variable{' '}
                    <code className="font-mono text-amber-100">
                      {activeProviderEnvVar}
                    </code>{' '}
                    is not set. Configure it in AI Studio Secrets or <code className="font-mono">.env</code> to run live AI analysis.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenSettings('general')}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/30 text-amber-100 font-medium cursor-pointer shrink-0"
                >
                  Provider Settings
                </button>
              </div>
            )}

            {/* Centered Welcome Screen when starting a new conversation */}
            {messages.length === 0 && !isAnalyzing ? (
              <div className="my-auto py-8 flex flex-col items-center text-center gap-6">
                <div className="w-12 h-12 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-200">
                  <Code2 className="w-6 h-6" />
                </div>

                <div className="flex flex-col gap-2 max-w-lg">
                  <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-neutral-100">
                    What can I help you build?
                  </h1>
                  <p className="text-sm text-neutral-400">
                    Upload a project ZIP archive or individual source files to find bugs, explain code, review diffs, and download corrected files.
                  </p>
                </div>

                {/* Drag-and-Drop & File-Picker Upload Zone */}
                <div
                  data-testid="welcome-upload-dropzone"
                  onClick={() => welcomeFileInputRef.current?.click()}
                  className="w-full max-w-xl rounded-2xl border border-dashed border-neutral-700 hover:border-neutral-500 bg-[#141416] hover:bg-[#18181C] p-5 transition-colors cursor-pointer flex flex-col items-center gap-2.5"
                >
                  <div className="w-10 h-10 rounded-xl bg-neutral-800/80 border border-neutral-700 flex items-center justify-center text-neutral-200">
                    {isUploadingProject ? (
                      <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                    ) : (
                      <Upload className="w-5 h-5 text-emerald-400" />
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs sm:text-sm font-medium text-neutral-100">
                      {isUploadingProject
                        ? 'Validating & indexing uploaded files...'
                        : 'Drag & drop a project .zip or multiple source files here, or click to browse'}
                    </span>
                    <span className="text-[11px] text-neutral-400">
                      Supports <code className="font-mono">.zip</code> archives and multiple <code className="font-mono">.py</code>, <code className="font-mono">.ts</code>, <code className="font-mono">.js</code>, <code className="font-mono">.go</code>, <code className="font-mono">.rs</code>, <code className="font-mono">.java</code>, <code className="font-mono">.cpp</code> files · Automatically excludes <code className="font-mono">.env</code> &amp; secrets
                    </span>
                  </div>
                  <input
                    ref={welcomeFileInputRef}
                    type="file"
                    multiple
                    accept={UPLOAD_ACCEPT_TYPES}
                    onChange={handleFilePickerSelect}
                    className="hidden"
                    aria-label="Upload ZIP archive or multiple source files"
                  />
                </div>

                {/* Suggested Prompts */}
                <div className="flex flex-wrap items-center justify-center gap-2.5 max-w-xl">
                  <button
                    type="button"
                    onClick={() => handleSuggestedPrompt('Fix a bug')}
                    className="px-4 py-2 rounded-xl border border-neutral-800 bg-[#141416] hover:bg-neutral-800/80 hover:border-neutral-700 text-xs font-medium text-neutral-200 transition-colors cursor-pointer"
                  >
                    Fix a bug
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSuggestedPrompt('Explain this code')}
                    className="px-4 py-2 rounded-xl border border-neutral-800 bg-[#141416] hover:bg-neutral-800/80 hover:border-neutral-700 text-xs font-medium text-neutral-200 transition-colors cursor-pointer"
                  >
                    Explain this code
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSuggestedPrompt('Build a feature')}
                    className="px-4 py-2 rounded-xl border border-neutral-800 bg-[#141416] hover:bg-neutral-800/80 hover:border-neutral-700 text-xs font-medium text-neutral-200 transition-colors cursor-pointer"
                  >
                    Build a feature
                  </button>
                </div>

                {/* Active Uploaded Project Status Bar */}
                {isWorkspaceConnected && (
                  <div className="text-xs text-neutral-400 flex flex-wrap items-center justify-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Active project:</span>
                    <button
                      type="button"
                      onClick={onOpenWorkspaceModal}
                      className="text-neutral-200 hover:text-white font-mono underline underline-offset-4 cursor-pointer"
                    >
                      {activeProjectName}
                    </button>
                    <span className="text-neutral-500">
                      ({filesCount} safe file{filesCount === 1 ? '' : 's'})
                    </span>
                  </div>
                )}
              </div>
            ) : (
              /* Active Conversation Stream */
              <div className="flex flex-col gap-6 pb-8">
                {messages.map((msg) => {
                  const isUser = msg.role === 'user';
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col gap-2 ${
                        isUser ? 'items-end' : 'items-start'
                      }`}
                    >
                      <div
                        className={`max-w-2xl rounded-2xl px-4 py-3 ${
                          isUser
                            ? 'bg-[#1E1E24] text-neutral-100 border border-neutral-800'
                            : 'w-full bg-transparent text-neutral-200 px-0 py-1'
                        }`}
                      >
                        {!isUser && (
                          <div className="flex items-center gap-2 mb-2 text-xs text-neutral-400">
                            <span className="font-semibold text-neutral-200">
                              RepoPilot AI
                            </span>
                            <span>·</span>
                            <span className="font-mono text-[11px] tabular-nums">
                              {msg.timestamp}
                            </span>
                          </div>
                        )}

                        {msg.selectionContext && (
                          <div className="mb-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neutral-900 border border-neutral-800 font-mono text-[11px] text-neutral-300">
                            <Code2 className="w-3 h-3 text-neutral-400" />
                            <span>
                              {msg.selectionContext.filePath}:
                              {msg.selectionContext.startLine}–
                              {msg.selectionContext.endLine}
                            </span>
                          </div>
                        )}

                        <RichMessageContent content={msg.content} />
                      </div>
                    </div>
                  );
                })}

                {/* Clean Inline Progress Indicator when a task is running */}
                {(isAnalyzing || isRunningSandbox) && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="rounded-xl border border-neutral-800 bg-[#141416] p-4 flex flex-col gap-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 text-xs font-medium text-neutral-200">
                        <Loader2 className="w-4 h-4 text-neutral-300 animate-spin shrink-0" />
                        <span>
                          {progressSteps[progressStepIndex] ||
                            'Working on task...'}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-neutral-500">
                        {isRunningSandbox ? 'Sandbox verification' : 'AI Agent'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
                      {progressSteps.map((step, idx) => {
                        const isDone = idx < progressStepIndex;
                        const isCurrent = idx === progressStepIndex;
                        return (
                          <span
                            key={step}
                            className={`flex items-center gap-1 ${
                              isCurrent
                                ? 'text-neutral-100 font-medium'
                                : isDone
                                ? 'text-emerald-400'
                                : 'text-neutral-600'
                            }`}
                          >
                            <span>{step}</span>
                            {idx < progressSteps.length - 1 && (
                              <span className="text-neutral-700 ml-1">→</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Proposed Changes, Bug Reports & Verification Card inside Conversation */}
                {patchBundle && !isAnalyzing && (
                  <div className="rounded-xl border border-neutral-800 bg-[#141416] p-4 flex flex-col gap-4">
                    {/* Header Row: Summary + Final Verification Status */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <GitPullRequest className="w-4 h-4 text-neutral-300 shrink-0" />
                        <span className="text-xs font-semibold text-neutral-100">
                          {patchBundle.needsClarification
                            ? 'Clarification Requested'
                            : patchBundle.isNoChangeTask
                            ? 'Analysis Complete (No Code Modifications Required)'
                            : `${patchBundle.changes.length} file${
                                patchBundle.changes.length === 1 ? '' : 's'
                              } proposed for modification`}
                        </span>
                        {!patchBundle.needsClarification &&
                          patchBundle.changes.length > 0 && (
                            <span className="text-xs font-mono text-neutral-400">
                              (
                              {patchBundle.changes
                                .map((c) => c.filePath)
                                .join(', ')}
                              )
                            </span>
                          )}
                      </div>

                      {/* Clear Final Result: Verified, Failed, or Not Verified */}
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-neutral-500">Test Status:</span>
                        <span
                          data-testid="verification-result-badge"
                          className={`font-medium flex items-center gap-1 ${
                            verificationBadge.tone === 'emerald'
                              ? 'text-emerald-400'
                              : verificationBadge.tone === 'rose'
                              ? 'text-rose-400'
                              : 'text-neutral-300'
                          }`}
                        >
                          {verificationBadge.tone === 'emerald' && (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          {verificationBadge.tone === 'rose' && (
                            <XCircle className="w-3.5 h-3.5" />
                          )}
                          <span>{verificationBadge.label}</span>
                        </span>
                      </div>
                    </div>

                    {/* Structured Bug Reports (File Path, Line Reference, Severity, Explanation, Recommended Fix) */}
                    {identifiedBugs.length > 0 && (
                      <div
                        data-testid="identified-bugs-section"
                        className="flex flex-col gap-2.5 pt-2 border-t border-neutral-800/80"
                      >
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-200">
                          <Bug className="w-3.5 h-3.5 text-amber-400" />
                          <span>
                            Identified Bugs &amp; Code Issues ({identifiedBugs.length})
                          </span>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          {identifiedBugs.map((bug, idx) => (
                            <div
                              key={idx}
                              className="rounded-lg border border-neutral-800 bg-[#0D0D0F] p-3 flex flex-col gap-1.5 text-xs"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold text-neutral-100">
                                  {bug.title}
                                </span>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => onSelectFile(bug.file_path)}
                                    className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-700 hover:border-neutral-500 font-mono text-[11px] text-neutral-200 cursor-pointer"
                                    title="Open file in viewer"
                                  >
                                    {bug.file_path}:{bug.line_reference}
                                  </button>
                                  <span
                                    className={`px-2 py-0.5 rounded border text-[10px] font-mono uppercase ${getSeverityStyle(
                                      bug.severity
                                    )}`}
                                  >
                                    {bug.severity}
                                  </span>
                                </div>
                              </div>
                              <p className="text-neutral-300 leading-relaxed">
                                <strong className="text-neutral-400">
                                  Problem:
                                </strong>{' '}
                                {bug.explanation}
                              </p>
                              <p className="text-emerald-300/90 leading-relaxed">
                                <strong className="text-emerald-400">
                                  Recommended Fix:
                                </strong>{' '}
                                {bug.recommended_fix}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Clarifying Question Form if ambiguous */}
                    {patchBundle.needsClarification &&
                      patchBundle.clarifyingQuestion && (
                        <div className="flex flex-col gap-2.5 pt-1">
                          <div className="text-xs text-amber-200 flex items-start gap-2">
                            <HelpCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <span>{patchBundle.clarifyingQuestion}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={clarificationReply}
                              onChange={(e) =>
                                setClarificationReply(e.target.value)
                              }
                              placeholder="Type your clarification..."
                              className="flex-1 rounded-lg border border-neutral-700 bg-[#0D0D0F] px-3 py-1.5 text-xs text-neutral-100 focus:outline-none focus:border-neutral-500"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (!clarificationReply.trim()) return;
                                onSubmitClarification(
                                  clarificationReply.trim()
                                );
                                setClarificationReply('');
                              }}
                              className="px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-900 hover:bg-white text-xs font-semibold cursor-pointer"
                            >
                              Reply
                            </button>
                          </div>
                        </div>
                      )}

                    {/* Primary Actions: Review changes, Accept, Reject, Download Corrected ZIP, Run tests */}
                    {!patchBundle.needsClarification && (
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-800/80">
                        <div className="flex flex-wrap items-center gap-2">
                          {patchBundle.diffs.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setShowDiffReview((prev) => !prev)
                              }
                              className="px-3 py-1.5 rounded-lg border border-neutral-700 bg-neutral-800/80 hover:bg-neutral-800 text-xs font-medium text-neutral-100 transition-colors cursor-pointer"
                            >
                              {showDiffReview
                                ? 'Hide diff'
                                : 'Review changes'}
                            </button>
                          )}

                          {!isApproved && patchBundle.diffs.length > 0 && (
                            <button
                              type="button"
                              onClick={onApprovePatch}
                              data-testid="approve-patch-btn"
                              className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-neutral-950 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Accept &amp; Apply Changes</span>
                            </button>
                          )}

                          {!isRejected && patchBundle.diffs.length > 0 && (
                            <button
                              type="button"
                              onClick={
                                isApproved ? onRevertApproval : onRejectPatch
                              }
                              className="px-3 py-1.5 rounded-lg border border-neutral-700 text-neutral-300 hover:text-white hover:bg-neutral-800 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                            >
                              {isApproved ? (
                                <>
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span>Revert</span>
                                </>
                              ) : (
                                <>
                                  <X className="w-3.5 h-3.5" />
                                  <span>Reject</span>
                                </>
                              )}
                            </button>
                          )}

                          {isApproved && (
                            <button
                              type="button"
                              onClick={onDownloadCorrectedZip}
                              data-testid="download-corrected-zip-btn"
                              className="px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-white text-neutral-900 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                            >
                              <FileArchive className="w-3.5 h-3.5" />
                              <span>Download Corrected ZIP</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={
                              isApproved ? onRunTests : onApproveAndRunTests
                            }
                            disabled={isRunningSandbox}
                            className="px-3 py-1.5 rounded-lg border border-neutral-700 bg-[#1A1A1E] hover:bg-neutral-800 text-xs font-medium text-neutral-200 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <Play className="w-3.5 h-3.5 text-emerald-400" />
                            <span>
                              {isRunningSandbox
                                ? 'Running tests...'
                                : 'Run tests'}
                            </span>
                          </button>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-neutral-400">
                          {sandboxRunResult && (
                            <button
                              type="button"
                              onClick={() => setShowTestLogs((prev) => !prev)}
                              className="hover:text-neutral-200 underline underline-offset-4 cursor-pointer"
                            >
                              {showTestLogs
                                ? 'Hide test output'
                                : 'Inspect test output'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setShowTechnicalDetails((prev) => !prev)
                            }
                            className="hover:text-neutral-200 underline underline-offset-4 cursor-pointer"
                          >
                            {showTechnicalDetails
                              ? 'Hide details'
                              : 'View details'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Expandable Diff View with Individual Corrected File Downloads & .patch Download */}
                    {showDiffReview && patchBundle.diffs.length > 0 && (
                      <div
                        data-testid="inline-diff-viewer"
                        className="flex flex-col gap-3 pt-2 border-t border-neutral-800"
                      >
                        {patchBundle.diffs.map((diff) => (
                          <div
                            key={diff.filePath}
                            className="rounded-lg border border-neutral-800 bg-[#0D0D0F] overflow-hidden"
                          >
                            <div className="px-3 py-2 bg-[#18181B] border-b border-neutral-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-neutral-200">
                                  {diff.filePath}
                                </span>
                                <span className="font-mono text-[11px] text-emerald-400">
                                  +{diff.addedCount}
                                </span>
                                <span className="font-mono text-[11px] text-rose-400">
                                  -{diff.removedCount}
                                </span>
                              </div>

                              <button
                                type="button"
                                disabled={!isApproved}
                                onClick={() =>
                                  onDownloadIndividualFile(diff.filePath, true)
                                }
                                data-testid={`download-corrected-file-${diff.filePath}`}
                                className="px-2.5 py-1 rounded border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-45 disabled:cursor-not-allowed text-[11px] font-medium text-neutral-100 flex items-center gap-1.5 transition-colors cursor-pointer"
                                title={
                                  isApproved
                                    ? `Download corrected file (${diff.filePath})`
                                    : 'Accept & Apply Changes first to download corrected file'
                                }
                              >
                                <Download className="w-3 h-3 text-emerald-400" />
                                <span>
                                  {isApproved
                                    ? 'Download Corrected File'
                                    : 'Approve First to Download'}
                                </span>
                              </button>
                            </div>
                            <div className="max-h-80 overflow-y-auto font-mono text-xs">
                              {diff.lines.map((line, idx) => (
                                <div
                                  key={idx}
                                  className={`px-3 py-0.5 flex items-start gap-3 ${
                                    line.type === 'add'
                                      ? 'bg-emerald-950/35 text-emerald-200'
                                      : line.type === 'remove'
                                      ? 'bg-rose-950/35 text-rose-200'
                                      : 'text-neutral-400'
                                  }`}
                                >
                                  <span className="w-8 shrink-0 text-right text-neutral-600 select-none tabular-nums">
                                    {line.newLineNumber ??
                                      line.oldLineNumber ??
                                      ''}
                                  </span>
                                  <span className="w-3 shrink-0 select-none">
                                    {line.type === 'add'
                                      ? '+'
                                      : line.type === 'remove'
                                      ? '-'
                                      : ' '}
                                  </span>
                                  <span className="whitespace-pre-wrap break-all">
                                    {line.content}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}

                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
                          <span className="text-neutral-400">
                            Approval Status:{' '}
                            <strong className="text-neutral-200">
                              {isApproved
                                ? 'Approved & applied to workspace'
                                : isRejected
                                ? 'Rejected'
                                : 'Pending developer approval'}
                            </strong>
                          </span>
                          <div className="flex items-center gap-4">
                            <button
                              type="button"
                              onClick={onDownloadPatchFile}
                              className="flex items-center gap-1.5 text-neutral-300 hover:text-white cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Download .patch</span>
                            </button>
                            <button
                              type="button"
                              disabled={!isApproved}
                              onClick={onDownloadCorrectedZip}
                              title={
                                isApproved
                                  ? 'Download project ZIP with approved fixes'
                                  : 'Accept & Apply Changes first to download corrected ZIP'
                              }
                              className="flex items-center gap-1.5 text-emerald-300 hover:text-emerald-200 disabled:opacity-45 disabled:cursor-not-allowed font-medium cursor-pointer"
                            >
                              <FileArchive className="w-3.5 h-3.5" />
                              <span>
                                {isApproved
                                  ? 'Download Corrected ZIP'
                                  : 'Approve First for Corrected ZIP'}
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* On-Demand Test Output & Repair Attempts */}
                    {showTestLogs && sandboxRunResult && (
                      <div
                        data-testid="inline-test-output"
                        className="rounded-lg border border-neutral-800 bg-[#0D0D0F] p-3 flex flex-col gap-2.5 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-neutral-200 flex items-center gap-1.5">
                            <Terminal className="w-3.5 h-3.5 text-neutral-400" />
                            <span>
                              Test Execution &amp; Repair Attempts (Retries:{' '}
                              {sandboxRunResult.retryCount}/
                              {sandboxRunResult.maxRetries})
                            </span>
                          </span>
                          <span className="font-mono text-[11px] text-neutral-400">
                            {sandboxRunResult.executionEnvironment ===
                            'isolated_container'
                              ? 'Isolated Container Sandbox'
                              : sandboxRunResult.executionEnvironment ===
                                'blocked_no_sandbox'
                              ? 'Runtime Execution Unavailable (Static Analysis Only)'
                              : 'Static / Simulated Check (Not Verified by Isolated Runner)'}
                          </span>
                        </div>

                        {sandboxRunResult.testSummary && (
                          <div
                            data-testid="test-summary-counts"
                            className="flex flex-wrap items-center gap-3 px-2.5 py-1.5 rounded bg-[#141416] border border-neutral-800/80 font-mono text-[11px]"
                          >
                            <span className="text-emerald-400">
                              Passed: {sandboxRunResult.testSummary.passed}
                            </span>
                            <span className="text-rose-400">
                              Failed: {sandboxRunResult.testSummary.failed}
                            </span>
                            <span className="text-amber-300">
                              Skipped: {sandboxRunResult.testSummary.skipped}
                            </span>
                            <span className="text-neutral-400">
                              Not Run: {sandboxRunResult.testSummary.notRun}
                            </span>
                          </div>
                        )}

                        {sandboxRunResult.attempts.map((att) => (
                          <div
                            key={att.attempt}
                            className="rounded border border-neutral-800/90 bg-[#141416] p-2.5 flex flex-col gap-1.5"
                          >
                            <div className="flex items-center justify-between font-mono text-[11px]">
                              <span className="text-neutral-300">
                                Attempt #{att.attempt}: $ {att.command}
                              </span>
                              <span
                                className={
                                  att.exitCode === 0
                                    ? 'text-emerald-400'
                                    : 'text-amber-400'
                                }
                              >
                                exit={att.exitCode ?? 'null'} ({att.durationMs}
                                ms)
                              </span>
                            </div>
                            <pre className="p-2 rounded bg-[#09090B] font-mono text-[11px] text-neutral-300 overflow-x-auto whitespace-pre-wrap max-h-48">
                              {`${att.stdout}\n${att.stderr}`.trim()}
                            </pre>
                            {att.repairAnalysis && (
                              <div className="text-[11px] text-neutral-400">
                                <strong>Repair analysis:</strong>{' '}
                                {att.repairAnalysis}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* On-Demand Technical Details ("View details") */}
                    {showTechnicalDetails && (
                      <div
                        data-testid="inline-technical-details"
                        className="rounded-lg border border-neutral-800 bg-[#0D0D0F] p-3 flex flex-col gap-2 text-xs text-neutral-300"
                      >
                        <div>
                          <span className="text-neutral-500">
                            Model &amp; Provider:
                          </span>{' '}
                          <span className="font-mono">
                            {patchBundle.plan.providerUsed} (
                            {patchBundle.plan.modelUsed})
                          </span>
                        </div>
                        {patchBundle.plan.inspectedFiles &&
                          patchBundle.plan.inspectedFiles.length > 0 && (
                            <div>
                              <span className="text-neutral-500">
                                Relevant context files analyzed:
                              </span>{' '}
                              <span className="font-mono">
                                {patchBundle.plan.inspectedFiles.join(', ')}
                              </span>
                            </div>
                          )}
                        {patchBundle.plan.acceptanceCriteria &&
                          patchBundle.plan.acceptanceCriteria.length > 0 && (
                            <div className="flex flex-col gap-1">
                              <span className="text-neutral-500">
                                Acceptance criteria:
                              </span>
                              <ul className="list-disc list-inside space-y-0.5 text-neutral-300">
                                {patchBundle.plan.acceptanceCriteria.map(
                                  (item, i) => (
                                    <li key={i}>{item}</li>
                                  )
                                )}
                              </ul>
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </main>

        {/* Optional Clean Slide-Over File Viewer when a user clicks a file in the explorer */}
        {isFileViewerOpen && activeFile && (
          <aside
            aria-label="Workspace File Viewer"
            className="w-full sm:w-[440px] lg:w-[500px] shrink-0 h-full border-l border-neutral-800 bg-[#111113] flex flex-col overflow-hidden"
          >
            <div className="shrink-0 h-12 px-3.5 border-b border-neutral-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileCode2 className="w-4 h-4 text-neutral-400 shrink-0" />
                <span className="font-mono text-xs text-neutral-200 truncate">
                  {activeFile.path}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {patchBundle &&
                  patchBundle.approvalStatus === 'approved_staged' && (
                    <button
                      type="button"
                      onClick={() =>
                        onToggleViewingStagedCopy(!viewingStagedCopy)
                      }
                      className="px-2 py-1 rounded border border-neutral-700 text-[11px] text-neutral-300 hover:text-white cursor-pointer"
                    >
                      {viewingStagedCopy ? 'Corrected' : 'Original'}
                    </button>
                  )}
                <button
                  type="button"
                  onClick={() =>
                    onDownloadIndividualFile(
                      activeFile.path,
                      viewingStagedCopy || isApproved
                    )
                  }
                  data-testid="drawer-download-file-btn"
                  className="px-2 py-1 rounded border border-neutral-800 text-[11px] text-neutral-300 hover:text-white flex items-center gap-1 cursor-pointer"
                  title="Download this file"
                >
                  <Download className="w-3 h-3" />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyActiveFile}
                  className="px-2 py-1 rounded border border-neutral-800 text-[11px] text-neutral-300 hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  {copiedFileContent ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>{copiedFileContent ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  type="button"
                  onClick={onCloseFileViewer}
                  aria-label="Close file viewer"
                  className="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-3 font-mono text-xs leading-relaxed">
              {activeFile.content.split('\n').map((line, idx) => {
                const lineNum = idx + 1;
                const isSelected =
                  selectionContext &&
                  selectionContext.filePath === activeFile.path &&
                  lineNum >= selectionContext.startLine &&
                  lineNum <= selectionContext.endLine;

                return (
                  <div
                    key={lineNum}
                    onClick={() => {
                      const lines = activeFile.content.split('\n');
                      const start = Math.max(1, lineNum - 2);
                      const end = Math.min(lines.length, lineNum + 3);
                      onChangeSelectionContext({
                        filePath: activeFile.path,
                        language: activeFile.language,
                        startLine: start,
                        endLine: end,
                        selectedText: lines.slice(start - 1, end).join('\n'),
                      });
                    }}
                    className={`table-row cursor-pointer ${
                      isSelected ? 'bg-neutral-800/80' : 'hover:bg-neutral-900'
                    }`}
                  >
                    <span className="table-cell pr-4 select-none text-neutral-600 text-right tabular-nums">
                      {lineNum}
                    </span>
                    <span className="table-cell whitespace-pre">
                      {renderHighlightedLine(line, activeFile.language)}
                    </span>
                  </div>
                );
              })}
            </div>
          </aside>
        )}
      </div>

      {/* Fixed Bottom Chat Composer */}
      <div className="shrink-0 px-4 sm:px-6 pb-4 pt-2 bg-[#0D0D0F]">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-3xl mx-auto rounded-2xl border border-neutral-800 bg-[#16161A] focus-within:border-neutral-600 transition-colors p-3 flex flex-col gap-2"
        >
          {selectionContext && (
            <div className="flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-800 text-xs text-neutral-300">
              <span className="font-mono text-[11px] truncate">
                Selected: {selectionContext.filePath} (L
                {selectionContext.startLine}–L{selectionContext.endLine})
              </span>
              <button
                type="button"
                onClick={() => onChangeSelectionContext(null)}
                aria-label="Clear code selection"
                className="text-neutral-500 hover:text-neutral-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => composerFileInputRef.current?.click()}
              data-testid="composer-upload-button"
              title="Upload a project .zip archive or multiple individual source files"
              aria-label="Upload ZIP or source files"
              className="w-9 h-9 rounded-xl border border-neutral-700 bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 hover:text-white flex items-center justify-center shrink-0 transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4" />
            </button>
            <input
              ref={composerFileInputRef}
              type="file"
              multiple
              accept={UPLOAD_ACCEPT_TYPES}
              onChange={handleFilePickerSelect}
              className="hidden"
            />

            <textarea
              rows={2}
              value={composerInput}
              onChange={(e) => setComposerInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask RepoPilot AI about your uploaded project, find bugs, or propose fixes..."
              aria-label="Message RepoPilot AI"
              className="flex-1 bg-transparent resize-none text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none leading-relaxed max-h-40"
            />
            <button
              type="submit"
              disabled={
                isAnalyzing ||
                (!composerInput.trim() && !taskDescription.trim())
              }
              aria-label="Send message"
              className="w-9 h-9 rounded-xl bg-neutral-100 text-neutral-900 hover:bg-white disabled:opacity-40 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import JSZip from 'jszip';
import { MainChatArea } from './components/MainChatArea';
import {
  type ConversationSessionSummary,
  MinimalSidebar,
} from './components/MinimalSidebar';
import {
  SettingsAndAdvancedModal,
  type SettingsTabId,
  WorkspacePickerModal,
} from './components/SettingsAndAdvancedModal';
import type {
  AIProviderId,
  AIProviderInfo,
  ChatMessageItem,
  CodeSelectionContext,
  ProposedPatchBundle,
  QuickAgentActionType,
  RepoFile,
  SandboxExecutionMode,
  SandboxRunResponse,
  UploadLimitsConfig,
  ValidationReport,
} from './types/repopilot';
import {
  applyApprovedPatchImmutably,
  resolveFilesForExport,
  resolveIndividualFileForDownload,
} from './utils/diffEngine';
import { SAMPLE_REPOSITORIES } from './utils/sampleRepos';
import {
  redactSecrets,
  validateRepositoryEntries,
} from './utils/securityValidator';

interface StoredConversation {
  id: string;
  title: string;
  updatedAt: string;
  repoId: string;
  messages: ChatMessageItem[];
  patchBundle: ProposedPatchBundle | null;
  sandboxRunResult: SandboxRunResponse | null;
}

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isFileViewerOpen, setIsFileViewerOpen] = useState<boolean>(false);
  const [isWorkspaceConnected, setIsWorkspaceConnected] =
    useState<boolean>(true);
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] =
    useState<boolean>(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] =
    useState<boolean>(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>('general');

  const [activeRepoId, setActiveRepoId] = useState<string>(
    SAMPLE_REPOSITORIES[0].id
  );
  const [, setActiveWorkspaceRoot] = useState<string>('/app/applet');
  const [isSyncingLocalWorkspace, setIsSyncingLocalWorkspace] =
    useState<boolean>(false);

  // Preserved immutable copy of the uploaded/imported/local repository for Revert to Original
  const [immutableOriginalFiles, setImmutableOriginalFiles] = useState<
    RepoFile[]
  >(SAMPLE_REPOSITORIES[0].files);
  const [originalFiles, setOriginalFiles] = useState<RepoFile[]>(
    SAMPLE_REPOSITORIES[0].files
  );
  const [selectedFilePath, setSelectedFilePath] = useState<string>(
    'billing/calculator.py'
  );
  const [editorDrafts, setEditorDrafts] = useState<Record<string, string>>({});
  const [selectionContext, setSelectionContext] =
    useState<CodeSelectionContext | null>(null);

  const [viewingStagedCopy, setViewingStagedCopy] = useState<boolean>(false);
  const [contextTokenBudget, setContextTokenBudget] = useState<number>(8000);
  const [uploadLimits, setUploadLimits] = useState<UploadLimitsConfig>({
    maxFileBytes: 256 * 1024,
    maxArchiveBytes: 4 * 1024 * 1024,
    maxFileCount: 120,
  });

  const [validationReport, setValidationReport] =
    useState<ValidationReport | null>(() => {
      const entries = SAMPLE_REPOSITORIES[0].files.map((f) => ({
        path: f.path,
        content: f.content,
        uncompressedBytes: f.sizeBytes,
      }));
      return validateRepositoryEntries('billing-engine-py.zip', entries).report;
    });
  const [isUploadingProject, setIsUploadingProject] = useState<boolean>(false);
  const [uploadStatusMessage, setUploadStatusMessage] = useState<string | null>(
    null
  );
  const [isImportingGitHub, setIsImportingGitHub] = useState<boolean>(false);

  const [providers, setProviders] = useState<AIProviderInfo[]>([
    {
      id: 'gemini',
      name: 'Google Gemini (Server SDK)',
      vendor: 'Google DeepMind',
      protocol: 'google-genai-sdk',
      defaultModel: 'gemini-3-flash-preview',
      supportedModels: ['gemini-3-flash-preview', 'gemini-3.1-pro-preview'],
      endpointUrl: 'https://generativelanguage.googleapis.com',
      configuredOnServer: true,
      envVarName: 'GEMINI_API_KEY',
      description: 'Primary server-side reasoning model via @google/genai SDK.',
    },
    {
      id: 'nebius',
      name: 'Nebius Token Factory',
      vendor: 'Nebius AI Studio',
      protocol: 'openai-compatible',
      defaultModel: 'nvidia/Llama-3_1-Nemotron-Ultra-253B-v1',
      supportedModels: [
        'nvidia/Llama-3_1-Nemotron-Ultra-253B-v1',
        'nvidia/Llama-3_3-Nemotron-Super-49B-v1',
        'nvidia/llama-3.1-nemotron-70b-instruct',
        'Qwen/Qwen2.5-Coder-32B-Instruct',
        'deepseek-ai/DeepSeek-V3',
        'meta-llama/Llama-3.3-70B-Instruct',
      ],
      endpointUrl: 'https://api.tokenfactory.nebius.com/v1',
      configuredOnServer: false,
      envVarName: 'NEBIUS_API_KEY',
      description:
        'OpenAI-compatible adapter for Nebius Token Factory (https://api.tokenfactory.nebius.com/v1) running NVIDIA open-source Nemotron & coding models.',
    },
    {
      id: 'nvidia',
      name: 'NVIDIA Nemotron (NIM)',
      vendor: 'NVIDIA',
      protocol: 'openai-compatible',
      defaultModel: 'nvidia/llama-3.1-nemotron-70b-instruct',
      supportedModels: [
        'nvidia/llama-3.1-nemotron-70b-instruct',
        'nvidia/llama-3.3-nemotron-super-49b-v1',
        'nvidia/llama-3.1-nemotron-ultra-253b-v1',
        'meta/llama-3.1-70b-instruct',
      ],
      endpointUrl: 'https://integrate.api.nvidia.com/v1',
      configuredOnServer: false,
      envVarName: 'NVIDIA_API_KEY',
      description: 'OpenAI-compatible adapter for NVIDIA NIM & Nemotron.',
    },
    {
      id: 'custom',
      name: 'Custom OpenAI-Compatible API',
      vendor: 'Configurable Endpoint',
      protocol: 'openai-compatible',
      defaultModel: 'gpt-4o-mini',
      supportedModels: ['gpt-4o-mini', 'gpt-4o'],
      endpointUrl: 'https://api.openai.com/v1',
      configuredOnServer: false,
      envVarName: 'OPENAI_COMPAT_API_KEY',
      description: 'Generic OpenAI-compatible v1/chat/completions adapter.',
    },
  ]);
  const [selectedProviderId, setSelectedProviderId] =
    useState<AIProviderId>('gemini');
  const [customModel, setCustomModel] = useState<string>(
    'gemini-3-flash-preview'
  );
  const [isolatedSandboxAvailable, setIsolatedSandboxAvailable] =
    useState<boolean>(false);

  const [taskDescription, setTaskDescription] = useState<string>(
    SAMPLE_REPOSITORIES[0].defaultTask
  );
  const [patchBundle, setPatchBundle] = useState<ProposedPatchBundle | null>(
    null
  );
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  const [sandboxMode, setSandboxMode] = useState<SandboxExecutionMode>(
    'demo_simulation_labeled'
  );
  const [sandboxRunResult, setSandboxRunResult] =
    useState<SandboxRunResponse | null>(null);
  const [isRunningSandbox, setIsRunningSandbox] = useState<boolean>(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>([]);
  const [activeConversationId, setActiveConversationId] =
    useState<string>('conv-current');
  const [savedConversations, setSavedConversations] = useState<
    StoredConversation[]
  >([]);

  useEffect(() => {
    fetch('/api/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.providers) {
          setProviders(data.providers);
        }
        if (data?.sandbox) {
          setIsolatedSandboxAvailable(
            Boolean(data.sandbox.isolatedSandboxAvailable)
          );
        }
        if (data?.activeWorkspaceRoot) {
          setActiveWorkspaceRoot(data.activeWorkspaceRoot);
        }
      })
      .catch(() => {
        // Ignore transient status fetch issues on initial mount
      });
  }, []);

  const selectedProviderInfo = useMemo(
    () => providers.find((p) => p.id === selectedProviderId) || providers[0],
    [providers, selectedProviderId]
  );

  const currentSamplePreset = useMemo(
    () => SAMPLE_REPOSITORIES.find((r) => r.id === activeRepoId),
    [activeRepoId]
  );

  const activeProjectName = useMemo(() => {
    if (currentSamplePreset) return currentSamplePreset.id;
    return activeRepoId;
  }, [currentSamplePreset, activeRepoId]);

  const stagedFiles = useMemo(() => {
    if (!patchBundle || patchBundle.approvalStatus !== 'approved_staged') {
      return originalFiles;
    }
    return applyApprovedPatchImmutably(originalFiles, patchBundle.changes);
  }, [originalFiles, patchBundle]);

  const activeFileList = viewingStagedCopy ? stagedFiles : originalFiles;
  const activeFile = useMemo(
    () =>
      activeFileList.find((f) => f.path === selectedFilePath) ||
      activeFileList[0],
    [activeFileList, selectedFilePath]
  );

  const modifiedPaths = useMemo(() => {
    const set = new Set<string>();
    if (patchBundle && patchBundle.approvalStatus === 'approved_staged') {
      for (const ch of patchBundle.changes) {
        set.add(ch.filePath);
      }
    }
    for (const file of originalFiles) {
      const orig = immutableOriginalFiles.find((o) => o.path === file.path);
      if (orig && orig.content !== file.content) {
        set.add(file.path);
      }
    }
    return set;
  }, [patchBundle, originalFiles, immutableOriginalFiles]);

  const dirtyPaths = useMemo(() => {
    const set = new Set<string>();
    for (const [path, draft] of Object.entries(editorDrafts)) {
      const current = originalFiles.find((f) => f.path === path);
      if (current && current.content !== draft) {
        set.add(path);
      }
    }
    return set;
  }, [editorDrafts, originalFiles]);

  const conversationList: ConversationSessionSummary[] = useMemo(() => {
    const firstUserMsg = chatMessages.find((m) => m.role === 'user');
    const currentTitle = firstUserMsg
      ? firstUserMsg.content.slice(0, 36)
      : 'New conversation';
    const currentEntry: ConversationSessionSummary = {
      id: activeConversationId,
      title: currentTitle,
      updatedAt: chatMessages.length
        ? chatMessages[chatMessages.length - 1].timestamp
        : 'Now',
      messageCount: chatMessages.length,
      repoId: activeRepoId,
    };

    const others = savedConversations
      .filter((c) => c.id !== activeConversationId)
      .map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt,
        messageCount: c.messages.length,
        repoId: c.repoId,
      }));

    return [currentEntry, ...others];
  }, [
    chatMessages,
    activeConversationId,
    activeRepoId,
    savedConversations,
  ]);

  const handleNewChat = () => {
    if (chatMessages.length > 0) {
      const firstUser = chatMessages.find((m) => m.role === 'user');
      const title = firstUser
        ? firstUser.content.slice(0, 36)
        : 'Previous task';
      const snap: StoredConversation = {
        id: activeConversationId,
        title,
        updatedAt:
          chatMessages[chatMessages.length - 1]?.timestamp || 'Earlier',
        repoId: activeRepoId,
        messages: chatMessages,
        patchBundle,
        sandboxRunResult,
      };
      setSavedConversations((prev) => [
        snap,
        ...prev.filter((c) => c.id !== activeConversationId),
      ]);
    }

    const nextId = `conv-${Date.now()}`;
    setActiveConversationId(nextId);
    setChatMessages([]);
    setPatchBundle(null);
    setSandboxRunResult(null);
    setViewingStagedCopy(false);
    setErrorBanner(null);
  };

  const handleSelectConversation = (convId: string) => {
    if (convId === activeConversationId) return;
    const found = savedConversations.find((c) => c.id === convId);
    if (!found) return;

    if (chatMessages.length > 0) {
      const firstUser = chatMessages.find((m) => m.role === 'user');
      const currentSnap: StoredConversation = {
        id: activeConversationId,
        title: firstUser ? firstUser.content.slice(0, 36) : 'Recent chat',
        updatedAt:
          chatMessages[chatMessages.length - 1]?.timestamp || 'Earlier',
        repoId: activeRepoId,
        messages: chatMessages,
        patchBundle,
        sandboxRunResult,
      };
      setSavedConversations((prev) => [
        currentSnap,
        ...prev.filter((c) => c.id !== activeConversationId),
      ]);
    }

    setActiveConversationId(found.id);
    setChatMessages(found.messages);
    setPatchBundle(found.patchBundle);
    setSandboxRunResult(found.sandboxRunResult);
  };

  const handleSelectFile = (path: string) => {
    setSelectedFilePath(path);
    setIsFileViewerOpen(true);
  };

  const loadNewRepositoryIntoWorkspace = (
    repoId: string,
    files: RepoFile[],
    defaultTaskText: string,
    report: ValidationReport
  ) => {
    setActiveRepoId(repoId);
    setIsWorkspaceConnected(true);
    setImmutableOriginalFiles(files.map((f) => ({ ...f })));
    setOriginalFiles(files.map((f) => ({ ...f })));
    const primarySource =
      files.find((f) => !f.isTestFile && f.language !== 'markdown') || files[0];
    setSelectedFilePath(primarySource.path);
    setEditorDrafts({});
    setSelectionContext(null);
    setTaskDescription(defaultTaskText);
    setPatchBundle(null);
    setSandboxRunResult(null);
    setViewingStagedCopy(false);
    setErrorBanner(null);
    setValidationReport(report);
  };

  const handleSyncLocalWorkspace = async (subdir?: string) => {
    setIsSyncingLocalWorkspace(true);
    setErrorBanner(null);
    try {
      const query = subdir ? `?subdir=${encodeURIComponent(subdir)}` : '';
      const res = await fetch(`/api/local-workspace/inspect${query}`);
      const data = await res.json();
      if (!res.ok) {
        setErrorBanner(data.error || 'Failed to inspect local workspace.');
        return;
      }

      if (data.files && data.files.length > 0) {
        setActiveWorkspaceRoot(data.workspaceRoot || '/app/applet');
        const entries = (data.files as RepoFile[]).map((f) => ({
          path: f.path,
          content: f.content,
          uncompressedBytes: f.sizeBytes,
        }));
        const { report } = validateRepositoryEntries(
          data.workspaceName || 'local-workspace',
          entries,
          { excludeSecretsAndBinariesByDefault: true }
        );
        loadNewRepositoryIntoWorkspace(
          subdir === 'vscode-extension'
            ? 'vscode-extension-local'
            : 'local-workspace',
          data.files,
          subdir === 'vscode-extension'
            ? 'Inspect the VS Code extension source code in src/extension.ts and src/core/workspaceSafety.ts.'
            : `Inspect active local workspace (${data.workspaceName}) and diagnose any issues.`,
          report
        );
      }
    } catch (err) {
      setErrorBanner(
        err instanceof Error
          ? err.message
          : 'Failed to sync local workspace.'
      );
    } finally {
      setIsSyncingLocalWorkspace(false);
    }
  };

  const handleDownloadVsCodeExtension = async () => {
    try {
      const res = await fetch('/api/vscode/extension-files');
      const data = await res.json();
      if (!res.ok || !data.files) {
        setErrorBanner(data.error || 'Failed to package VS Code extension.');
        return;
      }

      const zip = new JSZip();
      for (const file of data.files as RepoFile[]) {
        zip.file(`vscode-extension/${file.path}`, file.content);
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'repopilot-ai-vscode-extension.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorBanner(
        err instanceof Error
          ? err.message
          : 'Failed to download VS Code extension.'
      );
    }
  };

  const handleSelectSampleRepo = (repoId: string) => {
    const found = SAMPLE_REPOSITORIES.find((r) => r.id === repoId);
    if (!found) return;

    const entries = found.files.map((f) => ({
      path: f.path,
      content: f.content,
      uncompressedBytes: f.sizeBytes,
    }));
    const { report } = validateRepositoryEntries(`${found.id}.zip`, entries);
    setUploadStatusMessage(null);
    loadNewRepositoryIntoWorkspace(
      found.id,
      found.files,
      found.defaultTask,
      report
    );
  };

  const handleUploadFilesOrZip = async (fileListInput: FileList | File[]) => {
    const fileArray = Array.from(fileListInput);
    if (fileArray.length === 0) return;

    setIsUploadingProject(true);
    setErrorBanner(null);
    setUploadStatusMessage(null);

    try {
      // Case 1: Single .zip archive uploaded
      if (
        fileArray.length === 1 &&
        fileArray[0].name.toLowerCase().endsWith('.zip')
      ) {
        const zipFile = fileArray[0];
        const arrayBuf = await zipFile.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuf);
        let binary = '';
        for (let i = 0; i < uint8.byteLength; i++) {
          binary += String.fromCharCode(uint8[i]);
        }
        const base64Zip = btoa(binary);

        const res = await fetch('/api/upload-project', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectName: zipFile.name.replace(/\.zip$/i, ''),
            base64Zip,
            limits: uploadLimits,
          }),
        });
        const data = await res.json();
        if (data.report) {
          setValidationReport(data.report);
        }
        if (!res.ok) {
          setErrorBanner(data.error || 'ZIP archive validation failed.');
          return;
        }

        if (data.acceptedFiles && data.acceptedFiles.length > 0) {
          const cleanName =
            data.projectName || zipFile.name.replace(/\.zip$/i, '');
          loadNewRepositoryIntoWorkspace(
            cleanName,
            data.acceptedFiles,
            `Analyze uploaded project "${cleanName}", identify any bugs with file and line references, explain the root cause, and propose minimal fixes.`,
            data.report
          );
          const contextSuffix =
            data.acceptedFiles.length === 1
              ? ' Note: Single-file upload (incomplete project context — unresolved package-relative imports will not be flagged as bugs).'
              : '';
          setUploadStatusMessage(
            `Uploaded "${cleanName}" (${data.acceptedFiles.length} source file${
              data.acceptedFiles.length === 1 ? '' : 's'
            } validated and indexed).${contextSuffix}`
          );
        }
        return;
      }

      // Case 2: Multiple (or single) individual source files uploaded
      const uploadedFilesPayload: Array<{
        path: string;
        content: string;
        sizeBytes: number;
      }> = [];

      for (const f of fileArray) {
        if (f.name.toLowerCase().endsWith('.zip')) {
          continue;
        }
        const relPath =
          (f as File & { webkitRelativePath?: string }).webkitRelativePath ||
          f.name;
        const textContent = await f.text();
        uploadedFilesPayload.push({
          path: relPath,
          content: textContent,
          sizeBytes: f.size,
        });
      }

      const inferredProjectName =
        fileArray.length === 1
          ? fileArray[0].name.replace(/\.[^.]+$/, '') || 'uploaded-file'
          : `uploaded-project (${fileArray.length} files)`;

      const res = await fetch('/api/upload-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: inferredProjectName,
          files: uploadedFilesPayload,
          limits: uploadLimits,
        }),
      });

      const data = await res.json();
      if (data.report) {
        setValidationReport(data.report);
      }
      if (!res.ok) {
        setErrorBanner(data.error || 'Source file validation failed.');
        return;
      }

      if (data.acceptedFiles && data.acceptedFiles.length > 0) {
        const cleanName = data.projectName || inferredProjectName;
        loadNewRepositoryIntoWorkspace(
          cleanName,
          data.acceptedFiles,
          `Analyze the uploaded source files (${data.acceptedFiles
            .map((af: RepoFile) => af.path)
            .slice(0, 4)
            .join(', ')}), identify any bugs, explain the problems, and propose fixes.`,
          data.report
        );
        const singleFileNotice =
          data.acceptedFiles.length === 1
            ? ' Project context is incomplete (single-file upload): unresolved relative imports will be treated as context checks rather than bugs.'
            : '';
        setUploadStatusMessage(
          `Uploaded ${data.acceptedFiles.length} source file${
            data.acceptedFiles.length === 1 ? '' : 's'
          } into "${cleanName}".${singleFileNotice}`
        );
      }
    } catch (err) {
      setErrorBanner(
        err instanceof Error
          ? err.message
          : 'Failed to process uploaded project files.'
      );
    } finally {
      setIsUploadingProject(false);
    }
  };

  const handleUploadZipFile = async (file: File) => {
    await handleUploadFilesOrZip([file]);
  };

  const handleImportGitHubRepo = async (params: {
    repoUrl: string;
    branch?: string;
    githubToken?: string;
  }) => {
    setIsImportingGitHub(true);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/import-github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorBanner(data.error || 'Failed to import GitHub repository.');
        if (data.report) {
          setValidationReport(data.report);
        }
        return;
      }

      if (data.acceptedFiles && data.acceptedFiles.length > 0) {
        loadNewRepositoryIntoWorkspace(
          data.repoName || 'github-import',
          data.acceptedFiles,
          `Analyze imported GitHub repository (${
            data.repoName || params.repoUrl
          }) and fix any bugs or failing tests.`,
          data.report
        );
      }
    } catch (err) {
      setErrorBanner(
        err instanceof Error
          ? err.message
          : 'Failed to import GitHub repository.'
      );
    } finally {
      setIsImportingGitHub(false);
    }
  };

  const handleTriggerMaliciousZipTest = async () => {
    setIsUploadingProject(true);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/validate-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          archiveName: 'untrusted-exploit-attempt.zip',
          testMaliciousFixture: true,
        }),
      });
      const data = await res.json();
      if (data.report) {
        setValidationReport(data.report);
      }
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : 'Failed to run security fixture.'
      );
    } finally {
      setIsUploadingProject(false);
    }
  };

  const runAnalysisWithTaskText = async (
    promptText: string,
    actionType?: QuickAgentActionType,
    overrideSelection?: CodeSelectionContext | null
  ) => {
    if (!promptText.trim()) return;
    setIsAnalyzing(true);
    setErrorBanner(null);

    const activeSel =
      overrideSelection !== undefined ? overrideSelection : selectionContext;

    const userMsg: ChatMessageItem = {
      id: `user-${Date.now()}`,
      role: 'user',
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      content: promptText,
      actionType,
      selectionContext: activeSel || undefined,
    };
    setChatMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch('/api/analyze-and-patch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: selectedProviderId,
          customModel,
          repoId: activeRepoId,
          files: originalFiles,
          taskDescription: promptText,
          contextTokenBudget,
          actionType,
          selectionContext: activeSel,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = data.error || 'Failed to generate AI plan and patch.';
        setErrorBanner(errMsg);
        setChatMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            timestamp: new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
            content: `Error: ${errMsg}`,
            lifecycleState: 'FAILED',
          },
        ]);
        return;
      }

      const bundle: ProposedPatchBundle = data.patchBundle;
      setPatchBundle(bundle);
      setSandboxRunResult(null);
      setViewingStagedCopy(false);

      const codePreviewBlock =
        bundle.changes.length > 0
          ? `\n\n\`\`\`${
              originalFiles.find((f) => f.path === bundle.changes[0].filePath)
                ?.language || 'python'
            }\n${bundle.changes[0].proposedContent
              .split('\n')
              .slice(0, 28)
              .join('\n')}\n\`\`\``
          : '';

      const assistantMsg: ChatMessageItem = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        content: bundle.needsClarification
          ? `Clarification needed: ${bundle.clarifyingQuestion}`
          : `${bundle.plan.summary}\n\nRoot Cause (${bundle.plan.rootCauseType}): ${bundle.plan.rootCause}${codePreviewBlock}`,
        actionType,
        inspectedFiles: bundle.plan.inspectedFiles || bundle.plan.affectedFiles,
        modifiedFiles: bundle.changes.map((c) => c.filePath),
        patchBundleId: bundle.id,
        verificationStatus: bundle.verificationStatus,
        testOutcome: bundle.testOutcome,
        lifecycleState: bundle.lifecycleState,
      };
      setChatMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Error communicating with AI service.';
      setErrorBanner(msg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleTriggerQuickAction = (
    action: QuickAgentActionType,
    sel?: CodeSelectionContext | null
  ) => {
    const targetSelection = sel !== undefined ? sel : selectionContext;
    const targetLabel = targetSelection
      ? `${targetSelection.filePath} (L${targetSelection.startLine}–L${targetSelection.endLine})`
      : selectedFilePath;

    const actionPrompts: Record<QuickAgentActionType, string> = {
      'explain-code': `Explain the implementation, control flow, and edge cases in ${targetLabel}.`,
      'find-bug': `Inspect ${targetLabel} and its callers/tests to identify the exact root cause of any bug.`,
      'fix-bug':
        taskDescription.trim() ||
        `Fix the bug in ${targetLabel} with minimal surgical changes and verify with tests.`,
      refactor: `Refactor ${targetLabel} for clarity and maintainability while preserving all public interfaces and tests.`,
      'generate-tests': `Generate comprehensive unit test cases covering edge cases for ${targetLabel}.`,
      'implement-feature':
        taskDescription.trim() ||
        `Implement the requested feature in ${targetLabel} and update relevant tests.`,
      custom:
        taskDescription.trim() ||
        `Analyze ${targetLabel} and propose minimal validated improvements.`,
    };

    const promptToRun = actionPrompts[action];
    setTaskDescription(promptToRun);
    void runAnalysisWithTaskText(promptToRun, action, targetSelection);
  };

  const handleSubmitClarification = (clarificationText: string) => {
    const combinedPrompt = `${taskDescription.trim()} — Developer Clarification: ${clarificationText}`;
    setTaskDescription(combinedPrompt);
    void runAnalysisWithTaskText(combinedPrompt);
  };

  const handleApprovePatch = () => {
    if (!patchBundle) return;
    setPatchBundle({
      ...patchBundle,
      approvalStatus: 'approved_staged',
      approvedAt: new Date().toISOString(),
    });
    setViewingStagedCopy(true);
  };

  const handleRevertApproval = () => {
    if (!patchBundle) return;
    setPatchBundle({
      ...patchBundle,
      approvalStatus: 'pending_review',
      approvedAt: undefined,
    });
    setViewingStagedCopy(false);
    setSandboxRunResult(null);
  };

  const handleRejectOrRevertPatch = () => {
    if (!patchBundle) return;
    setPatchBundle({
      ...patchBundle,
      approvalStatus: 'rejected',
      approvedAt: undefined,
    });
    setViewingStagedCopy(false);
    setSandboxRunResult(null);
  };

  const executeSandboxVerification = async (
    bundleToRun: ProposedPatchBundle
  ) => {
    setIsRunningSandbox(true);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/run-sandbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoId: activeRepoId,
          originalFiles,
          patchBundle: bundleToRun,
          mode: sandboxMode,
          providerId: selectedProviderId,
        }),
      });
      const data = (await res.json()) as SandboxRunResponse & {
        error?: string;
      };
      if (!res.ok) {
        setErrorBanner(data.error || 'Sandbox execution failed.');
        return;
      }

      setSandboxRunResult(data);
      if (data.finalPatchBundle) {
        setPatchBundle({
          ...data.finalPatchBundle,
          approvalStatus: 'approved_staged',
        });
      }

      const lastCmd =
        data.attempts[data.attempts.length - 1]?.command || 'pytest -q';
      const honestSummary =
        !data.isSimulated && data.verificationStatus === 'VERIFIED'
          ? `Verified: Real test suite (\`${lastCmd}\`) executed in isolated sandbox and passed (Retries: ${data.retryCount}/${data.maxRetries}).`
          : data.verificationStatus === 'FAILED'
          ? `Failed: Test suite (\`${lastCmd}\`) failed after ${data.retryCount}/${data.maxRetries} repair attempt(s). Click "Inspect test output" to review logs.`
          : `Not Verified: Static syntax and patch checks completed for \`${lastCmd}\`, but an isolated container runner is not configured on this host so tests were not executed in a live runtime.`;

      setChatMessages((prev) => [
        ...prev,
        {
          id: `sandbox-${Date.now()}`,
          role: 'assistant',
          timestamp: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
          content: honestSummary,
          verificationStatus: data.isSimulated
            ? 'NOT_VERIFIED'
            : data.verificationStatus,
          testOutcome: data.isSimulated ? 'NOT_VERIFIED' : data.testOutcome,
          lifecycleState:
            !data.isSimulated && data.verificationStatus === 'VERIFIED'
              ? 'VERIFIED'
              : data.verificationStatus === 'FAILED'
              ? 'FAILED'
              : 'NOT_VERIFIED',
        },
      ]);
    } catch (err) {
      setErrorBanner(
        err instanceof Error
          ? err.message
          : 'Failed to run sandbox verification.'
      );
    } finally {
      setIsRunningSandbox(false);
    }
  };

  const handleRunSandboxTests = () => {
    if (!patchBundle) return;
    void executeSandboxVerification(patchBundle);
  };

  const handleApproveAndRun = () => {
    if (!patchBundle) return;
    const approved: ProposedPatchBundle = {
      ...patchBundle,
      approvalStatus: 'approved_staged',
      approvedAt: new Date().toISOString(),
    };
    setPatchBundle(approved);
    setViewingStagedCopy(true);
    void executeSandboxVerification(approved);
  };

  const handleDownloadPatchFile = () => {
    if (!patchBundle) return;
    const safePatch = redactSecrets(patchBundle.unifiedPatchFile);
    const blob = new Blob([safePatch], { type: 'text/x-diff;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeRepoId}-repopilot.patch`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadIndividualFile = (
    filePath: string,
    preferCorrected = true
  ) => {
    const resolved = resolveIndividualFileForDownload(
      filePath,
      originalFiles,
      patchBundle,
      preferCorrected
    );
    if (!resolved) return;

    const blob = new Blob([resolved.content], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = resolved.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPatchedZip = async () => {
    const {
      files: filesToExport,
      isApprovedExport,
      unifiedPatchToInclude,
    } = resolveFilesForExport(originalFiles, patchBundle);

    const cleanSlug =
      activeProjectName.replace(/[^A-Za-z0-9_.-]+/g, '-') || 'project';
    const zip = new JSZip();

    // Preserve exact relative directory structure inside the ZIP archive
    for (const file of filesToExport) {
      zip.file(file.path, redactSecrets(file.content));
    }
    if (unifiedPatchToInclude) {
      zip.file('repopilot-changes.patch', unifiedPatchToInclude);
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = isApprovedExport
      ? `${cleanSlug}-corrected.zip`
      : `${cleanSlug}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-[#0D0D0F] text-neutral-100">
      {/* 1. LEFT SIDEBAR (Collapsible) */}
      <MinimalSidebar
        isOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        onNewChat={handleNewChat}
        activeProjectName={activeProjectName}
        activeRepoId={activeRepoId}
        isWorkspaceConnected={isWorkspaceConnected}
        onOpenWorkspaceModal={() => setIsWorkspaceModalOpen(true)}
        files={activeFileList}
        selectedFilePath={selectedFilePath}
        modifiedPaths={modifiedPaths}
        dirtyPaths={dirtyPaths}
        onSelectFile={handleSelectFile}
        conversations={conversationList}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onOpenSettings={(tab = 'general') => {
          setSettingsTab(tab);
          setIsSettingsModalOpen(true);
        }}
        sampleRepos={SAMPLE_REPOSITORIES}
        onSelectSampleRepo={handleSelectSampleRepo}
        onUploadZipFile={handleUploadZipFile}
        onUploadFilesOrZip={handleUploadFilesOrZip}
        isUploadingProject={isUploadingProject}
        validationReport={validationReport}
        onDownloadCorrectedZip={handleDownloadPatchedZip}
      />

      {/* 2. MAIN CHAT AREA */}
      <MainChatArea
        isSidebarOpen={isSidebarOpen}
        onOpenSidebar={() => setIsSidebarOpen(true)}
        activeProjectName={activeProjectName}
        activeModelName={customModel}
        isProviderConfigured={selectedProviderInfo.configuredOnServer}
        activeProviderEnvVar={selectedProviderInfo.envVarName}
        isWorkspaceConnected={isWorkspaceConnected}
        onOpenWorkspaceModal={() => setIsWorkspaceModalOpen(true)}
        onOpenSettings={(tab = 'general') => {
          setSettingsTab(tab);
          setIsSettingsModalOpen(true);
        }}
        messages={chatMessages}
        taskDescription={taskDescription}
        onChangeTaskDescription={setTaskDescription}
        onSendMessage={(prompt, actionType) =>
          runAnalysisWithTaskText(prompt, actionType)
        }
        onTriggerQuickAction={(action) => handleTriggerQuickAction(action)}
        isAnalyzing={isAnalyzing}
        isRunningSandbox={isRunningSandbox}
        isUploadingProject={isUploadingProject}
        uploadStatusMessage={uploadStatusMessage}
        onDismissUploadStatus={() => setUploadStatusMessage(null)}
        onUploadFilesOrZip={handleUploadFilesOrZip}
        validationReport={validationReport}
        patchBundle={patchBundle}
        sandboxRunResult={sandboxRunResult}
        onApprovePatch={handleApprovePatch}
        onRejectPatch={handleRejectOrRevertPatch}
        onRevertApproval={handleRevertApproval}
        onRunTests={handleRunSandboxTests}
        onApproveAndRunTests={handleApproveAndRun}
        onDownloadPatchFile={handleDownloadPatchFile}
        onDownloadCorrectedZip={handleDownloadPatchedZip}
        onDownloadIndividualFile={handleDownloadIndividualFile}
        onSubmitClarification={handleSubmitClarification}
        errorBanner={errorBanner}
        onDismissError={() => setErrorBanner(null)}
        isFileViewerOpen={isFileViewerOpen}
        onCloseFileViewer={() => setIsFileViewerOpen(false)}
        activeFile={activeFile}
        filesCount={activeFileList.length}
        selectedFilePath={selectedFilePath}
        onSelectFile={handleSelectFile}
        selectionContext={selectionContext}
        onChangeSelectionContext={setSelectionContext}
        viewingStagedCopy={viewingStagedCopy}
        onToggleViewingStagedCopy={setViewingStagedCopy}
      />

      {/* 3. WORKSPACE CONNECTION & UPLOAD MODAL */}
      <WorkspacePickerModal
        isOpen={isWorkspaceModalOpen}
        onClose={() => setIsWorkspaceModalOpen(false)}
        activeProjectName={activeProjectName}
        activeRepoId={activeRepoId}
        isWorkspaceConnected={isWorkspaceConnected}
        onToggleWorkspaceConnected={setIsWorkspaceConnected}
        onSyncLocalWorkspace={handleSyncLocalWorkspace}
        isSyncingLocalWorkspace={isSyncingLocalWorkspace}
        onDownloadVsCodeExtension={handleDownloadVsCodeExtension}
        sampleRepos={SAMPLE_REPOSITORIES}
        onSelectSampleRepo={handleSelectSampleRepo}
        onUploadZipFile={handleUploadZipFile}
        onUploadFilesOrZip={handleUploadFilesOrZip}
        onImportGitHubRepo={handleImportGitHubRepo}
        isImportingGitHub={isImportingGitHub}
      />

      {/* 4. SETTINGS & ADVANCED MODAL */}
      <SettingsAndAdvancedModal
        isOpen={isSettingsModalOpen}
        activeTab={settingsTab}
        onChangeTab={setSettingsTab}
        onClose={() => setIsSettingsModalOpen(false)}
        providers={providers}
        selectedProviderId={selectedProviderId}
        onSelectProviderId={(id) => {
          setSelectedProviderId(id);
          const found = providers.find((p) => p.id === id);
          if (found) {
            setCustomModel(found.defaultModel);
          }
        }}
        customModel={customModel}
        onChangeCustomModel={setCustomModel}
        contextTokenBudget={contextTokenBudget}
        onChangeContextTokenBudget={setContextTokenBudget}
        uploadLimits={uploadLimits}
        onChangeUploadLimits={setUploadLimits}
        isolatedSandboxAvailable={isolatedSandboxAvailable}
        sandboxMode={sandboxMode}
        onChangeSandboxMode={setSandboxMode}
        patchBundle={patchBundle}
        sandboxRunResult={sandboxRunResult}
        isRunningSandbox={isRunningSandbox}
        onRunSandboxTests={handleRunSandboxTests}
        onApproveAndRun={handleApproveAndRun}
        onDownloadPatchFile={handleDownloadPatchFile}
        onDownloadPatchedZip={handleDownloadPatchedZip}
        onDownloadVsCodeExtension={handleDownloadVsCodeExtension}
        onInspectExtensionInEditor={() =>
          handleSyncLocalWorkspace('vscode-extension')
        }
        files={originalFiles}
        taskDescription={taskDescription}
        validationReport={validationReport}
        onTriggerMaliciousZipTest={handleTriggerMaliciousZipTest}
      />
    </div>
  );
}

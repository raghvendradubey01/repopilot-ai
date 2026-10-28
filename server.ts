import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import JSZip from 'jszip';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  generateAnalysisAndPatch,
  getKnownServerSecrets,
  getServerAIProviders,
} from './src/server/aiProviders';
import {
  getSandboxCapabilities,
  runSandboxAndRepairLoop,
} from './src/server/sandboxRunner';
import type {
  AIProviderId,
  CodeSelectionContext,
  ProposedPatchBundle,
  QuickAgentActionType,
  RepoFile,
  SandboxExecutionMode,
  SupportedLanguage,
} from './src/types/repopilot';
import {
  buildCombinedUnifiedPatch,
  buildFileDiffResult,
} from './src/utils/diffEngine';
import { detectLanguageToolchain } from './src/utils/repoAnalyzer';
import {
  getMaliciousDemoArchiveEntries,
  SAMPLE_REPOSITORIES,
} from './src/utils/sampleRepos';
import {
  inferLanguage,
  isSourceTestFile,
  type RawArchiveEntry,
  redactSecrets,
  validateRepositoryEntries,
} from './src/utils/securityValidator';
import {
  buildContextPrivacyManifest,
  classifyTerminalCommandRisk,
  isPathInsideWorkspace,
  redactWorkspaceSecrets,
  shouldExcludeFromWorkspaceIndex,
} from './vscode-extension/src/core/workspaceSafety';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function parseZipBufferToRawEntries(
  zipBuffer: Buffer
): Promise<RawArchiveEntry[]> {
  const zip = await JSZip.loadAsync(zipBuffer);
  const rawEntries: RawArchiveEntry[] = [];

  const zipFileKeys = Object.keys(zip.files);
  for (const relativePath of zipFileKeys) {
    const zipObj = zip.files[relativePath];
    if (zipObj.dir) {
      rawEntries.push({
        path: relativePath,
        content: '',
        uncompressedBytes: 0,
        isDirectory: true,
      });
      continue;
    }

    const uint8 = await zipObj.async('uint8array');
    let textContent = '';
    try {
      textContent = new TextDecoder('utf-8', { fatal: false }).decode(uint8);
    } catch {
      textContent = '';
    }

    rawEntries.push({
      path: relativePath,
      content: textContent,
      uncompressedBytes: uint8.byteLength,
      isDirectory: false,
    });
  }
  return rawEntries;
}

export function parseGitHubRepoUrl(rawUrl: string): {
  owner: string;
  repo: string;
  branch?: string;
} | null {
  const trimmed = rawUrl.trim().replace(/\.git$/i, '');
  const urlMatch = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/tree\/([A-Za-z0-9_./-]+))?\/?$/i
  );
  if (urlMatch) {
    return {
      owner: urlMatch[1],
      repo: urlMatch[2],
      branch: urlMatch[3],
    };
  }
  const shortMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (shortMatch) {
    return {
      owner: shortMatch[1],
      repo: shortMatch[2],
    };
  }
  return null;
}

/**
 * Safely scans a local workspace directory (excluding node_modules, .git, build folders,
 * virtualenvs, secrets, and files > 256 KB) for Local Workspace Mode.
 */
export function scanLocalWorkspaceDirectory(
  workspaceRoot: string,
  maxFiles = 45
): {
  workspaceRoot: string;
  workspaceName: string;
  files: RepoFile[];
  excludedPaths: Array<{ path: string; reason: string; detail: string }>;
} {
  const files: RepoFile[] = [];
  const excludedPaths: Array<{ path: string; reason: string; detail: string }> =
    [];

  function walk(currentDir: string) {
    if (files.length >= maxFiles) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) break;
      const fullPath = path.join(currentDir, entry.name);
      const check = isPathInsideWorkspace(workspaceRoot, fullPath);
      if (!check.allowed) {
        continue;
      }

      if (entry.isDirectory()) {
        const dirFilter = shouldExcludeFromWorkspaceIndex(
          `${check.relativePath}/placeholder.txt`,
          0
        );
        if (dirFilter.excluded) {
          excludedPaths.push({
            path: check.relativePath,
            reason: dirFilter.reason || 'excluded_directory',
            detail: dirFilter.detail || 'Excluded directory',
          });
          continue;
        }
        walk(fullPath);
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          const preFilter = shouldExcludeFromWorkspaceIndex(
            check.relativePath,
            stat.size
          );
          if (preFilter.excluded) {
            excludedPaths.push({
              path: check.relativePath,
              reason: preFilter.reason || 'excluded_file',
              detail: preFilter.detail || 'Excluded file',
            });
            continue;
          }

          const content = fs.readFileSync(fullPath, 'utf-8');
          const contentFilter = shouldExcludeFromWorkspaceIndex(
            check.relativePath,
            stat.size,
            content
          );
          if (contentFilter.excluded) {
            excludedPaths.push({
              path: check.relativePath,
              reason: contentFilter.reason || 'secret_or_binary',
              detail: contentFilter.detail || 'Excluded content',
            });
            continue;
          }

          const detectedLang: SupportedLanguage =
            inferLanguage(check.relativePath, content) || 'text';
          files.push({
            path: check.relativePath,
            content: redactWorkspaceSecrets(content, getKnownServerSecrets()),
            sizeBytes: stat.size,
            language: detectedLang,
            isTestFile: isSourceTestFile(check.relativePath),
          });
        } catch {
          // Skip unreadable file
        }
      }
    }
  }

  walk(workspaceRoot);

  return {
    workspaceRoot,
    workspaceName: path.basename(workspaceRoot),
    files,
    excludedPaths,
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '8mb' }));

  // 1. System & Provider Status (Never exposes secret API key strings)
  app.get('/api/status', (_req, res) => {
    res.json({
      providers: getServerAIProviders(),
      sandbox: getSandboxCapabilities(),
      sampleRepositories: SAMPLE_REPOSITORIES,
      localWorkspaceAvailable: true,
      activeWorkspaceRoot: __dirname,
    });
  });

  // 1b. Local Workspace Inspection (Primary Mode — No ZIP Upload Required)
  app.get('/api/local-workspace/inspect', (req, res) => {
    try {
      const subDir =
        typeof req.query.subdir === 'string' ? req.query.subdir.trim() : '';
      const targetRoot = subDir
        ? isPathInsideWorkspace(__dirname, subDir).allowed
          ? path.resolve(__dirname, subDir)
          : __dirname
        : __dirname;

      const scanned = scanLocalWorkspaceDirectory(targetRoot, 45);
      const toolchain = detectLanguageToolchain(scanned.files);

      res.json({
        workspaceRoot: scanned.workspaceRoot,
        workspaceName: scanned.workspaceName,
        files: scanned.files,
        excludedPaths: scanned.excludedPaths,
        toolchain,
      });
    } catch (err) {
      res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Failed to inspect local workspace.',
      });
    }
  });

  // 1c. Terminal Command Risk Classifier (Approval Gate before Execution)
  app.post('/api/local-workspace/classify-command', (req, res) => {
    const { command } = req.body as { command?: string };
    if (!command || !command.trim()) {
      res.status(400).json({ error: 'Terminal command is required.' });
      return;
    }
    const classification = classifyTerminalCommandRisk(command);
    res.json({ classification });
  });

  // 1d. VS Code Extension Agent Turn Endpoint (/api/vscode/agent-turn)
  app.post('/api/vscode/agent-turn', async (req, res) => {
    try {
      const {
        providerId,
        customModel,
        workspaceName,
        files,
        totalWorkspaceFiles,
        diagnostics,
        selectionContext,
        taskDescription,
        actionType,
        contextTokenBudget,
      } = req.body as {
        providerId?: AIProviderId;
        customModel?: string;
        workspaceName?: string;
        files?: RepoFile[];
        totalWorkspaceFiles?: number;
        diagnostics?: Array<{
          filePath: string;
          line: number;
          column: number;
          severity: string;
          message: string;
        }>;
        selectionContext?: CodeSelectionContext | null;
        taskDescription?: string;
        actionType?: QuickAgentActionType;
        contextTokenBudget?: number;
      };

      if (!files || !Array.isArray(files) || files.length === 0) {
        res.status(400).json({
          error: 'Workspace files subset is required for VS Code agent turn.',
        });
        return;
      }

      if (!taskDescription || !taskDescription.trim()) {
        res.status(400).json({ error: 'Task description is required.' });
        return;
      }

      let augmentedPrompt = taskDescription.trim();
      if (diagnostics && diagnostics.length > 0) {
        const diagLines = diagnostics
          .slice(0, 10)
          .map(
            (d) =>
              `[${d.severity.toUpperCase()}] ${d.filePath}:${d.line}:${d.column} — ${d.message}`
          )
          .join('\n');
        augmentedPrompt += `\n\nVS Code Diagnostics:\n${diagLines}`;
      }

      const analysis = await generateAnalysisAndPatch({
        providerId: providerId || 'gemini',
        customModel,
        repoId: workspaceName || 'vscode-local-workspace',
        files,
        taskDescription: augmentedPrompt,
        actionType,
        selectionContext,
        contextTokenBudget: contextTokenBudget || 8000,
        stage: 'initial',
      });

      const diffs = analysis.changes.map(buildFileDiffResult);
      const unifiedPatchFile = buildCombinedUnifiedPatch(diffs);
      const testCmd =
        analysis.structuredOutput.tests_to_run.full_suite_command || 'pytest -q';
      const terminalCommandClassification =
        classifyTerminalCommandRisk(testCmd);

      const privacyManifest = buildContextPrivacyManifest({
        workspaceRootName: workspaceName || 'local-workspace',
        providerId: providerId || 'gemini',
        modelId: analysis.plan.modelUsed,
        endpointUrl: 'RepoPilot AI Server (/api/vscode/agent-turn)',
        totalWorkspaceFiles: totalWorkspaceFiles || files.length,
        filesTransmitted: analysis.diagnostics.contextReport.includedFiles.map(
          (f) => ({
            relativePath: f.path,
            mode: f.mode,
            estimatedTokens: f.estimatedTokens,
          })
        ),
      });

      const patchBundle: ProposedPatchBundle = {
        id: `vscode-patch-${Date.now()}`,
        taskDescription: taskDescription.trim(),
        actionType: actionType || 'custom',
        selectionContext: selectionContext || null,
        lifecycleState: analysis.patchValidationPassed
          ? 'VALIDATING_PATCH'
          : 'FAILED',
        plan: analysis.plan,
        structuredOutput: analysis.structuredOutput,
        changes: analysis.changes,
        diffs,
        unifiedPatchFile,
        approvalStatus: 'pending_review',
        attemptNumber: 1,
        verificationStatus: analysis.verificationStatus,
        testOutcome: 'NOT_VERIFIED',
        needsClarification: Boolean(
          analysis.structuredOutput.clarifying_question
        ),
        clarifyingQuestion:
          analysis.structuredOutput.clarifying_question ?? null,
        isNoChangeTask:
          analysis.structuredOutput.root_cause.type === 'NONE_NO_CHANGE_NEEDED',
        patchValidationPassed: analysis.patchValidationPassed,
        diagnostics: analysis.diagnostics,
      };

      res.json({
        patchBundle,
        privacyManifest,
        terminalCommandClassification,
      });
    } catch (err) {
      const safeErr = redactSecrets(
        err instanceof Error ? err.message : 'VS Code agent turn failed.',
        getKnownServerSecrets()
      );
      res.status(500).json({ error: safeErr });
    }
  });

  // 1e. Inspect / Download VS Code Extension Source Files (/vscode-extension)
  app.get('/api/vscode/extension-files', (_req, res) => {
    try {
      const extDir = path.join(__dirname, 'vscode-extension');
      const scanned = scanLocalWorkspaceDirectory(extDir, 30);
      res.json({
        extensionDir: 'vscode-extension',
        files: scanned.files,
      });
    } catch (err) {
      res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Failed to read vscode-extension directory.',
      });
    }
  });

  // 2. Fallback: Validate Uploaded ZIP Archive or Synthetic Security Test Fixture
  app.post('/api/validate-zip', async (req, res) => {
    try {
      const { archiveName, base64Zip, testMaliciousFixture } = req.body as {
        archiveName?: string;
        base64Zip?: string;
        testMaliciousFixture?: boolean;
      };

      if (testMaliciousFixture) {
        const entries = getMaliciousDemoArchiveEntries();
        const result = validateRepositoryEntries(
          archiveName || 'malicious-test-bundle.zip',
          entries
        );
        res.json(result);
        return;
      }

      if (!base64Zip || typeof base64Zip !== 'string') {
        res.status(400).json({
          error: 'Missing base64Zip payload for repository validation.',
        });
        return;
      }

      const zipBuffer = Buffer.from(base64Zip, 'base64');
      if (zipBuffer.byteLength > 6 * 1024 * 1024) {
        res.status(400).json({
          error: 'Uploaded ZIP archive exceeds the 6 MB compressed upload limit.',
        });
        return;
      }

      const rawEntries = await parseZipBufferToRawEntries(zipBuffer);
      const result = validateRepositoryEntries(
        archiveName || 'uploaded-repo.zip',
        rawEntries
      );
      res.json(result);
    } catch (err) {
      const message = redactSecrets(
        err instanceof Error ? err.message : 'Failed to parse ZIP archive.',
        getKnownServerSecrets()
      );
      res.status(400).json({ error: `Invalid or corrupted ZIP file: ${message}` });
    }
  });

  // 2b. Import Repository from GitHub URL (Public or Private via Optional Token)
  app.post('/api/import-github', async (req, res) => {
    const { repoUrl, branch, githubToken } = req.body as {
      repoUrl?: string;
      branch?: string;
      githubToken?: string;
    };

    try {
      if (!repoUrl || !repoUrl.trim()) {
        res.status(400).json({ error: 'GitHub repository URL is required.' });
        return;
      }

      const parsed = parseGitHubRepoUrl(repoUrl);
      if (!parsed) {
        res.status(400).json({
          error:
            'Invalid GitHub repository URL. Expected format: https://github.com/owner/repo or owner/repo.',
        });
        return;
      }

      const targetRef = branch?.trim() || parsed.branch || '';
      const zipballUrl = targetRef
        ? `https://api.github.com/repos/${encodeURIComponent(
            parsed.owner
          )}/${encodeURIComponent(parsed.repo)}/zipball/${encodeURIComponent(
            targetRef
          )}`
        : `https://api.github.com/repos/${encodeURIComponent(
            parsed.owner
          )}/${encodeURIComponent(parsed.repo)}/zipball`;

      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'RepoPilot-AI-Workspace',
      };
      const effectiveToken =
        githubToken?.trim() || process.env.GITHUB_TOKEN?.trim();
      if (effectiveToken) {
        headers.Authorization = `Bearer ${effectiveToken}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      let ghRes: Response;
      try {
        ghRes = await fetch(zipballUrl, {
          headers,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!ghRes.ok) {
        const statusMsg =
          ghRes.status === 404
            ? `Repository "${parsed.owner}/${parsed.repo}" not found or is private (provide a Personal Access Token for private repositories).`
            : ghRes.status === 401 || ghRes.status === 403
            ? `GitHub authentication failed or rate-limited (HTTP ${ghRes.status}). Check your GitHub token permissions.`
            : `GitHub API returned HTTP ${ghRes.status}.`;
        res.status(ghRes.status).json({ error: statusMsg });
        return;
      }

      const arrayBuffer = await ghRes.arrayBuffer();
      const zipBuffer = Buffer.from(arrayBuffer);
      if (zipBuffer.byteLength > 6 * 1024 * 1024) {
        res.status(400).json({
          error:
            'GitHub repository archive exceeds the 6 MB compressed workspace limit.',
        });
        return;
      }

      const rawEntries = await parseZipBufferToRawEntries(zipBuffer);
      const archiveLabel = `${parsed.owner}-${parsed.repo}.zip`;
      const result = validateRepositoryEntries(archiveLabel, rawEntries);

      res.json({
        ...result,
        repoName: `${parsed.owner}/${parsed.repo}`,
      });
    } catch (err) {
      const safeErr = redactSecrets(
        err instanceof Error ? err.message : 'GitHub repository import failed.',
        [...getKnownServerSecrets(), githubToken]
      );
      res.status(500).json({ error: safeErr });
    }
  });

  // 3. Analyze Repository & Generate Structured Plan + Proposed Code Patch
  app.post('/api/analyze-and-patch', async (req, res) => {
    try {
      const {
        providerId,
        customModel,
        repoId,
        files,
        taskDescription,
        actionType,
        selectionContext,
        contextTokenBudget,
      } = req.body as {
        providerId?: AIProviderId;
        customModel?: string;
        repoId?: string;
        files?: RepoFile[];
        taskDescription?: string;
        actionType?: QuickAgentActionType;
        selectionContext?: CodeSelectionContext | null;
        contextTokenBudget?: number;
      };

      if (!files || !Array.isArray(files) || files.length === 0) {
        res.status(400).json({ error: 'Repository files are required.' });
        return;
      }

      if (!taskDescription || !taskDescription.trim()) {
        res.status(400).json({ error: 'Task description is required.' });
        return;
      }

      const analysis = await generateAnalysisAndPatch({
        providerId: providerId || 'gemini',
        customModel,
        repoId: repoId || 'custom-repo',
        files,
        taskDescription: taskDescription.trim(),
        actionType,
        selectionContext,
        contextTokenBudget: contextTokenBudget || 8000,
        stage: 'initial',
      });

      const diffs = analysis.changes.map(buildFileDiffResult);
      const unifiedPatchFile = buildCombinedUnifiedPatch(diffs);

      const isNoChange =
        analysis.structuredOutput.root_cause.type === 'NONE_NO_CHANGE_NEEDED';
      const needsClarification =
        analysis.structuredOutput.root_cause.type === 'AMBIGUOUS_TASK' ||
        Boolean(analysis.structuredOutput.clarifying_question);

      const lifecycleState = needsClarification
        ? 'PLANNING'
        : !analysis.patchValidationPassed
        ? 'FAILED'
        : 'VALIDATING_PATCH';

      const patchBundle: ProposedPatchBundle = {
        id: `patch-${Date.now()}`,
        taskDescription: taskDescription.trim(),
        actionType: actionType || 'custom',
        selectionContext: selectionContext || null,
        lifecycleState,
        plan: analysis.plan,
        structuredOutput: analysis.structuredOutput,
        changes: analysis.changes,
        diffs,
        unifiedPatchFile,
        approvalStatus: isNoChange ? 'approved_staged' : 'pending_review',
        attemptNumber: 1,
        verificationStatus: analysis.verificationStatus,
        testOutcome: 'NOT_VERIFIED',
        needsClarification,
        clarifyingQuestion:
          analysis.structuredOutput.clarifying_question ?? null,
        isNoChangeTask: isNoChange,
        patchValidationPassed: analysis.patchValidationPassed,
        diagnostics: analysis.diagnostics,
      };

      res.json({ patchBundle });
    } catch (err) {
      const safeErr = redactSecrets(
        err instanceof Error ? err.message : 'Analysis failed.',
        getKnownServerSecrets()
      );
      res.status(500).json({ error: safeErr });
    }
  });

  // 4. Execute Tests in Isolated Sandbox (or Labeled Demo Simulation) with up to 2 Auto-Repairs
  app.post('/api/run-sandbox', async (req, res) => {
    try {
      const {
        repoId,
        originalFiles,
        patchBundle,
        mode,
        providerId,
        customModel,
      } = req.body as {
        repoId?: string;
        originalFiles?: RepoFile[];
        patchBundle?: ProposedPatchBundle;
        mode?: SandboxExecutionMode;
        providerId?: AIProviderId;
        customModel?: string;
      };

      if (!originalFiles || !patchBundle) {
        res.status(400).json({
          error:
            'originalFiles and patchBundle are required to run sandbox verification.',
        });
        return;
      }

      if (patchBundle.approvalStatus !== 'approved_staged') {
        res.status(400).json({
          error:
            'Safety Gate: Proposed patch must be reviewed and approved before running sandbox verification.',
        });
        return;
      }

      const sandboxResult = await runSandboxAndRepairLoop({
        repoId: repoId || 'billing-engine-py',
        originalFiles,
        patchBundle,
        mode: mode || 'strict_isolated_only',
        providerId: providerId || 'gemini',
        customModel,
      });

      res.json(sandboxResult);
    } catch (err) {
      const safeErr = redactSecrets(
        err instanceof Error ? err.message : 'Sandbox verification failed.',
        getKnownServerSecrets()
      );
      res.status(500).json({ error: safeErr });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`RepoPilot AI server listening on http://localhost:${PORT}`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

import path from 'path';

export interface ContextPrivacyManifest {
  workspaceRootName: string;
  providerId: string;
  modelId: string;
  endpointUrl: string;
  totalWorkspaceFiles: number;
  filesTransmitted: Array<{
    relativePath: string;
    mode: 'full' | 'excerpt';
    estimatedTokens: number;
  }>;
  totalEstimatedTokens: number;
  secretsRedacted: boolean;
  disclosureText: string;
}

export interface WorkspaceTreeDirectoryNode {
  type: 'directory';
  name: string;
  relativePath: string;
  children: Array<WorkspaceTreeDirectoryNode | WorkspaceTreeFileNode>;
}

export interface WorkspaceTreeFileNode {
  type: 'file';
  name: string;
  relativePath: string;
  sizeBytes: number;
  language: string;
  isTestFile: boolean;
}

export type ValidatedWebviewMessage =
  | { type: 'inspectWorkspace' }
  | { type: 'analyzeActiveFile'; customPrompt?: string }
  | { type: 'submitTask'; prompt: string; activeFilePath?: string }
  | { type: 'readFile'; relativePath: string }
  | { type: 'searchFilenames'; query: string }
  | { type: 'searchText'; query: string }
  | { type: 'configureApiKey' };

export interface WebviewMessageValidationResult {
  valid: boolean;
  message?: ValidatedWebviewMessage;
  errorCode?:
    | 'INVALID_PAYLOAD'
    | 'UNKNOWN_MESSAGE_TYPE'
    | 'INVALID_PATH'
    | 'EMPTY_PROMPT'
    | 'PROMPT_TOO_LONG'
    | 'QUERY_TOO_LONG';
  errorMessage?: string;
}

export type TerminalCommandRiskLevel =
  | 'safe_test_or_check'
  | 'requires_approval_install_or_mutation'
  | 'blocked_or_high_risk_destructive';

export interface TerminalCommandClassification {
  command: string;
  riskLevel: TerminalCommandRiskLevel;
  requiresExplicitModalWarning: boolean;
  reason: string;
  matchedPattern?: string;
}

const EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  '.venv',
  'venv',
  'env',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.tox',
  'dist',
  'build',
  'out',
  'target',
  '.next',
  '.nuxt',
  'coverage',
  '.idea',
]);

const SECRET_FILE_PATTERNS = [
  /^\.env(\..+)?$/i,
  /^id_rsa(\..+)?$/i,
  /^id_ed25519(\..+)?$/i,
  /.*\.pem$/i,
  /.*\.key$/i,
  /.*\.p12$/i,
  /.*\.pfx$/i,
  /^credentials\.json$/i,
  /^service[-_]?account.*\.json$/i,
  /^\.npmrc$/i,
  /^\.pypirc$/i,
];

const BINARY_EXTENSIONS = new Set([
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.pyc',
  '.pyo',
  '.pyd',
  '.whl',
  '.pkl',
  '.pickle',
  '.tar',
  '.gz',
  '.zip',
  '.7z',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.pdf',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp3',
  '.mp4',
  '.mov',
  '.wasm',
  '.class',
  '.jar',
]);

const SECRET_CONTENT_REGEXES: Array<{ name: string; regex: RegExp }> = [
  { name: 'OpenAI / API Secret Key', regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: 'Google Cloud / Gemini API Key', regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: 'NVIDIA NIM API Key', regex: /\bnvapi-[A-Za-z0-9_-]{20,}\b/g },
  { name: 'AWS Access Key ID', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  {
    name: 'GitHub Personal Access Token',
    regex: /\bgh[pousr]_[A-Za-z0-9_]{25,}\b/g,
  },
  {
    name: 'Private Key Header',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/g,
  },
];

export const MAX_WORKSPACE_FILE_BYTES = 256 * 1024; // 256 KB
export const MAX_TASK_PROMPT_LENGTH = 8000;
export const MAX_SEARCH_QUERY_LENGTH = 300;

/**
 * Verifies that a target file path resolves strictly inside the active VS Code workspace root
 * on both Windows (`C:\Users\...`) and POSIX (`/home/...`) paths.
 * Blocks null bytes, parent traversal (`..`), absolute escapes, and `.git/` internals.
 */
export function isPathInsideWorkspace(
  workspaceRoot: string,
  candidatePath: string
): {
  allowed: boolean;
  resolvedPath: string;
  relativePath: string;
  reason?: string;
} {
  if (!workspaceRoot || !candidatePath || candidatePath.includes('\0')) {
    return {
      allowed: false,
      resolvedPath: '',
      relativePath: '',
      reason: 'Null byte or empty workspace path rejected.',
    };
  }

  const isWindowsRoot = /^[A-Za-z]:[\\/]/.test(workspaceRoot);
  const pathImpl = isWindowsRoot ? path.win32 : path;

  const normalizedRoot = pathImpl.resolve(workspaceRoot);
  const resolvedCandidate =
    pathImpl.isAbsolute(candidatePath) || /^[A-Za-z]:[\\/]/.test(candidatePath)
      ? pathImpl.resolve(candidatePath)
      : pathImpl.resolve(normalizedRoot, candidatePath);

  const rel = pathImpl.relative(normalizedRoot, resolvedCandidate);
  const normalizedRel = rel.replace(/\\/g, '/');

  if (
    rel.startsWith('..') ||
    pathImpl.isAbsolute(rel) ||
    /^[A-Za-z]:/.test(rel) ||
    normalizedRel.startsWith('../') ||
    normalizedRel === '..' ||
    normalizedRel === ''
  ) {
    return {
      allowed: false,
      resolvedPath: resolvedCandidate,
      relativePath: normalizedRel,
      reason: `Path "${candidatePath}" resolves outside the active workspace root ("${normalizedRoot}").`,
    };
  }

  if (
    normalizedRel === '.git' ||
    normalizedRel.startsWith('.git/') ||
    normalizedRel.includes('/.git/')
  ) {
    return {
      allowed: false,
      resolvedPath: resolvedCandidate,
      relativePath: normalizedRel,
      reason:
        'Accessing .git internals or hooks is blocked for workspace safety.',
    };
  }

  return {
    allowed: true,
    resolvedPath: resolvedCandidate,
    relativePath: normalizedRel,
  };
}

/**
 * Determines whether a workspace file should be excluded from default AI context and indexing.
 */
export function shouldExcludeFromWorkspaceIndex(
  relativePath: string,
  sizeBytes: number,
  contentSample?: string
): {
  excluded: boolean;
  reason?:
    | 'excluded_directory'
    | 'secret_file'
    | 'oversized_file'
    | 'binary_file'
    | 'secret_in_content';
  detail?: string;
} {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = normalized.split('/');
  const baseName = segments[segments.length - 1] || '';

  for (let i = 0; i < segments.length - 1; i++) {
    if (EXCLUDED_DIRS.has(segments[i])) {
      return {
        excluded: true,
        reason: 'excluded_directory',
        detail: `Excluded directory "${segments[i]}"`,
      };
    }
  }

  const lowerBase = baseName.toLowerCase();
  if (
    !lowerBase.endsWith('.example') &&
    !lowerBase.endsWith('.template') &&
    !lowerBase.endsWith('.sample')
  ) {
    for (const pattern of SECRET_FILE_PATTERNS) {
      if (pattern.test(baseName)) {
        return {
          excluded: true,
          reason: 'secret_file',
          detail: `Excluded credential/secret file "${baseName}"`,
        };
      }
    }
  }

  const extIdx = lowerBase.lastIndexOf('.');
  if (extIdx !== -1) {
    const ext = lowerBase.slice(extIdx);
    if (BINARY_EXTENSIONS.has(ext)) {
      return {
        excluded: true,
        reason: 'binary_file',
        detail: `Excluded binary or unsupported file extension "${ext}"`,
      };
    }
  }

  if (sizeBytes > MAX_WORKSPACE_FILE_BYTES) {
    return {
      excluded: true,
      reason: 'oversized_file',
      detail: `File size (${sizeBytes} bytes) exceeds 256 KB context limit`,
    };
  }

  if (contentSample) {
    if (contentSample.includes('\0')) {
      return {
        excluded: true,
        reason: 'binary_file',
        detail: 'Binary null-byte content detected',
      };
    }
    for (const { name, regex } of SECRET_CONTENT_REGEXES) {
      regex.lastIndex = 0;
      if (regex.test(contentSample)) {
        return {
          excluded: true,
          reason: 'secret_in_content',
          detail: `Hardcoded ${name} detected in file content`,
        };
      }
    }
  }

  return { excluded: false };
}

/**
 * Validates all inbound messages sent from the Webview UI to the VS Code Extension Host.
 * Prevents the webview from requesting arbitrary host filesystem paths or sending malformed commands.
 */
export function validateWebviewInboundMessage(
  rawMessage: unknown,
  workspaceRoot: string
): WebviewMessageValidationResult {
  if (!rawMessage || typeof rawMessage !== 'object' || Array.isArray(rawMessage)) {
    return {
      valid: false,
      errorCode: 'INVALID_PAYLOAD',
      errorMessage: 'Webview message must be a non-null JSON object.',
    };
  }

  const msg = rawMessage as Record<string, unknown>;
  const msgType = typeof msg.type === 'string' ? msg.type.trim() : '';

  switch (msgType) {
    case 'inspectWorkspace':
      return { valid: true, message: { type: 'inspectWorkspace' } };

    case 'configureApiKey':
      return { valid: true, message: { type: 'configureApiKey' } };

    case 'analyzeActiveFile': {
      const customPrompt =
        typeof msg.customPrompt === 'string'
          ? msg.customPrompt.trim()
          : undefined;
      if (customPrompt && customPrompt.length > MAX_TASK_PROMPT_LENGTH) {
        return {
          valid: false,
          errorCode: 'PROMPT_TOO_LONG',
          errorMessage: `Custom prompt exceeds maximum length of ${MAX_TASK_PROMPT_LENGTH} characters.`,
        };
      }
      return {
        valid: true,
        message: { type: 'analyzeActiveFile', customPrompt },
      };
    }

    case 'submitTask': {
      const prompt = typeof msg.prompt === 'string' ? msg.prompt.trim() : '';
      if (!prompt) {
        return {
          valid: false,
          errorCode: 'EMPTY_PROMPT',
          errorMessage: 'Task description cannot be empty.',
        };
      }
      if (prompt.length > MAX_TASK_PROMPT_LENGTH) {
        return {
          valid: false,
          errorCode: 'PROMPT_TOO_LONG',
          errorMessage: `Task prompt exceeds maximum length of ${MAX_TASK_PROMPT_LENGTH} characters.`,
        };
      }

      let activeFilePath: string | undefined;
      if (typeof msg.activeFilePath === 'string' && msg.activeFilePath.trim()) {
        const check = isPathInsideWorkspace(
          workspaceRoot,
          msg.activeFilePath.trim()
        );
        if (!check.allowed) {
          return {
            valid: false,
            errorCode: 'INVALID_PATH',
            errorMessage:
              check.reason ||
              'Webview attempted to reference a file path outside the active workspace.',
          };
        }
        activeFilePath = check.relativePath;
      }

      return {
        valid: true,
        message: { type: 'submitTask', prompt, activeFilePath },
      };
    }

    case 'readFile': {
      const rawPath =
        typeof msg.relativePath === 'string' ? msg.relativePath.trim() : '';
      if (
        !rawPath ||
        rawPath.startsWith('/') ||
        rawPath.startsWith('\\') ||
        /^[A-Za-z]:/.test(rawPath)
      ) {
        return {
          valid: false,
          errorCode: 'INVALID_PATH',
          errorMessage:
            'Webview readFile requests must use workspace-relative paths only.',
        };
      }

      const check = isPathInsideWorkspace(workspaceRoot, rawPath);
      if (!check.allowed) {
        return {
          valid: false,
          errorCode: 'INVALID_PATH',
          errorMessage:
            check.reason ||
            'Webview attempted to read a path outside the active workspace.',
        };
      }

      const filter = shouldExcludeFromWorkspaceIndex(check.relativePath, 0);
      if (filter.excluded) {
        return {
          valid: false,
          errorCode: 'INVALID_PATH',
          errorMessage: `Access denied for "${check.relativePath}": ${filter.detail}`,
        };
      }

      return {
        valid: true,
        message: { type: 'readFile', relativePath: check.relativePath },
      };
    }

    case 'searchFilenames':
    case 'searchText': {
      const query = typeof msg.query === 'string' ? msg.query.trim() : '';
      if (query.length > MAX_SEARCH_QUERY_LENGTH) {
        return {
          valid: false,
          errorCode: 'QUERY_TOO_LONG',
          errorMessage: `Search query exceeds ${MAX_SEARCH_QUERY_LENGTH} characters.`,
        };
      }
      return {
        valid: true,
        message: { type: msgType, query },
      };
    }

    default:
      return {
        valid: false,
        errorCode: 'UNKNOWN_MESSAGE_TYPE',
        errorMessage: `Unsupported or unrecognized webview message type "${msgType}".`,
      };
  }
}

/**
 * Builds a nested directory and file tree from flat workspace file entries.
 */
export function buildNestedDirectoryTree(
  files: ReadonlyArray<{
    path: string;
    sizeBytes: number;
    language: string;
    isTestFile: boolean;
  }>
): WorkspaceTreeDirectoryNode {
  const root: WorkspaceTreeDirectoryNode = {
    type: 'directory',
    name: '/',
    relativePath: '',
    children: [],
  };

  for (const file of files) {
    const normalized = file.path.replace(/\\/g, '/').replace(/^\/+/, '');
    const parts = normalized.split('/').filter(Boolean);
    let currentDir = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const dirName = parts[i];
      const dirRelPath = parts.slice(0, i + 1).join('/');
      let existing = currentDir.children.find(
        (c): c is WorkspaceTreeDirectoryNode =>
          c.type === 'directory' && c.name === dirName
      );
      if (!existing) {
        existing = {
          type: 'directory',
          name: dirName,
          relativePath: dirRelPath,
          children: [],
        };
        currentDir.children.push(existing);
      }
      currentDir = existing;
    }

    const fileName = parts[parts.length - 1] || normalized;
    currentDir.children.push({
      type: 'file',
      name: fileName,
      relativePath: normalized,
      sizeBytes: file.sizeBytes,
      language: file.language,
      isTestFile: file.isTestFile,
    });
  }

  function sortTree(node: WorkspaceTreeDirectoryNode): void {
    node.children.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    for (const child of node.children) {
      if (child.type === 'directory') {
        sortTree(child);
      }
    }
  }

  sortTree(root);
  return root;
}

/**
 * Redacts API keys, tokens, and private keys from logs, diagnostics, and model prompts.
 */
export function redactWorkspaceSecrets(
  rawText: string,
  extraSecrets: Array<string | undefined> = []
): string {
  if (!rawText) return '';
  let sanitized = rawText;

  for (const { regex } of SECRET_CONTENT_REGEXES) {
    regex.lastIndex = 0;
    sanitized = sanitized.replace(regex, '[REDACTED_SECRET]');
  }

  for (const secret of extraSecrets) {
    if (secret && secret.trim().length >= 8) {
      const escaped = secret.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      sanitized = sanitized.replace(new RegExp(escaped, 'g'), '[REDACTED_KEY]');
    }
  }

  return sanitized;
}

/**
 * Retained helper for command risk classification on the backend / Phase 2 preview.
 */
export function classifyTerminalCommandRisk(
  rawCommand: string
): TerminalCommandClassification {
  const command = rawCommand.trim();

  const destructivePatterns: Array<{ label: string; regex: RegExp }> = [
    {
      label: 'Recursive or forced file deletion (rm -rf / del /s)',
      regex:
        /\brm\s+(-[A-Za-z]*r[A-Za-z]*|-[A-Za-z]*f[A-Za-z]*|--recursive|--force)\b/i,
    },
    {
      label: 'Privilege escalation (sudo / su / doas)',
      regex: /\b(sudo|doas|su\s+-)\b/i,
    },
    {
      label: 'Remote script execution pipe (curl/wget | sh/bash)',
      regex: /\b(curl|wget)\b.*\|\s*(sh|bash|zsh|python|node)\b/i,
    },
    {
      label: 'Destructive git reset or force push',
      regex:
        /\bgit\s+(reset\s+--hard|clean\s+-[A-Za-z]*f|push\s+.*--force|push\s+-f)\b/i,
    },
    {
      label: 'Filesystem formatting or raw disk write (mkfs / dd)',
      regex: /\b(mkfs|dd\s+if=|chmod\s+777|chown\s+-R)\b/i,
    },
    {
      label: 'Command substitution or arbitrary subshell evaluation',
      regex: /(\$\([^)]+\)|`[^`]+`|\beval\s+)/i,
    },
    {
      label: 'Parent directory escape in shell command',
      regex: /(?:^|\s|\/)\.\.(?:\/|\\|\s|$)/,
    },
  ];

  for (const item of destructivePatterns) {
    if (item.regex.test(command)) {
      return {
        command,
        riskLevel: 'blocked_or_high_risk_destructive',
        requiresExplicitModalWarning: true,
        reason: `High-risk destructive pattern detected: ${item.label}.`,
        matchedPattern: item.label,
      };
    }
  }

  const installOrMutatePatterns: Array<{ label: string; regex: RegExp }> = [
    {
      label: 'Package / dependency installation',
      regex:
        /\b(npm\s+(install|i|ci|update)|yarn\s+add|pnpm\s+(add|install)|pip3?\s+install|poetry\s+add|cargo\s+install|go\s+get|apt-get\s+install|brew\s+install)\b/i,
    },
    {
      label: 'Git branch / commit / network mutation',
      regex: /\bgit\s+(commit|checkout|merge|rebase|pull|push|stash|tag)\b/i,
    },
    {
      label: 'File deletion or move command',
      regex: /\b(rm|mv|cp|mkdir|rmdir)\b/i,
    },
  ];

  for (const item of installOrMutatePatterns) {
    if (item.regex.test(command)) {
      return {
        command,
        riskLevel: 'requires_approval_install_or_mutation',
        requiresExplicitModalWarning: true,
        reason: `Requires explicit user approval: ${item.label}.`,
        matchedPattern: item.label,
      };
    }
  }

  const safeTestPatterns: Array<{ label: string; regex: RegExp }> = [
    {
      label: 'Standard test / lint / typecheck runner',
      regex:
        /^(pytest|python3?\s+-m\s+pytest|npm\s+test|npm\s+run\s+(test|lint|build|check)|npx\s+(--yes\s+)?(tsx\s+--test|vitest|jest|tsc\s+--noEmit|eslint)|cargo\s+(test|check|clippy)|go\s+(test|vet)|mvn\s+test|gradle\s+test|dotnet\s+test|bundle\s+exec\s+rspec|phpunit)\b/i,
    },
  ];

  for (const item of safeTestPatterns) {
    if (item.regex.test(command)) {
      return {
        command,
        riskLevel: 'safe_test_or_check',
        requiresExplicitModalWarning: false,
        reason: `Recognized test/verification runner (${item.label}).`,
        matchedPattern: item.label,
      };
    }
  }

  return {
    command,
    riskLevel: 'requires_approval_install_or_mutation',
    requiresExplicitModalWarning: true,
    reason:
      'Unrecognized shell command requires explicit user review and approval before running.',
  };
}

/**
 * Builds a transparent privacy manifest explaining exactly which files/excerpts
 * leave the local machine when querying an external AI provider.
 */
export function buildContextPrivacyManifest(params: {
  workspaceRootName: string;
  providerId: string;
  modelId: string;
  endpointUrl: string;
  totalWorkspaceFiles: number;
  filesTransmitted: Array<{
    relativePath: string;
    mode: 'full' | 'excerpt';
    estimatedTokens: number;
  }>;
}): ContextPrivacyManifest {
  const totalEstimatedTokens = params.filesTransmitted.reduce(
    (sum, f) => sum + f.estimatedTokens,
    0
  );

  return {
    workspaceRootName: params.workspaceRootName,
    providerId: params.providerId,
    modelId: params.modelId,
    endpointUrl: params.endpointUrl,
    totalWorkspaceFiles: params.totalWorkspaceFiles,
    filesTransmitted: params.filesTransmitted,
    totalEstimatedTokens,
    secretsRedacted: true,
    disclosureText: `Privacy Notice: Only ${params.filesTransmitted.length} relevant file(s) (~${totalEstimatedTokens} tokens) out of ${params.totalWorkspaceFiles} workspace files are sent to ${params.providerId} (${params.modelId}) at ${params.endpointUrl}. Your full repository is never uploaded, and secret patterns are automatically redacted.`,
  };
}

import type {
  ExcludedFileEntry,
  RepoFile,
  SupportedLanguage,
  ValidationIssue,
  ValidationReport,
} from '../types/repopilot';

export interface RawArchiveEntry {
  path: string;
  content: string;
  uncompressedBytes: number;
  compressedBytes?: number;
  isDirectory?: boolean;
}

export interface ValidatorOptions {
  maxFileBytes?: number;
  maxArchiveBytes?: number;
  maxFileCount?: number;
  maxCompressionRatio?: number;
  excludeSecretsAndBinariesByDefault?: boolean;
}

const DEFAULT_MAX_FILE_BYTES = 256 * 1024; // 256 KB per source file
const DEFAULT_MAX_ARCHIVE_BYTES = 4 * 1024 * 1024; // 4 MB total uncompressed
const DEFAULT_MAX_FILE_COUNT = 120;
const DEFAULT_MAX_COMPRESSION_RATIO = 50;

const EXCLUDED_DIRECTORY_SEGMENTS = new Set([
  '.git',
  'node_modules',
  'venv',
  '.venv',
  'env',
  '.env_dir',
  'virtualenv',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.tox',
  '.nox',
  'dist',
  'build',
  'target',
  'out',
  '.next',
  '.nuxt',
  '.eggs',
  'htmlcov',
  'site-packages',
  'dist-packages',
  '__pypackages__',
  'pypackages',
  'wheels',
  'pip-wheel-metadata',
  'bower_components',
  'jspm_packages',
  'third_party',
  '.poetry',
  '.pdm-build',
  '__MACOSX',
  'vendor',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.py',
  '.pyi',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.java',
  '.c',
  '.h',
  '.cpp',
  '.cc',
  '.cxx',
  '.hpp',
  '.hh',
  '.cs',
  '.go',
  '.rs',
  '.php',
  '.rb',
  '.swift',
  '.kt',
  '.kts',
  '.sql',
  '.html',
  '.htm',
  '.css',
  '.scss',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.cfg',
  '.ini',
  '.conf',
  '.properties',
  '.xml',
  '.gradle',
  '.md',
  '.rst',
  '.txt',
  '.sh',
  '.bash',
  '.zsh',
  '.gitignore',
  '.editorconfig',
  '.lock',
  '.mod',
  '.sum',
]);

const ALLOWED_EXACT_FILENAMES = new Set([
  'README',
  'LICENSE',
  'Makefile',
  'Dockerfile',
  'Gemfile',
  'Rakefile',
  'Cargo.toml',
  'Cargo.lock',
  'go.mod',
  'go.sum',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'package.json',
  'tsconfig.json',
  'requirements.txt',
  'requirements-dev.txt',
  'pyproject.toml',
  'setup.py',
  'setup.cfg',
  'pytest.ini',
  'tox.ini',
  '.gitignore',
  '.editorconfig',
]);

const BLOCKED_SENSITIVE_FILENAMES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.env.test',
  'id_rsa',
  'id_ed25519',
  'credentials.json',
  'service-account.json',
  '.npmrc',
  '.pypirc',
]);

const BLOCKED_EXTENSIONS = new Set([
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.bat',
  '.cmd',
  '.ps1',
  '.pyc',
  '.pyo',
  '.pyd',
  '.whl',
  '.egg',
  '.tar',
  '.gz',
  '.zip',
  '.7z',
  '.pkl',
  '.pickle',
  '.pem',
  '.key',
  '.pfx',
  '.p12',
  '.db',
  '.sqlite',
  '.sqlite3',
  '.class',
  '.jar',
  '.war',
  '.o',
  '.a',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.pdf',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
]);

interface SecretPattern {
  name: string;
  regex: RegExp;
}

const SECRET_PATTERNS: SecretPattern[] = [
  { name: 'OpenAI / Compatible API Key', regex: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Google Cloud / Gemini API Key', regex: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'NVIDIA NIM API Key', regex: /\bnvapi-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'AWS Access Key ID', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub Personal Access Token', regex: /\bgh[pousr]_[A-Za-z0-9_]{25,}\b/ },
  { name: 'Slack Token', regex: /\bxox[baprs]-[0-9A-Za-z-]{15,}\b/ },
  {
    name: 'Private Cryptographic Key Block',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  },
  {
    name: 'Hardcoded Secret Assignment',
    regex:
      /\b(?:API_KEY|SECRET_KEY|PRIVATE_KEY|ACCESS_TOKEN|AUTH_TOKEN|PASSWORD|NEBIUS_API_KEY|NVIDIA_API_KEY|GEMINI_API_KEY)\s*=\s*['"][A-Za-z0-9_\-/.+=]{16,}['"]/i,
  },
];

export function isExcludedRepositoryDirectory(rawPath: string): {
  excluded: boolean;
  reason?: string;
} {
  const normalized = rawPath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);

  // Security check: .git/hooks is an active exploit vector, not a passive excluded directory
  if (segments.includes('.git') && segments.includes('hooks')) {
    return { excluded: false };
  }

  for (let idx = 0; idx < segments.length - 1; idx++) {
    const seg = segments[idx];
    if (
      EXCLUDED_DIRECTORY_SEGMENTS.has(seg) ||
      seg.endsWith('.egg-info') ||
      seg.endsWith('.dist-info') ||
      (seg.toLowerCase() === 'lib' &&
        /^python\d+(\.\d+)?$/i.test(segments[idx + 1] || ''))
    ) {
      return {
        excluded: true,
        reason: `Excluded framework/environment directory "${seg}/" (filtered from repository index)`,
      };
    }
  }

  const baseName = segments[segments.length - 1] || '';
  if (baseName === '.DS_Store' || baseName === '.coverage') {
    return {
      excluded: true,
      reason: `Excluded OS/coverage artifact "${baseName}"`,
    };
  }

  return { excluded: false };
}

export function validateFilePath(rawPath: string): ValidationIssue | null {
  if (!rawPath || rawPath.trim() === '') {
    return {
      severity: 'error',
      code: 'PATH_TRAVERSAL',
      filePath: rawPath,
      message: 'Empty or blank file path in archive.',
    };
  }

  if (rawPath.includes('\0')) {
    return {
      severity: 'error',
      code: 'PATH_TRAVERSAL',
      filePath: rawPath,
      message: 'Null byte injection detected in file path.',
    };
  }

  if (
    rawPath.startsWith('/') ||
    rawPath.startsWith('\\') ||
    /^[A-Za-z]:[\\/]/.test(rawPath)
  ) {
    return {
      severity: 'error',
      code: 'ABSOLUTE_PATH',
      filePath: rawPath,
      message: `Absolute file path "${rawPath}" is prohibited for sandbox containment.`,
    };
  }

  const normalizedSlashes = rawPath.replace(/\\/g, '/');
  const segments = normalizedSlashes.split('/');

  if (
    segments.some((seg) => seg === '..') ||
    normalizedSlashes.includes('../') ||
    normalizedSlashes.includes('..\\')
  ) {
    return {
      severity: 'error',
      code: 'PATH_TRAVERSAL',
      filePath: rawPath,
      message: `Path traversal sequence ("..") detected in "${rawPath}". Archive rejected.`,
    };
  }

  if (segments.includes('.git') && segments.includes('hooks')) {
    return {
      severity: 'error',
      code: 'PATH_TRAVERSAL',
      filePath: rawPath,
      message: `Executable Git hook path "${rawPath}" is prohibited.`,
    };
  }

  return null;
}

export function getFileExtension(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const baseName = normalized.split('/').pop() || '';
  const lastDot = baseName.lastIndexOf('.');
  if (lastDot <= 0) {
    return baseName.startsWith('.') ? baseName.toLowerCase() : '';
  }
  return baseName.slice(lastDot).toLowerCase();
}

export function getBaseFileName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.split('/').pop() || '';
}

export function isLikelyBinaryContent(content: string): boolean {
  if (!content) return false;
  const sample = content.slice(0, 1024);
  if (sample.includes('\0')) return true;
  if (sample.startsWith('MZ')) return true;
  return false;
}

export function validateFileType(
  filePath: string,
  content?: string
): ValidationIssue | null {
  const baseName = getBaseFileName(filePath);
  const lowerBase = baseName.toLowerCase();
  const ext = getFileExtension(filePath);

  if (
    BLOCKED_SENSITIVE_FILENAMES.has(lowerBase) ||
    lowerBase.startsWith('.env.')
  ) {
    return {
      severity: 'error',
      code: 'SECRET_DETECTED',
      filePath,
      message: `Sensitive environment/credential file "${baseName}" is not permitted in uploads.`,
    };
  }

  if (BLOCKED_EXTENSIONS.has(ext)) {
    return {
      severity: 'error',
      code: 'UNSUPPORTED_FILE_TYPE',
      filePath,
      message: `Blocked binary, executable, or archive extension "${ext}" in "${filePath}".`,
    };
  }

  if (content && isLikelyBinaryContent(content)) {
    return {
      severity: 'error',
      code: 'UNSUPPORTED_FILE_TYPE',
      filePath,
      message: `Binary file payload detected in "${filePath}".`,
    };
  }

  if (ALLOWED_EXACT_FILENAMES.has(baseName) || ALLOWED_EXTENSIONS.has(ext)) {
    return null;
  }

  // Gracefully allow unknown text extensions if content is provided and non-binary
  if (content !== undefined && !isLikelyBinaryContent(content)) {
    return null;
  }

  return {
    severity: 'error',
    code: 'UNSUPPORTED_FILE_TYPE',
    filePath,
    message: `Unsupported file type "${baseName}".`,
  };
}

export function scanContentForSecrets(
  filePath: string,
  content: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const pattern of SECRET_PATTERNS) {
    const match = content.match(pattern.regex);
    if (match) {
      const sample = match[0];
      const masked =
        sample.length > 10
          ? `${sample.slice(0, 6)}...[REDACTED]...${sample.slice(-3)}`
          : '[REDACTED]';
      issues.push({
        severity: 'error',
        code: 'SECRET_DETECTED',
        filePath,
        message: `Potential ${pattern.name} detected in "${filePath}".`,
        detail: `Matched pattern: ${masked}`,
      });
    }
  }

  return issues;
}

/**
 * Detects language using file extension and content heuristics (e.g. shebangs).
 * Gracefully falls back to 'text' for unknown extensions.
 */
export function inferLanguage(
  filePath: string,
  content?: string
): SupportedLanguage {
  const ext = getFileExtension(filePath);
  const baseName = getBaseFileName(filePath);

  if (ext === '.py' || ext === '.pyi') return 'python';
  if (ext === '.ts' || ext === '.tsx') return 'typescript';
  if (ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs')
    return 'javascript';
  if (ext === '.java') return 'java';
  if (ext === '.c' || ext === '.h') return 'c';
  if (
    ext === '.cpp' ||
    ext === '.cc' ||
    ext === '.cxx' ||
    ext === '.hpp' ||
    ext === '.hh'
  )
    return 'cpp';
  if (ext === '.cs') return 'csharp';
  if (ext === '.go') return 'go';
  if (ext === '.rs') return 'rust';
  if (ext === '.php') return 'php';
  if (ext === '.rb' || baseName === 'Gemfile' || baseName === 'Rakefile')
    return 'ruby';
  if (ext === '.swift') return 'swift';
  if (ext === '.kt' || ext === '.kts') return 'kotlin';
  if (ext === '.sql') return 'sql';
  if (ext === '.html' || ext === '.htm') return 'html';
  if (ext === '.css' || ext === '.scss') return 'css';
  if (ext === '.json') return 'json';
  if (ext === '.yaml' || ext === '.yml') return 'yaml';
  if (ext === '.toml') return 'toml';
  if (ext === '.md' || ext === '.rst') return 'markdown';
  if (
    ext === '.sh' ||
    ext === '.bash' ||
    ext === '.zsh' ||
    baseName === 'Makefile' ||
    baseName === 'Dockerfile'
  )
    return 'shell';
  if (
    ext === '.cfg' ||
    ext === '.ini' ||
    ext === '.conf' ||
    ext === '.properties' ||
    ext === '.xml' ||
    ext === '.gradle' ||
    baseName === '.gitignore' ||
    baseName === '.editorconfig' ||
    baseName === 'go.mod'
  )
    return 'config';

  if (content) {
    const firstLine = content.split('\n')[0]?.trim() || '';
    if (firstLine.startsWith('#!')) {
      if (firstLine.includes('python')) return 'python';
      if (firstLine.includes('node') || firstLine.includes('deno'))
        return 'javascript';
      if (firstLine.includes('bash') || firstLine.includes('sh'))
        return 'shell';
      if (firstLine.includes('ruby')) return 'ruby';
    }
  }

  return 'text';
}

export function isSourceTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  const base = getBaseFileName(normalized);
  return (
    base.startsWith('test_') ||
    base.endsWith('_test.py') ||
    base.endsWith('_test.go') ||
    base.endsWith('_test.rs') ||
    base.endsWith('test.java') ||
    base.endsWith('tests.cs') ||
    base.includes('.test.') ||
    base.includes('.spec.') ||
    normalized.includes('/tests/') ||
    normalized.startsWith('tests/') ||
    normalized.includes('/__tests__/') ||
    normalized.startsWith('__tests__/')
  );
}

export const isPythonTestFile = isSourceTestFile;

/**
 * Strips a common single top-level folder prefix from ZIP paths if all files share one
 * (e.g. "my-repo-main/src/app.py" -> "src/app.py"), AFTER validating raw paths for traversal.
 */
export function normalizeArchiveRoot(paths: string[]): Map<string, string> {
  const cleaned = paths.map((p) => p.replace(/\\/g, '/').replace(/^\.\//, ''));
  const firstSegments = new Set<string>();
  let allHaveSubpath = true;

  for (const p of cleaned) {
    const parts = p.split('/').filter(Boolean);
    if (parts.length < 2) {
      allHaveSubpath = false;
      break;
    }
    firstSegments.add(parts[0]);
  }

  const mapping = new Map<string, string>();
  if (allHaveSubpath && firstSegments.size === 1 && cleaned.length > 0) {
    for (let i = 0; i < paths.length; i++) {
      const parts = cleaned[i].split('/').filter(Boolean);
      mapping.set(paths[i], parts.slice(1).join('/'));
    }
  } else {
    for (let i = 0; i < paths.length; i++) {
      mapping.set(paths[i], cleaned[i]);
    }
  }
  return mapping;
}

export function validateRepositoryEntries(
  archiveName: string,
  entries: RawArchiveEntry[],
  options: ValidatorOptions = {}
): { report: ValidationReport; acceptedFiles: RepoFile[] } {
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxArchiveBytes = options.maxArchiveBytes ?? DEFAULT_MAX_ARCHIVE_BYTES;
  const maxFileCount = options.maxFileCount ?? DEFAULT_MAX_FILE_COUNT;
  const maxCompressionRatio =
    options.maxCompressionRatio ?? DEFAULT_MAX_COMPRESSION_RATIO;
  const excludeByDefault = Boolean(options.excludeSecretsAndBinariesByDefault);

  const issues: ValidationIssue[] = [];
  const excludedFiles: ExcludedFileEntry[] = [];
  let pathTraversalPassed = true;
  let sizeLimitsPassed = true;
  let secretScanPassed = true;
  let fileTypesPassed = true;

  const fileEntries = entries.filter(
    (e) => !e.isDirectory && !e.path.endsWith('/')
  );

  if (fileEntries.length === 0) {
    issues.push({
      severity: 'error',
      code: 'EMPTY_REPOSITORY',
      message: 'The archive contains no inspectable files.',
    });
  }

  // Step 1: Validate every raw path first before any root normalization
  for (const entry of fileEntries) {
    const pathIssue = validateFilePath(entry.path);
    if (pathIssue) {
      pathTraversalPassed = false;
      issues.push(pathIssue);
    }
  }

  const normalizedMap = normalizeArchiveRoot(fileEntries.map((e) => e.path));
  const acceptedFiles: RepoFile[] = [];
  let totalSizeBytes = 0;
  let activeInspectableCount = 0;

  for (const entry of fileEntries) {
    const normalizedPath = normalizedMap.get(entry.path) || entry.path;

    // Exclude .git, node_modules, venv, __pycache__, dist, build, etc.
    const exclusionCheck = isExcludedRepositoryDirectory(normalizedPath);
    if (exclusionCheck.excluded) {
      excludedFiles.push({
        path: normalizedPath,
        reason: 'excluded_directory',
        detail: exclusionCheck.reason || 'Excluded build/environment folder',
      });
      continue;
    }

    // Compression ratio check (zip bomb guard) — always fatal
    if (
      entry.compressedBytes &&
      entry.compressedBytes > 0 &&
      entry.uncompressedBytes > 32 * 1024 &&
      entry.uncompressedBytes / entry.compressedBytes > maxCompressionRatio
    ) {
      sizeLimitsPassed = false;
      issues.push({
        severity: 'error',
        code: 'SUSPICIOUS_COMPRESSION_RATIO',
        filePath: normalizedPath,
        message: `Suspicious compression ratio (${Math.round(
          entry.uncompressedBytes / entry.compressedBytes
        )}:1) in "${normalizedPath}" (potential zip bomb).`,
      });
    }

    if (entry.uncompressedBytes > maxFileBytes) {
      sizeLimitsPassed = false;
      excludedFiles.push({
        path: normalizedPath,
        reason: 'oversized_file',
        detail: `${(entry.uncompressedBytes / 1024).toFixed(1)} KB exceeds ${(
          maxFileBytes / 1024
        ).toFixed(0)} KB limit`,
      });
      issues.push({
        severity: excludeByDefault ? 'warning' : 'error',
        code: 'OVERSIZED_FILE',
        filePath: normalizedPath,
        message: `File "${normalizedPath}" is ${(
          entry.uncompressedBytes / 1024
        ).toFixed(1)} KB, exceeding the ${(maxFileBytes / 1024).toFixed(
          0
        )} KB per-file limit.`,
      });
    }

    const typeIssue = validateFileType(normalizedPath, entry.content);
    if (typeIssue) {
      if (typeIssue.code === 'SECRET_DETECTED') {
        secretScanPassed = false;
        excludedFiles.push({
          path: normalizedPath,
          reason: 'secret_detected',
          detail: typeIssue.message,
        });
      } else {
        fileTypesPassed = false;
        excludedFiles.push({
          path: normalizedPath,
          reason: 'binary_or_unsupported',
          detail: typeIssue.message,
        });
      }
      issues.push({
        ...typeIssue,
        severity: excludeByDefault ? 'warning' : typeIssue.severity,
      });
    }

    const secretIssues = scanContentForSecrets(normalizedPath, entry.content);
    if (secretIssues.length > 0) {
      secretScanPassed = false;
      excludedFiles.push({
        path: normalizedPath,
        reason: 'secret_detected',
        detail: secretIssues[0].message,
      });
      issues.push(
        ...secretIssues.map((si) => ({
          ...si,
          severity: (excludeByDefault ? 'warning' : si.severity) as
            | 'error'
            | 'warning',
        }))
      );
    }

    if (
      !typeIssue &&
      secretIssues.length === 0 &&
      entry.uncompressedBytes <= maxFileBytes
    ) {
      activeInspectableCount++;
      totalSizeBytes += entry.uncompressedBytes;
      acceptedFiles.push({
        path: normalizedPath,
        content: entry.content,
        sizeBytes: entry.uncompressedBytes,
        language: inferLanguage(normalizedPath, entry.content),
        isTestFile: isSourceTestFile(normalizedPath),
      });
    } else if (!excludeByDefault) {
      activeInspectableCount++;
      totalSizeBytes += entry.uncompressedBytes;
    }
  }

  if (activeInspectableCount > maxFileCount) {
    sizeLimitsPassed = false;
    issues.push({
      severity: 'error',
      code: 'TOO_MANY_FILES',
      message: `Archive contains ${activeInspectableCount} active files, exceeding the ${maxFileCount}-file safety limit.`,
    });
  }

  if (totalSizeBytes > maxArchiveBytes) {
    sizeLimitsPassed = false;
    issues.push({
      severity: 'error',
      code: 'OVERSIZED_ARCHIVE',
      message: `Total uncompressed archive size (${(
        totalSizeBytes / 1024
      ).toFixed(1)} KB) exceeds the ${(maxArchiveBytes / 1024).toFixed(
        0
      )} KB limit.`,
    });
  }

  if (
    fileEntries.length > 0 &&
    acceptedFiles.length === 0 &&
    issues.every((i) => i.severity !== 'error')
  ) {
    fileTypesPassed = false;
    issues.push({
      severity: 'error',
      code: 'EMPTY_REPOSITORY',
      message:
        'No valid source or configuration files remained after excluding sensitive, binary, or oversized files.',
    });
  }

  const valid =
    pathTraversalPassed &&
    issues.every((i) => i.severity !== 'error') &&
    acceptedFiles.length > 0;

  const sortedAccepted = valid
    ? acceptedFiles.sort((a, b) => a.path.localeCompare(b.path))
    : [];

  const isSingleFileUpload = sortedAccepted.length === 1;
  const hasUnresolvedRootRelative =
    sortedAccepted.length > 0 &&
    sortedAccepted.some(
      (f) =>
        f.language === 'python' &&
        !f.path.includes('/') &&
        /(?:^|\n)\s*from\s+\.[A-Za-z0-9_.]*\s+import\s+/m.test(f.content)
    );
  const isIncompleteContext = isSingleFileUpload || hasUnresolvedRootRelative;
  const contextCompletenessNote = isSingleFileUpload
    ? `Incomplete project context: Only a single file (${sortedAccepted[0].path}) was uploaded. Package-relative imports and external local module references cannot be verified without the surrounding repository files and will not be reported as definite bugs.`
    : hasUnresolvedRootRelative
    ? `Partial project context: Uploaded file(s) contain package-relative imports whose parent package or sibling modules were not uploaded. Unresolved relative imports are treated as context checks rather than bugs.`
    : undefined;

  return {
    report: {
      valid,
      archiveName,
      inspectedAt: new Date().toISOString(),
      totalFilesInspected: fileEntries.length,
      acceptedFilesCount: valid ? sortedAccepted.length : 0,
      totalSizeBytes,
      maxAllowedFileBytes: maxFileBytes,
      maxAllowedArchiveBytes: maxArchiveBytes,
      issues,
      excludedFiles,
      isIncompleteContext,
      contextCompletenessNote,
      checksSummary: {
        pathTraversalPassed,
        sizeLimitsPassed,
        secretScanPassed,
        fileTypesPassed,
      },
    },
    acceptedFiles: sortedAccepted,
  };
}

/**
 * Scrubs any known secret values or API key patterns from logs, errors, and downloadable patches.
 */
export function redactSecrets(
  text: string,
  explicitSecrets: (string | undefined)[] = []
): string {
  if (!text) return text;
  let sanitized = text;

  for (const secret of explicitSecrets) {
    if (secret && secret.trim().length >= 8 && secret !== 'MY_GEMINI_API_KEY') {
      sanitized = sanitized
        .split(secret.trim())
        .join('[REDACTED_SERVER_SECRET]');
    }
  }

  sanitized = sanitized
    .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, 'sk-[REDACTED]')
    .replace(/\bAIza[0-9A-Za-z_-]{35}\b/g, 'AIza[REDACTED]')
    .replace(/\bnvapi-[A-Za-z0-9_-]{20,}\b/g, 'nvapi-[REDACTED]')
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, 'AKIA[REDACTED]')
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{25,}\b/g, 'gh_[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9_\-.=]{16,}/gi, 'Bearer [REDACTED]');

  return sanitized;
}

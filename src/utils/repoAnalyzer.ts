import type {
  CallerEdge,
  ClassifiedImportEntry,
  CodeSelectionContext,
  ContextExcludedItem,
  ContextFileSelection,
  ContextSelectionReport,
  FileSymbolMetadata,
  LanguageToolchainProfile,
  NormalizedProjectManifest,
  PythonImportCategory,
  RepoFile,
  RepositoryFindings,
} from '../types/repopilot';
import { isExcludedRepositoryDirectory } from './securityValidator';

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export const PYTHON_STDLIB_MODULES = new Set<string>([
  '__future__',
  '_thread',
  'abc',
  'aifc',
  'argparse',
  'array',
  'ast',
  'asynchat',
  'asyncio',
  'asyncore',
  'atexit',
  'audioop',
  'base64',
  'bdb',
  'binascii',
  'binhex',
  'bisect',
  'builtins',
  'bz2',
  'calendar',
  'cgi',
  'cgitb',
  'chunk',
  'cmath',
  'cmd',
  'code',
  'codecs',
  'codeop',
  'collections',
  'colorsys',
  'compileall',
  'concurrent',
  'configparser',
  'contextlib',
  'contextvars',
  'copy',
  'copyreg',
  'cProfile',
  'crypt',
  'csv',
  'ctypes',
  'curses',
  'dataclasses',
  'datetime',
  'dbm',
  'decimal',
  'difflib',
  'dis',
  'distutils',
  'doctest',
  'email',
  'encodings',
  'enes',
  'enum',
  'errno',
  'faulthandler',
  'fcntl',
  'filecmp',
  'fileinput',
  'fnmatch',
  'fractions',
  'ftplib',
  'functools',
  'gc',
  'getopt',
  'getpass',
  'gettext',
  'glob',
  'graphlib',
  'grp',
  'gzip',
  'hashlib',
  'heapq',
  'hmac',
  'html',
  'http',
  'imaplib',
  'imghdr',
  'imp',
  'importlib',
  'inspect',
  'io',
  'ipaddress',
  'itertools',
  'json',
  'keyword',
  'lib2to3',
  'linecache',
  'locale',
  'logging',
  'lzma',
  'mailbox',
  'mailcap',
  'marshal',
  'math',
  'mimetypes',
  'mmap',
  'modulefinder',
  'multiprocessing',
  'netrc',
  'nis',
  'nntplib',
  'numbers',
  'operator',
  'optparse',
  'os',
  'ossaudiodev',
  'pathlib',
  'pdb',
  'pickle',
  'pickletools',
  'pipes',
  'pkgutil',
  'platform',
  'plistlib',
  'poplib',
  'posix',
  'posixpath',
  'pprint',
  'profile',
  'pstats',
  'pty',
  'pwd',
  'py_compile',
  'pyclbr',
  'pydoc',
  'queue',
  'quopri',
  'random',
  're',
  'readline',
  'reprlib',
  'resource',
  'rlcompleter',
  'runpy',
  'sched',
  'secrets',
  'select',
  'selectors',
  'shelve',
  'shlex',
  'shutil',
  'signal',
  'site',
  'smtpd',
  'smtplib',
  'sndhdr',
  'socket',
  'socketserver',
  'spwd',
  'sqlite3',
  'ssl',
  'stat',
  'statistics',
  'string',
  'stringprep',
  'struct',
  'subprocess',
  'sunau',
  'symtable',
  'sys',
  'sysconfig',
  'syslog',
  'tabnanny',
  'tarfile',
  'telnetlib',
  'tempfile',
  'termios',
  'test',
  'textwrap',
  'threading',
  'time',
  'timeit',
  'tkinter',
  'token',
  'tokenize',
  'tomllib',
  'trace',
  'traceback',
  'tracemalloc',
  'tty',
  'turtle',
  'turtledemo',
  'types',
  'typing',
  'typing_extensions',
  'unicodedata',
  'unittest',
  'urllib',
  'uu',
  'uuid',
  'venv',
  'warnings',
  'wave',
  'weakref',
  'webbrowser',
  'winreg',
  'winsound',
  'wsgiref',
  'xdrlib',
  'xml',
  'xmlrpc',
  'zipapp',
  'zipfile',
  'zipimport',
  'zlib',
  'zoneinfo',
]);

const IGNORED_CALL_KEYWORDS = new Set([
  'def',
  'class',
  'function',
  'if',
  'elif',
  'else',
  'while',
  'for',
  'switch',
  'case',
  'catch',
  'return',
  'print',
  'console',
  'log',
  'len',
  'sum',
  'min',
  'max',
  'round',
  'list',
  'dict',
  'set',
  'float',
  'int',
  'str',
  'bool',
  'range',
  'isinstance',
  'issubclass',
  'getattr',
  'setattr',
  'hasattr',
  'super',
  'require',
  'import',
  'export',
  'typeof',
  'Array',
  'Object',
  'String',
  'Number',
  'Boolean',
  'Promise',
  'Error',
  'Map',
  'Set',
]);

/**
 * Strips Python comments (#...) and string literals (including triple-quoted docstrings)
 * while preserving newlines so line numbers and active code tokens remain accurate.
 */
export function stripPythonCommentsAndStrings(content: string): string {
  const normalized = content.replace(/\r\n/g, '\n');
  let result = '';
  let i = 0;
  const len = normalized.length;

  while (i < len) {
    const ch = normalized[i];
    const next3 = normalized.slice(i, i + 3);

    // Triple-quoted strings (""" or ''')
    if (next3 === '"""' || next3 === "'''") {
      const quote = next3;
      result += '""';
      i += 3;
      while (i < len) {
        if (normalized[i] === '\\') {
          if (normalized[i + 1] === '\n') result += '\n';
          i += 2;
          continue;
        }
        if (normalized.slice(i, i + 3) === quote) {
          i += 3;
          break;
        }
        if (normalized[i] === '\n') {
          result += '\n';
        }
        i++;
      }
      continue;
    }

    // Single-line string literal (" or ')
    if (ch === '"' || ch === "'") {
      const quote = ch;
      result += '""';
      i++;
      while (i < len && normalized[i] !== '\n') {
        if (normalized[i] === '\\') {
          i += 2;
          continue;
        }
        if (normalized[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Line comment (# ...)
    if (ch === '#') {
      while (i < len && normalized[i] !== '\n') {
        i++;
      }
      continue;
    }

    result += ch;
    i++;
  }

  return result;
}

/**
 * Joins multi-line parenthesized statements (e.g. `from pathlib import (\n Path,\n)`)
 * and backslash-continued lines into single logical statements for accurate Python import parsing.
 */
export function extractLogicalPythonStatements(
  codeWithoutStringsAndComments: string
): string[] {
  const rawLines = codeWithoutStringsAndComments.split('\n');
  const statements: string[] = [];
  let buffer = '';
  let parenDepth = 0;

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    let lineClean = trimmed;
    const hasBackslashCont = lineClean.endsWith('\\');
    if (hasBackslashCont) {
      lineClean = lineClean.slice(0, -1).trim();
    }

    for (const ch of lineClean) {
      if (ch === '(') parenDepth++;
      else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
    }

    buffer = buffer ? `${buffer} ${lineClean}` : lineClean;

    if (parenDepth === 0 && !hasBackslashCont) {
      statements.push(buffer.trim());
      buffer = '';
    }
  }

  if (buffer.trim()) {
    statements.push(buffer.trim());
  }

  return statements;
}

/**
 * Extracts functions, classes/types, variables/properties, imported modules/symbols, and called symbols
 * across Python, TypeScript/JavaScript, Go, Rust, Java, C#, C/C++, Ruby, and PHP.
 * Deduplicates all extracted lists so repeated imports never cause duplicate validation messages.
 */
export function extractFileSymbolMetadata(file: RepoFile): FileSymbolMetadata {
  const lines = file.content.replace(/\r\n/g, '\n').split('\n');
  const definedFunctionsSet = new Set<string>();
  const definedClassesSet = new Set<string>();
  const definedVariablesSet = new Set<string>();
  const importedModulesSet = new Set<string>();
  const importedSymbolsSet = new Set<string>();
  const calledSymbolsSet = new Set<string>();

  if (file.language === 'python') {
    const strippedCode = stripPythonCommentsAndStrings(file.content);
    const logicalStatements = extractLogicalPythonStatements(strippedCode);

    for (const stmt of logicalStatements) {
      const fnMatch = stmt.match(
        /^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/
      );
      if (fnMatch) {
        definedFunctionsSet.add(fnMatch[1]);
        definedVariablesSet.add(fnMatch[1]);
        const params = fnMatch[2]
          .split(',')
          .map((p) =>
            p
              .trim()
              .replace(/^\*+/, '')
              .split(/[:=]/)[0]
              .trim()
          )
          .filter((p) => p && p !== 'self' && p !== 'cls');
        for (const p of params) {
          if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(p)) {
            definedVariablesSet.add(p);
          }
        }
      } else {
        const simpleFnMatch = stmt.match(
          /^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/
        );
        if (simpleFnMatch) {
          definedFunctionsSet.add(simpleFnMatch[1]);
          definedVariablesSet.add(simpleFnMatch[1]);
        }
      }

      const clsMatch = stmt.match(/^class\s+([A-Za-z_][A-Za-z0-9_]*)\s*[:(]/);
      if (clsMatch) {
        definedClassesSet.add(clsMatch[1]);
        definedVariablesSet.add(clsMatch[1]);
      }

      const assignMatch = stmt.match(
        /^([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*[^=]+)?=\s*.+$/
      );
      if (assignMatch) {
        definedVariablesSet.add(assignMatch[1]);
      }

      const fromImportMatch = stmt.match(
        /^from\s+(\.+[A-Za-z0-9_.]*|[A-Za-z_][A-Za-z0-9_.]*)\s+import\s+(.+)$/
      );
      if (fromImportMatch) {
        const moduleSpec = fromImportMatch[1].trim();
        const targetsRaw = fromImportMatch[2]
          .replace(/[()]/g, '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

        // If `from . import ctx, json as _json`, each target is both a relative submodule and an imported symbol
        if (/^\.+$/.test(moduleSpec)) {
          for (const item of targetsRaw) {
            const parts = item.split(/\s+as\s+/).map((x) => x.trim());
            const origName = parts[0];
            const aliasName = parts[1];
            if (origName && origName !== '*') {
              importedModulesSet.add(`${moduleSpec}${origName}`);
              importedSymbolsSet.add(origName);
            }
            if (aliasName) {
              importedSymbolsSet.add(aliasName);
            }
          }
        } else {
          importedModulesSet.add(moduleSpec);
          for (const item of targetsRaw) {
            const parts = item.split(/\s+as\s+/).map((x) => x.trim());
            const origName = parts[0];
            const aliasName = parts[1];
            if (origName && origName !== '*') {
              importedSymbolsSet.add(origName);
            }
            if (aliasName) {
              importedSymbolsSet.add(aliasName);
            }
          }
        }
      } else {
        const directImportMatch = stmt.match(
          /^import\s+([A-Za-z0-9_.,\s]+)$/
        );
        if (directImportMatch) {
          const items = directImportMatch[1]
            .split(',')
            .map((m) => m.trim())
            .filter(Boolean);
          for (const item of items) {
            const parts = item.split(/\s+as\s+/).map((x) => x.trim());
            const modName = parts[0];
            const aliasName = parts[1];
            if (modName) {
              importedModulesSet.add(modName);
              importedSymbolsSet.add(modName.split('.')[0]);
            }
            if (aliasName) {
              importedSymbolsSet.add(aliasName);
            }
          }
        }
      }

      const callMatches = stmt.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g);
      for (const m of callMatches) {
        const sym = m[1];
        if (!IGNORED_CALL_KEYWORDS.has(sym)) {
          calledSymbolsSet.add(sym);
        }
      }
    }

    return {
      path: file.path,
      definedFunctions: Array.from(definedFunctionsSet),
      definedClasses: Array.from(definedClassesSet),
      definedVariables: Array.from(definedVariablesSet),
      importedModules: Array.from(importedModulesSet),
      importedSymbols: Array.from(importedSymbolsSet),
      calledSymbols: Array.from(calledSymbolsSet),
      lineCount: lines.length,
    };
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (
      !line ||
      line.startsWith('#') ||
      line.startsWith('//') ||
      line.startsWith('/*') ||
      line.startsWith('*')
    ) {
      continue;
    }

    if (
      file.language === 'typescript' ||
      file.language === 'javascript'
    ) {
      const fnDecl = line.match(
        /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*[(<]/
      );
      if (fnDecl) definedFunctionsSet.add(fnDecl[1]);

      const arrowFn = line.match(
        /^(?:export\s+)?(?:const|let)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)\s*=>/
      );
      if (arrowFn) definedFunctionsSet.add(arrowFn[1]);

      const clsOrIface = line.match(
        /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(?:class|interface|type)\s+([A-Za-z_$][A-Za-z0-9_$]*)/
      );
      if (clsOrIface) definedClassesSet.add(clsOrIface[1]);

      const esImport = line.match(
        /^import\s+(?:type\s+)?(.+?)\s+from\s+['"]([^'"]+)['"]/
      );
      if (esImport) {
        importedModulesSet.add(esImport[2]);
        const specifiers = esImport[1]
          .replace(/[{}]/g, '')
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s && !s.startsWith('*'));
        for (const spec of specifiers) {
          const parts = spec.split(/\s+as\s+/).map((x) => x.trim());
          if (parts[0]) importedSymbolsSet.add(parts[0]);
          if (parts[1]) importedSymbolsSet.add(parts[1]);
        }
      }
    } else if (file.language === 'go') {
      const goFn = line.match(
        /^func\s+(?:\([^)]+\)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/
      );
      if (goFn) definedFunctionsSet.add(goFn[1]);
      const goType = line.match(
        /^type\s+([A-Za-z_][A-Za-z0-9_]*)\s+(?:struct|interface)/
      );
      if (goType) definedClassesSet.add(goType[1]);
    } else if (file.language === 'rust') {
      const rsFn = line.match(
        /^(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*[(<]/
      );
      if (rsFn) definedFunctionsSet.add(rsFn[1]);
      const rsType = line.match(
        /^(?:pub\s+)?(?:struct|enum|trait)\s+([A-Za-z_][A-Za-z0-9_]*)/
      );
      if (rsType) definedClassesSet.add(rsType[1]);
    } else if (
      file.language === 'java' ||
      file.language === 'csharp' ||
      file.language === 'kotlin'
    ) {
      const clsMatch = line.match(
        /(?:public|private|protected|internal)?\s*(?:static\s+|final\s+|abstract\s+)*(?:class|interface|record)\s+([A-Za-z_][A-Za-z0-9_]*)/
      );
      if (clsMatch) definedClassesSet.add(clsMatch[1]);
    }

    const callMatches = line.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g);
    for (const m of callMatches) {
      const sym = m[1];
      if (!IGNORED_CALL_KEYWORDS.has(sym)) {
        calledSymbolsSet.add(sym);
      }
    }
  }

  return {
    path: file.path,
    definedFunctions: Array.from(definedFunctionsSet),
    definedClasses: Array.from(definedClassesSet),
    definedVariables: Array.from(definedVariablesSet),
    importedModules: Array.from(importedModulesSet),
    importedSymbols: Array.from(importedSymbolsSet),
    calledSymbols: Array.from(calledSymbolsSet),
    lineCount: lines.length,
  };
}

export const extractPythonSymbolMetadata = extractFileSymbolMetadata;

export function parseRepositoryDependencies(files: readonly RepoFile[]): string[] {
  const deps = new Set<string>();

  for (const file of files) {
    if (file.path.endsWith('requirements.txt')) {
      const lines = file.content.split('\n');
      for (const l of lines) {
        const cleaned = l.split('#')[0].trim();
        if (cleaned) deps.add(cleaned);
      }
    } else if (file.path.endsWith('pyproject.toml')) {
      deps.add('pytest');
      const depSectionMatch = file.content.match(
        /dependencies\s*=\s*\[([\s\S]*?)\]/
      );
      if (depSectionMatch) {
        const items = depSectionMatch[1].matchAll(/["']([^"']+)["']/g);
        for (const item of items) {
          deps.add(item[1]);
        }
      }
      const reqPy = file.content.match(
        /requires-python\s*=\s*["']([^"']+)["']/
      );
      if (reqPy) {
        deps.add(`python ${reqPy[1]}`);
      }
    } else if (file.path.endsWith('package.json')) {
      try {
        const pkg = JSON.parse(file.content) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        for (const k of Object.keys(pkg.dependencies || {})) {
          deps.add(k);
        }
        for (const k of Object.keys(pkg.devDependencies || {})) {
          deps.add(k);
        }
      } catch {
        // Ignore malformed package.json during dependency scan
      }
    } else if (file.path.endsWith('Cargo.toml')) {
      deps.add('cargo');
    } else if (file.path.endsWith('go.mod')) {
      const goVer = file.content.match(/^go\s+([0-9.]+)/m);
      deps.add(goVer ? `go ${goVer[1]}` : 'go');
    }
  }

  if (deps.size === 0) {
    const hasPy = files.some((f) => f.language === 'python');
    if (hasPy) deps.add('pytest');
  }

  return Array.from(deps);
}

/**
 * Builds a normalized manifest strictly from the uploaded project files (never scanning
 * RepoPilot AI's own host files or Python environment).
 */
export function buildNormalizedProjectManifest(
  files: readonly RepoFile[],
  options: {
    projectName?: string;
    uploadMode?: 'single_file' | 'multi_file' | 'zip_archive';
    excludedPaths?: string[];
  } = {}
): NormalizedProjectManifest {
  const excludedFrameworkOrEnvPaths: string[] = [
    ...(options.excludedPaths || []),
  ];

  // Filter out any unrelated framework/virtualenv/site-packages files if passed directly
  const projectFiles = files.filter((f) => {
    const ex = isExcludedRepositoryDirectory(f.path);
    if (ex.excluded) {
      excludedFrameworkOrEnvPaths.push(f.path);
      return false;
    }
    return true;
  });

  const normalizedFilePaths = projectFiles.map((f) =>
    f.path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '')
  );
  const normPathSet = new Set(normalizedFilePaths);

  const pythonModuleMap: Record<string, string> = {};
  const packageDirsSet = new Set<string>();

  const rawPkgCandidate = (options.projectName || '')
    .replace(/\.zip$/i, '')
    .replace(/-(?:main|master|dev)$/i, '')
    .replace(/-/g, '_')
    .trim();
  const validPkgIdent = /^[A-Za-z_][A-Za-z0-9_]*$/.test(rawPkgCandidate)
    ? rawPkgCandidate
    : null;

  for (const normPath of normalizedFilePaths) {
    const parts = normPath.split('/').filter(Boolean);
    if (parts.length > 1) {
      for (let i = 1; i < parts.length; i++) {
        packageDirsSet.add(parts.slice(0, i).join('/'));
      }
    }

    if (normPath.endsWith('.py') || normPath.endsWith('.pyi')) {
      const withoutExt = normPath.replace(/\.pyi?$/, '');
      const dotted = withoutExt.replace(/\//g, '.');
      pythonModuleMap[dotted] = normPath;

      if (validPkgIdent && !dotted.startsWith(`${validPkgIdent}.`)) {
        pythonModuleMap[`${validPkgIdent}.${dotted}`] = normPath;
      }

      if (withoutExt.endsWith('/__init__')) {
        const pkgDotted = withoutExt
          .slice(0, -'/__init__'.length)
          .replace(/\//g, '.');
        if (pkgDotted) {
          pythonModuleMap[pkgDotted] = normPath;
          if (validPkgIdent && !pkgDotted.startsWith(`${validPkgIdent}.`)) {
            pythonModuleMap[`${validPkgIdent}.${pkgDotted}`] = normPath;
          }
        }
      } else if (withoutExt === '__init__') {
        pythonModuleMap['__init__'] = normPath;
        if (validPkgIdent) {
          pythonModuleMap[validPkgIdent] = normPath;
        }
      }

      // Support src/ layout (e.g., src/billing/models.py -> billing.models)
      if (dotted.startsWith('src.') && dotted.length > 4) {
        pythonModuleMap[dotted.slice(4)] = normPath;
      }
    }
  }

  const uploadMode: NormalizedProjectManifest['uploadMode'] =
    options.uploadMode ||
    (projectFiles.length <= 1 ? 'single_file' : 'zip_archive');

  // Detect whether project context is incomplete (e.g. single file uploaded, or relative imports used in a directory without __init__.py)
  let hasUnresolvedPackageRelativeInRoot = false;
  if (projectFiles.length === 1 && projectFiles[0].language === 'python') {
    hasUnresolvedPackageRelativeInRoot = true;
  } else {
    for (const f of projectFiles) {
      if (f.language !== 'python') continue;
      const normFilePath = f.path
        .replace(/\\/g, '/')
        .replace(/^\.\//, '')
        .replace(/^\/+/, '');
      const dirPrefix = normFilePath.includes('/')
        ? normFilePath.slice(0, normFilePath.lastIndexOf('/'))
        : '';
      const hasPackageInit = dirPrefix
        ? normPathSet.has(`${dirPrefix}/__init__.py`) ||
          normPathSet.has(`${dirPrefix}/__init__.pyi`)
        : normPathSet.has('__init__.py') || normPathSet.has('__init__.pyi');

      const meta = extractFileSymbolMetadata(f);
      for (const mod of meta.importedModules) {
        if (mod.startsWith('.')) {
          const resolved = resolveRelativePythonImportInManifest(
            f.path,
            mod,
            normalizedFilePaths
          );
          if (!resolved && (!normFilePath.includes('/') || !hasPackageInit)) {
            hasUnresolvedPackageRelativeInRoot = true;
          }
        }
      }
    }
  }

  const isIncompleteContext =
    projectFiles.length <= 1 || hasUnresolvedPackageRelativeInRoot;

  const contextCompletenessNote =
    projectFiles.length === 1
      ? `Incomplete project context: Only a single file (${projectFiles[0].path}) was uploaded. Package-relative imports and external project module references cannot be verified without the surrounding repository files and will not be reported as definite bugs.`
      : isIncompleteContext
      ? `Partial project context: One or more files use package-relative imports whose sibling modules or package __init__.py were not included in the upload. Unresolved relative imports are categorized as checks requiring more project context rather than definite bugs.`
      : `Complete uploaded project manifest (${projectFiles.length} files indexed).`;

  return {
    projectName: options.projectName || 'uploaded-project',
    uploadMode,
    isIncompleteContext,
    contextCompletenessNote,
    normalizedFilePaths,
    pythonModuleMap,
    packageDirectories: Array.from(packageDirsSet),
    declaredDependencies: parseRepositoryDependencies(projectFiles),
    excludedFrameworkOrEnvPaths: Array.from(
      new Set(excludedFrameworkOrEnvPaths)
    ),
  };
}

/**
 * Resolves a Python relative import (e.g. `.ctx`, `.sansio.app`, `..models`) against
 * the normalized manifest of uploaded files.
 */
export function resolveRelativePythonImportInManifest(
  importingFilePath: string,
  relativeModuleSpec: string,
  normalizedFilePaths: readonly string[]
): string | null {
  const pathSet = new Set(normalizedFilePaths);
  const normImporter = importingFilePath
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
  const dirParts = normImporter.split('/').slice(0, -1).filter(Boolean);

  const dotsMatch = relativeModuleSpec.match(/^(\.+)(.*)$/);
  if (!dotsMatch) return null;

  const level = dotsMatch[1].length;
  const remainder = dotsMatch[2].trim();
  const upCount = level - 1;

  // If ascending above the uploaded directory root, cannot resolve within manifest
  if (upCount > dirParts.length) {
    return null;
  }

  const baseDirParts = dirParts.slice(0, dirParts.length - upCount);
  const relSegments = remainder ? remainder.split('.').filter(Boolean) : [];
  const targetPrefix = [...baseDirParts, ...relSegments].join('/');

  if (!targetPrefix) {
    const initCandidate = [...baseDirParts, '__init__.py'].join('/');
    return pathSet.has(initCandidate) ? initCandidate : null;
  }

  const candidates = [
    `${targetPrefix}.py`,
    `${targetPrefix}.pyi`,
    `${targetPrefix}/__init__.py`,
    `${targetPrefix}/__init__.pyi`,
  ];

  for (const c of candidates) {
    if (pathSet.has(c)) return c;
  }

  return null;
}

/**
 * Resolves an absolute Python import against the normalized manifest of uploaded files.
 */
export function resolveAbsolutePythonImportInManifest(
  moduleSpec: string,
  manifest: NormalizedProjectManifest
): string | null {
  const clean = moduleSpec.trim();
  if (!clean || clean.startsWith('.')) return null;

  if (manifest.pythonModuleMap[clean]) {
    return manifest.pythonModuleMap[clean];
  }

  const parts = clean.split('.');
  for (let len = parts.length - 1; len >= 1; len--) {
    const prefix = parts.slice(0, len).join('.');
    if (manifest.pythonModuleMap[prefix]) {
      return manifest.pythonModuleMap[prefix];
    }
  }

  return null;
}

/**
 * Classifies all imports in a Python file into:
 * - `package_relative` (e.g. `.ctx`, `.sansio.app`, `..utils`)
 * - `stdlib` (e.g. `pathlib`, `json`, `typing`, `os`, `sys`)
 * - `local_module` (resolves to an uploaded file in the normalized manifest)
 * - `third_party` (external dependency such as `werkzeug`, `jinja2`, `click`, `pytest`, `requests`)
 */
export function classifyPythonImports(
  file: RepoFile,
  allRepoFiles: readonly RepoFile[],
  existingManifest?: NormalizedProjectManifest
): ClassifiedImportEntry[] {
  if (file.language !== 'python') return [];

  const manifest =
    existingManifest || buildNormalizedProjectManifest(allRepoFiles);
  const meta = extractFileSymbolMetadata(file);
  const results: ClassifiedImportEntry[] = [];
  const seenSpecs = new Set<string>();

  for (const rawMod of meta.importedModules) {
    const spec = rawMod.trim();
    if (!spec || seenSpecs.has(spec)) continue;
    seenSpecs.add(spec);

    if (spec.startsWith('.')) {
      const dotsMatch = spec.match(/^(\.+)(.*)$/);
      const relativeLevel = dotsMatch ? dotsMatch[1].length : 1;
      const resolvedPath = resolveRelativePythonImportInManifest(
        file.path,
        spec,
        manifest.normalizedFilePaths
      );

      results.push({
        rawSpecifier: spec,
        moduleName: spec,
        importedNames: [],
        category: 'package_relative',
        relativeLevel,
        resolvedFilePath: resolvedPath,
        resolutionStatus: resolvedPath
          ? 'resolved_local'
          : manifest.isIncompleteContext
          ? 'unresolved_missing_context'
          : 'unresolved_in_manifest',
      });
      continue;
    }

    const rootPkg = spec.split('.')[0];
    if (PYTHON_STDLIB_MODULES.has(rootPkg)) {
      results.push({
        rawSpecifier: spec,
        moduleName: spec,
        importedNames: [],
        category: 'stdlib',
        relativeLevel: 0,
        resolvedFilePath: null,
        resolutionStatus: 'stdlib',
      });
      continue;
    }

    const localResolved = resolveAbsolutePythonImportInManifest(spec, manifest);
    if (localResolved) {
      results.push({
        rawSpecifier: spec,
        moduleName: spec,
        importedNames: [],
        category: 'local_module',
        relativeLevel: 0,
        resolvedFilePath: localResolved,
        resolutionStatus: 'resolved_local',
      });
      continue;
    }

    // Non-relative, non-stdlib import that does not match any uploaded local module is classified as third_party
    results.push({
      rawSpecifier: spec,
      moduleName: spec,
      importedNames: [],
      category: 'third_party',
      relativeLevel: 0,
      resolvedFilePath: null,
      resolutionStatus: 'third_party',
    });
  }

  return results;
}

/**
 * Inspects repository files and manifests to determine primary language,
 * package manager, build system, test framework, and recommended verification commands.
 */
export function detectLanguageToolchain(
  files: readonly RepoFile[],
  isolatedSandboxAvailable = false
): LanguageToolchainProfile {
  const langCounts = new Map<string, number>();
  const codeLanguages = new Set<string>([
    'python',
    'typescript',
    'javascript',
    'java',
    'c',
    'cpp',
    'csharp',
    'go',
    'rust',
    'php',
    'ruby',
    'swift',
    'kotlin',
    'sql',
    'shell',
  ]);

  for (const f of files) {
    if (codeLanguages.has(f.language)) {
      langCounts.set(f.language, (langCounts.get(f.language) || 0) + 1);
    }
  }

  const sortedLangs = Array.from(langCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([l]) => l);

  const primaryRaw = sortedLangs[0] || files[0]?.language || 'text';
  const formatLang = (l: string) => {
    const map: Record<string, string> = {
      python: 'Python',
      typescript: 'TypeScript',
      javascript: 'JavaScript',
      java: 'Java',
      c: 'C',
      cpp: 'C++',
      csharp: 'C#',
      go: 'Go',
      rust: 'Rust',
      php: 'PHP',
      ruby: 'Ruby',
      swift: 'Swift',
      kotlin: 'Kotlin',
      sql: 'SQL',
      shell: 'Shell',
    };
    return map[l] || l.charAt(0).toUpperCase() + l.slice(1);
  };

  const primaryLanguage = formatLang(primaryRaw);
  const detectedLanguages =
    sortedLangs.length > 0 ? sortedLangs.map(formatLang) : [primaryLanguage];

  const manifestFiles = files
    .filter((f) =>
      [
        'pyproject.toml',
        'requirements.txt',
        'setup.py',
        'package.json',
        'tsconfig.json',
        'Cargo.toml',
        'go.mod',
        'pom.xml',
        'build.gradle',
        'Gemfile',
        'Makefile',
      ].some((m) => f.path.endsWith(m))
    )
    .map((f) => f.path);

  const testFiles = files.filter((f) => f.isTestFile);
  const hasExistingTests = testFiles.length > 0;

  const pkgJsonFile = files.find((f) => f.path.endsWith('package.json'));
  const pyprojectFile = files.find(
    (f) => f.path.endsWith('pyproject.toml') || f.path.endsWith('requirements.txt')
  );
  const cargoFile = files.find((f) => f.path.endsWith('Cargo.toml'));
  const goModFile = files.find((f) => f.path.endsWith('go.mod'));
  const pomFile = files.find((f) => f.path.endsWith('pom.xml'));
  const gradleFile = files.find((f) => f.path.includes('build.gradle'));

  if (pkgJsonFile || primaryRaw === 'typescript' || primaryRaw === 'javascript') {
    let testScript = 'npm test';
    let lintScript =
      primaryRaw === 'typescript' ? 'tsc --noEmit' : 'node --check';
    try {
      if (pkgJsonFile) {
        const parsed = JSON.parse(pkgJsonFile.content) as {
          scripts?: Record<string, string>;
        };
        if (parsed.scripts?.test) {
          testScript = `npm test (${parsed.scripts.test})`;
        } else if (hasExistingTests) {
          testScript = 'npx tsx --test';
        }
        if (parsed.scripts?.lint) {
          lintScript = `npm run lint (${parsed.scripts.lint})`;
        } else if (parsed.scripts?.typecheck) {
          lintScript = `npm run typecheck (${parsed.scripts.typecheck})`;
        }
      }
    } catch {
      // ignore json parse error
    }

    return {
      primaryLanguage,
      detectedLanguages,
      packageManager: 'npm',
      buildSystem: primaryRaw === 'typescript' ? 'TypeScript (tsc / vite)' : 'Node.js',
      testFramework: hasExistingTests ? 'node:test / vitest / jest' : 'none',
      hasExistingTests,
      recommendedTestCommand: hasExistingTests ? testScript : lintScript,
      recommendedLintOrTypecheckCommand: lintScript,
      manifestFiles,
      runtimeAvailableInSandbox: true,
    };
  }

  if (pyprojectFile || primaryRaw === 'python') {
    return {
      primaryLanguage: 'Python',
      detectedLanguages,
      packageManager: pyprojectFile?.path.endsWith('pyproject.toml')
        ? 'pip / pyproject.toml'
        : 'pip',
      buildSystem: 'setuptools / wheel',
      testFramework: hasExistingTests ? 'pytest' : 'python -m py_compile',
      hasExistingTests,
      recommendedTestCommand: hasExistingTests
        ? 'pytest -q'
        : 'python -m py_compile',
      recommendedLintOrTypecheckCommand: 'python -m py_compile',
      manifestFiles,
      runtimeAvailableInSandbox: true,
    };
  }

  if (cargoFile || primaryRaw === 'rust') {
    return {
      primaryLanguage: 'Rust',
      detectedLanguages,
      packageManager: 'cargo',
      buildSystem: 'cargo',
      testFramework: hasExistingTests ? 'cargo test' : 'cargo check',
      hasExistingTests,
      recommendedTestCommand: 'cargo test',
      recommendedLintOrTypecheckCommand: 'cargo check',
      manifestFiles,
      runtimeAvailableInSandbox: isolatedSandboxAvailable,
      unavailableReason: isolatedSandboxAvailable
        ? undefined
        : 'Rust toolchain (rustc/cargo) requires an external isolated container sandbox (`SANDBOX_RUNNER_URL`). Static syntax & brace check is performed.',
    };
  }

  if (goModFile || primaryRaw === 'go') {
    return {
      primaryLanguage: 'Go',
      detectedLanguages,
      packageManager: 'go mod',
      buildSystem: 'go build',
      testFramework: hasExistingTests ? 'go test' : 'go vet',
      hasExistingTests,
      recommendedTestCommand: 'go test ./...',
      recommendedLintOrTypecheckCommand: 'go vet ./...',
      manifestFiles,
      runtimeAvailableInSandbox: isolatedSandboxAvailable,
      unavailableReason: isolatedSandboxAvailable
        ? undefined
        : 'Go toolchain (`go test`) requires an external isolated container sandbox (`SANDBOX_RUNNER_URL`). Static syntax check is performed.',
    };
  }

  if (pomFile || gradleFile || primaryRaw === 'java' || primaryRaw === 'kotlin') {
    const isGradle = Boolean(gradleFile);
    return {
      primaryLanguage,
      detectedLanguages,
      packageManager: isGradle ? 'Gradle' : 'Maven',
      buildSystem: isGradle ? 'gradle' : 'mvn',
      testFramework: 'JUnit',
      hasExistingTests,
      recommendedTestCommand: isGradle ? './gradlew test' : 'mvn test',
      recommendedLintOrTypecheckCommand: isGradle
        ? './gradlew check'
        : 'mvn test-compile',
      manifestFiles,
      runtimeAvailableInSandbox: isolatedSandboxAvailable,
      unavailableReason: isolatedSandboxAvailable
        ? undefined
        : 'JVM toolchain (JDK / Maven / Gradle) requires an external isolated container sandbox (`SANDBOX_RUNNER_URL`). Static syntax check is performed.',
    };
  }

  return {
    primaryLanguage,
    detectedLanguages,
    packageManager: 'standard',
    buildSystem: 'native',
    testFramework: hasExistingTests ? 'custom test runner' : 'static check only',
    hasExistingTests,
    recommendedTestCommand: hasExistingTests
      ? 'make test'
      : 'static-syntax-check',
    manifestFiles,
    runtimeAvailableInSandbox: isolatedSandboxAvailable,
    unavailableReason: isolatedSandboxAvailable
      ? undefined
      : `Runtime toolchain for ${primaryLanguage} is not installed in the preview container. Static syntax verification is performed; full test execution requires an isolated sandbox runner.`,
  };
}

export function analyzeRepositoryStructure(files: readonly RepoFile[]): {
  findings: RepositoryFindings;
  toolchain: LanguageToolchainProfile;
  symbolMap: Map<string, FileSymbolMetadata>;
  callerEdges: CallerEdge[];
  manifest: NormalizedProjectManifest;
} {
  const manifest = buildNormalizedProjectManifest(files);
  const symbolMap = new Map<string, FileSymbolMetadata>();
  const contextChecksSet = new Set<string>();

  for (const file of files) {
    const meta = extractFileSymbolMetadata(file);
    if (file.language === 'python') {
      const classified = classifyPythonImports(file, files, manifest);
      meta.classifiedImports = classified;
      for (const imp of classified) {
        if (imp.resolutionStatus === 'unresolved_missing_context') {
          contextChecksSet.add(
            `Context check in ${file.path}: package-relative import "${imp.rawSpecifier}" requires surrounding package files not included in this upload.`
          );
        }
      }
    }
    symbolMap.set(file.path, meta);
  }

  const symbolDefinitionFile = new Map<string, string>();
  for (const [filePath, meta] of symbolMap.entries()) {
    for (const fn of meta.definedFunctions) {
      if (!fn.startsWith('test_')) {
        symbolDefinitionFile.set(fn, filePath);
      }
    }
    for (const cls of meta.definedClasses) {
      symbolDefinitionFile.set(cls, filePath);
    }
  }

  const callerEdges: CallerEdge[] = [];
  const callerRelationshipDescriptions: string[] = [];

  for (const [callerPath, meta] of symbolMap.entries()) {
    const referencedByTarget = new Map<string, Set<string>>();

    for (const sym of [...meta.importedSymbols, ...meta.calledSymbols]) {
      const defFile = symbolDefinitionFile.get(sym);
      if (defFile && defFile !== callerPath) {
        if (!referencedByTarget.has(defFile)) {
          referencedByTarget.set(defFile, new Set());
        }
        referencedByTarget.get(defFile)!.add(sym);
      }
    }

    for (const [calleeFile, symsSet] of referencedByTarget.entries()) {
      const symbols = Array.from(symsSet);
      callerEdges.push({
        callerFile: callerPath,
        calleeFile,
        symbols,
      });
      callerRelationshipDescriptions.push(
        `${callerPath} -> ${calleeFile} (${symbols.join(', ')})`
      );
    }
  }

  const toolchain = detectLanguageToolchain(files);

  const entryPoints = files
    .filter(
      (f) =>
        f.path.endsWith('__init__.py') ||
        f.path.endsWith('main.py') ||
        f.path.endsWith('app.py') ||
        f.path.endsWith('cli.py') ||
        f.path.endsWith('index.ts') ||
        f.path.endsWith('index.js') ||
        f.path.endsWith('main.go') ||
        f.path.endsWith('main.rs') ||
        f.path.endsWith('lib.rs')
    )
    .map((f) => f.path);

  const existingTests = files.filter((f) => f.isTestFile).map((f) => f.path);
  const nonConfigSourceFiles = files
    .filter(
      (f) =>
        !f.isTestFile &&
        !['markdown', 'toml', 'json', 'yaml', 'config', 'text'].includes(
          f.language
        )
    )
    .map((f) => f.path);

  const findings: RepositoryFindings = {
    language: toolchain.primaryLanguage,
    detected_languages: toolchain.detectedLanguages,
    package_manager: toolchain.packageManager,
    build_system: toolchain.buildSystem,
    test_framework: toolchain.testFramework,
    dependencies: parseRepositoryDependencies(files),
    entry_points:
      entryPoints.length > 0 ? entryPoints : nonConfigSourceFiles.slice(0, 2),
    relevant_files:
      nonConfigSourceFiles.length > 0
        ? nonConfigSourceFiles
        : files.map((f) => f.path),
    existing_tests: existingTests,
    caller_relationships: callerRelationshipDescriptions,
    total_files_indexed: files.length,
    excluded_paths: manifest.excludedFrameworkOrEnvPaths,
    is_incomplete_context: manifest.isIncompleteContext,
    context_completeness_note: manifest.contextCompletenessNote,
    context_checks: Array.from(contextChecksSet),
  };

  return { findings, toolchain, symbolMap, callerEdges, manifest };
}

export function buildFocusedFileExcerpt(
  file: RepoFile,
  keywords: string[],
  focusLineRange?: { startLine: number; endLine: number }
): { content: string; lineRange: string; truncationWarning?: string } {
  const lines = file.content.replace(/\r\n/g, '\n').split('\n');
  if (lines.length <= 140) {
    return { content: file.content, lineRange: `1-${lines.length}` };
  }

  const keepLines = new Set<number>();
  // Always keep top header/imports (first 40 lines)
  for (let i = 0; i < Math.min(40, lines.length); i++) {
    keepLines.add(i);
  }

  // Always preserve ALL import statements and multi-line import blocks across the entire file
  // so no model or analyzer ever infers a missing import (e.g. Path or json) from a partial excerpt
  let inImportParen = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const isImportStart =
      /^(?:from\s+[A-Za-z0-9_.]+\s+import\s+|import\s+[A-Za-z0-9_.]+)/.test(
        trimmed
      ) || /^if\s+(?:t\.)?TYPE_CHECKING\s*:/.test(trimmed);

    if (isImportStart || inImportParen) {
      keepLines.add(i);
      const openCount = (trimmed.match(/\(/g) || []).length;
      const closeCount = (trimmed.match(/\)/g) || []).length;
      if (openCount > closeCount || trimmed.endsWith('\\')) {
        inImportParen = true;
      } else if (closeCount >= openCount) {
        inImportParen = false;
      }
    }
  }

  if (focusLineRange) {
    const start = Math.max(0, focusLineRange.startLine - 15);
    const end = Math.min(lines.length - 1, focusLineRange.endLine + 20);
    for (let j = start; j <= end; j++) {
      keepLines.add(j);
    }
  }

  const lowerKeywords = keywords
    .map((k) => k.toLowerCase())
    .filter((k) => k.length >= 3);

  for (let i = 0; i < lines.length; i++) {
    const lowerLine = lines[i].toLowerCase();
    if (lowerKeywords.some((kw) => lowerLine.includes(kw))) {
      const start = Math.max(0, i - 12);
      const end = Math.min(lines.length - 1, i + 28);
      for (let j = start; j <= end; j++) {
        keepLines.add(j);
      }
    }
  }

  const sortedIndices = Array.from(keepLines).sort((a, b) => a - b);
  const excerptLines: string[] = [];
  let prevIdx = -1;
  let omittedCount = 0;

  for (const idx of sortedIndices) {
    if (prevIdx !== -1 && idx > prevIdx + 1) {
      const gap = idx - prevIdx - 1;
      omittedCount += gap;
      excerptLines.push(
        `# ... [WARNING: lines ${prevIdx + 2}-${idx} (${gap} lines) omitted due to context token budget] ...`
      );
    }
    excerptLines.push(lines[idx]);
    prevIdx = idx;
  }

  const warningMsg =
    omittedCount > 0
      ? `${file.path}: ${omittedCount} of ${lines.length} lines omitted to fit token budget (${sortedIndices.length} lines sent; all import declarations preserved).`
      : undefined;

  return {
    content: excerptLines.join('\n'),
    lineRange: `Excerpt (${sortedIndices.length}/${lines.length} lines)`,
    truncationWarning: warningMsg,
  };
}

export function selectContextForTask(
  files: readonly RepoFile[],
  taskDescription: string,
  maxTokenBudget = 8000,
  selectionContext?: CodeSelectionContext | null
): ContextSelectionReport {
  const { symbolMap, callerEdges } = analyzeRepositoryStructure(files);

  const taskWords = taskDescription
    .split(/[^A-Za-z0-9_./-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
  const lowerTask = taskDescription.toLowerCase();

  const primaryTargets = new Set<string>();
  if (selectionContext?.filePath) {
    primaryTargets.add(selectionContext.filePath);
  }

  for (const file of files) {
    const meta = symbolMap.get(file.path);
    const fileMentioned = lowerTask.includes(file.path.toLowerCase());
    const symbolMentioned =
      meta &&
      [...meta.definedFunctions, ...meta.definedClasses].some((sym) =>
        lowerTask.includes(sym.toLowerCase())
      );
    const contentKeywordMatch =
      !file.isTestFile &&
      !['markdown', 'json', 'yaml', 'toml'].includes(file.language) &&
      taskWords.some(
        (w) =>
          w.length >= 4 &&
          file.content.toLowerCase().includes(w.toLowerCase())
      );

    if (fileMentioned || symbolMentioned || contentKeywordMatch) {
      primaryTargets.add(file.path);
    }
  }

  if (primaryTargets.size === 0) {
    for (const file of files) {
      if (
        !file.isTestFile &&
        !['markdown', 'toml', 'json', 'yaml', 'config'].includes(file.language)
      ) {
        primaryTargets.add(file.path);
      }
    }
  }

  const callerFiles = new Set<string>();
  const calleeFiles = new Set<string>();
  const relatedTests = new Set<string>();

  for (const edge of callerEdges) {
    if (primaryTargets.has(edge.calleeFile)) {
      const callerFileObj = files.find((f) => f.path === edge.callerFile);
      if (callerFileObj?.isTestFile) {
        relatedTests.add(edge.callerFile);
      } else {
        callerFiles.add(edge.callerFile);
      }
    }
    if (primaryTargets.has(edge.callerFile)) {
      calleeFiles.add(edge.calleeFile);
    }
  }

  if (relatedTests.size === 0) {
    for (const f of files) {
      if (f.isTestFile) relatedTests.add(f.path);
    }
  }

  const orderedCandidates: Array<{
    file: RepoFile;
    reason: ContextFileSelection['reason'];
  }> = [];
  const seen = new Set<string>();

  const pushCandidate = (
    file: RepoFile | undefined,
    reason: ContextFileSelection['reason']
  ) => {
    if (!file || seen.has(file.path)) return;
    seen.add(file.path);
    orderedCandidates.push({ file, reason });
  };

  if (selectionContext?.filePath) {
    pushCandidate(
      files.find((f) => f.path === selectionContext.filePath),
      'selected_in_editor'
    );
  }
  for (const p of primaryTargets) {
    pushCandidate(
      files.find((f) => f.path === p),
      'target_source'
    );
  }
  for (const p of calleeFiles) {
    pushCandidate(
      files.find((f) => f.path === p),
      'callee_dependency'
    );
  }
  for (const p of callerFiles) {
    pushCandidate(
      files.find((f) => f.path === p),
      'caller_dependency'
    );
  }
  for (const p of relatedTests) {
    pushCandidate(
      files.find((f) => f.path === p),
      'related_test'
    );
  }
  for (const f of files) {
    if (
      f.path.endsWith('pyproject.toml') ||
      f.path.endsWith('requirements.txt') ||
      f.path.endsWith('setup.cfg') ||
      f.path.endsWith('package.json') ||
      f.path.endsWith('tsconfig.json') ||
      f.path.endsWith('Cargo.toml') ||
      f.path.endsWith('go.mod')
    ) {
      pushCandidate(f, 'project_config');
    } else if (f.language !== 'markdown') {
      pushCandidate(f, 'entry_point');
    }
  }

  const includedFiles: ContextFileSelection[] = [];
  const excludedFiles: ContextExcludedItem[] = [];
  const truncationWarnings: string[] = [];
  let totalEstimatedTokens = 0;

  for (const { file, reason } of orderedCandidates) {
    const lines = file.content.replace(/\r\n/g, '\n').split('\n');
    const isLarge = lines.length > 140;
    const focusRange =
      selectionContext && selectionContext.filePath === file.path
        ? {
            startLine: selectionContext.startLine,
            endLine: selectionContext.endLine,
          }
        : undefined;

    const excerptObj = isLarge
      ? buildFocusedFileExcerpt(file, taskWords, focusRange)
      : {
          content: file.content,
          lineRange: `1-${lines.length}`,
          truncationWarning: undefined,
        };

    const tokenCost = estimateTokens(excerptObj.content);

    if (
      totalEstimatedTokens + tokenCost <= maxTokenBudget ||
      includedFiles.length === 0
    ) {
      if (excerptObj.truncationWarning) {
        truncationWarnings.push(excerptObj.truncationWarning);
      }
      includedFiles.push({
        path: file.path,
        mode: isLarge ? 'excerpt' : 'full',
        reason,
        estimatedTokens: tokenCost,
        contentSent: excerptObj.content,
        totalLines: lines.length,
        includedLineRange: excerptObj.lineRange,
        truncationWarning: excerptObj.truncationWarning,
      });
      totalEstimatedTokens += tokenCost;
    } else {
      truncationWarnings.push(
        `${file.path} (${tokenCost} est. tokens) excluded because context token budget (${maxTokenBudget}) was reached.`
      );
      excludedFiles.push({
        path: file.path,
        reason: 'budget_exceeded',
        estimatedTokens: tokenCost,
      });
    }
  }

  for (const f of files) {
    if (!seen.has(f.path)) {
      excludedFiles.push({
        path: f.path,
        reason: 'low_relevance',
        estimatedTokens: estimateTokens(f.content),
      });
    }
  }

  return {
    maxTokenBudget,
    totalEstimatedTokens,
    includedFiles,
    excludedFiles,
    symbolGraphSummary: callerEdges.map(
      (e) => `${e.callerFile} -> ${e.calleeFile} [${e.symbols.join(', ')}]`
    ),
    truncationWarnings,
  };
}

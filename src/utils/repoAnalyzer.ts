import type {
  CallerEdge,
  CodeSelectionContext,
  ContextExcludedItem,
  ContextFileSelection,
  ContextSelectionReport,
  FileSymbolMetadata,
  LanguageToolchainProfile,
  RepoFile,
  RepositoryFindings,
} from '../types/repopilot';

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

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
 * Extracts functions, classes/types, imported modules/symbols, and called symbols
 * across Python, TypeScript/JavaScript, Go, Rust, Java, C#, C/C++, Ruby, and PHP.
 */
export function extractFileSymbolMetadata(file: RepoFile): FileSymbolMetadata {
  const lines = file.content.replace(/\r\n/g, '\n').split('\n');
  const definedFunctions: string[] = [];
  const definedClasses: string[] = [];
  const importedModules: string[] = [];
  const importedSymbols: string[] = [];
  const calledSymbolsSet = new Set<string>();

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

    if (file.language === 'python') {
      const fnMatch = line.match(
        /^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/
      );
      if (fnMatch) definedFunctions.push(fnMatch[1]);

      const clsMatch = line.match(/^class\s+([A-Za-z_][A-Za-z0-9_]*)\s*[:(]/);
      if (clsMatch) definedClasses.push(clsMatch[1]);

      const fromImportMatch = line.match(
        /^from\s+([A-Za-z0-9_.]+)\s+import\s+(.+)$/
      );
      if (fromImportMatch) {
        importedModules.push(fromImportMatch[1]);
        const rawSyms = fromImportMatch[2]
          .replace(/[()]/g, '')
          .split(',')
          .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
          .filter(Boolean);
        importedSymbols.push(...rawSyms);
      } else {
        const directImportMatch = line.match(/^import\s+([A-Za-z0-9_.,\s]+)$/);
        if (directImportMatch) {
          const mods = directImportMatch[1]
            .split(',')
            .map((m) => m.trim().split(/\s+as\s+/)[0].trim())
            .filter(Boolean);
          importedModules.push(...mods);
        }
      }
    } else if (
      file.language === 'typescript' ||
      file.language === 'javascript'
    ) {
      const fnDecl = line.match(
        /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*[(<]/
      );
      if (fnDecl) definedFunctions.push(fnDecl[1]);

      const arrowFn = line.match(
        /^(?:export\s+)?(?:const|let)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)\s*=>/
      );
      if (arrowFn) definedFunctions.push(arrowFn[1]);

      const clsOrIface = line.match(
        /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(?:class|interface|type)\s+([A-Za-z_$][A-Za-z0-9_$]*)/
      );
      if (clsOrIface) definedClasses.push(clsOrIface[1]);

      const esImport = line.match(
        /^import\s+(?:type\s+)?(.+?)\s+from\s+['"]([^'"]+)['"]/
      );
      if (esImport) {
        importedModules.push(esImport[2]);
        const specifiers = esImport[1]
          .replace(/[{}]/g, '')
          .split(',')
          .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
          .filter((s) => s && !s.startsWith('*'));
        importedSymbols.push(...specifiers);
      }
    } else if (file.language === 'go') {
      const goFn = line.match(
        /^func\s+(?:\([^)]+\)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/
      );
      if (goFn) definedFunctions.push(goFn[1]);
      const goType = line.match(/^type\s+([A-Za-z_][A-Za-z0-9_]*)\s+(?:struct|interface)/);
      if (goType) definedClasses.push(goType[1]);
    } else if (file.language === 'rust') {
      const rsFn = line.match(
        /^(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*[(<]/
      );
      if (rsFn) definedFunctions.push(rsFn[1]);
      const rsType = line.match(
        /^(?:pub\s+)?(?:struct|enum|trait)\s+([A-Za-z_][A-Za-z0-9_]*)/
      );
      if (rsType) definedClasses.push(rsType[1]);
    } else if (
      file.language === 'java' ||
      file.language === 'csharp' ||
      file.language === 'kotlin'
    ) {
      const clsMatch = line.match(
        /(?:public|private|protected|internal)?\s*(?:static\s+|final\s+|abstract\s+)*(?:class|interface|record)\s+([A-Za-z_][A-Za-z0-9_]*)/
      );
      if (clsMatch) definedClasses.push(clsMatch[1]);
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
    definedFunctions,
    definedClasses,
    importedModules,
    importedSymbols,
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
} {
  const symbolMap = new Map<string, FileSymbolMetadata>();
  for (const file of files) {
    symbolMap.set(file.path, extractFileSymbolMetadata(file));
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
  };

  return { findings, toolchain, symbolMap, callerEdges };
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
  // Always keep top imports/declarations (first 30 lines)
  for (let i = 0; i < Math.min(30, lines.length); i++) {
    keepLines.add(i);
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
      ? `${file.path}: ${omittedCount} of ${lines.length} lines omitted to fit token budget (${sortedIndices.length} lines sent).`
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

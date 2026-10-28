import type {
  FilePatchChange,
  PatchValidationDiagnostic,
  ProposedFilePatchItem,
  RepoFile,
  SearchReplaceHunk,
} from '../types/repopilot';
import { extractFileSymbolMetadata } from './repoAnalyzer';
import { inferLanguage } from './securityValidator';

/**
 * Applies minimal search-and-replace blocks to a file's original content.
 * Supports exact normalized matches as well as line-trimmed matches when
 * indentation differs slightly, while strictly rejecting non-matching hunks.
 */
export function applySearchReplaceBlocks(
  originalContent: string,
  blocks: readonly SearchReplaceHunk[]
): { success: boolean; content: string; errors: string[] } {
  let current = originalContent.replace(/\r\n/g, '\n');
  const errors: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const searchNormalized = blocks[i].search.replace(/\r\n/g, '\n');
    const replaceNormalized = blocks[i].replace.replace(/\r\n/g, '\n');

    if (!searchNormalized.trim()) {
      errors.push(`Search/replace block #${i + 1} has an empty search target.`);
      continue;
    }

    if (current.includes(searchNormalized)) {
      current = current.replace(searchNormalized, replaceNormalized);
      continue;
    }

    // Fallback: line-by-line trimmed comparison to tolerate minor trailing whitespace differences
    const currentLines = current.split('\n');
    const searchLines = searchNormalized.split('\n');
    let matchStartIndex = -1;

    if (searchLines.length > 0 && searchLines.length <= currentLines.length) {
      for (
        let start = 0;
        start <= currentLines.length - searchLines.length;
        start++
      ) {
        let allMatch = true;
        for (let k = 0; k < searchLines.length; k++) {
          if (currentLines[start + k].trim() !== searchLines[k].trim()) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) {
          matchStartIndex = start;
          break;
        }
      }
    }

    if (matchStartIndex !== -1) {
      const beforeSlice = currentLines.slice(0, matchStartIndex);
      const afterSlice = currentLines.slice(
        matchStartIndex + searchLines.length
      );
      current = [...beforeSlice, replaceNormalized, ...afterSlice].join('\n');
    } else {
      errors.push(
        `Search/replace block #${i + 1} could not be applied cleanly: target snippet not found in original file.`
      );
    }
  }

  return {
    success: errors.length === 0,
    content: current,
    errors,
  };
}

const COMMON_STDLIB_SYMBOLS: Record<string, string> = {
  dataclass: 'dataclasses',
  field: 'dataclasses',
  Decimal: 'decimal',
  ROUND_HALF_UP: 'decimal',
  Iterable: 'typing',
  Optional: 'typing',
  List: 'typing',
  Dict: 'typing',
  Tuple: 'typing',
  Any: 'typing',
  Callable: 'typing',
  Union: 'typing',
  Path: 'pathlib',
  datetime: 'datetime',
  timedelta: 'datetime',
  timezone: 'datetime',
  math: 'math',
  json: 'json',
  re: 're',
  pytest: 'pytest',
};

/**
 * Performs static syntax and import validation across Python, TypeScript/JavaScript, JSON, and C-family languages.
 */
export function checkPythonSyntaxAndImports(
  filePath: string,
  content: string,
  allRepoFiles: readonly RepoFile[]
): {
  syntaxValid: boolean;
  importsValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lang = inferLanguage(filePath, content);

  if (lang === 'json') {
    try {
      JSON.parse(content);
    } catch (err) {
      errors.push(
        `JSON SyntaxError in ${filePath}: ${
          err instanceof Error ? err.message : 'Invalid JSON'
        }`
      );
    }
    return {
      syntaxValid: errors.length === 0,
      importsValid: true,
      errors,
      warnings,
    };
  }

  if (
    lang === 'typescript' ||
    lang === 'javascript' ||
    lang === 'go' ||
    lang === 'rust' ||
    lang === 'java' ||
    lang === 'c' ||
    lang === 'cpp' ||
    lang === 'csharp'
  ) {
    const lines = content.replace(/\r\n/g, '\n').split('\n');
    let parenDepth = 0;
    let bracketDepth = 0;
    let braceDepth = 0;
    let inBlockComment = false;

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      let line = lines[lineIdx];
      if (inBlockComment) {
        const endComment = line.indexOf('*/');
        if (endComment === -1) continue;
        inBlockComment = false;
        line = line.slice(endComment + 2);
      }

      // Remove inline block comments and single-line // comments
      const withoutInlineBlock = line.replace(/\/\*[\s\S]*?\*\//g, '');
      if (withoutInlineBlock.includes('/*')) {
        inBlockComment = true;
        line = withoutInlineBlock.slice(0, withoutInlineBlock.indexOf('/*'));
      } else {
        line = withoutInlineBlock;
      }

      const codeOnly = line
        .replace(/(['"`])(?:(?!\1|\\).|\\.)*\1/g, '""')
        .split('//')[0];

      for (const ch of codeOnly) {
        if (ch === '(') parenDepth++;
        else if (ch === ')') parenDepth--;
        else if (ch === '[') bracketDepth++;
        else if (ch === ']') bracketDepth--;
        else if (ch === '{') braceDepth++;
        else if (ch === '}') braceDepth--;
      }

      if (parenDepth < 0 || bracketDepth < 0 || braceDepth < 0) {
        errors.push(
          `SyntaxError in ${filePath} at line ${lineIdx + 1}: unexpected closing delimiter.`
        );
        break;
      }
    }

    if (parenDepth !== 0 || bracketDepth !== 0 || braceDepth !== 0) {
      errors.push(
        `SyntaxError in ${filePath}: unbalanced delimiters (paren=${parenDepth}, bracket=${bracketDepth}, brace=${braceDepth}).`
      );
    }

    // Check TS/JS relative imports resolve to existing repo files
    if (lang === 'typescript' || lang === 'javascript') {
      const meta = extractFileSymbolMetadata({
        path: filePath,
        content,
        sizeBytes: content.length,
        language: lang,
        isTestFile: filePath.includes('test') || filePath.includes('spec'),
      });
      const repoDir = filePath.includes('/')
        ? filePath.slice(0, filePath.lastIndexOf('/'))
        : '';
      const repoPaths = new Set(allRepoFiles.map((f) => f.path));

      for (const mod of meta.importedModules) {
        if (mod.startsWith('./') || mod.startsWith('../')) {
          const cleanRel = mod.replace(/^\.\//, '');
          const baseCandidate = repoDir ? `${repoDir}/${cleanRel}` : cleanRel;
          const candidates = [
            baseCandidate,
            `${baseCandidate}.ts`,
            `${baseCandidate}.tsx`,
            `${baseCandidate}.js`,
            `${baseCandidate}.jsx`,
            `${baseCandidate}/index.ts`,
            `${baseCandidate}/index.js`,
          ];
          if (
            !mod.startsWith('../') &&
            !candidates.some((c) => repoPaths.has(c))
          ) {
            errors.push(
              `ImportError in ${filePath}: relative import "${mod}" does not resolve to any file in the repository.`
            );
          }
        }
      }
    }

    const syntaxValid =
      errors.filter((e) => e.includes('SyntaxError')).length === 0;
    const importsValid =
      errors.filter((e) => e.includes('ImportError')).length === 0;
    return { syntaxValid, importsValid, errors, warnings };
  }

  if (!filePath.endsWith('.py')) {
    return { syntaxValid: true, importsValid: true, errors, warnings };
  }

  const lines = content.replace(/\r\n/g, '\n').split('\n');

  // 1. Check balanced parentheses, brackets, and braces outside comments/strings
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let inTripleSingle = false;
  let inTripleDouble = false;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const rawLine = lines[lineIdx];
    const trimmed = rawLine.trim();

    const tripleDoubleCount = (rawLine.match(/"""/g) || []).length;
    if (tripleDoubleCount % 2 === 1) inTripleDouble = !inTripleDouble;
    const tripleSingleCount = (rawLine.match(/'''/g) || []).length;
    if (tripleSingleCount % 2 === 1) inTripleSingle = !inTripleSingle;

    if (
      inTripleDouble ||
      inTripleSingle ||
      !trimmed ||
      trimmed.startsWith('#')
    ) {
      continue;
    }

    const codeOnly = rawLine
      .replace(/(['"])(?:(?!\1|\\).|\\.)*\1/g, '""')
      .split('#')[0];

    for (const ch of codeOnly) {
      if (ch === '(') parenDepth++;
      else if (ch === ')') parenDepth--;
      else if (ch === '[') bracketDepth++;
      else if (ch === ']') bracketDepth--;
      else if (ch === '{') braceDepth++;
      else if (ch === '}') braceDepth--;
    }

    if (parenDepth < 0 || bracketDepth < 0 || braceDepth < 0) {
      errors.push(
        `SyntaxError in ${filePath} at line ${lineIdx + 1}: unexpected closing delimiter.`
      );
      break;
    }

    if (
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0 &&
      /^(?:def\s+\w+\(.*\)|class\s+\w+(?:\(.*\))?|else|try|finally)\s*$/.test(
        codeOnly.trim()
      ) &&
      !codeOnly.trim().endsWith(':') &&
      !codeOnly.trim().endsWith('\\')
    ) {
      errors.push(
        `SyntaxError in ${filePath} at line ${lineIdx + 1}: compound statement is missing a trailing colon ':'.`
      );
    }
  }

  if (parenDepth !== 0 || bracketDepth !== 0 || braceDepth !== 0) {
    errors.push(
      `SyntaxError in ${filePath}: unbalanced parentheses/brackets (paren=${parenDepth}, bracket=${bracketDepth}, brace=${braceDepth}).`
    );
  }

  if (inTripleDouble || inTripleSingle) {
    errors.push(
      `SyntaxError in ${filePath}: unterminated triple-quoted string literal.`
    );
  }

  const syntaxValid = errors.length === 0;

  // 2. Check imports & symbol references
  const meta = extractFileSymbolMetadata({
    path: filePath,
    content,
    sizeBytes: content.length,
    language: 'python',
    isTestFile: filePath.includes('test'),
  });

  const importedEverything = new Set<string>([
    ...meta.importedSymbols,
    ...meta.importedModules.map((m) => m.split('.')[0]),
    ...meta.definedFunctions,
    ...meta.definedClasses,
  ]);

  const repoDir = filePath.includes('/')
    ? filePath.slice(0, filePath.lastIndexOf('/'))
    : '';
  const repoFilePaths = new Set(allRepoFiles.map((f) => f.path));

  for (const mod of meta.importedModules) {
    if (mod.startsWith('.')) {
      const cleanRel = mod.replace(/^\.+/, '');
      if (cleanRel) {
        const candidate1 = repoDir
          ? `${repoDir}/${cleanRel.replace(/\./g, '/')}.py`
          : `${cleanRel.replace(/\./g, '/')}.py`;
        const candidate2 = repoDir
          ? `${repoDir}/${cleanRel.replace(/\./g, '/')}/__init__.py`
          : `${cleanRel.replace(/\./g, '/')}/__init__.py`;
        if (!repoFilePaths.has(candidate1) && !repoFilePaths.has(candidate2)) {
          errors.push(
            `ImportError in ${filePath}: relative import "${mod}" does not resolve to any file in the repository.`
          );
        }
      }
    }
  }

  const activeCodeLines = lines
    .filter((l) => !l.trim().startsWith('#'))
    .map((l) => l.split('#')[0]);
  const activeCode = activeCodeLines.join('\n');

  for (const [sym, requiredMod] of Object.entries(COMMON_STDLIB_SYMBOLS)) {
    const regex =
      sym === 'math' || sym === 'json' || sym === 're' || sym === 'pytest'
        ? new RegExp(`\\b${sym}\\.[A-Za-z_][A-Za-z0-9_]*`, 'g')
        : new RegExp(`(?:@|\\b)${sym}\\b`, 'g');

    if (regex.test(activeCode)) {
      const hasSymbolOrMod =
        importedEverything.has(sym) ||
        importedEverything.has(requiredMod) ||
        meta.importedModules.includes(requiredMod);
      if (!hasSymbolOrMod) {
        errors.push(
          `NameError / Missing Import in ${filePath}: symbol "${sym}" is used without importing "${requiredMod}".`
        );
      }
    }
  }

  for (const otherFile of allRepoFiles) {
    if (otherFile.path === filePath || otherFile.language !== 'python') continue;
    const otherMeta = extractFileSymbolMetadata(otherFile);
    for (const exportedSym of [
      ...otherMeta.definedFunctions,
      ...otherMeta.definedClasses,
    ]) {
      if (exportedSym.startsWith('_') || exportedSym.startsWith('test_'))
        continue;
      if (
        meta.calledSymbols.includes(exportedSym) &&
        !importedEverything.has(exportedSym)
      ) {
        errors.push(
          `NameError / Missing Import in ${filePath}: repository symbol "${exportedSym}" (defined in ${otherFile.path}) is called without being imported.`
        );
      }
    }
  }

  const importsValid =
    errors.filter((e) => e.includes('Import') || e.includes('NameError'))
      .length === 0;

  return {
    syntaxValid,
    importsValid,
    errors,
    warnings,
  };
}

/**
 * Validates that all proposed patches target real files in the repository,
 * apply cleanly without hunk conflicts, and pass language syntax & import checks.
 */
export function validateProposedPatches(
  originalFiles: readonly RepoFile[],
  proposedPatches: readonly ProposedFilePatchItem[]
): {
  allValid: boolean;
  changes: FilePatchChange[];
  diagnostics: PatchValidationDiagnostic[];
  errors: string[];
} {
  const fileMap = new Map(originalFiles.map((f) => [f.path, f]));
  const changes: FilePatchChange[] = [];
  const diagnostics: PatchValidationDiagnostic[] = [];
  const globalErrors: string[] = [];

  // First build all candidate file contents so cross-file checks see simultaneous multi-file edits
  const candidateContents = new Map<string, string>();
  const perFileResults: Array<{
    item: ProposedFilePatchItem;
    existingFile: RepoFile;
    patchedContent: string;
    appliesCleanly: boolean;
    fileErrors: string[];
  }> = [];

  for (const item of proposedPatches) {
    if (item.operation === 'no_change') {
      continue;
    }

    const existingFile = fileMap.get(item.file_path);
    if (!existingFile) {
      const errMsg = `Invalid patch target "${item.file_path}": file does not exist in the repository. Inventing file paths is prohibited.`;
      globalErrors.push(errMsg);
      diagnostics.push({
        filePath: item.file_path,
        valid: false,
        appliesCleanly: false,
        syntaxValid: false,
        importsValid: false,
        errors: [errMsg],
        warnings: [],
      });
      continue;
    }

    let patchedContent = existingFile.content;
    let appliesCleanly = true;
    const fileErrors: string[] = [];

    if (item.search_replace_blocks && item.search_replace_blocks.length > 0) {
      const hunkResult = applySearchReplaceBlocks(
        existingFile.content,
        item.search_replace_blocks
      );
      if (hunkResult.success) {
        appliesCleanly = true;
        patchedContent = hunkResult.content;
      } else {
        appliesCleanly = false;
        fileErrors.push(...hunkResult.errors);
      }
    } else if (
      typeof item.patched_content === 'string' &&
      item.patched_content.trim().length > 0
    ) {
      patchedContent = item.patched_content;
    } else {
      appliesCleanly = false;
      fileErrors.push(
        `Patch for "${item.file_path}" contains neither valid search_replace_blocks nor patched_content.`
      );
    }

    candidateContents.set(item.file_path, patchedContent);
    perFileResults.push({
      item,
      existingFile,
      patchedContent,
      appliesCleanly,
      fileErrors,
    });
  }

  const simulatedRepo = originalFiles.map((f) =>
    candidateContents.has(f.path)
      ? { ...f, content: candidateContents.get(f.path)! }
      : f
  );

  for (const entry of perFileResults) {
    const staticCheck = checkPythonSyntaxAndImports(
      entry.item.file_path,
      entry.patchedContent,
      simulatedRepo
    );
    entry.fileErrors.push(...staticCheck.errors);

    const isFileValid =
      entry.appliesCleanly &&
      staticCheck.syntaxValid &&
      staticCheck.importsValid;

    diagnostics.push({
      filePath: entry.item.file_path,
      valid: isFileValid,
      appliesCleanly: entry.appliesCleanly,
      syntaxValid: staticCheck.syntaxValid,
      importsValid: staticCheck.importsValid,
      errors: entry.fileErrors,
      warnings: staticCheck.warnings,
    });

    if (!isFileValid) {
      globalErrors.push(...entry.fileErrors);
    }

    changes.push({
      filePath: entry.item.file_path,
      explanation:
        entry.item.explanation || `Updated ${entry.item.file_path}`,
      originalContent: entry.existingFile.content,
      proposedContent: entry.patchedContent,
    });
  }

  return {
    allValid: globalErrors.length === 0,
    changes,
    diagnostics,
    errors: globalErrors,
  };
}

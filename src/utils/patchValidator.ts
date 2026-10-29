import type {
  ClassifiedImportEntry,
  FilePatchChange,
  NormalizedProjectManifest,
  PatchValidationDiagnostic,
  ProposedFilePatchItem,
  RepoFile,
  SearchReplaceHunk,
} from '../types/repopilot';
import {
  buildNormalizedProjectManifest,
  classifyPythonImports,
  extractFileSymbolMetadata,
  stripPythonCommentsAndStrings,
} from './repoAnalyzer';
import { inferLanguage, isExcludedRepositoryDirectory } from './securityValidator';

/**
 * Deduplicates validation error/warning/check messages while preserving order.
 */
export function deduplicateValidationMessages(
  messages: readonly string[]
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of messages) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

/**
 * Detects whether a code string is an incomplete/truncated snippet rather than a complete file.
 */
export function isPartialOrExcerptedCode(content: string): boolean {
  return (
    content.includes('[WARNING: lines') ||
    content.includes('omitted to fit context window]') ||
    /^\s*#\s*\.\.\.\s*\[lines\s+\d+/m.test(content)
  );
}

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
    errors: deduplicateValidationMessages(errors),
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
 * Performs static syntax and import validation strictly against the uploaded project tree.
 * Separates findings into:
 * - `confirmedErrors`: definite syntax or broken import errors within complete uploaded context
 * - `possibleIssues`: non-fatal warnings or ambiguous references
 * - `contextChecks`: checks requiring more project context (e.g., unresolved relative imports in single-file uploads)
 */
export function checkPythonSyntaxAndImports(
  filePath: string,
  content: string,
  allRepoFiles: readonly RepoFile[],
  existingManifest?: NormalizedProjectManifest
): {
  syntaxValid: boolean;
  importsValid: boolean;
  errors: string[];
  warnings: string[];
  confirmedErrors: string[];
  possibleIssues: string[];
  contextChecks: string[];
  isIncompleteContext: boolean;
  contextCompletenessNote: string;
  classifiedImports: ClassifiedImportEntry[];
} {
  // Filter out any unrelated framework/library/virtualenv files from allRepoFiles
  const uploadedProjectFiles = allRepoFiles.filter(
    (f) => !isExcludedRepositoryDirectory(f.path).excluded
  );
  const manifest =
    existingManifest || buildNormalizedProjectManifest(uploadedProjectFiles);

  const rawConfirmedErrors: string[] = [];
  const rawPossibleIssues: string[] = [];
  const rawContextChecks: string[] = [];

  if (manifest.isIncompleteContext) {
    rawContextChecks.push(manifest.contextCompletenessNote);
  }

  const lang = inferLanguage(filePath, content);

  if (lang === 'json') {
    try {
      JSON.parse(content);
    } catch (err) {
      rawConfirmedErrors.push(
        `JSON SyntaxError in ${filePath}: ${
          err instanceof Error ? err.message : 'Invalid JSON'
        }`
      );
    }
    const confirmedErrors = deduplicateValidationMessages(rawConfirmedErrors);
    const possibleIssues = deduplicateValidationMessages(rawPossibleIssues);
    const contextChecks = deduplicateValidationMessages(rawContextChecks);
    return {
      syntaxValid: confirmedErrors.length === 0,
      importsValid: true,
      errors: confirmedErrors,
      warnings: possibleIssues,
      confirmedErrors,
      possibleIssues,
      contextChecks,
      isIncompleteContext: manifest.isIncompleteContext,
      contextCompletenessNote: manifest.contextCompletenessNote,
      classifiedImports: [],
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
        rawConfirmedErrors.push(
          `SyntaxError in ${filePath} at line ${lineIdx + 1}: unexpected closing delimiter.`
        );
        break;
      }
    }

    if (parenDepth !== 0 || bracketDepth !== 0 || braceDepth !== 0) {
      rawConfirmedErrors.push(
        `SyntaxError in ${filePath}: unbalanced delimiters (paren=${parenDepth}, bracket=${bracketDepth}, brace=${braceDepth}).`
      );
    }

    // Check TS/JS relative imports resolve to existing uploaded files
    if (lang === 'typescript' || lang === 'javascript') {
      const meta = extractFileSymbolMetadata({
        path: filePath,
        content,
        sizeBytes: content.length,
        language: lang,
        isTestFile: filePath.includes('test') || filePath.includes('spec'),
      });
      const normFilePath = filePath
        .replace(/\\/g, '/')
        .replace(/^\.\//, '')
        .replace(/^\/+/, '');
      const repoDir = normFilePath.includes('/')
        ? normFilePath.slice(0, normFilePath.lastIndexOf('/'))
        : '';
      const repoPaths = new Set(manifest.normalizedFilePaths);

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
            if (manifest.isIncompleteContext) {
              rawContextChecks.push(
                `Context check in ${filePath}: relative import "${mod}" targets a file not present in this single-file upload.`
              );
            } else {
              rawConfirmedErrors.push(
                `ImportError in ${filePath}: relative import "${mod}" does not resolve to any file in the repository.`
              );
            }
          }
        }
      }
    }

    const confirmedErrors = deduplicateValidationMessages(rawConfirmedErrors);
    const possibleIssues = deduplicateValidationMessages(rawPossibleIssues);
    const contextChecks = deduplicateValidationMessages(rawContextChecks);
    const syntaxValid =
      confirmedErrors.filter((e) => e.includes('SyntaxError')).length === 0;
    const importsValid =
      confirmedErrors.filter((e) => e.includes('ImportError')).length === 0;
    return {
      syntaxValid,
      importsValid,
      errors: confirmedErrors,
      warnings: possibleIssues,
      confirmedErrors,
      possibleIssues,
      contextChecks,
      isIncompleteContext: manifest.isIncompleteContext,
      contextCompletenessNote: manifest.contextCompletenessNote,
      classifiedImports: [],
    };
  }

  if (!filePath.endsWith('.py')) {
    const confirmedErrors = deduplicateValidationMessages(rawConfirmedErrors);
    const possibleIssues = deduplicateValidationMessages(rawPossibleIssues);
    const contextChecks = deduplicateValidationMessages(rawContextChecks);
    return {
      syntaxValid: true,
      importsValid: true,
      errors: confirmedErrors,
      warnings: possibleIssues,
      confirmedErrors,
      possibleIssues,
      contextChecks,
      isIncompleteContext: manifest.isIncompleteContext,
      contextCompletenessNote: manifest.contextCompletenessNote,
      classifiedImports: [],
    };
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
      rawConfirmedErrors.push(
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
      rawConfirmedErrors.push(
        `SyntaxError in ${filePath} at line ${lineIdx + 1}: compound statement is missing a trailing colon ':'.`
      );
    }
  }

  if (parenDepth !== 0 || bracketDepth !== 0 || braceDepth !== 0) {
    rawConfirmedErrors.push(
      `SyntaxError in ${filePath}: unbalanced parentheses/brackets (paren=${parenDepth}, bracket=${bracketDepth}, brace=${braceDepth}).`
    );
  }

  if (inTripleDouble || inTripleSingle) {
    rawConfirmedErrors.push(
      `SyntaxError in ${filePath}: unterminated triple-quoted string literal.`
    );
  }

  const syntaxValid = rawConfirmedErrors.length === 0;

  // 2. Check imports & symbol references against the complete relevant file and normalized manifest
  const normTargetPath = filePath
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
  const fullRepoFile = uploadedProjectFiles.find(
    (f) =>
      f.path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '') ===
      normTargetPath
  );

  const partialSnippet = isPartialOrExcerptedCode(content);

  const currentFileObj: RepoFile = {
    path: normTargetPath,
    content,
    sizeBytes: content.length,
    language: 'python',
    isTestFile: normTargetPath.includes('test'),
  };

  const meta = extractFileSymbolMetadata(currentFileObj);

  // If `content` was a partial snippet but the full file exists in `uploadedProjectFiles`,
  // merge the complete file's imports & definitions so we never falsely report missing imports.
  const fullMeta =
    fullRepoFile && fullRepoFile.content.length > content.length
      ? extractFileSymbolMetadata(fullRepoFile)
      : null;

  const importedEverything = new Set<string>([
    ...meta.importedSymbols,
    ...meta.importedModules.map((m) => m.replace(/^\.+/, '').split('.')[0]),
    ...meta.definedFunctions,
    ...meta.definedClasses,
    ...(meta.definedVariables || []),
    ...(fullMeta ? fullMeta.importedSymbols : []),
    ...(fullMeta
      ? fullMeta.importedModules.map((m) => m.replace(/^\.+/, '').split('.')[0])
      : []),
    ...(fullMeta ? fullMeta.definedFunctions : []),
    ...(fullMeta ? fullMeta.definedClasses : []),
    ...(fullMeta ? fullMeta.definedVariables || [] : []),
  ]);

  const classifiedImports = classifyPythonImports(
    currentFileObj,
    uploadedProjectFiles,
    manifest
  );

  for (const imp of classifiedImports) {
    if (imp.category === 'package_relative') {
      if (imp.resolutionStatus === 'resolved_local') {
        continue;
      }
      if (
        imp.resolutionStatus === 'unresolved_missing_context' ||
        manifest.isIncompleteContext
      ) {
        rawContextChecks.push(
          `Context check in ${filePath}: package-relative import "${imp.rawSpecifier}" cannot be verified because target sibling/package files were not included in the upload.`
        );
      } else {
        rawConfirmedErrors.push(
          `ImportError in ${filePath}: relative import "${imp.rawSpecifier}" does not resolve to any file in the uploaded project manifest.`
        );
      }
    }
  }

  // Strip comments and string literals (including triple-quoted docstrings) before checking symbol usage
  const strippedActiveCode = stripPythonCommentsAndStrings(content);

  if (partialSnippet) {
    rawContextChecks.push(
      `Context check in ${filePath}: code appears to be a partial or excerpted snippet; skipping missing-import inference on omitted sections.`
    );
  } else {
    for (const [sym, requiredMod] of Object.entries(COMMON_STDLIB_SYMBOLS)) {
      // Negative lookbehind (?<![.\w]) ensures attribute/method accesses like `self.json.dumps`
      // or `app.json` or `obj.Path` are never mistaken for top-level module/symbol references.
      const regex =
        sym === 'math' || sym === 'json' || sym === 're' || sym === 'pytest'
          ? new RegExp(`(?<![.\\w])${sym}\\.[A-Za-z_][A-Za-z0-9_]*`, 'g')
          : new RegExp(`(?:@|(?<![.\\w]))${sym}\\b`, 'g');

      if (regex.test(strippedActiveCode)) {
        const hasSymbolOrMod =
          importedEverything.has(sym) ||
          importedEverything.has(requiredMod) ||
          meta.importedModules.includes(requiredMod) ||
          (fullMeta ? fullMeta.importedModules.includes(requiredMod) : false);
        if (!hasSymbolOrMod) {
          rawConfirmedErrors.push(
            `NameError / Missing Import in ${filePath}: symbol "${sym}" is used without importing "${requiredMod}".`
          );
        }
      }
    }

    for (const otherFile of uploadedProjectFiles) {
      const normOther = otherFile.path
        .replace(/\\/g, '/')
        .replace(/^\.\//, '')
        .replace(/^\/+/, '');
      if (normOther === normTargetPath || otherFile.language !== 'python') {
        continue;
      }
      const otherMeta = extractFileSymbolMetadata(otherFile);
      for (const exportedSym of [
        ...otherMeta.definedFunctions,
        ...otherMeta.definedClasses,
      ]) {
        if (exportedSym.startsWith('_') || exportedSym.startsWith('test_')) {
          continue;
        }
        if (
          meta.calledSymbols.includes(exportedSym) &&
          !importedEverything.has(exportedSym)
        ) {
          rawConfirmedErrors.push(
            `NameError / Missing Import in ${filePath}: repository symbol "${exportedSym}" (defined in ${otherFile.path}) is called without being imported.`
          );
        }
      }
    }
  }

  const confirmedErrors = deduplicateValidationMessages(rawConfirmedErrors);
  const possibleIssues = deduplicateValidationMessages(rawPossibleIssues);
  const contextChecks = deduplicateValidationMessages(rawContextChecks);

  const importsValid =
    confirmedErrors.filter(
      (e) => e.includes('ImportError') || e.includes('NameError')
    ).length === 0;

  return {
    syntaxValid,
    importsValid,
    errors: confirmedErrors,
    warnings: possibleIssues,
    confirmedErrors,
    possibleIssues,
    contextChecks,
    isIncompleteContext: manifest.isIncompleteContext,
    contextCompletenessNote: manifest.contextCompletenessNote,
    classifiedImports,
  };
}

/**
 * Validates that all proposed patches target real uploaded files in the repository,
 * apply cleanly without hunk conflicts, and pass language syntax & import checks.
 * Does NOT reject valid patches because an unrelated dependency file is absent.
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
  const uploadedFiles = originalFiles.filter(
    (f) => !isExcludedRepositoryDirectory(f.path).excluded
  );
  const manifest = buildNormalizedProjectManifest(uploadedFiles);

  const fileMap = new Map<string, RepoFile>();
  for (const f of uploadedFiles) {
    fileMap.set(f.path, f);
    const norm = f.path
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
      .replace(/^\/+/, '');
    fileMap.set(norm, f);
  }

  const changes: FilePatchChange[] = [];
  const diagnostics: PatchValidationDiagnostic[] = [];
  const rawGlobalErrors: string[] = [];

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

    const normTarget = item.file_path
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
      .replace(/^\/+/, '');
    const existingFile =
      fileMap.get(item.file_path) || fileMap.get(normTarget);

    if (!existingFile) {
      const errMsg = `Invalid patch target "${item.file_path}": file does not exist in the repository. Inventing file paths is prohibited.`;
      rawGlobalErrors.push(errMsg);
      diagnostics.push({
        filePath: item.file_path,
        valid: false,
        appliesCleanly: false,
        syntaxValid: false,
        importsValid: false,
        errors: [errMsg],
        warnings: [],
        confirmedErrors: [errMsg],
        possibleIssues: [],
        contextChecks: [],
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

    // Ensure the proposed patch actually has valid applicable content
    if (appliesCleanly && !patchedContent.trim()) {
      appliesCleanly = false;
      fileErrors.push(
        `Patch for "${item.file_path}" resulted in empty file content.`
      );
    }

    candidateContents.set(existingFile.path, patchedContent);
    perFileResults.push({
      item,
      existingFile,
      patchedContent,
      appliesCleanly,
      fileErrors,
    });
  }

  const simulatedRepo = uploadedFiles.map((f) =>
    candidateContents.has(f.path)
      ? { ...f, content: candidateContents.get(f.path)! }
      : f
  );

  for (const entry of perFileResults) {
    // Check baseline original file so pre-existing unresolved imports in an uploaded file
    // do not cause a valid bug-fix patch to be rejected when a dependency file is absent.
    const baselineCheck = checkPythonSyntaxAndImports(
      entry.existingFile.path,
      entry.existingFile.content,
      uploadedFiles,
      manifest
    );
    const baselineImportErrors = new Set(
      baselineCheck.confirmedErrors.filter(
        (e) => e.includes('ImportError') || e.includes('NameError')
      )
    );

    const staticCheck = checkPythonSyntaxAndImports(
      entry.existingFile.path,
      entry.patchedContent,
      simulatedRepo,
      manifest
    );

    const blockingStaticErrors: string[] = [];
    const nonBlockingWarnings: string[] = [...staticCheck.possibleIssues];
    const contextChecks: string[] = [...staticCheck.contextChecks];

    for (const err of staticCheck.confirmedErrors) {
      const isImportError =
        err.includes('ImportError') || err.includes('NameError');
      if (isImportError && baselineImportErrors.has(err)) {
        // Pre-existing unresolved import in the uploaded file — record as context check, do not reject patch
        contextChecks.push(
          `Pre-existing import notice: ${err} (present in original upload because target dependency file is absent).`
        );
      } else {
        blockingStaticErrors.push(err);
      }
    }

    const deduplicatedFileErrors = deduplicateValidationMessages([
      ...entry.fileErrors,
      ...blockingStaticErrors,
    ]);
    const deduplicatedWarnings =
      deduplicateValidationMessages(nonBlockingWarnings);
    const deduplicatedContextChecks =
      deduplicateValidationMessages(contextChecks);

    const effectiveImportsValid =
      blockingStaticErrors.filter(
        (e) => e.includes('ImportError') || e.includes('NameError')
      ).length === 0;

    const isFileValid =
      entry.appliesCleanly &&
      staticCheck.syntaxValid &&
      effectiveImportsValid;

    diagnostics.push({
      filePath: entry.existingFile.path,
      valid: isFileValid,
      appliesCleanly: entry.appliesCleanly,
      syntaxValid: staticCheck.syntaxValid,
      importsValid: effectiveImportsValid,
      errors: deduplicatedFileErrors,
      warnings: deduplicatedWarnings,
      confirmedErrors: deduplicatedFileErrors,
      possibleIssues: deduplicatedWarnings,
      contextChecks: deduplicatedContextChecks,
    });

    if (!isFileValid) {
      rawGlobalErrors.push(...deduplicatedFileErrors);
    }

    changes.push({
      filePath: entry.existingFile.path,
      explanation:
        entry.item.explanation || `Updated ${entry.existingFile.path}`,
      originalContent: entry.existingFile.content,
      proposedContent: entry.patchedContent,
    });
  }

  const finalErrors = deduplicateValidationMessages(rawGlobalErrors);

  return {
    allValid: finalErrors.length === 0,
    changes,
    diagnostics,
    errors: finalErrors,
  };
}


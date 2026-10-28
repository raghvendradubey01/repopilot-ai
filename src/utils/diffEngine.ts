import type { DiffLine, FileDiffResult, FilePatchChange, RepoFile } from '../types/repopilot';
import { inferLanguage, isPythonTestFile, redactSecrets } from './securityValidator';

/**
 * Computes a line-by-line LCS (Longest Common Subsequence) diff between two strings.
 */
export function computeLineDiff(originalText: string, proposedText: string): DiffLine[] {
  const oldLines = originalText.replace(/\r\n/g, '\n').split('\n');
  const newLines = proposedText.replace(/\r\n/g, '\n').split('\n');

  const m = oldLines.length;
  const n = newLines.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let oldLineNum = 1;
  let newLineNum = 1;

  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      result.push({
        type: 'context',
        oldLineNumber: oldLineNum++,
        newLineNumber: newLineNum++,
        content: oldLines[i],
      });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({
        type: 'remove',
        oldLineNumber: oldLineNum++,
        newLineNumber: null,
        content: oldLines[i],
      });
      i++;
    } else {
      result.push({
        type: 'add',
        oldLineNumber: null,
        newLineNumber: newLineNum++,
        content: newLines[j],
      });
      j++;
    }
  }

  while (i < m) {
    result.push({
      type: 'remove',
      oldLineNumber: oldLineNum++,
      newLineNumber: null,
      content: oldLines[i++],
    });
  }

  while (j < n) {
    result.push({
      type: 'add',
      oldLineNumber: null,
      newLineNumber: newLineNum++,
      content: newLines[j++],
    });
  }

  return result;
}

export function buildFileDiffResult(change: FilePatchChange): FileDiffResult {
  const lines = computeLineDiff(change.originalContent, change.proposedContent);
  let addedCount = 0;
  let removedCount = 0;

  const unifiedBodyLines: string[] = [];
  for (const line of lines) {
    if (line.type === 'add') {
      addedCount++;
      unifiedBodyLines.push(`+${line.content}`);
    } else if (line.type === 'remove') {
      removedCount++;
      unifiedBodyLines.push(`-${line.content}`);
    } else {
      unifiedBodyLines.push(` ${line.content}`);
    }
  }

  const oldLineCount = change.originalContent ? change.originalContent.split('\n').length : 0;
  const newLineCount = change.proposedContent ? change.proposedContent.split('\n').length : 0;

  const unifiedDiff = [
    `--- a/${change.filePath}`,
    `+++ b/${change.filePath}`,
    `@@ -1,${oldLineCount} +1,${newLineCount} @@`,
    ...unifiedBodyLines,
  ].join('\n');

  return {
    filePath: change.filePath,
    explanation: change.explanation,
    addedCount,
    removedCount,
    lines,
    unifiedDiff: redactSecrets(unifiedDiff),
  };
}

export function buildCombinedUnifiedPatch(diffs: FileDiffResult[]): string {
  return redactSecrets(diffs.map((d) => d.unifiedDiff).join('\n\n') + '\n');
}

/**
 * Applies approved patch changes to a cloned copy of the repository files.
 * Never mutates the input `originalFiles` array or its elements in-place.
 */
export function applyApprovedPatchImmutably(
  originalFiles: readonly RepoFile[],
  changes: readonly FilePatchChange[]
): RepoFile[] {
  const clonedMap = new Map<string, RepoFile>();
  for (const file of originalFiles) {
    clonedMap.set(file.path, { ...file });
  }

  for (const change of changes) {
    const safeContent = redactSecrets(change.proposedContent);
    const sizeBytes = new TextEncoder().encode(safeContent).length;
    const existing = clonedMap.get(change.filePath);

    if (existing) {
      clonedMap.set(change.filePath, {
        ...existing,
        content: safeContent,
        sizeBytes,
      });
    } else {
      clonedMap.set(change.filePath, {
        path: change.filePath,
        content: safeContent,
        sizeBytes,
        language: inferLanguage(change.filePath),
        isTestFile: isPythonTestFile(change.filePath),
      });
    }
  }

  return Array.from(clonedMap.values()).sort((a, b) => a.path.localeCompare(b.path));
}

import * as vscode from 'vscode';
import path from 'path';
import {
  buildNestedDirectoryTree,
  isPathInsideWorkspace,
  MAX_WORKSPACE_FILE_BYTES,
  redactWorkspaceSecrets,
  shouldExcludeFromWorkspaceIndex,
  type WorkspaceTreeDirectoryNode,
  type WorkspaceTreeFileNode,
} from '../core/workspaceSafety';

export type ExtensionErrorCode =
  | 'MISSING_WORKSPACE'
  | 'MISSING_CREDENTIALS'
  | 'UNSUPPORTED_FILE'
  | 'API_ERROR'
  | 'VALIDATION_ERROR';

export class RepoPilotExtensionError extends Error {
  public readonly code: ExtensionErrorCode;

  constructor(code: ExtensionErrorCode, message: string) {
    super(message);
    this.name = 'RepoPilotExtensionError';
    this.code = code;
  }
}

export interface WorkspaceFileEntry {
  path: string;
  content: string;
  sizeBytes: number;
  language: string;
  isTestFile: boolean;
}

export interface WorkspaceDiagnosticItem {
  filePath: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'information';
  message: string;
  source?: string;
  code?: string | number;
}

export interface WorkspaceSearchMatch {
  filePath: string;
  lineNumber: number;
  linePreview: string;
}

export interface WorkspaceFilenameMatch {
  filePath: string;
  language: string;
  sizeBytes: number;
  isTestFile: boolean;
}

export interface DetectedWorkspaceToolchain {
  workspaceRoot: string;
  workspaceName: string;
  primaryLanguage: string;
  detectedLanguages: string[];
  packageManager: string;
  testRunnerCommand: string;
  manifestFiles: string[];
}

const EXCLUDE_GLOB =
  '{**/node_modules/**,**/.git/**,**/.venv/**,**/venv/**,**/__pycache__/**,**/dist/**,**/build/**,**/out/**,**/target/**,**/.next/**,**/.env*}';

export function inferLanguageFromPath(relativePath: string): string {
  const lower = relativePath.toLowerCase();
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'typescript';
  if (lower.endsWith('.js') || lower.endsWith('.jsx') || lower.endsWith('.mjs'))
    return 'javascript';
  if (lower.endsWith('.rs')) return 'rust';
  if (lower.endsWith('.go')) return 'go';
  if (lower.endsWith('.java')) return 'java';
  if (lower.endsWith('.c') || lower.endsWith('.h')) return 'c';
  if (lower.endsWith('.cpp') || lower.endsWith('.hpp') || lower.endsWith('.cc'))
    return 'cpp';
  if (lower.endsWith('.cs')) return 'csharp';
  if (lower.endsWith('.rb')) return 'ruby';
  if (lower.endsWith('.php')) return 'php';
  if (lower.endsWith('.swift')) return 'swift';
  if (lower.endsWith('.kt')) return 'kotlin';
  if (lower.endsWith('.sql')) return 'sql';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml';
  if (lower.endsWith('.toml')) return 'toml';
  if (lower.endsWith('.md')) return 'markdown';
  if (lower.endsWith('.html') || lower.endsWith('.css')) return 'web';
  return 'text';
}

function isTestFilePath(relativePath: string): boolean {
  const lower = relativePath.toLowerCase();
  return (
    lower.includes('test_') ||
    lower.includes('_test.') ||
    lower.includes('.test.') ||
    lower.includes('.spec.') ||
    lower.startsWith('tests/') ||
    lower.includes('/tests/') ||
    lower.includes('/__tests__/')
  );
}

/**
 * Returns the active VS Code workspace folder root path using `vscode.workspace.workspaceFolders`,
 * or throws a typed `MISSING_WORKSPACE` error if no folder is open.
 */
export function getActiveWorkspaceRoot(): string {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    throw new RepoPilotExtensionError(
      'MISSING_WORKSPACE',
      'No folder is currently open in VS Code. Use File -> Open Folder... (Ctrl+K Ctrl+O on Windows) to open a project folder.'
    );
  }
  return folders[0].uri.fsPath;
}

export type WorkspaceTreeNode =
  | WorkspaceTreeDirectoryNode
  | WorkspaceTreeFileNode;

/**
 * File Listing Tool: Lists and reads safe source files in the active VS Code workspace,
 * automatically excluding .git, node_modules, virtualenvs, build outputs, secrets, and binary/oversized files.
 */
export async function listAndReadWorkspaceFiles(
  maxFiles = 80
): Promise<{
  workspaceRoot: string;
  files: WorkspaceFileEntry[];
  directoryTree: WorkspaceTreeNode[];
  excludedCount: number;
}> {
  const workspaceRoot = getActiveWorkspaceRoot();
  const uris = await vscode.workspace.findFiles(
    '**/*',
    EXCLUDE_GLOB,
    maxFiles * 2
  );

  const files: WorkspaceFileEntry[] = [];
  let excludedCount = 0;

  for (const uri of uris) {
    if (files.length >= maxFiles) break;

    const check = isPathInsideWorkspace(workspaceRoot, uri.fsPath);
    if (!check.allowed) {
      excludedCount++;
      continue;
    }

    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.type !== vscode.FileType.File) continue;

      const preFilter = shouldExcludeFromWorkspaceIndex(
        check.relativePath,
        stat.size
      );
      if (preFilter.excluded) {
        excludedCount++;
        continue;
      }

      const rawBytes = await vscode.workspace.fs.readFile(uri);
      const content = Buffer.from(rawBytes).toString('utf-8');

      const contentFilter = shouldExcludeFromWorkspaceIndex(
        check.relativePath,
        rawBytes.byteLength,
        content
      );
      if (contentFilter.excluded) {
        excludedCount++;
        continue;
      }

      files.push({
        path: check.relativePath,
        content: redactWorkspaceSecrets(content),
        sizeBytes: rawBytes.byteLength,
        language: inferLanguageFromPath(check.relativePath),
        isTestFile: isTestFilePath(check.relativePath),
      });
    } catch {
      excludedCount++;
    }
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  const rootTree = buildNestedDirectoryTree(files);

  return {
    workspaceRoot,
    files,
    directoryTree: rootTree.children,
    excludedCount,
  };
}

/**
 * File Reading Tool: Safely reads a single file inside the active VS Code workspace.
 * Enforces workspace root containment and rejects binary, oversized, or secret files with `UNSUPPORTED_FILE`.
 */
export async function readWorkspaceFile(
  relativePath: string
): Promise<WorkspaceFileEntry> {
  const workspaceRoot = getActiveWorkspaceRoot();
  const check = isPathInsideWorkspace(workspaceRoot, relativePath);
  if (!check.allowed) {
    throw new RepoPilotExtensionError(
      'VALIDATION_ERROR',
      check.reason || 'Access outside the active workspace root is denied.'
    );
  }

  const preExclusion = shouldExcludeFromWorkspaceIndex(check.relativePath, 0);
  if (preExclusion.excluded) {
    throw new RepoPilotExtensionError(
      'UNSUPPORTED_FILE',
      `File "${check.relativePath}" cannot be inspected (${preExclusion.reason}: ${preExclusion.detail}).`
    );
  }

  const uri = vscode.Uri.file(check.resolvedPath);
  let rawBytes: Uint8Array;
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    if (stat.type !== vscode.FileType.File) {
      throw new RepoPilotExtensionError(
        'UNSUPPORTED_FILE',
        `Path "${check.relativePath}" is not a regular file.`
      );
    }
    if (stat.size > MAX_WORKSPACE_FILE_BYTES) {
      throw new RepoPilotExtensionError(
        'UNSUPPORTED_FILE',
        `File "${check.relativePath}" (${Math.round(stat.size / 1024)} KB) exceeds the 256 KB limit.`
      );
    }
    rawBytes = await vscode.workspace.fs.readFile(uri);
  } catch (err) {
    if (err instanceof RepoPilotExtensionError) throw err;
    throw new RepoPilotExtensionError(
      'UNSUPPORTED_FILE',
      `Unable to read file "${check.relativePath}". Verify that the file exists in the open workspace.`
    );
  }

  const content = Buffer.from(rawBytes).toString('utf-8');
  const exclusion = shouldExcludeFromWorkspaceIndex(
    check.relativePath,
    rawBytes.byteLength,
    content
  );
  if (exclusion.excluded) {
    throw new RepoPilotExtensionError(
      'UNSUPPORTED_FILE',
      `File "${check.relativePath}" is excluded from AI inspection (${exclusion.reason}: ${exclusion.detail}).`
    );
  }

  return {
    path: check.relativePath,
    content: redactWorkspaceSecrets(content),
    sizeBytes: rawBytes.byteLength,
    language: inferLanguageFromPath(check.relativePath),
    isTestFile: isTestFilePath(check.relativePath),
  };
}

/**
 * Filename Search Tool: Searches filenames and relative paths across the open workspace.
 */
export async function searchWorkspaceFilenames(
  query: string,
  maxResults = 40
): Promise<WorkspaceFilenameMatch[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const { files } = await listAndReadWorkspaceFiles(100);
  const matches: WorkspaceFilenameMatch[] = [];

  for (const file of files) {
    if (file.path.toLowerCase().includes(q)) {
      matches.push({
        filePath: file.path,
        language: file.language,
        sizeBytes: file.sizeBytes,
        isTestFile: file.isTestFile,
      });
      if (matches.length >= maxResults) break;
    }
  }

  return matches;
}

/**
 * Text Search Tool: Searches text content across safe workspace files.
 */
export async function searchWorkspaceCode(
  query: string,
  maxResults = 40
): Promise<WorkspaceSearchMatch[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const { files } = await listAndReadWorkspaceFiles(80);
  const matches: WorkspaceSearchMatch[] = [];

  for (const file of files) {
    const lines = file.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(q)) {
        matches.push({
          filePath: file.path,
          lineNumber: i + 1,
          linePreview: lines[i].trim().slice(0, 120),
        });
        if (matches.length >= maxResults) {
          return matches;
        }
      }
    }
  }

  return matches;
}

/**
 * Inspects and validates the currently active file in the VS Code editor.
 */
export async function getValidatedActiveEditorFile(): Promise<WorkspaceFileEntry> {
  const workspaceRoot = getActiveWorkspaceRoot();
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    throw new RepoPilotExtensionError(
      'UNSUPPORTED_FILE',
      'No active text editor is open. Open a source file in the VS Code editor first.'
    );
  }

  if (editor.document.uri.scheme !== 'file') {
    throw new RepoPilotExtensionError(
      'UNSUPPORTED_FILE',
      `Active document (${editor.document.uri.scheme}://) is not a local workspace file.`
    );
  }

  const check = isPathInsideWorkspace(workspaceRoot, editor.document.uri.fsPath);
  if (!check.allowed) {
    throw new RepoPilotExtensionError(
      'VALIDATION_ERROR',
      check.reason || 'The active file is outside the currently open workspace folder.'
    );
  }

  return readWorkspaceFile(check.relativePath);
}

/**
 * Collects live compiler, linter, and language server diagnostics from VS Code (`vscode.languages.getDiagnostics()`).
 */
export function getWorkspaceDiagnostics(): WorkspaceDiagnosticItem[] {
  const workspaceRoot = getActiveWorkspaceRoot();
  const allDiagnostics = vscode.languages.getDiagnostics();
  const results: WorkspaceDiagnosticItem[] = [];

  for (const [uri, diags] of allDiagnostics) {
    if (uri.scheme !== 'file') continue;
    const check = isPathInsideWorkspace(workspaceRoot, uri.fsPath);
    if (!check.allowed) continue;

    for (const d of diags) {
      if (
        d.severity !== vscode.DiagnosticSeverity.Error &&
        d.severity !== vscode.DiagnosticSeverity.Warning
      ) {
        continue;
      }

      results.push({
        filePath: check.relativePath,
        line: d.range.start.line + 1,
        column: d.range.start.character + 1,
        severity:
          d.severity === vscode.DiagnosticSeverity.Error ? 'error' : 'warning',
        message: redactWorkspaceSecrets(d.message),
        source: d.source,
        code:
          typeof d.code === 'object' && d.code !== null
            ? String(d.code.value)
            : d.code,
      });
    }
  }

  return results;
}

/**
 * Inspects project manifests in the open VS Code workspace to detect languages, package managers, and test runners.
 */
export function detectWorkspaceToolchainFromFiles(
  workspaceRoot: string,
  files: WorkspaceFileEntry[]
): DetectedWorkspaceToolchain {
  const paths = new Set(files.map((f) => f.path));
  const manifestFiles = files
    .map((f) => f.path)
    .filter((p) =>
      /^(package\.json|tsconfig\.json|pyproject\.toml|pytest\.ini|requirements\.txt|Cargo\.toml|go\.mod|pom\.xml|build\.gradle|Makefile)$/i.test(
        path.basename(p)
      )
    );

  const languages = Array.from(
    new Set(
      files
        .map((f) => f.language)
        .filter((l) => l !== 'text' && l !== 'markdown')
    )
  );

  if (paths.has('Cargo.toml')) {
    return {
      workspaceRoot,
      workspaceName: path.basename(workspaceRoot),
      primaryLanguage: 'Rust',
      detectedLanguages: languages.length ? languages : ['rust'],
      packageManager: 'cargo',
      testRunnerCommand: 'cargo test',
      manifestFiles,
    };
  }

  if (paths.has('go.mod')) {
    return {
      workspaceRoot,
      workspaceName: path.basename(workspaceRoot),
      primaryLanguage: 'Go',
      detectedLanguages: languages.length ? languages : ['go'],
      packageManager: 'go mod',
      testRunnerCommand: 'go test ./...',
      manifestFiles,
    };
  }

  if (paths.has('package.json')) {
    const pkgFile = files.find((f) => f.path === 'package.json');
    let testCmd = 'npm test';
    if (pkgFile?.content.includes('tsx --test')) {
      testCmd = 'npx tsx --test';
    } else if (pkgFile?.content.includes('vitest')) {
      testCmd = 'npx vitest run';
    }
    return {
      workspaceRoot,
      workspaceName: path.basename(workspaceRoot),
      primaryLanguage: paths.has('tsconfig.json') ? 'TypeScript' : 'JavaScript',
      detectedLanguages: languages.length ? languages : ['typescript'],
      packageManager: 'npm',
      testRunnerCommand: testCmd,
      manifestFiles,
    };
  }

  return {
    workspaceRoot,
    workspaceName: path.basename(workspaceRoot),
    primaryLanguage: 'Python',
    detectedLanguages: languages.length ? languages : ['python'],
    packageManager: paths.has('pyproject.toml') ? 'pyproject / pip' : 'pip',
    testRunnerCommand: 'pytest -q',
    manifestFiles,
  };
}

/**
 * VS Code Native TreeDataProvider for browsing nested workspace directories and multiple file types
 * inside the RepoPilot AI Activity Bar container.
 */
export class RepoPilotWorkspaceTreeProvider
  implements vscode.TreeDataProvider<WorkspaceTreeNode>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    WorkspaceTreeNode | undefined | null | void
  >();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private cachedRootNodes: WorkspaceTreeNode[] = [];

  public refresh(nodes?: WorkspaceTreeNode[]): void {
    if (nodes) {
      this.cachedRootNodes = nodes;
    }
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: WorkspaceTreeNode): vscode.TreeItem {
    const collapsibleState =
      element.type === 'directory'
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;

    const item = new vscode.TreeItem(element.name, collapsibleState);
    item.id = element.relativePath;
    item.tooltip =
      element.type === 'file'
        ? `${element.relativePath} (${element.language}, ${element.sizeBytes} bytes)`
        : element.relativePath;
    item.description = element.type === 'file' ? element.language : undefined;

    if (element.type === 'file') {
      item.command = {
        command: 'repopilot.openWorkspaceFile',
        title: 'Inspect File in RepoPilot AI',
        arguments: [element.relativePath],
      };
    }

    return item;
  }

  public async getChildren(
    element?: WorkspaceTreeNode
  ): Promise<WorkspaceTreeNode[]> {
    if (element) {
      return element.type === 'directory' ? element.children : [];
    }
    try {
      if (this.cachedRootNodes.length > 0) {
        return this.cachedRootNodes;
      }
      const { directoryTree } = await listAndReadWorkspaceFiles();
      this.cachedRootNodes = directoryTree;
      return directoryTree;
    } catch {
      return [];
    }
  }
}

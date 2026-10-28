import * as vscode from 'vscode';
import { validateWebviewInboundMessage } from '../core/workspaceSafety';
import {
  detectWorkspaceToolchainFromFiles,
  type ExtensionErrorCode,
  getActiveWorkspaceRoot,
  getValidatedActiveEditorFile,
  getWorkspaceDiagnostics,
  listAndReadWorkspaceFiles,
  readWorkspaceFile,
  RepoPilotExtensionError,
  type RepoPilotWorkspaceTreeProvider,
  searchWorkspaceCode,
  searchWorkspaceFilenames,
} from '../tools/workspaceTools';
import {
  type ActiveEditorSelectionContext,
  runWorkspaceAgentTurn,
} from '../providers/aiClient';

export class RepoPilotChatSidebarProvider
  implements vscode.WebviewViewProvider
{
  public static readonly viewType = 'repopilot.chatView';
  private _view?: vscode.WebviewView;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly treeProvider: RepoPilotWorkspaceTreeProvider
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView
  ): void | Promise<void> {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = this.getHtmlForWebview();

    webviewView.webview.onDidReceiveMessage(async (rawMessage: unknown) => {
      try {
        let workspaceRoot = '';
        try {
          workspaceRoot = getActiveWorkspaceRoot();
        } catch {
          workspaceRoot = '/__missing_workspace__';
        }

        const validation = validateWebviewInboundMessage(
          rawMessage,
          workspaceRoot
        );
        if (!validation.valid || !validation.message) {
          throw new RepoPilotExtensionError(
            'VALIDATION_ERROR',
            validation.errorMessage || 'Invalid message received from webview.'
          );
        }

        const msg = validation.message;

        switch (msg.type) {
          case 'inspectWorkspace':
            await this.handleInspectWorkspace();
            break;

          case 'analyzeActiveFile':
            await this.handleAnalyzeActiveFile(msg.customPrompt);
            break;

          case 'submitTask':
            await this.handleRunAgentTask(msg.prompt, 'custom');
            break;

          case 'readFile': {
            this.postLoading(`Reading ${msg.relativePath}...`);
            const entry = await readWorkspaceFile(msg.relativePath);
            this.postMessage({
              type: 'fileContent',
              file: entry,
            });
            break;
          }

          case 'searchFilenames': {
            this.postLoading(`Searching filenames for "${msg.query}"...`);
            const matches = await searchWorkspaceFilenames(msg.query);
            this.postMessage({
              type: 'filenameSearchResults',
              query: msg.query,
              matches,
            });
            break;
          }

          case 'searchText': {
            this.postLoading(`Searching workspace text for "${msg.query}"...`);
            const matches = await searchWorkspaceCode(msg.query);
            this.postMessage({
              type: 'textSearchResults',
              query: msg.query,
              matches,
            });
            break;
          }

          case 'configureApiKey':
            await vscode.commands.executeCommand('repopilot.configureApiKey');
            break;
        }
      } catch (err) {
        this.postStructuredError(err);
      }
    });

    // Perform initial workspace inspection on open
    void this.handleInspectWorkspace();
  }

  public postMessage(message: unknown): void {
    void this._view?.webview.postMessage(message);
  }

  private postLoading(label: string): void {
    this.postMessage({
      type: 'loading',
      active: true,
      label,
    });
  }

  private postStructuredError(err: unknown): void {
    if (err instanceof RepoPilotExtensionError) {
      this.postMessage({
        type: 'error',
        code: err.code,
        message: err.message,
      });
      return;
    }

    const message = err instanceof Error ? err.message : String(err);
    let code: ExtensionErrorCode = 'API_ERROR';
    if (/no folder is currently open/i.test(message)) {
      code = 'MISSING_WORKSPACE';
    } else if (/api key|credential|secret/i.test(message)) {
      code = 'MISSING_CREDENTIALS';
    } else if (/excluded|exceeds|binary|unsupported/i.test(message)) {
      code = 'UNSUPPORTED_FILE';
    }

    this.postMessage({
      type: 'error',
      code,
      message,
    });
  }

  private getActiveSelection(): ActiveEditorSelectionContext | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return null;
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return null;

    const relPath = vscode.workspace.asRelativePath(editor.document.uri, false);
    const hasSelection = !editor.selection.isEmpty;
    const fullText = editor.document.getText();
    return {
      filePath: relPath,
      language: editor.document.languageId,
      startLine: hasSelection ? editor.selection.start.line + 1 : 1,
      endLine: hasSelection
        ? editor.selection.end.line + 1
        : Math.min(fullText.split('\n').length, 120),
      selectedText: hasSelection
        ? editor.document.getText(editor.selection)
        : fullText.slice(0, 4000),
    };
  }

  public async handleInspectWorkspace(): Promise<void> {
    this.postLoading('Inspecting open VS Code workspace...');
    try {
      const { workspaceRoot, files, directoryTree, excludedCount } =
        await listAndReadWorkspaceFiles();
      this.treeProvider.refresh(directoryTree);
      const toolchain = detectWorkspaceToolchainFromFiles(workspaceRoot, files);
      const diagnostics = getWorkspaceDiagnostics();
      this.postMessage({
        type: 'workspaceSnapshot',
        toolchain,
        fileCount: files.length,
        excludedCount,
        directoryTree,
        files: files.map((f) => ({
          path: f.path,
          language: f.language,
          sizeBytes: f.sizeBytes,
          isTestFile: f.isTestFile,
        })),
        diagnostics,
        selection: this.getActiveSelection(),
      });
    } catch (err) {
      this.treeProvider.refresh([]);
      this.postStructuredError(err);
    }
  }

  public async handleInspectFileInSidebar(relativePath: string): Promise<void> {
    try {
      this.postLoading(`Reading ${relativePath}...`);
      const file = await readWorkspaceFile(relativePath);
      this.postMessage({
        type: 'fileContent',
        file,
      });
    } catch (err) {
      this.postStructuredError(err);
    }
  }

  public async handleAnalyzeActiveFile(customPrompt?: string): Promise<void> {
    this.postLoading('Validating and analyzing active editor file...');
    try {
      const activeFile = await getValidatedActiveEditorFile();
      const prompt =
        customPrompt?.trim() ||
        `Analyze the active file "${activeFile.path}", explain its responsibilities, identify any bugs or edge cases, and propose a read-only patch preview if improvements are needed.`;

      await this.handleRunAgentTask(prompt, 'explain-code', activeFile);
    } catch (err) {
      this.postStructuredError(err);
    }
  }

  public async handleRunAgentTask(
    prompt: string,
    actionType = 'custom',
    forcedActiveFile?: {
      path: string;
      language: string;
      content: string;
    }
  ): Promise<void> {
    this.postLoading(
      'Selecting relevant workspace files and running AI analysis...'
    );
    try {
      const { workspaceRoot, files } = await listAndReadWorkspaceFiles();
      const diagnostics = getWorkspaceDiagnostics();
      const selection: ActiveEditorSelectionContext | null = forcedActiveFile
        ? {
            filePath: forcedActiveFile.path,
            language: forcedActiveFile.language,
            startLine: 1,
            endLine: forcedActiveFile.content.split('\n').length,
            selectedText: forcedActiveFile.content.slice(0, 6000),
          }
        : this.getActiveSelection();

      const turnResult = await runWorkspaceAgentTurn({
        context: this.context,
        workspaceRoot,
        allFiles: files,
        diagnostics,
        selection,
        taskPrompt: prompt,
        actionType,
      });

      this.postMessage({
        type: 'agentResponse',
        turnResult,
      });
    } catch (err) {
      this.postStructuredError(err);
    }
  }

  private getHtmlForWebview(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>RepoPilot AI — Phase 1 Workspace Inspector &amp; Analyzer</title>
  <style>
    body {
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      font-size: 12px;
      color: var(--vscode-foreground, #e2e8f0);
      background: var(--vscode-sideBar-background, #0B0F17);
      margin: 0;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .card {
      border: 1px solid var(--vscode-panel-border, #1e293b);
      border-radius: 6px;
      padding: 8px 10px;
      background: #0E131F;
    }
    .phase-banner {
      border: 1px solid rgba(56, 189, 248, 0.35);
      background: rgba(12, 74, 110, 0.25);
      border-radius: 6px;
      padding: 8px;
      font-size: 11px;
      line-height: 1.4;
    }
    .status-banner {
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 11px;
      line-height: 1.4;
      display: none;
    }
    .status-loading {
      display: block;
      border: 1px solid rgba(56, 189, 248, 0.5);
      background: rgba(2, 132, 199, 0.18);
      color: #bae6fd;
    }
    .status-error {
      display: block;
      border: 1px solid rgba(244, 63, 94, 0.6);
      background: rgba(136, 19, 55, 0.3);
      color: #fecdd3;
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      flex-wrap: wrap;
    }
    button {
      background: #0284c7;
      color: #fff;
      border: none;
      border-radius: 4px;
      padding: 5px 8px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }
    button.secondary {
      background: #1e293b;
      color: #e2e8f0;
      border: 1px solid #334155;
    }
    textarea, input {
      width: 100%;
      box-sizing: border-box;
      background: #080B11;
      color: #f1f5f9;
      border: 1px solid #334155;
      border-radius: 4px;
      padding: 6px;
      font-family: inherit;
      font-size: 12px;
    }
    pre {
      background: #05070B;
      padding: 6px;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 11px;
      white-space: pre-wrap;
      margin: 6px 0 0 0;
    }
    .tree-list {
      max-height: 165px;
      overflow-y: auto;
      margin-top: 6px;
      font-family: monospace;
      font-size: 11px;
    }
    .tree-item {
      padding: 2px 4px;
      cursor: pointer;
      border-radius: 3px;
      display: flex;
      justify-content: space-between;
    }
    .tree-item:hover {
      background: rgba(56, 189, 248, 0.15);
    }
    .badge {
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 3px;
      background: #1e293b;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="phase-banner" id="privacyBanner">
    <strong>Phase 1 — Workspace Inspection &amp; AI Analysis (Read-Only):</strong>
    Detects your open VS Code folder via <code>workspace.workspaceFolders</code>, excludes <code>.git</code>, <code>node_modules</code>, virtualenvs, secrets, and binary/oversized files, and sends only relevant files to your configured provider. Automated file edits and terminal execution are not enabled in Phase 1.
  </div>

  <div id="statusBox" class="status-banner"></div>

  <div class="card" id="workspaceCard">
    <div class="row">
      <strong id="wsName">Inspecting Workspace...</strong>
      <div class="row">
        <button class="secondary" id="refreshBtn" title="Inspect Workspace">Inspect</button>
        <button class="secondary" id="analyzeActiveBtn" title="Analyze Active Editor File">Analyze Active File</button>
        <button class="secondary" id="keyBtn" title="Configure Provider API Key in VS Code SecretStorage">API Key</button>
      </div>
    </div>
    <div id="wsMeta" style="margin-top:4px;color:#94a3b8;font-family:monospace;font-size:11px;"></div>
    <div class="tree-list" id="treeContainer"></div>
  </div>

  <div class="card">
    <label style="font-weight:600;display:block;margin-bottom:4px;">Workspace Search (Filename &amp; Text)</label>
    <input id="searchInput" type="text" placeholder="Search filenames or code text across workspace..." />
    <div class="row" style="margin-top:6px;">
      <button class="secondary" id="searchFilesBtn">Filename Search</button>
      <button class="secondary" id="searchTextBtn">Text Search</button>
    </div>
  </div>

  <div class="card">
    <label for="taskInput" style="font-weight:600;display:block;margin-bottom:4px;">AI Task / Bug Analysis</label>
    <textarea id="taskInput" rows="3" placeholder="Describe a bug or task to analyze relevant workspace files..."></textarea>
    <div class="row" style="margin-top:6px;">
      <button id="sendBtn">Analyze Task</button>
      <button class="secondary" id="fixBugBtn">Diagnose Bug</button>
      <button class="secondary" id="explainBtn">Explain Active File</button>
    </div>
  </div>

  <div id="outputContainer" style="display:flex;flex-direction:column;gap:8px;"></div>

  <script>
    const vscode = acquireVsCodeApi();
    const out = document.getElementById('outputContainer');
    const statusBox = document.getElementById('statusBox');
    const treeContainer = document.getElementById('treeContainer');

    function showLoading(label) {
      statusBox.className = 'status-banner status-loading';
      statusBox.textContent = '⏳ ' + label;
    }

    function clearStatus() {
      statusBox.className = 'status-banner';
      statusBox.textContent = '';
    }

    function showError(code, message) {
      statusBox.className = 'status-banner status-error';
      const labels = {
        MISSING_WORKSPACE: 'Missing Workspace Folder',
        MISSING_CREDENTIALS: 'Missing Provider Credentials',
        UNSUPPORTED_FILE: 'Unsupported or Excluded File',
        API_ERROR: 'AI Provider / Backend Error',
        VALIDATION_ERROR: 'Security Validation Blocked Request'
      };
      const title = labels[code] || 'Error';
      statusBox.innerHTML = '<strong>[' + title + ']</strong> ' + escapeHtml(message);
    }

    function escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    function renderNestedTree(nodes, depth) {
      let html = '';
      for (const node of nodes || []) {
        const indent = '&nbsp;'.repeat(depth * 3);
        if (node.type === 'directory') {
          html += '<div style="color:#38bdf8;padding:2px 4px;">' + indent + '📁 ' + escapeHtml(node.name) + '/</div>';
          if (node.children && node.children.length) {
            html += renderNestedTree(node.children, depth + 1);
          }
        } else {
          const filePath = node.relativePath || node.path || '';
          html += '<div class="tree-item" data-path="' + escapeHtml(filePath) + '">' +
            '<span>' + indent + '📄 ' + escapeHtml(node.name) + '</span>' +
            '<span class="badge">' + escapeHtml(node.language || 'text') + '</span>' +
          '</div>';
        }
      }
      return html;
    }

    treeContainer.addEventListener('click', (e) => {
      const row = e.target.closest('.tree-item');
      if (row && row.dataset.path) {
        vscode.postMessage({ type: 'readFile', relativePath: row.dataset.path });
      }
    });

    document.getElementById('refreshBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'inspectWorkspace' });
    });
    document.getElementById('analyzeActiveBtn').addEventListener('click', () => {
      const customPrompt = document.getElementById('taskInput').value.trim();
      vscode.postMessage({ type: 'analyzeActiveFile', customPrompt });
    });
    document.getElementById('keyBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'configureApiKey' });
    });
    document.getElementById('searchFilesBtn').addEventListener('click', () => {
      const query = document.getElementById('searchInput').value.trim();
      if (query) vscode.postMessage({ type: 'searchFilenames', query });
    });
    document.getElementById('searchTextBtn').addEventListener('click', () => {
      const query = document.getElementById('searchInput').value.trim();
      if (query) vscode.postMessage({ type: 'searchText', query });
    });
    document.getElementById('sendBtn').addEventListener('click', () => {
      const prompt = document.getElementById('taskInput').value.trim();
      if (prompt) vscode.postMessage({ type: 'submitTask', prompt });
    });
    document.getElementById('fixBugBtn').addEventListener('click', () => {
      const prompt = document.getElementById('taskInput').value.trim() || 'Diagnose active bugs and diagnostics in the workspace.';
      vscode.postMessage({ type: 'submitTask', prompt });
    });
    document.getElementById('explainBtn').addEventListener('click', () => {
      const customPrompt = document.getElementById('taskInput').value.trim();
      vscode.postMessage({ type: 'analyzeActiveFile', customPrompt });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'loading') {
        if (msg.active) showLoading(msg.label || 'Working...');
        else clearStatus();
      } else if (msg.type === 'workspaceSnapshot') {
        clearStatus();
        document.getElementById('wsName').textContent =
          'Workspace: ' + msg.toolchain.workspaceName + ' (' + msg.toolchain.primaryLanguage + ')';
        document.getElementById('wsMeta').textContent =
          msg.fileCount + ' safe files indexed · ' + msg.excludedCount + ' excluded · ' +
          msg.diagnostics.length + ' VS Code diagnostic(s)';
        treeContainer.innerHTML = renderNestedTree(msg.directoryTree || [], 0);
      } else if (msg.type === 'fileContent') {
        clearStatus();
        const f = msg.file;
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML =
          '<div class="row"><strong>File Inspector: ' + escapeHtml(f.path) + '</strong><span class="badge">' + escapeHtml(f.language) + ' · ' + f.sizeBytes + ' B</span></div>' +
          '<pre>' + escapeHtml(f.content) + '</pre>';
        out.prepend(card);
      } else if (msg.type === 'filenameSearchResults') {
        clearStatus();
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML =
          '<strong>Filename Matches for "' + escapeHtml(msg.query) + '" (' + msg.matches.length + '):</strong>' +
          '<pre>' + (msg.matches.length ? msg.matches.map(m => m.filePath + ' (' + m.language + ')').join('\\n') : 'No matching filenames found.') + '</pre>';
        out.prepend(card);
      } else if (msg.type === 'textSearchResults') {
        clearStatus();
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML =
          '<strong>Text Search Matches for "' + escapeHtml(msg.query) + '" (' + msg.matches.length + '):</strong>' +
          '<pre>' + (msg.matches.length ? msg.matches.map(m => m.filePath + ':' + m.lineNumber + '  ' + m.linePreview).join('\\n') : 'No matching text found.') + '</pre>';
        out.prepend(card);
      } else if (msg.type === 'agentResponse') {
        clearStatus();
        const res = msg.turnResult;
        document.getElementById('privacyBanner').textContent = res.privacyManifest.disclosureText;
        const card = document.createElement('div');
        card.className = 'card';
        const editsHtml = (res.proposedEdits || []).map(e =>
          '<div style="margin-top:6px;"><strong>Proposed Read-Only Patch Preview (' + escapeHtml(e.filePath) + '):</strong>' +
          '<div style="color:#94a3b8;font-size:11px;">' + escapeHtml(e.explanation) + '</div>' +
          '<pre>' + escapeHtml(e.proposedContent) + '</pre></div>'
        ).join('');
        card.innerHTML =
          '<strong>AI Analysis &amp; Diagnosis (' + escapeHtml(res.rootCauseType) + '):</strong>' +
          '<p style="margin:4px 0;">' + escapeHtml(res.summary) + '</p>' +
          '<pre>' + escapeHtml(res.rootCause) + '</pre>' +
          '<div style="font-family:monospace;font-size:11px;margin-top:6px;color:#38bdf8;">Context files inspected: ' +
          escapeHtml((res.inspectedFiles || []).join(', ')) + '</div>' +
          editsHtml;
        out.prepend(card);
      } else if (msg.type === 'error') {
        showError(msg.code, msg.message);
      }
    });
  </script>
</body>
</html>`;
  }
}
